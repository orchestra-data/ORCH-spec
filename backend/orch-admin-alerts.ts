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

class OrchAdminAlerts {
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
      alerts: rows.map((r: any) => ({
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

  async markRead(client: PoolClient, alertId: string, userId: string): Promise<void> {
    await client.query(
      `UPDATE orch_admin_alert
       SET read_by = array_append(read_by, $2::uuid), updated_at = NOW()
       WHERE id = $1 AND NOT ($2::uuid = ANY(read_by))`,
      [alertId, userId]
    );
  }

  async dismiss(client: PoolClient, alertId: string, userId: string): Promise<void> {
    await client.query(
      `UPDATE orch_admin_alert
       SET dismissed_by = array_append(dismissed_by, $2::uuid), updated_at = NOW()
       WHERE id = $1 AND NOT ($2::uuid = ANY(dismissed_by))`,
      [alertId, userId]
    );
  }

  async createAlert(
    client: PoolClient,
    params: {
      tenantId: string;
      category: AlertCategory;
      severity: AlertSeverity;
      title: string;
      description: string;
      actionUrl?: string;
    }
  ): Promise<string> {
    const { rows } = await client.query(
      `INSERT INTO orch_admin_alert (tenant_id, category, severity, title, description, action_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [params.tenantId, params.category, params.severity, params.title, params.description, params.actionUrl ?? null]
    );
    return rows[0].id;
  }
}

export const orchAdminAlerts = new OrchAdminAlerts();
