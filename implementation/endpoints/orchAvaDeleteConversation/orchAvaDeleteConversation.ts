import { RequestHandler } from 'express';
import { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../middlewares/requireAuth';

export const method = 'delete';

export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client: PoolClient | undefined;

    try {
      const conversationId = req.params.conversationId;
      const userId = req.user!.id;
      const tenantId = req.tenantContext!.tenantId;

      client = await pool.connect();

      const result = await client.query(
        `UPDATE ai_conversation
            SET deleted_at = now()
          WHERE id = $1
            AND user_id = $2
            AND tenant_id = $3
            AND deleted_at IS NULL`,
        [conversationId, userId, tenantId],
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      res.json({ success: true });
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
