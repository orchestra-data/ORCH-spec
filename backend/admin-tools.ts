import type { CoreTool } from 'ai';
import type { PoolClient } from 'pg';
import { z } from 'zod';

import { sanitizeSearchInput, truncateResult } from './tool-utils';
import type { OrchToolContext } from './types';
import { TOOL_LIMITS } from './types';

/**
 * Schema reference for the queryData tool.
 * Only tables safe for admin read access. Sensitive columns excluded.
 * The LLM uses this to write correct SELECT queries.
 */
const QUERYABLE_SCHEMA = `
## Tabelas disponíveis (PostgreSQL). Use aspas duplas em "user".

### "user" — Usuarios do sistema
Colunas: id (uuid PK), tenant_id (uuid), full_name (text), social_name (text), gender (text), email (text), user_type (text: student|employee|guardian), status (text: ingresso|egresso|evadido|trancado), birth_date (date), role_title (text), photo_url (text), last_login_at (timestamptz), active_since (timestamptz), created_at (timestamptz), deleted_at (timestamptz)

### user_company — Vinculo usuario-instituicao
Colunas: tenant_id (uuid), user_id (uuid FK->user.id), company_id (uuid FK->company.id), relationship_type (text)

### company — Instituicoes/organizacoes
Colunas: id (uuid PK), tenant_id (uuid), legal_name (text), display_name (text), parent_id (uuid FK->company.id), institutional_type (text), group_type (text), created_at (timestamptz)

### collection — Cursos
Colunas: id (uuid PK), tenant_id (uuid), company_id (uuid), title (text), description (text), status (text: draft|published|archived), workload_hours (int), is_offerable (bool), created_at (timestamptz), deleted_at (timestamptz)

### pathway — Trilhas dentro de um curso
Colunas: id (uuid PK), tenant_id (uuid), collection_id (uuid FK->collection.id), company_id (uuid), title (text), sequence_order (int), status (text), deleted_at (timestamptz)

### series — Disciplinas dentro de uma trilha
Colunas: id (uuid PK), tenant_id (uuid), pathway_id (uuid FK->pathway.id), company_id (uuid), title (text), code (text), workload_hours (numeric), requirement_type (text), status (text), professor_id (uuid FK->user.id), deleted_at (timestamptz)

### unit — Unidades dentro de uma disciplina
Colunas: id (uuid PK), tenant_id (uuid), series_id (uuid FK->series.id), company_id (uuid), title (text), sequence_order (int), estimated_duration_minutes (int), deleted_at (timestamptz)

### component — Componentes/aulas dentro de uma unidade
Colunas: id (uuid PK), tenant_id (uuid), unit_id (uuid FK->unit.id), company_id (uuid), component_type (text: video|quiz|ai_tutor|assignment|text|discussion|conference), title (text), estimated_duration_minutes (int), is_required (bool), sequence_order (int), deleted_at (timestamptz)

### class_instance — Turmas
Colunas: id (uuid PK), tenant_id (uuid), company_id (uuid), name (varchar), code (varchar), content_type (varchar: collection|series), content_id (uuid), status (varchar: active|inactive|completed), max_students (int), start_date (date), end_date (date), enrolled_students_count (int), engagement_score (int), churn_rate (numeric), delivery_mode (varchar), deleted_at (timestamptz)

### class_enrollment — Matriculas
Colunas: id (uuid PK), tenant_id (uuid), company_id (uuid), user_id (uuid FK->user.id), class_instance_id (uuid FK->class_instance.id), enrollment_date (date), status (varchar: enrolled|completed|dropped), completion_date (date), final_grade (numeric)

### attendance_calculation — Calculo de presenca por aluno/turma
Colunas: id (uuid PK), tenant_id (uuid), user_id (uuid FK->user.id), class_instance_id (uuid FK->class_instance.id), total_sessions (int), attended_sessions (int), absent_sessions (int), weighted_attendance_percentage (numeric), is_at_risk (bool), risk_level (varchar: low|medium|high|critical), min_required_percentage (numeric)

### assessment_attempt — Tentativas de avaliacao
Colunas: id (uuid PK), tenant_id (uuid), company_id (uuid), component_id (uuid FK->component.id), student_user_id (uuid FK->user.id), attempt_number (int), started_at (timestamptz), submitted_at (timestamptz), score (numeric), max_score (numeric), status (text: started|submitted|graded), type (text), percentage_correct (numeric)

### student_progress — Progresso do aluno por componente
Colunas: id (uuid PK), tenant_id (uuid), user_id (uuid FK->user.id), company_id (uuid), collection_id (uuid), pathway_id (uuid), series_id (uuid), unit_id (uuid), component_id (uuid), class_enrollment_id (uuid), status (text: not_started|in_progress|completed), progress_percentage (numeric), started_at (timestamptz), completed_at (timestamptz), time_spent_minutes (int), score (numeric), max_score (numeric), attempts_count (int)

### experience_events — Eventos xAPI (atividade do aluno)
Colunas: id (uuid PK), tenant_id (uuid), actor_id (uuid FK->user.id), company_id (uuid), verb (varchar: completed|started|interacted|paused|blurred), object_type (varchar: video|quiz|ai_tutor|system|discussion|assignment), object_id (varchar), result_score (numeric), result_success (bool), result_duration (int), timestamp (timestamptz)

### admin_entity_metrics — Metricas BI agregadas
Colunas: id (uuid PK), tenant_id (uuid), company_id (uuid), actor_id (uuid), metric_key (varchar), metric_value (numeric), period_type (varchar: daily|weekly|monthly|total), period_start (timestamptz), period_end (timestamptz)

### conversation — Conversas (mensageria)
Colunas: id (uuid PK), tenant_id (uuid), sender_id (uuid FK->user.id), destination_id (uuid), destination_type (text: user|class)

### conversation_message — Mensagens
Colunas: id (uuid PK), conversation_id (uuid FK->conversation.id), sender_id (uuid FK->user.id), content (text), created_at (timestamptz)

### admission — Processos seletivos
Colunas: id (uuid PK), tenant_id (uuid), company_id (uuid), title (text), status (text), start_date (timestamptz), end_date (timestamptz), max_candidates (int), created_at (timestamptz)

### admission_candidate — Candidatos
Colunas: id (uuid PK), tenant_id (uuid), admission_id (uuid FK->admission.id), user_id (uuid FK->user.id), full_name (text), email (text), status (text), score (numeric), created_at (timestamptz)

## Relacoes principais
- user -> user_company -> company (usuario pertence a instituicao)
- collection -> pathway -> series -> unit -> component (hierarquia de curso)
- class_instance -> class_enrollment -> user (turma -> matricula -> aluno)
- class_enrollment + attendance_calculation (presenca)
- component -> assessment_attempt (avaliacoes)
- user -> student_progress -> component (progresso)
- user -> experience_events (atividade xAPI)

## REGRAS SQL OBRIGATORIAS
- $1 = tenant_id (uuid), $2 = accessibleCompanyIds (uuid[])
- TODA query DEVE ter: WHERE ... tenant_id = $1
- Tabelas com company_id DEVEM ter: AND company_id = ANY($2::uuid[])
- Tabelas sem company_id: usar JOIN com user_company para filtrar
- "user" DEVE estar entre aspas duplas (palavra reservada)
- Use COALESCE para NULLs em agregacoes
- LIMIT 50 maximo
- Apenas SELECT. Nenhum INSERT/UPDATE/DELETE/DROP/ALTER/CREATE.
`;

