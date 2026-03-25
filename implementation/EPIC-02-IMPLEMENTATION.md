# EPIC-02: Agentes Core AVA — Guia de Implementacao Cirurgico

**Para:** Giuseppe "King Witcher"
**Stack:** Express 5 + React 19 monorepo (Vite 7, Tailwind v4, Keycloak 26)
**Codebase:** `apps/api/src/` (backend) | `apps/web/src/` (frontend)
**Pontos totais:** 47 pts (9 stories)
**Prazo estimado:** 2-3 semanas
**Dependencia:** EPIC-01 COMPLETO (Hub Router, Profile, SSE, 3 tabelas foundation)

---

## Pre-requisitos: Validar EPIC-01

Antes de comecar, confirmar que EPIC-01 esta funcional:

```bash
# 1. Tabelas foundation existem
psql -d dev -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'orch_%' ORDER BY table_name;"
# Deve retornar: orch_audit_log, orch_interaction_log, orch_profile (+ as 5 do Leo)

# 2. Hub Router responde
curl -X POST http://localhost:3000/api/v1/orch/orch-ava/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"oi"}'
# Deve retornar SSE stream

# 3. Profile existe
curl http://localhost:3000/api/v1/orch/orch-ava/profile \
  -H "Authorization: Bearer $TOKEN"
# Deve retornar JSON com archetype, learning_style, etc.
```

Se QUALQUER um falhar: PARAR. Resolver EPIC-01 primeiro.

---

## STORY-02.1: Migration SQL — orch_core_agents (3 pts, Database)

**Complexidade:** Baixa
**Tempo:** 1-2 horas
**Arquivo pronto:** `implementation/migrations/1942000003--orch_core_agents.sql`

### Passo 1: Copiar migration

```bash
cp implementation/migrations/1942000003--orch_core_agents.sql \
   libs/migrations/identity/1942000003--orch_core_agents.sql
```

### Passo 2: Rodar migration

```bash
npm run migrate
```

Se o comando de migration nao existir no projeto, rodar manualmente:

```bash
psql -d dev -f libs/migrations/identity/1942000003--orch_core_agents.sql
```

### Passo 3: Validar tabelas

```sql
-- Deve retornar 9 tabelas (3 do EPIC-01 + 6 novas)
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'orch_%'
ORDER BY table_name;

-- Resultado esperado:
-- orch_audit_log           (EPIC-01)
-- orch_concept_memory      (NOVO - Ebbinghaus SM-2)
-- orch_daily_recap         (NOVO - Comenius quiz diario)
-- orch_engagement_snapshot (NOVO - Taylor metricas)
-- orch_gamification        (NOVO - Sisifo XP/streaks)
-- orch_interaction_log     (EPIC-01)
-- orch_profile             (EPIC-01)
-- orch_recap_question      (NOVO - Perguntas do quiz)
-- orch_xp_transaction      (NOVO - Ledger de XP)
```

### Passo 4: Validar constraints

```sql
-- CHECK constraint no status do recap
\d orch_daily_recap
-- Deve mostrar CHECK (status IN ('pending','in_progress','completed','expired'))

-- CHECK no tipo de pergunta
\d orch_recap_question
-- Deve mostrar CHECK (question_type IN ('multiple_choice','true_false','fill_blank'))
```

### Passo 5: Validar indexes

```sql
\di orch_*
-- Deve listar TODOS os indexes das 6 tabelas novas
-- Criticos:
--   idx_orch_concept_memory_student_next_review (para query de revisao)
--   idx_orch_daily_recap_student_date (unicidade por dia)
--   idx_orch_gamification_tenant_xp (para leaderboard)
--   idx_orch_engagement_snapshot_student_date (para historico)
```

### Rollback (se precisar)

```sql
DROP TABLE IF EXISTS orch_xp_transaction CASCADE;
DROP TABLE IF EXISTS orch_gamification CASCADE;
DROP TABLE IF EXISTS orch_engagement_snapshot CASCADE;
DROP TABLE IF EXISTS orch_recap_question CASCADE;
DROP TABLE IF EXISTS orch_daily_recap CASCADE;
DROP TABLE IF EXISTS orch_concept_memory CASCADE;
```

**Criterio de aceite:** 9 tabelas `orch_*` existem, constraints e indexes validos.

---

## STORY-02.2: Socrates — Tutor Socratico (8 pts, Backend)

**Complexidade:** Alta
**Tempo:** 2-3 dias
**Arquivo pronto:** `implementation/services/agents/orch-socrates.ts`

### Passo 1: Criar pasta e copiar service

```bash
mkdir -p apps/api/src/app/services/agents/
cp implementation/services/agents/orch-socrates.ts \
   apps/api/src/app/services/agents/orch-socrates.ts
```

### Passo 2: Ajustar imports

Abrir `apps/api/src/app/services/agents/orch-socrates.ts` e corrigir os imports para apontar para os paths reais do projeto:

```typescript
// ANTES (paths relativos do implementation/)
import { orchHubRouter } from '../orch-hub-router';
import { orchLLMService } from '../../services/orch-llm-service';
import { orchRAGService } from '../../services/orch-rag-service';
import { orchProfileService } from '../orch-profile-service';

// DEPOIS (paths relativos de agents/ para services/)
import { orchHubRouter } from '../orch-hub-router';          // um nivel acima
import { orchLLMService } from '../orch-llm-service';         // um nivel acima
import { orchRAGService } from '../orch-rag-service';         // um nivel acima (Leo)
import { orchProfileService } from '../orch-profile-service'; // um nivel acima
```

Verificar com:
```bash
ls apps/api/src/app/services/orch-llm-service.ts
ls apps/api/src/app/services/orch-rag-service.ts
ls apps/api/src/app/services/orch-hub-router.ts
ls apps/api/src/app/services/orch-profile-service.ts
```

Se algum path estiver diferente, ajustar conforme a estrutura real.

### Passo 3: Registrar no Hub Router

Abrir `apps/api/src/app/services/orch-hub-router.ts` e adicionar no ROUTE_MAP:

```typescript
// Localizar o ROUTE_MAP (objeto que mapeia intents para agentes)
// Adicionar estas entradas:

const ROUTE_MAP: Record<string, string> = {
  // ... intents existentes ...

  // Socrates — tutor socratico
  'ask_help': 'socrates',
  'explain': 'socrates',
  'doubt': 'socrates',
  'not_understand': 'socrates',
  'how_to_solve': 'socrates',
  'what_is': 'socrates',
  'help_exercise': 'socrates',
};
```

### Passo 4: Registrar o agente no mapa de services do Hub Router

No mesmo `orch-hub-router.ts`, localizar onde os agentes sao instanciados/importados e adicionar:

```typescript
import { orchSocrates } from './agents/orch-socrates';

// No mapa de servicos (onde o router resolve agente → service):
const AGENT_SERVICES: Record<string, AgentService> = {
  // ... agentes existentes ...
  'socrates': orchSocrates,
};
```

### Passo 5: Validacao — Metodo socratico funciona

```bash
# Testar via curl (substituir TOKEN e IDs reais)
curl -X POST http://localhost:3000/api/v1/orch/orch-ava/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"nao entendi logaritmos","pageUrl":"/player/unit/123"}'

# Deve retornar SSE stream com:
# - agentUsed: "socrates"
# - Primeira resposta = PERGUNTA socratica, NAO resposta direta
# - Exemplo: "O que voce ja sabe sobre potencias? Logaritmo e o inverso..."
```

### Passo 6: Validacao — Graduacao de hints (5 niveis)

Testar enviando "nao sei" repetidamente na mesma sessao:

| Iteracao | Mensagem | Hint esperado |
|----------|----------|---------------|
| 1 | "nao sei" | Level 1: guia suave, pergunta orientadora |
| 2 | "ainda nao entendi" | Level 2: dica mais direta |
| 3 | "nao consigo" | Level 3: exemplo concreto |
| 4 | "me ajuda mais" | Level 4: explicacao parcial |
| 5 | "me da a resposta" | Level 5: resposta completa |

