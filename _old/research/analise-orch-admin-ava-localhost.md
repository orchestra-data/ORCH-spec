# Analise ORCH Admin + AVA — O que Leo Implementou de Fato

Data: 2026-03-13
Fonte: Codigo rodando em localhost

---

## ORCH ADMIN — Communication Hub (NAO eh "orch-admin")

Nao existe modulo "orch-admin" no codigo. O que Leo implementou eh o **Communication Hub** — sistema de mensagens em tempo real.

### Frontend (Live)

| Componente | Path | Status |
|-----------|------|--------|
| `CommunicationHub.tsx` | `apps/web/src/components/communication-hub/` | **LIVE** — renderizado globalmente em app.tsx |
| `Dock.tsx` | mesma pasta | **LIVE** — botao flutuante com badges de nao-lidos |
| `HubPanel.tsx` | mesma pasta | **LIVE** — lista conversas + contatos (staff/alunos) |
| `ChatScreen.tsx` | mesma pasta | **LIVE** — chat DM e turmas |
| `ClassChat.tsx` | `components/chat/` | **LIVE** — chat de turma com Socket.IO real-time |
| `FloatingChat.tsx` | `components/` | **DEAD CODE** — substituido pelo CommunicationHub |
| `UserChat.tsx` | `components/` | **LIVE** — chat embeddado na pagina de detalhe do usuario |

### Backend (8 endpoints)

| Metodo | Path | Funcao |
|--------|------|--------|
| GET | `/messages/conversations` | Lista conversas DM + turma |
| POST | `/sendMessage` | Envia DM (cria conversa se nao existe) |
| POST | `/sendClassMessage` | Envia mensagem para turma |
| POST | `/messages/markRead` | Marca como lido |
| POST | `/getNotifications` | Lista notificacoes |
| POST | `/markNotificationRead` | Marca notificacao lida |
| POST | `/getUserContacts` | Lista contatos (colegas + staff) |
| POST | `initiateStudentConversation` | Professor inicia conversa com aluno |

### Tabelas (4)

- `conversation` — DMs e chats de turma
- `conversation_message` — mensagens individuais
- `conversation_read_state` — tracking de nao-lidos
- `user_notification` — notificacoes do sistema

### Eventos

- `conversation-event-publisher.ts` publica `conversation.message.created` no RabbitMQ exchange `domain.events`

### Estado do ChatContext

- `ChatProvider` wraps toda a app autenticada
- Polling a cada **3000ms** via `apiClient.listConversations()`
- Tambem faz polling de notificacoes
- `openChat` dispara `window.CustomEvent('open-chat')` cross-component

### Problemas Encontrados

1. **`adminInterventionAudit` sem auth** — `middlewares = []`, endpoint desprotegido (SEGURANCA)
2. **`FloatingChat.tsx` eh dead code** — pode deletar
3. **`sendClassMessage` sem validacao de permissao** — qualquer user pode postar em qualquer turma (TODO no codigo)
4. **`initiateStudentConversation` pode nao estar registrado** — `path` possivelmente ausente no index.ts
5. **`ClassChat.tsx` tem console.log spam** — debug logging em producao

---

## ORCH AVA — Tutor Socratico com RAG (NAO sao 15 agentes)

Nao existem 15 agentes. O que Leo implementou eh um **unico Tutor Socratico** com RAG (Retrieval-Augmented Generation).

### Frontend

| Componente | Status |
|-----------|--------|
| `AIChatTab.tsx` (dentro do Player) | **FUNCIONANDO** — chama API real, tab "AI Tutor" no player de video |
| `AIAssistant.tsx` | **MOCK/DEAD** — respostas hardcoded, zero API calls |
| `FloatingAIAssistant.tsx` | **MOCK/DEAD** — respostas hardcoded, zero API calls |
| `CaseStudyTab.tsx` | **MOCK** — forum de discussao, sem AI |

### Backend — Pipeline real (7 passos)