const ALLOWED_TABLES = new Set([
  'user', 'user_company', 'company', 'collection', 'pathway', 'series', 'unit', 'component',
  'class_instance', 'class_enrollment', 'attendance_calculation', 'assessment_attempt',
  'student_progress', 'experience_events', 'experience_metrics_aggregated',
  'admin_entity_metrics', 'conversation', 'conversation_message',
  'admission', 'admission_candidate', 'company_event', 'certificate',
  'attendance_record', 'attendance_justification', 'attendance_rule',
  'community_space', 'community_post', 'discussion_topic', 'topic_reply',
]);

/** Validates that a SQL string is safe for read-only execution. */
function validateQuerySafety(sql: string): { safe: boolean; reason?: string } {
  const upper = sql.toUpperCase().replace(/\s+/g, ' ').trim();

  // Must be a SELECT
  if (!upper.startsWith('SELECT')) {
    return { safe: false, reason: 'Query deve comecar com SELECT' };
  }

  // Block dangerous keywords
  const blocked = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'COPY', 'EXECUTE', 'CALL'];
  for (const kw of blocked) {
    // Match as whole word (not inside column names like "updated_at")
    const regex = new RegExp(`\\b${kw}\\b(?!_)`, 'i');
    if (regex.test(sql)) {
      return { safe: false, reason: `Keyword proibida: ${kw}` };
    }
  }

  // Block system table access
  if (/\b(pg_catalog|information_schema|pg_)\b/i.test(sql)) {
    return { safe: false, reason: 'Acesso a tabelas de sistema proibido' };
  }

  // Block comments and semicolons (multi-statement)
  if (/--|\/\*|;/.test(sql)) {
    return { safe: false, reason: 'Comentarios e multi-statements proibidos' };
  }

  // Must reference $1 (tenant_id)
  if (!sql.includes('$1')) {
    return { safe: false, reason: 'Query deve filtrar por tenant_id ($1)' };
  }

  return { safe: true };
}

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
 * Admin tools — all use requiredRole for defense-in-depth (SECURITY-LAYER-4).
 * Queries filter by accessibleCompanyIds (multi-tenant hierarchy).
 */
