# ORCH AVA + ORCH Admin — Guia de Implementação para Giuseppe

> **Autor:** Chief (Squad Cogedu) + Steven (PO)
> **Data:** 2026-03-23
> **Versão:** 1.0.0
> **Status:** PRONTO PARA IMPLEMENTAÇÃO

---

## TL;DR

Transformar o Cogedu de 1 tutor genérico em 20 agentes IA especializados (ORCH AVA para alunos + ORCH Admin para staff). O Leo já construiu a base (LLM service, RAG, tools, 5 tabelas). Nós construímos em cima.

---

## O QUE JÁ EXISTE (Leo construiu)

| Camada | O que tem | Path no repo |
|--------|-----------|--------------|
| **DB** | 5 tabelas (orch_session, orch_session_message, orch_knowledge_embedding, orch_faq, orch_feedback) | `libs/migrations/identity/1942000000--orch_chat_tables.sql` |
| **API** | 4 endpoints (orchChat, orchGetSession, orchListSessions, orchSubmitFeedback) | `apps/api/src/endpoints/orch*/` |
| **LLM** | Vercel AI SDK, Gemini 2.5 Flash, provider-agnostic | `apps/api/src/app/services/orch-llm-service.ts` |
| **RAG** | pgvector search, context budget 5000 tokens | `apps/api/src/app/services/orch-rag-service.ts` |
| **Tools** | 10 tools (7 student + 1 professor + 2 admin), read-only | `apps/api/src/app/services/orch-tools/` |
| **Frontend** | OrchChat.tsx no CommunicationHub (tab "Orch") | `apps/web/src/components/communication-hub/OrchChat.tsx` |

**NÃO REESCREVER NADA DISSO.** Construir em cima.

---

## ORDEM DE EXECUÇÃO

```
EPIC-00 (Cleanup)        → 1-2 dias   → Security fixes, dead code, wire-up certificados
    ↓
EPIC-01 (Foundation)     → 7-10 dias  → Hub Router, Bourdieu, SSE, persistência
    ↓
EPIC-02 (Core Agents)    → 14-21 dias → Sócrates, Ebbinghaus, Comenius, Sísifo, Bloom, Taylor
    ↓
EPIC-03 (Advanced)       → 14-21 dias → Aristóteles, Gardner, Wittgenstein, Foucault, Weber
    ↓
EPIC-04 (Admin)          → 7-10 dias  → RAG population, walkthroughs, alertas
    ↓
EPIC-06 (LiveLab)        → 7 dias     → Dashboard professor
    ↓
EPIC-07 (Expansion)      → 14-21 dias → Packs STEM, Career, Wellbeing
```

**Este pack cobre EPIC-00 + EPIC-01 completos.** Os demais epics serão entregues conforme avançar.

---

## ARTEFATOS NESTE PACK

| Arquivo | Descrição | Epic |
|---------|-----------|------|
| `EPIC-00-IMPLEMENTATION.md` | Guia story-by-story do cleanup | EPIC-00 |
| `migrations/1942000002--orch_foundation.sql` | 3 tabelas novas (profile, audit, interaction_log) | EPIC-01 |
| `services/orch-hub-router.ts` | Hub Router com intent detection + circuit breaker | EPIC-01 |
| `services/orch-profile-service.ts` | CRUD Bourdieu com single-writer audit | EPIC-01 |
| `services/orch-archetype-transformer.ts` | Transformador de tom por arquétipo | EPIC-01 |
| `endpoints/orchAvaChat/` | POST /orch-ava/chat com SSE streaming | EPIC-01 |
| `endpoints/orchAvaConversations/` | GET /orch-ava/conversations | EPIC-01 |
| `endpoints/orchAvaMessages/` | GET /orch-ava/conversations/:id/messages | EPIC-01 |
| `endpoints/orchAvaDeleteConversation/` | DELETE /orch-ava/conversations/:id | EPIC-01 |
| `endpoints/orchAvaProfile/` | GET /orch-ava/profile | EPIC-01 |

---

