# ORCH Technical Spec — Detalhamento Completo

Data: 2026-03-13
Status: SPEC TECNICA DETALHADA

---

## ARQUITETURA GERAL

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19)                         │
│                                                                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │  AVA Player  │  │  CommunicationHub│  │   Dashboard Professor │ │
│  │              │  │   (Leo - LIVE)   │  │     (LiveLab - NEW)   │ │
│  │ ┌──────────┐ │  │ ┌──────┐┌──────┐│  │ ┌─────┐ ┌──────────┐ │ │
│  │ │AIChatTab │ │  │ │ Chat ││ ORCH ││  │ │Turma│ │  Aluno   │ │ │
│  │ │(Leo+Hub) │ │  │ │(Leo) ││(NEW) ││  │ │ Map │ │  Detail  │ │ │
│  │ └──────────┘ │  │ └──────┘└──────┘│  │ └─────┘ └──────────┘ │ │
│  │ ┌──────────┐ │  │ ┌──────────────┐│  │ ┌──────────────────┐  │ │
│  │ │DailyRecap│ │  │ │  DOM Bridge  ││  │ │   D7 Reports     │  │ │
│  │ │(Comenius)│ │  │ │  (NEW)       ││  │ │   (Weber)        │  │ │
│  │ └──────────┘ │  │ └──────────────┘│  │ └──────────────────┘  │ │
│  │ ┌──────────┐ │  └──────────────────┘  └───────────────────────┘ │
│  │ │Gamifica  │ │                                                   │
│  │ │(Sisifo)  │ │                                                   │
│  │ └──────────┘ │                                                   │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (Express 5)                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    HUB ROUTER (entry point)                  │   │
│  │  intent detection → route → agent → archetype transform     │   │
│  └────┬────────────┬────────────┬────────────┬────────────┬────┘   │
│       │            │            │            │            │         │
│  ┌────▼────┐ ┌─────▼────┐ ┌────▼────┐ ┌────▼────┐ ┌────▼────┐   │
│  │Socrates │ │Ebbinghaus│ │ Freire  │ │ Sisifo  │ │ Weber   │   │
│  │(tutor)  │ │(memory)  │ │(grades) │ │(gamif.) │ │(docs)   │   │
│  └────┬────┘ └────┬─────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
│       │           │            │            │            │         │
│  ┌────▼────────────▼────────────▼────────────▼────────────▼────┐   │
│  │              BOURDIEU (perfil central + arquetipos)          │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │                                    │
│  ┌──────────── INVISIBLE ──────▼─────────────────────────────┐    │
│  │  Taylor (engagement) │ Foucault (risk) │ Gardner (cognitive)│    │
│  │  Wittgenstein (ling.) │ Freud (safety)                     │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  SERVICES (Leo - REUSE)                                      │  │
│  │  GoogleGeminiService │ EmbeddingService │ ComponentRAGService │  │
│  │  TextChunkingService │ ContentAnalysisService                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  ADMIN AI ENGINE                                              │  │
│  │  PageGuide RAG │ DOM Bridge │ Zodiac │ Proactive Alerts       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    INFRA (Leo - REUSE)                              │
│  PostgreSQL 17 + pgvector │ RabbitMQ │ Socket.IO │ Keycloak       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## BANCO DE DADOS — TODAS AS TABELAS

### Tabelas EXISTENTES do Leo (REUTILIZAR)

```sql
-- JA EXISTEM, nao criar
-- ai_conversation          → persistencia de sessoes (CRIADA MAS NAO USADA)
-- ai_conversation_message  → historico mensagens (CRIADA MAS NAO USADA)
-- ai_processing_job        → queue de jobs (CRIADA MAS NAO USADA)
-- company_ai_config        → quotas AI por empresa (CRIADA, NAO VERIFICADA)
-- ai_usage_alert           → alertas de uso (CRIADA)
-- content_embedding        → RAG vector store (EM USO)
-- conversation             → DMs e chats de turma (EM USO)
-- conversation_message     → mensagens (EM USO)
-- conversation_read_state  → tracking de nao-lidos (EM USO)
-- user_notification        → notificacoes do sistema (EM USO)
-- experience_events        → FinOps logging (EM USO)
```

### NOVAS TABELAS — ORCH AVA

