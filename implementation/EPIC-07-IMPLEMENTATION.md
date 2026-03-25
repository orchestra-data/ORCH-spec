# EPIC-07: Agentes Expandidos + Placeholders — Guia de Implementacao Cirurgico

**Para:** Giuseppe "King Witcher"
**Stack:** Express 5 + React 19 monorepo
**Codebase:** `C:/Projetos IA/Plataforma Cogedu/localhost/cogedu-dev-v6/cogedu-main/`
**Pontos totais:** 34 pts (3 + 8 + 8 + 5 + 2 + 3 + 5)
**Prazo estimado:** 2-3 semanas
**Status:** PRONTO PARA IMPLEMENTACAO

---

## DEPENDENCIAS

EPIC-07 depende de EPIC-01 a EPIC-03 (ecossistema core funcionando). Antes de comecar, validar:

- Hub de agentes operacional (EPIC-01)
- Socrates, Ebbinghaus, Comenius funcionando (EPIC-02)
- Foucault, Taylor, Bloom, Gardner ativos (EPIC-03)
- pgvector habilitado
- orchLLMService disponivel

```bash
# 1. Tabelas orch_* existentes
psql -d dev -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'orch_%';"
# Deve retornar >= 22

# 2. pgvector
psql -d dev -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
# Deve retornar 1 row

# 3. Hub respondendo
curl -s http://localhost:3000/api/v1/orch/hub/health | jq .status
# Deve retornar "ok"

# 4. LLM key configurada
echo $GOOGLE_GENERATIVE_AI_API_KEY
```

---

## STORY-07.1: Migration SQL — 7 Novas Tabelas (3 pts, Database)

**Tempo estimado:** 30 minutos
**Complexidade:** Baixa
**Dependencias:** Migrations EPIC-01 a EPIC-04 rodadas

### O que criar

Nenhum arquivo novo. A migration ja esta pronta.

### Passo a passo

**1. Copiar migration para o diretorio correto:**

```bash
cp "implementation/migrations/1942000006--orch_expansion.sql" \
   apps/api/libs/migrations/identity/1942000006--orch_expansion.sql
```

**2. Rodar a migration:**

```bash
# Via script do monorepo (preferido):
npm run migrate

# Ou manualmente:
psql -d dev -f apps/api/libs/migrations/identity/1942000006--orch_expansion.sql
```

**3. Validar as 7 novas tabelas:**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN (
  'orch_admission_lead',
  'orch_onboarding_progress',
  'orch_case_study',
  'orch_case_discussion',
  'orch_safety_flag',
  'orch_zpd_assessment',
  'orch_accessibility_preference'
)
ORDER BY table_name;
-- Deve retornar EXATAMENTE 7 rows
```

**4. Validar total orch_*:**

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'orch_%';
-- Deve retornar 29 (22 anteriores + 7 EPIC-07)
```

**5. Validar HNSW index (busca vetorial de cases):**

```sql
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_case_study_embedding';
-- Deve retornar 1 row
```

**6. Validar constraints:**

```sql
-- Safety flag types
SELECT conname FROM pg_constraint
WHERE conrelid = 'orch_safety_flag'::regclass AND contype = 'c';
-- Deve mostrar checks para flag_type e severity

-- Lead status
SELECT conname FROM pg_constraint
WHERE conrelid = 'orch_admission_lead'::regclass AND contype = 'c';
-- Deve mostrar check para status IN ('new', 'contacted', 'qualified', 'enrolled', 'lost')
```

### Troubleshooting

| Problema | Solucao |
|----------|---------|
| `type "vector" does not exist` | `CREATE EXTENSION IF NOT EXISTS vector;` |
| `relation "user" does not exist` | Migrations base nao rodaram. Rodar todas na ordem. |
| `duplicate table` | Migration ja rodou. Seguro — usa `CREATE TABLE IF NOT EXISTS`. |

### Definicao de pronto

- [ ] 7 tabelas criadas e visiveis no `\dt orch_*`
- [ ] Total orch_* = 29
- [ ] HNSW index ativo em `orch_case_study`
- [ ] FKs apontando para `"user"(id)` sem erro
- [ ] Unique constraints em onboarding, zpd e accessibility

---

## STORY-07.2: Heimdall — Admission + Onboarding (8 pts, Full-stack)

**Tempo estimado:** 3-4 dias
**Complexidade:** Alta
**Dependencias:** STORY-07.1 completa

### Conceito

Heimdall opera em dois modos:

- **PRE mode (sem auth):** Chat consultivo na landing page para leads. Lead scoring automatico.
- **POST mode (com auth):** Onboarding gamificado de 30 dias para novos alunos.

### O que criar

**Backend — 3 arquivos:**

