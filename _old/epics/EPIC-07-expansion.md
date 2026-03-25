# EPIC-07: Agentes Expandidos + Placeholders

**Fase:** F7
**Prioridade:** MEDIUM
**Estimativa:** 2-3 semanas
**Dependências:** EPIC-01 a EPIC-03 (ecossistema core funcionando)
**Entregável:** 20 agentes (15 funcionais + 5 placeholders), admission, case studies, safety

---

## Stories

### STORY-07.1: Migration SQL — orch_expansion
**Tipo:** Database
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] Migration `20260505_orch_expansion.sql` criada
- [ ] `orch_admission_lead` (Heimdall): leads pré-matrícula com scoring
- [ ] `orch_onboarding_progress` (Heimdall): checklist 30 dias
- [ ] `orch_case_study` (Dewey): casos com embedding vetorial (pgvector)
- [ ] `orch_case_discussion` (Dewey): respostas + AI feedback
- [ ] `orch_safety_flag` (SafeGuard): flags de segurança emocional
- [ ] `orch_zpd_assessment` (Vygotsky): zona de desenvolvimento proximal
- [ ] `orch_accessibility_preference` (Braille): preferências de acessibilidade

### STORY-07.2: Heimdall — Admission + Onboarding
**Tipo:** Backend Service + Frontend
**Pontos:** 8
**Critérios de Aceitação:**
- [ ] `services/agents/orch-heimdall.ts` criado
- [ ] Modo PRE (sem auth): chat consultivo para leads, lead scoring 0-100 (engagement + fit + urgency + completeness)
- [ ] Modo POST (com auth): onboarding 30 dias, checklist 10 items (profile_complete, first_login, watched_intro, explored_courses, first_ai_interaction, first_assignment, joined_chat, completed_recap, met_coordinator, feedback_given)
- [ ] Check-ins automáticos no onboarding
- [ ] Endpoints (7): `POST /admission/chat` (sem auth), `GET/PATCH /admission/leads`, `GET /onboarding/status`, `POST /onboarding/checkin`, `GET /onboarding/class/:classId`
- [ ] Testa: chat pré-matrícula sem login, lead scoring computado, onboarding checklist progride

### STORY-07.3: Dewey — Case Studies (CBR Flywheel)
**Tipo:** Backend Service
**Pontos:** 8
**Critérios de Aceitação:**
- [ ] `services/agents/orch-dewey.ts` criado
- [ ] Gera caso a partir de aula (unit_id) via Gemini
- [ ] Discussão socrática: aluno submete resposta, recebe feedback AI
- [ ] Busca semântica de casos similares via pgvector
- [ ] Flywheel: feedback do professor melhora casos futuros
- [ ] Endpoints (6): `POST /cases/generate`, `GET /cases`, `GET /cases/:id`, `POST /cases/:id/discuss`, `GET /cases/:id/discussions`, `POST /cases/:id/rate`
- [ ] Testa: gerar caso, submeter resposta, receber feedback, buscar caso similar

### STORY-07.4: SafeGuard — Safety Scan (Triagem Emocional)
**Tipo:** Backend Service
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `services/agents/orch-safeguard.ts` criado
- [ ] Middleware do Hub: roda em BACKGROUND em cada mensagem (Promise.allSettled)
- [ ] Gemini classifica: emotional_distress, self_harm_risk, bullying, crisis_language
- [ ] Se severity >= high → INSERT `orch_safety_flag` + alerta para coordenador
- [ ] **CRÍTICO:** NUNCA bloqueia conversa, NUNCA confronta aluno, escalação silenciosa
- [ ] Sem endpoints próprios (é middleware)
- [ ] Testa: mensagem simulada de crise → flag criado, coordenador notificado

### STORY-07.5: Placeholders — Janus + Keynes (Wrappers)
**Tipo:** Backend Service
**Pontos:** 2
**Critérios de Aceitação:**
- [ ] Janus (enrollment): Hub roteia para Bloom com contexto "enrollment", usa API Orchestra para status matrícula
- [ ] Keynes (financial): Hub roteia para resposta genérica com contexto financeiro, usa API Orchestra
- [ ] Sem tabelas próprias — wrappers sobre APIs existentes
- [ ] Hub reconhece intents de matrícula e financeiro e roteia corretamente

### STORY-07.6: Placeholders Estruturais — Vygotsky + Braille
**Tipo:** Database + Backend Stub
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] Vygotsky: `orch_zpd_assessment` com can_do_alone, can_do_guided, cannot_do por conceito, scaffolding level 1-5
- [ ] Braille: `orch_accessibility_preference` com necessidades registradas
- [ ] Stubs mínimos que salvam dados (futuro: Sócrates usará Vygotsky para calibrar hints)
- [ ] Tabelas prontas para expansão futura

### STORY-07.7: Backfills + Melhorias
**Tipo:** Infrastructure
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] Backfill embeddings: vídeos antigos sem `ai_analysis` → rodar ContentAnalysisService + EmbeddingService
- [ ] PDF server-side: Weber D7 reports via Puppeteer no backend
- [ ] Voice mode: placeholder Gemini Live API (experimental, não bloqueante)
- [ ] Blockchain: coluna `blockchain_tx` em certificados → OpenTimestamps (placeholder)

---

## Definição de Done (Epic)
- [ ] Ecossistema completo: 20 agentes (15 funcionais + 5 placeholders)
- [ ] Admission flow funciona sem login
- [ ] Lead scoring computa automaticamente
- [ ] Onboarding checklist 30 dias funciona
- [ ] Case studies com flywheel feedback
- [ ] Safety scan silencioso funciona
- [ ] Placeholders Vygotsky/Braille/Janus/Keynes com tabelas prontas