```sql
-- =====================================================
-- 1. PERFIL CENTRAL (Bourdieu + IntelliCode pattern)
-- =====================================================
CREATE TABLE orch_student_profile (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  student_id              UUID NOT NULL REFERENCES "user"(id),
  version                 INTEGER DEFAULT 1,

  -- Bourdieu: 12 arquetipos
  communication_archetype VARCHAR(50) DEFAULT 'explorer',
  -- Valores: explorer, scholar, pragmatic, creative, competitor,
  --          social, reflective, anxious, skeptic, leader, observer, rebel

  -- Perfil academico (Freire alimenta)
  academic_profile        JSONB DEFAULT '{
    "gpa": null,
    "standing": "regular",
    "trend": "stable",
    "strongest_subjects": [],
    "weakest_subjects": [],
    "attendance_rate": null
  }'::jsonb,

  -- Perfil cognitivo (Gardner alimenta)
  cognitive_profile       JSONB DEFAULT '{
    "dominant_intelligences": [],
    "learning_preferences": [],
    "felder_silverman": {
      "active_reflective": 0,
      "sensing_intuitive": 0,
      "visual_verbal": 0,
      "sequential_global": 0
    },
    "confidence_level": 0
  }'::jsonb,

  -- Perfil linguistico (Wittgenstein alimenta)
  linguistic_profile      JSONB DEFAULT '{
    "cefr_level": null,
    "vocabulary_richness": null,
    "formality_range": [0, 0],
    "preferred_register": "informal",
    "detected_language": "pt-BR"
  }'::jsonb,

  -- Engajamento (Taylor alimenta)
  engagement_profile      JSONB DEFAULT '{
    "score": 0,
    "trend": "unknown",
    "login_frequency": null,
    "avg_session_minutes": null,
    "last_active": null,
    "peak_hours": [],
    "preferred_content_type": null
  }'::jsonb,

  -- Gamificacao (Sisifo alimenta)
  gamification_profile    JSONB DEFAULT '{
    "xp": 0,
    "level": 1,
    "streak_days": 0,
    "streak_last_date": null,
    "badges": [],
    "octalysis_drivers": {
      "meaning": 0,
      "accomplishment": 0,
      "empowerment": 0,
      "ownership": 0,
      "social": 0,
      "scarcity": 0,
      "unpredictability": 0,
      "avoidance": 0
    }
  }'::jsonb,

  -- Risco (Foucault alimenta)
  risk_profile            JSONB DEFAULT '{
    "score": 0,
    "level": "green",
    "dimensions": {
      "academic": 0,
      "attendance": 0,
      "engagement": 0,
      "financial": 0,
      "social": 0,
      "emotional": 0,
      "temporal": 0,
      "vocational": 0
    },
    "last_assessment": null,
    "interventions": []
  }'::jsonb,

  -- Curvas de esquecimento (Ebbinghaus alimenta, TASA pattern)
  forgetting_curves       JSONB DEFAULT '{}'::jsonb,
  -- Formato: { "concept_id": { "S": 2.5, "last_review": "...", "next_review": "...", "reps": 0 } }

  -- Skills mastery (IntelliCode pattern)
  skills_mastery          JSONB DEFAULT '{}'::jsonb,
  -- Formato: { "skill_id": { "level": 0.0, "evidence_count": 0, "last_updated": "..." } }

  -- Sociocultural (Bourdieu habitus)
  sociocultural           JSONB DEFAULT '{
    "capital_cultural": null,
    "capital_social": null,
    "first_generation": null,
    "digital_literacy": null
  }'::jsonb,

  -- Metadata
  updated_by              VARCHAR(50) NOT NULL DEFAULT 'system',
  updated_at              TIMESTAMPTZ DEFAULT now(),
  created_at              TIMESTAMPTZ DEFAULT now(),

  UNIQUE(student_id, tenant_id)
);

CREATE INDEX idx_orch_profile_student ON orch_student_profile(student_id);
CREATE INDEX idx_orch_profile_tenant ON orch_student_profile(tenant_id);
CREATE INDEX idx_orch_profile_archetype ON orch_student_profile(communication_archetype);

-- =====================================================
-- 2. AUDIT TRAIL (IntelliCode single-writer policy)
-- =====================================================
CREATE TABLE orch_profile_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES "user"(id),
  agent_id    VARCHAR(50) NOT NULL,
  field_path  TEXT NOT NULL,          -- ex: 'engagement_profile.score'
  old_value   JSONB,
  new_value   JSONB,
  reasoning   TEXT,                   -- por que o agente mudou
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_student ON orch_profile_audit(student_id);
CREATE INDEX idx_audit_agent ON orch_profile_audit(agent_id);
CREATE INDEX idx_audit_created ON orch_profile_audit(created_at);

-- =====================================================
-- 3. DAILY RECAP (Comenius + Ebbinghaus)
-- =====================================================
CREATE TABLE orch_daily_recap (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  recap_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status          VARCHAR(20) DEFAULT 'pending',
  -- Valores: pending, in_progress, completed, skipped

  questions_total INTEGER DEFAULT 5,
  questions_correct INTEGER DEFAULT 0,
  xp_earned       INTEGER DEFAULT 0,
  time_spent_sec  INTEGER DEFAULT 0,
  streak_day      INTEGER DEFAULT 0,

  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(student_id, recap_date)
);

CREATE TABLE orch_recap_question (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id        UUID NOT NULL REFERENCES orch_daily_recap(id) ON DELETE CASCADE,
  concept_id      VARCHAR(100) NOT NULL,  -- referencia ao conceito na curva
  question_type   VARCHAR(30) NOT NULL,
  -- Valores: multiple_choice, true_false, fill_blank, short_answer, match

  question_text   TEXT NOT NULL,
  options         JSONB,                  -- para multiple_choice/match
  correct_answer  TEXT NOT NULL,
  difficulty      REAL DEFAULT 0.5,       -- 0.0 a 1.0
  source_unit_id  UUID,                   -- de qual aula veio

  student_answer  TEXT,
  is_correct      BOOLEAN,
  answered_at     TIMESTAMPTZ,
  time_spent_sec  INTEGER,

  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 4. CURVA DE ESQUECIMENTO (Ebbinghaus engine)
-- =====================================================
CREATE TABLE orch_concept_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  concept_id      VARCHAR(100) NOT NULL,
  concept_label   TEXT NOT NULL,         -- "Equacao do 2o grau"
  source_unit_id  UUID,

  -- SM-2 algorithm fields
  easiness_factor REAL DEFAULT 2.5,      -- EF (min 1.3)
  interval_days   INTEGER DEFAULT 1,     -- dias ate proxima revisao
  repetitions     INTEGER DEFAULT 0,     -- revisoes bem-sucedidas seguidas
  retention       REAL DEFAULT 1.0,      -- R(t) = e^(-t/S), 0.0 a 1.0

  last_review     TIMESTAMPTZ,
  next_review     TIMESTAMPTZ,
  last_quality    INTEGER,               -- 0-5 (SM-2 quality)

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(student_id, concept_id)
);

CREATE INDEX idx_concept_next_review ON orch_concept_memory(student_id, next_review);

-- =====================================================
-- 5. GAMIFICACAO (Sisifo)
-- =====================================================
CREATE TABLE orch_gamification (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),

  xp_total        INTEGER DEFAULT 0,
  level           INTEGER DEFAULT 1,
  streak_days     INTEGER DEFAULT 0,
  streak_best     INTEGER DEFAULT 0,
  streak_last     DATE,

  -- Badges conquistados
  badges          JSONB DEFAULT '[]'::jsonb,
  -- Formato: [{ "id": "first_recap", "name": "Primeira Revisao", "earned_at": "..." }]

  -- Missoes ativas
  missions        JSONB DEFAULT '[]'::jsonb,
  -- Formato: [{ "id": "...", "type": "daily|weekly|milestone", "progress": 0, "target": 5 }]

  -- Octalysis drivers (peso de cada motivador)
  octalysis       JSONB DEFAULT '{}'::jsonb,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(student_id, tenant_id)
);

-- XP transaction log (auditoria, nunca remover XP)
CREATE TABLE orch_xp_transaction (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES "user"(id),
  amount      INTEGER NOT NULL,           -- sempre positivo (NUNCA remover XP)
  source      VARCHAR(50) NOT NULL,       -- recap, assessment, login, streak, badge
  source_id   VARCHAR(100),               -- ID do recap/assessment que gerou
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 6. ENGAGEMENT (Taylor)
-- =====================================================
CREATE TABLE orch_engagement_snapshot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Score composto 0-100
  score           REAL NOT NULL,
  trend           VARCHAR(20) DEFAULT 'stable',
  -- Valores: rising, stable, declining, critical

  -- Componentes do score
  login_score     REAL,         -- frequencia de login
  time_score      REAL,         -- tempo na plataforma
  content_score   REAL,         -- videos assistidos, material lido
  social_score    REAL,         -- participacao forum/chat
  assessment_score REAL,        -- notas e entregas
  ai_score        REAL,         -- interacao com tutor AI

  -- xAPI events count nesse dia
  events_count    INTEGER DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(student_id, snapshot_date)
);

-- =====================================================
-- 7. RISCO (Foucault)
-- =====================================================
CREATE TABLE orch_risk_assessment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Score geral 0-100 (quanto MAIOR, mais risco)
  risk_score      REAL NOT NULL,
  risk_level      VARCHAR(20) NOT NULL,
  -- Valores: green (0-20), yellow (21-40), orange (41-60), red (61-80), critical (81-100)

  -- 8 dimensoes (0-100 cada)
  dim_academic    REAL DEFAULT 0,
  dim_attendance  REAL DEFAULT 0,
  dim_engagement  REAL DEFAULT 0,
  dim_financial   REAL DEFAULT 0,
  dim_social      REAL DEFAULT 0,
  dim_emotional   REAL DEFAULT 0,
  dim_temporal    REAL DEFAULT 0,
  dim_vocational  REAL DEFAULT 0,

  -- Intervencao recomendada
  intervention    VARCHAR(30),
  -- Valores: none, monitor, nudge, outreach, meeting, urgent

  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(student_id, assessment_date)
);

-- =====================================================
-- 8. D7 REPORTS (Weber)
-- =====================================================
CREATE TABLE orch_d7_report (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  report_type     VARCHAR(30) NOT NULL,
  -- Valores: weekly, monthly, semester, on_demand

  report_date     DATE NOT NULL,
  generated_by    VARCHAR(50) DEFAULT 'weber',

  -- Dossier consolidado de TODOS os agentes
  data            JSONB NOT NULL,
  -- Formato:
  -- {
  --   "summary": "...",
  --   "academic": { ... },       -- Freire data
  --   "engagement": { ... },     -- Taylor data
  --   "risk": { ... },           -- Foucault data
  --   "cognitive": { ... },      -- Gardner data
  --   "gamification": { ... },   -- Sisifo data
  --   "memory": { ... },         -- Ebbinghaus data
  --   "recommendations": [...],
  --   "trend_vs_last": "improving|stable|declining"
  -- }

  pdf_url         TEXT,           -- S3 link para PDF gerado
  viewed_by_teacher BOOLEAN DEFAULT false,
  viewed_at       TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_d7_student_date ON orch_d7_report(student_id, report_date DESC);

### NOVAS TABELAS — ORCH ADMIN

-- =====================================================
-- 9. ADMIN KNOWLEDGE BASE (RAG para page-guide)
-- =====================================================
CREATE TABLE orch_admin_embedding (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  source_file     VARCHAR(200) NOT NULL,    -- 'cogedu-classes.yaml'
  chunk_index     INTEGER NOT NULL,
  chunk_text      TEXT NOT NULL,
  route_context   VARCHAR(200),             -- '/classes', '/students/:id'
  domain          VARCHAR(50),              -- 'academic', 'financial', 'hr'
  embedding       vector(1536) NOT NULL,    -- OpenAI text-embedding-3-small

  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admin_emb_route ON orch_admin_embedding(route_context);
CREATE INDEX idx_admin_emb_domain ON orch_admin_embedding(domain);
CREATE INDEX idx_admin_emb_vector ON orch_admin_embedding
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- =====================================================
-- 10. ADMIN CONVERSATION (memoria persistente 30d)
-- =====================================================
CREATE TABLE orch_admin_conversation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  user_id         UUID NOT NULL REFERENCES "user"(id),
  status          VARCHAR(20) DEFAULT 'active',
  -- Valores: active, archived, cold

  context_summary TEXT,           -- resumo rolling da conversa
  faq_learned     JSONB DEFAULT '[]'::jsonb,
  -- Formato: [{ "question": "...", "answer": "...", "count": 3 }]

  messages_count  INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,   -- 30d apos ultima msg
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orch_admin_message (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES orch_admin_conversation(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,   -- 'user' | 'assistant' | 'system'
  content         TEXT NOT NULL,
  route_context   VARCHAR(200),           -- em qual pagina o usuario estava
  dom_snapshot    JSONB,                  -- campos/formulario visivel
  action_taken    JSONB,                  -- se ORCH preencheu campo, qual
  tokens_used     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 11. ADMIN WALKTHROUGHS
-- =====================================================
CREATE TABLE orch_admin_walkthrough (
  id              VARCHAR(100) PRIMARY KEY,   -- 'create-student', 'bulk-import'
  title           TEXT NOT NULL,
  description     TEXT,
  route           VARCHAR(200) NOT NULL,
  steps           JSONB NOT NULL,
  -- Formato:
  -- [
  --   { "target": "#btn-new-student", "content": "Clique aqui para...", "action": "click" },
  --   { "target": "#input-name", "content": "Digite o nome...", "action": "focus" },
  --   ...
  -- ]

  trigger_intent  TEXT[],         -- intents que ativam: ['create_student', 'add_aluno']
  trigger_stuck   BOOLEAN DEFAULT false,  -- ativa quando detecta usuario travado
  times_used      INTEGER DEFAULT 0,
  avg_completion  REAL DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Tracking de uso por usuario
CREATE TABLE orch_admin_walkthrough_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  walkthrough_id  VARCHAR(100) NOT NULL REFERENCES orch_admin_walkthrough(id),
  user_id         UUID NOT NULL REFERENCES "user"(id),
  status          VARCHAR(20) DEFAULT 'started',
  -- Valores: started, completed, abandoned
  step_reached    INTEGER DEFAULT 0,
  started_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- =====================================================
-- 12. PROACTIVE ALERTS (Admin)
-- =====================================================
CREATE TABLE orch_admin_alert (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  alert_type      VARCHAR(50) NOT NULL,
  -- Valores:
  -- student: low_attendance, grade_drop, missing_assignment
  -- class: avg_below_threshold, high_absence_rate, approaching_deadline
  -- admission: pending_enrollment, incomplete_docs, expired_lead
  -- system: quota_warning

  category        VARCHAR(20) NOT NULL,   -- student, class, admission, system
  severity        VARCHAR(20) DEFAULT 'info',
  -- Valores: info, warning, critical

  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  action_url      VARCHAR(500),           -- deep link para resolver
  action_label    VARCHAR(100),           -- "Ver aluno", "Aprovar matricula"

  target_roles    TEXT[] DEFAULT '{}',    -- ['coordinator', 'teacher', 'secretary']
  target_user_id  UUID,                   -- null = broadcast para roles

  entity_type     VARCHAR(50),            -- 'student', 'class_instance', 'enrollment'
  entity_id       UUID,

  read_by         UUID[],                 -- users que ja leram
  dismissed_by    UUID[],                 -- users que dispensaram

  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alert_tenant_cat ON orch_admin_alert(tenant_id, category);
CREATE INDEX idx_alert_created ON orch_admin_alert(created_at DESC);
```