| Arquivo | Path | Descricao |
|---------|------|-----------|
| Service | `apps/api/src/modules/orch/agents/orch-heimdall.ts` | Copiar de `implementation/services/agents/orch-heimdall.ts` |
| Routes | `apps/api/src/modules/orch/routes/orch-heimdall.routes.ts` | 7 endpoints |
| Hub integration | Registrar no Hub para intent routing | |

**Frontend — 2 componentes:**

| Componente | Path | Descricao |
|------------|------|-----------|
| AdmissionChat | `apps/client/src/pages/admission/AdmissionChat.tsx` | Landing page, SEM login |
| OnboardingChecklist | `apps/client/src/components/orch/OnboardingChecklist.tsx` | Dashboard aluno |

### Passo a passo — Backend

**1. Copiar service:**

```bash
cp "implementation/services/agents/orch-heimdall.ts" \
   apps/api/src/modules/orch/agents/orch-heimdall.ts
```

**2. Criar routes (`orch-heimdall.routes.ts`):**

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '@/database';
import { orchHeimdall } from '../agents/orch-heimdall';
import { authMiddleware } from '@/middleware/auth';

const router = Router();

// ========== PRE MODE (SEM AUTH) ==========

// POST /api/v1/orch/admission/chat — Chat consultivo (NO AUTH!)
router.post('/admission/chat', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { message, leadId, name, email } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    const result = await orchHeimdall.chatPreEnrollment(client, { message, leadId, name, email });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'admission chat failed' });
  } finally {
    client.release();
  }
});

// GET /api/v1/orch/admission/leads — Listar leads (AUTH: coordenador)
router.get('/admission/leads', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const tenantId = req.user.tenantId;
    const { status, minScore } = req.query;
    let query = 'SELECT * FROM orch_admission_lead WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    if (minScore) { params.push(Number(minScore)); query += ` AND lead_score >= $${params.length}`; }
    query += ' ORDER BY lead_score DESC, created_at DESC';
    const result = await client.query(query, params);
    res.json({ leads: result.rows, total: result.rows.length });
  } finally {
    client.release();
  }
});

