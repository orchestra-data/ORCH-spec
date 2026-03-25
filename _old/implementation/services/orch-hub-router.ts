import type { PoolClient } from 'pg';
import { z } from 'zod';
import { orchLLMService } from './orch-llm-service';
import { orchProfileService } from './orch-profile-service';

// ---------------------------------------------------------------------------
// Intent schema
// ---------------------------------------------------------------------------

const IntentSchema = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.string()).optional(),
});

type Intent = z.infer<typeof IntentSchema>;

// ---------------------------------------------------------------------------
// Agent mapping
// ---------------------------------------------------------------------------

const INTENT_AGENT_MAP: Record<string, string> = {
  ask_help: 'socrates',
  explain: 'socrates',
  doubt: 'socrates',
  review: 'ebbinghaus',
  remember: 'ebbinghaus',
  forgot: 'ebbinghaus',
  recap: 'comenius',
  daily: 'comenius',
  quiz: 'comenius',
  xp: 'sisifo',
  level: 'sisifo',
  badge: 'sisifo',
  streak: 'sisifo',
  leaderboard: 'sisifo',
  grade: 'bloom',
  nota: 'bloom',
  study_plan: 'bloom',
  simulate: 'bloom',
  report: 'weber',
  dossier: 'weber',
  summary: 'weber',
  greeting: '__greeting',
  feedback: '__feedback',
  navigate: '__navigate',
};

const KEYWORD_PATTERNS: Array<[RegExp, string]> = [
  (/ajuda|help|explica|dúvida|não entendi/i, 'socrates'),
  (/revis(ar|ão)|lembr(ar|o)|esqueci/i, 'ebbinghaus'),
  (/resumo diário|quiz|recapitul/i, 'comenius'),
  (/xp|nível|level|badge|streak|ranking/i, 'sisifo'),
  (/nota|conceito|plano de estudo|simul/i, 'bloom'),
  (/relatório|dossiê|report|resumo geral/i, 'weber'),
  (/oi|olá|hey|bom dia|boa tarde|boa noite/i, '__greeting'),
  (/feedback|sugest(ão|ões)|avaliar/i, '__feedback'),
  (/onde fica|como acess|naveg/i, '__navigate'),
];

// ---------------------------------------------------------------------------
// Circuit Breaker (internal)
// ---------------------------------------------------------------------------

type CircuitState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureAt = 0;

  private readonly FAILURE_THRESHOLD = 5;
  private readonly WINDOW_MS = 60_000;
  private readonly COOLDOWN_MS = 300_000;

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures += 1;
    this.lastFailureAt = Date.now();
    if (this.failures >= this.FAILURE_THRESHOLD) {
      this.state = 'open';
    }
  }

  canExecute(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureAt;
      if (elapsed >= this.COOLDOWN_MS) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }

    // half-open: allow one probe
    return true;
  }

  getState(): CircuitState {
    return this.state;
  }
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface InteractionLogRow {
  id: string;
  student_id: string;
  tenant_id: string;
  conversation_id: string;
  agent_name: string;
  intent: string;
  message_preview: string;
  page_url: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Route params
// ---------------------------------------------------------------------------

interface RouteMessageParams {
  message: string;
  studentId: string;
  tenantId: string;
  conversationId: string;
  pageUrl?: string;
  client: PoolClient;
}

interface RouteResult {
  agent: string;
  intent: string;
  confidence: number;
  greeting?: string;
  redirect?: string;
}

// ---------------------------------------------------------------------------
// OrchHubRouter
// ---------------------------------------------------------------------------

class OrchHubRouter {
  private readonly llmBreaker = new CircuitBreaker();

  async detectIntent(message: string, pageUrl?: string): Promise<Intent> {
    if (this.llmBreaker.canExecute()) {
      try {
        const result = await orchLLMService.classifyIntent(message, pageUrl);
        const parsed = IntentSchema.parse(result);
        this.llmBreaker.recordSuccess();
        return parsed;
      } catch {
        this.llmBreaker.recordFailure();
      }
    }

    // Fallback: keyword matching
    const fallbackIntent = this.keywordFallback(message);
    return { intent: fallbackIntent, confidence: 0.4 };
  }

  async routeMessage(params: RouteMessageParams): Promise<RouteResult> {
    const { message, studentId, tenantId, conversationId, pageUrl, client } = params;

    // 1. Detect intent
    const { intent, confidence } = await this.detectIntent(message, pageUrl);

    // 2. Resolve agent
    const agent = this.resolveAgent(intent);

    // 3. Handle special intents
    if (agent === '__greeting') {
      await this.logInteraction(client, {
        studentId,
        tenantId,
        conversationId,
        agentName: 'hub',
        intent,
        messagePreview: message.slice(0, 120),
        pageUrl,
      });
      return { agent: 'hub', intent, confidence, greeting: 'Olá! Como posso te ajudar hoje?' };
    }

    if (agent === '__feedback') {
      return { agent: 'hub', intent, confidence, redirect: 'orchSubmitFeedback' };
    }

    if (agent === '__navigate') {
      return { agent: 'hub', intent, confidence, redirect: 'linkSuggestion' };
    }

    // 4. Load or create student profile
    await orchProfileService.loadOrCreate(client, studentId, tenantId);

    // 5. Log interaction
    await this.logInteraction(client, {
      studentId,
      tenantId,
      conversationId,
      agentName: agent,
      intent,
      messagePreview: message.slice(0, 120),
      pageUrl,
    });

    return { agent, intent, confidence };
  }

  private resolveAgent(intent: string): string {
    return INTENT_AGENT_MAP[intent] ?? 'socrates';
  }

  private async logInteraction(
    client: PoolClient,
    params: {
      studentId: string;
      tenantId: string;
      conversationId: string;
      agentName: string;
      intent: string;
      messagePreview: string;
      pageUrl?: string;
    },
  ): Promise<void> {
    const SQL = `
      INSERT INTO orch_interaction_log
        (student_id, tenant_id, conversation_id, agent_name, intent, message_preview, page_url)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7)
    `;

    await client.query<InteractionLogRow>(SQL, [
      params.studentId,
      params.tenantId,
      params.conversationId,
      params.agentName,
      params.intent,
      params.messagePreview,
      params.pageUrl ?? null,
    ]);
  }

  private keywordFallback(message: string): string {
    const lower = message.toLowerCase();
    for (const [pattern, intent] of KEYWORD_PATTERNS) {
      if (pattern.test(lower)) return intent;
    }
    return 'ask_help';
  }
}

export const orchHubRouter = new OrchHubRouter();
