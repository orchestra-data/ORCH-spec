# Inventario do Codigo Existente — Orch AVA

> Verificado em: 2026-03-25, branch dev, codebase cogedu-dev-v6

Cada arquivo abaixo foi LIDO e verificado. Status: REAL = funciona, STUB = placeholder.

---

## 1. Endpoint Principal

### `apps/api/src/endpoints/orchAvaChat/orchAvaChat.ts`

**Status:** REAL — pipeline de 15 etapas funciona end-to-end.

**O que faz:** Recebe mensagem do aluno, classifica intent, roteia para agente, chama LLM, transforma tom, persiste conversa.

**Metodo:** `POST /orch-ava/chat`

**Body esperado:**
```json
{
  "message": "como estao minhas notas?",
  "pageUrl": "/home",
  "conversationId": null,
  "sessionId": "uuid-opcional"
}
```

**Pipeline (15 etapas em ordem):**
1. Valida body (message, pageUrl obrigatorios)
2. Auth + tenant extraction do JWT
3. Quota check via `check_company_ai_quota()` — graceful degradation
4. `orchProfileService.loadOrCreate()` — carrega/cria perfil Bourdieu
5. `orchHubRouter.detectIntent()` — LLM classifica intent, circuit breaker + keyword fallback
6. Greeting shortcut — se agent === `__greeting`, responde sem LLM
7. `orchRAGService.buildOrchContext()` — busca semantica pgvector
8. Carrega historico de `ai_conversation` + `ai_conversation_message`
9. Monta system prompt = personalidade do agente + bloco de arquetipo + contexto RAG
10. `orchLLMService.generateResponse()` — chamada real ao LLM
11. `orchArchetypeTransformer.transform()` — transforma tom (pula para explorer)
12. Persiste conversa em `ai_conversation` + `ai_conversation_message`
13. `orchHubRouter.routeMessage()` — loga em `orch_interaction_log`
14. `ExperienceEventRepository.insertEvent()` — tracking FinOps
15. Retorna JSON com `message`, `agentUsed`, `intent`, `confidence`, `archetype`, `actionChips`, `sources`

**O QUE FALTA:** Tool calling. O endpoint NAO importa `createOrchTools` nem passa tools para o LLM.

**6 agentes definidos como STRINGS DE PROMPT (linhas ~50-150):**
- `socrates` — prompt de tutor dialogico
- `ebbinghaus` — prompt de revisao espacada
- `comenius` — prompt de quiz/recap
- `sisifo` — prompt de gamificacao
- `bloom` — prompt de plano de estudo
- `weber` — prompt de relatorios

Esses prompts sao usados na etapa 9 para montar o system prompt. NAO ha logica real por tras — apenas texto.

---

## 2. Services Compartilhados (REAL, NAO MEXER)

### `apps/api/src/app/services/orch-llm-service.ts`

**Status:** REAL, production-ready.

**O que faz:** Provider-agnostico via Vercel AI SDK. Registra OpenAI e Google como providers.

**Metodos:**
- `generateResponse(systemPrompt, messages, options?)` — chamada LLM com suporte a tool calling
- `generateStructuredOutput(systemPrompt, messages, schema)` — output tipado via Zod
- `classifyIntent(message, pageUrl)` — classifica intent com schema de 8 categorias

**Config via env:**
```
ORCH_LLM_PROVIDER=openai    # ou google
ORCH_LLM_MODEL=gpt-4o-mini  # ou gemini-2.5-flash
```

**JA suporta tool calling** — basta passar `{ tools, maxSteps, toolChoice }` no options.

---

### `apps/api/src/app/services/orch-rag-service.ts`

**Status:** REAL, production-ready.

**O que faz:** Busca semantica via pgvector. Chama funcao PostgreSQL `search_orch_knowledge()`.

**Metodo principal:** `buildOrchContext(tenantId, query, pageUrl, limit)`

**Token budget:** 1500 (page info) + 3000 (RAG chunks) + 500 (FAQs) = 5000 max

**Detecta modulo pela URL:** `/feed`, `/home`, `/progress` (AVA) e `/educational/*`, `/bi` (Admin)

---

### `apps/api/src/app/services/orch-hub-router.ts`

**Status:** REAL, com 1 BUG.

**O que faz:** Classifica intent da mensagem e roteia para agente correto.

**2 caminhos:**
1. LLM-first via `orchLLMService.classifyIntent()` com CircuitBreaker (5 falhas em 60s → 5min cooldown)
2. Keyword fallback (regex patterns) quando circuito esta aberto

**Mapa intent→agente:**
- `ask_help/explain/doubt` → socrates
- `review/remember/forgot` → ebbinghaus
- `recap/daily/quiz` → comenius
- `xp/level/badge/streak/leaderboard` → sisifo
- `grade/nota/study_plan/simulate` → bloom
- `report/dossier/summary` → weber

**BUG:** `KEYWORD_PATTERNS` array usa tuples como comma-expression: `(/regex/, 'string')` — isso avalia para apenas a string, nao um tuple. Precisa ser `[/regex/, 'string']`.

