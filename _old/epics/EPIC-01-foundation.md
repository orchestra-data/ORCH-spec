# EPIC-01: Fundação Multi-Agente

**Fase:** F1
**Prioridade:** CRITICAL (base para todos os agentes)
**Estimativa:** 1-2 semanas
**Dependências:** EPIC-00 concluído
**Entregável:** Hub Router + Perfil Bourdieu + Persistência + Quota funcionando

---

## Stories

### STORY-01.1: Migration SQL — orch_foundation
**Tipo:** Database
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] Migration `20260314_orch_foundation.sql` criada
- [ ] Tabela `orch_student_profile` com: student_id, communication_archetype (NOT NULL, CHECK 12 valores), academic/cognitive/linguistic/engagement/gamification/risk_profile (JSONB), forgetting_curves, skills_mastery, sociocultural, version, updated_by
- [ ] Tabela `orch_profile_audit` com: student_id, agent_id, field_path, old/new_value, reasoning
- [ ] Tabela `orch_interaction_log` com: request_id, tenant_id, student_id, conversation_id, message_preview, intent_detected, intent_confidence, agent_routed, pipeline_steps, background_results, response_type, tokens_used, duration_ms, error_message
- [ ] Indexes criados (student_id, tenant_id, created_at)
- [ ] Migration roda sem erros em banco limpo e em banco com dados existentes

### STORY-01.2: Hub Router Service — Intent Detection
**Tipo:** Backend Service
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `services/orch-hub-router.ts` criado
- [ ] Intent detection via Gemini flash-lite com ROUTE_MAP e DIRECT_INTENTS
- [ ] Max 3 tentativas de reformulação se intent_confidence < threshold
- [ ] Resposta genérica após 3 tentativas falhas (nunca loop infinito)
- [ ] Circuit breaker: 5 falhas em 1 min → abre circuito, 5 min cooldown, half-open test
- [ ] Logging em `orch_interaction_log` para cada request
- [ ] Testes unitários para cada intent mapeado

### STORY-01.3: Profile Service — CRUD Bourdieu
**Tipo:** Backend Service
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] `services/orch-profile-service.ts` criado
- [ ] `loadOrCreate(studentId)`: busca ou cria perfil com defaults inteligentes
- [ ] `updateField(studentId, agentId, fieldPath, newValue, reasoning)`: single-writer com audit trail
- [ ] cognitive_profile baseado em Gardner MI (8 inteligências) com `metacognitive_calibration`
- [ ] Toda atualização gera registro em `orch_profile_audit`

### STORY-01.4: Archetype Transformer
**Tipo:** Backend Service
**Pontos:** 2
**Critérios de Aceitação:**
- [ ] `services/orch-archetype-transformer.ts` criado
- [ ] Aplica tom/vocabulário baseado no arquétipo do aluno (12 arquétipos)
- [ ] Transformer é injetado entre a resposta do agente e o envio ao aluno
- [ ] Testes com pelo menos 3 arquétipos diferentes

### STORY-01.5: Endpoints ORCH AVA (5 endpoints)
**Tipo:** API
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `POST /orch-ava/chat` — Hub router → intent → agent → archetype → save → stream SSE
- [ ] `GET /orch-ava/conversations` — Lista ai_conversation do student_id
- [ ] `GET /orch-ava/conversations/:id/messages` — Lista mensagens
- [ ] `DELETE /orch-ava/conversations/:id` — Soft delete
- [ ] `GET /orch-ava/profile` — Retorna orch_student_profile do logado
- [ ] Todos com `requireAuth()` + validação de tenant
- [ ] Quota check via `check_company_ai_quota()` antes de cada Gemini call

### STORY-01.6: Persistência — Ativar tabelas existentes do Leo
**Tipo:** Integration
**Pontos:** 2
**Critérios de Aceitação:**
- [ ] Após cada chat: INSERT em `ai_conversation` + `ai_conversation_message`
- [ ] `check_company_ai_quota()` chamado antes de cada Gemini call
- [ ] Frontend trata 429 com mensagem amigável ("Limite de conversas atingido hoje")

### STORY-01.7: Frontend — Upgrade AIChatTab (CommunicationHub)
**Tipo:** Frontend
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] Funciona no mesmo botão do CommunicationHub que já existe hoje
- [ ] Carrega histórico ao montar (`GET /orch-ava/conversations`)
- [ ] Envia mensagens via `POST /orch-ava/chat`
- [ ] SSE streaming: `res.setHeader('Content-Type', 'text/event-stream')`, token por token com cursor animado
- [ ] 3 fases visíveis: searching → thinking → responding
- [ ] Status hints: "Buscando contexto sobre logaritmos...", "Analisando...", "Respondendo..."
- [ ] Graceful degradation: se SSE falha, fallback para resposta completa
- [ ] Personalidade ORCH nos system prompts: curioso, paciente, direto, bem-humorado, honesto
- [ ] Variações por contexto: primeira msg do dia, acerto, erro, frustração
- [ ] Action chips (2-3 por resposta, NUNCA mais que 3): tipo `message`, `link`
- [ ] Chips desaparecem após nova mensagem

---

## Definição de Done (Epic)
- [ ] Aluno conversa com Hub no CommunicationHub (mesmo botão de hoje)
- [ ] Hub roteia para Sócrates (único agente ativo)
- [ ] Streaming fluido com status hints e cursor animado
- [ ] Personalidade ORCH consistente
- [ ] Action chips funcionais
- [ ] Perfil Bourdieu criado automaticamente no primeiro chat
- [ ] Conversas persistidas em `ai_conversation`
- [ ] Quota ativa e respeitada
- [ ] Circuit breaker protege contra falha do Gemini
- [ ] Interaction log registra cada request
