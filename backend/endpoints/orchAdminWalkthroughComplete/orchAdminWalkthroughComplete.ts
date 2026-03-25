/**
 * POST /orch-admin/walkthrough/:id/complete
 * Complete a guided walkthrough.
 */
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchAdminWalkthroughs } from '../../app/services/admin/orch-admin-walkthroughs';

export const method = 'post';
export const path = '/orch-admin/walkthrough/:id/complete';
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
      await orchAdminWalkthroughs.complete(client, { walkthroughId, userId });
      return res.json({ completed: true });
    } catch (err) {
      console.error('Error in orchAdminWalkthroughComplete:', err);
      return res.status(500).json({ error: 'Erro ao completar walkthrough.' });
    } finally {
      client?.release();
    }
  };
}
