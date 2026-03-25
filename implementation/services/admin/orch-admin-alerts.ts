import type { PoolClient } from 'pg';
import { z } from 'zod';

type AlertCategory = 'student' | 'class' | 'admission' | 'system';
type AlertSeverity = 'info' | 'warning' | 'critical';

const GetAlertsParams = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  category: z.enum(['student', 'class', 'admission', 'system']).optional(),
  unreadOnly: z.boolean().default(false),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().min(0).default(0),
});
type GetAlertsParams = z.infer<typeof GetAlertsParams>;

interface Alert {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  description: string;
  actionUrl: string | null;
  createdAt: string;
  isRead: boolean;
}

interface GenerateResult {
  created: number;
  byCategory: Record<string, number>;
}

class OrchAdminAlerts {
  /**
   * Generate proactive alerts by querying student risk, class performance,
   * admission backlogs, and system quotas.
   */
  async generateAlerts(client: PoolClient, tenantId: string): Promise<GenerateResult> {
    let created = 0;
    const byCategory: Record<string, number> = {};

    // Student alerts: risk >= yellow (from Foucault risk engine)
    const { rows: studentRisks } = await client.query(
      `SELECT s.id, s.full_name, r.risk_level
       FROM student s
       JOIN orch_risk_assessment r ON r.student_id = s.id
       WHERE s.tenant_id = $1 AND r.risk_level IN ('yellow', 'red')
         AND r.id NOT IN (SELECT source_id FROM orch_admin_alert WHERE category = 'student' AND tenant_id = $1)`,
      [tenantId]
    );
    for (const r of studentRisks) {
      await this.insertAlert(client, {
        tenantId,
        category: 'student',
        severity: r.risk_level === 'red' ? 'critical' : 'warning',
        title: `Aluno em risco: ${r.full_name}`,
        description: `Nivel de risco: ${r.risk_level}. Verificar engajamento e desempenho.`,
        actionUrl: `/students/${r.id}`,
        sourceId: r.id,
      });
      created++;
    }
    byCategory.student = studentRisks.length;

    // Class alerts: average grade below threshold
    const { rows: classAlerts } = await client.query(
      `SELECT c.id, c.name, AVG(g.grade)::numeric(4,2) AS avg_grade
       FROM class c
       JOIN grade g ON g.class_id = c.id
       WHERE c.tenant_id = $1
       GROUP BY c.id, c.name
       HAVING AVG(g.grade) < 6.0`,
      [tenantId]
    );
    for (const c of classAlerts) {
      await this.insertAlert(client, {
        tenantId,
        category: 'class',
        severity: Number(c.avg_grade) < 4.0 ? 'critical' : 'warning',
        title: `Turma com media baixa: ${c.name}`,
        description: `Media: ${c.avg_grade}. Considere intervencao pedagogica.`,
        actionUrl: `/classes/${c.id}`,
        sourceId: c.id,
      });
      created++;
    }
    byCategory.class = classAlerts.length;

    // Admission alerts: pending enrollments > 48h
    const { rows: admissionAlerts } = await client.query(
      `SELECT id, student_name
       FROM enrollment_request
       WHERE tenant_id = $1 AND status = 'pending'
         AND created_at < NOW() - INTERVAL '48 hours'`,
      [tenantId]
    );
    for (const a of admissionAlerts) {
      await this.insertAlert(client, {
        tenantId,
        category: 'admission',
        severity: 'warning',
        title: `Matricula pendente: ${a.student_name}`,
        description: `Solicitacao pendente ha mais de 48h.`,
        actionUrl: `/admissions/${a.id}`,
        sourceId: a.id,
      });
      created++;
    }
    byCategory.admission = admissionAlerts.length;

    // System alerts: AI quota > 80%
    const { rows: quotaRows } = await client.query(
      `SELECT usage_pct FROM orch_ai_quota WHERE tenant_id = $1`,
      [tenantId]
    );
    if (quotaRows.length > 0 && quotaRows[0].usage_pct > 80) {
      await this.insertAlert(client, {
        tenantId,
        category: 'system',
        severity: quotaRows[0].usage_pct > 95 ? 'critical' : 'warning',
        title: `Cota de IA em ${quotaRows[0].usage_pct}%`,
        description: `O consumo de tokens de IA esta alto. Considere otimizar ou ampliar cota.`,
        actionUrl: `/settings/ai-quota`,
        sourceId: null,
      });
      created++;
      byCategory.system = 1;
    } else {
      byCategory.system = 0;
    }

    return { created, byCategory };
  }

