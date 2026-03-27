import { tool, type CoreTool } from 'ai';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import type { OrchUserRole } from '../../utils/resolve-user-role';

import { createAdminTools } from './admin-tools';
import { createSharedTools } from './shared-tools';
import { createStudentTools } from './student-tools';
import { withReadOnlyTransaction, truncateResult } from './tool-utils';
import type { OrchToolContext } from './types';

/**
 * SECURITY-LAYER-3: Wrapper that injects security into ALL tools.
 *
 * Each tool receives a PoolClient inside a READ ONLY transaction
 * instead of direct Pool access. This guarantees:
 * - INSERT/UPDATE/DELETE are REJECTED by PostgreSQL
 * - statement_timeout cancels slow queries server-side
 * - Result is truncated before going to the LLM
 * - Errors are logged and translated to friendly messages
 */
function secureTool<P extends z.ZodType>(
  ctx: OrchToolContext,
  definition: {
    description: string;
    parameters: P;
    execute: (params: z.infer<P>, client: PoolClient) => Promise<unknown>;
    requiredRole?: 'admin' | 'professor';
  }
): CoreTool {
  return tool({
    description: definition.description,
    parameters: definition.parameters,
    execute: async (params: z.infer<P>) => {
      // SECURITY-LAYER-4: Double-check role — defense in depth
      if (definition.requiredRole) {
        const allowed =
          definition.requiredRole === 'admin'
            ? ctx.userRole === 'admin'
            : ['admin', 'professor'].includes(ctx.userRole);
        if (!allowed) {
          return { error: 'Acesso negado. Voce nao tem permissao para esta consulta.' };
        }
      }

      try {
        // SECURITY-LAYER-1: READ ONLY transaction + statement_timeout
        return await withReadOnlyTransaction(ctx.pool, async (client) => {
          const result = await definition.execute(params, client);
          return truncateResult(result);
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'unknown';
        console.error(
          `[orch_tool_error] tool=${definition.description.slice(0, 30)} error=${errorMsg}`
        );
        if (errorMsg.includes('statement timeout') || errorMsg.includes('canceling statement')) {
          return {
            error: 'A consulta demorou mais que o esperado. Tente uma pergunta mais especifica.',
          };
        }
        if (errorMsg.includes('read-only transaction')) {
          return { error: 'Erro interno de seguranca. Operacao nao permitida.' };
        }
        return { error: 'Nao foi possivel consultar os dados no momento. Tente novamente.' };
      }
    },
  });
}

/**
 * Creates all tools wrapped by secureTool().
 * Each tool receives PoolClient (read-only), NOT direct Pool access.
 */
export function createOrchTools(ctx: OrchToolContext): Record<string, CoreTool> {
  return {
    ...createStudentTools(ctx, secureTool),
    ...createAdminTools(ctx, secureTool),
    ...createSharedTools(ctx, secureTool),
  };
}

/**
 * Filter tools by user role (principle of least privilege).
 * Even if a tool passes this filter, secureTool's requiredRole provides a second check.
 */
export function filterToolsByRole(
  tools: Record<string, CoreTool>,
  role: OrchUserRole
): Record<string, CoreTool> {
  const studentToolNames = [
    'getMyProgress',
    'getMyAttendance',
    'getMyGrades',
    'getMyEnrollments',
    'getMyCourseContent',
    'getMyProfile',
    'searchContent',
  ];
  const professorToolNames = [...studentToolNames, 'getClassStats', 'getPendingGrading'];
  const adminToolNames = [
    ...professorToolNames,
    'getStudentInfo',
    'getStudentAttendance',
    'getBIMetrics',
    'listAllCourses',
    'listAllStudents',
    'getInstitutionStats',
    'getAccessLogs',
    'getTeacherActivity',
    'queryData',
  ];

  const allowedKeys =
    role === 'admin'
      ? adminToolNames
      : role === 'professor'
        ? professorToolNames
        : studentToolNames;

  return Object.fromEntries(Object.entries(tools).filter(([key]) => allowedKeys.includes(key)));
}
