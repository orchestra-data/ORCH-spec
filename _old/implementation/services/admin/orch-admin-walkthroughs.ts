import type { PoolClient } from 'pg';
import { z } from 'zod';

interface WalkthroughStep {
  order: number;
  selector: string;
  title: string;
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

interface Walkthrough {
  id: string;
  title: string;
  description: string;
  route: string;
  triggerIntent: string[];
  triggerStuck: boolean;
  steps: WalkthroughStep[];
  timesUsed: number;
  avgCompletionPct: number;
}

interface WalkthroughUsage {
  walkthroughId: string;
  userId: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  stepReached: number;
  startedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Seed data — 10 full + 15 TODO stubs
// ---------------------------------------------------------------------------

const WALKTHROUGH_SEEDS: Array<{
  id: string;
  title: string;
  description: string;
  route: string;
  trigger_intent: string[];
  trigger_stuck: boolean;
  steps: WalkthroughStep[];
}> = [
  {
    id: 'create-student',
    title: 'Cadastrar Aluno',
    description: 'Passo a passo para cadastrar um novo aluno na plataforma.',
    route: '/students/new',
    trigger_intent: ['cadastrar aluno', 'novo aluno', 'add student', 'criar aluno'],
    trigger_stuck: true,
    steps: [
      { order: 1, selector: '[data-tour="student-name"]', title: 'Nome do Aluno', content: 'Preencha o nome completo do aluno.', placement: 'bottom' },
      { order: 2, selector: '[data-tour="student-cpf"]', title: 'CPF', content: 'Informe o CPF do aluno (apenas numeros).', placement: 'bottom' },
      { order: 3, selector: '[data-tour="student-email"]', title: 'Email', content: 'Email para acesso a plataforma.', placement: 'bottom' },
      { order: 4, selector: '[data-tour="student-class"]', title: 'Turma', content: 'Selecione a turma do aluno.', placement: 'right' },
      { order: 5, selector: '[data-tour="submit-btn"]', title: 'Salvar', content: 'Clique para finalizar o cadastro.', placement: 'top' },
    ],
  },
  {
    id: 'bulk-import',
    title: 'Importar Planilha',
    description: 'Como importar alunos em lote via planilha Excel.',
    route: '/students/import',
    trigger_intent: ['importar', 'planilha', 'excel', 'importar alunos', 'upload csv'],
    trigger_stuck: true,
    steps: [
      { order: 1, selector: '[data-tour="download-template"]', title: 'Baixar Modelo', content: 'Baixe o modelo de planilha primeiro.', placement: 'bottom' },
      { order: 2, selector: '[data-tour="upload-area"]', title: 'Enviar Arquivo', content: 'Arraste ou clique para enviar a planilha preenchida.', placement: 'bottom' },
      { order: 3, selector: '[data-tour="preview-table"]', title: 'Conferir Dados', content: 'Revise os dados antes de confirmar.', placement: 'top' },
      { order: 4, selector: '[data-tour="import-btn"]', title: 'Importar', content: 'Confirme a importacao.', placement: 'top' },
    ],
  },
  {
    id: 'create-class',
    title: 'Criar Turma',
    description: 'Como criar uma nova turma.',
    route: '/classes/new',
    trigger_intent: ['criar turma', 'nova turma', 'new class', 'adicionar turma'],
    trigger_stuck: true,
    steps: [
      { order: 1, selector: '[data-tour="class-name"]', title: 'Nome da Turma', content: 'Informe o nome ou codigo da turma.', placement: 'bottom' },
      { order: 2, selector: '[data-tour="class-period"]', title: 'Periodo', content: 'Selecione manha, tarde ou noite.', placement: 'right' },
      { order: 3, selector: '[data-tour="class-teacher"]', title: 'Professor', content: 'Atribua o professor responsavel.', placement: 'bottom' },
      { order: 4, selector: '[data-tour="class-submit"]', title: 'Criar', content: 'Finalize a criacao da turma.', placement: 'top' },
    ],
  },
  {
    id: 'manage-grades',
    title: 'Lancar Notas',
    description: 'Como lancar notas de uma turma.',
    route: '/grades',
    trigger_intent: ['lancar nota', 'notas', 'grade', 'avaliar alunos', 'digitar notas'],
    trigger_stuck: true,
    steps: [
      { order: 1, selector: '[data-tour="grade-class"]', title: 'Selecionar Turma', content: 'Escolha a turma para lancar notas.', placement: 'bottom' },
      { order: 2, selector: '[data-tour="grade-assessment"]', title: 'Avaliacao', content: 'Selecione a avaliacao (prova, trabalho, etc.).', placement: 'bottom' },
      { order: 3, selector: '[data-tour="grade-table"]', title: 'Notas', content: 'Preencha as notas de cada aluno.', placement: 'top' },
      { order: 4, selector: '[data-tour="grade-save"]', title: 'Salvar', content: 'Salve as notas lancadas.', placement: 'top' },
    ],
  },
  {
    id: 'create-assessment',
    title: 'Criar Avaliacao',
    description: 'Como criar uma nova avaliacao com questoes.',
    route: '/assessments/new',
    trigger_intent: ['criar avaliacao', 'nova prova', 'create assessment', 'fazer prova'],
    trigger_stuck: true,
    steps: [
      { order: 1, selector: '[data-tour="assessment-title"]', title: 'Titulo', content: 'De um titulo para a avaliacao.', placement: 'bottom' },
      { order: 2, selector: '[data-tour="assessment-type"]', title: 'Tipo', content: 'Selecione: prova, trabalho, quiz, etc.', placement: 'right' },
      { order: 3, selector: '[data-tour="assessment-questions"]', title: 'Questoes', content: 'Adicione as questoes da avaliacao.', placement: 'bottom' },
      { order: 4, selector: '[data-tour="assessment-publish"]', title: 'Publicar', content: 'Publique para os alunos.', placement: 'top' },
    ],
  },
  {
    id: 'view-dashboard',
    title: 'Usar o Dashboard',
    description: 'Entenda os indicadores do painel principal.',
    route: '/dashboard',
    trigger_intent: ['dashboard', 'painel', 'indicadores', 'metricas', 'visao geral'],
    trigger_stuck: false,
    steps: [
      { order: 1, selector: '[data-tour="dash-students"]', title: 'Total de Alunos', content: 'Numero de alunos ativos na instituicao.', placement: 'bottom' },
      { order: 2, selector: '[data-tour="dash-attendance"]', title: 'Frequencia', content: 'Taxa de frequencia geral.', placement: 'bottom' },
      { order: 3, selector: '[data-tour="dash-risk"]', title: 'Alunos em Risco', content: 'Indicador de alunos com risco de evasao.', placement: 'left' },
      { order: 4, selector: '[data-tour="dash-alerts"]', title: 'Alertas', content: 'Alertas proativos que precisam de atencao.', placement: 'bottom' },
    ],
  },
  {
    id: 'configure-ai',
    title: 'Configurar IA',
    description: 'Como configurar as funcionalidades de IA da plataforma.',
    route: '/settings/ai',
    trigger_intent: ['configurar ia', 'settings ai', 'inteligencia artificial', 'orch config'],
    trigger_stuck: true,
    steps: [
      { order: 1, selector: '[data-tour="ai-toggle"]', title: 'Ativar IA', content: 'Ative ou desative funcionalidades de IA.', placement: 'right' },
      { order: 2, selector: '[data-tour="ai-model"]', title: 'Modelo', content: 'Escolha o modelo de IA preferido.', placement: 'bottom' },
      { order: 3, selector: '[data-tour="ai-quota"]', title: 'Cota', content: 'Defina o limite de tokens mensais.', placement: 'bottom' },
      { order: 4, selector: '[data-tour="ai-save"]', title: 'Salvar', content: 'Aplique as configuracoes.', placement: 'top' },
    ],
  },
  {
    id: 'manage-attendance',
    title: 'Registrar Frequencia',
    description: 'Como registrar presenca/ausencia dos alunos.',
    route: '/attendance',
    trigger_intent: ['frequencia', 'presenca', 'falta', 'chamada', 'attendance'],
    trigger_stuck: true,
    steps: [
      { order: 1, selector: '[data-tour="att-class"]', title: 'Turma', content: 'Selecione a turma.', placement: 'bottom' },
      { order: 2, selector: '[data-tour="att-date"]', title: 'Data', content: 'Escolha a data da chamada.', placement: 'bottom' },
      { order: 3, selector: '[data-tour="att-list"]', title: 'Lista', content: 'Marque presenca ou falta para cada aluno.', placement: 'top' },
      { order: 4, selector: '[data-tour="att-save"]', title: 'Salvar', content: 'Confirme o registro de frequencia.', placement: 'top' },
    ],
  },
  {
    id: 'manage-enrollments',
    title: 'Gerenciar Matriculas',
    description: 'Como aprovar ou recusar solicitacoes de matricula.',
    route: '/admissions',
    trigger_intent: ['matricula', 'enrollment', 'solicitacao', 'aprovacao matricula'],
    trigger_stuck: false,
    steps: [
      { order: 1, selector: '[data-tour="enroll-filter"]', title: 'Filtrar', content: 'Filtre por status: pendente, aprovada, recusada.', placement: 'bottom' },
      { order: 2, selector: '[data-tour="enroll-details"]', title: 'Ver Detalhes', content: 'Clique na solicitacao para ver dados completos.', placement: 'right' },
      { order: 3, selector: '[data-tour="enroll-approve"]', title: 'Aprovar', content: 'Aprove a matricula.', placement: 'left' },
      { order: 4, selector: '[data-tour="enroll-reject"]', title: 'Recusar', content: 'Recuse com justificativa.', placement: 'left' },
    ],
  },
  {
    id: 'generate-reports',
    title: 'Gerar Relatorios',
    description: 'Como gerar relatorios de desempenho e frequencia.',
    route: '/reports',
    trigger_intent: ['relatorio', 'report', 'gerar relatorio', 'exportar relatorio'],
    trigger_stuck: false,
    steps: [
      { order: 1, selector: '[data-tour="report-type"]', title: 'Tipo', content: 'Escolha: desempenho, frequencia, risco, etc.', placement: 'bottom' },
      { order: 2, selector: '[data-tour="report-filter"]', title: 'Filtros', content: 'Selecione turma, periodo e outros filtros.', placement: 'bottom' },
      { order: 3, selector: '[data-tour="report-generate"]', title: 'Gerar', content: 'Clique para gerar o relatorio.', placement: 'top' },
      { order: 4, selector: '[data-tour="report-export"]', title: 'Exportar', content: 'Baixe em PDF ou Excel.', placement: 'top' },
    ],
  },
  // TODO: 15 remaining walkthroughs to seed
  // - manage-teachers: Gerenciar Professores (/teachers)
  // - create-course: Criar Curso (/courses/new)
  // - manage-curriculum: Gerenciar Grade Curricular (/curriculum)
  // - configure-notifications: Configurar Notificacoes (/settings/notifications)
  // - manage-roles: Gerenciar Permissoes (/settings/roles)
  // - view-student-profile: Ver Perfil do Aluno (/students/:id)
  // - manage-calendar: Gerenciar Calendario (/calendar)
  // - create-announcement: Criar Comunicado (/announcements/new)
  // - manage-documents: Gerenciar Documentos (/documents)
  // - view-analytics: Ver Analytics (/analytics)
  // - configure-tenant: Configurar Instituicao (/settings/tenant)
  // - manage-integrations: Gerenciar Integracoes (/settings/integrations)
  // - create-quiz: Criar Quiz Rapido (/quizzes/new)
  // - manage-library: Gerenciar Biblioteca (/library)
  // - configure-gamification: Configurar Gamificacao (/settings/gamification)
];

class OrchAdminWalkthroughs {
  /**
   * List all available walkthroughs, optionally filtered by route.
   */
  async getAvailable(client: PoolClient, params: { tenantId: string; route?: string }): Promise<Walkthrough[]> {
    let query = `SELECT * FROM orch_admin_walkthrough WHERE tenant_id = $1`;
    const queryParams: unknown[] = [params.tenantId];

    if (params.route) {
      query += ` AND route = $2`;
      queryParams.push(params.route);
    }

    query += ` ORDER BY times_used DESC`;

    const { rows } = await client.query(query, queryParams);
    return rows.map(this.mapRow);
  }

