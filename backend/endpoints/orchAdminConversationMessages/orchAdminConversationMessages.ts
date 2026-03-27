/**
 * GET /orch-admin/conversations/:conversationId/messages
 * Returns recent messages from a specific conversation.
 * Used by the frontend to restore chat history on page reload.
 */
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../app/auth';

export const method = 'get';
export const path = '/orch-admin/conversations/:conversationId/messages';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const tenantId = req.tenantContext?.tenantId;
      const userId = req.user?.id;
      if (!tenantId || !userId) {
        return res.status(401).json({ error: 'Missing tenant or user context' });
      }

      const { conversationId } = req.params;
      if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversationId' });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 10, 30);

      client = await pool.connect();

      // Verify conversation belongs to this user+tenant
      const { rows: convRows } = await client.query(
        `SELECT id FROM orch_admin_conversation
         WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND status != 'archived'
         LIMIT 1`,
        [conversationId, userId, tenantId]
      );

      if (convRows.length === 0) {
        return res.json({ messages: [] });
      }

      // Get recent messages (ordered oldest first for display)
      const { rows } = await client.query(
        `SELECT role, content, created_at
         FROM orch_admin_message
         WHERE conversation_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [conversationId, limit]
      );

      return res.json({
        messages: rows.reverse().map((r: any) => ({
          role: r.role,
          content: r.content,
          created_at: r.created_at,
        })),
      });
    } catch (err) {
      console.error('Error in orchAdminConversationMessages:', err);
      return res.status(500).json({ error: 'Erro ao carregar mensagens.' });
    } finally {
      client?.release();
    }
  };
}