1. Busca unidade + componentes por `unitId`
2. Extrai tema/titulos/sumario de `component.metadata.ai_analysis`
3. **Query rephrasing** — Gemini `2.5-flash-lite` transforma respostas vagas em queries semanticas
4. **RAG vector search** — OpenAI `text-embedding-3-small` → busca em `content_embedding` (pgvector), top-5 chunks, threshold 0.5
5. **System prompt socratico** — `generateSocraticPrompt()` com contexto RAG
6. **Resposta Gemini** — `gemini-2.5-flash-lite`
7. **FinOps logging** — registra tokens gastos em `experience_events`

### Servicos

| Servico | Funcao |
|---------|--------|
| `GoogleGeminiService` | Wrapper do `@ai-sdk/google` (chat + structured output) |
| `EmbeddingService` | OpenAI `text-embedding-3-small` (1536 dims) |
| `PromptGenerator` | System prompt socratico em pt-BR |
| `ContentAnalysisService` | Gemini analisa transcricoes → `ai_analysis` metadata |
| `ComponentRAGService` | Search vetorial multi-componente |
| `TextChunkingService` | Split texto (1000 chars, 200 overlap) |

### Tabelas (6)

| Tabela | Status |
|--------|--------|
| `content_embedding` | **EM USO** — RAG vector store |
| `company_ai_config` | **DB READY** — quotas AI por empresa, mas NAO verificadas no tutor |
| `ai_usage_alert` | **DB READY** — alertas de uso |
| `ai_conversation` | **CRIADA MAS NAO USADA** — tutor nao persiste sessoes |
| `ai_conversation_message` | **CRIADA MAS NAO USADA** — historico eh client-side only |
| `ai_processing_job` | **CRIADA MAS NAO USADA** — queue de jobs |

### Problemas Encontrados

1. **Sem persistencia de conversas** — tabelas `ai_conversation` existem mas tutor nunca escreve nelas. Refresh = perde tudo
2. **Sem quota enforcement** — `check_company_ai_quota()` existe no banco mas endpoint nunca chama. Uso ilimitado
3. **Embeddings nao backfillados** — so videos salvos APOS a migration tem embeddings. Videos antigos = tutor sem contexto RAG
4. **`searchComponentTranscription` sem `path` export** — endpoint possivelmente nao registrado
5. **2 componentes AI mortos** — `AIAssistant.tsx` e `FloatingAIAssistant.tsx` sao prototipos mock
6. **Autor confirmado** — migration tem `-- Author: DB Sage` com path `/home/leosofiati/`

---

## Planejado vs Implementado

| Planejado (archive) | Implementado (localhost) |
|---------------------|--------------------------|
| 15 agentes AVA (Socrates, Aristoteles, Gardner...) | **1 tutor socratico generico** com RAG |
| Expansion packs (STEM, Wellbeing, Career) | **Nada** |
| Gamificacao (Sisifo - XP, streaks, badges) | **Nada** |
| Daily recap (Comenius - Duolingo-style) | **Nada** |
| D7 reports (Weber) | **Nada** |
| Orch Admin como aba no FloatingChat (RAG + Dify + 14 YAMLs) | **Communication Hub** (chat DM/turma, sem AI) |
| Spaced repetition (Ebbinghaus - SM-2) | **Nada** |
| FinOps com quota enforcement | **Logging existe**, enforcement **nao** |

---

## Melhorias Prioritarias

### P0 — Correcoes criticas
1. Adicionar `requireAuth()` no `adminInterventionAudit`
2. Adicionar validacao de permissao no `sendClassMessage`
3. Verificar se `initiateStudentConversation` esta registrado (path export)
4. Verificar se `searchComponentTranscription` esta registrado (path export)

### P1 — Funcionalidade core
5. Persistir conversas AI nas tabelas `ai_conversation` / `ai_conversation_message`
6. Ativar quota enforcement chamando `check_company_ai_quota()` no `generateTutorResponse`
7. Backfill embeddings para videos existentes
8. Deletar dead code: `FloatingChat.tsx`, `AIAssistant.tsx`, `FloatingAIAssistant.tsx`

### P2 — Evolucao
9. Multi-agente: implementar os agentes especializados planejados
10. Integrar AI no Communication Hub (o Orch Admin original com RAG + knowledge base)
11. Gamificacao e spaced repetition
12. Daily recaps
