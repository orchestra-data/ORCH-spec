import { RequestHandler } from 'express';
import { Pool, PoolClient } from 'pg';
import * as yup from 'yup';
import { requireAuth } from '../../middlewares/requireAuth';

export const method = 'get';

export const middlewares = [requireAuth()];

const querySchema = yup.object({
  limit: yup.number().integer().min(1).max(100).default(50),
  offset: yup.number().integer().min(0).default(0),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client: PoolClient | undefined;

    try {
      const { limit, offset } = await querySchema.validate(req.query, {
        stripUnknown: true,
      });

      const conversationId = req.params.conversationId;
      const userId = req.user!.id;
      const tenantId = req.tenantContext!.tenantId;

      client = await pool.connect();

      // Validate ownership
      const ownerCheck = await client.query(
        `SELECT id FROM ai_conversation
          WHERE id = $1
            AND user_id = $2
            AND tenant_id = $3
            AND deleted_at IS NULL`,
        [conversationId, userId, tenantId],
      );

      if (ownerCheck.rows.length === 0) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const countResult = await client.query(
        `SELECT count(*)::int AS total
           FROM ai_conversation_message
          WHERE conversation_id = $1`,
        [conversationId],
      );

      const total: number = countResult.rows[0].total;

      const result = await client.query(
        `SELECT
            id,
            role,
            content,
            agent_used,
            sources,
            action_chips,
            created_at
           FROM ai_conversation_message
          WHERE conversation_id = $1
          ORDER BY created_at ASC
          LIMIT $2 OFFSET $3`,
        [conversationId, limit, offset],
      );

      const messages = result.rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        agentUsed: row.agent_used,
        sources: row.sources,
        actionChips: row.action_chips,
        createdAt: row.created_at,
      }));

      res.json({ messages, total });
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
