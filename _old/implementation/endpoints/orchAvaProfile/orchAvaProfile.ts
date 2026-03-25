import { RequestHandler } from 'express';
import { Pool, PoolClient } from 'pg';
import { requireAuth } from '../../middlewares/requireAuth';
import { orchProfileService } from '../../services/orchProfileService';

export const method = 'get';

export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client: PoolClient | undefined;

    try {
      const userId = req.user!.id;
      const tenantId = req.tenantContext!.tenantId;

      client = await pool.connect();

      const profile = await orchProfileService.loadOrCreate(client, {
        userId,
        tenantId,
      });

      // Strip internal fields
      const {
        tenant_id,
        student_id,
        ...publicProfile
      } = profile;

      res.json({
        id: publicProfile.id,
        archetype: publicProfile.archetype,
        academic: publicProfile.academic,
        cognitive: publicProfile.cognitive,
        linguistic: publicProfile.linguistic,
        engagement: publicProfile.engagement,
        gamification: publicProfile.gamification,
        risk: publicProfile.risk,
        version: publicProfile.version,
        createdAt: publicProfile.created_at,
        updatedAt: publicProfile.updated_at,
      });
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