**Metodos:**
- `detectIntent(message, pageUrl)` — retorna `{ intent, agent, confidence }`
- `routeMessage(data)` — loga em `orch_interaction_log`

---

### `apps/api/src/app/services/orch-profile-service.ts`

**Status:** REAL, com limitacoes.

**O que faz:** Gerencia perfil Bourdieu do aluno (12 arquetipos).

**Metodos:**
- `loadOrCreate(userId, tenantId)` — cria perfil na primeira interacao (archetype = 'explorer')
- `updateField(userId, tenantId, fieldPath, value)` — atualiza campo (top-level ou JSONB nested)
- `detectArchetype(userId, tenantId)` — **PLACEHOLDER** — retorna arquetipo atual sem analise

**12 arquetipos:** explorer, scholar, pragmatic, creative, competitor, social, reflective, anxious, skeptic, leader, observer, rebel

**Limitacao:** Interface `OrchStudentProfile` tem campos (`archetype`, `tone_preference`) que nao correspondem exatamente aos nomes das colunas no DB (`communication_archetype`). O endpoint faz o mapping manualmente.

---

### `apps/api/src/app/services/orch-archetype-transformer.ts`

**Status:** REAL, completo.

**O que faz:** Transforma o tom da resposta do LLM de acordo com o arquetipo do aluno.

**Logica:**
- Explorer → pula transformacao (economia de tokens)
- Todos outros → LLM call secundario para reescrever no tom certo
- Cap de tokens: 1.2x do original

**12 tons definidos** (um por arquetipo) com instrucoes detalhadas de estilo.

---

## 3. Student Tools (REAL, ja prontas para AVA)

### `apps/api/src/app/services/orch-tools/student-tools.ts`

**Status:** REAL, testado no Admin.

**6 tools disponíveis:**

| Tool | O que consulta |
|------|---------------|
| `getMyProgress` | Componentes completados, metricas de `experience_metrics_aggregated` |
| `getMyAttendance` | Presenca por turma, risco, justificativas pendentes |
| `getMyGrades` | Notas de `assessment_attempt`, score, status |
| `getMyEnrollments` | Turmas matriculadas, datas, conteudo |
| `getMyCourseContent` | Hierarquia completa de conteudo (pathway → series → unit → component) |
| `getMyProfile` | Dados basicos (nome, email, tipo, status) |

**TODAS usam `ctx.userId` do JWT** — aluno so ve seus proprios dados (SECURITY-LAYER-2).

### `apps/api/src/app/services/orch-tools/shared-tools.ts`

**1 tool:** `searchContent` — busca conteudo educacional por texto (filtrado por enrollment do usuario).

### Infraestrutura de tools (NAO MEXER)

- `index.ts` — `createOrchTools()` + `filterToolsByRole()`
- `tool-utils.ts` — `withReadOnlyTransaction()`, `sanitizeSearchInput()`, `truncateResult()`
- `types.ts` — `OrchToolContext`, `TOOL_LIMITS`

---

## 4. Tabelas do Orch AVA (existentes)

### `orch_student_profile` (migration 1942000002)
- `id`, `user_id`, `tenant_id`
- `communication_archetype` (VARCHAR 30, default 'explorer')
- `academic_profile` (JSONB)
- `cognitive_profile` (JSONB)
- `linguistic_profile` (JSONB)
- `engagement_metrics` (JSONB)
- `gamification` (JSONB)
- `risk_indicators` (JSONB)
- `forgetting_curves` (JSONB)
- `skills_mastery` (JSONB)
- `sociocultural` (JSONB)

### `orch_profile_audit` (migration 1942000002)
- `profile_id`, `field_path`, `old_value`, `new_value`, `changed_by`, `reason`

### `orch_interaction_log` (migration 1942000002)
- `user_id`, `tenant_id`, `intent`, `agent_routed`, `confidence`
- `pipeline_steps` (JSONB), `duration_ms`, `tokens_used`

### `ai_conversation` (pre-existente, Leo)
- `id`, `user_id`, `tenant_id`, `title`, `created_at`

### `ai_conversation_message` (pre-existente, Leo)
- `conversation_id`, `role`, `content`, `created_at`

---

## 5. Endpoints Existentes (NAO MEXER)

| Endpoint | Owner | Funcao |
|----------|-------|--------|
| `POST /orchChat` | Leo | Chat admin original (tool calling, walkthroughs) |
| `GET /orchGetSession` | Leo | Carrega sessao admin |
| `GET /orchListSessions` | Leo | Lista sessoes admin |
| `POST /orchSubmitFeedback` | Leo | Feedback no orchChat |
| `POST /orch-admin/chat` | Steven | Chat admin novo (EPIC-04) |
| `GET /orch-admin/conversations` | Steven | Lista conversas admin |
| `GET /orch-admin/walkthroughs` | Steven | Walkthroughs |
| `POST /orch-admin/feedback` | Steven | Feedback admin |
| `POST /orch-ava/chat` | Steven | **ESTE — Orch AVA** |