// PATCH /api/v1/orch/admission/leads/:id — Atualizar status do lead
router.patch('/admission/leads/:id', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { status } = req.body;
    const result = await client.query(
      `UPDATE orch_admission_lead SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'lead not found' });
    res.json(result.rows[0]);
  } finally {
    client.release();
  }
});

// ========== POST MODE (COM AUTH) ==========

// GET /api/v1/orch/onboarding/status — Status do onboarding do aluno logado
router.get('/onboarding/status', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const result = await orchHeimdall.getOnboardingStatus(client, req.user.id, req.user.tenantId);
    res.json(result);
  } finally {
    client.release();
  }
});

// POST /api/v1/orch/onboarding/checkin — Check-in do aluno
router.post('/onboarding/checkin', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const result = await orchHeimdall.checkIn(client, {
      studentId: req.user.id,
      tenantId: req.user.tenantId,
    });
    res.json(result);
  } finally {
    client.release();
  }
});

// GET /api/v1/orch/onboarding/class/:classId — Visao do professor
router.get('/onboarding/class/:classId', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const result = await orchHeimdall.getClassOnboarding(client, req.params.classId);
    res.json(result);
  } finally {
    client.release();
  }
});

export default router;
```

**3. Registrar no router principal do Orch:**

No arquivo `apps/api/src/modules/orch/orch.routes.ts` (ou equivalente), adicionar:

```typescript
import heimdallRoutes from './routes/orch-heimdall.routes';
router.use('/orch', heimdallRoutes);
```

**4. Registrar Heimdall no Hub:**

No array de agentes do Hub, adicionar:

```typescript
{
  name: 'heimdall',
  intents: ['admission', 'enrollment_question', 'onboarding', 'lead'],
  handler: async (client, params) => {
    if (!params.studentId) {
      return orchHeimdall.chatPreEnrollment(client, params);
    }
    return orchHeimdall.getOnboardingStatus(client, params.studentId, params.tenantId);
  },
}
```

### Passo a passo — Frontend

**5. AdmissionChat.tsx (landing page, SEM login):**

```typescript
// apps/client/src/pages/admission/AdmissionChat.tsx
// Pagina publica — nao requer autenticacao
// Bubble chat no canto inferior direito da landing page
// Campos opcionais: nome, email (captura de lead)
// POST /api/v1/orch/admission/chat
// Estado local: messages[], leadId (retornado pelo backend na 1a resposta)
```

Estrutura:
- Input de mensagem + botao enviar
- Lista de mensagens (alterna user/assistant)
- Campos opcionais nome/email que aparecem apos 2a mensagem
- Indicador "Heimdall esta digitando..."
- Sem dependencia de auth context

**6. OnboardingChecklist.tsx (dashboard aluno):**

```typescript
// apps/client/src/components/orch/OnboardingChecklist.tsx
// Widget no dashboard do aluno (30 primeiros dias)
// GET /api/v1/orch/onboarding/status
// Progress bar + 10 items com check/uncheck
// Botao "Fazer check-in" que chama POST /api/v1/orch/onboarding/checkin
```

10 itens do checklist:
1. `profile_complete` — Completou o perfil
2. `first_login` — Primeiro login realizado
3. `watched_intro` — Assistiu video introdutorio
4. `explored_courses` — Explorou catalogo de cursos
5. `first_ai_interaction` — Primeira interacao com IA
6. `first_assignment` — Primeira atividade entregue
7. `joined_chat` — Entrou no chat da turma
8. `completed_recap` — Completou revisao da semana
9. `met_coordinator` — Conheceu o coordenador
10. `feedback_given` — Deu feedback sobre a plataforma

### Lead Scoring — Formula

```
lead_score = engagement(30%) + fit(25%) + urgency(25%) + completeness(20%)

engagement = (messages_count / 10) * 30  // max 30pts
fit = match(interest_area, courses_available) * 25  // LLM avalia 0-1
urgency = detect_urgency_keywords(conversation) * 25  // "preciso comecar", "quando comeca"
completeness = (campos_preenchidos / total_campos) * 20  // nome, email, phone, interest, education
```

### Validacao — curl

```bash
# PRE mode — chat sem auth (DEVE funcionar sem token!)
curl -X POST http://localhost:3000/api/v1/orch/admission/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Quero saber sobre os cursos de tecnologia", "name": "Maria", "email": "maria@test.com"}'
# Deve retornar: { reply: "...", leadId: "uuid", leadScore: N }

# Listar leads (AUTH coordenador)
curl -X GET http://localhost:3000/api/v1/orch/admission/leads \
  -H "Authorization: Bearer $TOKEN"
# Deve retornar: { leads: [...], total: N }

# Onboarding status (AUTH aluno)
curl -X GET http://localhost:3000/api/v1/orch/onboarding/status \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# Deve retornar: { checklist: {...}, completedCount: N, totalItems: 10, percentage: N }

# Check-in
curl -X POST http://localhost:3000/api/v1/orch/onboarding/checkin \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# Deve retornar: { updated: [...items_detected], completedCount: N }
```

### Definicao de pronto

- [ ] Chat de admissao funciona SEM autenticacao
- [ ] Lead criado automaticamente na 1a mensagem
- [ ] Lead score calculado e atualizado a cada mensagem
- [ ] Onboarding inicializado automaticamente no 1o login do aluno
- [ ] Check-in detecta itens completados automaticamente
- [ ] Professor ve onboarding da turma inteira
- [ ] AdmissionChat.tsx renderiza na landing page
- [ ] OnboardingChecklist.tsx renderiza no dashboard

---

## STORY-07.3: Dewey — Case Studies com CBR Flywheel (8 pts, Full-stack)

**Tempo estimado:** 3-4 dias
**Complexidade:** Alta
**Dependencias:** STORY-07.1 completa, pgvector habilitado

### Conceito

Dewey gera estudos de caso a partir do conteudo da aula (unit_id), conduz discussoes socraticas, e melhora futuros cases com feedback do professor (flywheel CBR — Case-Based Reasoning).

### O que criar

**Backend — 2 arquivos:**

| Arquivo | Path | Descricao |
|---------|------|-----------|
| Service | `apps/api/src/modules/orch/agents/orch-dewey.ts` | Copiar de `implementation/services/agents/orch-dewey.ts` |
| Routes | `apps/api/src/modules/orch/routes/orch-dewey.routes.ts` | 6 endpoints |

### Passo a passo

**1. Copiar service:**

```bash
cp "implementation/services/agents/orch-dewey.ts" \
   apps/api/src/modules/orch/agents/orch-dewey.ts
```

**2. Criar routes (`orch-dewey.routes.ts`):**

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '@/database';
import { orchDewey } from '../agents/orch-dewey';
import { authMiddleware } from '@/middleware/auth';

const router = Router();

// POST /api/v1/orch/cases/generate — Professor gera case a partir de aula
router.post('/cases/generate', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { unitId, difficulty } = req.body;
    if (!unitId) return res.status(400).json({ error: 'unitId is required' });
    const result = await orchDewey.generateCase(client, {
      tenantId: req.user.tenantId,
      unitId,
      difficulty,
    });
    res.json(result);
  } finally {
    client.release();
  }
});

// GET /api/v1/orch/cases — Listar cases
router.get('/cases', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { unitId, difficulty, page, limit } = req.query;
    const result = await orchDewey.listCases(client, {
      tenantId: req.user.tenantId,
      unitId: unitId as string,
      difficulty: difficulty as string,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
    res.json(result);
  } finally {
    client.release();
  }
});

