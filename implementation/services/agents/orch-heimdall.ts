import type { PoolClient } from 'pg';

interface LeadData {
  name?: string;
  email?: string;
  phone?: string;
  interestArea?: string;
  educationLevel?: string;
  messagesCount: number;
  conversationText: string;
}

interface ChatPreEnrollmentParams {
  message: string;
  leadId?: string;
  name?: string;
  email?: string;
}

interface CheckInParams {
  studentId: string;
  tenantId: string;
}

interface OnboardingChecklist {
  profile_complete: boolean;
  first_login: boolean;
  watched_intro: boolean;
  explored_courses: boolean;
  first_ai_interaction: boolean;
  first_assignment: boolean;
  joined_chat: boolean;
  completed_recap: boolean;
  met_coordinator: boolean;
  feedback_given: boolean;
}

const URGENCY_KEYWORDS = [
  'preciso comecar', 'quando comeca', 'urgente', 'prazo',
  'matricula aberta', 'ultima chance', 'ja quero', 'agora',
  'nao posso esperar', 'rapido', 'imediato',
];

class OrchHeimdall {
  // ==================== PRE MODE (sem auth) ====================

  async chatPreEnrollment(
    client: PoolClient,
    params: ChatPreEnrollmentParams,
  ): Promise<{ reply: string; leadId: string; leadScore: number }> {
    const { message, leadId, name, email } = params;

    let currentLeadId = leadId;
    let lead: any;

    if (currentLeadId) {
      const result = await client.query(
        `SELECT * FROM orch_admission_lead WHERE id = $1`,
        [currentLeadId],
      );
      lead = result.rows[0];
    }

    if (!lead) {
      const result = await client.query(
        `INSERT INTO orch_admission_lead (name, email, messages_count, created_at, updated_at)
         VALUES ($1, $2, 1, NOW(), NOW())
         RETURNING *`,
        [name ?? null, email ?? null],
      );
      lead = result.rows[0];
      currentLeadId = lead.id;
    } else {
      await client.query(
        `UPDATE orch_admission_lead
         SET messages_count = messages_count + 1,
             name = COALESCE($2, name),
             email = COALESCE($3, email),
             updated_at = NOW()
         WHERE id = $1`,
        [currentLeadId, name, email],
      );
      lead.messages_count += 1;
      if (name) lead.name = name;
      if (email) lead.email = email;
    }

    const { orchLLMService } = await import('../orch-llm.service');
    const reply = await orchLLMService.chat(client, {
      tenantId: lead.tenant_id ?? '00000000-0000-4000-8000-000000000001',
      messages: [
        {
          role: 'system',
          content: [
            'You are Heimdall, a friendly admission consultant for the ORCH educational platform.',
            'Language: Brazilian Portuguese.',
            '',
            'YOUR ROLE:',
            '- Answer questions about courses, enrollment process, pricing, and schedules.',
            '- Be warm, helpful, and encouraging.',
            '- Gently collect the lead\'s name, email, area of interest, and education level through natural conversation.',
            '- Never pressure the lead. Be consultative, not salesy.',
            '- If you don\'t know specific details, say you\'ll connect them with a coordinator.',
            '',
            `Lead info so far: name=${lead.name ?? 'unknown'}, email=${lead.email ?? 'unknown'}, interest=${lead.interest_area ?? 'unknown'}`,
          ].join('\n'),
        },
        { role: 'user', content: message },
      ],
      model: 'default',
      temperature: 0.7,
      maxTokens: 600,
    });

    const score = this.scoreLead({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      interestArea: lead.interest_area,
      educationLevel: lead.education_level,
      messagesCount: lead.messages_count,
      conversationText: message,
    });

    await client.query(
      `UPDATE orch_admission_lead
       SET lead_score = $2, score_engagement = $3, score_fit = $4,
           score_urgency = $5, score_completeness = $6, updated_at = NOW()
       WHERE id = $1`,
      [currentLeadId, score.total, score.engagement, score.fit, score.urgency, score.completeness],
    );

    return {
      reply,
      leadId: currentLeadId!,
      leadScore: score.total,
    };
  }

  scoreLead(data: LeadData): {
    total: number;
    engagement: number;
    fit: number;
    urgency: number;
    completeness: number;
  } {
    // Engagement (30%): based on message count — max at 10 messages
    const engagement = Math.min(data.messagesCount / 10, 1) * 30;

    // Fit (25%): has interest area defined = high fit signal
    const fit = data.interestArea ? 25 : 5;

    // Urgency (25%): keyword detection in conversation
    const lowerText = data.conversationText.toLowerCase();
    const urgencyHits = URGENCY_KEYWORDS.filter((kw) => lowerText.includes(kw)).length;
    const urgency = Math.min(urgencyHits / 3, 1) * 25;

    // Completeness (20%): how many fields are filled
    const fields = [data.name, data.email, data.phone, data.interestArea, data.educationLevel];
    const filled = fields.filter(Boolean).length;
    const completeness = (filled / fields.length) * 20;

    const total = Math.round((engagement + fit + urgency + completeness) * 100) / 100;

    return { total, engagement, fit, urgency, completeness };
  }

