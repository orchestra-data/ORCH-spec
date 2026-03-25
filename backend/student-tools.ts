import type { CoreTool } from 'ai';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { truncateResult } from './tool-utils';
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
 * Student tools — all use ctx.userId from JWT (SECURITY-LAYER-2).
 * NONE accept userId, studentId, or userEmail as a Zod parameter.
 */
export function createStudentTools(
  ctx: OrchToolContext,
  secure: SecureTool
): Record<string, CoreTool> {
  return {
    getMyProgress: secure(ctx, {
      description:
        'Busca progresso academico do usuario logado (componentes completados, unidades, disciplinas). Use quando perguntar sobre progresso, aulas completadas, status de conclusao.',
      parameters: z.object({
        classEnrollmentId: z
          .string()
          .uuid()
          .optional()
          .describe('ID da matricula na turma (opcional)'),
        seriesId: z.string().uuid().optional().describe('ID da disciplina (opcional)'),
        pathwayId: z.string().uuid().optional().describe('ID da trilha (opcional)'),
        collectionId: z.string().uuid().optional().describe('ID da colecao (opcional)'),
      }),
      execute: async (params, client) => {
        // Metrics from experience_metrics_aggregated (pre-calculated)
        const metrics = await client.query(
          `SELECT metric_key, total_value
           FROM experience_metrics_aggregated
           WHERE student_id = $1
             AND tenant_id = $2
             AND period_type = 'total'
             AND metric_key IN (
               'component_completed_count', 'component_started_count',
               'component_completed_by_type_video_count',
               'quiz_attempts_count', 'quiz_score_sum', 'quiz_score_count'
             )
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          [ctx.userId, ctx.tenantId]
        );

        const m = Object.fromEntries(
          metrics.rows.map((r: { metric_key: string; total_value: string }) => [
            r.metric_key,
            Number(r.total_value),
          ])
        );

        // If classEnrollmentId provided, get enrollment-specific progress
        let enrollmentProgress = null;
        if (params.classEnrollmentId) {
          const progress = await client.query(
            `SELECT
               COUNT(*) FILTER (WHERE status = 'completed') as completed,
               COUNT(*) FILTER (WHERE status = 'started') as started,
               COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
               COUNT(*) as total
             FROM student_progress
             WHERE user_id = $1 AND tenant_id = $2
               AND class_enrollment_id = $3
               AND component_id IS NOT NULL
               AND deleted_at IS NULL`,
            [ctx.userId, ctx.tenantId, params.classEnrollmentId]
          );
          enrollmentProgress = progress.rows[0];
        }

        return truncateResult({
          componentsCompleted: m['component_completed_count'] ?? 0,
          componentsStarted: m['component_started_count'] ?? 0,
          videoComponentsCompleted: m['component_completed_by_type_video_count'] ?? 0,
          quizAttempts: m['quiz_attempts_count'] ?? 0,
          quizAvgScore:
            (m['quiz_score_count'] ?? 0) > 0
              ? Math.round(((m['quiz_score_sum'] ?? 0) / m['quiz_score_count']!) * 100) / 100
              : null,
          ...(enrollmentProgress && {
            enrollmentCompletion: {
              completed: Number(enrollmentProgress.completed),
              total: Number(enrollmentProgress.total),
              percentage:
                enrollmentProgress.total > 0
                  ? Math.round(
                      (Number(enrollmentProgress.completed) / Number(enrollmentProgress.total)) *
                        100
                    )
                  : 0,
            },
          }),
        });
      },
    }),

    getMyAttendance: secure(ctx, {
      description:
        'Busca resumo de presenca/frequencia do usuario por turma. Use quando perguntar sobre faltas, presenca, risco de reprovacao por frequencia, justificativas pendentes.',
      parameters: z.object({
        classInstanceId: z
          .string()
          .uuid()
          .optional()
          .describe('ID da turma para filtrar (opcional)'),
      }),
      execute: async (params, client) => {
        const queryParams: unknown[] = [ctx.userId, ctx.tenantId];
        let classFilter = '';
        if (params.classInstanceId) {
          queryParams.push(params.classInstanceId);
          classFilter = `AND ci.id = $${queryParams.length}`;
        }

        const result = await client.query(
          `SELECT
             ci.id as class_instance_id,
             ci.name as class_instance_name,
             COALESCE(s.title, col.title, ci.name) as content_name,
             COALESCE(ac.total_sessions, 0) as total_sessions,
             COALESCE(ac.attended_sessions, 0) as attended_sessions,
             COALESCE(ac.weighted_attendance_percentage, 0) as attendance_percentage,
             COALESCE(ac.min_required_percentage, 75) as min_required_percentage,
             COALESCE(ac.risk_level, 'low') as risk_level,
             COALESCE(ac.is_at_risk, false) as is_at_risk,
             (SELECT COUNT(*)::int FROM attendance_justification aj
              JOIN attendance_record ar2 ON ar2.id = aj.attendance_record_id
              WHERE aj.student_id = ce.user_id AND ar2.class_instance_id = ci.id
                AND aj.status = 'pending'
             ) as pending_justifications
           FROM class_enrollment ce
           JOIN class_instance ci ON ci.id = ce.class_instance_id
           LEFT JOIN series s ON s.id = ci.content_id AND ci.content_type = 'series'
           LEFT JOIN collection col ON col.id = ci.content_id AND ci.content_type = 'collection'
           LEFT JOIN attendance_calculation ac ON ac.user_id = ce.user_id AND ac.class_instance_id = ci.id
           WHERE ce.user_id = $1
             AND ce.tenant_id = $2
             AND ce.status = 'enrolled'
             AND ci.deleted_at IS NULL
             ${classFilter}
           ORDER BY content_name
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          queryParams
        );

        return truncateResult(
          result.rows.map((r: Record<string, unknown>) => ({
            classInstanceName: r.class_instance_name,
            contentName: r.content_name,
            totalSessions: Number(r.total_sessions),
            attendedSessions: Number(r.attended_sessions),
            attendancePercentage: Number(r.attendance_percentage),
            minRequired: Number(r.min_required_percentage),
            riskLevel: r.risk_level,
            isAtRisk: r.is_at_risk,
            pendingJustifications: Number(r.pending_justifications),
          }))
        );
      },
    }),

    getMyGrades: secure(ctx, {
      description:
        'Busca notas e tentativas de avaliacoes do usuario. Use quando perguntar sobre notas, provas, avaliacoes, resultados, desempenho em provas.',
      parameters: z.object({
        componentId: z.string().uuid().optional().describe('ID do componente/avaliacao especifica'),
        seriesId: z.string().uuid().optional().describe('ID da disciplina para filtrar'),
        status: z
          .enum(['submitted', 'graded', 'pending'])
          .optional()
          .describe('Status da tentativa'),
        limit: z.number().min(1).max(10).default(5).describe('Quantidade maxima de resultados'),
      }),
      execute: async (params, client) => {
        const queryParams: unknown[] = [ctx.userId, ctx.tenantId, ctx.accessibleCompanyIds];
        const conditions: string[] = [
          'aa.student_user_id = $1',
          'aa.tenant_id = $2',
          'aa.company_id = ANY($3::uuid[])',
        ];

        if (params.componentId) {
          queryParams.push(params.componentId);
          conditions.push(`aa.component_id = $${queryParams.length}`);
        }
        if (params.seriesId) {
          queryParams.push(params.seriesId);
          conditions.push(
            `comp.unit_id IN (SELECT id FROM unit WHERE series_id = $${queryParams.length})`
          );
        }
        if (params.status) {
          queryParams.push(params.status);
          conditions.push(`aa.status = $${queryParams.length}`);
        }

        const limit = Math.min(params.limit, TOOL_LIMITS.MAX_ROWS);

        const result = await client.query(
          `SELECT
             aa.id,
             comp.title as component_title,
             aa.score,
             aa.max_score,
             aa.percentage_correct,
             aa.status,
             aa.submitted_at,
             s.title as series_title
           FROM assessment_attempt aa
           JOIN component comp ON comp.id = aa.component_id
           LEFT JOIN unit u ON u.id = comp.unit_id
           LEFT JOIN series s ON s.id = u.series_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY aa.submitted_at DESC NULLS LAST
           LIMIT ${limit}`,
          queryParams
        );

        return truncateResult(
          result.rows.map((r: Record<string, unknown>) => ({
            title: r.component_title,
            score: r.score,
            maxScore: r.max_score,
            percentage: r.percentage_correct,
            status: r.status,
            submittedAt: r.submitted_at,
            seriesTitle: r.series_title,
          }))
        );
      },
    }),

    getMyEnrollments: secure(ctx, {
      description:
        'Lista turmas/disciplinas em que o usuario esta matriculado. Use quando perguntar sobre matriculas, turmas, disciplinas, cursos, grade curricular.',
      parameters: z.object({
        status: z
          .enum(['enrolled', 'completed', 'dropped', 'suspended', 'transferred'])
          .optional()
          .default('enrolled')
          .describe('Status da matricula'),
      }),
      execute: async (params, client) => {
        const result = await client.query(
          `SELECT
             ce.id as enrollment_id,
             ce.status as enrollment_status,
             ce.created_at as enrollment_date,
             ci.id as class_instance_id,
             ci.name as class_instance_name,
             ci.content_type,
             COALESCE(s.title, col.title) as content_title,
             COALESCE(s.code, '') as content_code,
             ci.start_date,
             ci.end_date
           FROM class_enrollment ce
           JOIN class_instance ci ON ci.id = ce.class_instance_id
           LEFT JOIN series s ON s.id = ci.content_id AND ci.content_type = 'series'
           LEFT JOIN collection col ON col.id = ci.content_id AND ci.content_type = 'collection'
           WHERE ce.user_id = $1
             AND ce.tenant_id = $2
             AND ce.status = $3
             AND ci.deleted_at IS NULL
           ORDER BY ci.name
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          [ctx.userId, ctx.tenantId, params.status]
        );

        return truncateResult(
          result.rows.map((r: Record<string, unknown>) => ({
            enrollmentId: r.enrollment_id,
            classInstanceId: r.class_instance_id,
            classInstanceName: r.class_instance_name,
            contentTitle: r.content_title,
            contentCode: r.content_code,
            contentType: r.content_type,
            enrollmentStatus: r.enrollment_status,
            enrollmentDate: r.enrollment_date,
            startDate: r.start_date,
            endDate: r.end_date,
          }))
        );
      },
    }),

    getMyCourseContent: secure(ctx, {
      description:
        'Lista o conteudo completo (disciplinas, modulos, aulas) de uma turma em que o usuario esta matriculado. Use quando perguntar sobre conteudos de um curso, grade, ementa, aulas disponiveis, materiais de estudo.',
      parameters: z.object({
        classInstanceId: z
          .string()
          .uuid()
          .describe('ID da turma (obtido de getMyEnrollments)'),
      }),
      execute: async (params, client) => {
        // Verify enrollment belongs to this user
        const enrollment = await client.query(
          `SELECT ci.content_id, ci.content_type, ci.name as class_name
           FROM class_enrollment ce
           JOIN class_instance ci ON ci.id = ce.class_instance_id
           WHERE ce.user_id = $1 AND ce.tenant_id = $2
             AND ci.id = $3 AND ce.status = 'enrolled'
             AND ci.deleted_at IS NULL
           LIMIT 1`,
          [ctx.userId, ctx.tenantId, params.classInstanceId]
        );

        if (enrollment.rows.length === 0) {
          return { error: 'Matricula nao encontrada para esta turma.' };
        }

        const { content_id, content_type, class_name } = enrollment.rows[0];

        // Build content hierarchy based on content_type
        let contentQuery: string;
        const contentParams: unknown[] = [];

        if (content_type === 'collection') {
          contentParams.push(content_id);
          contentQuery = `
            SELECT
              p.title as pathway_title,
              s.title as series_title,
              u.title as unit_title,
              comp.title as component_title,
              comp.component_type,
              comp.estimated_duration_minutes
            FROM collection col
            JOIN pathway p ON p.collection_id = col.id AND p.deleted_at IS NULL
            JOIN series s ON s.pathway_id = p.id AND s.deleted_at IS NULL
            JOIN unit u ON u.series_id = s.id AND u.deleted_at IS NULL
            JOIN component comp ON comp.unit_id = u.id AND comp.deleted_at IS NULL
            WHERE col.id = $1
            ORDER BY p.title, s.title, u.title, comp.title
            LIMIT ${TOOL_LIMITS.MAX_ROWS}`;
        } else {
          // content_type = 'series'
          contentParams.push(content_id);
          contentQuery = `
            SELECT
              NULL as pathway_title,
              s.title as series_title,
              u.title as unit_title,
              comp.title as component_title,
              comp.component_type,
              comp.estimated_duration_minutes
            FROM series s
            JOIN unit u ON u.series_id = s.id AND u.deleted_at IS NULL
            JOIN component comp ON comp.unit_id = u.id AND comp.deleted_at IS NULL
            WHERE s.id = $1
            ORDER BY u.title, comp.title
            LIMIT ${TOOL_LIMITS.MAX_ROWS}`;
        }

        const result = await client.query(contentQuery, contentParams);

        return truncateResult({
          className: class_name,
          contentType: content_type,
          totalComponents: result.rows.length,
          content: result.rows.map((r: Record<string, unknown>) => ({
            ...(r.pathway_title ? { pathwayTitle: r.pathway_title } : {}),
            seriesTitle: r.series_title,
            unitTitle: r.unit_title,
            componentTitle: r.component_title,
            type: r.component_type,
            estimatedMinutes: r.estimated_duration_minutes,
          })),
        });
      },
    }),

    getMyProfile: secure(ctx, {
      description:
        'Busca dados basicos do perfil do usuario logado. Use quando perguntar sobre dados pessoais, email, telefone, perfil. NAO retorna documentos sensiveis.',
      parameters: z.object({}),
      execute: async (_params, client) => {
        const result = await client.query(
          `SELECT
             u.full_name,
             u.social_name,
             u.email,
             u.phone_e164 as phone,
             u.user_type,
             u.status
           FROM "user" u
           WHERE u.id = $1 AND u.tenant_id = $2`,
          [ctx.userId, ctx.tenantId]
        );

        if (!result.rows[0]) return { error: 'Perfil nao encontrado' };

        const user = result.rows[0];
        const userTypeLabel =
          user.user_type === 'student'
            ? 'Aluno'
            : user.user_type === 'employee'
              ? 'Colaborador'
              : 'Aluno/Colaborador';

        return {
          fullName: user.full_name,
          socialName: user.social_name,
          email: user.email,
          phone: user.phone,
          userType: userTypeLabel,
          status: user.status,
          // Intentionally OMITTED: birthDate, documents (CPF/RG), addresses
        };
      },
    }),
  };
}