```bash
# Enviar 5 mensagens seguidas de "nao sei"
for i in 1 2 3 4 5; do
  curl -X POST http://localhost:3000/api/v1/orch/orch-ava/chat \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"nao sei\",\"sessionId\":\"SAME_SESSION_ID\"}"
  echo ""
  echo "--- Hint $i ---"
done
# Observar: nivel de detalhe DEVE crescer a cada iteracao
```

### Pontos de atencao

- **Quota check:** Toda chamada ao Gemini DEVE passar pelo quota check do LLM service. Nunca chamar Gemini diretamente.
- **RAG context:** O Socrates usa `orchRAGService.search()` para buscar contexto da aula. Se o RAG retornar vazio, Socrates responde com conhecimento geral (menos preciso).
- **Rate limiting:** 15 msgs/min por aluno. O Hub Router ja aplica isso — nao duplicar.
- **Logging:** Toda interacao e salva em `orch_interaction_log` pelo Hub Router. Socrates NAO precisa salvar separadamente.

**Criterio de aceite:** Socrates responde com pergunta socratica (nunca resposta direta nos niveis 1-3), hint level sobe corretamente, RAG do conteudo funciona.

---

## STORY-02.3: Ebbinghaus — Spaced Repetition (5 pts, Backend)

**Complexidade:** Media
**Tempo:** 1-2 dias
**Arquivo pronto:** `implementation/services/agents/orch-ebbinghaus.ts`

### Passo 1: Copiar service

```bash
cp implementation/services/agents/orch-ebbinghaus.ts \
   apps/api/src/app/services/agents/orch-ebbinghaus.ts
```

### Passo 2: Ajustar imports

```typescript
// Mesmo padrao do Socrates — ajustar paths relativos:
import { orchLLMService } from '../orch-llm-service';
import { orchProfileService } from '../orch-profile-service';
```

### Passo 3: Integrar no pipeline do Hub Router (background, NON-BLOCKING)

Abrir o handler de chat (`apps/api/src/endpoints/orchAvaChat/orchAvaChat.ts` ou equivalente) e adicionar APOS a resposta do Socrates ser enviada:

```typescript
import { orchEbbinghaus } from '../../app/services/agents/orch-ebbinghaus';

// === LOCALIZAR ===
// O trecho onde a resposta do agente ja foi enviada via SSE
// e ANTES do finally { client.release() }

// === ADICIONAR (apos enviar resposta, antes de release) ===
// Background extraction — NUNCA bloqueia o chat
Promise.allSettled([
  orchEbbinghaus.extractConcepts(client, {
    studentId: req.user.id,
    tenantId: req.user.tenantContext.primaryTenantId,
    message: body.message,
    agentResponse: responseText,  // a resposta completa do agente
  })
]).catch(() => {});
// catch vazio = intencional. Extracao de conceitos NUNCA deve derrubar o chat.
```

**IMPORTANTE:** O `Promise.allSettled` roda em background. O `client` ja pode ter sido released quando a Promise resolver. Se o service precisar de DB connection, ele deve obter um client proprio do pool:

```typescript
// Dentro de orchEbbinghaus.extractConcepts():
// Se o service recebe pool em vez de client, ajustar.
// Padrao preferido: o service obtem seu proprio client do pool.
```

### Passo 4: Algoritmo SM-2 — Como funciona

O Ebbinghaus usa o algoritmo SuperMemo 2 para calcular quando revisar cada conceito:

```
Se quality >= 3 (resposta OK):
  repetitions++
  Se repetitions == 1: interval = 1 dia
  Se repetitions == 2: interval = 6 dias
  Senao: interval = Math.round(interval * EF)

Se quality < 3 (resposta ruim):
  repetitions = 0
  interval = 1 dia

EF = max(1.3, EF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
retention = 1.0 (acabou de revisar)
next_review = now + interval dias
```

O service ja implementa isso. Nao alterar a formula.

### Passo 5: Validacao

```sql
-- Apos 3+ interacoes com Socrates, conceitos devem ser extraidos:
SELECT concept, retention, easiness_factor, next_review_at, repetitions
FROM orch_concept_memory
WHERE student_id = '<UUID>'
ORDER BY created_at DESC;

-- Validar:
-- 1. next_review_at esta no FUTURO
-- 2. easiness_factor esta entre 1.3 e 2.5
-- 3. repetitions >= 0
-- 4. retention esta entre 0.0 e 1.0
-- 5. concept nao esta vazio e faz sentido (ex: "logaritmos", "funcao exponencial")
```

```bash
# Testar que conceitos sao extraidos sem bloquear o chat:
# 1. Enviar mensagem para Socrates
# 2. Resposta deve chegar em tempo normal (< 3s para primeiro token)
# 3. Verificar no banco que conceito foi salvo (pode levar 2-5s a mais)
time curl -X POST http://localhost:3000/api/v1/orch/orch-ava/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"me explica derivadas","pageUrl":"/player/unit/456"}'
# Tempo de resposta NAO deve ser afetado pela extracao de conceitos
```

### Pontos de atencao

- **Nunca bloqueia o chat.** Se a extracao falhar, o aluno NAO percebe.
- **Deduplicacao:** Se o mesmo conceito ja existe para o aluno, o service deve fazer UPSERT (atualizar `updated_at` e recalcular `next_review_at`), NAO inserir duplicata.
- **Quota:** Cada extracao consome 1 chamada LLM (~200 tokens). Monitorar.

**Criterio de aceite:** Conceitos extraidos apos interacao, SM-2 calculado corretamente, zero impacto no tempo de resposta do chat.

---

## STORY-02.4: Comenius — Daily Recap + Quiz (8 pts, Backend+Frontend)

**Complexidade:** Alta
**Tempo:** 3-4 dias
**Arquivo pronto:** `implementation/services/agents/orch-comenius.ts`

### Backend

#### Passo 1: Copiar service

```bash
cp implementation/services/agents/orch-comenius.ts \
   apps/api/src/app/services/agents/orch-comenius.ts
```

#### Passo 2: Criar 6 endpoints

Seguir o padrao do codebase: pasta por endpoint, `index.ts` barrel + handler.

**Estrutura de pastas a criar:**

```
apps/api/src/endpoints/
  orchRecapToday/
    index.ts
    orchRecapToday.ts
  orchRecapStart/
    index.ts
    orchRecapStart.ts
  orchRecapAnswer/
    index.ts
    orchRecapAnswer.ts
  orchRecapComplete/
    index.ts
    orchRecapComplete.ts
  orchRecapHistory/
    index.ts
    orchRecapHistory.ts
  orchRecapStreak/
    index.ts
    orchRecapStreak.ts
```

#### Endpoint 1: GET /recap/today

**Arquivo:** `apps/api/src/endpoints/orchRecapToday/orchRecapToday.ts`

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchComenius } from '../../app/services/agents/orch-comenius';

export const method = 'get';
export const path = '/api/v1/orch/recap/today';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      const studentId = req.user.id;
      const tenantId = req.user.tenantContext.primaryTenantId;
      const result = await orchComenius.getToday(client, studentId, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

**Arquivo:** `apps/api/src/endpoints/orchRecapToday/index.ts`

```typescript
export * from './orchRecapToday';
```

#### Endpoint 2: POST /recap/:id/start

**Arquivo:** `apps/api/src/endpoints/orchRecapStart/orchRecapStart.ts`

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchComenius } from '../../app/services/agents/orch-comenius';

export const method = 'post';
export const path = '/api/v1/orch/recap/:id/start';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      const recapId = req.params.id;
      const studentId = req.user.id;
      // Validar ownership: recap pertence ao aluno
      const result = await orchComenius.startRecap(client, recapId, studentId);
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

#### Endpoint 3: POST /recap/:id/answer

**Arquivo:** `apps/api/src/endpoints/orchRecapAnswer/orchRecapAnswer.ts`

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { object, string } from 'yup';
import { requireAuth } from '../../app/auth';
import { orchComenius } from '../../app/services/agents/orch-comenius';

export const method = 'post';
export const path = '/api/v1/orch/recap/:id/answer';
export const middlewares = [requireAuth()];