// GET /api/v1/orch/cases/:id — Case completo com discussoes
router.get('/cases/:id', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const result = await orchDewey.getCase(client, req.params.id);
    if (!result) return res.status(404).json({ error: 'case not found' });
    res.json(result);
  } finally {
    client.release();
  }
});

// POST /api/v1/orch/cases/:id/discuss — Aluno responde case
router.post('/cases/:id/discuss', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { response } = req.body;
    if (!response) return res.status(400).json({ error: 'response is required' });
    const result = await orchDewey.discuss(client, {
      caseId: req.params.id,
      studentId: req.user.id,
      response,
    });
    res.json(result);
  } finally {
    client.release();
  }
});

// GET /api/v1/orch/cases/:id/discussions — Historico de discussoes
router.get('/cases/:id/discussions', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM orch_case_discussion WHERE case_id = $1 ORDER BY created_at DESC`,
      [req.params.id],
    );
    res.json({ discussions: result.rows });
  } finally {
    client.release();
  }
});

// POST /api/v1/orch/cases/:id/rate — Professor avalia (flywheel)
router.post('/cases/:id/rate', authMiddleware, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { professorRating, professorFeedback } = req.body;
    if (!professorRating) return res.status(400).json({ error: 'professorRating is required' });
    const result = await orchDewey.rate(client, {
      caseId: req.params.id,
      professorRating,
      professorFeedback,
    });
    res.json(result);
  } finally {
    client.release();
  }
});

export default router;
```

**3. Registrar no router principal:**

```typescript
import deweyRoutes from './routes/orch-dewey.routes';
router.use('/orch', deweyRoutes);
```

### Flywheel CBR — Como funciona

```
1. Professor solicita case → LLM gera baseado em conteudo da aula (RAG)
2. Alunos respondem → LLM avalia via metodo socratico
3. Professor avalia qualidade do case (1-5 estrelas)
4. Cases com rating alto → embedding armazenado → busca semantica prioriza eles
5. Proxima geracao de case busca cases similares bem avaliados como referencia
6. Loop continuo: mais uso → melhores cases → mais uso
```

### Validacao — curl

```bash
# Gerar case a partir de aula
curl -X POST http://localhost:3000/api/v1/orch/cases/generate \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"unitId": "UUID_DA_AULA", "difficulty": "intermediate"}'
# Deve retornar: { id: "uuid", title: "...", description: "...", challenge: "..." }

# Listar cases
curl -X GET "http://localhost:3000/api/v1/orch/cases?unitId=UUID&difficulty=intermediate" \
  -H "Authorization: Bearer $TOKEN"

# Aluno responde
curl -X POST http://localhost:3000/api/v1/orch/cases/CASE_UUID/discuss \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"response": "Eu abordaria o problema analisando primeiro os stakeholders..."}'
# Deve retornar: { aiFeedback: "...", score: 0.75 }

# Professor avalia (flywheel)
curl -X POST http://localhost:3000/api/v1/orch/cases/CASE_UUID/rate \
  -H "Authorization: Bearer $PROF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"professorRating": 4, "professorFeedback": "Bom case, mas poderia ter mais dados quantitativos"}'

# Busca semantica
# (via service — nao tem endpoint direto, usado internamente pelo generateCase)
```

### Definicao de pronto

- [ ] Case gerado a partir de conteudo real da aula via RAG
- [ ] Discussao socratica funcional (aluno responde, AI avalia)
- [ ] Busca semantica via pgvector retorna cases similares
- [ ] Professor consegue avaliar cases (rating 1-5)
- [ ] Flywheel: cases bem avaliados influenciam geracao futura
- [ ] Discussoes contadas e media de rating atualizada

---

## STORY-07.4: SafeGuard — Safety Scan Middleware (5 pts, Backend)

**Tempo estimado:** 1-2 dias
**Complexidade:** Media
**Dependencias:** STORY-07.1 completa, Hub operacional

### Conceito

SafeGuard roda em BACKGROUND em cada mensagem que passa pelo Hub. Classifica conteudo em 4 categorias de risco. Se severidade >= high, cria flag e alerta silenciosamente o coordenador. **NUNCA bloqueia a conversa. NUNCA confronta o aluno.**

### O que criar

**1 arquivo:**

| Arquivo | Path | Descricao |
|---------|------|-----------|
| Service | `apps/api/src/modules/orch/agents/orch-safeguard.ts` | Copiar de `implementation/services/agents/orch-safeguard.ts` |

### Passo a passo

**1. Copiar service:**

```bash
cp "implementation/services/agents/orch-safeguard.ts" \
   apps/api/src/modules/orch/agents/orch-safeguard.ts
```

**2. Integrar no Hub como middleware:**

No arquivo do Hub (ex: `orch-hub.service.ts`), APOS cada mensagem do aluno:

```typescript
import { orchSafeguard } from '../agents/orch-safeguard';

// Dentro do metodo que processa mensagens do Hub:
// APOS enviar a resposta ao aluno, em background:
setImmediate(async () => {
  const client = await pool.connect();
  try {
    await orchSafeguard.scan(client, {
      studentId: params.studentId,
      tenantId: params.tenantId,
      message: params.message,
      context: { agent: currentAgent, conversationId },
    });
  } catch (err) {
    console.error('[SafeGuard] scan failed:', err);
    // NUNCA propagar erro — safety scan e best-effort
  } finally {
    client.release();
  }
});
```

**IMPORTANTE:** Usar `setImmediate` para nao bloquear a resposta. SafeGuard NUNCA pode causar latencia na conversa do aluno.

**3. Endpoints de consulta (coordenador):**

Adicionar no router de admin ou criar `orch-safeguard.routes.ts`:

```typescript
// GET /api/v1/orch/admin/safety-flags — Coordenador ve flags
router.get('/admin/safety-flags', authMiddleware, roleGuard('coordinator'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { unresolved } = req.query;
    const result = await orchSafeguard.getFlags(client, {
      tenantId: req.user.tenantId,
      unresolved: unresolved === 'true',
    });
    res.json(result);
  } finally {
    client.release();
  }
});

// PATCH /api/v1/orch/admin/safety-flags/:id/resolve — Resolver flag
router.patch('/admin/safety-flags/:id/resolve', authMiddleware, roleGuard('coordinator'), async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await orchSafeguard.resolve(client, {
      flagId: req.params.id,
      resolvedBy: req.user.id,
      notes: req.body.notes,
    });
    res.json(result);
  } finally {
    client.release();
  }
});
```

### Categorias de classificacao

| Tipo | Descricao | Exemplos |
|------|-----------|----------|
| `emotional_distress` | Sofrimento emocional | "nao aguento mais", "me sinto sozinho" |
| `self_harm_risk` | Risco de autolesao | "quero acabar com tudo", "sem sentido" |
| `bullying` | Bullying ou assedio | "todo mundo ri de mim", "me ameacaram" |
| `crisis_language` | Linguagem de crise | "desistir de tudo", "ninguem se importa" |

### Severidades

| Severidade | Acao |
|------------|------|
| `low` | Registra flag, sem alerta |
| `medium` | Registra flag, sem alerta imediato |
| `high` | Registra flag + alerta ao coordenador |
| `critical` | Registra flag + alerta URGENTE ao coordenador + email |

### Keywords de sensibilidade aumentada

```
"desistir", "nao aguento", "nao consigo mais", "sozinho", "sozinha",
"ninguem", "acabar", "sem sentido", "me machucar", "sumir",
"nao importa", "tanto faz", "cansei", "desisto"
```

### Validacao

```bash
# Simular mensagem com risco (em dev apenas!)
# O scan roda internamente via Hub — testar enviando mensagem normal:
curl -X POST http://localhost:3000/api/v1/orch/hub/chat \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Estou bem, estudando normalmente", "agent": "socrates"}'
# SafeGuard roda em background — verificar logs: [SafeGuard] no flag

# Ver flags (coordenador)
curl -X GET "http://localhost:3000/api/v1/orch/admin/safety-flags?unresolved=true" \
  -H "Authorization: Bearer $COORD_TOKEN"

# Resolver flag
curl -X PATCH http://localhost:3000/api/v1/orch/admin/safety-flags/FLAG_UUID/resolve \
  -H "Authorization: Bearer $COORD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Conversei com o aluno, situacao resolvida"}'
```

### Definicao de pronto

- [ ] SafeGuard roda em background em CADA mensagem do Hub
- [ ] NUNCA bloqueia a resposta ao aluno
- [ ] NUNCA confronta ou menciona a analise ao aluno
- [ ] Flags criadas com tipo e severidade corretos
- [ ] Alerta ao coordenador quando severity >= high
- [ ] Coordenador consegue listar e resolver flags
- [ ] Keywords de sensibilidade funcionam
- [ ] Erro no scan NAO afeta fluxo normal

---

## STORY-07.5: Janus + Keynes — Wrappers Inteligentes (2 pts, Backend)

**Tempo estimado:** 3-4 horas
**Complexidade:** Baixa
**Dependencias:** Bloom (EPIC-03), Hub operacional

### Conceito

Janus e Keynes nao sao agentes novos — sao wrappers que adicionam contexto da Orchestra API aos agentes existentes.

- **Janus** = Bloom + contexto de enrollment (matriculas, turmas, prazos)
- **Keynes** = Generic agent + contexto financeiro (boletos, mensalidades, descontos)

O Hub reconhece intents de enrollment e financeiro e roteia para eles.

### O que criar

Nenhum arquivo de service novo. Registrar no Hub como wrappers:

```typescript
// No Hub, adicionar intents e handlers:

// Janus — Enrollment wrapper
{
  name: 'janus',
  intents: ['enrollment', 'matricula', 'transferencia', 'trancamento', 'rematricula'],
  handler: async (client, params) => {
    // 1. Buscar contexto de enrollment via Orchestra API
    const enrollmentCtx = await fetch(`${ORCHESTRA_API}/enrollment/${params.studentId}`);
    const ctx = await enrollmentCtx.json();

    // 2. Injetar contexto no Bloom
    return orchBloom.chat(client, {
      ...params,
      systemPromptExtra: `
        Student enrollment context:
        - Status: ${ctx.status}
        - Course: ${ctx.courseName}
        - Class: ${ctx.className}
        - Enrolled since: ${ctx.enrolledAt}
        - Payment status: ${ctx.paymentStatus}
        Answer enrollment questions using this context.
      `,
    });
  },
}

// Keynes — Financial wrapper
{
  name: 'keynes',
  intents: ['financial', 'boleto', 'mensalidade', 'desconto', 'pagamento', 'financeiro'],
  handler: async (client, params) => {
    // 1. Buscar contexto financeiro via Orchestra API
    const finCtx = await fetch(`${ORCHESTRA_API}/financial/${params.studentId}`);
    const ctx = await finCtx.json();

    // 2. Injetar no LLM generico
    const { orchLLMService } = await import('../orch-llm.service');
    return orchLLMService.chat(client, {
      tenantId: params.tenantId,
      messages: [
        { role: 'system', content: `You are Keynes, a financial assistant. Language: pt-BR.
          Student financial context: ${JSON.stringify(ctx)}
          Answer financial questions accurately. If unsure, direct to the financial department.` },
        ...params.conversationHistory,
        { role: 'user', content: params.message },
      ],
      model: 'default',
      temperature: 0.3,
      maxTokens: 600,
    });
  },
}
```

### Validacao

```bash
# Testar intent de enrollment
curl -X POST http://localhost:3000/api/v1/orch/hub/chat \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Quero saber sobre minha matricula"}'
# Hub deve rotear para Janus (Bloom + enrollment context)

# Testar intent financeiro
curl -X POST http://localhost:3000/api/v1/orch/hub/chat \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Quando vence meu proximo boleto?"}'
# Hub deve rotear para Keynes
```

### Definicao de pronto

- [ ] Hub reconhece intents de enrollment e roteia para Janus
- [ ] Hub reconhece intents financeiros e roteia para Keynes
- [ ] Janus usa Bloom com contexto injetado
- [ ] Keynes responde perguntas financeiras com contexto real
- [ ] Fallback para agente generico se Orchestra API indisponivel

---

## STORY-07.6: Vygotsky + Braille — Placeholders Estruturais (3 pts, Backend)

**Tempo estimado:** 3-4 horas
**Complexidade:** Baixa
**Dependencias:** STORY-07.1 completa

### Conceito

Tabelas ja criadas na migration. Aqui criamos stubs minimos que salvam dados basicos, prontos para expansao futura.

### O que criar

**2 stubs simples:**

**Vygotsky stub** — `apps/api/src/modules/orch/agents/orch-vygotsky.ts`:

```typescript
import type { PoolClient } from 'pg';

class OrchVygotsky {
  async assess(client: PoolClient, params: {
    studentId: string;
    tenantId: string;
    conceptId: string;
    canDoAlone: string[];
    canDoGuided: string[];
    cannotDo: string[];
  }) {
    const result = await client.query(
      `INSERT INTO orch_zpd_assessment (tenant_id, student_id, concept_id, can_do_alone, can_do_guided, cannot_do, last_assessed)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (student_id, concept_id)
       DO UPDATE SET can_do_alone = $4, can_do_guided = $5, cannot_do = $6, last_assessed = NOW()
       RETURNING *`,
      [params.tenantId, params.studentId, params.conceptId,
       JSON.stringify(params.canDoAlone), JSON.stringify(params.canDoGuided), JSON.stringify(params.cannotDo)],
    );
    return result.rows[0];
  }

  async getZPD(client: PoolClient, studentId: string, conceptId?: string) {
    const query = conceptId
      ? `SELECT * FROM orch_zpd_assessment WHERE student_id = $1 AND concept_id = $2`
      : `SELECT * FROM orch_zpd_assessment WHERE student_id = $1 ORDER BY last_assessed DESC`;
    const params = conceptId ? [studentId, conceptId] : [studentId];
    const result = await client.query(query, params);
    return result.rows;
  }
}

export const orchVygotsky = new OrchVygotsky();
```

**Braille stub** — `apps/api/src/modules/orch/agents/orch-braille.ts`:

```typescript
import type { PoolClient } from 'pg';

const DEFAULT_NEEDS = {
  screen_reader: false,
  high_contrast: false,
  font_size: 16,
  captions: false,
  audio_description: false,
  keyboard_nav: false,
  reduce_motion: false,
  dyslexia_font: false,
};

class OrchBraille {
  async setPreferences(client: PoolClient, params: {
    studentId: string;
    tenantId: string;
    needs: Partial<typeof DEFAULT_NEEDS>;
    assistiveTech?: string[];
    source?: 'self_reported' | 'detected' | 'coordinator_set';
  }) {
    const mergedNeeds = { ...DEFAULT_NEEDS, ...params.needs };
    const result = await client.query(
      `INSERT INTO orch_accessibility_preference (tenant_id, student_id, needs, assistive_tech, preferences_source, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (student_id, tenant_id)
       DO UPDATE SET needs = $3, assistive_tech = $4, preferences_source = $5, updated_at = NOW()
       RETURNING *`,
      [params.tenantId, params.studentId, JSON.stringify(mergedNeeds),
       params.assistiveTech ?? [], params.source ?? 'self_reported'],
    );
    return result.rows[0];
  }

  async getPreferences(client: PoolClient, studentId: string, tenantId: string) {
    const result = await client.query(
      `SELECT * FROM orch_accessibility_preference WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );
    return result.rows[0] ?? { needs: DEFAULT_NEEDS, assistive_tech: [], preferences_source: null };
  }
}