**TOTAL: 16 novas tabelas** (12 listadas + 4 auxiliares). Reutiliza 11 tabelas do Leo.

---

## ENDPOINTS — LISTA COMPLETA

### HUB (entry point para AVA)

| Metodo | Path | Funcao | Auth |
|--------|------|--------|------|
| POST | `/orch-ava/chat` | Mensagem ao Hub → router → agente → resposta | student |
| GET | `/orch-ava/conversations` | Lista conversas AI do aluno | student |
| GET | `/orch-ava/conversations/:id/messages` | Historico de uma conversa | student |
| DELETE | `/orch-ava/conversations/:id` | Deletar conversa | student |
| GET | `/orch-ava/profile` | Perfil Bourdieu do aluno logado | student |

**Fluxo `POST /orch-ava/chat`:**

```
REQUEST:
{
  "message": "Nao entendi logaritmos",
  "unitId": "uuid-da-aula",        // opcional, contexto
  "conversationId": "uuid"          // opcional, continuacao
}

PIPELINE (Hub Router):
1. requireAuth() → student_id
2. loadOrCreateProfile(student_id) → Bourdieu profile
3. loadOrCreateConversation(student_id, conversationId)
4. detectIntent(message, history) → { intent: 'content_doubt', confidence: 0.92 }
5. routeToAgent('socrates', message, profile, unitId)
   a. Socrates: RAG search (ComponentRAGService) → top-5 chunks
   b. Socrates: buildPrompt(message, chunks, profile, history)
   c. Socrates: GoogleGeminiService.chat() → resposta
   d. Socrates: HPO critic check (se hint_level >= 3)
   e. Socrates: EDF loop (Evidence → Decision → Feedback)
6. applyArchetype(response, profile.communication_archetype)
7. saveMessage(conversation, 'user', message)
8. saveMessage(conversation, 'assistant', transformed_response)
9. updateProfile('socrates', field_updates) → audit trail
10. logFinOps(tokens_used)

RESPONSE (SSE streaming):
event: status
data: {"phase": "searching", "message": "Buscando contexto sobre logaritmos..."}

event: status
data: {"phase": "thinking", "message": "Analisando sua duvida..."}

event: delta
data: {"content": "Hmm, logaritmos! "}

event: delta
data: {"content": "Deixa eu te fazer uma pergunta: "}

event: delta
data: {"content": "voce sabe o que significa 2³ = 8? "}

event: done
data: {
  "messageId": "uuid",
  "agentUsed": "socrates",
  "actionChips": [
    {"label": "Sim, sei potencia", "value": "sei potenciacao"},
    {"label": "Nao tenho certeza", "value": "nao sei potenciacao"},
    {"label": "Mostra um exemplo", "value": "exemplo de logaritmo"}
  ],
  "xpEarned": 5,
  "streakDay": 3
}
```