const bodySchema = object({
  questionId: string().uuid().required(),
  answer: string().required(),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      const body = await bodySchema.validate(req.body);
      client = await pool.connect();
      const recapId = req.params.id;
      const studentId = req.user.id;
      const result = await orchComenius.answerQuestion(client, {
        recapId,
        studentId,
        questionId: body.questionId,
        answer: body.answer,
      });
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

#### Endpoint 4: POST /recap/:id/complete

**Arquivo:** `apps/api/src/endpoints/orchRecapComplete/orchRecapComplete.ts`

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchComenius } from '../../app/services/agents/orch-comenius';

export const method = 'post';
export const path = '/api/v1/orch/recap/:id/complete';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      const recapId = req.params.id;
      const studentId = req.user.id;
      const result = await orchComenius.completeRecap(client, recapId, studentId);
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

#### Endpoint 5: GET /recap/history

**Arquivo:** `apps/api/src/endpoints/orchRecapHistory/orchRecapHistory.ts`

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchComenius } from '../../app/services/agents/orch-comenius';

export const method = 'get';
export const path = '/api/v1/orch/recap/history';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      const studentId = req.user.id;
      const tenantId = req.user.tenantContext.primaryTenantId;
      const limit = parseInt(req.query.limit as string) || 30;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await orchComenius.getHistory(client, studentId, tenantId, { limit, offset });
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

#### Endpoint 6: GET /recap/streak

**Arquivo:** `apps/api/src/endpoints/orchRecapStreak/orchRecapStreak.ts`

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchComenius } from '../../app/services/agents/orch-comenius';

export const method = 'get';
export const path = '/api/v1/orch/recap/streak';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      const studentId = req.user.id;
      const result = await orchComenius.getStreak(client, studentId);
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

**index.ts de cada um:** Copiar o padrao `export * from './orchRecapXxx';`

#### Passo 3: CRON batch de recaps

O Comenius gera recaps diarios as 06:05. Adicionar no scheduler (ver STORY-02.8):

```typescript
// Gera recaps para todos alunos ativos, em batches de 50
// Schedule: '5 6 * * *' (06:05 todo dia)
await orchComenius.generateDailyRecapsBatch(client, tenantId);
```

### Frontend

#### DailyRecapWidget.tsx

**Arquivo:** `apps/web/src/components/orch/DailyRecapWidget.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Brain, Play, CheckCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api'; // ajustar path conforme codebase

interface RecapResponse {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'expired';
  questions: Array<{
    id: string;
    text: string;
    type: 'multiple_choice' | 'true_false' | 'fill_blank';
    options?: string[];
  }>;
  totalQuestions: number;
  completedToday: boolean;
  xpEarned?: number;
  streakDay?: number;
}

export function DailyRecapWidget({ studentId }: { studentId: string }) {
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<RecapResponse>('/api/v1/orch/recap/today')
      .then(setRecap)
      .catch(() => setRecap(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse h-20 bg-gray-100 rounded-lg" />;
  if (!recap) return null; // sem recap disponivel

  // Estados: pending → in_progress → completed
  if (recap.status === 'completed') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
        <CheckCircle className="text-green-600 w-6 h-6" />
        <div>
          <p className="font-semibold text-green-800">Revisao do dia concluida!</p>
          <p className="text-sm text-green-600">+{recap.xpEarned} XP | Streak: {recap.streakDay} dias</p>
        </div>
      </div>
    );
  }

  if (recap.status === 'in_progress') {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="font-semibold text-blue-800">Revisao em andamento...</p>
        {/* Renderizar RecapQuizScreen inline ou redirecionar */}
      </div>
    );
  }

  // pending
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Brain className="text-indigo-600 w-6 h-6" />
        <div>
          <p className="font-semibold text-indigo-800">Revisao do Dia</p>
          <p className="text-sm text-indigo-600">{recap.totalQuestions} perguntas personalizadas (~2 min)</p>
        </div>
      </div>
      <button
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2"
        onClick={() => {/* startRecap() e navegar para quiz */}}
      >
        <Play className="w-4 h-4" /> Comecar
      </button>
    </div>
  );
}
```

#### RecapQuizScreen.tsx

**Arquivo:** `apps/web/src/components/orch/RecapQuizScreen.tsx`

Componentes internos:
- Pergunta com opcoes (multipla escolha) ou input (fill_blank)
- Feedback imediato: verde (correto) ou vermelho (errado) + explicacao
- Barra de progresso (1/5, 2/5...)
- Confetti no final: `npm install canvas-confetti` + `npm install -D @types/canvas-confetti`
- XP animado subindo

```typescript
// Estrutura basica:
interface QuizScreenProps {
  recapId: string;
  questions: Question[];
  onComplete: (result: RecapResult) => void;
}

// Fluxo:
// 1. Mostrar pergunta atual (questionIndex)
// 2. Aluno responde → POST /recap/:id/answer
// 3. Mostrar feedback (correct/incorrect + explanation)
// 4. Botao "Proxima" → questionIndex++
// 5. Ultima pergunta → POST /recap/:id/complete
// 6. Tela final: confetti + XP + streak
```

Para o confetti no final:

```typescript
import confetti from 'canvas-confetti';

// Apos completar:
confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
```

### Validacao completa

```bash
# 1. Gerar recap batch (simular CRON)
curl -X POST http://localhost:3000/api/v1/orch/recap/generate-batch \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Buscar recap do dia como aluno
curl http://localhost:3000/api/v1/orch/recap/today \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# Resposta: { id, status: "pending", questions: [...5], totalQuestions: 5 }

# 3. Iniciar recap
curl -X POST http://localhost:3000/api/v1/orch/recap/RECAP_ID/start \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# Resposta: { status: "in_progress" }

# 4. Responder uma pergunta
curl -X POST http://localhost:3000/api/v1/orch/recap/RECAP_ID/answer \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"questionId":"QUESTION_UUID","answer":"alternativa_b"}'
# Resposta: { correct: true/false, explanation: "...", xpEarned: 5 }

# 5. Completar recap (apos responder todas)
curl -X POST http://localhost:3000/api/v1/orch/recap/RECAP_ID/complete \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# Resposta: { totalCorrect: 4, totalQuestions: 5, xpEarned: 30, streakDay: 3 }

# 6. Verificar streak
curl http://localhost:3000/api/v1/orch/recap/streak \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# Resposta: { currentStreak: 3, bestStreak: 5, lastRecapDate: "2026-03-23" }
```

**Criterio de aceite:** Quiz com 5 perguntas personalizadas, feedback imediato, XP concedido, streak atualizado, confetti no final.

---

## STORY-02.5: Sisifo — Gamification Engine (8 pts, Backend+Frontend)

**Complexidade:** Alta
**Tempo:** 3-4 dias
**Arquivo pronto:** `implementation/services/agents/orch-sisifo.ts`

### Backend

#### Passo 1: Copiar service

```bash
cp implementation/services/agents/orch-sisifo.ts \
   apps/api/src/app/services/agents/orch-sisifo.ts
```

#### Passo 2: Ajustar imports

```typescript
import { orchLLMService } from '../orch-llm-service';
import { orchProfileService } from '../orch-profile-service';
```

#### Passo 3: Criar 5 endpoints

**Estrutura de pastas:**

```
apps/api/src/endpoints/
  orchGamificationStatus/
    index.ts
    orchGamificationStatus.ts
  orchLeaderboard/
    index.ts
    orchLeaderboard.ts
  orchBadges/
    index.ts
    orchBadges.ts
  orchMissions/
    index.ts
    orchMissions.ts
  orchClaimBadge/
    index.ts
    orchClaimBadge.ts
```

#### Endpoint 1: GET /gamification/status

**Arquivo:** `apps/api/src/endpoints/orchGamificationStatus/orchGamificationStatus.ts`

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchSisifo } from '../../app/services/agents/orch-sisifo';

export const method = 'get';
export const path = '/api/v1/orch/gamification/status';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      const studentId = req.user.id;
      const tenantId = req.user.tenantContext.primaryTenantId;
      const result = await orchSisifo.getStatus(client, studentId, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

#### Endpoint 2: GET /leaderboard

**Arquivo:** `apps/api/src/endpoints/orchLeaderboard/orchLeaderboard.ts`

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchSisifo } from '../../app/services/agents/orch-sisifo';

export const method = 'get';
export const path = '/api/v1/orch/leaderboard';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      const tenantId = req.user.tenantContext.primaryTenantId;
      const classInstanceId = req.query.classId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await orchSisifo.getLeaderboard(client, tenantId, classInstanceId, limit);
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

