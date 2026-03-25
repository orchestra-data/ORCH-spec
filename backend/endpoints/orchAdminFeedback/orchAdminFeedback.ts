/**
 * POST /orch-admin/feedback
 * Submit feedback on an admin assistant message.
 */
import type { RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchStaffFeedback } from '../../app/services/admin/orch-staff-feedback';

export const method = 'post';
export const path = '/orch-admin/feedback';
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

      const { messageId, rating, comment } = req.body;
      if (!messageId || !rating) {
        return res.status(400).json({ error: 'messageId and rating are required' });
      }

      client = await pool.connect();
      await orchStaffFeedback.submitActive(client, {
        userId,
        tenantId,
        messageId,
        rating,
        comment,
      });

      return res.json({ success: true });
    } catch (err) {
      console.error('Error in orchAdminFeedback:', err);
      return res.status(500).json({ error: 'Erro ao enviar feedback.' });
    } finally {
      client?.release();
    }
  };
}