  // ==================== POST MODE (com auth) ====================

  async getOnboardingStatus(
    client: PoolClient,
    studentId: string,
    tenantId: string,
  ): Promise<{
    checklist: OnboardingChecklist;
    completedCount: number;
    totalItems: number;
    percentage: number;
    startedAt: string;
    completedAt: string | null;
  }> {
    let result = await client.query(
      `SELECT * FROM orch_onboarding_progress WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );

    if (result.rows.length === 0) {
      result = await client.query(
        `INSERT INTO orch_onboarding_progress (tenant_id, student_id)
         VALUES ($1, $2)
         RETURNING *`,
        [tenantId, studentId],
      );
    }

    const row = result.rows[0];
    const checklist = row.checklist as OnboardingChecklist;
    const completedCount = Object.values(checklist).filter(Boolean).length;

    return {
      checklist,
      completedCount,
      totalItems: row.total_items,
      percentage: Math.round((completedCount / row.total_items) * 100),
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  async checkIn(
    client: PoolClient,
    params: CheckInParams,
  ): Promise<{ updated: string[]; completedCount: number }> {
    const { studentId, tenantId } = params;

    const result = await client.query(
      `SELECT * FROM orch_onboarding_progress WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );

    if (result.rows.length === 0) {
      return { updated: [], completedCount: 0 };
    }

    const row = result.rows[0];
    const checklist = { ...row.checklist } as OnboardingChecklist;
    const updated: string[] = [];

    // Auto-detect: first_login is always true if they're doing a checkin
    if (!checklist.first_login) {
      checklist.first_login = true;
      updated.push('first_login');
    }

    // Auto-detect: profile_complete — check if user has filled profile fields
    if (!checklist.profile_complete) {
      const profile = await client.query(
        `SELECT name, email FROM "user" WHERE id = $1`,
        [studentId],
      );
      if (profile.rows[0]?.name && profile.rows[0]?.email) {
        checklist.profile_complete = true;
        updated.push('profile_complete');
      }
    }

    // Auto-detect: first_ai_interaction — check interaction log
    if (!checklist.first_ai_interaction) {
      const interactions = await client.query(
        `SELECT 1 FROM orch_interaction_log WHERE student_id = $1 LIMIT 1`,
        [studentId],
      );
      if (interactions.rows.length > 0) {
        checklist.first_ai_interaction = true;
        updated.push('first_ai_interaction');
      }
    }

    const completedCount = Object.values(checklist).filter(Boolean).length;
    const completedAt = completedCount >= 10 ? 'NOW()' : null;

    await client.query(
      `UPDATE orch_onboarding_progress
       SET checklist = $1, completed_count = $2, last_checkin = NOW(),
           next_checkin = NOW() + INTERVAL '3 days',
           completed_at = ${completedAt ? 'NOW()' : 'completed_at'}
       WHERE student_id = $3 AND tenant_id = $4`,
      [JSON.stringify(checklist), completedCount, studentId, tenantId],
    );

    return { updated, completedCount };
  }

  async getClassOnboarding(
    client: PoolClient,
    classInstanceId: string,
  ): Promise<{
    students: Array<{
      studentId: string;
      studentName: string;
      completedCount: number;
      percentage: number;
      lastCheckin: string | null;
    }>;
    classAverage: number;
  }> {
    // Get students in class via enrollment, join with onboarding
    const result = await client.query(
      `SELECT
         u.id as student_id,
         u.name as student_name,
         COALESCE(o.completed_count, 0) as completed_count,
         COALESCE(o.total_items, 10) as total_items,
         o.last_checkin
       FROM enrollment e
       JOIN "user" u ON u.id = e.student_id
       LEFT JOIN orch_onboarding_progress o ON o.student_id = e.student_id
       WHERE e.class_instance_id = $1
       ORDER BY COALESCE(o.completed_count, 0) ASC`,
      [classInstanceId],
    );

    const students = result.rows.map((r) => ({
      studentId: r.student_id,
      studentName: r.student_name,
      completedCount: r.completed_count,
      percentage: Math.round((r.completed_count / r.total_items) * 100),
      lastCheckin: r.last_checkin,
    }));

    const classAverage =
      students.length > 0
        ? Math.round(students.reduce((sum, s) => sum + s.percentage, 0) / students.length)
        : 0;

    return { students, classAverage };
  }
}

export const orchHeimdall = new OrchHeimdall();