  /**
   * Get walkthroughs matching a specific route.
   */
  async getForRoute(client: PoolClient, route: string): Promise<Walkthrough[]> {
    const { rows } = await client.query(
      `SELECT * FROM orch_admin_walkthrough WHERE route = $1 ORDER BY times_used DESC`,
      [route]
    );
    return rows.map(this.mapRow);
  }

  /**
   * Start a walkthrough: create usage record and increment times_used.
   */
  async start(client: PoolClient, params: { walkthroughId: string; userId: string }): Promise<WalkthroughUsage> {
    await client.query(
      `UPDATE orch_admin_walkthrough SET times_used = times_used + 1 WHERE id = $1`,
      [params.walkthroughId]
    );

    const { rows } = await client.query(
      `INSERT INTO orch_admin_walkthrough_usage (walkthrough_id, user_id, status, step_reached)
       VALUES ($1, $2, 'in_progress', 0)
       RETURNING *`,
      [params.walkthroughId, params.userId]
    );

    return {
      walkthroughId: rows[0].walkthrough_id,
      userId: rows[0].user_id,
      status: rows[0].status,
      stepReached: rows[0].step_reached,
      startedAt: rows[0].created_at,
      completedAt: null,
    };
  }

  /**
   * Complete a walkthrough: set status and update avg completion.
   */
  async complete(client: PoolClient, params: { walkthroughId: string; userId: string }): Promise<void> {
    await client.query(
      `UPDATE orch_admin_walkthrough_usage
       SET status = 'completed', completed_at = NOW()
       WHERE walkthrough_id = $1 AND user_id = $2 AND status = 'in_progress'`,
      [params.walkthroughId, params.userId]
    );

    // Update avg completion percentage on walkthrough
    await client.query(
      `UPDATE orch_admin_walkthrough w
       SET avg_completion_pct = (
         SELECT (COUNT(*) FILTER (WHERE status = 'completed')::float / NULLIF(COUNT(*), 0) * 100)
         FROM orch_admin_walkthrough_usage WHERE walkthrough_id = w.id
       )
       WHERE id = $1`,
      [params.walkthroughId]
    );
  }