export const orchBraille = new OrchBraille();
```

### Validacao

```sql
-- Testar ZPD assessment
INSERT INTO orch_zpd_assessment (tenant_id, student_id, concept_id, can_do_alone, can_do_guided, cannot_do)
VALUES ('TENANT_UUID', 'STUDENT_UUID', 'algebra-linear-eq',
  '["resolver eq 1o grau"]', '["resolver eq 2o grau"]', '["resolver sistemas lineares"]');
-- Deve inserir sem erro

-- Testar accessibility preference
INSERT INTO orch_accessibility_preference (tenant_id, student_id, needs, assistive_tech, preferences_source)
VALUES ('TENANT_UUID', 'STUDENT_UUID',
  '{"screen_reader": true, "high_contrast": true, "font_size": 20}',
  ARRAY['NVDA', 'magnifier'], 'self_reported');
-- Deve inserir sem erro
```

### Definicao de pronto

- [ ] Vygotsky stub salva e recupera ZPD assessments
- [ ] UPSERT funcional (conflict no student_id + concept_id)
- [ ] Braille stub salva e recupera preferencias de acessibilidade
- [ ] UPSERT funcional (conflict no student_id + tenant_id)
- [ ] Defaults corretos quando nao ha preferencia

---

## STORY-07.7: Backfills + Melhorias Transversais (5 pts, Backend)

**Tempo estimado:** 1-2 dias
**Complexidade:** Media
**Dependencias:** EPIC-01 a EPIC-03 completos

### 4 entregas independentes

**1. Backfill embeddings — Videos antigos sem ai_analysis**

```typescript
// Script one-shot: scripts/backfill-embeddings.ts
// Busca videos em orch_video_analysis com embedding IS NULL
// Para cada: gera embedding via OpenAI text-embedding-3-small
// Batch de 50, com rate limiting

