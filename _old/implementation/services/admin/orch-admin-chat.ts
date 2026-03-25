import type { PoolClient } from 'pg';
import { z } from 'zod';

const ChatParams = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  message: z.string().min(1),
  routeContext: z.string(),
  sessionId: z.string().uuid().optional(),
});
type ChatParams = z.infer<typeof ChatParams>;

type AdminIntent =
  | 'explain'
  | 'workflow'
  | 'query'
  | 'navigate'
  | 'walkthrough'
  | 'form_fill';

interface DomFillAction {
  selector: string;
  value: string;
  action: 'fill' | 'select' | 'click';
}

interface ChatResponse {
  sessionId: string;
  message: string;
  sources: Array<{ sourceFile: string; similarity: number }>;
  suggestedWalkthrough?: { id: string; title: string };
  domFillAction?: DomFillAction[];
}

interface ConversationSummary {
  id: string;
  title: string;
  lastMessageAt: string;
  messageCount: number;
}

interface ConversationFull {
  id: string;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  }>;
}

const ADMIN_SYSTEM_PROMPT = `Voce e o Orch Admin, assistente inteligente da plataforma Cogedu.
Voce ajuda funcionarios a usar a plataforma: explica paginas, campos, fluxos.
Responda em portugues brasileiro, de forma clara e direta.
NUNCA invente dados. Se nao sabe, diga "Nao tenho essa informacao."
Se o usuario parece perdido (30s sem acao), sugira ajuda proativamente.
Se detectar intencao de walkthrough, ofereca o guia passo-a-passo.`;

class OrchAdminChat {
  /**
   * Main chat entry point. RAG-powered with intent detection.
   * Handles walkthrough suggestions, DOM fill instructions, and LLM fallback.
   */
  async chat(client: PoolClient, params: ChatParams): Promise<ChatResponse> {
    const validated = ChatParams.parse(params);

    // 1. Load or create conversation
    const sessionId = validated.sessionId ?? await this.createConversation(client, validated);

    // 2. Detect intent
    const intent = this.detectIntent(validated.message);

    // 3. If walkthrough intent, suggest instead of LLM call
    if (intent === 'walkthrough') {
      const suggestion = await this.findWalkthroughSuggestion(client, validated.message, validated.routeContext);
      if (suggestion) {
        await this.saveMessagePair(client, sessionId, validated.message, `Encontrei um guia para voce: "${suggestion.title}". Deseja iniciar?`);
        return {
          sessionId,
          message: `Encontrei um guia para voce: "${suggestion.title}". Deseja iniciar?`,
          sources: [],
          suggestedWalkthrough: suggestion,
        };
      }
    }

    // 4. If form_fill intent, return DOM instructions
    if (intent === 'form_fill') {
      const domActions = this.parseDomFillIntent(validated.message);
      if (domActions.length > 0) {
        const msg = `Entendi! Vou preencher os campos para voce.`;
        await this.saveMessagePair(client, sessionId, validated.message, msg);
        return { sessionId, message: msg, sources: [], domFillAction: domActions };
      }
    }

    // 5. Build RAG context
    const ragChunks = await this.searchKnowledge(client, validated.tenantId, validated.message, validated.routeContext);
    const history = await this.getRecentHistory(client, sessionId, 10);

    // 6. Call LLM
    const llmResponse = await this.callLLM(validated.message, ragChunks, history, validated.routeContext);

    // 7. Save message pair
    await this.saveMessagePair(client, sessionId, validated.message, llmResponse.content);

    // 8. Update conversation summary periodically
    const msgCount = await this.getMessageCount(client, sessionId);
    if (msgCount % 5 === 0) {
      await this.updateSummary(client, sessionId);
    }

    // 9. Learn FAQ if question repeated 3+ times
    await this.learnFAQIfRepeated(client, validated.tenantId, validated.message);

    return {
      sessionId,
      message: llmResponse.content,
      sources: ragChunks.map((c) => ({ sourceFile: c.sourceFile, similarity: c.similarity })),
    };
  }

