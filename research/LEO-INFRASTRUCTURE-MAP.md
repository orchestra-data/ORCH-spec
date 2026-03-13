# Mapa da Infraestrutura do Leo — O que NÃO tocar e o que reusar

> Gerado em 2026-03-13 via 3 agentes de pesquisa paralelos (backend, frontend, Cogfy)
> **ATUALIZADO 2026-03-13** — Descobertas MASSIVAS nas branches do IndigoHive

---

## DESCOBERTA CRÍTICA: O ORCH JÁ EXISTE NO MAIN!

O Leo **já implementou** um sistema ORCH completo no `main` do IndigoHive:

### Backend ORCH (JÁ EM PRODUÇÃO)
| Arquivo | O que faz |
|---------|-----------|
| `endpoints/orchChat/orchChat.ts` | **Endpoint principal** POST /orchChat com tool calling, RAG, intent classification |
| `endpoints/orchGetSession/` | GET sessão + mensagens |
| `endpoints/orchListSessions/` | GET lista de sessões |
| `endpoints/orchSubmitFeedback/` | POST feedback |
| `services/orch-llm-service.ts` | Wrapper LLM provider-agnostic (Gemini/OpenAI) |
| `services/orch-rag-service.ts` | Busca semântica + contexto RAG (knowledge base YAML) |
| `services/orch-tools/index.ts` | `createOrchTools()` + `secureTool()` (5 camadas segurança) |
| `services/orch-tools/student-tools.ts` | 7 tools: getMyProgress, getMyAttendance, getMyGrades, getMyEnrollments, getMyCourseContent, getMyProfile |
| `services/orch-tools/admin-tools.ts` | 3 tools: getClassStats, getStudentInfo, getBIMetrics |
| `services/orch-tools/shared-tools.ts` | 1 tool: searchContent |
| `services/orch-tools/tool-utils.ts` | READ ONLY transaction, statement_timeout, truncateResult |
| `utils/resolve-user-role.ts` | RBAC → admin/professor/student |

### Tabelas ORCH (JÁ MIGRADAS)
| Tabela | Migration | Uso |
|--------|-----------|-----|
| `orch_session` | 1942000000 | Sessões de chat (user_id, tenant_id, pages_visited) |
| `orch_session_message` | 1942000000 | Mensagens (role, content, model_used, tokens_used, rag_sources) |
| `orch_knowledge_embedding` | 1942000000 | Chunks KB com embeddings (vector 1536) |
| `orch_faq` | 1942000000 | FAQs auto-geradas |
| `orch_feedback` | 1942000000 | Feedback do usuário |

### Branch `improve-ai-tutor` (Giuseppe trabalhando)
| Arquivo | O que faz |
|---------|-----------|
| `202603110001--enhance_ai_conversation_for_tutor.sql` | Estende ai_conversation (company_id, title, session_summary, unit_id, soft-delete) + ai_conversation_message (analytics, tool_invocations) |
| `endpoints/getLastConversation/` | Retorna última conversa AI para um componente |
| `generateTutorResponse.ts` (reescrito) | Agora persiste em ai_conversation + avalia analytics pedagógico por turno |
| `prompt-generator.ts` (expandido) | ANALYTICS_EVALUATOR_PROMPT + GENERATE_SLIDES_TOOL_DESCRIPTION |
| `ava-database-types/ai-conversation-row.ts` | Types TypeScript para ai_conversation |
| `HANDOFF_ORCH_DATA_AWARE.md` | Plano completo para tool calling (data-aware) |
| `GUIA_DEV_ORCH.md` | Guia dev completo (1000+ linhas) |

### Knowledge Base (YAML externa)
Localizada em `/home/leosofiati/orch-admin/knowledge-base/`:
- cogedu-pages-guide.yaml (guia de páginas admin)
- cogedu-*-fields.yaml (campos de formulários)
- cogedu-workflows.yaml (25+ workflows)
- cogedu-data-schema.yaml (schema do banco)
- cogedu-ava-* (rotas, schema, endpoints do AVA)
- zodiac-personas.yaml (personas adaptativas)

### Segurança (5 Camadas)
1. **READ ONLY Transaction** — PG rejeita writes
2. **User Scoping** — ctx.userId do JWT, NUNCA params
3. **Result Truncation** — max 3000 chars
4. **requiredRole** — double-check defense-in-depth
5. **System Prompt Hardening** — regras explícitas

### O que MUDA na nossa spec ORCH AVA
O ORCH Admin (page-guide) **já funciona**. O que falta é:
1. **Tab ORCH no CommunicationHub** — está comentado mas não implementado no frontend
2. **Agentes especializados** (Sócrates, Ebbinghaus, Comenius, etc.) — o sistema atual é generalista
3. **Perfil Bourdieu** — não existe
4. **SSE Streaming** — não existe (request-response)
5. **Gamificação, Spaced Repetition, Daily Recap** — não existem
6. **ORCH no AVA** — o frontend AVA tem AIChatTab mas aponta para generateTutorResponse, não orchChat