#### Endpoint 3: GET /badges

```typescript
// Path: /api/v1/orch/badges
// Mesma estrutura: requireAuth → orchSisifo.getBadges(client, studentId, tenantId)
```

#### Endpoint 4: GET /missions

```typescript
// Path: /api/v1/orch/missions
// Mesma estrutura: requireAuth → orchSisifo.getMissions(client, studentId, tenantId)
```

#### Endpoint 5: POST /claim-badge

**Arquivo:** `apps/api/src/endpoints/orchClaimBadge/orchClaimBadge.ts`

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { object, string } from 'yup';
import { requireAuth } from '../../app/auth';
import { orchSisifo } from '../../app/services/agents/orch-sisifo';

export const method = 'post';
export const path = '/api/v1/orch/claim-badge';
export const middlewares = [requireAuth()];

const bodySchema = object({
  badgeId: string().required(),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      const body = await bodySchema.validate(req.body);
      client = await pool.connect();
      const studentId = req.user.id;
      const result = await orchSisifo.claimBadge(client, { studentId, badgeId: body.badgeId });
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

#### Passo 4: CRON de streaks

Adicionar no scheduler (STORY-02.8):

```typescript
// Schedule: '59 23 * * *' (23:59 todo dia)
// Verifica se cada aluno ativo fez atividade hoje
// Se nao fez: streak_days = 0, streak_broken_at = now
await orchSisifo.checkStreaksBatch(client, tenantId);
```

#### Regras de XP — Referencia rapida

**NUNCA remover XP.** Apenas adicionar. Ledger imutavel em `orch_xp_transaction`.

| Acao | XP | source_type |
|------|----|-------------|
| Login diario | 5 | `daily_login` |
| Video completo | 10 | `video_complete` |
| Recap pergunta correta | 5 | `recap_correct` |
| Recap perfeito (5/5) | +10 bonus | `recap_perfect` |
| Interacao AI | 5 | `ai_interaction` |
| Tarefa entregue | 15 | `task_submit` |
| Nota >= 8 | +10 | `high_grade` |
| Forum (post/reply) | 5 | `forum_post` |
| Streak 3 dias | +15 | `streak_3` |
| Streak 7 dias | +30 | `streak_7` |
| Streak 30 dias | +100 | `streak_30` |

#### Niveis (12)

```
L1:  0     XP  — Novato
L2:  100   XP  — Aprendiz
L3:  300   XP  — Estudante
L4:  600   XP  — Dedicado
L5:  1000  XP  — Scholar
L6:  1500  XP  — Expert
L7:  2100  XP  — Mestre
L8:  2800  XP  — Guru
L9:  3600  XP  — Lenda
L10: 4500  XP  — ORCH Master
L11: 5500  XP  — Iluminado
L12: 7000  XP  — Transcendente
```

Para calcular nivel: iterar thresholds de cima para baixo, primeiro match = nivel.

### Frontend

#### GamificationBar.tsx (header do AVA)

**Arquivo:** `apps/web/src/components/orch/GamificationBar.tsx`

Componente para o header do player/AVA. Mostra resumo compacto:

```typescript
// Layout: [XP Badge] [Streak Fire] [Level Progress]
// XP Badge: circulo com numero + "XP"
// Streak Fire: icone Flame (lucide) + numero de dias (so aparece se streak > 0)
// Level Progress: barra fina com % para proximo nivel
// Clique em qualquer elemento → abre GamificationPanel (overlay/drawer)

// Fetch: GET /gamification/status
// Dados: { xp, level, streak, nextLevelXp, rank }
```

Icones: `Trophy`, `Flame`, `Star` de `lucide-react`.

#### GamificationPanel.tsx (drawer/overlay)

**Arquivo:** `apps/web/src/components/orch/GamificationPanel.tsx`

4 tabs:

```
Tab "Perfil":
  - Avatar do aluno
  - Nome do nivel + icone
  - XP total + barra para proximo nivel
  - Streak atual + recorde
  - Radar chart Octalysis (6 eixos — pode usar SVG simples ou recharts)

Tab "Badges":
  - Grid 3 colunas
  - Badge desbloqueado: colorido + nome + data
  - Badge bloqueado: cinza + silhueta + "???"
  - Badge "ready to claim": borda pulsante + botao "Resgatar"

Tab "Missoes":
  - Lista vertical
  - Cada missao: titulo + descricao + barra de progresso + XP reward
  - Missoes completadas: checkmark verde
  - Missoes ativas: progresso parcial

Tab "Ranking":
  - Tabela: posicao + avatar + nome + XP + nivel
  - Aluno atual destacado (bg amarelo)
  - Toggle: "Minha Turma" | "Escola"
  - Top 3 com medalha (ouro/prata/bronze)
```

### Validacao

```sql
-- Apos awardXP:
SELECT xp_total, level, streak_days, badges
FROM orch_gamification
WHERE student_id = '<UUID>';
-- xp_total deve ter incrementado
-- level pode ter subido
-- badges deve ser JSONB array

-- Ledger de transacoes:
SELECT source_type, xp_amount, created_at
FROM orch_xp_transaction
WHERE student_id = '<UUID>'
ORDER BY created_at DESC
LIMIT 10;
-- Deve ter registro de cada acao
```

```bash
# Status
curl http://localhost:3000/api/v1/orch/gamification/status \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# { xp: 135, level: 2, streak: 3, nextLevelXp: 300, rank: 5 }

# Leaderboard
curl "http://localhost:3000/api/v1/orch/leaderboard?limit=10" \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# { entries: [{ rank: 1, displayName: "...", xp: 450, level: 3 }, ...] }

# Claim badge
curl -X POST http://localhost:3000/api/v1/orch/claim-badge \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"badgeId":"first_recap"}'
# { claimed: true, badge: { id: "first_recap", title: "Primeira Revisao", icon: "brain", rarity: "common" } }
```

**Criterio de aceite:** XP concedido corretamente, niveis calculados, streak funciona, leaderboard ordenado, badges claimaveis, panel renderiza 4 tabs.

---

## STORY-02.6: Bloom — Mastery Learning (5 pts, Backend+Frontend)

**Complexidade:** Media
**Tempo:** 2-3 dias
**Arquivo pronto:** `implementation/services/agents/orch-bloom.ts`

### Backend

#### Passo 1: Copiar service

```bash
cp implementation/services/agents/orch-bloom.ts \
   apps/api/src/app/services/agents/orch-sisifo.ts
```

**CORRECAO — comando certo:**

```bash
cp implementation/services/agents/orch-bloom.ts \
   apps/api/src/app/services/agents/orch-bloom.ts
```

#### Passo 2: Criar 5 endpoints

**Estrutura de pastas:**

```
apps/api/src/endpoints/
  orchGradesSummary/
    index.ts
    orchGradesSummary.ts
  orchGradesSimulate/
    index.ts
    orchGradesSimulate.ts
  orchStudyPlan/
    index.ts
    orchStudyPlan.ts
  orchStudyPlanGenerate/
    index.ts
    orchStudyPlanGenerate.ts
  orchStudentXray/
    index.ts
    orchStudentXray.ts
```

#### Endpoint 1: GET /grades/summary

```typescript
// Path: /api/v1/orch/grades/summary
// Auth: requireAuth() — student role
// Service: orchBloom.getGradesSummary(client, { studentId, tenantId })
// Response: { subjects: [{ name, average, trend, assessments: [...] }], overallAverage }
```

#### Endpoint 2: POST /grades/simulate

```typescript
// Path: /api/v1/orch/grades/simulate
// Auth: requireAuth() — student role
// Body: { assessmentId: string, desiredGrade: number }
// Validation: desiredGrade >= 0 && desiredGrade <= 10
// Service: orchBloom.simulateGrade(client, { studentId, assessmentId, desiredGrade })
// Response: { currentAverage, desiredAverage, neededGrades: [{ assessment, minGrade }] }
```

#### Endpoint 3: GET /study-plan

```typescript
// Path: /api/v1/orch/study-plan
// Auth: requireAuth() — student role
// Service: orchBloom.getStudyPlan(client, studentId)
// Response: { plan: { remember: [...], understand: [...], apply: [...] }, generatedAt }
```

#### Endpoint 4: POST /study-plan/generate

```typescript
// Path: /api/v1/orch/study-plan/generate
// Auth: requireAuth() — student role
// Body: { unitId?: string } (opcional — se vazio, gera para unidade atual)
// Service: orchBloom.generateStudyPlan(client, { studentId, tenantId, unitId? })
// ATENCAO: consome 1 chamada LLM (~500 tokens). Rate limit: 1 geracao por hora.
```

#### Endpoint 5: GET /student-xray/:studentId (PROFESSOR ONLY)

```typescript
import { RequestHandler } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchBloom } from '../../app/services/agents/orch-bloom';

export const method = 'get';
export const path = '/api/v1/orch/student-xray/:studentId';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    let client;
    try {
      client = await pool.connect();
      const requesterId = req.user.id;
      const tenantId = req.user.tenantContext.primaryTenantId;
      const targetStudentId = req.params.studentId;

      // VALIDAR ROLE: somente professores e admins
      // Verificar se req.user tem role 'teacher', 'instructor', ou 'admin'
      // Se nao tiver: return res.status(403).json({ error: 'Forbidden: teacher role required' });
      const userRoles = req.user.roles || [];
      const isTeacherOrAdmin = userRoles.some((r: string) =>
        ['teacher', 'instructor', 'admin', 'coordinator'].includes(r)
      );
      if (!isTeacherOrAdmin) {
        return res.status(403).json({ error: 'Acesso restrito a professores e coordenadores' });
      }

      const result = await orchBloom.getStudentXray(client, { studentId: targetStudentId, tenantId });
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client?.release();
    }
  };
}
```

### Frontend

#### GradesWidget.tsx

**Arquivo:** `apps/web/src/components/orch/GradesWidget.tsx`

```typescript
// Card compacto para o dashboard do aluno:
// - Media geral em destaque (numero grande)
// - Seta de tendencia: TrendingUp (verde), TrendingDown (vermelho), Minus (cinza)
// - Botao "Quanto preciso tirar?" → abre modal simulador
// Fetch: GET /grades/summary
```

#### GradeSimulatorModal.tsx

**Arquivo:** `apps/web/src/components/orch/GradeSimulatorModal.tsx`

```typescript
// Modal com:
// - Dropdown: selecionar avaliacao futura
// - Slider ou input: nota desejada (0-10, step 0.5)
// - Botao "Simular" → POST /grades/simulate
// - Resultado: "Para media 8.0, voce precisa tirar no minimo 9.5 na P2"
// - Se impossivel: "Infelizmente, a media maxima possivel e 7.8"
```

#### StudyPlanCard.tsx

**Arquivo:** `apps/web/src/components/orch/StudyPlanCard.tsx`

```typescript
// 3 secoes Bloom (acordeao/expandable):
//
// 1. "Lembrar" (azul claro)
//    - Atividades de memorizacao: flashcards, revisao de conceitos
//    - Checkbox por atividade (estado local — useState, sem persistir por ora)
//
// 2. "Compreender" (azul medio)
//    - Atividades de compreensao: resumo, explicar para si mesmo
//    - Checkbox por atividade
//
// 3. "Aplicar" (azul escuro)
//    - Exercicios praticos, problemas
//    - Checkbox por atividade
//
// Botao "Gerar novo plano" → POST /study-plan/generate
// Rate limit visual: "Proximo plano disponivel em 45 minutos"
```

### Validacao

```bash
# Grades summary
curl http://localhost:3000/api/v1/orch/grades/summary \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# { subjects: [...], overallAverage: 7.3 }

# Simular nota
curl -X POST http://localhost:3000/api/v1/orch/grades/simulate \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assessmentId":"UUID","desiredGrade":8.0}'
# { currentAverage: 7.3, neededGrades: [{ assessment: "P2", minGrade: 9.5 }] }

# Gerar plano de estudo
curl -X POST http://localhost:3000/api/v1/orch/study-plan/generate \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
# { plan: { remember: [...], understand: [...], apply: [...] }, generatedAt: "..." }

# X-ray como professor
curl http://localhost:3000/api/v1/orch/student-xray/STUDENT_UUID \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# { student: { name, engagement, grades, concepts, riskLevel, recommendations } }

# X-ray como aluno (deve falhar)
curl http://localhost:3000/api/v1/orch/student-xray/STUDENT_UUID \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# 403 Forbidden
```

**Criterio de aceite:** Notas reais retornadas, simulador calcula corretamente, plano de estudo com 3 niveis Bloom, X-ray restrito a professores.

---

## STORY-02.7: Taylor — Engagement Monitor (3 pts, Backend)

**Complexidade:** Media
**Tempo:** 1 dia
**Arquivo pronto:** `implementation/services/agents/orch-taylor.ts`

### Passo 1: Copiar service

```bash
cp implementation/services/agents/orch-taylor.ts \
   apps/api/src/app/services/agents/orch-taylor.ts
```

### Passo 2: Ajustar imports

```typescript
import { orchProfileService } from '../orch-profile-service';
```

### Passo 3: Integrar no pipeline do chat (background)

Abrir o handler de chat e adicionar ao `Promise.allSettled` que ja tem o Ebbinghaus:

```typescript
import { orchTaylor } from '../../app/services/agents/orch-taylor';

// === No trecho do Promise.allSettled (apos enviar resposta SSE) ===
Promise.allSettled([
  orchEbbinghaus.extractConcepts(client, { /* ... */ }),
  orchTaylor.calculateEngagement(client, {
    studentId: req.user.id,
    tenantId: req.user.tenantContext.primaryTenantId,
  }),
]).catch(() => {});
```

### Passo 4: CRON de snapshot diario

Adicionar no scheduler (STORY-02.8):

```typescript
// Schedule: '0 14 * * *' (14:00 todo dia)
// Tira snapshot de engagement para TODOS alunos ativos
await orchTaylor.snapshotEngagement(client, tenantId);
```

### Taylor e INVISIVEL

Taylor NAO tem endpoints diretos para o aluno. Ele e um agente de background que:

1. Calcula scores a cada interacao (background no chat)
2. Faz snapshot diario via CRON (14:00)
3. Seus dados sao consumidos por OUTROS agentes:
   - **Foucault** (EPIC-03): detecta alunos em risco
   - **Weber** (EPIC-03): gera relatorio D7 semanal
   - **Bloom** (EPIC-02): usa no student X-ray

### 6 sub-scores (0-100 cada)

| Sub-score | Calculo | Peso |
|-----------|---------|------|
| `login_score` | Diario=100, semanal=60, quinzenal=30, mensal=10 | 15% |
| `time_score` | >60min/dia=100, >30=70, >15=40, <15=20 | 20% |
| `content_score` | videos/materiais consumidos vs total disponivel | 25% |
| `social_score` | mensagens no forum/chat | 10% |
| `assessment_score` | notas e entregas no prazo | 20% |
| `ai_score` | interacoes com agentes ORCH | 10% |

**Score composto:** media ponderada dos 6 sub-scores.

### Validacao

```sql
-- Apos CRON rodar (ou apos interacao com chat):
SELECT
  snapshot_date,
  login_score, time_score, content_score,
  social_score, assessment_score, ai_score,
  composite_score
FROM orch_engagement_snapshot
WHERE student_id = '<UUID>'
ORDER BY snapshot_date DESC
LIMIT 7;

-- Validar:
-- 1. Um registro por dia (nao duplicado)
-- 2. Todos scores entre 0 e 100
-- 3. composite_score = media ponderada correta
-- 4. Nenhum campo NULL

-- Verificar media ponderada manualmente:
-- composite = (login*0.15 + time*0.20 + content*0.25 + social*0.10 + assessment*0.20 + ai*0.10)
SELECT
  composite_score,
  ROUND(
    login_score * 0.15 +
    time_score * 0.20 +
    content_score * 0.25 +
    social_score * 0.10 +
    assessment_score * 0.20 +
    ai_score * 0.10
  ) as calculated
FROM orch_engagement_snapshot
WHERE student_id = '<UUID>'
ORDER BY snapshot_date DESC LIMIT 1;
-- composite_score e calculated devem ser iguais (+-1 por arredondamento)
```

**Criterio de aceite:** Snapshots diarios salvos, 6 sub-scores corretos, media ponderada batendo, zero impacto no tempo de resposta do chat.

---

## STORY-02.8: CRONs da Fase 2 (2 pts, Infrastructure)

**Complexidade:** Baixa
**Tempo:** meio dia
**Arquivo pronto:** `implementation/services/orch-cron-config.ts`

### Passo 1: Copiar config

```bash
cp implementation/services/orch-cron-config.ts \
   apps/api/src/app/services/orch-cron-config.ts
```

### Passo 2: Verificar se ja existe scheduler

```bash
# Procurar se o projeto ja usa node-cron ou similar
grep -r "node-cron\|cron.schedule\|setInterval.*cron" apps/api/src/ --include="*.ts"
```

**Se ja existir scheduler:** Integrar os jobs ORCH no scheduler existente, seguindo o padrao do projeto.

**Se NAO existir:** Criar um basico.

### Passo 3: Criar scheduler (se necessario)

Instalar dependencia:

```bash
cd apps/api && npm install node-cron && npm install -D @types/node-cron
```

**Arquivo:** `apps/api/src/app/cron/orch-scheduler.ts`

```typescript
import cron from 'node-cron';
import { Pool } from 'pg';
import { ORCH_CRON_JOBS } from '../services/orch-cron-config';

export function startOrchCrons(pool: Pool): void {
  for (const job of ORCH_CRON_JOBS) {
    if (!job.enabled) continue;

    cron.schedule(job.schedule, async () => {
      const startTime = Date.now();
      let client;
      try {
        client = await pool.connect();
        console.log(`[ORCH-CRON] Starting: ${job.id} (${job.description})`);

        const service = await import(`../services/agents/${job.service}`);
        await service[job.handler](client);

        const elapsed = Date.now() - startTime;
        console.log(`[ORCH-CRON] Completed: ${job.id} (${elapsed}ms)`);
      } catch (err) {
        const elapsed = Date.now() - startTime;
        console.error(`[ORCH-CRON] Failed: ${job.id} (${elapsed}ms):`, err);

        if (job.retryOnFailure) {
          console.log(`[ORCH-CRON] Retry scheduled for: ${job.id}`);
          // Retry simples: tentar novamente em 5 minutos
          setTimeout(async () => {
            let retryClient;
            try {
              retryClient = await pool.connect();
              const service = await import(`../services/agents/${job.service}`);
              await service[job.handler](retryClient);
              console.log(`[ORCH-CRON] Retry succeeded: ${job.id}`);
            } catch (retryErr) {
              console.error(`[ORCH-CRON] Retry failed: ${job.id}:`, retryErr);
            } finally {
              retryClient?.release();
            }
          }, 5 * 60 * 1000);
        }
      } finally {
        client?.release();
      }
    });
  }

  console.log(`[ORCH-CRON] ${ORCH_CRON_JOBS.filter(j => j.enabled).length} jobs scheduled`);
}
```

### Passo 4: Registrar no boot da API

Localizar o arquivo de boot principal da API (provavelmente `apps/api/src/main.ts` ou `apps/api/src/app/index.ts`):

```bash
# Encontrar o entrypoint
grep -r "app.listen\|server.listen" apps/api/src/ --include="*.ts" -l
```

Adicionar APOS o servidor estar ouvindo:

```typescript
import { startOrchCrons } from './app/cron/orch-scheduler';

// Apos app.listen():
startOrchCrons(pool);
```

### Tabela de CRONs EPIC-02

| Schedule | Horario | Job ID | Servico | Handler |
|----------|---------|--------|---------|---------|
| `0 5 * * *` | 05:00 | `orch-health-check` | orch-hub-router | `healthCheck` |
| `0 6 * * *` | 06:00 | `orch-review-due` | orch-ebbinghaus | `sendReviewReminders` |
| `5 6 * * *` | 06:05 | `orch-generate-recaps` | orch-comenius | `generateDailyRecapsBatch` |
| `0 14 * * *` | 14:00 | `orch-engagement-snapshot` | orch-taylor | `snapshotEngagement` |
| `59 23 * * *` | 23:59 | `orch-check-streaks` | orch-sisifo | `checkStreaksBatch` |
| `0 * * * *` | Toda hora | `orch-circuit-check` | orch-hub-router | `checkCircuitBreaker` |

### Validacao

```bash
# 1. Reiniciar API
npm run dev

# 2. Verificar nos logs que CRONs foram registrados
# Deve aparecer: "[ORCH-CRON] 6 jobs scheduled"

# 3. Para testar um CRON manualmente sem esperar o horario:
curl -X POST http://localhost:3000/api/v1/orch/admin/trigger-cron \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"orch-generate-recaps"}'
# (Se o endpoint de trigger existir. Se nao, disparar via psql ou esperar.)

# 4. Verificar que recap foi gerado apos trigger:
curl http://localhost:3000/api/v1/orch/recap/today \
  -H "Authorization: Bearer $STUDENT_TOKEN"
```

**Criterio de aceite:** 6 CRONs rodando nos horarios corretos, logs confirmando execucao, retry em caso de falha.

---

## STORY-02.9: Rich Messages + Player Suggestions (5 pts, Frontend)

**Complexidade:** Media
**Tempo:** 2-3 dias

### Rich Messages — 5 componentes

Criar pasta: `apps/web/src/components/orch/rich-messages/`

#### 1. HintBlock.tsx

**Arquivo:** `apps/web/src/components/orch/rich-messages/HintBlock.tsx`

```typescript
import { Lightbulb } from 'lucide-react';

interface HintBlockProps {
  level: 1 | 2 | 3 | 4 | 5;
  content: string;
}

const LEVEL_CONFIG = {
  1: { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-800', label: 'Guia' },
  2: { border: 'border-blue-300', bg: 'bg-blue-100', text: 'text-blue-900', label: 'Dica' },
  3: { border: 'border-yellow-300', bg: 'bg-yellow-50', text: 'text-yellow-900', label: 'Exemplo' },
  4: { border: 'border-orange-300', bg: 'bg-orange-50', text: 'text-orange-900', label: 'Explicacao' },
  5: { border: 'border-green-300', bg: 'bg-green-50', text: 'text-green-900', label: 'Resposta' },
};

export function HintBlock({ level, content }: HintBlockProps) {
  const config = LEVEL_CONFIG[level];
  return (
    <div className={`${config.bg} ${config.border} border-l-4 rounded-r-lg p-4 my-2`}>
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className={`w-4 h-4 ${config.text}`} />
        <span className={`text-xs font-semibold uppercase ${config.text}`}>
          {config.label} (nivel {level})
        </span>
      </div>
      <p className={`${config.text} text-sm`}>{content}</p>
    </div>
  );
}
```

#### 2. QuizInline.tsx

**Arquivo:** `apps/web/src/components/orch/rich-messages/QuizInline.tsx`

```typescript
import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

interface QuizInlineProps {
  question: string;
  type: 'multiple_choice' | 'true_false' | 'fill_blank';
  options?: string[];
  onAnswer: (answer: string) => void;
  disabled?: boolean;
  feedback?: { correct: boolean; explanation: string };
}

export function QuizInline({ question, type, options, onAnswer, disabled, feedback }: QuizInlineProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (answer: string) => {
    setSelected(answer);
    onAnswer(answer);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 my-2">
      <p className="font-medium text-gray-900 mb-3">{question}</p>

      {type === 'fill_blank' ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={disabled}
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder="Digite sua resposta..."
          />
          <button
            onClick={() => handleSubmit(inputValue)}
            disabled={disabled || !inputValue}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {(options || ['Verdadeiro', 'Falso']).map((opt, i) => (
            <button
              key={i}
              onClick={() => handleSubmit(opt)}
              disabled={disabled}
              className={`w-full text-left px-4 py-2 rounded border text-sm transition
                ${selected === opt
                  ? feedback?.correct ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'
                  : 'bg-white border-gray-200 hover:border-indigo-300'
                }
                ${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}
              `}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {feedback && (
        <div className={`mt-3 flex items-start gap-2 text-sm ${feedback.correct ? 'text-green-700' : 'text-red-700'}`}>
          {feedback.correct
            ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          }
          <span>{feedback.explanation}</span>
        </div>
      )}
    </div>
  );
}
```

#### 3. ProgressBar.tsx

**Arquivo:** `apps/web/src/components/orch/rich-messages/ProgressBar.tsx`

```typescript
import { CheckCircle } from 'lucide-react';

interface ProgressBarProps {
  value: number; // 0-1
  label: string;
  color?: string; // tailwind color class, default 'bg-blue-500'
}

export function ProgressBar({ value, label, color = 'bg-blue-500' }: ProgressBarProps) {
  const percent = Math.round(value * 100);
  const isMastered = value >= 1.0;

  return (
    <div className="my-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-xs font-semibold ${isMastered ? 'text-green-600' : 'text-gray-500'}`}>
          {isMastered ? (
            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Dominado</span>
          ) : (
            `${percent}%`
          )}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${isMastered ? 'bg-green-500' : color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
```

#### 4. CodeBlock.tsx

**Arquivo:** `apps/web/src/components/orch/rich-messages/CodeBlock.tsx`

```typescript
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2 rounded-lg overflow-hidden">
      <div className="flex justify-between items-center bg-gray-800 px-4 py-1.5">
        <span className="text-xs text-gray-400">{language}</span>
        <button onClick={handleCopy} className="text-gray-400 hover:text-white transition">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <pre className="bg-gray-900 text-green-400 p-4 overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
    </div>
  );
}
```

#### 5. Expandable.tsx

**Arquivo:** `apps/web/src/components/orch/rich-messages/Expandable.tsx`

```typescript
import { useState, useRef, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

interface ExpandableProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function Expandable({ title, children, defaultOpen = false }: ExpandableProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(open ? contentRef.current.scrollHeight : 0);
    }
  }, [open]);

  return (
    <div className="border border-gray-200 rounded-lg my-2 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
      >
        <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        {title}
      </button>
      <div
        style={{ maxHeight: height !== undefined ? height : 'none' }}
        className="transition-all duration-300 overflow-hidden"
      >
        <div ref={contentRef} className="px-4 pb-3">
          {children}
        </div>
      </div>
    </div>
  );
}
```

#### Barrel export

**Arquivo:** `apps/web/src/components/orch/rich-messages/index.ts`

```typescript
export { HintBlock } from './HintBlock';
export { QuizInline } from './QuizInline';
export { ProgressBar } from './ProgressBar';
export { CodeBlock } from './CodeBlock';
export { Expandable } from './Expandable';
```

### Parser de Rich Messages

Integrar no componente de chat (OrchChat.tsx ou AIChatTab) um parser que detecta marcadores na resposta SSE:

**Arquivo:** `apps/web/src/components/orch/rich-messages/parseRichMessage.tsx`

```typescript
import React from 'react';
import { HintBlock } from './HintBlock';
import { QuizInline } from './QuizInline';
import { ProgressBar } from './ProgressBar';
import { CodeBlock } from './CodeBlock';

