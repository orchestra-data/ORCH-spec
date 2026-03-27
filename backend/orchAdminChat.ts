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

      const { message, routeContext, sessionId, pageUrl } = req.body;
      if (!message || !routeContext) {
        return res.status(400).json({ error: 'message and routeContext are required' });
      }

      // Resolve DB user.id + profile from Keycloak sub
      let dbUserId = userId;
      let userProfile: { fullName: string; firstName: string; gender: string | null; roleTitle: string | null; userType: string } | null = null;
      try {
        const { rows } = await pool.query(
          `SELECT id, full_name, gender, role_title, user_type FROM "user" WHERE keycloak_user_id = $1 LIMIT 1`,
          [userId]
        );
        if (rows.length > 0) {
          dbUserId = rows[0].id;
          const fullName = rows[0].full_name || '';
          userProfile = {
            fullName,
            firstName: fullName.split(/\s+/)[0] || fullName,
            gender: rows[0].gender,
            roleTitle: rows[0].role_title,
            userType: rows[0].user_type,
          };
        } else {
          console.warn(`[orch_admin] No DB user found for keycloak_user_id=${userId}. Tools may return wrong data.`);
        }
      } catch (err) {
        console.error(`[orch_admin] Failed to resolve DB user.id for keycloak_user_id=${userId}:`, err instanceof Error ? err.message : err);
        return res.status(500).json({ error: 'Erro ao resolver usuario. Tente novamente.' });
      }

      // Resolve user role using DB user.id
      const userRole = await resolveUserRole(pool, dbUserId, tenantId, companyId ?? tenantId);

      // Build tool context with DB user.id for correct data access
      const resolvedCompanyId = companyId ?? tenantId;
      const resolvedCompanyIds = accessibleCompanyIds.length > 0
        ? accessibleCompanyIds
        : [resolvedCompanyId];

      if (resolvedCompanyIds.length === 0) {
        console.warn(`[orch_admin] accessibleCompanyIds is empty for user=${dbUserId}, tenant=${tenantId}. Tools will return no data.`);
      }

      const toolContext: OrchToolContext = {
        pool,
        userId: dbUserId,
        tenantId,
        companyId: resolvedCompanyId,
        accessibleCompanyIds: resolvedCompanyIds,
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
        routeContext: pageUrl ? `${routeContext} (URL: ${pageUrl})` : routeContext,
        sessionId: sessionId || undefined,
        tools: availableTools,
        userProfile: userProfile ?? undefined,
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