  /**
   * List conversations for a user with pagination.
   */
  async listConversations(
    client: PoolClient,
    userId: string,
    tenantId: string,
    limit = 20,
    offset = 0
  ): Promise<ConversationSummary[]> {
    const { rows } = await client.query(
      `SELECT id, title,
              (SELECT MAX(created_at) FROM orch_admin_message WHERE conversation_id = c.id) AS last_message_at,
              (SELECT COUNT(*)::int FROM orch_admin_message WHERE conversation_id = c.id) AS message_count
       FROM orch_admin_conversation c
       WHERE c.user_id = $1 AND c.tenant_id = $2 AND c.status != 'archived'
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT $3 OFFSET $4`,
      [userId, tenantId, limit, offset]
    );

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      lastMessageAt: r.last_message_at,
      messageCount: r.message_count,
    }));
  }

  /**
   * Get full conversation with all messages.
   */
  async getConversation(client: PoolClient, conversationId: string, userId: string): Promise<ConversationFull | null> {
    const { rows: convRows } = await client.query(
      `SELECT id, title FROM orch_admin_conversation WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (convRows.length === 0) return null;

    const { rows: msgRows } = await client.query(
      `SELECT role, content, created_at
       FROM orch_admin_message
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return {
      id: convRows[0].id,
      title: convRows[0].title,
      messages: msgRows.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
    };
  }

  /**
   * Archive conversations with no activity in 30 days.
   */
  async archiveOld(client: PoolClient): Promise<{ archived: number }> {
    const { rowCount } = await client.query(
      `UPDATE orch_admin_conversation
       SET status = 'archived', updated_at = NOW()
       WHERE status = 'active'
         AND id NOT IN (
           SELECT DISTINCT conversation_id FROM orch_admin_message
           WHERE created_at > NOW() - INTERVAL '30 days'
         )`
    );
    return { archived: rowCount ?? 0 };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async createConversation(client: PoolClient, params: { userId: string; tenantId: string; message: string }): Promise<string> {
    const title = params.message.slice(0, 80);
    const { rows } = await client.query(
      `INSERT INTO orch_admin_conversation (user_id, tenant_id, title, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [params.userId, params.tenantId, title]
    );
    return rows[0].id;
  }

  private detectIntent(message: string): AdminIntent {
    const lower = message.toLowerCase();
    if (/passo.a.passo|tutorial|guia|como fa[zç]o|walkthrough/i.test(lower)) return 'walkthrough';
    if (/preenche|preencher|coloca.*campo|fill/i.test(lower)) return 'form_fill';
    if (/o que [eé]|explica|para que serve|significado/i.test(lower)) return 'explain';
    if (/como.*funciona|fluxo|processo|workflow/i.test(lower)) return 'workflow';
    if (/ir para|abrir|navegar|link|onde fica/i.test(lower)) return 'navigate';
    return 'query';
  }

  private async findWalkthroughSuggestion(
    client: PoolClient,
    message: string,
    route: string
  ): Promise<{ id: string; title: string } | null> {
    const { rows } = await client.query(
      `SELECT id, title FROM orch_admin_walkthrough
       WHERE $1 = ANY(trigger_intent) OR route = $2
       LIMIT 1`,
      [message.toLowerCase(), route]
    );
    return rows.length > 0 ? { id: rows[0].id, title: rows[0].title } : null;
  }

  private parseDomFillIntent(_message: string): DomFillAction[] {
    // TODO: parse natural language into DOM actions via LLM tool call
    return [];
  }

  private async searchKnowledge(
    client: PoolClient,
    tenantId: string,
    query: string,
    routeContext: string
  ): Promise<Array<{ chunkText: string; sourceFile: string; similarity: number }>> {
    // Delegate to orchAdminKnowledge.search
    // Imported dynamically to avoid circular deps
    const { orchAdminKnowledge } = await import('./orch-admin-knowledge');
    return orchAdminKnowledge.search(client, { tenantId, query, routeContext, limit: 5 });
  }

  private async getRecentHistory(client: PoolClient, sessionId: string, limit: number): Promise<Array<{ role: string; content: string }>> {
    const { rows } = await client.query(
      `SELECT role, content FROM orch_admin_message
       WHERE conversation_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [sessionId, limit]
    );
    return rows.reverse();
  }

  private async callLLM(
    message: string,
    ragChunks: Array<{ chunkText: string; sourceFile: string; similarity: number }>,
    history: Array<{ role: string; content: string }>,
    routeContext: string
  ): Promise<{ content: string }> {
    const contextBlock = ragChunks.map((c) => c.chunkText).join('\n---\n');
    const historyBlock = history.map((h) => `${h.role}: ${h.content}`).join('\n');

    const _prompt = [
      ADMIN_SYSTEM_PROMPT,
      `\nRota atual: ${routeContext}`,
      contextBlock ? `\nContexto da base de conhecimento:\n${contextBlock}` : '',
      historyBlock ? `\nHistorico recente:\n${historyBlock}` : '',
      `\nUsuario: ${message}`,
    ].join('\n');

    // TODO: wire to orchLLMService.chat(prompt, { stream: true })
    throw new Error('callLLM: not yet wired to orchLLMService');
  }

  private async saveMessagePair(client: PoolClient, sessionId: string, userMsg: string, assistantMsg: string): Promise<void> {
    await client.query(
      `INSERT INTO orch_admin_message (conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
      [sessionId, userMsg, assistantMsg]
    );
  }

  private async getMessageCount(client: PoolClient, sessionId: string): Promise<number> {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM orch_admin_message WHERE conversation_id = $1`,
      [sessionId]
    );
    return rows[0].count;
  }

  private async updateSummary(client: PoolClient, sessionId: string): Promise<void> {
    // TODO: call LLM to summarize conversation, update orch_admin_conversation.summary
    await client.query(
      `UPDATE orch_admin_conversation SET updated_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  }

  private async learnFAQIfRepeated(client: PoolClient, tenantId: string, message: string): Promise<void> {
    const normalized = message.toLowerCase().trim();
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM orch_admin_message
       WHERE role = 'user' AND LOWER(content) = $1
         AND conversation_id IN (SELECT id FROM orch_admin_conversation WHERE tenant_id = $2)`,
      [normalized, tenantId]
    );
    if (rows[0].count >= 3) {
      await client.query(
        `INSERT INTO orch_admin_faq (tenant_id, question, frequency)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, question) DO UPDATE SET frequency = $3, updated_at = NOW()`,
        [tenantId, normalized, rows[0].count]
      );
    }
  }
}

export const orchAdminChat = new OrchAdminChat();
