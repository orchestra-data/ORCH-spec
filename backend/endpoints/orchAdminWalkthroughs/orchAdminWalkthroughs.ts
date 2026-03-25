/**
 * GET /orch-admin/walkthroughs
 * List available walkthroughs, optionally filtered by route.
 */
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchAdminWalkthroughs } from '../../app/services/admin/orch-admin-walkthroughs';

export const method = 'get';
export const path = '/orch-admin/walkthroughs';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const tenantId = req.tenantContext?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'Missing tenant context' });
      }

      const route = req.query.route as string | undefined;

      client = await pool.connect();
      const walkthroughs = await orchAdminWalkthroughs.getAvailable(client, { tenantId, route });
      return res.json({ walkthroughs });
    } catch (err) {
      console.error('Error in orchAdminWalkthroughs:', err);
      return res.status(500).json({ error: 'Erro ao listar walkthroughs.' });
    } finally {
      client?.release();
    }
  };
}
