import { RequestHandler } from 'express';
import { Pool, PoolClient } from 'pg';
import * as yup from 'yup';
import { requireAuth } from '../../middlewares/requireAuth';

export const method = 'get';

export const middlewares = [requireAuth()];

const querySchema = yup.object({
  limit: yup.number().integer().min(1).max(50).default(20),
  offset: yup.number().integer().min(0).default(0),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client: PoolClient | undefined;

    try {
      const { limit, offset } = await querySchema.validate(req.query, {
        stripUnknown: true,
      });

      const userId = req.user!.id;
      const tenantId = req.tenantContext!.tenantId;

      client = await pool.connect();

      const countResult = await client.query(
        `SELECT count(*)::int AS total
           FROM ai_conversation
          WHERE user_id = $1
            AND tenant_id = $2
            AND deleted_at IS NULL`,
        [userId, tenantId],
      );

      const total: number = countResult.rows[0].total;

      const result = await client.query(
        `SELECT
            c.id,
            coalesce(
              left(
                (SELECT content FROM ai_conversation_message
                  WHERE conversation_id = c.id
                  ORDER BY created_at ASC LIMIT 1),
                50
              ),
              'Nova conversa'
            ) AS title,
            (SELECT content FROM ai_conversation_message
              WHERE conversation_id = c.id
              ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT count(*)::int FROM ai_conversation_message
              WHERE conversation_id = c.id) AS messages_count,
            c.created_at,
            c.updated_at
           FROM ai_conversation c
          WHERE c.user_id = $1
            AND c.tenant_id = $2
            AND c.deleted_at IS NULL
          ORDER BY c.updated_at DESC
          LIMIT $3 OFFSET $4`,
        [userId, tenantId, limit, offset],
      );

      const conversations = result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        lastMessage: row.last_message,
        messagesCount: row.messages_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json({ conversations, total });
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