## PATTERNS DO CODEBASE (SEGUIR EXATAMENTE)

### Endpoints
- Pasta por endpoint: `endpoints/{nome}/index.ts` + `{nome}.ts`
- `index.ts` = barrel export: `export * from './{nome}'`
- Handler: `export function handler({ pool }: { pool: Pool }): RequestHandler`
- Auth: `export const middlewares = [requireAuth()]`
- Validation: Yup (`import { object, string } from 'yup'`)
- Pool client: `const client = await pool.connect()` + `finally { client?.release() }`

### Services
- Classe stateless + singleton export: `export const myService = new MyService()`
- Sem constructor dependencies
- SQL parametrizado: `client.query<RowType>(SQL, [params])`
- Zod para structured output

### Migrations
- Naming: `{timestamp}--{description}.sql`
- `CREATE TABLE IF NOT EXISTS`
- `ON DELETE CASCADE` em FKs
- Indexes com `IF NOT EXISTS`
- COMMENT ON TABLE/FUNCTION

### Frontend
- React 19 + hooks locais (useState, useRef, useEffect)
- Tailwind v4 inline
- `apiFetch<T>()` wrapper (ZERO axios)
- Auth via `useAuth()` hook (Keycloak)
- Framer Motion para animações
- lucide-react para ícones

### Segurança
- `requireAuth()` em TODOS os endpoints
- Validar ownership (tenant_id + user_id) antes de operar
- Read-only transactions para tools
- Rate limiting (15/min default)
- Quota check antes de Gemini calls

---

## VARIÁVEIS DE AMBIENTE

```env
# Já existentes (não mexer)
ORCH_LLM_PROVIDER=google
ORCH_LLM_MODEL=gemini-2.5-flash
GOOGLE_GENERATIVE_AI_API_KEY=...

# Novas (EPIC-01)
ORCH_CIRCUIT_BREAKER_THRESHOLD=5        # falhas para abrir circuito
ORCH_CIRCUIT_BREAKER_WINDOW_MS=60000    # janela de 1 min
ORCH_CIRCUIT_BREAKER_COOLDOWN_MS=300000 # 5 min cooldown
ORCH_INTENT_MODEL=gemini-2.0-flash-lite # modelo leve para intent detection
```

---

## CHECKLIST DE VALIDAÇÃO (rodar após cada EPIC)

### EPIC-00 Done
- [ ] `requireAuth()` em adminInterventionAudit
- [ ] Validação de pertencimento em sendClassMessage
- [ ] initiateStudentConversation e searchComponentTranscription registrados
- [ ] FloatingChat.tsx, AIAssistant.tsx, FloatingAIAssistant.tsx deletados
- [ ] console.log removido de ClassChat.tsx
- [ ] Certificados e documentos wire-up no AVA (sem mocks)

### EPIC-01 Done
- [ ] Migration roda sem erros (banco limpo E com dados)
- [ ] Hub Router detecta intents corretamente (testes)
- [ ] Circuit breaker abre/fecha conforme spec
- [ ] Perfil Bourdieu criado no primeiro chat
- [ ] Archetype transformer aplica tom correto
- [ ] POST /orch-ava/chat retorna SSE stream
- [ ] Conversas persistidas em ai_conversation
- [ ] check_company_ai_quota() chamado antes de Gemini
- [ ] Frontend trata 429 com mensagem amigável
- [ ] Action chips funcionais (2-3 por resposta, nunca mais)
- [ ] Status hints: Searching → Thinking → Responding
- [ ] Interaction log registra cada request

---

## CONTATOS

| Pessoa | Role | Quando consultar |
|--------|------|-----------------|
| **Steven** | PO | Regras de negócio, UX decisions, aprovações |
| **Leo Sofiati** | Dev original | Dúvidas sobre serviços existentes |
| **Chief (AI)** | Orquestrador | Specs, patterns, validação |

---

## REGRA DE OURO

> **Se não sabe, PERGUNTA. Se não testou, NÃO DIGA QUE FUNCIONA.**
>
> — Pedro Valério, Process Absolutist