async function backfillEmbeddings() {
  const client = await pool.connect();
  const videos = await client.query(
    `SELECT id, ai_analysis FROM orch_video_analysis WHERE embedding IS NULL LIMIT 500`,
  );
  console.log(`[Backfill] ${videos.rows.length} videos sem embedding`);

  for (let i = 0; i < videos.rows.length; i += 50) {
    const batch = videos.rows.slice(i, i + 50);
    const embeddings = await generateEmbeddings(batch.map(v => v.ai_analysis));
    for (let j = 0; j < batch.length; j++) {
      await client.query(
        `UPDATE orch_video_analysis SET embedding = $1 WHERE id = $2`,
        [JSON.stringify(embeddings[j]), batch[j].id],
      );
    }
    console.log(`[Backfill] ${i + batch.length}/${videos.rows.length}`);
  }
  client.release();
}
```

Rodar: `npx tsx scripts/backfill-embeddings.ts`

**2. PDF server-side — Weber D7 via Puppeteer**

No service do Weber (orch-weber.ts), adicionar metodo de geracao PDF:

```typescript
// Adicionar ao OrchWeber:
async generatePDF(client: PoolClient, params: {
  tenantId: string;
  dashboardId: string;
  filters?: Record<string, any>;
}): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Renderizar dashboard internamente
  const dashboardUrl = `http://localhost:3000/internal/dashboard/${params.dashboardId}?tenant=${params.tenantId}`;
  await page.goto(dashboardUrl, { waitUntil: 'networkidle0' });

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
  });

  await browser.close();
  return pdf;
}
```

Endpoint:
```typescript
// GET /api/v1/orch/dashboards/:id/pdf
router.get('/dashboards/:id/pdf', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const pdf = await orchWeber.generatePDF(client, {
      tenantId: req.user.tenantId,
      dashboardId: req.params.id,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dashboard-${req.params.id}.pdf"`);
    res.send(pdf);
  } finally {
    client.release();
  }
});
```

**3. Voice mode — Placeholder Gemini Live API**

```typescript
// apps/api/src/modules/orch/agents/orch-voice.ts (placeholder)
class OrchVoice {
  readonly enabled = false;