export function createAdminTools(
  ctx: OrchToolContext,
  secure: SecureTool
): Record<string, CoreTool> {
  return {
    getClassStats: secure(ctx, {
      description:
        'Busca estatisticas de uma turma (total alunos, taxa de conclusao, media de presenca). Use quando admin perguntar sobre metricas de turma, numeros de alunos.',
      requiredRole: 'professor',
      parameters: z.object({
        classInstanceId: z.string().uuid().optional().describe('ID da turma'),
        search: z.string().max(200).optional().describe('Nome da turma para buscar'),
      }),
      execute: async (params, client) => {
        const conditions: string[] = [
          'ci.tenant_id = $1',
          'ci.company_id = ANY($2::uuid[])',
          'ci.deleted_at IS NULL',
        ];
        const queryParams: unknown[] = [ctx.tenantId, ctx.accessibleCompanyIds];

        if (params.classInstanceId) {
          queryParams.push(params.classInstanceId);
          conditions.push(`ci.id = $${queryParams.length}`);
        }
        if (params.search) {
          queryParams.push(`%${sanitizeSearchInput(params.search)}%`);
          conditions.push(`ci.name ILIKE $${queryParams.length}`);
        }

        const result = await client.query(
          `SELECT
             ci.id, ci.name,
             COUNT(DISTINCT ce.user_id) FILTER (WHERE ce.status = 'enrolled') as active_students,
             COUNT(DISTINCT ce.user_id) FILTER (WHERE ce.status = 'completed') as completed_students,
             COUNT(DISTINCT ce.user_id) as total_students,
             ROUND(AVG(ac.weighted_attendance_percentage), 1) as avg_attendance,
             COUNT(DISTINCT ce.user_id) FILTER (WHERE ac.is_at_risk = true) as at_risk_count
           FROM class_instance ci
           LEFT JOIN class_enrollment ce ON ce.class_instance_id = ci.id
           LEFT JOIN attendance_calculation ac ON ac.user_id = ce.user_id AND ac.class_instance_id = ci.id
           WHERE ${conditions.join(' AND ')}
           GROUP BY ci.id, ci.name
           ORDER BY ci.name
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          queryParams
        );

        return truncateResult(
          result.rows.map((r: Record<string, unknown>) => ({
            classInstanceId: r.id,
            name: r.name,
            activeStudents: Number(r.active_students),
            completedStudents: Number(r.completed_students),
            totalStudents: Number(r.total_students),
            avgAttendance: Number(r.avg_attendance),
            atRiskCount: Number(r.at_risk_count),
          }))
        );
      },
    }),

    getStudentInfo: secure(ctx, {
      description:
        'Busca informacoes de um aluno especifico (para admin/coordenador). Use quando admin perguntar sobre um aluno por nome ou ID.',
      requiredRole: 'admin',
      parameters: z.object({
        studentName: z.string().max(200).optional().describe('Nome do aluno (busca parcial)'),
        studentId: z.string().uuid().optional().describe('ID do aluno (exato)'),
      }),
      execute: async (params, client) => {
        if (!params.studentName && !params.studentId) {
          return { error: 'Informe nome ou ID do aluno' };
        }

        const conditions: string[] = ['u.tenant_id = $1', 'uc.company_id = ANY($2::uuid[])'];
        const queryParams: unknown[] = [ctx.tenantId, ctx.accessibleCompanyIds];

        if (params.studentId) {
          queryParams.push(params.studentId);
          conditions.push(`u.id = $${queryParams.length}`);
        } else if (params.studentName) {
          queryParams.push(`%${sanitizeSearchInput(params.studentName)}%`);
          conditions.push(`u.full_name ILIKE $${queryParams.length}`);
        }

        const result = await client.query(
          `SELECT DISTINCT
             u.id, u.full_name, u.email, u.user_type, u.status,
             COUNT(DISTINCT ce.id) FILTER (WHERE ce.status = 'enrolled') as active_enrollments,
             COUNT(DISTINCT ce.id) FILTER (WHERE ce.status = 'completed') as completed_enrollments,
             ROUND(AVG(ac.weighted_attendance_percentage), 1) as avg_attendance,
             BOOL_OR(ac.is_at_risk) as has_attendance_risk
           FROM "user" u
           JOIN user_company uc ON uc.user_id = u.id
           LEFT JOIN class_enrollment ce ON ce.user_id = u.id AND ce.tenant_id = u.tenant_id
           LEFT JOIN attendance_calculation ac ON ac.user_id = u.id
           WHERE ${conditions.join(' AND ')}
             AND u.deleted_at IS NULL
           GROUP BY u.id, u.full_name, u.email, u.user_type, u.status
           ORDER BY u.full_name
           LIMIT 5`,
          queryParams
        );

        return truncateResult(
          result.rows.map((r: Record<string, unknown>) => ({
            id: r.id,
            name: r.full_name,
            email: r.email,
            userType: r.user_type,
            status: r.status,
            activeEnrollments: Number(r.active_enrollments),
            completedEnrollments: Number(r.completed_enrollments),
            avgAttendance: Number(r.avg_attendance),
            hasAttendanceRisk: r.has_attendance_risk,
          }))
        );
      },
    }),

    getStudentAttendance: secure(ctx, {
      description:
        'Busca presenca/frequencia de um aluno especifico por nome ou ID. Use quando admin perguntar se um aluno e assiduo, tem faltas, frequencia de um aluno, presenca de um estudante.',
      requiredRole: 'admin',
      parameters: z.object({
        studentName: z.string().max(200).optional().describe('Nome do aluno (busca parcial)'),
        studentId: z.string().uuid().optional().describe('ID do aluno (exato)'),
      }),
      execute: async (params, client) => {
        if (!params.studentName && !params.studentId) {
          return { error: 'Informe nome ou ID do aluno' };
        }

        // Find the student first
        const userConditions: string[] = [
          'u.tenant_id = $1',
          'uc.company_id = ANY($2::uuid[])',
          'u.deleted_at IS NULL',
        ];
        const userParams: unknown[] = [ctx.tenantId, ctx.accessibleCompanyIds];

        if (params.studentId) {
          userParams.push(params.studentId);
          userConditions.push(`u.id = $${userParams.length}`);
        } else if (params.studentName) {
          userParams.push(`%${sanitizeSearchInput(params.studentName)}%`);
          userConditions.push(`u.full_name ILIKE $${userParams.length}`);
        }

        const students = await client.query(
          `SELECT u.id, u.full_name FROM "user" u
           JOIN user_company uc ON uc.user_id = u.id
           WHERE ${userConditions.join(' AND ')}
           LIMIT 3`,
          userParams
        );

        if (students.rows.length === 0) {
          return { error: `Nenhum aluno encontrado com o nome "${params.studentName || params.studentId}"` };
        }

        const studentIds = students.rows.map((r: Record<string, unknown>) => r.id);

        const result = await client.query(
          `SELECT
             u.full_name as student_name,
             ci.name as class_instance_name,
             COALESCE(s.title, col.title, ci.name) as content_name,
             COALESCE(ac.total_sessions, 0) as total_sessions,
             COALESCE(ac.attended_sessions, 0) as attended_sessions,
             COALESCE(ac.weighted_attendance_percentage, 0) as attendance_percentage,
             COALESCE(ac.min_required_percentage, 75) as min_required_percentage,
             COALESCE(ac.risk_level, 'low') as risk_level,
             COALESCE(ac.is_at_risk, false) as is_at_risk
           FROM class_enrollment ce
           JOIN "user" u ON u.id = ce.user_id
           JOIN class_instance ci ON ci.id = ce.class_instance_id
           LEFT JOIN series s ON s.id = ci.content_id AND ci.content_type = 'series'
           LEFT JOIN collection col ON col.id = ci.content_id AND ci.content_type = 'collection'
           LEFT JOIN attendance_calculation ac ON ac.user_id = ce.user_id AND ac.class_instance_id = ci.id
           WHERE ce.user_id = ANY($1::uuid[])
             AND ce.tenant_id = $2
             AND ce.status = 'enrolled'
             AND ci.deleted_at IS NULL
           ORDER BY u.full_name, content_name
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          [studentIds, ctx.tenantId]
        );

        return truncateResult(
          result.rows.map((r: Record<string, unknown>) => ({
            studentName: r.student_name,
            className: r.class_instance_name,
            contentName: r.content_name,
            totalSessions: Number(r.total_sessions),
            attendedSessions: Number(r.attended_sessions),
            attendancePercentage: Number(r.attendance_percentage),
            minRequired: Number(r.min_required_percentage),
            riskLevel: r.risk_level,
            isAtRisk: r.is_at_risk,
          }))
        );
      },
    }),

    getBIMetrics: secure(ctx, {
      description:
        'Busca metricas de BI (analytics educacional). Use quando admin perguntar sobre metricas agregadas, estatisticas gerais, KPIs, totais por periodo.',
      requiredRole: 'admin',
      parameters: z.object({
        metricPrefix: z
          .enum([
            'class_enrollment',
            'component',
            'collection',
            'series',
            'unit',
            'pathway',
            'class_instance',
            'entities',
            'company_event',
          ])
          .optional()
          .describe('Prefixo da metrica (opcional — se omitido, retorna todas)'),
        period: z
          .enum(['today', 'week', 'month', 'quarter', 'year', 'all'])
          .default('all')
          .describe('Periodo de analise'),
        classInstanceId: z.string().uuid().optional().describe('Filtrar por turma'),
        seriesId: z.string().uuid().optional().describe('Filtrar por disciplina'),
      }),
      execute: async (params, client) => {
        const periodType =
          params.period === 'today'
            ? 'daily'
            : params.period === 'week'
              ? 'weekly'
              : params.period === 'month'
                ? 'monthly'
                : 'total';

        const conditions: string[] = [
          'tenant_id = $1',
          'company_id = ANY($2::uuid[])',
          'period_type = $3',
        ];
        const queryParams: unknown[] = [ctx.tenantId, ctx.accessibleCompanyIds, periodType];

        if (params.metricPrefix) {
          queryParams.push(`${params.metricPrefix}%`);
          conditions.push(`metric_key LIKE $${queryParams.length}`);
        }

        const result = await client.query(
          `SELECT
             metric_key,
             SUM(metric_value) as total_value,
             COUNT(DISTINCT CASE WHEN actor_id IS NOT NULL THEN actor_id END) as distinct_actors
           FROM admin_entity_metrics
           WHERE ${conditions.join(' AND ')}
           GROUP BY metric_key
           ORDER BY metric_key
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          queryParams
        );

        return truncateResult({
          period: params.period,
          metrics: result.rows.map((r: Record<string, unknown>) => ({
            key: r.metric_key,
            value: Number(r.total_value),
            distinctActors: Number(r.distinct_actors),
          })),
        });
      },
    }),

    listAllCourses: secure(ctx, {
      description:
        'Lista todos os cursos (collections), trilhas (pathways) e disciplinas (series) da instituicao. Use quando admin perguntar "quantos cursos temos", "quais cursos existem", "lista de disciplinas".',
      requiredRole: 'admin',
      parameters: z.object({
        search: z.string().max(200).optional().describe('Busca por nome do curso/disciplina'),
        status: z
          .enum(['draft', 'published', 'archived'])
          .optional()
          .describe('Status do curso'),
      }),
      execute: async (params, client) => {
        const conditions: string[] = [
          'col.tenant_id = $1',
          'col.company_id = ANY($2::uuid[])',
          'col.deleted_at IS NULL',
        ];
        const queryParams: unknown[] = [ctx.tenantId, ctx.accessibleCompanyIds];

        if (params.search) {
          queryParams.push(`%${sanitizeSearchInput(params.search)}%`);
          conditions.push(`col.title ILIKE $${queryParams.length}`);
        }
        if (params.status) {
          queryParams.push(params.status);
          conditions.push(`col.status = $${queryParams.length}`);
        }

        const result = await client.query(
          `SELECT
             col.id, col.title, col.status,
             COUNT(DISTINCT p.id) as pathway_count,
             COUNT(DISTINCT s.id) as series_count,
             (SELECT COUNT(DISTINCT ce.user_id)
              FROM class_instance ci2
              JOIN class_enrollment ce ON ce.class_instance_id = ci2.id AND ce.status = 'enrolled'
              WHERE ci2.content_id = col.id AND ci2.content_type = 'collection' AND ci2.deleted_at IS NULL
             ) as enrolled_students
           FROM collection col
           LEFT JOIN pathway p ON p.collection_id = col.id AND p.deleted_at IS NULL
           LEFT JOIN series s ON s.pathway_id = p.id AND s.deleted_at IS NULL
           WHERE ${conditions.join(' AND ')}
           GROUP BY col.id, col.title, col.status
           ORDER BY col.title
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          queryParams
        );

        return truncateResult({
          totalCourses: result.rowCount,
          courses: result.rows.map((r: Record<string, unknown>) => ({
            id: r.id,
            title: r.title,
            status: r.status,
            pathways: Number(r.pathway_count),
            disciplines: Number(r.series_count),
            enrolledStudents: Number(r.enrolled_students),
          })),
        });
      },
    }),

    listAllStudents: secure(ctx, {
      description:
        'Lista alunos da instituicao com filtros. Use quando admin perguntar "quantos alunos temos", "alunos do sexo feminino", "alunos de uma turma", "lista de estudantes".',
      requiredRole: 'admin',
      parameters: z.object({
        search: z.string().max(200).optional().describe('Busca por nome do aluno'),
        gender: z.string().max(50).optional().describe('Filtrar por genero (ex: feminino, masculino)'),
        status: z
          .enum(['ingresso', 'egresso', 'evadido', 'trancado'])
          .optional()
          .describe('Status do aluno'),
        classInstanceId: z.string().uuid().optional().describe('Filtrar por turma'),
        countOnly: z
          .boolean()
          .default(false)
          .describe('Se true, retorna apenas contagem (mais rapido)'),
      }),
      execute: async (params, client) => {
        const conditions: string[] = [
          'u.tenant_id = $1',
          'uc.company_id = ANY($2::uuid[])',
          "u.user_type = 'student'",
          'u.deleted_at IS NULL',
        ];
        const queryParams: unknown[] = [ctx.tenantId, ctx.accessibleCompanyIds];

        if (params.search) {
          queryParams.push(`%${sanitizeSearchInput(params.search)}%`);
          conditions.push(`u.full_name ILIKE $${queryParams.length}`);
        }
        if (params.gender) {
          queryParams.push(`%${sanitizeSearchInput(params.gender)}%`);
          conditions.push(`u.gender ILIKE $${queryParams.length}`);
        }
        if (params.status) {
          queryParams.push(params.status);
          conditions.push(`u.status = $${queryParams.length}`);
        }
        if (params.classInstanceId) {
          queryParams.push(params.classInstanceId);
          conditions.push(
            `EXISTS (SELECT 1 FROM class_enrollment ce WHERE ce.user_id = u.id AND ce.class_instance_id = $${queryParams.length} AND ce.status = 'enrolled')`
          );
        }

        if (params.countOnly) {
          const countResult = await client.query(
            `SELECT
               COUNT(DISTINCT u.id) as total,
               COUNT(DISTINCT u.id) FILTER (WHERE u.gender ILIKE '%feminino%') as female_count,
               COUNT(DISTINCT u.id) FILTER (WHERE u.gender ILIKE '%masculino%') as male_count
             FROM "user" u
             JOIN user_company uc ON uc.user_id = u.id
             WHERE ${conditions.join(' AND ')}`,
            queryParams
          );
          const row = countResult.rows[0];
          return {
            totalStudents: Number(row.total),
            femaleStudents: Number(row.female_count),
            maleStudents: Number(row.male_count),
          };
        }

        const result = await client.query(
          `SELECT DISTINCT
             u.id, u.full_name, u.email, u.gender, u.status,
             COUNT(DISTINCT ce.id) FILTER (WHERE ce.status = 'enrolled') as active_enrollments
           FROM "user" u
           JOIN user_company uc ON uc.user_id = u.id
           LEFT JOIN class_enrollment ce ON ce.user_id = u.id AND ce.tenant_id = u.tenant_id
           WHERE ${conditions.join(' AND ')}
           GROUP BY u.id, u.full_name, u.email, u.gender, u.status
           ORDER BY u.full_name
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          queryParams
        );

        return truncateResult({
          totalReturned: result.rowCount,
          students: result.rows.map((r: Record<string, unknown>) => ({
            id: r.id,
            name: r.full_name,
            email: r.email,
            gender: r.gender,
            status: r.status,
            activeEnrollments: Number(r.active_enrollments),
          })),
        });
      },
    }),

    getInstitutionStats: secure(ctx, {
      description:
        'Busca estatisticas gerais da instituicao (total alunos, cursos, turmas, taxas de conclusao). Use quando admin perguntar "como esta a instituicao", "numeros gerais", "visao geral", "dashboard".',
      requiredRole: 'admin',
      parameters: z.object({}),
      execute: async (_params, client) => {
        const baseParams = [ctx.tenantId, ctx.accessibleCompanyIds];

        // Sequential queries — PoolClient doesn't support parallel queries
        const students = await client.query(
          `SELECT
             COUNT(DISTINCT u.id) as total,
             COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'ingresso') as active
           FROM "user" u
           JOIN user_company uc ON uc.user_id = u.id
           WHERE u.tenant_id = $1 AND uc.company_id = ANY($2::uuid[])
             AND u.user_type = 'student' AND u.deleted_at IS NULL`,
          baseParams
        );
        const courses = await client.query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE status = 'published') as published
           FROM collection
           WHERE tenant_id = $1 AND company_id = ANY($2::uuid[]) AND deleted_at IS NULL`,
          baseParams
        );
        const classes = await client.query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE status = 'active') as active
           FROM class_instance
           WHERE tenant_id = $1 AND company_id = ANY($2::uuid[]) AND deleted_at IS NULL`,
          baseParams
        );
        const enrollments = await client.query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE ce.status = 'enrolled') as enrolled,
             COUNT(*) FILTER (WHERE ce.status = 'completed') as completed,
             COUNT(*) FILTER (WHERE ce.status = 'dropped') as dropped
           FROM class_enrollment ce
           JOIN class_instance ci ON ci.id = ce.class_instance_id
           WHERE ce.tenant_id = $1 AND ci.company_id = ANY($2::uuid[])`,
          baseParams
        );

        const s = students.rows[0];
        const c = courses.rows[0];
        const cl = classes.rows[0];
        const e = enrollments.rows[0];
        const totalEnroll = Number(e.total);
        const completedEnroll = Number(e.completed);

        return {
          students: { total: Number(s.total), active: Number(s.active) },
          courses: { total: Number(c.total), published: Number(c.published) },
          classes: { total: Number(cl.total), active: Number(cl.active) },
          enrollments: {
            total: totalEnroll,
            enrolled: Number(e.enrolled),
            completed: completedEnroll,
            dropped: Number(e.dropped),
            completionRate: totalEnroll > 0 ? Math.round((completedEnroll / totalEnroll) * 100) : 0,
          },
        };
      },
    }),

    getAccessLogs: secure(ctx, {
      description:
        'Busca logs de acesso e atividade dos usuarios (quem acessou, quando, o que fez). Use quando admin perguntar "quem acessou ontem", "atividade recente", "log de acesso", "quem usou a plataforma".',
      requiredRole: 'admin',
      parameters: z.object({
        studentName: z.string().max(200).optional().describe('Filtrar por nome do aluno'),
        verb: z
          .enum(['completed', 'started', 'interacted', 'paused', 'blurred'])
          .optional()
          .describe('Tipo de acao'),
        objectType: z
          .enum(['video', 'quiz', 'ai_tutor', 'system', 'discussion', 'assignment'])
          .optional()
          .describe('Tipo de objeto'),
        hoursAgo: z
          .number()
          .min(1)
          .max(720)
          .default(24)
          .describe('Buscar eventos das ultimas N horas (padrao 24)'),
      }),
      execute: async (params, client) => {
        const conditions: string[] = [
          'ee.tenant_id = $1',
          'ee.actor_id IN (SELECT uc2.user_id FROM user_company uc2 WHERE uc2.company_id = ANY($2::uuid[]))',
          `ee.timestamp >= NOW() - INTERVAL '1 hour' * $3`,
        ];
        const queryParams: unknown[] = [ctx.tenantId, ctx.accessibleCompanyIds, params.hoursAgo];

        if (params.studentName) {
          queryParams.push(`%${sanitizeSearchInput(params.studentName)}%`);
          conditions.push(
            `ee.actor_id IN (SELECT id FROM "user" WHERE full_name ILIKE $${queryParams.length} AND tenant_id = $1)`
          );
        }
        if (params.verb) {
          queryParams.push(params.verb);
          conditions.push(`ee.verb = $${queryParams.length}`);
        }
        if (params.objectType) {
          queryParams.push(params.objectType);
          conditions.push(`ee.object_type = $${queryParams.length}`);
        }

        const result = await client.query(
          `SELECT
             ee.timestamp, ee.verb, ee.object_type, ee.object_id,
             ee.result_score, ee.result_success, ee.result_duration,
             u.full_name as student_name
           FROM experience_events ee
           LEFT JOIN "user" u ON u.id = ee.actor_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY ee.timestamp DESC
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          queryParams
        );

        return truncateResult({
          period: `ultimas ${params.hoursAgo} horas`,
          totalEvents: result.rowCount,
          events: result.rows.map((r: Record<string, unknown>) => ({
            timestamp: r.timestamp,
            studentName: r.student_name,
            action: r.verb,
            objectType: r.object_type,
            score: r.result_score,
            success: r.result_success,
            durationSeconds: r.result_duration,
          })),
        });
      },
    }),

    getPendingGrading: secure(ctx, {
      description:
        'Lista avaliacoes submetidas aguardando correcao. Use quando professor ou admin perguntar "provas para corrigir", "avaliacoes pendentes", "o que tenho que corrigir".',
      requiredRole: 'professor',
      parameters: z.object({
        classInstanceId: z.string().uuid().optional().describe('Filtrar por turma'),
      }),
      execute: async (params, client) => {
        const conditions: string[] = [
          'aa.tenant_id = $1',
          'aa.company_id = ANY($2::uuid[])',
          "aa.status = 'submitted'",
        ];
        const queryParams: unknown[] = [ctx.tenantId, ctx.accessibleCompanyIds];

        if (params.classInstanceId) {
          queryParams.push(params.classInstanceId);
          conditions.push(
            `comp.unit_id IN (
              SELECT u2.id FROM unit u2
              JOIN series s2 ON s2.id = u2.series_id
              JOIN pathway p2 ON p2.id = s2.pathway_id
              JOIN class_instance ci2 ON ci2.content_id = p2.collection_id AND ci2.content_type = 'collection'
              WHERE ci2.id = $${queryParams.length}
            )`
          );
        }

        const result = await client.query(
          `SELECT
             aa.id, aa.submitted_at, aa.attempt_number,
             comp.title as component_title,
             u.full_name as student_name,
             s.title as series_title
           FROM assessment_attempt aa
           JOIN component comp ON comp.id = aa.component_id
           LEFT JOIN unit ut ON ut.id = comp.unit_id
           LEFT JOIN series s ON s.id = ut.series_id
           LEFT JOIN "user" u ON u.id = aa.student_user_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY aa.submitted_at ASC
           LIMIT ${TOOL_LIMITS.MAX_ROWS}`,
          queryParams
        );

        return truncateResult({
          pendingCount: result.rowCount,
          assessments: result.rows.map((r: Record<string, unknown>) => ({
            id: r.id,
            componentTitle: r.component_title,
            studentName: r.student_name,
            seriesTitle: r.series_title,
            submittedAt: r.submitted_at,
            attemptNumber: Number(r.attempt_number),
          })),
        });
      },
    }),

    getTeacherActivity: secure(ctx, {
      description:
        'Busca atividade de comunicacao de um professor com alunos (mensagens enviadas/recebidas). Use quando admin perguntar "comunicacao do professor X", "como anda o professor", "mensagens do professor".',
      requiredRole: 'admin',
      parameters: z.object({
        teacherName: z.string().max(200).describe('Nome do professor para buscar'),
        daysAgo: z
          .number()
          .min(1)
          .max(90)
          .default(30)
          .describe('Periodo em dias (padrao 30)'),
      }),
      execute: async (params, client) => {
        const sanitizedName = sanitizeSearchInput(params.teacherName);

        // Find teacher(s) matching the name
        const teachers = await client.query(
          `SELECT u.id, u.full_name
           FROM "user" u
           JOIN user_company uc ON uc.user_id = u.id
           WHERE u.tenant_id = $1 AND uc.company_id = ANY($2::uuid[])
             AND u.full_name ILIKE $3
             AND u.user_type = 'employee'
             AND u.deleted_at IS NULL
           LIMIT 5`,
          [ctx.tenantId, ctx.accessibleCompanyIds, `%${sanitizedName}%`]
        );

        if (teachers.rows.length === 0) {
          return { error: `Nenhum professor encontrado com o nome "${params.teacherName}"` };
        }

        const teacherIds = teachers.rows.map((r: Record<string, unknown>) => r.id);

        const activity = await client.query(
          `SELECT
             u.full_name as teacher_name,
             COUNT(cm.id) as messages_sent,
             COUNT(DISTINCT c.id) as conversations,
             MAX(cm.created_at) as last_message_at,
             COUNT(DISTINCT c.destination_id) FILTER (WHERE c.destination_type = 'user') as direct_students,
             COUNT(DISTINCT c.destination_id) FILTER (WHERE c.destination_type = 'class') as class_conversations
           FROM conversation_message cm
           JOIN conversation c ON c.id = cm.conversation_id AND c.tenant_id = $1
           JOIN "user" u ON u.id = cm.sender_id
           WHERE cm.sender_id = ANY($2::uuid[])
             AND cm.created_at >= NOW() - INTERVAL '1 day' * $3
           GROUP BY u.id, u.full_name
           ORDER BY messages_sent DESC`,
          [ctx.tenantId, teacherIds, params.daysAgo]
        );

        return truncateResult({
          period: `ultimos ${params.daysAgo} dias`,
          teachers: activity.rows.length > 0
            ? activity.rows.map((r: Record<string, unknown>) => ({
                name: r.teacher_name,
                messagesSent: Number(r.messages_sent),
                conversations: Number(r.conversations),
                lastMessageAt: r.last_message_at,
                directStudents: Number(r.direct_students),
                classConversations: Number(r.class_conversations),
              }))
            : teachers.rows.map((r: Record<string, unknown>) => ({
                name: r.full_name,
                messagesSent: 0,
                conversations: 0,
                lastMessageAt: null,
                directStudents: 0,
                classConversations: 0,
              })),
        });
      },
    }),

    queryData: secure(ctx, {
      description: `Ferramenta flexivel para consultar QUALQUER dado do sistema via SQL.
Use quando NENHUMA outra ferramenta atende a pergunta, ou quando o admin pedir correlacoes, rankings, comparacoes, ou cruzamentos entre dados.
Exemplos: "qual aluno tem mais faltas?", "correlacao entre presenca e nota", "turmas com evasao acima de 20%", "evolucao de matriculas por mes".
Voce DEVE gerar um SELECT valido seguindo o schema e regras abaixo.
${QUERYABLE_SCHEMA}`,
      requiredRole: 'admin',
      parameters: z.object({
        sql: z
          .string()
          .max(2000)
          .describe(
            'Query SELECT PostgreSQL. DEVE usar $1 para tenant_id e $2 para accessibleCompanyIds (uuid[]). LIMIT 50 max. Apenas SELECT.'
          ),
        explanation: z
          .string()
          .max(300)
          .describe('Explicacao curta do que a query faz (para auditoria)'),
      }),
      execute: async (params, client) => {
        // Validate safety
        const validation = validateQuerySafety(params.sql);
        if (!validation.safe) {
          return { error: `Query rejeitada: ${validation.reason}` };
        }

        // Force LIMIT if not present
        let sql = params.sql.trim();
        if (!/\bLIMIT\b/i.test(sql)) {
          sql += ' LIMIT 50';
        }

        // Enforce max LIMIT 50
        const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);
        if (limitMatch && Number(limitMatch[1]) > 50) {
          sql = sql.replace(/\bLIMIT\s+\d+/i, 'LIMIT 50');
        }

        try {
          const result = await client.query(sql, [ctx.tenantId, ctx.accessibleCompanyIds]);

          // Log for audit trail
          console.log(
            `[orch_queryData] user=${ctx.userId} explanation="${params.explanation}" rows=${result.rowCount}`
          );

          return truncateResult({
            rowCount: result.rowCount,
            rows: result.rows,
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'unknown';
          console.warn(`[orch_queryData] SQL error: ${msg}\nSQL: ${params.sql}`);

          // Return friendly error without leaking internals
          if (msg.includes('does not exist')) {
            return { error: 'Tabela ou coluna nao encontrada. Verifique os nomes.' };
          }
          if (msg.includes('statement timeout') || msg.includes('canceling statement')) {
            return { error: 'Query muito pesada. Tente com filtros mais especificos ou LIMIT menor.' };
          }
          return { error: 'Erro ao executar a consulta. Tente reformular a pergunta.' };
        }
      },
    }),
  };
}