  /**
   * Abandon a walkthrough: set status and record how far the user got.
   */
  async abandon(client: PoolClient, params: { walkthroughId: string; userId: string; stepReached: number }): Promise<void> {
    await client.query(
      `UPDATE orch_admin_walkthrough_usage
       SET status = 'abandoned', step_reached = $3, completed_at = NOW()
       WHERE walkthrough_id = $1 AND user_id = $2 AND status = 'in_progress'`,
      [params.walkthroughId, params.userId, params.stepReached]
    );
  }

  /**
   * Suggest walkthroughs by matching trigger_intent array against a user intent string.
   */
  async suggestByIntent(client: PoolClient, intent: string): Promise<Walkthrough[]> {
    const normalized = intent.toLowerCase().trim();
    const { rows } = await client.query(
      `SELECT * FROM orch_admin_walkthrough
       WHERE EXISTS (
         SELECT 1 FROM unnest(trigger_intent) AS ti
         WHERE $1 LIKE '%' || ti || '%' OR ti LIKE '%' || $1 || '%'
       )
       ORDER BY times_used DESC
       LIMIT 3`,
      [normalized]
    );
    return rows.map(this.mapRow);
  }

  /**
   * Suggest walkthroughs for a stuck user: find those with trigger_stuck=true for the route.
   */
  async suggestWhenStuck(client: PoolClient, route: string): Promise<Walkthrough[]> {
    const { rows } = await client.query(
      `SELECT * FROM orch_admin_walkthrough
       WHERE trigger_stuck = true AND route = $1
       ORDER BY times_used DESC`,
      [route]
    );
    return rows.map(this.mapRow);
  }