// Marcadores que o backend envia:
// [HINT:N]conteudo[/HINT]
// [QUIZ]{"question":"...","type":"multiple_choice","options":["a","b"]}[/QUIZ]
// [PROGRESS:0.7:Label]
// ```lang\n code \n```

export function parseRichMessage(
  text: string,
  onQuizAnswer?: (answer: string) => void
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Pattern: [HINT:N]...[/HINT]
  const hintRegex = /\[HINT:(\d)\]([\s\S]*?)\[\/HINT\]/;
  // Pattern: [QUIZ]{...}[/QUIZ]
  const quizRegex = /\[QUIZ\]([\s\S]*?)\[\/QUIZ\]/;
  // Pattern: [PROGRESS:value:label]
  const progressRegex = /\[PROGRESS:([\d.]+):([^\]]+)\]/;
  // Pattern: ```lang\n...\n```
  const codeRegex = /```(\w+)\n([\s\S]*?)```/;

  while (remaining.length > 0) {
    // Encontrar o proximo marcador
    const hintMatch = hintRegex.exec(remaining);
    const quizMatch = quizRegex.exec(remaining);
    const progressMatch = progressRegex.exec(remaining);
    const codeMatch = codeRegex.exec(remaining);

    const matches = [
      hintMatch && { type: 'hint', match: hintMatch, index: hintMatch.index },
      quizMatch && { type: 'quiz', match: quizMatch, index: quizMatch.index },
      progressMatch && { type: 'progress', match: progressMatch, index: progressMatch.index },
      codeMatch && { type: 'code', match: codeMatch, index: codeMatch.index },
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      // Sem mais marcadores — texto puro
      if (remaining.trim()) {
        elements.push(<span key={key++}>{remaining}</span>);
      }
      break;
    }

    const first = matches[0]!;

    // Texto antes do marcador
    if (first.index > 0) {
      const before = remaining.substring(0, first.index);
      if (before.trim()) {
        elements.push(<span key={key++}>{before}</span>);
      }
    }

    // Renderizar componente
    switch (first.type) {
      case 'hint':
        elements.push(
          <HintBlock
            key={key++}
            level={parseInt(first.match![1]) as 1|2|3|4|5}
            content={first.match![2]}
          />
        );
        break;
      case 'quiz':
        try {
          const quizData = JSON.parse(first.match![1]);
          elements.push(
            <QuizInline
              key={key++}
              question={quizData.question}
              type={quizData.type}
              options={quizData.options}
              onAnswer={onQuizAnswer || (() => {})}
            />
          );
        } catch { /* JSON invalido — renderizar como texto */ }
        break;
      case 'progress':
        elements.push(
          <ProgressBar
            key={key++}
            value={parseFloat(first.match![1])}
            label={first.match![2]}
          />
        );
        break;
      case 'code':
        elements.push(
          <CodeBlock
            key={key++}
            language={first.match![1]}
            code={first.match![2]}
          />
        );
        break;
    }

    remaining = remaining.substring(first.index + first.match![0].length);
  }

  return elements;
}
```

### Integracao no OrchChat

Localizar onde as mensagens sao renderizadas no chat (provavelmente em `OrchChat.tsx` ou similar):

```typescript
// ANTES (texto puro):
<div className="message-content">{message.text}</div>