  async processVoice(_audioBuffer: Buffer): Promise<{ text: string; supported: boolean }> {
    // Placeholder — Gemini Live API nao esta disponivel em producao ainda
    // Quando disponivel, substituir por:
    // 1. Receber audio stream do cliente
    // 2. Enviar para Gemini Live API (streaming bidirectional)
    // 3. Retornar texto transcrito + resposta em audio
    return {
      text: '',
      supported: false,
    };
  }
}

export const orchVoice = new OrchVoice();
```

**4. Blockchain — Coluna blockchain_tx em certificates**

```sql
-- Ja incluido na migration 1942000006
-- Adicionar coluna na tabela de certificados existente:
ALTER TABLE orch_certificate ADD COLUMN IF NOT EXISTS blockchain_tx VARCHAR(100);
ALTER TABLE orch_certificate ADD COLUMN IF NOT EXISTS blockchain_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN orch_certificate.blockchain_tx IS 'OpenTimestamps hash — placeholder for future blockchain verification';
```

Stub de verificacao:

```typescript
// Adicionar ao service de certificados existente:
async stampCertificate(certificateId: string): Promise<{ txHash: string | null }> {
  // Placeholder — OpenTimestamps integration futura
  // Quando ativo:
  // 1. Gerar hash SHA-256 do PDF do certificado
  // 2. Submeter ao OpenTimestamps (descentralizado, gratis)
  // 3. Salvar txHash na coluna blockchain_tx
  return { txHash: null };
}
```

### Validacao

```bash
# Backfill
npx tsx scripts/backfill-embeddings.ts
# Deve logar quantidade processada