  /**
   * Upsert seed walkthroughs for a tenant.
   */
  async seedWalkthroughs(client: PoolClient, tenantId: string): Promise<{ seeded: number }> {
    let seeded = 0;

    for (const seed of WALKTHROUGH_SEEDS) {
      await client.query(
        `INSERT INTO orch_admin_walkthrough
           (id, tenant_id, title, description, route, trigger_intent, trigger_stuck, steps, times_used, avg_completion_pct)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           route = EXCLUDED.route,
           trigger_intent = EXCLUDED.trigger_intent,
           trigger_stuck = EXCLUDED.trigger_stuck,
           steps = EXCLUDED.steps`,
        [
          seed.id,
          tenantId,
          seed.title,
          seed.description,
          seed.route,
          seed.trigger_intent,
          seed.trigger_stuck,
          JSON.stringify(seed.steps),
        ]
      );
      seeded++;
    }

    return { seeded };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private mapRow(row: Record<string, unknown>): Walkthrough {
    return {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      route: row.route as string,
      triggerIntent: row.trigger_intent as string[],
      triggerStuck: row.trigger_stuck as boolean,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps as WalkthroughStep[],
      timesUsed: row.times_used as number,
      avgCompletionPct: row.avg_completion_pct as number,
    };
  }
}

export const orchAdminWalkthroughs = new OrchAdminWalkthroughs();
