import type { CoreTool } from 'ai';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { sanitizeSearchInput, truncateResult } from './tool-utils';
import type { OrchToolContext } from './types';
import { TOOL_LIMITS } from './types';

type SecureTool = <P extends z.ZodType>(
  ctx: OrchToolContext,
  definition: {
    description: string;
    parameters: P;
    execute: (params: z.infer<P>, client: PoolClient) => Promise<unknown>;
    requiredRole?: 'admin' | 'professor';
  }
) => CoreTool;

/**
 * Shared tools — available to all roles.
 * Content search is filtered by user's enrollments for students.
 */
export function createSharedTools(
  ctx: OrchToolContext,
  secure: SecureTool
): Record<string, CoreTool> {
  return {
    searchContent: secure(ctx, {
      description:
        'Busca conteudo educacional (aulas, materiais, componentes) por texto. Use quando perguntar sobre conteudo especifico, materiais de estudo, aulas, topicos.',
      parameters: z.object({
        query: z.string().max(200).describe('Termo de busca'),
        seriesId: z.string().uuid().optional().describe('ID da disciplina para filtrar'),
        unitId: z.string().uuid().optional().describe('ID da unidade para filtrar'),
        type: z
          .enum([
            'video',
            'text',
            'quiz',
            'assignment',
            'discussion',
            'link',
            'file',
            'interactive',
            'live_session',
            'ai_qa',
            'presencial_activity',
            'hybrid_activity',
            'online_activity',
          ])
          .optional()
          .describe('Tipo de componente'),
      }),
      execute: async (params, client) => {
        const sanitized = sanitizeSearchInput(params.query);
        const queryParams: unknown[] = [ctx.tenantId, `%${sanitized}%`];
        const conditions: string[] = [
          'c.tenant_id = $1',
          '(c.title ILIKE $2 OR c.description ILIKE $2)',
        ];

        if (params.seriesId) {
          queryParams.push(params.seriesId);
          conditions.push(`u.series_id = $${queryParams.length}`);
        }
        if (params.unitId) {
          queryParams.push(params.unitId);
          conditions.push(`c.unit_id = $${queryParams.length}`);
        }
        if (params.type) {
          queryParams.push(params.type);
          conditions.push(`c.component_type = $${queryParams.length}`);
        }

        // Filter to content the user is enrolled in (handles both series and collection enrollments)
        queryParams.push(ctx.userId);
        const userParamIdx = queryParams.length;

        const result = await client.query(
          `SELECT c.id, c.title, c.component_type, c.subtype,
                  u.title as unit_title, s.title as series_title,
                  c.estimated_duration_minutes
           FROM component c
           JOIN unit u ON u.id = c.unit_id
           JOIN series s ON s.id = u.series_id
           WHERE ${conditions.join(' AND ')}
             AND c.deleted_at IS NULL
             AND EXISTS (
               SELECT 1 FROM class_enrollment ce
               JOIN class_instance ci ON ci.id = ce.class_instance_id
               WHERE ce.user_id = $${userParamIdx}
                 AND ce.status = 'enrolled'
                 AND ci.deleted_at IS NULL
                 AND (
                   (ci.content_type = 'series' AND ci.content_id = s.id)
                   OR
                   (ci.content_type = 'collection' AND ci.content_id IN (
                     SELECT col.id FROM collection col
                     JOIN pathway p ON p.collection_id = col.id
                     WHERE p.id = s.pathway_id AND p.deleted_at IS NULL
                   ))
                 )
             )
           ORDER BY c.title
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          queryParams
        );

        return truncateResult(
          result.rows.map((r: Record<string, unknown>) => ({
            id: r.id,
            title: r.title,
            type: r.component_type,
            subtype: r.subtype,
            unitTitle: r.unit_title,
            seriesTitle: r.series_title,
            estimatedMinutes: r.estimated_duration_minutes,
          }))
        );
      },
    }),
  };
}