# PDF
curl -X GET http://localhost:3000/api/v1/orch/dashboards/DASHBOARD_UUID/pdf \
  -H "Authorization: Bearer $TOKEN" \
  -o dashboard.pdf
# Deve gerar PDF valido

# Voice (placeholder — deve retornar supported: false)
# Blockchain (placeholder — deve retornar txHash: null)
```

### Definicao de pronto

- [ ] Script de backfill processa videos sem embedding
- [ ] PDF gerado server-side via Puppeteer
- [ ] Voice placeholder retorna `supported: false`
- [ ] Coluna `blockchain_tx` existe na tabela de certificados
- [ ] Nenhum placeholder quebra o fluxo existente

---

## CHECKLIST GERAL — EPIC-07

### Pre-implementacao

- [ ] EPIC-01 a EPIC-03 funcionando
- [ ] pgvector habilitado
- [ ] Total orch_* >= 22 tabelas
- [ ] orchLLMService operacional

### Por story

| Story | Pts | Descricao | Status |
|-------|-----|-----------|--------|
| 07.1 | 3 | Migration 7 tabelas | ⬜ |
| 07.2 | 8 | Heimdall (Admission + Onboarding) | ⬜ |
| 07.3 | 8 | Dewey (Case Studies + CBR) | ⬜ |
| 07.4 | 5 | SafeGuard (Safety Middleware) | ⬜ |
| 07.5 | 2 | Janus + Keynes (Wrappers) | ⬜ |
| 07.6 | 3 | Vygotsky + Braille (Stubs) | ⬜ |
| 07.7 | 5 | Backfills + Melhorias | ⬜ |

### Ordem recomendada

```
07.1 (migration) → 07.6 (stubs, rapido) → 07.5 (wrappers, rapido)
                 → 07.4 (SafeGuard, independente)
                 → 07.2 (Heimdall, mais complexo)
                 → 07.3 (Dewey, mais complexo)
                 → 07.7 (backfills, pode rodar em paralelo)
```

07.2 e 07.3 podem rodar em paralelo entre si. 07.4 e independente de tudo exceto 07.1.

### Pos-implementacao

- [ ] 29 tabelas orch_* no total
- [ ] Chat de admissao funciona sem auth
- [ ] Onboarding com 10 itens detectados automaticamente
- [ ] Case studies gerados via RAG
- [ ] Safety scan rodando silenciosamente
- [ ] Janus e Keynes roteados pelo Hub
- [ ] ZPD e acessibilidade salvando dados
- [ ] Backfill de embeddings executado
- [ ] PDF server-side gerando via Puppeteer

---

**Total: 7 stories, 34 pontos, 2-3 semanas. Boa sorte, Giuseppe.**