### COMENIUS (Daily Recap)

| Metodo | Path | Funcao | Auth |
|--------|------|--------|------|
| GET | `/orch-ava/recap/today` | Recap do dia (gera se nao existe) | student |
| POST | `/orch-ava/recap/:id/start` | Iniciar o recap | student |
| POST | `/orch-ava/recap/:id/answer` | Responder questao | student |
| POST | `/orch-ava/recap/:id/complete` | Finalizar recap | student |
| GET | `/orch-ava/recap/history` | Historico de recaps | student |
| GET | `/orch-ava/recap/streak` | Streak atual | student |

**Fluxo `GET /orch-ava/recap/today`:**

```
PIPELINE:
1. Buscar conceitos com next_review <= hoje em orch_concept_memory
2. Se nenhum → buscar conceitos recentes (ultimos 7 dias de aula)
3. Ordenar por retention ASC (priorizar o que esta esquecendo)
4. Selecionar top-5 conceitos
5. Para cada: gerar questao com GoogleGeminiService (dificuldade = retention atual)
6. Criar orch_daily_recap + orch_recap_question
7. Retornar

RESPONSE:
{
  "id": "uuid-recap",
  "date": "2026-03-13",
  "streakDay": 3,
  "questions": [
    {
      "id": "uuid-q1",
      "concept": "Logaritmos",
      "type": "multiple_choice",
      "text": "Se log₂(x) = 3, qual o valor de x?",
      "options": ["3", "6", "8", "9"],
      "difficulty": 0.4,
      "sourceUnit": "Aula 7 - Funcoes Logaritmicas"
    },
    ...
  ],
  "estimatedMinutes": 3,
  "xpReward": { "completion": 20, "perfectScore": 10 }
}
```