  /**
   * Get alerts for a user with optional category filter and read/unread state.
   */
  async getAlerts(client: PoolClient, params: GetAlertsParams): Promise<{ alerts: Alert[]; total: number }> {
    const validated = GetAlertsParams.parse(params);

    let whereClause = `a.tenant_id = $1`;
    const queryParams: unknown[] = [validated.tenantId];
    let paramIdx = 2;

    if (validated.category) {
      whereClause += ` AND a.category = $${paramIdx}`;
      queryParams.push(validated.category);
      paramIdx++;
    }

    if (validated.unreadOnly) {
      whereClause += ` AND NOT ($${paramIdx} = ANY(a.read_by))`;
      queryParams.push(validated.userId);
      paramIdx++;
    }

    const countQuery = `SELECT COUNT(*)::int AS total FROM orch_admin_alert a WHERE ${whereClause}`;
    const { rows: countRows } = await client.query(countQuery, queryParams);

    const dataQuery = `
      SELECT a.id, a.category, a.severity, a.title, a.description, a.action_url, a.created_at,
             $${paramIdx} = ANY(a.read_by) AS is_read
      FROM orch_admin_alert a
      WHERE ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIdx + 1} OFFSET $${paramIdx + 2}`;

    queryParams.push(validated.userId, validated.limit, validated.offset);

    const { rows } = await client.query(dataQuery, queryParams);

    return {
      alerts: rows.map((r) => ({
        id: r.id,
        category: r.category,
        severity: r.severity,
        title: r.title,
        description: r.description,
        actionUrl: r.action_url,
        createdAt: r.created_at,
        isRead: r.is_read,
      })),
      total: countRows[0].total,
    };
  }

  /**
   * Mark an alert as read by adding userId to the read_by array.
   */
  async markRead(client: PoolClient, alertId: string, userId: string): Promise<void> {
    await client.query(
      `UPDATE orch_admin_alert
       SET read_by = array_append(read_by, $2), updated_at = NOW()
       WHERE id = $1 AND NOT ($2 = ANY(read_by))`,
      [alertId, userId]
    );
  }

  /**
   * Dismiss an alert by adding userId to the dismissed_by array.
   */
  async dismiss(client: PoolClient, alertId: string, userId: string): Promise<void> {
    await client.query(
      `UPDATE orch_admin_alert
       SET dismissed_by = array_append(dismissed_by, $2), updated_at = NOW()
       WHERE id = $1 AND NOT ($2 = ANY(dismissed_by))`,
      [alertId, userId]
    );
  }

  /**
   * Escalate an alert to another user (e.g., coordinator or admin).
   */
  async escalate(client: PoolClient, alertId: string, toUserId: string): Promise<void> {
    await client.query(
      `UPDATE orch_admin_alert
       SET escalated_at = NOW(), escalated_to = $2, updated_at = NOW()
       WHERE id = $1`,
      [alertId, toUserId]
    );
  }

  /**
   * CRON job: find critical alerts unread for > 24h, escalate to superior.
   */
  async autoEscalate(client: PoolClient): Promise<{ escalated: number }> {
    const { rows } = await client.query(
      `SELECT a.id, a.tenant_id
       FROM orch_admin_alert a
       WHERE a.severity = 'critical'
         AND a.escalated_at IS NULL
         AND a.created_at < NOW() - INTERVAL '24 hours'
         AND array_length(a.read_by, 1) IS NULL`
    );

    let escalated = 0;
    for (const alert of rows) {
      // Find tenant admin/coordinator to escalate to
      const { rows: admins } = await client.query(
        `SELECT u.id FROM "user" u
         JOIN user_role ur ON ur.user_id = u.id
         JOIN role r ON r.id = ur.role_id
         WHERE u.tenant_id = $1 AND r.name IN ('admin', 'coordinator')
         LIMIT 1`,
        [alert.tenant_id]
      );
      if (admins.length > 0) {
        await this.escalate(client, alert.id, admins[0].id);
        escalated++;
      }
    }

    return { escalated };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async insertAlert(
    client: PoolClient,
    params: {
      tenantId: string;
      category: AlertCategory;
      severity: AlertSeverity;
      title: string;
      description: string;
      actionUrl: string;
      sourceId: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO orch_admin_alert (tenant_id, category, severity, title, description, action_url, source_id, read_by, dismissed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}', '{}')
       ON CONFLICT DO NOTHING`,
      [params.tenantId, params.category, params.severity, params.title, params.description, params.actionUrl, params.sourceId]
    );
  }
}

export const orchAdminAlerts = new OrchAdminAlerts();
