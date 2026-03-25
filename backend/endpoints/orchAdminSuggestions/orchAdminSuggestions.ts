/**
 * GET /orch-admin/suggestions/:route
 * Get proactive walkthrough suggestions for a stuck user on a route.
 */
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchAdminWalkthroughs } from '../../app/services/admin/orch-admin-walkthroughs';

export const method = 'get';
export const path = '/orch-admin/suggestions/:route';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const route = decodeURIComponent(req.params.route);

      client = await pool.connect();
      const suggestions = await orchAdminWalkthroughs.suggestWhenStuck(client, route);
      return res.json({
        suggestions: suggestions.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          steps: s.steps.length,
        })),
      });
    } catch (err) {
      console.error('Error in orchAdminSuggestions:', err);
      return res.status(500).json({ error: 'Erro ao buscar sugestoes.' });
    } finally {
      client?.release();
    }
  };
}