**Fluxo `POST /orch-ava/recap/:id/answer`:**

```
REQUEST:
{
  "questionId": "uuid-q1",
  "answer": "8",
  "timeSpentSec": 12
}

PIPELINE:
1. Verificar resposta
2. Atualizar SM-2:
   - Se correto: quality = 4-5, EF sobe, interval dobra
   - Se errado: quality = 0-2, reset interval = 1 dia
3. R(t) = e^(-t/S) recalculado
4. next_review atualizado em orch_concept_memory
5. XP: +5 acerto, +2 tentou

RESPONSE:
{
  "correct": true,
  "xpEarned": 5,
  "explanation": "Exato! log₂(8) = 3 porque 2³ = 8",
  "nextReview": "2026-03-20",
  "retention": 0.85
}
```

### SISIFO (Gamificacao)

| Metodo | Path | Funcao | Auth |
|--------|------|--------|------|
| GET | `/orch-ava/gamification/status` | XP, level, streak, badges, missoes | student |
| GET | `/orch-ava/gamification/leaderboard` | Top 10 da turma (opt-in) | student |
| GET | `/orch-ava/gamification/badges` | Todos os badges disponiveis + earned | student |
| GET | `/orch-ava/gamification/missions` | Missoes ativas | student |
| POST | `/orch-ava/gamification/claim-badge` | Claim badge desbloqueado | student |

**Tabela de XP:**

```
| Acao                    | XP   | Fonte     |
|-------------------------|------|-----------|
| Login diario            | 5    | taylor    |
| Completar video         | 10   | taylor    |
| Responder recap         | 5/q  | comenius  |
| Recap perfeito          | +10  | comenius  |
| Interagir com tutor AI  | 5    | socrates  |
| Entregar atividade      | 15   | freire    |
| Nota >= 8               | +10  | freire    |
| Participar forum        | 5    | taylor    |
| Streak 3 dias           | +15  | sisifo    |
| Streak 7 dias           | +30  | sisifo    |
| Streak 30 dias          | +100 | sisifo    |
```

**Levels:**
```
Level 1: 0 XP      (Novato)
Level 2: 100 XP    (Aprendiz)
Level 3: 300 XP    (Estudante)
Level 4: 600 XP    (Dedicado)
Level 5: 1000 XP   (Scholar)
Level 6: 1500 XP   (Expert)
Level 7: 2100 XP   (Mestre)
Level 8: 2800 XP   (Guru)
Level 9: 3600 XP   (Lenda)
Level 10: 4500 XP  (ORCH Master)
Level 11: 5500 XP  (Iluminado)
Level 12: 7000 XP  (Transcendente)
```

### FREIRE (Grades + Study Plans)

| Metodo | Path | Funcao | Auth |
|--------|------|--------|------|
| GET | `/orch-ava/grades/summary` | Resumo de notas do aluno | student |
| GET | `/orch-ava/grades/simulate` | "Quanto preciso na P2?" | student |
| GET | `/orch-ava/study-plan` | Plano de estudo personalizado | student |
| GET | `/orch-ava/student-xray/:studentId` | Raio-X completo (professor) | teacher |
| POST | `/orch-ava/study-plan/generate` | Gerar novo plano | student |

### FOUCAULT (Risk)

| Metodo | Path | Funcao | Auth |
|--------|------|--------|------|
| GET | `/orch-ava/risk/class/:classId` | Mapa de risco da turma | teacher |
| GET | `/orch-ava/risk/student/:studentId` | Risk assessment detalhado | teacher |
| POST | `/orch-ava/risk/assess` | Trigger assessment manual | coordinator |

### WEBER (Documents + D7)

| Metodo | Path | Funcao | Auth |
|--------|------|--------|------|
| GET | `/orch-ava/d7/:studentId` | Dossier D7 consolidado | teacher |
| GET | `/orch-ava/d7/:studentId/weekly` | Report semanal | teacher |
| POST | `/orch-ava/d7/generate` | Gerar D7 on-demand | teacher |
| GET | `/orch-ava/d7/class/:classId` | D7 da turma inteira | coordinator |

### ORCH ADMIN

| Metodo | Path | Funcao | Auth |
|--------|------|--------|------|
| POST | `/orch-admin/chat` | Chat com page-guide | staff |
| GET | `/orch-admin/conversations` | Conversas admin | staff |
| GET | `/orch-admin/context/:route` | Contexto da pagina atual | staff |
| GET | `/orch-admin/suggestions/:route` | Sugestoes proativas | staff |
| POST | `/orch-admin/walkthrough/:id/start` | Iniciar walkthrough | staff |
| POST | `/orch-admin/walkthrough/:id/complete` | Completar walkthrough | staff |
| GET | `/orch-admin/walkthroughs` | Listar walkthroughs disponiveis | staff |
| GET | `/orch-admin/alerts` | Alertas proativos | staff |
| POST | `/orch-admin/alerts/:id/read` | Marcar alerta como lido | staff |
| POST | `/orch-admin/alerts/:id/dismiss` | Dispensar alerta | staff |
| POST | `/orch-admin/dom/fill` | Preencher campo via DOM Bridge | staff |
| POST | `/orch-admin/dom/scan` | Scan da pagina atual | staff |