---

## REGRA DE OURO: NÃO TOCAR (load-bearing)

| # | Componente | Path | Por quê |
|---|-----------|------|---------|
| 1 | `content_embedding` table + SQL functions | migrations/ | RAG inteiro depende |
| 2 | `company_ai_config` + `check_company_ai_quota()` | migrations/ | FinOps/quota |
| 3 | `experience_events` AI logging (6 object_types) | repositories/ | Billing + BI |
| 4 | `ChatContext.tsx` + `open-chat` event | apps/web/src/contexts/ | Hub inteiro depende |
| 5 | `conversation` + `conversation_message` + `conversation_read_state` | migrations/ | Chat humano |
| 6 | `GoogleGeminiService.generateResponseWithUsage()` | services/ | Quota tracking |
| 7 | `component.metadata.ai_analysis` schema | varios | Tutor lê theme+summary |

---

## 1. TABELAS (já existem no banco)

### 1a. Chat Humano
| Tabela | Uso | Status |
|--------|-----|--------|
| `conversation` | DMs e group chats | EM USO |
| `conversation_message` | Mensagens | EM USO |
| `conversation_read_state` | Read receipts | EM USO |

### 1b. AI/RAG
| Tabela | Uso | Status |
|--------|-----|--------|
| `content_embedding` | **Vetor store pgvector** (1536 dims, OpenAI text-embedding-3-small) | EM USO |
| `ai_processing_job` | Jobs de AI (thumbnail, caption, clip, podcast, case_study) | EM USO |
| `ai_conversation` | **Sessões AI** (student_id, component_id, message_count) | **EXISTE MAS NÃO USADO** |
| `ai_conversation_message` | **Mensagens AI** (role, message_text, context_used JSONB) | **EXISTE MAS NÃO USADO** |

> **OPORTUNIDADE:** `ai_conversation` e `ai_conversation_message` já existem no schema e estão prontas para o ORCH usar! Só precisamos estender (adicionar agent_id, conversation_type, etc.)

### 1c. FinOps
| Tabela | Uso | Status |
|--------|-----|--------|
| `company_ai_config` | Quota mensal/diária, alertas, billing | EM USO |
| `ai_usage_alert` | Log de alertas (warning, critical, exceeded) | EM USO |

### 1d. SQL Functions (pgvector RAG)
| Função | O que faz |
|--------|-----------|
| `semantic_search(embedding, series_id, limit)` | RAG por série |
| `search_component_transcription(embedding, component_id, limit, threshold)` | RAG por componente |
| `search_components_transcription(embedding, component_ids[], limit, threshold)` | RAG multi-componente |
| `check_company_ai_quota(company_id, additional_tokens)` | Verifica quota (allowed, current, percentages) |
| `get_company_ai_usage(company_id, period_type)` | Usage em tempo real via experience_events |

---

## 2. SERVICES BACKEND

| Service | Modelo | SDK | Singleton | Arquivo |
|---------|--------|-----|-----------|---------|
| `GoogleGeminiService` | gemini-2.5-flash-lite | @ai-sdk/google + Vercel AI SDK | `googleGeminiService` | services/google-gemini-service.ts |
| `EmbeddingService` | OpenAI text-embedding-3-small | @ai-sdk/openai + Vercel AI SDK | `embeddingService` | services/embedding-service.ts |
| `ComponentRAGService` | — (usa EmbeddingService + SQL) | — | `componentRAGService` | services/component-rag-service.ts |
| `ContentAnalysisService` | gemini-2.0-flash-lite | @ai-sdk/google | `contentAnalysisService` | services/content-analysis-service.ts |
| `QuestionGenerationService` | gpt-4o-mini | @ai-sdk/openai | factory | services/question-generation-service.ts |
| `TextChunkingService` | — (puro JS) | — | `textChunkingService` | services/text-chunking-service.ts |
| `prompt-generator` | — (template) | — | funções puras | services/prompt-generator.ts |

### O que o ORCH REUSA:
- `GoogleGeminiService` → Hub Router (intent detection), agentes
- `EmbeddingService` → embeddings para RAG do ORCH Admin
- `ComponentRAGService` → Sócrates (RAG sobre conteúdo da aula)
- `check_company_ai_quota()` → quota check antes de cada call

### O que o ORCH CRIA NOVO:
- `orch-hub-router.ts` → intent detection + routing
- `orch-profile-service.ts` → CRUD perfil Bourdieu
- `services/agents/orch-*.ts` → 1 service por agente
- Circuit breaker wrapper no GoogleGeminiService

---

## 3. ENDPOINTS EXISTENTES

### AI
| Método | Path | O que faz |
|--------|------|-----------|
| POST | `/generateTutorResponse` | Tutor socrático (Gemini + RAG pgvector) |
| POST | `/searchComponentTranscription` | Busca RAG direta |
| POST | `/generateQuestion` | Gera questões (gpt-4o-mini) |
| GET | `/getCompanyAIConfig` | Config FinOps |
| PUT | `/updateCompanyAIConfig` | Atualiza config FinOps |

