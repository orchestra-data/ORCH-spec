import type { PoolClient } from 'pg';

/**
 * Placeholder agents — minimal implementations that route to existing services.
 * These will be expanded in future epics.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentResponse {
  response: string;
}

interface AgentQueryParams {
  studentId: string;
  tenantId: string;
  message: string;
}

interface ZPDAssessment {
  id: string;
  student_id: string;
  concept_id: string;
  current_level: string;
  zone_lower: number;
  zone_upper: number;
  scaffolding_hint: string;
  assessed_at: Date;
}

interface AccessibilityPreference {
  id: string;
  student_id: string;
  tenant_id: string;
  needs: Record<string, boolean>;
  screen_reader: boolean;
  high_contrast: boolean;
  font_scale: number;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Janus — Enrollment wrapper
// ---------------------------------------------------------------------------

class OrchJanus {
  /**
   * Routes enrollment queries to Bloom with enrollment context.
   * Uses Orchestra API: GET /enrollment/status
   */
  async handleEnrollmentQuery(
    client: PoolClient,
    params: AgentQueryParams,
  ): Promise<AgentResponse> {
    const { rows } = await client.query<{
      status: string;
      enrolled_at: Date;
      class_name: string;
    }>(
      `SELECT ce.status, ce.created_at as enrolled_at, ci.name as class_name
      FROM class_enrollment ce
      JOIN class_instance ci ON ci.id = ce.class_instance_id
      WHERE ce.student_id = $1
      ORDER BY ce.created_at DESC
      LIMIT 5`,
      [params.studentId],
    );

    if (rows.length === 0) {
      return { response: 'Nenhuma matricula encontrada para este aluno.' };
    }

    const enrollments = rows
      .map((r) => `${r.class_name} (${r.status}, ${r.enrolled_at.toISOString().slice(0, 10)})`)
      .join('; ');

    return {
      response: `Matriculas ativas: ${enrollments}. Para mais detalhes, consulte a secretaria.`,
    };
  }
}

export const orchJanus = new OrchJanus();

// ---------------------------------------------------------------------------
// Keynes — Financial wrapper
// ---------------------------------------------------------------------------

class OrchKeynes {
  /**
   * Generic LLM response with financial context.
   * Uses Orchestra API: GET /financial/status
   */
  async handleFinancialQuery(
    client: PoolClient,
    params: AgentQueryParams,
  ): Promise<AgentResponse> {
    const { rows } = await client.query<{
      total_due: string;
      total_paid: string;
      overdue_count: string;
    }>(
      `SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) as total_due,
        COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) as total_paid,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
      FROM financial_transaction
      WHERE student_id = $1 AND tenant_id = $2`,
      [params.studentId, params.tenantId],
    );

    const summary = rows[0];
    const hasPending = parseFloat(summary.total_due) > 0;
    const hasOverdue = parseInt(summary.overdue_count, 10) > 0;

    let response = `Resumo financeiro: R$ ${summary.total_paid} pago.`;
    if (hasPending) {
      response += ` R$ ${summary.total_due} pendente.`;
    }
    if (hasOverdue) {
      response += ` ${summary.overdue_count} parcela(s) em atraso.`;
    }
    if (!hasPending && !hasOverdue) {
      response += ' Nenhuma pendencia financeira.';
    }

    return { response };
  }
}

export const orchKeynes = new OrchKeynes();

// ---------------------------------------------------------------------------
// Vygotsky — ZPD (Zone of Proximal Development) stub
// ---------------------------------------------------------------------------

class OrchVygotsky {
  /**
   * Assess and store a student's ZPD for a given concept.
   * Future: used by Socrates to calibrate hint levels.
   */
  async assessZPD(
    client: PoolClient,
    params: { studentId: string; conceptId: string },
  ): Promise<void> {
    await client.query(
      `INSERT INTO orch_zpd_assessment (student_id, concept_id, current_level, zone_lower, zone_upper, scaffolding_hint, assessed_at)
      VALUES ($1, $2, 'unknown', 0, 0, '', NOW())
      ON CONFLICT (student_id, concept_id)
      DO UPDATE SET assessed_at = NOW()`,
      [params.studentId, params.conceptId],
    );
  }

  /**
   * Retrieve ZPD assessment for a student + concept pair.
   */
  async getZPD(
    client: PoolClient,
    studentId: string,
    conceptId: string,
  ): Promise<ZPDAssessment | null> {
    const { rows } = await client.query<ZPDAssessment>(
      `SELECT id, student_id, concept_id, current_level, zone_lower, zone_upper, scaffolding_hint, assessed_at
      FROM orch_zpd_assessment
      WHERE student_id = $1 AND concept_id = $2`,
      [studentId, conceptId],
    );

    return rows[0] ?? null;
  }
}

export const orchVygotsky = new OrchVygotsky();

// ---------------------------------------------------------------------------
// Braille — Accessibility stub
// ---------------------------------------------------------------------------

class OrchBraille {
  /**
   * Retrieve accessibility preferences for a student.
   */
  async getPreferences(
    client: PoolClient,
    studentId: string,
    tenantId: string,
  ): Promise<AccessibilityPreference | null> {
    const { rows } = await client.query<AccessibilityPreference>(
      `SELECT id, student_id, tenant_id, needs, screen_reader, high_contrast, font_scale, updated_at
      FROM orch_accessibility_preference
      WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );

    return rows[0] ?? null;
  }

  /**
   * Create or update accessibility preferences.
   */
  async updatePreferences(
    client: PoolClient,
    params: { studentId: string; tenantId: string; needs: Record<string, boolean> },
  ): Promise<void> {
    await client.query(
      `INSERT INTO orch_accessibility_preference (student_id, tenant_id, needs, screen_reader, high_contrast, font_scale, updated_at)
      VALUES ($1, $2, $3, false, false, 1.0, NOW())
      ON CONFLICT (student_id, tenant_id)
      DO UPDATE SET needs = $3, updated_at = NOW()`,
      [params.studentId, params.tenantId, JSON.stringify(params.needs)],
    );
  }
}

export const orchBraille = new OrchBraille();
