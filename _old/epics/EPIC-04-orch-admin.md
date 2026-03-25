# EPIC-04: ORCH Admin — Page-Guide Inteligente

**Fase:** F4
**Prioridade:** HIGH
**Estimativa:** 1-2 semanas
**Dependências:** Nenhuma direta (paralelo a F2/F3). Alertas de aluno dependem de Foucault/Taylor
**Entregável:** Assistente IA no CommunicationHub para staff com RAG, walkthroughs, alertas

---

## Stories

### STORY-04.1: Migration SQL — orch_admin
**Tipo:** Database
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] Migration `20260421_orch_admin.sql` criada
- [ ] `orch_admin_embedding`: RAG vector store (14 YAMLs chunked) com pgvector
- [ ] `orch_admin_conversation`: memória persistente 30d
- [ ] `orch_admin_message`: msgs com route_context + dom_snapshot
- [ ] `orch_admin_walkthrough`: 25 walkthroughs com steps JSON
- [ ] `orch_admin_walkthrough_usage`: tracking por usuário
- [ ] `orch_admin_alert`: alertas proativos (4 categorias) + `escalated_at`, `escalated_to` + unread index
- [ ] ~~`orch_zodiac_profile`~~: REMOVIDO (coberto por Bourdieu + Gardner)

### STORY-04.2: Knowledge Base — Ingestão dos 14 YAMLs
**Tipo:** Backend Service
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `services/admin/orch-admin-knowledge.ts` criado
- [ ] Chunking: 1000 tokens, 200 overlap
- [ ] Embedding via Gemini (ou OpenAI ada-002)
- [ ] INSERT em `orch_admin_embedding` com metadata (yaml_source, route_filter)
- [ ] Busca semântica route-filtered (só retorna chunks relevantes à rota atual)
- [ ] Script de re-ingestão para atualizar knowledge base

### STORY-04.3: Admin Chat Service — RAG + Gemini
**Tipo:** Backend Service
**Pontos:** 8
**Critérios de Aceitação:**
- [ ] `services/admin/orch-admin-chat.ts` criado
- [ ] RAG search filtrada por rota atual do usuário
- [ ] Context build: route_context + knowledge_chunks + conversation_history
- [ ] Gemini chat com SSE streaming
- [ ] Intent matching: detecta quando usuário quer walkthrough vs explicação vs preenchimento
- [ ] Memória 30d com context_summary rolling (`orch-admin-memory.ts`)
- [ ] FAQ learning: perguntas frequentes ganham respostas mais rápidas

### STORY-04.4: Alertas Proativos
**Tipo:** Backend Service
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] `services/admin/orch-admin-alerts.ts` criado
- [ ] 4 categorias: student, class, admission, system
- [ ] CRON weekly: gera alertas com base em dados de Foucault/Taylor
- [ ] Escalation: alerta não lido em 24h → escalation automático para superior
- [ ] Alertas persistentes em `orch_admin_alert`
- [ ] Staff feedback: botões "útil/não útil" + campo livre (ativo) + tracking de tempo/cliques (passivo)
- [ ] Tabela `orch_staff_feedback` para registrar

### STORY-04.5: Walkthroughs — Driver.js Integration
**Tipo:** Frontend
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `npm install driver.js` (4KB)
- [ ] Seed: 25 walkthroughs com steps JSON
- [ ] `WalkthroughOverlay.tsx`: wrapper do Driver.js com steps highlight + progress
- [ ] Endpoints: `POST /walkthrough/:id/start`, `POST /walkthrough/:id/complete`, `GET /walkthroughs`
- [ ] Walkthrough tracking: quem usou, completou, abandonou
- [ ] Chat sugere walkthrough quando detecta intent de "como faço X?"

### STORY-04.6: Frontend — OrchPanel no CommunicationHub
**Tipo:** Frontend
**Pontos:** 8
**Critérios de Aceitação:**
- [ ] `OrchPanel.tsx`: nova tab no CommunicationHub
- [ ] `OrchHeader.tsx`: logo + "Como posso ajudar?" + PageContext (rota atual)
- [ ] `OrchSuggestedQuestions.tsx`: 3 sugestões baseadas na rota
- [ ] `OrchMessageList.tsx`: chat streaming + walkthrough CTA + dom fill preview
- [ ] `OrchInputBox.tsx`: input com auto-resize
- [ ] `AlertsPanel.tsx`: lista alertas com severity + action button
- [ ] `dom-bridge.ts`: scanPage(), fillField(), buildUniqueSelector(), findLabel()
- [ ] `stuck-detector.ts`: 30s inatividade → sugestão proativa

### STORY-04.7: Endpoints Admin (12 endpoints)
**Tipo:** API
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `POST /orch-admin/chat` — RAG + Gemini + intent match + SSE
- [ ] `GET /orch-admin/conversations` — lista conversas
- [ ] `GET /orch-admin/context/:route` — info da rota
- [ ] `GET /orch-admin/suggestions/:route` — 3 perguntas sugeridas
- [ ] `POST /orch-admin/walkthrough/:id/start` e `/complete`
- [ ] `GET /orch-admin/walkthroughs` — lista disponíveis
- [ ] `GET /orch-admin/alerts`, `POST /alerts/:id/read`, `POST /alerts/:id/dismiss`
- [ ] `POST /orch-admin/dom/fill` e `POST /orch-admin/dom/scan`
- [ ] Todos com `requireAuth()` + permissão de staff
- [ ] Config pedagógica por tenant (`pedagogical_config JSONB` na tabela tenant)

---

## Definição de Done (Epic)
- [ ] Staff tem assistente IA no CommunicationHub
- [ ] RAG retorna respostas contextualizadas por rota
- [ ] Walkthroughs guiados funcionam em pelo menos 10 páginas
- [ ] DOM fill preenche formulários corretamente
- [ ] Stuck detection sugere ajuda após 30s
- [ ] Alertas proativos com escalation automático
- [ ] Staff pode dar feedback ativo e passivo
