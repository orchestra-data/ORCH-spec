/**
 * GET /orch-admin/conversations
 * List admin assistant conversations for the current user.
 */
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchAdminChat } from '../../app/services/admin/orch-admin-chat';

export const method = 'get';
export const path = '/orch-admin/conversations';
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

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      client = await pool.connect();
      const conversations = await orchAdminChat.listConversations(client, userId, tenantId, limit, offset);
      return res.json({ conversations });
    } catch (err) {
      console.error('Error in orchAdminConversations:', err);
      return res.status(500).json({ error: 'Erro ao listar conversas.' });
    } finally {
      client?.release();
    }
  };
}