### Chat Humano
| Método | Path | O que faz |
|--------|------|-----------|
| POST | `/sendMessage` | DM |
| POST | `/sendClassMessage` | Msg de turma |
| GET | `/messages/conversations` | Lista conversas |
| POST | `/messages/markRead` | Marca lido |
| POST | `/initiateStudentConversation` | Inicia conversa com aluno |

### Cogfy Messenger
| Método | Path | Auth | O que faz |
|--------|------|------|-----------|
| GET | `/getMyEducationalContent` | X-API-Key + cogfy-contact-wa-id | Conteúdo do aluno |
| — | — | serviceAccountAuthAuto() + cogfyUserContext() | Resolve aluno por telefone |

---

## 4. FRONTEND

### Admin (cogedu-main-v6/apps/web/)
```
CommunicationHub.tsx     ← renderizado GLOBALMENTE em app.tsx
├── Dock.tsx             ← botão flutuante (bottom-right, z-1000)
│   ├── 🔔 Notifications
│   ├── 💬 Messages
│   └── 🤖 ORCH ← FALTA! (comentário existe, tab não)
├── HubPanel.tsx         ← painel com lista de conversas/notificações
└── ChatScreen.tsx       ← tela de conversa individual
```
- **State:** useState puro (sem Redux/Zustand)
- **Real-time:** Polling 3s via ChatContext
- **Injection:** `window.dispatchEvent(new CustomEvent('open-chat', { detail: { conversationId } }))`

### AVA (cogedu-ava-main/frontend/)
```
Player/
└── TabsPanel.tsx
    ├── NewsTab.tsx
    ├── AIChatTab.tsx     ← TUTOR IA (Gemini + RAG)
    ├── MaterialsTab.tsx
    └── CaseStudyTab.tsx
```
- `AIChatTab` → `TutorClient` → `POST /generateTutorResponse`
- **Sem streaming** (request-response completo)
- **Sem SSE/WebSocket** para AI

### FloatingAIAssistant.tsx (AVA)
- Bolha draggable, **100% mock** (keyword matching, sem API)
- Legacy/protótipo — pode ser deletado

---

## 5. COGFY MESSENGER

### Infraestrutura PRONTA (Leo fez):
- Auth: `X-API-Key` (cgfy_*) + `cogfy-contact-wa-id` (phone → resolve aluno)
- Middleware: `serviceAccountAuthAuto()` + `cogfyUserContext()`
- Event tracking: outbox → RabbitMQ → experience_events (LGPD compliant)
- 3 migrations aplicadas

### O que FALTA para ORCH no Cogfy:
- Endpoint `POST /cogfy/chat` que roteia para agentes ORCH
- Configuração dos agentes no Cogfy Engine (novos Cogs)

### Projeto WhatsApp (P&D):
- 30 endpoints `/wpp/*` já especificados
- 188 intenções mapeadas
- 12 perfis de personalidade = 12 communication_archetype do Bourdieu

---

## 6. ENV VARS NECESSÁRIAS

| Variável | Já existe? | Usado por |
|----------|-----------|-----------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | ✅ Sim | Gemini (Hub, agentes) |
| `OPENAI_API_KEY` | ✅ Sim | Embeddings, questões |
| `ORCH_AVA_URL` | ❌ Não | Futuro: se ORCH virar microservice |

---

## 7. RESUMO PARA DESENVOLVIMENTO

### O que REUSAR do Leo:
1. `GoogleGeminiService` → intent detection, geração de respostas
2. `EmbeddingService` + `ComponentRAGService` → RAG para Sócrates e ORCH Admin
3. `check_company_ai_quota()` → quota check antes de cada call Gemini
4. `ai_conversation` + `ai_conversation_message` → **tabelas prontas, só estender**
5. `content_embedding` → embeddings já existentes
6. `experience_events` pattern → logging de uso AI
7. `ChatContext` + `open-chat` event → injection point no Hub
8. `serviceAccountAuthAuto()` + `cogfyUserContext()` → auth Cogfy

### O que CRIAR novo:
1. **Tab ORCH no Dock** (3ª tab no CommunicationHub)
2. **ORCHPanel.tsx** (painel de chat com agentes)
3. **Hub Router** (intent detection → routing para agentes)
4. **Services dos agentes** (orch-socrates.ts, orch-ebbinghaus.ts, etc.)
5. **Migrations ORCH** (orch_student_profile, orch_concept_memory, etc.)
6. **SSE streaming** (não existe nenhum — precisa criar)
7. **Endpoints `/orch-ava/*`** e **`/orch-admin/*`**
8. **CRONs** (Ebbinghaus, Comenius, Taylor, Sísifo, Foucault, Weber)
9. **Circuit breaker** no GoogleGeminiService
