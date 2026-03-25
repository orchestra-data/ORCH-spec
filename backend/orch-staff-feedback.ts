import type { PoolClient } from 'pg';
import { z } from 'zod';

const ActiveFeedbackParams = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  messageId: z.string().uuid(),
  rating: z.enum(['helpful', 'unhelpful']),
  comment: z.string().max(500).optional(),
});
type ActiveFeedbackParams = z.infer<typeof ActiveFeedbackParams>;

class OrchStaffFeedback {
  async submitActive(client: PoolClient, params: ActiveFeedbackParams): Promise<void> {
    const validated = ActiveFeedbackParams.parse(params);

    await client.query(
      `INSERT INTO orch_staff_feedback_active
         (user_id, tenant_id, message_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, message_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         comment = EXCLUDED.comment,
         updated_at = NOW()`,
      [validated.userId, validated.tenantId, validated.messageId, validated.rating, validated.comment ?? null]
    );
  }

  async getStats(client: PoolClient, tenantId: string): Promise<{
    totalActive: number;
    helpfulCount: number;
    unhelpfulCount: number;
    helpfulPct: number;
  }> {
    const { rows } = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE rating = 'helpful')::int AS helpful,
         COUNT(*) FILTER (WHERE rating = 'unhelpful')::int AS unhelpful
       FROM orch_staff_feedback_active
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const total = rows[0].total;
    const helpful = rows[0].helpful;

    return {
      totalActive: total,
      helpfulCount: helpful,
      unhelpfulCount: rows[0].unhelpful,
      helpfulPct: total > 0 ? Math.round((helpful / total) * 100) : 0,
    };
  }
}

export const orchStaffFeedback = new OrchStaffFeedback();
