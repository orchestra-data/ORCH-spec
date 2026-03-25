/**
 * POST /orch-admin/chat
 * Admin AI assistant — RAG-powered chat with tool calling for real data access.
 */
import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import type { Pool, PoolClient } from 'pg';

import { requireAuth } from '../../app/auth';
import { orchAdminChat } from '../../app/services/admin/orch-admin-chat';
import { createOrchTools, filterToolsByRole } from '../../app/services/orch-tools';
import type { OrchToolContext } from '../../app/services/orch-tools/types';
import { resolveUserRole } from '../../app/utils/resolve-user-role';

export const method = 'post';
export const path = '/orch-admin/chat';

const chatRateLimit = rateLimit({
  windowMs: 60_000,
  max: 15,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  message: { error: 'rate_limited', message: 'Muitas mensagens. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

export const middlewares = [requireAuth(), chatRateLimit];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client: PoolClient | null = null;
    try {
      const tenantId = req.tenantContext?.tenantId;
      const companyId = req.tenantContext?.companyId;
      const accessibleCompanyIds = req.tenantContext?.accessibleCompanyIds ?? [];
      const userId = req.user?.id;
      if (!tenantId || !userId) {
        return res.status(401).json({ error: 'Missing tenant or user context' });
      }

      const { message, routeContext, sessionId } = req.body;
      if (!message || !routeContext) {
        return res.status(400).json({ error: 'message and routeContext are required' });
      }

      // Resolve DB user.id from Keycloak sub (they differ in dev)
      let dbUserId = userId;
      try {
        const { rows } = await pool.query(
          `SELECT id FROM "user" WHERE keycloak_user_id = $1 LIMIT 1`,
          [userId]
        );
        if (rows.length > 0) dbUserId = rows[0].id;
      } catch { /* fallback to Keycloak sub */ }

      // Resolve user role using DB user.id
      const userRole = await resolveUserRole(pool, dbUserId, tenantId, companyId ?? tenantId);

      // Build tool context with DB user.id for correct data access
      const toolContext: OrchToolContext = {
        pool,
        userId: dbUserId,
        tenantId,
        companyId: companyId ?? tenantId,
        accessibleCompanyIds: accessibleCompanyIds.length > 0 ? accessibleCompanyIds : companyId ? [companyId] : [],
        userRole,
      };
      const allTools = createOrchTools(toolContext);
      const availableTools = filterToolsByRole(allTools, userRole);

      client = await pool.connect();
      const result = await orchAdminChat.chat(client, {
        userId,
        tenantId,
        companyId: companyId ?? undefined,
        message,
        routeContext,
        sessionId: sessionId || undefined,
        tools: availableTools,
      });

      return res.json(result);
    } catch (err) {
      console.error('Error in orchAdminChat:', err);
      return res.status(500).json({ error: 'Erro ao processar mensagem do assistente admin.' });
    } finally {
      client?.release();
    }
  };
}