**Fluxo `POST /orch-admin/chat`:**

```
REQUEST:
{
  "message": "como cadastro um aluno?",
  "route": "/students",
  "domSnapshot": {
    "url": "/students",
    "forms": [],
    "buttons": ["#btn-new-student", "#btn-import"],
    "visibleText": "Lista de Alunos..."
  }
}

PIPELINE:
1. requireAuth() → user_id (role: staff/coordinator/teacher)
2. loadOrCreateAdminConversation(user_id)
3. detectIntent(message) → 'create_student'
4. RAG search em orch_admin_embedding WHERE route_context = '/students'
5. Montar contexto: chunks + domSnapshot + conversation history
6. GoogleGeminiService.chat(systemPrompt, context, message)
7. Se intent match walkthrough → incluir CTA "Quer que eu te guie?"
8. Save message

RESPONSE (SSE):
event: delta
data: {"content": "Para cadastrar um aluno, "}

event: delta
data: {"content": "clique no botao **Novo Aluno** no canto superior direito. "}

event: done
data: {
  "messageId": "uuid",
  "actionChips": [
    {"label": "Me guie passo a passo", "action": "walkthrough", "walkthroughId": "create-student"},
    {"label": "Importar planilha", "action": "message", "value": "como importo alunos por planilha?"},
    {"label": "Preenche pra mim", "action": "dom-fill", "fields": {"route": "/students/new"}}
  ],
  "relatedWalkthroughs": ["create-student", "bulk-import-students"]
}
```

### DASHBOARD PROFESSOR (LiveLab)

| Metodo | Path | Funcao | Auth |
|--------|------|--------|------|
| GET | `/orch-ava/dashboard/class/:classId` | Overview da turma | teacher |
| GET | `/orch-ava/dashboard/class/:classId/live` | Quem esta online/confuso AGORA | teacher |
| GET | `/orch-ava/dashboard/class/:classId/mastery` | Mastery por skill | teacher |
| GET | `/orch-ava/dashboard/class/:classId/risk-map` | Mapa de risco visual | teacher |
| GET | `/orch-ava/dashboard/class/:classId/predictions` | APLSE preditivo | teacher |
| GET | `/orch-ava/dashboard/student/:studentId` | Deep dive aluno | teacher |

**Fluxo `GET /dashboard/class/:classId` (LiveLab):**

```
RESPONSE:
{
  "classId": "uuid",
  "className": "Matematica 2026.1 - Turma A",
  "studentCount": 35,
  "onlineNow": 12,

  "overview": {
    "avgEngagement": 72,
    "avgMastery": 0.65,
    "avgRisk": 18,
    "completionRate": 0.78,
    "aiInteractions": 234
  },

  "confusedNow": [
    {
      "studentId": "uuid",
      "name": "Maria Silva",
      "indicator": "3 replays no mesmo trecho",
      "topic": "Logaritmos",
      "since": "2026-03-13T14:30:00Z"
    }
  ],

  "riskDistribution": {
    "green": 22,
    "yellow": 8,
    "orange": 3,
    "red": 2,
    "critical": 0
  },

  "topStruggleTopics": [
    { "topic": "Logaritmos", "studentsStruggling": 12, "avgRetention": 0.35 },
    { "topic": "Funcoes Exponenciais", "studentsStruggling": 8, "avgRetention": 0.42 }
  ],

  "recentAlerts": [
    {
      "type": "grade_drop",
      "student": "Joao Santos",
      "message": "Nota caiu de 7.5 para 4.2 nas ultimas 2 semanas",
      "severity": "warning"
    }
  ],

  "prediction": {
    "avgFinalGrade": 6.8,
    "passRate": 0.82,
    "confidence": 0.71
  }
}
```

---

## FRONTEND — COMPONENTES NOVOS

### AVA Player (upgrade do AIChatTab do Leo)

```
AIChatTab (Leo - UPGRADE)
├── ChatHeader
│   ├── AgentAvatar (muda baseado no agente ativo, mas aluno nao ve nome)
│   ├── StatusIndicator (online/typing/thinking)
│   └── StreakBadge (fire emoji + dias)
│
├── MessageList
│   ├── UserMessage
│   ├── AssistantMessage
│   │   ├── StreamingText (token by token, cursor animado)
│   │   ├── HintBlock (graduated: nivel 1-5, expandable)
│   │   ├── QuizInline (questao + opcoes dentro do chat)
│   │   ├── ProgressBar (mastery de um conceito)
│   │   ├── CodeBlock (syntax highlight)
│   │   └── ExpandableSection (detalhes avancados)
│   └── StatusHint ("Buscando contexto...", "Analisando...")
│
├── ActionChips (2-3 sugestoes apos cada resposta)
│   └── Chip (click → envia como mensagem)
│
├── InputBox
│   ├── TextInput (auto-resize, Shift+Enter = newline)
│   ├── SendButton
│   └── VoiceButton (futuro)
│
└── XPToast (popup "+5 XP" quando ganha pontos)
```

### Daily Recap Widget

```
DailyRecapWidget
├── RecapCard (aparece no dashboard do aluno)
│   ├── StreakFire (animacao de fogo)
│   ├── "3 perguntas rapidas" CTA
│   └── EstimatedTime "~2 min"
│
├── RecapScreen
│   ├── ProgressBar (1/5, 2/5...)
│   ├── QuestionCard
│   │   ├── QuestionText
│   │   ├── OptionsGrid (A/B/C/D) ou FillBlank
│   │   └── SubmitButton
│   ├── FeedbackCard
│   │   ├── CorrectAnimation (confetti) / WrongAnimation (gentle)
│   │   ├── Explanation
│   │   └── NextReview "Voce vera isso de novo em 5 dias"
│   └── CompletionScreen
│       ├── Score "4/5 corretas!"
│       ├── XPEarned "+25 XP"
│       ├── StreakUpdated "🔥 4 dias seguidos!"
│       └── ActionChips ["Ver aula", "Falar com tutor", "Mais exercicios"]
```

