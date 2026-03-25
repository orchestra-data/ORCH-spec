/**
 * POST /orch-admin/walkthrough/:id/start
 * Start a guided walkthrough for the current user.
 */
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchAdminWalkthroughs } from '../../app/services/admin/orch-admin-walkthroughs';

export const method = 'post';
export const path = '/orch-admin/walkthrough/:id/start';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Missing user context' });

      const walkthroughId = req.params.id;
      if (!walkthroughId) return res.status(400).json({ error: 'walkthrough id is required' });

      client = await pool.connect();
      const result = await orchAdminWalkthroughs.start(client, { walkthroughId, userId });
      return res.json(result);
    } catch (err) {
      console.error('Error in orchAdminWalkthroughStart:', err);
      return res.status(500).json({ error: 'Erro ao iniciar walkthrough.' });
    } finally {
      client?.release();
    }
  };
}
