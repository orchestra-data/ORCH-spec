/**
 * GET /orch-admin/alerts
 * Get proactive alerts for the current user.
 */
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchAdminAlerts } from '../../app/services/admin/orch-admin-alerts';

export const method = 'get';
export const path = '/orch-admin/alerts';
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

      const category = req.query.category as string | undefined;
      const unreadOnly = req.query.unreadOnly === 'true';
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      client = await pool.connect();
      const result = await orchAdminAlerts.getAlerts(client, {
        tenantId,
        userId,
        category: category as any,
        unreadOnly,
        limit,
        offset,
      });

      return res.json(result);
    } catch (err) {
      console.error('Error in orchAdminAlerts:', err);
      return res.status(500).json({ error: 'Erro ao buscar alertas.' });
    } finally {
      client?.release();
    }
  };
}