### CommunicationHub — Tab ORCH (Admin)

```
CommunicationHub (Leo - ADD TAB)
├── Dock
│   ├── [Chat] (Leo)
│   ├── [ORCH] (NEW — tab do page-guide)
│   └── [Alertas] (NEW — proactive alerts badge)
│
├── OrchPanel (NEW)
│   ├── OrchHeader
│   │   ├── OrchAvatar (mascote/icone do ORCH)
│   │   ├── "Como posso ajudar?"
│   │   └── PageContext "Voce esta em: Alunos"
│   │
│   ├── SuggestedQuestions (baseadas na rota atual)
│   │   └── QuestionChip × 3
│   │
│   ├── OrchMessageList
│   │   ├── UserMessage
│   │   ├── AssistantMessage
│   │   │   ├── StreamingText
│   │   │   ├── WalkthroughCTA ("Quer que eu te guie?")
│   │   │   ├── DomFillPreview ("Posso preencher: Nome, Email, CPF")
│   │   │   └── AlertCard (proactive alert inline)
│   │   └── TypingIndicator
│   │
│   ├── ActionChips
│   │   └── Chip (message | walkthrough | dom-fill)
│   │
│   └── OrchInputBox
│
├── AlertsPanel (NEW)
│   ├── AlertCard × N
│   │   ├── SeverityBadge (info/warning/critical)
│   │   ├── Title + Description
│   │   ├── ActionButton ("Ver aluno", "Aprovar")
│   │   └── DismissButton
│   └── EmptyState "Tudo tranquilo por aqui!"
```

### Dashboard Professor (LiveLab)

```
TeacherDashboard (NEW page)
├── ClassSelector (dropdown de turmas)
│
├── OverviewGrid (4 cards)
│   ├── EngagementCard (score + trend arrow)
│   ├── MasteryCard (% medio + skill mais fraco)
│   ├── RiskCard (distribuicao verde/amarelo/laranja/vermelho)
│   └── PredictionCard (nota media prevista + pass rate)
│
├── LiveSection "Agora"
│   ├── OnlineStudents (avatares, count)
│   ├── ConfusedNow (lista: nome + indicador + topico)
│   └── RecentAIInteractions (feed real-time)
│
├── TopStruggleTopics (bar chart)
│
├── StudentList (tabela sortable)
│   ├── Columns: Nome | Engagement | Mastery | Risk | Last Active | Actions
│   └── Click → StudentDetail
│
├── StudentDetail (side panel)
│   ├── ProfileSummary
│   ├── EngagementChart (line, 30 dias)
│   ├── SkillsRadar (chart radar)
│   ├── RiskDimensions (8 bars)
│   ├── ForgettingCurves (top concepts decay)
│   ├── AIConversations (recent)
│   └── D7Report (ultimo, com download PDF)
│
└── AlertsFeed (side rail)
```

---

## FLUXO COMPLETO — DIA NA VIDA DO ALUNO

```
06:00  CRON Ebbinghaus → seleciona conceitos para revisao
06:05  CRON Comenius → gera orch_daily_recap com 5 questoes

08:00  ALUNO ABRE O AVA
       → Taylor registra login (experience_event)
       → Sisifo: +5 XP login diario, streak check
       → Hub: primeira mensagem = "Bom dia! 🔥 Dia 4 de streak. Tem 3 perguntinhas rapidas esperando."
       → Action chips: ["Fazer revisao", "Ir pra aula", "Ver notas"]

08:02  ALUNO CLICA "Fazer revisao"
       → Abre DailyRecapWidget
       → 5 questoes, ~2 minutos
       → Cada resposta → SM-2 update em orch_concept_memory
       → Completa: +25 XP, streak = 4, toast "🔥 4 dias!"

08:05  ALUNO ASSISTE VIDEO (Player)
       → Taylor registra watch event
       → Pausa >30s no minuto 5:23 → sugestao proativa no AIChatTab:
         "Algo confuso? Estamos falando de derivadas nesse trecho."
       → Chips: ["Explica derivadas", "Estou bem", "Pular topico"]

08:08  ALUNO PERGUNTA "nao entendi derivada"
       → Hub detecta intent: content_doubt → rota para Socrates
       → Socrates: RAG busca chunks da aula + transcricao do video
       → Socrates: modo Socratico (NUNCA da resposta direta)
       → "Voce sabe o que significa 'taxa de variacao'?"
       → Chips: ["Acho que sim", "Nao sei", "Mostra no grafico"]

08:12  DIALOGO SOCRATICO (3-4 turnos)
       → Gardner (invisivel): nota que aluno responde melhor com exemplos visuais
       → Wittgenstein (invisivel): detecta registro informal, CEFR B1
       → Bourdieu profile update: cognitive_profile.learning_preferences += "visual"
       → Socrates adapta: inclui mais analogias visuais nas proximas respostas

08:15  ALUNO ENTENDE → "aaah agora entendi!"
       → Socrates: "Otimo! Quer testar com um exercicio rapido?"
       → Se sim → quiz inline no chat (nao sai do player)
       → +10 XP por acertar, conceito registrado com retention alta

14:00  CRON Taylor → snapshot diario de engagement
14:05  CRON Foucault → risk assessment (8 dimensoes)
       → Se aluno X tem risk_level = 'orange':
         → Cria orch_admin_alert para coordenador
         → Alert aparece no CommunicationHub do coordenador

22:00  ALUNO VOLTA A NOITE
       → Hub: "Boa noite! Voce assistiu a aula de derivadas hoje. Quer revisar?"
       → Taylor: sessao vespertina registrada
       → Ebbinghaus: conceito "derivada" → next_review recalculado

DOMINGO 04:00  CRON Weber → gera D7 semanal
       → Consolida: Freire (notas) + Taylor (engagement) + Foucault (risco) +
         Gardner (perfil cognitivo) + Sisifo (gamificacao) + Ebbinghaus (retencao)
       → Salva em orch_d7_report, notifica professor
```