// DEPOIS (com rich messages):
import { parseRichMessage } from './rich-messages/parseRichMessage';

<div className="message-content">
  {parseRichMessage(message.text, handleQuizAnswer)}
</div>
```

### Player Suggestions (Video Bubbles)

**Arquivo:** `apps/web/src/components/player/VideoSuggestionBubble.tsx`

```typescript
import { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';

interface VideoSuggestionBubbleProps {
  trigger: 'paused' | 'rewind' | 'completed';
  onAskOrch: () => void;
  onDismiss: () => void;
}

const MESSAGES = {
  paused: 'Algo confuso? Posso ajudar!',
  rewind: 'Quer explorar esse tema juntos?',
  completed: 'O que achou? Recap esperando (~2min)',
};

export function VideoSuggestionBubble({ trigger, onAskOrch, onDismiss }: VideoSuggestionBubbleProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animacao de entrada
    const timer = setTimeout(() => setVisible(true), 300);
    // Auto-dismiss apos 10s
    const autoDismiss = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, 10000);
    return () => { clearTimeout(timer); clearTimeout(autoDismiss); };
  }, []);

  return (
    <div className={`
      fixed bottom-24 right-6 max-w-xs
      bg-white shadow-lg rounded-2xl p-4 border border-indigo-100
      transition-all duration-300
      ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
    `}>
      <button
        onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="bg-indigo-100 rounded-full p-2">
          <MessageCircle className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <p className="text-sm text-gray-700">{MESSAGES[trigger]}</p>
          <button
            onClick={onAskOrch}
            className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Falar com ORCH
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Hook para detectar eventos do player:**

**Arquivo:** `apps/web/src/hooks/useVideoSuggestions.ts`

```typescript
import { useState, useEffect, useRef } from 'react';

type SuggestionTrigger = 'paused' | 'rewind' | 'completed' | null;

export function useVideoSuggestions(videoRef: React.RefObject<HTMLVideoElement>) {
  const [trigger, setTrigger] = useState<SuggestionTrigger>(null);
  const pauseTimer = useRef<ReturnType<typeof setTimeout>>();
  const rewindCount = useRef(0);
  const dismissed = useRef(new Set<string>());

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPause = () => {
      // Se pausou e nao esta no final, esperar 30s
      if (video.currentTime < video.duration - 5) {
        pauseTimer.current = setTimeout(() => {
          if (!dismissed.current.has('paused')) setTrigger('paused');
        }, 30000); // 30 segundos
      }
    };

    const onPlay = () => {
      clearTimeout(pauseTimer.current);
    };

    const onSeeked = () => {
      // Detectar rebobinamento
      rewindCount.current++;
      if (rewindCount.current >= 3 && !dismissed.current.has('rewind')) {
        setTrigger('rewind');
      }
    };

    const onEnded = () => {
      if (!dismissed.current.has('completed')) setTrigger('completed');
    };

    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('ended', onEnded);
      clearTimeout(pauseTimer.current);
    };
  }, [videoRef]);

  const dismiss = () => {
    if (trigger) dismissed.current.add(trigger);
    setTrigger(null);
  };

  return { trigger, dismiss };
}
```

**Integracao no player:**

```typescript
// No componente do player de video:
import { useVideoSuggestions } from '../../hooks/useVideoSuggestions';
import { VideoSuggestionBubble } from './VideoSuggestionBubble';

// Dentro do componente:
const videoRef = useRef<HTMLVideoElement>(null);
const { trigger, dismiss } = useVideoSuggestions(videoRef);

// No JSX, apos o <video>:
{trigger && (
  <VideoSuggestionBubble
    trigger={trigger}
    onAskOrch={() => { dismiss(); /* abrir chat ORCH */ }}
    onDismiss={dismiss}
  />
)}
```

### Validacao

1. Abrir chat, interagir com Socrates sobre um tema dificil
   - Resposta deve conter `HintBlock` com cor e nivel corretos
2. Quando Socrates envia quiz inline, clicar numa opcao
   - Feedback imediato (verde/vermelho + explicacao)
   - Botoes desabilitados apos responder
3. Ver barra de progresso de conceito no chat
   - Valor crescendo conforme interage
   - 100% = verde com checkmark "Dominado"
4. Se Socrates enviar codigo, ver CodeBlock
   - Syntax highlight basico
   - Botao "Copiar" funciona
5. Pausar video >30 segundos
   - Balao aparece com "Algo confuso?"
   - Clicar "Falar com ORCH" abre o chat
   - Clicar X fecha o balao
   - Auto-fecha apos 10 segundos
6. Rebobinar video 3x
   - Balao "Quer explorar esse tema juntos?"
7. Video termina
   - Balao "O que achou? Recap esperando"

**Criterio de aceite:** 5 componentes rich renderizando corretamente, parser detecta marcadores, sugestoes do player nao-intrusivas e dismissaveis.

---

## CHECKLIST FINAL — EPIC-02 COMPLETO

Antes de declarar o EPIC-02 como DONE, validar TODOS os items:

### Database (STORY-02.1)
- [ ] 6 tabelas novas criadas (`orch_concept_memory`, `orch_daily_recap`, `orch_recap_question`, `orch_gamification`, `orch_xp_transaction`, `orch_engagement_snapshot`)
- [ ] Total de tabelas `orch_*` = 9 (3 EPIC-01 + 6 novas)
- [ ] Constraints CHECK validados (`status`, `question_type`)
- [ ] Indexes criados e listados com `\di orch_*`

### Socrates (STORY-02.2)
- [ ] Responde com metodo socratico (pergunta, nunca resposta direta nos niveis 1-3)
- [ ] 5 hint levels testados — nivel sobe conforme aluno nao entende
- [ ] RAG do conteudo da aula funciona (contexto relevante)
- [ ] Registrado no Hub Router (`ROUTE_MAP` + `AGENT_SERVICES`)

### Ebbinghaus (STORY-02.3)
- [ ] Extrai conceitos apos interacao com Socrates (background)
- [ ] SM-2 calculado corretamente (`easiness_factor` entre 1.3-2.5)
- [ ] `next_review_at` no futuro
- [ ] Zero impacto no tempo de resposta do chat

### Comenius (STORY-02.4)
- [ ] Quiz diario com 5 perguntas personalizadas
- [ ] Perguntas variam por tipo (`multiple_choice`, `true_false`, `fill_blank`)
- [ ] Feedback imediato por pergunta (correct/incorrect + explicacao)
- [ ] XP concedido ao completar
- [ ] Streak atualizado
- [ ] Widget DailyRecap renderiza (pending/in_progress/completed)
- [ ] Confetti no final do quiz

### Sisifo (STORY-02.5)
- [ ] XP concedido corretamente (nunca removido)
- [ ] Niveis calculados (12 niveis, thresholds corretos)
- [ ] Streak incrementa com atividade diaria, reseta sem
- [ ] Leaderboard ordenado por XP
- [ ] Badges claimaveis
- [ ] GamificationBar no header do AVA
- [ ] GamificationPanel com 4 tabs (Perfil, Badges, Missoes, Ranking)

### Bloom (STORY-02.6)
- [ ] Notas reais retornadas do sistema Orchestra
- [ ] Simulador "quanto preciso?" calcula corretamente
- [ ] Plano de estudo com 3 niveis Bloom (Lembrar/Compreender/Aplicar)
- [ ] X-ray restrito a professores (403 para alunos)

### Taylor (STORY-02.7)
- [ ] Snapshot diario salvo em `orch_engagement_snapshot`
- [ ] 6 sub-scores entre 0-100
- [ ] Media ponderada correta (15/20/25/10/20/10)
- [ ] Zero endpoints diretos para aluno (invisivel)

### CRONs (STORY-02.8)
- [ ] 6 CRONs registrados no boot
- [ ] Logs confirmam execucao (`[ORCH-CRON] Starting/Completed`)
- [ ] Retry em caso de falha

### Rich Messages (STORY-02.9)
- [ ] HintBlock renderiza com cor por nivel
- [ ] QuizInline funciona com feedback imediato
- [ ] ProgressBar mostra dominio do conceito
- [ ] CodeBlock com botao copiar
- [ ] Expandable com animacao
- [ ] Parser detecta marcadores no texto SSE
- [ ] VideoSuggestionBubble aparece nos triggers corretos (30s pause, 3x rewind, video end)
- [ ] Sugestoes nao-intrusivas e dismissaveis

### Seguranca (TODOS os endpoints)
- [ ] `requireAuth()` em TODOS os endpoints
- [ ] Validacao de ownership (`tenant_id` + `student_id`) antes de operar
- [ ] Role check no `student-xray` (professor/admin only)
- [ ] Zero `console.log` em producao (usar `console.error` apenas para erros)
- [ ] Quota check em TODA chamada Gemini (via `orchLLMService`)

---

## Sequencia de implementacao recomendada

```
Dia 1-2:   STORY-02.1 (migration) + STORY-02.8 (CRONs) — infraestrutura base
Dia 3-5:   STORY-02.2 (Socrates) + STORY-02.3 (Ebbinghaus) — tutoria core
Dia 6-9:   STORY-02.4 (Comenius) + STORY-02.5 (Sisifo) — recap + gamification
Dia 10-12: STORY-02.6 (Bloom) + STORY-02.7 (Taylor) — notas + engagement
Dia 13-15: STORY-02.9 (Rich Messages) — frontend polish
```

**Dependencias entre stories:**
- 02.1 (migration) → TUDO depende dela
- 02.2 (Socrates) → 02.3 (Ebbinghaus) precisa dele para extrair conceitos
- 02.3 (Ebbinghaus) → 02.4 (Comenius) usa conceitos para gerar quiz
- 02.5 (Sisifo) → 02.4 (Comenius) concede XP via Sisifo
- 02.7 (Taylor) → 02.6 (Bloom) usa dados do Taylor no X-ray
- 02.8 (CRONs) → 02.4, 02.5, 02.7 precisam dos CRONs

**NAO pular a migration (02.1). E a fundacao de tudo.**

---

> **Duvidas?** Perguntar no canal do squad. Se algo no service pronto nao encaixar no codebase real, adaptar seguindo os PATTERNS do projeto (nunca inventar padrao novo).
