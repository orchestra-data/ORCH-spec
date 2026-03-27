# Arquitetura do Orch AVA

## Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────────────────┐
│                        ALUNO (Frontend)                         │
│  OrchChat.tsx → POST /orch-ava/chat { message, pageUrl }       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    orchAvaChat.ts (Pipeline)                     │
│                                                                 │
│  1. Auth + Tenant ──────────────────────────────────────────┐   │
│  2. Quota Check (FinOps) ────────────────────────────────┐  │   │
│  3. Profile Load/Create ─────────────┐                   │  │   │
│                                      ▼                   │  │   │
│  ┌──────────────────────────────────────────────┐        │  │   │
│  │        orch-profile-service.ts                │        │  │   │
│  │  loadOrCreate() → orch_student_profile        │        │  │   │
│  │  12 arquetipos Bourdieu                       │        │  │   │
│  └──────────────────────────┬───────────────────┘        │  │   │
│                              ▼                            │  │   │
│  4. Intent Detection ────────────────────────────────┐    │  │   │
│  ┌──────────────────────────────────────────────┐    │    │  │   │
│  │        orch-hub-router.ts                     │    │    │  │   │
│  │  LLM classifyIntent() + CircuitBreaker        │    │    │  │   │
│  │  Fallback: keyword regex patterns             │    │    │  │   │
│  │  → { intent, agent, confidence }              │    │    │  │   │
│  └──────────────────────────┬───────────────────┘    │    │  │   │
│                              ▼                        │    │  │   │
│  5. Agent Selection ─────────────────────────────┐    │    │  │   │
│  ┌──────────────────────────────────────────────┐│    │    │  │   │
│  │  HOJE: prompt string hardcoded               ││    │    │  │   │
│  │  FUTURO: services/agents/orch-{agente}.ts    ││    │    │  │   │
│  │                                              ││    │    │  │   │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────┐       ││    │    │  │   │
│  │  │Socrates │ │Ebbinghaus│ │Comenius │       ││    │    │  │   │
│  │  │ (tutor) │ │ (memory) │ │ (quiz)  │       ││    │    │  │   │
│  │  └─────────┘ └──────────┘ └─────────┘       ││    │    │  │   │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────┐       ││    │    │  │   │
│  │  │ Sisifo  │ │  Bloom   │ │  Weber  │       ││    │    │  │   │
│  │  │ (XP)    │ │ (grades) │ │(reports)│       ││    │    │  │   │
│  │  └─────────┘ └──────────┘ └─────────┘       ││    │    │  │   │
│  └──────────────────────────────────────────────┘│    │    │  │   │
│                              │                    │    │    │  │   │
│  6. Build Context ───────────┼────────────────┐   │    │    │  │   │
│  ┌──────────────────────────┐│                │   │    │    │  │   │
│  │  orch-rag-service.ts     ││                │   │    │    │  │   │
│  │  pgvector search         ││                │   │    │    │  │   │
│  │  5000 token budget       ││                │   │    │    │  │   │
│  └──────────────────────────┘│                │   │    │    │  │   │
│                              ▼                │   │    │    │  │   │
│  7. LLM Call ────────────────────────────────┐│   │    │    │  │   │
│  ┌──────────────────────────────────────────┐││   │    │    │  │   │
│  │  orch-llm-service.ts                     │││   │    │    │  │   │
│  │  generateResponse(prompt, msgs, {tools}) │││   │    │    │  │   │
│  │  → tool calling (student tools)          │││   │    │    │  │   │
│  │  → maxSteps: 5                           │││   │    │    │  │   │
│  └──────────────────────────┬───────────────┘││   │    │    │  │   │
│                              ▼                ││   │    │    │  │   │
│  8. Archetype Transform ────────────────┐     ││   │    │    │  │   │
│  ┌──────────────────────────────────────┐│    ││   │    │    │  │   │
│  │ orch-archetype-transformer.ts        ││    ││   │    │    │  │   │
│  │ Reescreve no tom do arquetipo        ││    ││   │    │    │  │   │
│  │ (explorer pula)                      ││    ││   │    │    │  │   │
│  └──────────────────────────┬───────────┘│    ││   │    │    │  │   │
│                              ▼            │    ││   │    │    │  │   │
│  9. Extract Insights (NOVO) ─────────┐    │    ││   │    │    │  │   │
│  ┌──────────────────────────────────┐│    │    ││   │    │    │  │   │
│  │ Agente analisa o dialogo:       ││    │    ││   │    │    │  │   │
│  │ - Nivel de entendimento         ││    │    ││   │    │    │  │   │
│  │ - Dificuldades detectadas       ││    │    ││   │    │    │  │   │
│  │ - Evolucao linguistica          ││    │    ││   │    │    │  │   │
│  │ - Engajamento emocional         ││    │    ││   │    │    │  │   │
│  │ → Atualiza orch_student_profile ││    │    ││   │    │    │  │   │
│  └──────────────────────────────────┘│    │    ││   │    │    │  │   │
│                              │        │    │    ││   │    │    │  │   │
│  10. Persist + Log ──────────┼────────┼────┼────┼┼───┼────┼──┼───┘  │
│  → ai_conversation + ai_conversation_message                        │
│  → orch_interaction_log                                             │
│  → experience_events (FinOps)                                       │
│                                                                     │
│  11. Return Response ───────────────────────────────────────────────┘
│  { message, agentUsed, intent, confidence, archetype, sources }
└─────────────────────────────────────────────────────────────────────┘
```

---

## Camadas de Seguranca (4 layers, identicas ao Admin)

| Layer | Onde | O que faz |
|-------|------|-----------|
| **LAYER-1** | `tool-utils.ts` | READ ONLY transaction + `statement_timeout` 5s |
| **LAYER-2** | `student-tools.ts` | Todas queries filtram por `ctx.userId` do JWT |
| **LAYER-3** | `index.ts` secureTool() | Wrapper que injeta transaction em TODA tool |
| **LAYER-4** | Cada tool | `requiredRole` check (defense in depth) |

## Tabelas — Fluxo de dados

```
Aluno fala → ai_conversation_message (persist)
           → orch_interaction_log (observabilidade)
           → experience_events (FinOps)
           → orch_student_profile (insights extraidos)
           → orch_concept_memory (Ebbinghaus SM-2) [A CRIAR]
           → orch_gamification (Sisifo XP) [A CRIAR]
           → orch_daily_recap (Comenius quiz) [A CRIAR]
```

## Relacao entre os 3 endpoints Orch

```
orchChat (Leo)        → orch_session + orch_session_message        [ADMIN ANTIGO]
orchAdminChat (EPIC4) → orch_admin_conversation + orch_admin_message [ADMIN NOVO]
orchAvaChat (AVA)     → ai_conversation + ai_conversation_message   [ALUNO]

Compartilham: orch-llm-service, orch-rag-service, orch-tools
NAO compartilham: tabelas de conversacao, system prompts, agent routing
```