---

## FLUXO COMPLETO — DIA NA VIDA DO COORDENADOR (ADMIN)

```
08:00  COORDENADOR ABRE ADMIN
       → CommunicationHub: badge "3" no tab Alertas
       → 3 alertas proativos:
         1. ⚠️ "Maria Silva: frequencia abaixo de 60% (3 faltas seguidas)" [Ver aluna]
         2. ⚠️ "Turma B: media geral caiu 1.2 pontos vs semana passada" [Ver turma]
         3. ℹ️ "5 matriculas pendentes de aprovacao" [Aprovar]

08:02  COORDENADOR VAI PARA /students
       → ORCH (tab): "Voce esta na lista de alunos. Posso ajudar a cadastrar, importar ou filtrar."
       → Suggested questions baseadas na rota:
         ["Como cadastro um aluno?", "Importar planilha", "Filtrar por turma"]

08:03  COORDENADOR PERGUNTA "como importo alunos?"
       → ORCH: RAG busca em admin_knowledge_embedding (route = /students)
       → Resposta com passo a passo
       → Chip: "Me guie passo a passo" → inicia walkthrough

08:04  WALKTHROUGH ATIVO
       → Step 1: highlight #btn-import → "Clique em Importar"
       → Step 2: highlight #file-input → "Selecione a planilha (.xlsx)"
       → Step 3: highlight #btn-map-columns → "Mapeie as colunas"
       → Step 4: highlight #btn-confirm → "Confirme a importacao"
       → Coordenador completa → orch_admin_walkthrough_usage registrado

08:10  COORDENADOR ESTA NA /students/new (formulario)
       → ORCH detecta 30s sem acao (stuck detection)
       → Sugestao proativa: "Precisa de ajuda com algum campo?"
       → SmartTips: tooltip nos campos mais complexos (CPF, RA)

08:12  COORDENADOR: "preenche pra mim: Joao Silva, CPF 123.456.789-00"
       → ORCH: DOM Bridge → postMessage('orch-page-guide')
       → FILL_FIELD: #input-name = "Joao Silva"
       → FILL_FIELD: #input-cpf = BLOCKED (campo sensivel)
       → Resposta: "Preenchi o nome. CPF e campo sensivel — preciso que voce digite."

09:00  COORDENADOR ABRE DASHBOARD PROFESSOR (LiveLab)
       → Overview: 35 alunos, 12 online agora, engagement 72%
       → Confused now: "Pedro (3 replays em derivadas)", "Ana (5 perguntas ao tutor em 10min)"
       → Risk map: 2 alunos em vermelho, 3 em laranja
       → Prediction: media final prevista 6.8, taxa aprovacao 82%

09:05  CLICK EM ALUNO VERMELHO
       → StudentDetail abre:
         - Engagement: 35 (critical, declining)
         - Risk dimensions: attendance 90, financial 70, engagement 80
         - Ultimo login: 5 dias atras
         - D7 report: "Aluno nao acessa ha 5 dias, 4 atividades pendentes"
         - Recomendacao Foucault: "OUTREACH — contato proativo urgente"
       → Chips: ["Enviar mensagem", "Agendar reuniao", "Ver historico completo"]
```

---

## CRON JOBS

| Schedule | Agente | Acao |
|----------|--------|------|
| Daily 06:00 | Ebbinghaus | Seleciona conceitos para revisao (R(t) < 0.4) |
| Daily 06:05 | Comenius | Gera daily recaps pendentes |
| Daily 14:00 | Taylor | Snapshot de engagement |
| Daily 14:05 | Foucault | Risk assessment batch |
| Daily 23:59 | Sisifo | Streak reset (quem nao fez nada) |
| Weekly Sun 04:00 | Weber | Gera D7 semanal |
| Weekly Mon 08:00 | Admin Alerts | Gera alertas proativos semanais |
| Monthly 1st | Weber | Gera D7 mensal |

---

## TECH STACK (Additions)

| O que | Tech | Porque |
|-------|------|--------|
| Intent detection | Gemini 2.5-flash-lite (Leo) | Rapido, barato, ja configurado |
| Tutor responses | Gemini 2.5-flash (upgrade) | Melhor raciocinio que lite |
| Embeddings | OpenAI text-embedding-3-small (Leo) | 1536 dims, ja configurado |
| Vector search | pgvector (Leo) | Ja instalado, nao precisa infra nova |
| Streaming | SSE (Server-Sent Events) | Nativo Express, nao precisa lib |
| Chat UI | assistant-ui (6.9k stars, YC) | React, streaming, composable |
| Spaced repetition | SM-2 algorithm | Simples, comprovado, sem dependencia |
| Real-time | Socket.IO (Leo) | Ja configurado, notificacoes |
| Events | RabbitMQ (Leo) | `domain.events` exchange ja existe |
| Walkthrough UI | Driver.js ou Shepherd.js | Leve, DOM highlight, steps |
| Charts dashboard | Recharts ou Nivo | React-native, server-side friendly |

---

## ESTIMATIVA DE CUSTO AI (por 1000 alunos ativos)

| Componente | Modelo | Calls/dia | Tokens/call | Custo/dia |
|-----------|--------|-----------|-------------|-----------|
| Hub intent detection | flash-lite | 3000 | ~200 | $0.45 |
| Socrates tutor | flash | 2000 | ~800 | $2.40 |
| Comenius recap gen | flash-lite | 1000 | ~300 | $0.23 |
| Admin page-guide | flash | 500 | ~500 | $0.38 |
| D7 reports | flash | 50/week | ~2000 | $0.07 |
| Embeddings | OAI small | 200 | ~500 | $0.02 |
| **TOTAL** | | | | **~$3.55/dia = ~$107/mes** |

Com quota enforcement (company_ai_config do Leo): cada empresa define seu teto.
