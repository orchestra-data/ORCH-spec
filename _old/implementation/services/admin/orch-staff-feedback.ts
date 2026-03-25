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

const PassiveMetadata = z.object({
  route: z.string(),
  timeOnPageMs: z.number().int().min(0),
  clicks: z.number().int().min(0),
  scrollDepthPct: z.number().min(0).max(100),
  walkthroughId: z.string().optional(),
  sessionId: z.string().optional(),
});

const PassiveFeedbackParams = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  metadata: PassiveMetadata,
});
type PassiveFeedbackParams = z.infer<typeof PassiveFeedbackParams>;

interface FeedbackStats {
  totalActive: number;
  helpfulCount: number;
  unhelpfulCount: number;
  helpfulPct: number;
  unhelpfulPct: number;
  topIssues: Array<{ comment: string; count: number }>;
  avgTimeOnPageMs: number;
  avgScrollDepthPct: number;
}

class OrchStaffFeedback {
  /**
   * Submit active (explicit) feedback on an assistant message.
   */
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

  /**
   * Track passive (implicit) feedback: time on page, clicks, scroll depth.
   */
  async trackPassive(client: PoolClient, params: PassiveFeedbackParams): Promise<void> {
    const validated = PassiveFeedbackParams.parse(params);

    await client.query(
      `INSERT INTO orch_staff_feedback_passive
         (user_id, tenant_id, route, time_on_page_ms, clicks, scroll_depth_pct, walkthrough_id, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        validated.userId,
        validated.tenantId,
        validated.metadata.route,
        validated.metadata.timeOnPageMs,
        validated.metadata.clicks,
        validated.metadata.scrollDepthPct,
        validated.metadata.walkthroughId ?? null,
        validated.metadata.sessionId ?? null,
      ]
    );
  }

  /**
   * Get aggregated feedback stats for a tenant.
   */
  async getStats(client: PoolClient, tenantId: string): Promise<FeedbackStats> {
    // Active feedback aggregation
    const { rows: activeRows } = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE rating = 'helpful')::int AS helpful,
         COUNT(*) FILTER (WHERE rating = 'unhelpful')::int AS unhelpful
       FROM orch_staff_feedback_active
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const total = activeRows[0].total;
    const helpful = activeRows[0].helpful;
    const unhelpful = activeRows[0].unhelpful;

    // Top issues from unhelpful feedback comments
    const { rows: issueRows } = await client.query(
      `SELECT comment, COUNT(*)::int AS count
       FROM orch_staff_feedback_active
       WHERE tenant_id = $1 AND rating = 'unhelpful' AND comment IS NOT NULL
       GROUP BY comment
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId]
    );

    // Passive feedback aggregation
    const { rows: passiveRows } = await client.query(
      `SELECT
         COALESCE(AVG(time_on_page_ms), 0)::int AS avg_time,
         COALESCE(AVG(scroll_depth_pct), 0)::numeric(5,2) AS avg_scroll
       FROM orch_staff_feedback_passive
       WHERE tenant_id = $1`,
      [tenantId]
    );

    return {
      totalActive: total,
      helpfulCount: helpful,
      unhelpfulCount: unhelpful,
      helpfulPct: total > 0 ? Math.round((helpful / total) * 100) : 0,
      unhelpfulPct: total > 0 ? Math.round((unhelpful / total) * 100) : 0,
      topIssues: issueRows.map((r) => ({ comment: r.comment, count: r.count })),
      avgTimeOnPageMs: passiveRows[0].avg_time,
      avgScrollDepthPct: Number(passiveRows[0].avg_scroll),
    };
  }
}

export const orchStaffFeedback = new OrchStaffFeedback();
