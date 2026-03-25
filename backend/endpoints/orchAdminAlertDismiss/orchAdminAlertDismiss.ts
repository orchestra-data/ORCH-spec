/**
 * POST /orch-admin/alerts/:id/dismiss
 * Dismiss an alert.
 */
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchAdminAlerts } from '../../app/services/admin/orch-admin-alerts';

export const method = 'post';
export const path = '/orch-admin/alerts/:id/dismiss';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Missing user context' });

      const alertId = req.params.id;
      if (!alertId) return res.status(400).json({ error: 'alert id is required' });

      client = await pool.connect();
      await orchAdminAlerts.dismiss(client, alertId, userId);
      return res.json({ success: true });
    } catch (err) {
      console.error('Error in orchAdminAlertDismiss:', err);
      return res.status(500).json({ error: 'Erro ao dispensar alerta.' });
    } finally {
      client?.release();
    }
  };
}
