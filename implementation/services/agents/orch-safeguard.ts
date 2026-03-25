import type { PoolClient } from 'pg';

type FlagType = 'emotional_distress' | 'self_harm_risk' | 'bullying' | 'crisis_language';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface ScanParams {
  studentId: string;
  tenantId: string;
  message: string;
  context?: {
    agent?: string;
    conversationId?: string;
  };
}

interface ScanResult {
  flagged: boolean;
  severity?: Severity;
  flagType?: FlagType;
}

interface ResolveParams {
  flagId: string;
  resolvedBy: string;
  notes?: string;
}

// Keywords that increase sensitivity — ordered by severity signal
const SENSITIVITY_KEYWORDS: Array<{ keyword: string; weight: number }> = [
  { keyword: 'me machucar', weight: 5 },
  { keyword: 'acabar com tudo', weight: 5 },
  { keyword: 'sem sentido', weight: 4 },
  { keyword: 'sumir', weight: 4 },
  { keyword: 'desistir', weight: 3 },
  { keyword: 'nao aguento', weight: 3 },
  { keyword: 'não aguento', weight: 3 },
  { keyword: 'nao consigo mais', weight: 3 },
  { keyword: 'não consigo mais', weight: 3 },
  { keyword: 'sozinho', weight: 2 },
  { keyword: 'sozinha', weight: 2 },
  { keyword: 'ninguem', weight: 2 },
  { keyword: 'ninguém', weight: 2 },
  { keyword: 'nao importa', weight: 2 },
  { keyword: 'não importa', weight: 2 },
  { keyword: 'tanto faz', weight: 2 },
  { keyword: 'cansei', weight: 2 },
  { keyword: 'desisto', weight: 2 },
];

class OrchSafeguard {
  /**
   * Scan a student message for safety concerns.
   * Runs in BACKGROUND via setImmediate. NEVER blocks the conversation.
   * NEVER confronts the student. Escalation is SILENT.
   */
  async scan(client: PoolClient, params: ScanParams): Promise<ScanResult> {
    const { studentId, tenantId, message, context } = params;
    const lowerMessage = message.toLowerCase();

    // 1. Quick keyword pre-filter — skip LLM call for clearly safe messages
    const keywordScore = SENSITIVITY_KEYWORDS.reduce((sum, kw) => {
      return lowerMessage.includes(kw.keyword) ? sum + kw.weight : sum;
    }, 0);

    if (keywordScore === 0 && message.length < 200) {
      // Short message with zero keyword hits — almost certainly safe
      return { flagged: false };
    }

    // 2. LLM classification
    const { orchLLMService } = await import('../orch-llm.service');
    const classification = await orchLLMService.chat(client, {
      tenantId,
      messages: [
        {
          role: 'system',
          content: [
            'You are SafeGuard, a silent safety classifier for student messages in an educational platform.',
            '',
            'CLASSIFY the message into one of these categories:',
            '- emotional_distress: expressions of sadness, anxiety, hopelessness, loneliness',
            '- self_harm_risk: any mention of self-harm, suicidal ideation, wanting to "end it"',
            '- bullying: reports of bullying, harassment, threats from peers',
            '- crisis_language: acute crisis expressions, panic, extreme distress',
            '- safe: no safety concern detected',
            '',
            'SEVERITY:',
            '- low: vague or mild expression, could be normal frustration',
            '- medium: concerning but not immediate risk',
            '- high: clear distress signal, needs coordinator attention',
            '- critical: immediate risk, urgent escalation required',
            '',
            'OUTPUT FORMAT (strict JSON, nothing else):',
            '{ "category": "safe|emotional_distress|self_harm_risk|bullying|crisis_language", "severity": "low|medium|high|critical", "reasoning": "1 sentence" }',
            '',
            'IMPORTANT:',
            '- Be sensitive but not over-reactive. Normal academic frustration is NOT a flag.',
            '- "Não entendo essa matéria" = safe. "Não aguento mais nada" = emotional_distress.',
            '- When in doubt between low and medium, choose low.',
            `- Keyword pre-score for this message: ${keywordScore} (higher = more keywords matched)`,
          ].join('\n'),
        },
        { role: 'user', content: message },
      ],
      model: 'default',
      temperature: 0.1, // Low temperature for consistent classification
      maxTokens: 200,
    });

    // 3. Parse classification
    let category: string;
    let severity: Severity;
    try {
      const jsonMatch = classification.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? classification);
      category = parsed.category;
      severity = parsed.severity;
    } catch {
      // If LLM response is unparseable, fall back to keyword-only assessment
      if (keywordScore >= 5) {
        category = 'emotional_distress';
        severity = 'medium';
      } else {
        return { flagged: false };
      }
    }

