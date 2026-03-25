import type { PoolClient } from 'pg';
import { z } from 'zod';

const HINT_KEYWORDS = ['não sei', 'nao sei', 'help', 'ajuda', 'me ajuda', 'não entendo', 'nao entendo'];

const HINT_LEVELS = {
  1: 'Guide: Ask a leading question that points the student toward the concept. Do NOT reveal the answer.',
  2: 'Hint: Provide a small clue or analogy. Still do NOT give the answer directly.',
  3: 'Example: Give a similar worked example, then ask the student to apply it to their problem.',
  4: 'Partial: Reveal part of the reasoning, leaving the final step for the student.',
  5: 'Complete: The student has struggled enough. Provide the full explanation with step-by-step reasoning.',
} as const;

type HintLevel = 1 | 2 | 3 | 4 | 5;

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatParams {
  message: string;
  studentId: string;
  tenantId: string;
  unitId?: string;
  conversationHistory: ConversationMessage[];
}

interface StudentProfile {
  id: string;
  name: string;
  engagement_level?: string;
  learning_style?: string;
}

class OrchSocrates {
  private getHintLevel(conversationHistory: ConversationMessage[]): HintLevel {
    let consecutive = 0;
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg.role !== 'user') continue;
      const lower = msg.content.toLowerCase();
      if (HINT_KEYWORDS.some((kw) => lower.includes(kw))) {
        consecutive++;
      } else {
        break;
      }
    }
    return Math.min(Math.max(consecutive + 1, 1), 5) as HintLevel;
  }

  private buildSocratesPrompt(
    profile: StudentProfile | null,
    hintLevel: HintLevel,
    ragContext: string | null,
  ): string {
    const studentInfo = profile
      ? `Student: ${profile.name}. Learning style: ${profile.learning_style ?? 'unknown'}. Engagement: ${profile.engagement_level ?? 'unknown'}.`
      : 'Student profile not available.';

    const contextBlock = ragContext
      ? `\n\nLesson context:\n${ragContext}`
      : '';

    return [
      'You are Sócrates, a Socratic tutor inside the ORCH learning platform.',
      'Language: Brazilian Portuguese.',
      '',
      'CORE RULES:',
      '- NEVER give the direct answer unless hint level is 5.',
      '- Guide the student through questions so they discover the answer themselves.',
      '- Use the EDF loop: Evaluate the student response, Diagnose any misconception, provide Feedback at the appropriate hint level.',
      '- Be encouraging and patient.',
      '- Keep responses concise (max 3 paragraphs).',
      '',
      `Current hint level: ${hintLevel}/5 — ${HINT_LEVELS[hintLevel]}`,
      '',
      studentInfo,
      contextBlock,
    ].join('\n');
  }

  async chat(client: PoolClient, params: ChatParams): Promise<{ reply: string; hintLevel: HintLevel }> {
    const { message, studentId, tenantId, unitId, conversationHistory } = params;

    const profileResult = await client.query<StudentProfile>(
      `SELECT id, name, engagement_level, learning_style
       FROM orch_student_profile
       WHERE student_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [studentId, tenantId],
    );
    const profile = profileResult.rows[0] ?? null;

    let ragContext: string | null = null;
    if (unitId) {
      const ragResult = await client.query<{ content: string }>(
        `SELECT content FROM orch_rag_chunk
         WHERE unit_id = $1 AND tenant_id = $2
         ORDER BY relevance_score DESC
         LIMIT 5`,
        [unitId, tenantId],
      );
      if (ragResult.rows.length > 0) {
        ragContext = ragResult.rows.map((r) => r.content).join('\n---\n');
      }
    }

    const hintLevel = this.getHintLevel(conversationHistory);
    const systemPrompt = this.buildSocratesPrompt(profile, hintLevel, ragContext);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];

    // orchLLMService.chat assumed available globally
    const { orchLLMService } = await import('../orch-llm.service');
    const reply = await orchLLMService.chat(client, {
      tenantId,
      messages,
      model: 'default',
      temperature: 0.7,
      maxTokens: 800,
    });

    await client.query(
      `INSERT INTO orch_interaction_log (student_id, tenant_id, agent, hint_level, message, response, created_at)
       VALUES ($1, $2, 'socrates', $3, $4, $5, NOW())`,
      [studentId, tenantId, hintLevel, message, reply],
    );

    return { reply, hintLevel };
  }
}

export const orchSocrates = new OrchSocrates();