    // 4. If safe, return immediately
    if (category === 'safe') {
      return { flagged: false };
    }

    const flagType = category as FlagType;

    // 5. Create safety flag
    const triggerText = message.length > 200 ? message.substring(0, 197) + '...' : message;

    await client.query(
      `INSERT INTO orch_safety_flag
         (tenant_id, student_id, flag_type, severity, trigger_text, trigger_context)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, studentId, flagType, severity, triggerText, JSON.stringify(context ?? {})],
    );

    // 6. If severity >= high, escalate silently
    if (severity === 'high' || severity === 'critical') {
      await this.escalate(client, {
        tenantId,
        studentId,
        flagType,
        severity,
        triggerText,
      });
    }

    return { flagged: true, severity, flagType };
  }

  private async escalate(
    client: PoolClient,
    params: {
      tenantId: string;
      studentId: string;
      flagType: FlagType;
      severity: Severity;
      triggerText: string;
    },
  ): Promise<void> {
    const { tenantId, studentId, flagType, severity, triggerText } = params;

    // Find coordinator for this tenant
    const coordinator = await client.query(
      `SELECT id FROM "user"
       WHERE tenant_id = $1
         AND role IN ('coordinator', 'admin')
       LIMIT 1`,
      [tenantId],
    );

    if (coordinator.rows.length === 0) return;

    const coordinatorId = coordinator.rows[0].id;

    // Get student name
    const student = await client.query(
      `SELECT name FROM "user" WHERE id = $1`,
      [studentId],
    );
    const studentName = student.rows[0]?.name ?? 'Aluno';

    // Create admin alert (uses orch_admin_alert if available from EPIC-04)
    try {
      await client.query(
        `INSERT INTO orch_admin_alert
           (tenant_id, category, severity, title, message, action_url, created_at)
         VALUES ($1, 'student', $2, $3, $4, $5, NOW())`,
        [
          tenantId,
          severity,
          `[SafeGuard] ${severity.toUpperCase()}: ${flagType.replace('_', ' ')}`,
          `Aluno ${studentName} disparou alerta de ${flagType.replace('_', ' ')}. Trecho: "${triggerText}"`,
          `/admin/safety-flags?student=${studentId}`,
        ],
      );
    } catch {
      // orch_admin_alert may not exist if EPIC-04 hasn't run — log instead
      console.warn(`[SafeGuard] ESCALATION: ${severity} ${flagType} for student ${studentId} — alert table not available`);
    }

    // Update the flag with escalation info
    await client.query(
      `UPDATE orch_safety_flag
       SET escalated_to = $1, escalated_at = NOW()
       WHERE student_id = $2 AND tenant_id = $3 AND resolved = false
       ORDER BY created_at DESC LIMIT 1`,
      [coordinatorId, studentId, tenantId],
    );
  }

  async getFlags(
    client: PoolClient,
    params: { tenantId: string; unresolved?: boolean },
  ): Promise<{
    flags: any[];
    total: number;
    unresolvedCount: number;
  }> {
    const { tenantId, unresolved } = params;

    let query = `
      SELECT f.*, u.name as student_name
      FROM orch_safety_flag f
      JOIN "user" u ON u.id = f.student_id
      WHERE f.tenant_id = $1`;
    const queryParams: any[] = [tenantId];

    if (unresolved) {
      query += ' AND f.resolved = false';
    }

    query += ' ORDER BY f.created_at DESC';

    const result = await client.query(query, queryParams);

    const unresolvedCount = unresolved
      ? result.rows.length
      : result.rows.filter((r) => !r.resolved).length;

    return {
      flags: result.rows,
      total: result.rows.length,
      unresolvedCount,
    };
  }

  async resolve(
    client: PoolClient,
    params: ResolveParams,
  ): Promise<{ resolved: boolean }> {
    const { flagId, resolvedBy, notes } = params;

    const result = await client.query(
      `UPDATE orch_safety_flag
       SET resolved = true, resolved_by = $1, resolved_at = NOW(), resolution_notes = $2
       WHERE id = $3 AND resolved = false
       RETURNING id`,
      [resolvedBy, notes ?? null, flagId],
    );

    return { resolved: result.rows.length > 0 };
  }
}

export const orchSafeguard = new OrchSafeguard();
