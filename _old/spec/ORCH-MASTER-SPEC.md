# ORCH MASTER SPEC — Documento Definitivo

Data: 2026-03-13
Versao: 3.3 (PV Audit v1 + Audit Epistemico + PV Audit v2 — FINAL)
Status: SPEC COMPLETA PARA APROVACAO

---

## 1. VISAO

Dois sistemas de IA conversacional para a plataforma Cogedu:

- **ORCH AVA** — 20 agentes para o aluno (tutor, gamificacao, memoria, risco, documentos...)
- **ORCH ADMIN** — Page-guide inteligente para staff (RAG, DOM Bridge, walkthroughs, alertas)

Construido 100% sobre a infra que o Leo deixou funcionando (services, tabelas, pgvector, Socket.IO, RabbitMQ).

---

## 2. ARQUITETURA

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
│  │ │(Comenius)│ │  │ │  (nativo DOM)││  │ │   (Weber)        │  │ │
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
│  └──┬─────┬─────┬──────┬──────┬──────┬──────┬──────┬──────┬──┘   │
│     │     │     │      │      │      │      │      │      │       │
│  ┌──▼──┐┌─▼──┐┌─▼───┐┌─▼───┐┌─▼───┐┌─▼───┐┌─▼────┐┌▼────┐┌▼───┐│
│  │Socr.││Frei││Ebbin││Comen││Sisif││Weber││Arist.││Heim.││Dewe││
│  │tutor││grad││memor││recap││gamif││docs ││asses.││admis││case││
│  └──┬──┘└─┬──┘└─┬───┘└─┬───┘└─┬───┘└─┬───┘└─┬────┘└┬────┘└┬───┘│
│     │     │     │      │      │      │      │      │      │     │
│  ┌──▼─────▼─────▼──────▼──────▼──────▼──────▼──────▼──────▼──┐  │
│  │              BOURDIEU (perfil central + arquetipos)         │  │
│  └────────────────────────────┬────────────────────────────────┘  │
│                               │                                    │
│  ┌──────────── INVISIBLES ────▼──────────────────────────────┐   │
│  │ Taylor    │ Foucault  │ Gardner     │ Wittgenstein │ SafeGuard │   │
│  │ engage.   │ risk      │ cognitive   │ linguistic   │ safety│   │
│  └───────────────────────────────────────────────────────────-┘   │
│                                                                    │
│  ┌──────────── PLACEHOLDERS ─────────────────────────────────┐   │
│  │ Janus (enrollment) │ Keynes (financial) │ Vygotsky (ZPD) │   │
│  │ Braille (a11y)                                            │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌──────────── ADMIN AI ─────────────────────────────────────┐   │
│  │ PageGuide RAG │ DOM Bridge │ Walkthroughs │ Alerts │Zodiac│   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌──────────── LEO SERVICES (REUSE) ─────────────────────────┐   │
│  │ GoogleGeminiService │ EmbeddingService │ ComponentRAGService│   │
│  │ TextChunkingService │ ContentAnalysisService               │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PostgreSQL 17 + pgvector │ RabbitMQ │ Socket.IO │ Keycloak       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. INFRA DO LEO (REUTILIZAR 100%)

### Services

| Servico | O que faz | Quem usa |
|---------|-----------|----------|
| `GoogleGeminiService` | Wrapper @ai-sdk/google (chat + structured) | Hub, Socrates, Admin, Comenius, todos |
| `EmbeddingService` | OpenAI text-embedding-3-small (1536 dims) | Admin RAG, Socrates RAG, Dewey |
| `ComponentRAGService` | Search vetorial multi-componente | Socrates |
| `TextChunkingService` | Split texto (1000 chars, 200 overlap) | Admin knowledge, Dewey |
| `ContentAnalysisService` | Gemini analisa transcricoes → ai_analysis | Socrates |

### Tabelas existentes (11)

| Tabela | Status | Quem usa agora |
|--------|--------|---------------|
| `content_embedding` | EM USO | Socrates RAG |
| `ai_conversation` | CRIADA, NAO USADA | → Hub (persistencia) |
| `ai_conversation_message` | CRIADA, NAO USADA | → Hub (historico) |
| `ai_processing_job` | CRIADA, NAO USADA | → batch jobs |
| `company_ai_config` | CRIADA, NAO VERIFICADA | → FinOps quota |
| `ai_usage_alert` | CRIADA | → FinOps alertas |
| `conversation` | EM USO | CommunicationHub chat |
| `conversation_message` | EM USO | CommunicationHub msgs |
| `conversation_read_state` | EM USO | CommunicationHub read tracking |
| `user_notification` | EM USO | Notificacoes sistema |
| `experience_events` | EM USO | FinOps logging, Taylor xAPI |

### Frontend existente

| Componente | Status |
|-----------|--------|
| `CommunicationHub.tsx` | LIVE — add tab ORCH |
| `Dock.tsx` | LIVE — add badge alertas |
| `HubPanel.tsx` | LIVE — manter |
| `ChatScreen.tsx` | LIVE — manter |
| `AIChatTab.tsx` (Player) | LIVE — upgrade com Hub Router |
| `ChatContext/ChatProvider` | LIVE — manter polling |
| Socket.IO client | LIVE — real-time |

---

## 4. TODAS AS TABELAS NOVAS (27 tabelas)

### 4.1 Perfil Central — Bourdieu

```sql
CREATE TABLE orch_student_profile (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  student_id              UUID NOT NULL REFERENCES "user"(id),
  version                 INTEGER DEFAULT 1,

  -- Bourdieu: 12 arquetipos comunicacionais
  communication_archetype VARCHAR(50) NOT NULL DEFAULT 'explorer',
  -- explorer, scholar, pragmatic, creative, competitor,
  -- social, reflective, anxious, skeptic, leader, observer, rebel
  -- PV-FIX: NOT NULL + CHECK constraint impede defaults corrompidos
  CONSTRAINT chk_archetype CHECK (communication_archetype IN (
    'explorer','scholar','pragmatic','creative','competitor',
    'social','reflective','anxious','skeptic','leader','observer','rebel'
  )),

  academic_profile        JSONB DEFAULT '{
    "gpa": null, "standing": "regular", "trend": "stable",
    "strongest_subjects": [], "weakest_subjects": [],
    "attendance_rate": null
  }'::jsonb,

  cognitive_profile       JSONB DEFAULT '{
    "dominant_intelligences": [],
    "intelligence_observations": {
      "linguistic": 0, "logical_math": 0, "spatial": 0,
      "bodily_kinesthetic": 0, "musical": 0, "interpersonal": 0,
      "intrapersonal": 0, "naturalist": 0
    },
    "learning_preferences": [],
    "confidence_level": 0,
    "metacognitive_calibration": null
  }'::jsonb,
  -- Gardner MI como eixo principal (Audit Epistemico: Felder-Silverman removido)
  -- metacognitive_calibration = |confianca_subjetiva - performance_real| (Lacuna 1)

  linguistic_profile      JSONB DEFAULT '{
    "cefr_level": null, "vocabulary_richness": null,
    "formality_range": [0, 0], "preferred_register": "informal",
    "detected_language": "pt-BR"
  }'::jsonb,

  engagement_profile      JSONB DEFAULT '{
    "score": 0, "trend": "unknown", "login_frequency": null,
    "avg_session_minutes": null, "last_active": null,
    "peak_hours": [], "preferred_content_type": null
  }'::jsonb,

  gamification_profile    JSONB DEFAULT '{
    "xp": 0, "level": 1, "streak_days": 0,
    "streak_last_date": null, "badges": [],
    "octalysis_drivers": {
      "meaning": 0, "accomplishment": 0, "empowerment": 0,
      "ownership": 0, "social": 0, "scarcity": 0,
      "unpredictability": 0, "avoidance": 0
    }
  }'::jsonb,

  risk_profile            JSONB DEFAULT '{
    "score": 0, "level": "green",
    "dimensions": {
      "academic": 0, "attendance": 0, "engagement": 0, "financial": 0,
      "social": 0, "emotional": 0, "temporal": 0, "vocational": 0
    },
    "last_assessment": null, "interventions": []
  }'::jsonb,

  forgetting_curves       JSONB DEFAULT '{}'::jsonb,
  skills_mastery          JSONB DEFAULT '{}'::jsonb,

  sociocultural           JSONB DEFAULT '{
    "capital_cultural": null, "capital_social": null,
    "first_generation": null, "digital_literacy": null
  }'::jsonb,

  updated_by              VARCHAR(50) NOT NULL DEFAULT 'system',
  updated_at              TIMESTAMPTZ DEFAULT now(),
  created_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, tenant_id)
);

CREATE INDEX idx_orch_profile_student ON orch_student_profile(student_id);
CREATE INDEX idx_orch_profile_tenant ON orch_student_profile(tenant_id);
```

### 4.2 Audit Trail — IntelliCode Pattern

```sql
CREATE TABLE orch_profile_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES "user"(id),
  agent_id    VARCHAR(50) NOT NULL,
  field_path  TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  reasoning   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_student ON orch_profile_audit(student_id);
CREATE INDEX idx_audit_agent ON orch_profile_audit(agent_id);
```

### 4.3 Daily Recap — Comenius

```sql
CREATE TABLE orch_daily_recap (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  recap_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  status          VARCHAR(20) DEFAULT 'pending',
  -- pending, in_progress, completed, skipped

  questions_total   INTEGER DEFAULT 5,
  questions_correct INTEGER DEFAULT 0,
  xp_earned         INTEGER DEFAULT 0,
  time_spent_sec    INTEGER DEFAULT 0,
  streak_day        INTEGER DEFAULT 0,

  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, recap_date)
);

CREATE TABLE orch_recap_question (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id        UUID NOT NULL REFERENCES orch_daily_recap(id) ON DELETE CASCADE,
  concept_id      VARCHAR(100) NOT NULL,
  question_type   VARCHAR(30) NOT NULL,
  -- multiple_choice, true_false, fill_blank, short_answer, match
  question_text   TEXT NOT NULL,
  options         JSONB,
  correct_answer  TEXT NOT NULL,
  difficulty      REAL DEFAULT 0.5,
  source_unit_id  UUID,
  student_answer  TEXT,
  is_correct      BOOLEAN,
  answered_at     TIMESTAMPTZ,
  time_spent_sec  INTEGER,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 4.4 Curva de Esquecimento — Ebbinghaus

```sql
CREATE TABLE orch_concept_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  concept_id      VARCHAR(100) NOT NULL,
  concept_label   TEXT NOT NULL,
  source_unit_id  UUID,

  -- SM-2 algorithm
  easiness_factor REAL DEFAULT 2.5,
  interval_days   INTEGER DEFAULT 1,
  repetitions     INTEGER DEFAULT 0,
  retention       REAL DEFAULT 1.0,    -- R(t) = e^(-t/S)

  last_review     TIMESTAMPTZ,
  next_review     TIMESTAMPTZ,
  last_quality    INTEGER,             -- 0-5

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, concept_id)
);

CREATE INDEX idx_concept_next ON orch_concept_memory(student_id, next_review);
```

### 4.5 Gamificacao — Sisifo

```sql
CREATE TABLE orch_gamification (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  student_id  UUID NOT NULL REFERENCES "user"(id),
  xp_total    INTEGER DEFAULT 0,
  level       INTEGER DEFAULT 1,
  streak_days INTEGER DEFAULT 0,
  streak_best INTEGER DEFAULT 0,
  streak_last DATE,
  badges      JSONB DEFAULT '[]'::jsonb,
  missions    JSONB DEFAULT '[]'::jsonb,
  octalysis   JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, tenant_id)
);

CREATE TABLE orch_xp_transaction (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES "user"(id),
  amount      INTEGER NOT NULL,        -- SEMPRE positivo
  source      VARCHAR(50) NOT NULL,    -- recap, assessment, login, streak, badge
  source_id   VARCHAR(100),
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 4.6 Engagement — Taylor

```sql
CREATE TABLE orch_engagement_snapshot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  score           REAL NOT NULL,       -- 0-100
  trend           VARCHAR(20) DEFAULT 'stable',
  -- rising, stable, declining, critical
  login_score     REAL,
  time_score      REAL,
  content_score   REAL,
  social_score    REAL,
  assessment_score REAL,
  ai_score        REAL,
  events_count    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, snapshot_date)
);
```

### 4.7 Risco — Foucault

```sql
CREATE TABLE orch_risk_assessment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  risk_score      REAL NOT NULL,       -- 0-100
  risk_level      VARCHAR(20) NOT NULL,
  -- green (0-20), yellow (21-40), orange (41-60), red (61-80), critical (81-100)
  dim_academic    REAL DEFAULT 0,
  dim_attendance  REAL DEFAULT 0,
  dim_engagement  REAL DEFAULT 0,
  dim_financial   REAL DEFAULT 0,
  dim_social      REAL DEFAULT 0,
  dim_emotional   REAL DEFAULT 0,
  dim_temporal    REAL DEFAULT 0,
  dim_vocational  REAL DEFAULT 0,
  intervention    VARCHAR(30),
  -- none, monitor, nudge, outreach, meeting, urgent
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, assessment_date)
);
```

### 4.8 D7 Reports — Weber

```sql
CREATE TABLE orch_d7_report (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  report_type     VARCHAR(30) NOT NULL,  -- weekly, monthly, semester, on_demand
  report_date     DATE NOT NULL,
  generated_by    VARCHAR(50) DEFAULT 'weber',
  data            JSONB NOT NULL,
  -- { summary, academic, engagement, risk, cognitive, gamification,
  --   memory, recommendations[], trend_vs_last }
  pdf_url         TEXT,
  viewed_by_teacher BOOLEAN DEFAULT false,
  viewed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_d7_student ON orch_d7_report(student_id, report_date DESC);
```

### 4.9 Assessment Pipeline — Aristoteles

```sql
CREATE TABLE orch_assessment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  student_id      UUID NOT NULL REFERENCES "user"(id),
  assignment_id   UUID,                  -- ref atividade no Cogedu
  class_id        UUID,

  -- Submission
  submitted_text  TEXT,
  submitted_file  TEXT,                  -- S3 path
  submitted_at    TIMESTAMPTZ,

  -- Stage 1: Quality Assessment (5 dimensoes)
  quality_score          REAL,           -- 0-10
  quality_relevance      REAL,
  quality_depth          REAL,
  quality_coherence      REAL,
  quality_originality    REAL,
  quality_argumentation  REAL,

  -- Stage 2: Plagiarism
  plagiarism_score       REAL,           -- 0-1 (probabilidade)
  plagiarism_method      VARCHAR(30),    -- winnowing, cosine, jaccard
  plagiarism_matches     JSONB,          -- [{ source, similarity, snippet }]

  -- Stage 3: AI Detection (3 tiers)
  ai_detection_score     REAL,           -- 0-1
  ai_detection_tier      VARCHAR(20),    -- human, mixed, ai_suspected
  ai_detection_method    VARCHAR(30),    -- binoculars, stylometric, ensemble

  -- Stage 4: Stylometric Profile
  stylometric_profile    JSONB,
  -- { avg_sentence_length, vocabulary_diversity, formality,
  --   readability_score, passive_voice_ratio, consistency_vs_baseline }
  stylometric_consistent BOOLEAN,        -- consistente com baseline do aluno?

  -- Stage 5: Composite Score
  composite_score        REAL,           -- 0-10 final
  confidence             REAL,           -- quao confiante estamos

  -- Status
  status          VARCHAR(20) DEFAULT 'pending',
  -- pending, processing, stage_1, stage_2, stage_3, stage_4, completed, error
  processing_time_ms INTEGER,
  error_message   TEXT,

  -- Teacher review
  teacher_reviewed   BOOLEAN DEFAULT false,
  teacher_override   REAL,               -- nota manual do professor
  teacher_notes      TEXT,
  reviewed_at        TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_assessment_student ON orch_assessment(student_id);
CREATE INDEX idx_assessment_class ON orch_assessment(class_id);
CREATE INDEX idx_assessment_status ON orch_assessment(status);

-- Baseline estilometrico do aluno (construido ao longo do tempo)
CREATE TABLE orch_stylometric_baseline (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES "user"(id),
  tenant_id   UUID NOT NULL,
  samples_count INTEGER DEFAULT 0,
  baseline    JSONB NOT NULL,
  -- { avg_sentence_length: { mean, stddev },
  --   vocabulary_diversity: { mean, stddev },
  --   formality: { mean, stddev },
  --   function_word_dist: [...],
  --   punctuation_patterns: {...} }
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, tenant_id)
);
```

### 4.10 Cognitive Observations — Gardner

```sql
-- Gardner eh INVISIVEL — nao tem endpoints proprios.
-- Observa interacoes e alimenta cognitive_profile no Bourdieu.

CREATE TABLE orch_cognitive_observation (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES "user"(id),
  observation_type VARCHAR(50) NOT NULL,
  -- content_preference, response_pattern, learning_speed,
  -- visual_vs_verbal, active_vs_reflective, error_pattern
  raw_data    JSONB NOT NULL,
  -- ex: { "type": "video_rewind", "count": 3, "section": "visual_explanation" }
  -- ex: { "type": "text_preference", "chose": "diagram", "over": "paragraph" }
  inferred    JSONB,
  -- ex: { "intelligence": "visual-spatial", "confidence": 0.7 }
  source_agent VARCHAR(50),              -- qual agente gerou a observacao
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cognitive_student ON orch_cognitive_observation(student_id);
```

### 4.11 Linguistic Samples — Wittgenstein

```sql
-- Wittgenstein eh INVISIVEL — analisa textos e alimenta linguistic_profile no Bourdieu.

CREATE TABLE orch_linguistic_sample (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES "user"(id),
  context     VARCHAR(30) NOT NULL,
  -- chat, forum, assessment, portfolio
  text_sample TEXT NOT NULL,
  word_count  INTEGER,

  -- Analise
  cefr_estimated      VARCHAR(5),       -- A1, A2, B1, B2, C1, C2
  vocabulary_richness REAL,              -- type-token ratio
  avg_sentence_length REAL,
  formality_score     REAL,              -- 0-1
  readability         REAL,              -- indice de legibilidade
  grammar_errors      INTEGER,
  grammar_details     JSONB,             -- [{ type, position, suggestion }]
  language_detected   VARCHAR(10),       -- pt-BR, en, es

  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_linguistic_student ON orch_linguistic_sample(student_id);
```

### 4.12 Safety Flags — SafeGuard

```sql
-- SafeGuard eh INVISIVEL + PLACEHOLDER. Scan de seguranca emocional.
-- Roda em BACKGROUND em cada mensagem do aluno.

CREATE TABLE orch_safety_flag (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  student_id  UUID NOT NULL REFERENCES "user"(id),
  message_id  UUID,                      -- ref ai_conversation_message
  flag_type   VARCHAR(30) NOT NULL,
  -- emotional_distress, self_harm_risk, bullying_report,
  -- crisis_language, harassment, violence
  severity    VARCHAR(20) NOT NULL,      -- low, medium, high, critical
  trigger_text TEXT,                      -- trecho que disparou
  action_taken VARCHAR(30),
  -- none, logged, escalated_coordinator, escalated_emergency
  escalated_to UUID,                     -- user_id do coordenador
  resolved     BOOLEAN DEFAULT false,
  resolved_by  UUID,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_safety_student ON orch_safety_flag(student_id);
CREATE INDEX idx_safety_severity ON orch_safety_flag(severity);
```

### 4.13 Admission + Onboarding — Heimdall

```sql
CREATE TABLE orch_admission_lead (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,

  -- Dados do lead (pre-matricula)
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  source      VARCHAR(50),               -- website, referral, social, event
  interest    TEXT,                       -- curso/area de interesse

  -- Lead scoring (0-100)
  lead_score  REAL DEFAULT 0,
  score_factors JSONB,
  -- { engagement: 20, fit: 30, urgency: 15, completeness: 10 }

  -- Funnel stage
  stage       VARCHAR(30) DEFAULT 'new',
  -- new, contacted, qualified, applied, enrolled, lost

  -- Conversational data (Heimdall conversa antes da matricula)
  conversation_id UUID,                  -- ref ai_conversation
  objections      JSONB DEFAULT '[]'::jsonb,
  -- [{ "type": "price", "response": "...", "resolved": true }]

  -- Conversion
  converted_user_id UUID,               -- user criado apos matricula
  converted_at      TIMESTAMPTZ,
  lost_reason       TEXT,

  assigned_to UUID,                      -- consultor responsavel
  last_contact TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orch_onboarding_progress (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  student_id  UUID NOT NULL REFERENCES "user"(id),

  -- Onboarding 30 dias
  started_at  TIMESTAMPTZ DEFAULT now(),
  day_count   INTEGER DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'active',
  -- active, completed, stalled, abandoned

  -- Checklist de onboarding
  checklist   JSONB DEFAULT '{
    "profile_complete": false,
    "first_login": false,
    "watched_intro_video": false,
    "explored_courses": false,
    "first_ai_interaction": false,
    "first_assignment": false,
    "joined_class_chat": false,
    "completed_first_recap": false,
    "met_coordinator": false,
    "feedback_given": false
  }'::jsonb,

  completion_rate REAL DEFAULT 0,        -- 0-1
  completed_at    TIMESTAMPTZ,

  -- Heimdall check-ins (msgs proativas)
  last_checkin    TIMESTAMPTZ,
  checkins_sent   INTEGER DEFAULT 0,

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, tenant_id)
);
```

### 4.14 Case Studies — Dewey

```sql
CREATE TABLE orch_case_study (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,

  -- Metadata
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  domain          VARCHAR(50),           -- business, law, health, education, tech
  difficulty      VARCHAR(20),           -- beginner, intermediate, advanced
  estimated_minutes INTEGER DEFAULT 30,

  -- Conteudo
  scenario        TEXT NOT NULL,          -- texto do caso
  questions       JSONB NOT NULL,         -- perguntas para discussao
  -- [{ "id": 1, "text": "...", "type": "open|multiple|debate" }]
  teaching_notes  TEXT,                   -- notas para o professor
  reference_solution TEXT,                -- solucao de referencia (so professor ve)

  -- Fontes
  source_type     VARCHAR(30),           -- generated, adapted, real_world
  source_unit_id  UUID,                  -- de qual aula foi gerado
  real_world_ref  TEXT,                  -- referencia do mundo real

  -- CBR Flywheel
  times_used      INTEGER DEFAULT 0,
  avg_rating      REAL,
  embedding       vector(1536),          -- para busca semantica

  status          VARCHAR(20) DEFAULT 'draft',
  -- draft, published, archived
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE orch_case_discussion (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID NOT NULL REFERENCES orch_case_study(id),
  class_id        UUID,
  student_id      UUID NOT NULL REFERENCES "user"(id),

  -- Resposta do aluno
  question_id     INTEGER NOT NULL,
  response_text   TEXT NOT NULL,

  -- Avaliacao AI (Dewey facilita discussao socratica)
  ai_feedback     TEXT,
  quality_score   REAL,                  -- 0-10

  -- Peer review (opcional)
  peer_reviews    JSONB DEFAULT '[]'::jsonb,
  -- [{ "reviewer_id": "...", "rating": 8, "comment": "..." }]

  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_case_domain ON orch_case_study(domain);
CREATE INDEX idx_case_embedding ON orch_case_study
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
```

### 4.15 Admission ZPD — Vygotsky (placeholder)

```sql
CREATE TABLE orch_zpd_assessment (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES "user"(id),
  concept_id  VARCHAR(100) NOT NULL,

  -- Zona de Desenvolvimento Proximal
  can_do_alone    BOOLEAN DEFAULT false,   -- domina sozinho
  can_do_guided   BOOLEAN DEFAULT false,   -- consegue com ajuda
  cannot_do       BOOLEAN DEFAULT true,    -- ainda nao consegue

  -- Scaffolding level (quanto apoio precisa)
  scaffolding_level INTEGER DEFAULT 3,     -- 1 (minimo) a 5 (maximo)
  scaffolding_type  VARCHAR(30),
  -- hint, example, analogy, step_by_step, direct_instruction

  assessed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, concept_id)
);
```

### 4.16 Accessibility — Braille (placeholder)

```sql
CREATE TABLE orch_accessibility_preference (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES "user"(id),

  -- Preferencias de acessibilidade
  needs_screen_reader  BOOLEAN DEFAULT false,
  needs_high_contrast  BOOLEAN DEFAULT false,
  needs_large_text     BOOLEAN DEFAULT false,
  needs_captions       BOOLEAN DEFAULT true,
  needs_audio_desc     BOOLEAN DEFAULT false,
  preferred_font_size  INTEGER DEFAULT 16,
  preferred_speed      REAL DEFAULT 1.0,     -- playback speed
  color_blind_mode     VARCHAR(20),          -- protanopia, deuteranopia, tritanopia

  -- Adaptacoes de conteudo
  simplify_language    BOOLEAN DEFAULT false,
  extra_time_assessments REAL DEFAULT 1.0,   -- multiplicador (1.5 = 50% mais tempo)

  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id)
);
```

### 4.17-4.22 Admin Tables

```sql
-- 4.17 Admin Knowledge Base RAG
CREATE TABLE orch_admin_embedding (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  source_file VARCHAR(200) NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text  TEXT NOT NULL,
  route_context VARCHAR(200),
  domain      VARCHAR(50),
  embedding   vector(1536) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admin_emb_route ON orch_admin_embedding(route_context);
CREATE INDEX idx_admin_emb_vector ON orch_admin_embedding
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- 4.18 Admin Conversation (memoria 30d)
CREATE TABLE orch_admin_conversation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  user_id         UUID NOT NULL REFERENCES "user"(id),
  status          VARCHAR(20) DEFAULT 'active',
  context_summary TEXT,
  faq_learned     JSONB DEFAULT '[]'::jsonb,
  messages_count  INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 4.19 Admin Messages
CREATE TABLE orch_admin_message (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES orch_admin_conversation(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL,
  content         TEXT NOT NULL,
  route_context   VARCHAR(200),
  dom_snapshot    JSONB,
  action_taken    JSONB,
  tokens_used     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 4.20 Admin Walkthroughs
CREATE TABLE orch_admin_walkthrough (
  id              VARCHAR(100) PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  route           VARCHAR(200) NOT NULL,
  steps           JSONB NOT NULL,
  trigger_intent  TEXT[],
  trigger_stuck   BOOLEAN DEFAULT false,
  times_used      INTEGER DEFAULT 0,
  avg_completion  REAL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 4.21 Admin Walkthrough Usage
CREATE TABLE orch_admin_walkthrough_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  walkthrough_id  VARCHAR(100) NOT NULL REFERENCES orch_admin_walkthrough(id),
  user_id         UUID NOT NULL REFERENCES "user"(id),
  status          VARCHAR(20) DEFAULT 'started',
  step_reached    INTEGER DEFAULT 0,
  started_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- 4.22 Admin Proactive Alerts
CREATE TABLE orch_admin_alert (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  alert_type  VARCHAR(50) NOT NULL,
  category    VARCHAR(20) NOT NULL,
  severity    VARCHAR(20) DEFAULT 'info',
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  action_url  VARCHAR(500),
  action_label VARCHAR(100),
  target_roles TEXT[] DEFAULT '{}',
  target_user_id UUID,
  entity_type VARCHAR(50),
  entity_id   UUID,
  read_by     UUID[],
  dismissed_by UUID[],
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  -- PV-FIX: escalamento automático de alertas não lidos
  escalated_at TIMESTAMPTZ,
  escalated_to UUID
);

-- PV-FIX: índice para buscar alertas não lidos por usuário
CREATE INDEX idx_alert_unread ON orch_admin_alert(tenant_id, severity)
  WHERE read_by = '{}' AND dismissed_by = '{}';

CREATE INDEX idx_alert_tenant ON orch_admin_alert(tenant_id, category);

-- 4.23 REMOVIDO (PV Audit: orch_zodiac_profile eliminado — dados cobertos por Bourdieu + Gardner)
```

**TOTAL: 26 tabelas novas** + 11 do Leo reutilizadas = **37 tabelas no ecossistema ORCH**.
(+1 orch_interaction_log da Seção 24 = **38 tabelas total**)

---

## 5. TODOS OS ENDPOINTS (62 endpoints)

### 5.1 Hub Router — AVA (5)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 1 | POST | `/orch-ava/chat` | Mensagem → Hub → agente → SSE streaming |
| 2 | GET | `/orch-ava/conversations` | Lista conversas AI do aluno |
| 3 | GET | `/orch-ava/conversations/:id/messages` | Historico de uma conversa |
| 4 | DELETE | `/orch-ava/conversations/:id` | Deletar conversa |
| 5 | GET | `/orch-ava/profile` | Perfil Bourdieu do aluno logado |

### 5.2 Comenius — Daily Recap (6)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 6 | GET | `/orch-ava/recap/today` | Recap do dia (gera se nao existe) |
| 7 | POST | `/orch-ava/recap/:id/start` | Iniciar recap |
| 8 | POST | `/orch-ava/recap/:id/answer` | Responder questao |
| 9 | POST | `/orch-ava/recap/:id/complete` | Finalizar recap |
| 10 | GET | `/orch-ava/recap/history` | Historico de recaps |
| 11 | GET | `/orch-ava/recap/streak` | Streak atual + best |

### 5.3 Sisifo — Gamificacao (5)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 12 | GET | `/orch-ava/gamification/status` | XP, level, streak, badges, missoes |
| 13 | GET | `/orch-ava/gamification/leaderboard` | Top 10 da turma (opt-in) |
| 14 | GET | `/orch-ava/gamification/badges` | Todos badges + earned |
| 15 | GET | `/orch-ava/gamification/missions` | Missoes ativas |
| 16 | POST | `/orch-ava/gamification/claim-badge` | Claim badge desbloqueado |

### 5.4 Bloom — Mastery Learning + Study Plans (5)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 17 | GET | `/orch-ava/grades/summary` | Resumo de notas |
| 18 | GET | `/orch-ava/grades/simulate` | "Quanto preciso na P2?" |
| 19 | GET | `/orch-ava/study-plan` | Plano de estudo atual |
| 20 | POST | `/orch-ava/study-plan/generate` | Gerar novo plano |
| 21 | GET | `/orch-ava/student-xray/:studentId` | Raio-X (teacher only) |

### 5.5 Aristoteles — Assessment Pipeline (6)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 22 | POST | `/orch-ava/assessment/submit` | Submeter trabalho para analise |
| 23 | GET | `/orch-ava/assessment/:id` | Status/resultado da analise |
| 24 | GET | `/orch-ava/assessment/:id/report` | Relatorio completo (teacher) |
| 25 | POST | `/orch-ava/assessment/:id/review` | Teacher override + notes |
| 26 | GET | `/orch-ava/assessment/student/:studentId` | Historico do aluno (teacher) |
| 27 | GET | `/orch-ava/assessment/class/:classId` | Overview da turma (teacher) |

### 5.6 Foucault — Risk (3)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 28 | GET | `/orch-ava/risk/class/:classId` | Mapa de risco da turma |
| 29 | GET | `/orch-ava/risk/student/:studentId` | Assessment detalhado |
| 30 | POST | `/orch-ava/risk/assess` | Trigger assessment manual |

### 5.7 Weber — Documents + D7 (5)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 31 | GET | `/orch-ava/d7/:studentId` | Dossier D7 consolidado |
| 32 | GET | `/orch-ava/d7/:studentId/weekly` | Report semanal |
| 33 | POST | `/orch-ava/d7/generate` | Gerar D7 on-demand |
| 34 | GET | `/orch-ava/d7/class/:classId` | D7 da turma inteira |
| 35 | GET | `/orch-ava/d7/:studentId/download` | Download PDF |

### 5.8 Heimdall — Admission + Onboarding (7)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 36 | POST | `/orch-ava/admission/chat` | Chat pre-matricula (sem auth) |
| 37 | GET | `/orch-ava/admission/leads` | Lista leads (staff) |
| 38 | GET | `/orch-ava/admission/leads/:id` | Detalhe lead |
| 39 | PATCH | `/orch-ava/admission/leads/:id` | Atualizar stage/score |
| 40 | GET | `/orch-ava/onboarding/status` | Progresso onboarding (student) |
| 41 | POST | `/orch-ava/onboarding/checkin` | Heimdall check-in proativo |
| 42 | GET | `/orch-ava/onboarding/class/:classId` | Overview onboarding turma (teacher) |

### 5.9 Dewey — Case Studies (6)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 43 | POST | `/orch-ava/cases/generate` | Gerar caso a partir de aula |
| 44 | GET | `/orch-ava/cases` | Listar casos disponiveis |
| 45 | GET | `/orch-ava/cases/:id` | Detalhe do caso |
| 46 | POST | `/orch-ava/cases/:id/discuss` | Submeter resposta + receber feedback AI |
| 47 | GET | `/orch-ava/cases/:id/discussions` | Todas as respostas da turma |
| 48 | POST | `/orch-ava/cases/:id/rate` | Avaliar caso (CBR flywheel) |

### 5.10 ORCH Admin (12)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 49 | POST | `/orch-admin/chat` | Chat com page-guide (SSE) |
| 50 | GET | `/orch-admin/conversations` | Conversas admin |
| 51 | GET | `/orch-admin/context/:route` | Contexto da pagina |
| 52 | GET | `/orch-admin/suggestions/:route` | Sugestoes proativas |
| 53 | POST | `/orch-admin/walkthrough/:id/start` | Iniciar walkthrough |
| 54 | POST | `/orch-admin/walkthrough/:id/complete` | Completar walkthrough |
| 55 | GET | `/orch-admin/walkthroughs` | Listar walkthroughs |
| 56 | GET | `/orch-admin/alerts` | Alertas proativos |
| 57 | POST | `/orch-admin/alerts/:id/read` | Marcar alerta lido |
| 58 | POST | `/orch-admin/alerts/:id/dismiss` | Dispensar alerta |
| 59 | POST | `/orch-admin/dom/fill` | Preencher campo |
| 60 | POST | `/orch-admin/dom/scan` | Scan da pagina |

### 5.11 Dashboard Professor — LiveLab (6 — existiam, repetindo)

| # | Metodo | Path | Funcao |
|---|--------|------|--------|
| 61 | GET | `/orch-ava/dashboard/class/:classId` | Overview turma |
| 62 | GET | `/orch-ava/dashboard/class/:classId/live` | Online/confuso AGORA |
| 63 | GET | `/orch-ava/dashboard/class/:classId/mastery` | Mastery por skill |
| 64 | GET | `/orch-ava/dashboard/class/:classId/risk-map` | Mapa de risco |
| 65 | GET | `/orch-ava/dashboard/class/:classId/predictions` | APLSE preditivo |
| 66 | GET | `/orch-ava/dashboard/student/:studentId` | Deep dive aluno |

**TOTAL: 66 endpoints**

---

## 6. PIPELINES DETALHADOS

### 6.1 POST /orch-ava/chat — Pipeline Completo (Hub Router)

```
REQUEST:
{
  "message": "Nao entendi logaritmos",
  "unitId": "uuid-da-aula",
  "conversationId": "uuid"
}

STEP 1: requireAuth() → student_id, tenant_id
STEP 2: loadOrCreateProfile(student_id)
        → SELECT * FROM orch_student_profile WHERE student_id = $1
        → Se nao existe, INSERT com defaults
STEP 3: loadOrCreateConversation(student_id, conversationId)
        → Se conversationId: load ai_conversation + ultimas 20 msgs
        → Se null: INSERT nova ai_conversation
STEP 4: detectIntent(message, history)
        → GoogleGeminiService.structuredOutput({
            model: 'gemini-2.5-flash-lite',
            prompt: `Classifique a intencao: ${message}`,
            schema: { intent: string, confidence: number }
          })
        → { intent: 'content_doubt', confidence: 0.92 }
        → PV-FIX: Se confidence < 0.6:
          - reformulation_count++ (armazenado na conversation)
          - Se reformulation_count >= 3 → resposta generica:
            "Nao consegui entender sua duvida. Tente descrever com mais detalhes
             ou me diga sobre qual aula/materia voce precisa de ajuda."
          - Log para review: INSERT orch_interaction_log (type='unresolved_intent')
          - NUNCA loop infinito de reformulacao
STEP 5: DIRECT_INTENTS check
        → Se intent in ['greeting', 'small_talk', 'gratitude', 'farewell', 'identity']
        → Hub responde direto (nao roteia)
STEP 6: routeToAgent('socrates', ...)
        → SOCRATES pipeline:
          a. ComponentRAGService.search(message, unitId) → top-5 chunks
          b. buildSocraticPrompt(message, chunks, profile, history)
             - Inclui: arquetipo, cognitive_profile, linguistic_profile
             - Regra: NUNCA dar resposta direta
             - Graduated hints: verifica hint_count para este conceito
          c. GoogleGeminiService.chat(prompt) → resposta (streaming)
          d. Se hint_count >= 3: HPO critic check
             - Critico 1: "ajude mais, ele esta travado"
             - Critico 2: "deixe lutar, esta quase la"
             - Moderador escolhe
          e. EDF loop:
             - Evidence: o que a resposta do aluno revela?
             - Decision: qual intervencao?
             - Feedback: gerar resposta final
STEP 7: applyArchetype(response, profile.communication_archetype)
        → Adapta tom, vocabulario, emoji use baseado no arquetipo
STEP 8: saveMessages(conversation)
        → INSERT ai_conversation_message (role='user', content=message)
        → INSERT ai_conversation_message (role='assistant', content=response)
STEP 9: backgroundUpdates()
        → PV-FIX: Promise.allSettled() — cada update INDEPENDENTE
        → Se um falha, os outros 5 continuam. NUNCA bloqueia response.
        → Falha → log + retry 1x → se falha de novo → dead-letter queue
        →
        → Gardner: analisa interacao → UPDATE cognitive_profile
        → Wittgenstein: analisa texto → UPDATE linguistic_profile
        → Taylor: registra experience_event (ai_interaction)
        → Sisifo: +5 XP (INSERT orch_xp_transaction)
        → SafeGuard: safety scan (se flag → INSERT orch_safety_flag)
        → Audit: INSERT orch_profile_audit para cada campo alterado
        →
        → PV-FIX: Registro conceito automatico:
        → Se unit_id + topic NAO existe em orch_concept_memory:
        →   INSERT conceito com EF=2.5, interval=1, repetitions=0
        →   Trigger AUTOMATICO, nao depende de decisao do Socrates
STEP 10: logFinOps(tokens_used)
         → INSERT experience_events (type='ai_usage')

RESPONSE (SSE streaming):
event: status
data: {"phase": "searching", "message": "Buscando contexto sobre logaritmos..."}

event: status
data: {"phase": "thinking", "message": "Analisando sua duvida..."}

event: delta
data: {"content": "Hmm, logaritmos! "}

event: delta
data: {"content": "Voce sabe o que significa 2³ = 8?"}

event: done
data: {
  "messageId": "uuid",
  "conversationId": "uuid",
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

### 6.2 POST /orch-ava/recap/:id/answer — SM-2 Algorithm

```
REQUEST:
{ "questionId": "uuid-q1", "answer": "8", "timeSpentSec": 12 }

PIPELINE:
1. Verificar resposta vs correct_answer
2. Calcular quality (SM-2):
   - Correto + rapido (<15s): quality = 5
   - Correto + normal: quality = 4
   - Correto + lento (>60s): quality = 3
   - Errado + tentou: quality = 1
   - Errado + chutou (<5s): quality = 0
3. SM-2 update:
   if quality >= 3:
     if repetitions == 0: interval = 1
     elif repetitions == 1: interval = 6
     else: interval = round(interval * EF)
     repetitions += 1
   else:
     repetitions = 0
     interval = 1
   EF = max(1.3, EF + (0.1 - (5-quality) * (0.08 + (5-quality) * 0.02)))
4. TASA adjustment: retention = e^(-days_since_last / (EF * 10))
5. next_review = now + interval days
6. UPDATE orch_concept_memory
7. XP: +5 acerto, +2 tentou
8. INSERT orch_xp_transaction

RESPONSE:
{
  "correct": true,
  "xpEarned": 5,
  "explanation": "Exato! log₂(8) = 3 porque 2³ = 8",
  "nextReview": "2026-03-20",
  "retention": 0.85,
  "easinessFactor": 2.6
}
```

### 6.3 POST /orch-ava/assessment/submit — Aristoteles Pipeline

```
REQUEST:
{ "assignmentId": "uuid", "text": "...trabalho do aluno..." }

PIPELINE (7 stages, assíncrono):
INSERT orch_assessment (status='processing')
Publish RabbitMQ: domain.events → assessment.submitted

STAGE 1: Pre-processing
  - Limpar texto (HTML, encoding)
  - Word count, paragraph count
  - status → 'stage_1'

STAGE 2: Quality Assessment (5 dimensoes)
  - GoogleGeminiService.structuredOutput({
      prompt: "Avalie este trabalho em 5 dimensoes...",
      schema: { relevance, depth, coherence, originality, argumentation }
    })
  - quality_score = media ponderada
  - status → 'stage_2'

STAGE 3: Plagiarism Detection
  - Winnowing algorithm (fingerprinting)
  - Cosine similarity vs outros trabalhos da turma
  - EmbeddingService.embed(text) → busca em orch_assessment WHERE class_id
  - plagiarism_matches = [{ source, similarity, snippet }]
  - status → 'stage_3'

STAGE 4: AI Detection (3 tiers)
  - Tier 1: perplexity analysis (Binoculars-style)
  - Tier 2: stylometric comparison vs orch_stylometric_baseline
  - Tier 3: ensemble (Gemini + perplexity + stylometric)
  - ai_detection_tier = 'human' | 'mixed' | 'ai_suspected'
  - NUNCA acusa automaticamente
  - status → 'stage_4'

STAGE 5: Stylometric Profile
  - avg_sentence_length, vocabulary_diversity, formality
  - readability_score, passive_voice_ratio
  - Compare vs baseline → stylometric_consistent = true/false
  - Se < 3 samples no baseline: UPDATE orch_stylometric_baseline

STAGE 6: Composite Score
  - composite = quality * 0.6 + (1 - plagiarism) * 0.2 + consistency * 0.2
  - confidence = f(samples_count, text_length, method_agreement)

STAGE 7: Result Distribution
  - status → 'completed'
  - Aluno: ve quality_score + feedback textual
  - Professor: ve TUDO (plagiarism, AI detection, stylometric)
  - Publish: domain.events → assessment.completed

RESPONSE (imediato):
{ "assessmentId": "uuid", "status": "processing", "estimatedMinutes": 2 }

RESPONSE (via Socket.IO quando pronto):
event: assessment.completed
data: { "assessmentId": "uuid", "compositeScore": 7.8, "status": "completed" }
```

### 6.4 POST /orch-admin/chat — Admin Pipeline

```
REQUEST:
{
  "message": "como importo alunos?",
  "route": "/students",
  "domSnapshot": {
    "url": "/students",
    "forms": [],
    "buttons": ["#btn-new-student", "#btn-import"],
    "fields": [],
    "visibleText": "Lista de Alunos | 234 registros"
  }
}

PIPELINE:
1. requireAuth() → user_id (role check: staff/coordinator/teacher)
2. loadOrCreateAdminConversation(user_id)
3. RAG search:
   → EmbeddingService.embed("como importo alunos")
   → SELECT chunk_text FROM orch_admin_embedding
     WHERE route_context = '/students'
     ORDER BY embedding <=> $embedding
     LIMIT 5
4. Build context:
   - route info (domain, capabilities)
   - RAG chunks
   - DOM snapshot
   - ultimas 10 msgs da conversation
   - user role + permissions
5. GoogleGeminiService.chat({
     systemPrompt: adminPageGuidePrompt,
     context: compiledContext,
     message: message
   })
6. Intent match:
   - Se intent = 'create_student' → match walkthrough 'create-student'
   - Se intent = 'import_students' → match walkthrough 'bulk-import'
   - Incluir CTA walkthrough na resposta
7. Save messages:
   - INSERT orch_admin_message (role='user', route_context='/students', dom_snapshot)
   - INSERT orch_admin_message (role='assistant', content=response)
8. FAQ learning:
   - Se pergunta similar feita 3+ vezes → INSERT em faq_learned

RESPONSE (SSE):
event: delta
data: {"content": "Para importar alunos em lote:\n\n"}

event: delta
data: {"content": "1. Clique em **Importar** (botão superior direito)\n"}

event: delta
data: {"content": "2. Baixe o template .xlsx\n3. Preencha e faça upload\n"}

event: done
data: {
  "messageId": "uuid",
  "actionChips": [
    {"label": "Me guie passo a passo", "action": "walkthrough", "id": "bulk-import"},
    {"label": "Baixar template", "action": "link", "url": "/api/students/import-template"},
    {"label": "Cadastrar um só", "action": "message", "value": "como cadastro um aluno?"}
  ]
}
```

### 6.5 DOM Bridge — Implementacao Tecnica

```typescript
// ============================================
// dom-bridge.ts — roda no mesmo window que a app React
// ============================================

// Nao precisa de postMessage — CommunicationHub esta no mesmo contexto

interface DOMField {
  selector: string;
  label: string;
  type: string;
  value: string;
  required: boolean;
}

interface DOMSnapshot {
  route: string;
  title: string | null;
  fields: DOMField[];
  buttons: { selector: string; text: string }[];
}

const SENSITIVE_PATTERNS = /password|senha|cpf|cnpj|card|cartao|cvv|token|secret/i;

export function scanPage(): DOMSnapshot {
  const route = window.location.pathname;
  const title = document.querySelector('h1, h2, [data-page-title]')?.textContent?.trim() || null;

  const fields: DOMField[] = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input:not([type=hidden]), select, textarea'
    )
  )
  .filter(el => el.offsetParent !== null) // visivel
  .map(el => ({
    selector: buildUniqueSelector(el),
    label: findLabel(el),
    type: el.type || el.tagName.toLowerCase(),
    value: el.value,
    required: el.required,
  }));

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
    .filter(btn => btn.offsetParent !== null && btn.textContent?.trim())
    .map(btn => ({
      selector: buildUniqueSelector(btn),
      text: btn.textContent!.trim(),
    }));

  return { route, title, fields, buttons };
}

export function fillField(selector: string, value: string): { success: boolean; reason?: string } {
  const el = document.querySelector<HTMLInputElement>(selector);
  if (!el) return { success: false, reason: 'element_not_found' };

  // Check campo sensivel
  const fieldContext = `${el.name} ${el.id} ${el.placeholder} ${findLabel(el)}`;
  if (SENSITIVE_PATTERNS.test(fieldContext)) {
    return { success: false, reason: 'sensitive_field_blocked' };
  }

  // Native setter trick — funciona com React 15-19
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

  if (!setter) return { success: false, reason: 'setter_not_found' };

  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return { success: true };
}

function findLabel(el: Element): string {
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  const parent = el.closest('label');
  if (parent?.textContent) return parent.textContent.trim();
  return el.getAttribute('aria-label')
    || el.getAttribute('placeholder')
    || el.getAttribute('name')
    || '';
}

function buildUniqueSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`;
  if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
  // Fallback: nth-of-type
  const parent = el.parentElement;
  if (!parent) return el.tagName.toLowerCase();
  const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
  const index = siblings.indexOf(el) + 1;
  return `${buildUniqueSelector(parent)} > ${el.tagName.toLowerCase()}:nth-of-type(${index})`;
}
```

### 6.6 Stuck Detection

```typescript
// stuck-detector.ts — ativa quando tab ORCH esta aberta

let stuckTimer: ReturnType<typeof setTimeout> | null = null;
const STUCK_THRESHOLD_MS = 30_000; // 30 segundos

export function initStuckDetection(onStuck: (context: DOMSnapshot) => void) {
  const reset = () => {
    if (stuckTimer) clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => {
      const snapshot = scanPage();
      const emptyRequired = snapshot.fields.filter(f => f.required && !f.value);
      if (emptyRequired.length > 0) {
        onStuck(snapshot);
      }
    }, STUCK_THRESHOLD_MS);
  };

  document.addEventListener('click', reset);
  document.addEventListener('keydown', reset);
  document.addEventListener('scroll', reset);
  reset(); // inicia timer

  // Cleanup
  return () => {
    if (stuckTimer) clearTimeout(stuckTimer);
    document.removeEventListener('click', reset);
    document.removeEventListener('keydown', reset);
    document.removeEventListener('scroll', reset);
  };
}
```

---

## 7. FRONTEND — TODOS OS COMPONENTES

### 7.1 AVA Player (upgrade AIChatTab)

```
AIChatTab (Leo - UPGRADE)
├── ChatHeader
│   ├── AgentAvatar (muda sutilmente por agente, aluno nao ve nome)
│   ├── StatusIndicator (online / typing / thinking)
│   └── StreakBadge (fire + dias)
├── MessageList
│   ├── UserMessage (bolha direita)
│   ├── AssistantMessage (bolha esquerda)
│   │   ├── StreamingText (cursor animado)
│   │   ├── HintBlock (expandable, nivel 1-5)
│   │   ├── QuizInline (questao no chat)
│   │   ├── ProgressBar (mastery)
│   │   ├── CodeBlock (syntax highlight)
│   │   └── ExpandableSection
│   └── StatusHint ("Buscando contexto...", "Analisando...")
├── ActionChips (2-3 sugestoes)
├── InputBox
│   ├── TextInput (auto-resize)
│   ├── SendButton
│   └── VoiceButton (futuro)
└── XPToast (popup "+5 XP")
```

### 7.2 Daily Recap

```
DailyRecapWidget
├── RecapCard (dashboard do aluno)
│   ├── StreakFire (animacao)
│   ├── "3 perguntas rapidas" CTA
│   └── EstimatedTime "~2 min"
├── RecapScreen
│   ├── ProgressDots (1/5, 2/5...)
│   ├── QuestionCard
│   │   ├── QuestionText
│   │   ├── OptionsGrid (A/B/C/D) ou FillBlank
│   │   └── Timer (opcional)
│   ├── FeedbackCard
│   │   ├── CorrectAnimation (confetti)
│   │   ├── WrongAnimation (gentle shake)
│   │   ├── Explanation
│   │   └── NextReview "Voce vera isso em 5 dias"
│   └── CompletionScreen
│       ├── Score "4/5"
│       ├── XPEarned "+25 XP"
│       ├── StreakUpdated "4 dias seguidos!"
│       └── ActionChips ["Ver aula", "Tutor AI", "Mais"]
```

### 7.3 Gamificacao (Sisifo)

```
GamificationWidget
├── StatusBar (sempre visivel no AVA header)
│   ├── XPBadge (circular, level number)
│   ├── StreakFire
│   └── ProgressToNextLevel (mini bar)
├── GamificationPanel (expandido)
│   ├── ProfileCard
│   │   ├── Avatar + Level + Title ("Scholar")
│   │   ├── XP total + progress bar
│   │   └── Streak days + best streak
│   ├── BadgesGrid
│   │   └── BadgeCard (icon + nome + earned/locked)
│   ├── MissionsPanel
│   │   └── MissionCard (titulo + progress + reward)
│   └── LeaderboardPreview (opt-in, top 5)
```

### 7.4 CommunicationHub — Tab ORCH

```
CommunicationHub (Leo - ADD TAB)
├── Dock
│   ├── [Chat] badge(unread count)
│   ├── [ORCH] badge(nenhum — sempre disponivel)
│   └── [Alertas] badge(count)
├── OrchPanel (NEW)
│   ├── OrchHeader
│   │   ├── OrchLogo (icone ORCH)
│   │   ├── "Como posso ajudar?"
│   │   └── PageContext "Pagina: Alunos"
│   ├── SuggestedQuestions (3, baseadas na rota)
│   ├── OrchMessageList
│   │   ├── UserMessage
│   │   ├── AssistantMessage
│   │   │   ├── StreamingText
│   │   │   ├── WalkthroughCTA
│   │   │   ├── DomFillPreview
│   │   │   └── AlertInline
│   │   └── TypingIndicator
│   ├── ActionChips
│   └── OrchInputBox
├── AlertsPanel (NEW)
│   ├── AlertCard
│   │   ├── SeverityIcon (info/warning/critical)
│   │   ├── Title + Description
│   │   ├── ActionButton (deep link)
│   │   └── DismissButton
│   └── EmptyState "Tudo tranquilo!"
```

### 7.5 Dashboard Professor (LiveLab)

```
TeacherDashboard (NEW page: /dashboard/teacher)
├── ClassSelector (dropdown)
├── OverviewGrid (4 KPI cards)
│   ├── EngagementCard (score + trend arrow)
│   ├── MasteryCard (% + skill fraco)
│   ├── RiskCard (distribuicao colorida)
│   └── PredictionCard (nota prevista + pass rate)
├── LiveSection "Agora"
│   ├── OnlineStudents (avatares)
│   ├── ConfusedNow (nome + indicador + topico)
│   └── RecentAIFeed (real-time)
├── TopStruggleTopics (bar chart)
├── StudentTable (sortable)
│   ├── Columns: Nome | Engagement | Mastery | Risk | Last Active
│   └── Click → StudentDetailPanel
├── StudentDetailPanel (side sheet)
│   ├── ProfileSummary
│   ├── EngagementChart (line, 30d)
│   ├── SkillsRadar (chart)
│   ├── RiskDimensions (8 bars)
│   ├── ForgettingCurves (decay graph)
│   ├── AIConversations (recent)
│   └── D7Report (download PDF)
└── AlertsFeed (side rail, fixed)
```

---

## 8. CRON JOBS

| Schedule | Agente | Acao | SQL |
|----------|--------|------|-----|
| Daily 06:00 | Ebbinghaus | Selecionar conceitos para revisao | `SELECT FROM orch_concept_memory WHERE next_review <= NOW()` |
| Daily 06:05 | Comenius | Gerar daily recaps pendentes | `INSERT orch_daily_recap` — PV-FIX: batch 50 alunos, skip se batch anterior nao terminou, fallback pool generico se Gemini falha |
| Daily 14:00 | Taylor | Snapshot engagement | `INSERT orch_engagement_snapshot` aggregando experience_events |
| Daily 14:05 | Foucault | Risk assessment batch | `INSERT orch_risk_assessment` com 8 dimensoes calculadas |
| Daily 23:59 | Sisifo | Streak check | `UPDATE orch_gamification SET streak_days = 0 WHERE streak_last < TODAY` |
| Weekly Sun 04:00 | Weber | D7 semanal | `INSERT orch_d7_report` consolidando todos agentes |
| Weekly Mon 08:00 | Admin | Alertas proativos | `INSERT orch_admin_alert` baseado em regras |
| Monthly 1st | Weber | D7 mensal | `INSERT orch_d7_report (report_type='monthly')` |
| Daily (background) | SafeGuard | Safety scan | Roda em cada msg, nao eh cron |
| Daily (background) | Gardner | Cognitive observation | Roda em cada interacao |
| Daily (background) | Wittgenstein | Linguistic analysis | Roda em cada texto longo |
| Daily 05:00 | **Health Check** | PV-FIX: Verificar saude dos agentes | Cada agente rodou nas ultimas 24h? Se nao → alerta |
| Hourly | **Circuit Breaker** | PV-FIX: Reset circuit breaker se Gemini respondendo | Check Gemini health → se OK e circuito aberto → fechar |

---

## 9. INOVACOES DO RESEARCH APLICADAS

| # | Inovacao | Fonte | Onde aplicamos | Impacto |
|---|----------|-------|---------------|---------|
| 1 | Versioned learner state + single-writer | IntelliCode (arXiv:2512.18669) | `orch_student_profile` version + `orch_profile_audit` | Cada agente so escreve no seu campo, com audit trail |
| 2 | Adversarial pedagogical critics | HPO (arXiv:2512.22496) | Socrates hint_level >= 3: 2 criticos + moderador | 8B model beats GPT-4o em pedagogia |
| 3 | Forgetting curve pos-decaimento | TASA (arXiv:2511.15163) | Ebbinghaus: dificuldade = retention ATUAL R(t) | Questoes na dificuldade exata do estado real |
| 4 | Evidence-Decision-Feedback loop | Copa/EDF (arXiv:2602.01415) | Socrates: cada resposta → E→D→F | Framework de intervencao pedagogica |
| 5 | Felder-Silverman learning styles | PACE (arXiv:2502.12633) | Bourdieu cognitive_profile: 4 dimensoes | Adapta FORMA da tutoria ao perfil |
| 6 | LiveLab real-time dashboard | Carnegie Learning MATHia | Dashboard professor: confuso AGORA | 18k alunos: "nearly doubled growth" |
| 7 | APLSE predictive | Carnegie Learning | Dashboard: prediz nota final | Intervencao precoce |
| 8 | Stuck-user detection 30s | CommandBar | Admin: sugestao proativa | Reduz friccao |
| 9 | DOM walkthroughs with steps | WalkMe / Whatfix | Admin: orch_admin_walkthrough + Driver.js | Guia passo a passo visual |
| 10 | Streaming + status hints | Claude/ChatGPT/Pi | SSE com fases ("Buscando...", "Analisando...") | Percepcao de inteligencia |
| 11 | Action chips pos-resposta | ShapeOf.ai | 2-3 chips apos cada resposta | -40-60% friccao |
| 12 | Personalidade 5 traits fixos | Pi (Inflection AI) | Curioso, paciente, direto, bem-humorado, honesto | Consistencia > perfeicao |
| 13 | Tone-matching | Pi | Adapta registro ao do aluno | Sem robotico |
| 14 | First message = convite | Pi | "Bom dia! Tem 3 perguntinhas" nao lista features | 75 min/dia (Character.AI) vs 7 min |
| 15 | Sugestoes proativas no player | CommandBar + Duolingo | Pausa >30s, volta 3x, fim video | Engajamento passivo |
| 16 | assistant-ui (React chat lib) | YC-backed (6.9k stars) | Frontend chat UI | Streaming, rich messages, composable |

---

## 10. DIA NA VIDA — FLUXOS COMPLETOS

### 10.1 Dia do Aluno

```
06:00  CRON Ebbinghaus → seleciona conceitos (retention < 0.4)
06:05  CRON Comenius → gera orch_daily_recap com 5 questoes

08:00  ALUNO ABRE AVA
       → Taylor: registra login (experience_event)
       → Sisifo: +5 XP login, streak check (UPDATE orch_gamification)
       → Hub: "Bom dia! Dia 4 de streak. 3 perguntinhas esperando."
       → Chips: [Fazer revisao] [Ir pra aula] [Ver notas]

08:02  CLICA "Fazer revisao"
       → GET /orch-ava/recap/today → 5 questoes
       → Responde cada: POST /orch-ava/recap/:id/answer → SM-2 update
       → Completa: POST /orch-ava/recap/:id/complete
       → +25 XP, streak = 4, toast "4 dias!"

08:05  ASSISTE VIDEO (Player)
       → Taylor: registra watch event
       → Pausa >30s no 5:23 → sugestao no AIChatTab:
         "Algo confuso? Estamos em derivadas nesse trecho."
       → Chips: [Explica derivadas] [Estou bem] [Pular]

08:08  PERGUNTA "nao entendi derivada"
       → POST /orch-ava/chat → Hub → intent: content_doubt → Socrates
       → Socrates: RAG + Socratico (NUNCA responde direto)
       → "Voce sabe o que significa taxa de variacao?"
       → Chips: [Acho que sim] [Nao sei] [Mostra grafico]

08:12  DIALOGO SOCRATICO (3-4 turnos)
       → Gardner (bg): aluno responde melhor com visual → UPDATE cognitive_profile
       → Wittgenstein (bg): registro informal, CEFR B1 → UPDATE linguistic_profile
       → Audit: INSERT orch_profile_audit (agent='gardner', field='cognitive_profile')

08:15  "aah entendi!"
       → Socrates: "Quer testar com exercicio?"
       → Quiz inline no chat → acerta → +10 XP
       → Ebbinghaus: conceito "derivada" registrado, next_review = 7d

14:00  CRON Taylor → engagement snapshot (score: 72, trend: rising)
14:05  CRON Foucault → risk assessment (green, score: 12)

22:00  VOLTA A NOITE
       → Hub: "Boa noite! Revisou derivadas hoje. Quer aprofundar?"
       → Taylor: sessao vespertina
```

### 10.2 Dia do Coordenador (Admin)

```
08:00  ABRE ADMIN
       → CommunicationHub: badge "3" nos Alertas
       → 3 alertas:
         ⚠️ "Maria: frequencia 58% (3 faltas seguidas)" [Ver aluna]
         ⚠️ "Turma B: media caiu 1.2pts vs semana passada" [Ver turma]
         ℹ️ "5 matriculas pendentes" [Aprovar]

08:02  NAVEGA PARA /students
       → ORCH: "Pagina: Alunos. Posso ajudar a cadastrar, importar ou filtrar."
       → Sugestoes: [Como cadastro?] [Importar planilha] [Filtrar turma]

08:03  "como importo alunos?"
       → POST /orch-admin/chat → RAG (route=/students) → resposta
       → Chip: [Me guie passo a passo] → walkthrough trigger

08:04  WALKTHROUGH ATIVO (Driver.js)
       → Step 1: highlight #btn-import → "Clique em Importar"
       → Step 2: highlight #file-input → "Selecione .xlsx"
       → Step 3: highlight #btn-map → "Mapeie colunas"
       → Step 4: highlight #btn-confirm → "Confirme"
       → Completa → INSERT orch_admin_walkthrough_usage

08:10  /students/new (formulario)
       → 30s sem acao → STUCK DETECTION
       → ORCH: "Precisa de ajuda com algum campo?"
       → SmartTip no campo RA: "Numero unico do aluno. Se nao tem, deixe em branco."

08:12  "preenche: Joao Silva, email joao@email.com, turma A"
       → Gemini structured output: [{ "label": "Nome", "value": "Joao Silva" }, ...]
       → fillField("#input-name", "Joao Silva") → OK
       → fillField("#input-email", "joao@email.com") → OK
       → "Turma A" → SELECT dropdown
       → Resposta: "Preenchi Nome, Email e Turma. CPF e campo sensivel — digite voce."

09:00  DASHBOARD PROFESSOR (/dashboard/teacher)
       → GET /orch-ava/dashboard/class/:classId
       → Overview: 35 alunos, 12 online, engagement 72%
       → Confusos AGORA: Pedro (3 replays derivadas), Ana (5 perguntas em 10min)
       → Risk: 2 vermelho, 3 laranja, 8 amarelo, 22 verde
       → Prediction: media 6.8, aprovacao 82%

09:05  CLICK ALUNO VERMELHO
       → GET /orch-ava/dashboard/student/:id
       → Engagement: 35 (critical, declining)
       → Risk: attendance 90, financial 70, engagement 80
       → Ultimo login: 5 dias
       → D7: "Nao acessa ha 5d, 4 atividades pendentes"
       → Recomendacao: "OUTREACH — contato urgente"
       → Chips: [Enviar mensagem] [Agendar reuniao] [Historico]
```

---

## 11. XP TABLE (Sisifo)

| Acao | XP | Fonte |
|------|-----|-------|
| Login diario | 5 | taylor |
| Completar video | 10 | taylor |
| Responder recap (por questao) | 5 | comenius |
| Recap perfeito (5/5) | +10 bonus | comenius |
| Interagir com tutor AI | 5 | socrates |
| Entregar atividade | 15 | freire |
| Nota >= 8 | +10 bonus | freire |
| Participar forum | 5 | taylor |
| Completar case study | 20 | dewey |
| Streak 3 dias | +15 | sisifo |
| Streak 7 dias | +30 | sisifo |
| Streak 30 dias | +100 | sisifo |
| Badge desbloqueado | +25 | sisifo |

**Levels:**
| Level | XP | Titulo |
|-------|-----|--------|
| 1 | 0 | Novato |
| 2 | 100 | Aprendiz |
| 3 | 300 | Estudante |
| 4 | 600 | Dedicado |
| 5 | 1000 | Scholar |
| 6 | 1500 | Expert |
| 7 | 2100 | Mestre |
| 8 | 2800 | Guru |
| 9 | 3600 | Lenda |
| 10 | 4500 | ORCH Master |
| 11 | 5500 | Iluminado |
| 12 | 7000 | Transcendente |

**Anti-patterns (NUNCA fazer):**
- Remover XP
- Ranking publico humilhante
- Escassez artificial
- Dark patterns
- Bonus por velocidade (incentiva chutar)
- Pagar para progredir

---

## 12. BADGES

| ID | Nome | Condicao |
|----|------|----------|
| first_login | Primeiro Passo | Primeiro login no AVA |
| first_recap | Memoria Ativa | Completar primeiro daily recap |
| first_ai_chat | Conversador | Primeira interacao com tutor AI |
| perfect_recap | Perfeicionista | 5/5 em um recap |
| streak_3 | Constante | Streak de 3 dias |
| streak_7 | Habito | Streak de 7 dias |
| streak_30 | Disciplinado | Streak de 30 dias |
| night_owl | Coruja | Estudar apos 22h |
| early_bird | Madrugador | Estudar antes das 7h |
| social | Social | Participar de 10 discussoes |
| deep_diver | Mergulhador | 5+ turnos em uma sessao AI |
| mastery_first | Dominou! | Primeiro conceito com retention > 0.9 |
| all_videos | Maratonista | Assistir todos videos de uma disciplina |
| case_solver | Investigador | Completar 5 case studies |
| helper | Solidario | Ajudar colega no forum |

---

## 13. 14 YAMLS DO ADMIN KNOWLEDGE BASE

| # | Arquivo | Dominio | Rotas |
|---|---------|---------|-------|
| 1 | `cogedu-classes.yaml` | academic | /classes, /classes/:id |
| 2 | `cogedu-students.yaml` | academic | /students, /students/:id |
| 3 | `cogedu-teachers.yaml` | hr | /teachers, /teachers/:id |
| 4 | `cogedu-enrollments.yaml` | academic | /enrollments |
| 5 | `cogedu-grades.yaml` | academic | /grades, /gradebook |
| 6 | `cogedu-attendance.yaml` | academic | /attendance |
| 7 | `cogedu-calendar.yaml` | academic | /calendar |
| 8 | `cogedu-courses.yaml` | academic | /courses, /curriculum |
| 9 | `cogedu-financial.yaml` | financial | /financial, /billing |
| 10 | `cogedu-reports.yaml` | analytics | /reports |
| 11 | `cogedu-settings.yaml` | system | /settings |
| 12 | `cogedu-users.yaml` | hr | /users, /roles |
| 13 | `cogedu-certificates.yaml` | academic | /certificates |
| 14 | `cogedu-content.yaml` | content | /content, /units |

Cada YAML contem:
- Descricao da pagina/modulo
- Campos dos formularios (nome, tipo, validacao)
- Workflows (passo a passo de cada operacao)
- FAQ (perguntas frequentes sobre o modulo)
- Regras de negocio

Processo de ingestao:
1. `TextChunkingService.chunk(yamlContent, 1000, 200)` → chunks
2. `EmbeddingService.embed(chunk)` → vector 1536d
3. `INSERT orch_admin_embedding (source_file, chunk_index, chunk_text, route_context, domain, embedding)`

---

## 14. 25 WALKTHROUGHS

| # | ID | Titulo | Rota | Steps |
|---|-----|--------|------|-------|
| 1 | create-student | Cadastrar Aluno | /students/new | 6 |
| 2 | bulk-import | Importar Alunos | /students | 4 |
| 3 | create-class | Criar Turma | /classes/new | 8 |
| 4 | enroll-student | Matricular Aluno | /enrollments | 5 |
| 5 | create-course | Criar Curso | /courses/new | 7 |
| 6 | create-unit | Criar Unidade/Aula | /units/new | 6 |
| 7 | upload-video | Upload Video | /content/upload | 4 |
| 8 | grade-assignment | Lancar Nota | /gradebook | 5 |
| 9 | take-attendance | Lancar Frequencia | /attendance | 4 |
| 10 | create-assessment | Criar Avaliacao | /assessments/new | 6 |
| 11 | view-reports | Ver Relatorios | /reports | 3 |
| 12 | manage-permissions | Gerenciar Permissoes | /settings/roles | 5 |
| 13 | create-certificate | Criar Certificado | /certificates/new | 7 |
| 14 | issue-certificate | Emitir Certificado | /certificates | 4 |
| 15 | configure-calendar | Configurar Calendario | /calendar/settings | 5 |
| 16 | setup-grading | Configurar Notas | /settings/grading | 6 |
| 17 | create-teacher | Cadastrar Professor | /teachers/new | 5 |
| 18 | financial-setup | Configurar Financeiro | /settings/financial | 6 |
| 19 | content-analysis | Analisar Conteudo AI | /content/:id | 3 |
| 20 | student-transfer | Transferir Aluno | /students/:id | 4 |
| 21 | bulk-grade | Notas em Lote | /gradebook/bulk | 4 |
| 22 | generate-report | Gerar Relatorio | /reports/generate | 3 |
| 23 | setup-notifications | Configurar Notificacoes | /settings/notifications | 4 |
| 24 | create-event | Criar Evento | /calendar/new | 5 |
| 25 | configure-ai | Configurar AI | /settings/ai | 4 |

---

## 15. PROACTIVE ALERTS (10 tipos)

### Student Alerts (3)
| Tipo | Trigger | Severidade | Exemplo |
|------|---------|-----------|---------|
| `low_attendance` | frequencia < 75% | warning | "Maria: 58% frequencia (3 faltas seguidas)" |
| `grade_drop` | nota caiu > 2pts em 2 semanas | warning | "Joao: nota de 7.5 para 4.2" |
| `missing_assignment` | 2+ atividades nao entregues | info | "Ana: 3 atividades pendentes" |

### Class Alerts (3)
| Tipo | Trigger | Severidade | Exemplo |
|------|---------|-----------|---------|
| `avg_below_threshold` | media turma < 6.0 | warning | "Turma B: media 5.3 em Calculo" |
| `high_absence_rate` | ausencia turma > 30% | critical | "Turma A: 42% ausencia sexta-feira" |
| `approaching_deadline` | deadline em < 3 dias, < 50% entregou | info | "Trabalho Final: 2 dias, 12/35 entregaram" |

### Admission Alerts (3)
| Tipo | Trigger | Severidade | Exemplo |
|------|---------|-----------|---------|
| `pending_enrollment` | matricula pendente > 5 dias | warning | "5 matriculas aguardando aprovacao" |
| `incomplete_docs` | documentos faltando > 7 dias | info | "Pedro: falta RG e comprovante" |
| `expired_lead` | lead sem contato > 14 dias | info | "Lead Maria: sem contato ha 16 dias" |

### System Alerts (1)
| Tipo | Trigger | Severidade | Exemplo |
|------|---------|-----------|---------|
| `quota_warning` | uso AI > 80% da quota mensal | warning | "Uso AI: 82% da quota (restam 4 dias)" |

---

## 16. CUSTOS ESTIMADOS (1000 alunos ativos)

| Componente | Modelo | Calls/dia | Tokens/call | Custo/dia |
|-----------|--------|-----------|-------------|-----------|
| Hub intent detection | flash-lite | 3000 | ~200 | $0.45 |
| Socrates tutor | flash | 2000 | ~800 | $2.40 |
| Comenius recap gen | flash-lite | 1000 | ~300 | $0.23 |
| Aristoteles assessment | flash | 100 | ~2000 | $0.30 |
| Admin page-guide | flash | 500 | ~500 | $0.38 |
| D7 reports | flash | 50/week | ~2000 | $0.07 |
| Embeddings | OAI small | 200 | ~500 | $0.02 |
| Gardner/Wittgenstein bg | flash-lite | 1000 | ~200 | $0.15 |
| **TOTAL** | | | | **~$4.00/dia = ~$120/mes** |

Com company_ai_config: cada empresa define teto.

---

## 17. TECH STACK

| O que | Tech | Status |
|-------|------|--------|
| LLM principal | Gemini 2.5-flash | Leo ja configurou |
| LLM leve (intent) | Gemini 2.5-flash-lite | Leo ja configurou |
| Embeddings | OpenAI text-embedding-3-small | Leo ja configurou |
| Vector DB | pgvector (PostgreSQL 17) | Leo ja instalou |
| Real-time | Socket.IO | Leo ja configurou |
| Events | RabbitMQ | Leo ja configurou |
| Auth | Keycloak | Leo ja configurou |
| Streaming | SSE (Server-Sent Events) | Nativo Express |
| Chat UI | assistant-ui | Novo — npm install |
| Walkthroughs | Driver.js | Novo — 4KB, npm install |
| Charts | Recharts ou Nivo | Novo — npm install |
| Spaced rep | SM-2 algorithm | Puro JS, sem dependencia |
| Plagiarism | Winnowing | Puro JS, sem dependencia |
| Stylometrics | spaCy + NILC-Metrix | Python microservice |
| AI Detection | Binoculars-style | Python microservice |

---

## 18. FASES DE IMPLEMENTACAO — DETALHAMENTO COMPLETO

### FASE 0: CORRECOES + LIMPEZA (1-2 dias)

**Objetivo:** Corrigir vulnerabilidades e limpar dead code ANTES de construir qualquer coisa.

| # | Tarefa | Tipo | Arquivo | Detalhe |
|---|--------|------|---------|---------|
| 0.1 | `requireAuth()` no `adminInterventionAudit` | SEGURANCA | `endpoints/adminInterventionAudit/` | `middlewares = []` → adicionar `requireAuth()` |
| 0.2 | Permissao no `sendClassMessage` | SEGURANCA | `endpoints/sendClassMessage/` | Validar que user pertence a turma antes de enviar |
| 0.3 | Verificar registro `initiateStudentConversation` | BUG | `endpoints/index.ts` | Checar se path esta exportado no router |
| 0.4 | Verificar registro `searchComponentTranscription` | BUG | `endpoints/index.ts` | Checar se path esta exportado no router |
| 0.5 | Deletar `FloatingChat.tsx` | LIMPEZA | `components/FloatingChat.tsx` | Dead code, substituido por CommunicationHub |
| 0.6 | Deletar `AIAssistant.tsx` | LIMPEZA | `components/AIAssistant.tsx` | Mock com respostas hardcoded |
| 0.7 | Deletar `FloatingAIAssistant.tsx` | LIMPEZA | `components/FloatingAIAssistant.tsx` | Mock com respostas hardcoded |
| 0.8 | Remover console.log | LIMPEZA | `components/chat/ClassChat.tsx` | Debug logging em producao |
| 0.9 | Migrar permissoes certificacao | FIX | Seeds/permissions | `edu.component.*` → `edu.certificate.*` |
| 0.10 | Wire-up certificados AVA | WIRE-UP | `CertificatesPage.tsx` | Trocar `MOCK_API_CERTIFICATES` por `GET /certification/my-certificates` |
| 0.11 | Wire-up documentos AVA | WIRE-UP | `DocumentsPage.tsx` | Trocar `MOCK_DOCUMENTS` por `POST /certification/documents/request` |

**Entregavel:** Plataforma segura, limpa, certificados funcionando no AVA.
**Dependencias:** Nenhuma. Pode comecar imediatamente.
**Risco:** Baixo. Sao correcoes cirurgicas.

---

### FASE 1: FUNDACAO MULTI-AGENTE (1-2 semanas)

**Objetivo:** Hub Router + Perfil Bourdieu + Persistencia + Quota = base para todos os agentes.

#### F1.1 — Migration SQL

```
Nova migration: 20260314_orch_foundation.sql
```

| Tabela | Colunas-chave |
|--------|--------------|
| `orch_student_profile` | student_id, communication_archetype (12 tipos), academic/cognitive/linguistic/engagement/gamification/risk_profile (JSONB), forgetting_curves, skills_mastery, sociocultural, version, updated_by |
| `orch_profile_audit` | student_id, agent_id, field_path, old/new_value, reasoning |

#### F1.2 — Hub Router Service

| Arquivo | O que faz |
|---------|-----------|
| `services/orch-hub-router.ts` | Intent detection via Gemini flash-lite, ROUTE_MAP, DIRECT_INTENTS |
| `services/orch-profile-service.ts` | CRUD orch_student_profile, loadOrCreate, updateField (single-writer + audit) |
| `services/orch-archetype-transformer.ts` | Aplica tom/vocabulario baseado no arquetipo do aluno |

#### F1.3 — Endpoints

| # | Metodo | Path | Implementacao |
|---|--------|------|--------------|
| 1 | POST | `/orch-ava/chat` | Hub router → intent → agent → archetype → save → stream |
| 2 | GET | `/orch-ava/conversations` | Lista ai_conversation do student_id |
| 3 | GET | `/orch-ava/conversations/:id/messages` | Lista ai_conversation_message |
| 4 | DELETE | `/orch-ava/conversations/:id` | Soft delete conversa |
| 5 | GET | `/orch-ava/profile` | Retorna orch_student_profile do logado |

#### F1.4 — Persistencia (tabelas JA EXISTEM do Leo)

| Tarefa | Detalhe |
|--------|---------|
| Ativar `ai_conversation` | Apos cada chat, INSERT conversa + mensagens |
| Ativar `company_ai_config` | Chamar `check_company_ai_quota()` antes de cada Gemini call |
| Tratar 429 no frontend | Se quota excedida, mostrar mensagem amigavel |

#### F1.5 — Frontend (upgrade AIChatTab)

| Tarefa | Detalhe |
|--------|---------|
| Carregar historico ao montar | `GET /orch-ava/conversations` → exibir ultimas msgs |
| Enviar via POST /orch-ava/chat | Substituir chamada direta ao `generateTutorResponse` |
| Receber SSE | Streaming token-by-token no chat |

**Entregavel:** Aluno conversa com Hub, Hub roteia para Socrates (unico agente ativo), perfil criado, conversas persistidas, quota ativa.
**Dependencia:** F0 concluida.
**Teste:** Mandar mensagem, verificar intent detection, verificar que conversa foi salva em ai_conversation, verificar que orch_student_profile foi criado.

---

### FASE 2: AGENTES CORE AVA (2-3 semanas)

**Objetivo:** 6 agentes que fazem o aluno QUERER voltar todo dia.

#### F2.1 — Migration SQL

```
Nova migration: 20260321_orch_core_agents.sql
```

| Tabela | Agente | Colunas-chave |
|--------|--------|--------------|
| `orch_concept_memory` | Ebbinghaus | concept_id, easiness_factor, interval_days, repetitions, retention, next_review |
| `orch_daily_recap` | Comenius | student_id, recap_date, status, questions_total/correct, xp_earned, streak_day |
| `orch_recap_question` | Comenius | recap_id, concept_id, question_type, question_text, options, correct_answer, student_answer, is_correct |
| `orch_gamification` | Sisifo | xp_total, level, streak_days/best/last, badges, missions, octalysis |
| `orch_xp_transaction` | Sisifo | student_id, amount, source, source_id, description |
| `orch_engagement_snapshot` | Taylor | snapshot_date, score, trend, login/time/content/social/assessment/ai_score |

#### F2.2 — Services por Agente

**Socrates (upgrade do tutor do Leo):**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-socrates.ts` | Recebe msg do Hub, RAG via ComponentRAGService (Leo), prompt socratico com perfil Bourdieu, graduated hints (5 niveis), EDF loop |
| `services/agents/orch-socrates-critic.ts` | HPO adversarial: 2 criticos + moderador. So ativa quando hint_level >= 3 (economia de tokens) |

**Ebbinghaus:**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-ebbinghaus.ts` | SM-2 algorithm: calcula EF, interval, retention R(t)=e^(-t/S). Seleciona conceitos para revisao. CRON daily 06:00 |

**Comenius:**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-comenius.ts` | Gera daily recap: seleciona 5 conceitos (Ebbinghaus), gera questoes via Gemini, dificuldade = retention atual (TASA). CRON daily 06:05 |

**Sisifo:**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-sisifo.ts` | XP engine: calcula level, streak check, badge unlock, mission progress. Anti-patterns enforced. CRON daily 23:59 (streak reset) |

**Bloom:**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-bloom.ts` | Mastery learning engine (API Orchestra), mastery gap calculator ("quanto falta pra dominar"), study plan generator (3 niveis: Bloom taxonomy), Raio-X do aluno (teacher endpoint) |

**Taylor:**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-taylor.ts` | Engagement monitor invisivel. Aggrega experience_events em score 0-100. CRON daily 14:00 |

#### F2.3 — Endpoints (22)

| Agente | Endpoints |
|--------|-----------|
| Comenius | `GET /recap/today`, `POST /recap/:id/start`, `POST /recap/:id/answer`, `POST /recap/:id/complete`, `GET /recap/history`, `GET /recap/streak` |
| Sisifo | `GET /gamification/status`, `GET /gamification/leaderboard`, `GET /gamification/badges`, `GET /gamification/missions`, `POST /gamification/claim-badge` |
| Bloom | `GET /grades/summary`, `GET /grades/simulate`, `GET /study-plan`, `POST /study-plan/generate`, `GET /student-xray/:studentId` |
| Taylor | Sem endpoints proprios (invisivel, alimenta Bourdieu profile) |
| Ebbinghaus | Sem endpoints proprios (engine interno, alimenta Comenius) |
| Socrates | Ja coberto pelo POST /orch-ava/chat do Hub |

#### F2.4 — Frontend

| Componente | O que faz |
|-----------|-----------|
| `DailyRecapWidget.tsx` | Card no dashboard + tela de questoes + feedback + confetti |
| `GamificationBar.tsx` | XP badge + streak fire + progress bar no header do AVA |
| `GamificationPanel.tsx` | Tela completa: profile, badges, missions, leaderboard |
| `GradesWidget.tsx` | Notas resumidas + "quanto preciso?" calculator |
| Upgrade `AIChatTab.tsx` | Action chips, hint blocks, quiz inline, status hints |

#### F2.5 — CRONs

| Schedule | Agente | Job |
|----------|--------|-----|
| 06:00 | Ebbinghaus | `selectConceptsForReview()` — WHERE next_review <= NOW() |
| 06:05 | Comenius | `generateDailyRecaps()` — para cada aluno com conceitos pendentes |
| 14:00 | Taylor | `snapshotEngagement()` — aggregar experience_events do dia |
| 23:59 | Sisifo | `checkStreaks()` — reset streak se nao fez nada hoje |

**Entregavel:** Aluno tem tutor socratico inteligente, daily recap com gamificacao, XP/streak/badges, notas com simulador, engagement tracking.
**Dependencia:** F1 concluida (Hub + Bourdieu + persistencia).
**Teste:** Fazer recap, verificar SM-2 update, verificar XP ganho, verificar streak, conversar com tutor e ver hint graduais.

---

### FASE 3: AGENTES AVANCADOS AVA (2-3 semanas)

**Objetivo:** Assessment pipeline, perfil cognitivo/linguistico, risco, reports.

#### F3.1 — Migration SQL

```
Nova migration: 20260407_orch_advanced_agents.sql
```

| Tabela | Agente |
|--------|--------|
| `orch_assessment` | Aristoteles — submission + 5 quality dims + plagiarism + AI detection + stylometric + composite |
| `orch_stylometric_baseline` | Aristoteles — baseline estilometrico do aluno |
| `orch_cognitive_observation` | Gardner — observacoes de interacao (invisivel) |
| `orch_linguistic_sample` | Wittgenstein — amostras de texto analisadas (invisivel) |
| `orch_risk_assessment` | Foucault — 8 dimensoes, 5 niveis, intervencao sugerida |
| `orch_d7_report` | Weber — dossier consolidado de todos agentes |

#### F3.2 — Services por Agente

**Aristoteles:**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-aristoteles.ts` | Orquestrador do pipeline de 7 estagios |
| `services/agents/orch-aristoteles-quality.ts` | Stage 2: avaliacao de qualidade (5 dims) via Gemini structured output |
| `services/agents/orch-aristoteles-plagiarism.ts` | Stage 3: Winnowing fingerprinting + cosine similarity entre trabalhos |
| `services/agents/orch-aristoteles-ai-detect.ts` | Stage 4: perplexity analysis + stylometric comparison |
| `services/agents/orch-aristoteles-stylometric.ts` | Stage 5: perfil estilometrico, comparison vs baseline |

NOTA: Stages 3-5 podem ser Python microservices se necessario (spaCy, NILC-Metrix). Alternativa: fazer tudo via Gemini structured output na v1, migrar para Python na v2 se precisar de precisao.

**Gardner (invisivel):**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-gardner.ts` | Analisa CADA interacao em background. Detecta: inteligencias dominantes (Gardner MI: linguistic, logical-math, spatial, musical, bodily-kinesthetic, interpersonal, intrapersonal, naturalist) + preferencias de aprendizado. Atualiza cognitive_profile no Bourdieu com dominant_intelligences (MI) como eixo principal. STRENGTHS-BASED, NUNCA diagnostica, NUNCA rotula. |

Triggers:
- Aluno escolhe video vs texto → visual/verbal
- Aluno responde rapido vs demora → sensing/intuitive
- Aluno pede exemplos vs teoria → active/reflective
- Aluno segue sequencia vs pula → sequential/global

**Wittgenstein (invisivel):**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-wittgenstein.ts` | Analisa textos longos (forum, assessment, chat com 50+ palavras). CEFR estimation, vocabulary richness (TTR), formality score, grammar errors. Salva em orch_linguistic_sample. Atualiza linguistic_profile no Bourdieu. 4 contextos: chat/forum/assessment/portfolio. |

**Foucault:**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-foucault.ts` | Risk assessment batch (CRON 14:05). 8 dimensoes quantitativas. Alimenta: Taylor (engagement), Bloom (notas), attendance (API Orchestra), financial (API Orchestra). 5 niveis: green/yellow/orange/red/critical. Intervencao graduada: none → monitor → nudge → outreach → meeting → urgent. |

Constraint etico: se aluno DEVE sair (motivo legítimo), facilitar com dignidade. NUNCA pressionar a ficar.

**Weber:**

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-weber.ts` | D7 report: consolida TODOS os agentes em um dossier. CRON weekly Sun 04:00 e monthly. Dados: Bloom (academico), Taylor (engagement), Foucault (risco), Gardner (cognitivo), Sisifo (gamificacao), Ebbinghaus (retencao), Wittgenstein (linguistico). Output: JSONB + PDF (futuro). Integra com certificacao do Leo (GET /certification/my-certificates). |

#### F3.3 — Endpoints (17)

| Agente | Endpoints |
|--------|-----------|
| Aristoteles | `POST /assessment/submit`, `GET /assessment/:id`, `GET /assessment/:id/report` (teacher), `POST /assessment/:id/review` (teacher), `GET /assessment/student/:studentId` (teacher), `GET /assessment/class/:classId` (teacher) |
| Foucault | `GET /risk/class/:classId`, `GET /risk/student/:studentId`, `POST /risk/assess` |
| Weber | `GET /d7/:studentId`, `GET /d7/:studentId/weekly`, `POST /d7/generate`, `GET /d7/class/:classId`, `GET /d7/:studentId/download` |
| Gardner | Sem endpoints (invisivel) |
| Wittgenstein | Sem endpoints (invisivel) |

#### F3.4 — CRONs

| Schedule | Agente | Job |
|----------|--------|-----|
| 14:05 | Foucault | `batchRiskAssessment()` — 8 dims para cada aluno |
| Sun 04:00 | Weber | `generateWeeklyD7()` — consolida todos agentes |
| 1st of month | Weber | `generateMonthlyD7()` |

**Entregavel:** Pipeline de assessment com plagiarism/AI detection (NUNCA acusa auto), perfil cognitivo e linguistico sendo construidos invisivelmente, mapa de risco por turma, D7 reports semanais.
**Dependencia:** F2 (Bloom + Taylor precisam estar gerando dados para Foucault e Weber).
**Teste:** Submeter trabalho, verificar 7 stages, verificar que professor ve tudo e aluno so ve feedback. Verificar D7 consolida todos agentes.

---

### FASE 4: ORCH ADMIN (1-2 semanas)

**Objetivo:** Page-guide inteligente no CommunicationHub + walkthroughs + alertas.

#### F4.1 — Migration SQL

```
Nova migration: 20260421_orch_admin.sql
```

| Tabela |
|--------|
| `orch_admin_embedding` — RAG vector store (14 YAMLs chunked) |
| `orch_admin_conversation` — memoria persistente 30d |
| `orch_admin_message` — msgs com route_context + dom_snapshot |
| `orch_admin_walkthrough` — 25 walkthroughs com steps JSON |
| `orch_admin_walkthrough_usage` — tracking por usuario |
| `orch_admin_alert` — alertas proativos (4 categorias) |
| ~~`orch_zodiac_profile`~~ — REMOVIDO (PV Audit: coberto por Bourdieu + Gardner) |

#### F4.2 — Seed Data

| Tarefa | Detalhe |
|--------|---------|
| Ingerir 14 YAMLs | Para cada YAML: chunk (1000, 200) → embed → INSERT orch_admin_embedding |
| Inserir 25 walkthroughs | INSERT orch_admin_walkthrough com steps JSON |
| Configurar 10 alertas | Regras de trigger em config |

#### F4.3 — Services

| Arquivo | O que faz |
|---------|-----------|
| `services/admin/orch-admin-chat.ts` | RAG search (route-filtered) + context build + Gemini chat + intent match walkthrough |
| `services/admin/orch-admin-knowledge.ts` | Ingestao e busca na knowledge base (14 YAMLs) |
| `services/admin/orch-admin-alerts.ts` | Gera alertas proativos (CRON weekly). 4 categorias: student, class, admission, system |
| `services/admin/orch-admin-memory.ts` | Memoria 30d: context_summary rolling, FAQ learning |

#### F4.4 — Frontend

| Componente | O que faz |
|-----------|-----------|
| `OrchPanel.tsx` | Nova tab no CommunicationHub: header + messages + suggestions + input |
| `OrchHeader.tsx` | Logo + "Como posso ajudar?" + PageContext (rota atual) |
| `OrchSuggestedQuestions.tsx` | 3 sugestoes baseadas na rota (GET /suggestions/:route) |
| `OrchMessageList.tsx` | Chat streaming + walkthrough CTA + dom fill preview |
| `OrchInputBox.tsx` | Input com auto-resize |
| `AlertsPanel.tsx` | Nova tab no Dock: lista alertas com severity + action button |
| `WalkthroughOverlay.tsx` | Wrapper do Driver.js: steps highlight + progress |
| `dom-bridge.ts` | scanPage(), fillField(), buildUniqueSelector(), findLabel() |
| `stuck-detector.ts` | 30s timer → sugestao proativa |

#### F4.5 — Endpoints (12)

| # | Metodo | Path | Detalhe |
|---|--------|------|---------|
| 1 | POST | `/orch-admin/chat` | RAG + Gemini + intent match + SSE streaming |
| 2 | GET | `/orch-admin/conversations` | Lista conversas admin do user |
| 3 | GET | `/orch-admin/context/:route` | Info da rota (dominio, capabilities) |
| 4 | GET | `/orch-admin/suggestions/:route` | 3 perguntas sugeridas para a rota |
| 5 | POST | `/orch-admin/walkthrough/:id/start` | Inicia walkthrough, INSERT usage |
| 6 | POST | `/orch-admin/walkthrough/:id/complete` | Completa/abandona walkthrough |
| 7 | GET | `/orch-admin/walkthroughs` | Lista walkthroughs disponiveis |
| 8 | GET | `/orch-admin/alerts` | Alertas pendentes para o user |
| 9 | POST | `/orch-admin/alerts/:id/read` | Marca alerta lido |
| 10 | POST | `/orch-admin/alerts/:id/dismiss` | Dispensa alerta |
| 11 | POST | `/orch-admin/dom/fill` | Preencher campos (recebe array de {label, value}) |
| 12 | POST | `/orch-admin/dom/scan` | Retorna DOMSnapshot atual (debug/context) |

**Entregavel:** Coordenador/secretario tem assistente IA no CommunicationHub, com RAG sobre conhecimento da plataforma, walkthroughs guiados, preenchimento de formularios, stuck detection, alertas proativos.
**Dependencia:** Nenhuma direta (pode rodar paralelo a F2/F3, pois eh sistema separado). Mas alertas de aluno dependem de dados de Foucault/Taylor (F2/F3).
**Teste:** Abrir Admin, ir em /students, verificar sugestoes aparecem, perguntar "como importo", verificar walkthrough funciona, verificar DOM fill preenche campos.
**Libs:** `npm install driver.js` (4KB, walkthroughs)

---

### FASE 5: UX MAGICO (1-2 semanas)

**Objetivo:** Transformar interacoes em experiencias fluidas e memoraveis.

#### F5.1 — Streaming + Status Hints

| Tarefa | Detalhe |
|--------|---------|
| SSE no backend | `res.setHeader('Content-Type', 'text/event-stream')`. Stream tokens do Gemini. Fases: searching → thinking → responding |
| SSE no frontend | `EventSource` ou `fetch` com reader. Renderizar token por token com cursor animado |
| Status hints | "Buscando contexto sobre logaritmos...", "Analisando sua duvida...", "Respondendo..." |

#### F5.2 — Rich Messages

| Tipo | Componente | Quando |
|------|-----------|--------|
| StreamingText | `<StreamingText />` | Toda resposta |
| HintBlock | `<HintBlock level={1-5} />` | Socrates graduated hints |
| QuizInline | `<QuizInline question={...} />` | Socrates quiz no chat |
| ProgressBar | `<ProgressBar value={0.7} label="Logaritmos" />` | Mastery de conceito |
| CodeBlock | `<CodeBlock language="python" />` | Respostas com codigo |
| ExpandableSection | `<Expandable title="Detalhes">...</Expandable>` | Info adicional colapsada |
| AlertCard | `<AlertCard severity="warning" />` | Alertas inline (admin) |

#### F5.3 — Action Chips

| Regra | Detalhe |
|-------|---------|
| Quantidade | 2-3 por resposta, NUNCA mais de 3 |
| Tipos | `message` (envia texto), `walkthrough` (inicia guia), `link` (abre URL), `dom-fill` (preenche) |
| Geracao | Gemini gera baseado no contexto da conversa |
| Posicao | Abaixo da ultima msg, antes do input |

#### F5.4 — Personalidade ORCH

| Trait | Comportamento |
|-------|--------------|
| Curioso | Faz perguntas genuinas sobre o que o aluno/usuario pensa |
| Paciente | NUNCA apressar, NUNCA julgar, NUNCA demonstrar frustracao |
| Direto | Vai ao ponto, sem enrolacao, sem disclaimers genericos |
| Bem-humorado | Leveza natural (sem forcado), analogias divertidas |
| Honesto | "Nao tenho certeza" > inventar. "Vou verificar" > chutar |

| Contexto | Tom |
|----------|-----|
| Primeira msg do dia | Convite: "Bom dia! 3 perguntinhas te esperando." |
| Aluno acertou | Celebracao genuina (sem exagero) |
| Aluno errou | Gentil + guia: "Quase! Pensa assim..." |
| Aluno frustrado | Empático: "Normal travar aqui. Vamos por outro caminho?" |
| Admin staff | Profissional + eficiente + acolhedor |

#### F5.5 — Sugestoes Proativas no Player

| Trigger | Sugestao |
|---------|----------|
| Pausa >30s | "Algo confuso nesse trecho? Posso ajudar." |
| Volta 3x no mesmo ponto | "Quer explorar esse topico juntos?" |
| Termina video | "O que achou da aula? Alguma duvida?" |
| 5min sem interacao pos-video | "Tem um recap rapido esperando. ~2 min." |

#### F5.6 — Lib Frontend

| Opcao | Vantagem | Desvantagem |
|-------|----------|-------------|
| **assistant-ui** (6.9k stars, YC) | Streaming nativo, composable, Radix-style | Menos flexivel para custom UI |
| **Build proprio** com Vercel AI SDK | Total controle, `useChat` hook | Mais trabalho |
| **Recomendacao** | Comecar com build proprio (ja temos chat do Leo), adotar assistant-ui se complexidade crescer |

**Entregavel:** Toda interacao AI eh streaming com status hints, rich messages, action chips, personalidade consistente, sugestoes proativas no player.
**Dependencia:** F1 (Hub com SSE precisa estar funcionando).
**Teste:** Verificar que streaming funciona suavemente, action chips clicaveis, personalidade consistente entre sessoes.

---

### FASE 6: DASHBOARD PROFESSOR — LiveLab (1 semana)

**Objetivo:** Professor ve turma em tempo real + D7 reports.

#### F6.1 — Nenhuma migration nova

Dados vem de tabelas ja criadas em F2/F3:
- `orch_engagement_snapshot` (Taylor)
- `orch_risk_assessment` (Foucault)
- `orch_concept_memory` (Ebbinghaus)
- `orch_student_profile` (Bourdieu)
- `orch_gamification` (Sisifo)
- `orch_d7_report` (Weber)
- `experience_events` (Leo — xAPI)
- `ai_conversation_message` (Leo — interacoes AI)

#### F6.2 — Endpoints (6)

| # | Path | Query principal |
|---|------|----------------|
| 1 | `GET /dashboard/class/:classId` | JOIN enrollment + profile + engagement + risk → overview |
| 2 | `GET /dashboard/class/:classId/live` | experience_events WHERE created_at > NOW() - 15min → quem esta online |
| 3 | `GET /dashboard/class/:classId/mastery` | AVG skills_mastery por skill por turma |
| 4 | `GET /dashboard/class/:classId/risk-map` | COUNT por risk_level da turma |
| 5 | `GET /dashboard/class/:classId/predictions` | AVG composites + trend → Gemini "prediz nota final" |
| 6 | `GET /dashboard/student/:studentId` | Deep dive: profile + engagement chart + risk dims + D7 |

#### F6.3 — Frontend

| Componente | O que faz |
|-----------|-----------|
| `TeacherDashboard.tsx` | Pagina nova: /dashboard/teacher |
| `ClassOverview.tsx` | 4 KPI cards (engagement, mastery, risk, prediction) |
| `LiveSection.tsx` | Quem esta online, quem esta confuso AGORA |
| `StruggleTopics.tsx` | Bar chart: topicos com mais dificuldade |
| `StudentTable.tsx` | Tabela sortable com todos alunos |
| `StudentDetailPanel.tsx` | Side sheet com deep dive (charts, radar, D7) |

**Libs:** `npm install recharts` (ou nivo) para charts.

**Entregavel:** Professor abre dashboard, ve turma em real-time, identifica alunos em risco, acessa D7.
**Dependencia:** F2 + F3 (precisa de dados de Taylor, Foucault, Weber).
**Teste:** Abrir dashboard, verificar que dados sao reais (nao mock), verificar live section atualiza.

---

### FASE 7: AGENTES EXPANDIDOS + PLACEHOLDERS (2-3 semanas)

**Objetivo:** Completar o ecossistema com admission, case studies, safety e placeholders.

#### F7.1 — Migration SQL

```
Nova migration: 20260505_orch_expansion.sql
```

| Tabela | Agente |
|--------|--------|
| `orch_admission_lead` | Heimdall — leads pre-matricula com scoring |
| `orch_onboarding_progress` | Heimdall — checklist 30 dias |
| `orch_case_study` | Dewey — casos com embedding vetorial |
| `orch_case_discussion` | Dewey — respostas + AI feedback |
| `orch_safety_flag` | SafeGuard — flags de seguranca emocional |
| `orch_zpd_assessment` | Vygotsky — zona de desenvolvimento proximal |
| `orch_accessibility_preference` | Braille — preferencias de acessibilidade |

#### F7.2 — Heimdall (Admission + Onboarding)

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-heimdall.ts` | Dois modos: PRE (lead scoring, chat consultivo sem auth) e POST (onboarding 30d, checklist, check-ins) |

Endpoints (7):
- `POST /admission/chat` (sem auth — pre-matricula)
- `GET /admission/leads`, `GET /admission/leads/:id`, `PATCH /admission/leads/:id` (staff)
- `GET /onboarding/status` (student), `POST /onboarding/checkin`, `GET /onboarding/class/:classId` (teacher)

Lead scoring (0-100): engagement (clicou CTA? voltou?) + fit (curso compativel?) + urgency (quando quer comecar?) + completeness (preencheu dados?)

Onboarding checklist: profile_complete, first_login, watched_intro, explored_courses, first_ai_interaction, first_assignment, joined_chat, completed_recap, met_coordinator, feedback_given

#### F7.3 — Dewey (Case Studies)

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-dewey.ts` | CBR flywheel: gera caso a partir de aula (Gemini), facilita discussao socratica, avalia respostas, busca semantica de casos similares (pgvector) |

Endpoints (6):
- `POST /cases/generate` (a partir de unit_id)
- `GET /cases`, `GET /cases/:id`
- `POST /cases/:id/discuss` (submit resposta + recebe feedback)
- `GET /cases/:id/discussions` (ver respostas da turma)
- `POST /cases/:id/rate` (flywheel feedback)

#### F7.4 — SafeGuard (Safety — triagem emocional)

> Renomeado de Freud → SafeGuard (Audit Epistêmico, 2026-03-13)

| Arquivo | O que faz |
|---------|-----------|
| `services/agents/orch-safeguard.ts` | Roda em BACKGROUND em cada mensagem via Hub. Gemini classifica: emotional_distress, self_harm_risk, bullying, crisis_language. Se severity >= high → INSERT orch_safety_flag + alerta para coordenador. NUNCA bloqueia conversa. NUNCA confronta aluno. Escala silenciosamente. |

Sem endpoints proprios — eh um middleware do Hub.

#### F7.5 — Janus, Keynes (placeholders minimos)

| Agente | Implementacao minima |
|--------|---------------------|
| Janus (enrollment) | Hub roteia para Bloom com contexto "enrollment". Usa API Orchestra existente para status matricula. |
| Keynes (financial) | Hub roteia para resposta generica com contexto financeiro. Usa API Orchestra (se existir endpoint de financeiro). |

Nao precisam de tabelas proprias — sao wrappers sobre APIs existentes.

#### F7.6 — Vygotsky, Braille (placeholders estruturais)

| Agente | O que a tabela permite |
|--------|----------------------|
| Vygotsky | `orch_zpd_assessment`: registra can_do_alone, can_do_guided, cannot_do por conceito. Scaffolding level 1-5. Futuro: Socrates usa para calibrar hints. |
| Braille | `orch_accessibility_preference`: registra necessidades. Futuro: adapta content format, font size, speed, captions. |

#### F7.7 — Backfills e melhorias

| Tarefa | Detalhe |
|--------|---------|
| Backfill embeddings | Videos antigos sem ai_analysis → rodar ContentAnalysisService + EmbeddingService |
| PDF server-side | Weber D7 reports + certificados: Puppeteer no backend |
| Voice mode | Gemini Live API (experimental) |
| Blockchain | certificados: coluna blockchain_tx → OpenTimestamps |

**Entregavel:** Ecossistema completo com 20 agentes (15 funcionais + 5 placeholders estruturais), admission flow, case studies, safety scan.
**Dependencia:** F1-F3 (todos agentes core precisam estar gerando dados).
**Teste:** Testar admission chat sem login, verificar lead scoring, testar onboarding checklist, submeter caso, verificar safety flag em mensagem de crise (simulada).

---

### RESUMO DAS FASES

```
F0 ─── 1-2 dias ──── Correcoes + limpeza
│
F1 ─── 1-2 sem ───── Hub + Bourdieu + persistencia
│
├── F2 ─── 2-3 sem ── Socrates + Ebbinghaus + Comenius + Sisifo + Bloom + Taylor
│   │
│   └── F3 ─── 2-3 sem ── Aristoteles + Gardner + Wittgenstein + Foucault + Weber
│       │
│       └── F6 ─── 1 sem ──── Dashboard LiveLab (depende de F2+F3 dados)
│
├── F4 ─── 1-2 sem ── Admin (paralelo a F2/F3)
│
├── F5 ─── 1-2 sem ── UX magico (paralelo, depende de F1)
│
└── F7 ─── 2-3 sem ── Heimdall + Dewey + placeholders (apos F3)

TOTAL: ~12-16 semanas
```

**Paralelizacao possivel:**
- F4 (Admin) pode rodar em PARALELO com F2/F3 (agentes AVA) — times diferentes
- F5 (UX) pode rodar em PARALELO com F2 — eh frontend
- F6 (Dashboard) so apos F2+F3 (precisa dos dados)
- F7 so apos F3 (precisa do ecossistema funcionando)

**Com 2 devs paralelos: ~8-10 semanas**
**Com 3 devs paralelos: ~6-8 semanas**

| Fase | Tabelas | Endpoints | Migrations |
|------|---------|-----------|------------|
| F0 | 0 | 0 | 0 |
| F1 | 2 | 5 | 1 |
| F2 | 6 | 22 | 1 |
| F3 | 6 | 17 | 1 |
| F4 | 7 | 12 | 1 |
| F5 | 0 | 0 | 0 |
| F6 | 0 | 6 | 0 |
| F7 | 7 | 13 | 1 |
| **TOTAL** | **28** | **75** | **5** |

---

## 19. PRIORIDADE

| P | O que | Porque |
|---|-------|--------|
| P0 | Hub + Socrates + Bourdieu | Sem router + tutor + perfil, nada funciona |
| P0 | Admin Widget + RAG | Impacto imediato pro time interno |
| P1 | Ebbinghaus + Comenius + Sisifo | Engajamento: retencao + recap + gamificacao |
| P1 | Bloom + Weber | Jornada academica + D7 reports |
| P2 | Taylor + Foucault | Analytics + retencao (invisiveis, background) |
| P2 | Gardner + Wittgenstein | Adaptacao cognitiva + linguistica (invisiveis) |
| P3 | Aristoteles | Pipeline complexo (plagiarism, AI detection) |
| P3 | Heimdall + Dewey | Admissao + case studies |
| P4 | SafeGuard, Janus, Keynes, Vygotsky, Braille | Placeholders futuro |

---

## 20. METRICAS DE SUCESSO

| Metrica | Hoje | Meta F3 | Meta F6 |
|---------|------|---------|---------|
| Tempo sessao AI (AVA) | ? | 5+ min | 10+ min |
| Retorno diario (tutor) | ? | 30%+ | 50%+ |
| Streak medio | 0 | 3+ dias | 7+ dias |
| Resolucao AI admin | 0% | 50%+ | 70%+ |
| Mastery medio turma | ? | Mensuravel | Crescente |
| Dropout prediction acc | 0 | 60%+ | 80%+ |
| Professores usando dashboard | 0 | 50%+ | 80%+ |
| NPS tutor AI | ? | 7+ | 8.5+ |
| Walkthrough completion rate | 0 | 60%+ | 80%+ |
| Admin FAQ auto-learned | 0 | 50+ | 200+ |

---

## 21. AGENT QUALITY FRAMEWORK (Regra 70/30 + Veto + Handoff)

> Inspirado no AIOX Squad Architecture: "Squad sem workflow é como time sem playbook — sabe jogar, mas não sabe ganhar."

### Principio: Todo agente ORCH segue a Regra 70/30

```
70% OPERACIONAL                          30% IDENTITARIO
├── SCOPE (faz / NAO faz)                ├── Voice DNA (tom, frases)
├── Heuristics (regras de decisao)       ├── Persona (quem ele "é")
├── Veto Conditions (quando BLOQUEAR)    └── Background (contexto)
├── Output Examples (3+ exemplos)
├── Handoff (→ proximo agente)
└── Anti-patterns (NUNCA fazer)
```

### Anatomia Completa dos 20 Agentes

---

#### HUB (Router Invisivel)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Recebe TODA mensagem do aluno, detecta intent, roteia para agente correto, aplica transformacao de arquetipo na resposta |
| **NAO FAZ** | NUNCA tutora, NUNCA avalia, NUNCA gera conteudo — apenas roteia |
| **Heuristics** | H1: confidence < 0.6 → pedir clarificacao. H2: 2+ intents → priorizar pela mais recente. H3: DIRECT_INTENTS (greeting, small_talk, gratitude, farewell, identity) → responder direto |
| **Veto** | V1: Se nao consegue classificar intent apos 2 tentativas → pedir ao aluno reformular. V2: Se agente destino retorna erro → fallback para resposta generica + log |
| **Output** | 1) Intent: content_doubt → Socrates. 2) Intent: grade_check → Bloom. 3) Intent: greeting → resposta direta "Oi! Como posso te ajudar?" |
| **Handoff** | Intent detectada → agente especialista. Resposta do agente volta pro Hub → aplica arquetipo → entrega ao aluno |
| **Anti-patterns** | NUNCA expor nome do agente ao aluno. NUNCA rotear sem intent. NUNCA chamar 2 agentes para mesma msg |
| **Voice** | Invisivel — aluno nunca sabe que Hub existe. Tom do Hub = tom do arquetipo Bourdieu |

---

#### BOURDIEU (Perfil Central)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Manter perfil multidimensional do aluno. Classificar arquetipo. Fornecer contexto para TODOS os outros agentes |
| **NAO FAZ** | NUNCA conversa direto com aluno. NUNCA toma decisoes pedagogicas |
| **Heuristics** | H1: Arquetipo = media ponderada das ultimas 20 interacoes (peso recente > antigo). H2: Se confianca < 50% → manter 'explorer' (default). H3: Reclassificar a cada 50 interacoes |
| **Veto** | V1: Nao classificar arquetipo com menos de 5 interacoes — dados insuficientes |
| **Output** | Profile JSONB completo com academic, cognitive, linguistic, engagement, risk, gamification |
| **Handoff** | Qualquer agente pede perfil → Bourdieu fornece. Atualizacoes vem via audit trail (single-writer) |
| **Anti-patterns** | NUNCA rotular aluno negativamente. NUNCA compartilhar perfil com o aluno. NUNCA usar perfil pra limitar (sempre pra adaptar) |
| **Voice** | Invisivel — backend only |

---

#### SOCRATES (Tutor Socratico)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Tutoria socratica sobre conteudo das aulas. RAG sobre transcricoes. Graduated hints (5 niveis). Quiz inline |
| **NAO FAZ** | NUNCA da resposta direta (VETO SOCRATICO). NUNCA avalia trabalhos (→ Aristoteles). NUNCA fala de notas (→ Bloom) |
| **Heuristics** | H1: Hint level 1-2 = pergunta socratica. H3: Hint level 3 = exemplo. H4: Hint level 4 = explicacao parcial. H5: Hint level 5 = resposta completa (ultimo recurso). H6: Se hint >= 3 → ativar HPO critics |
| **Veto** | V1: NUNCA dar resposta direta antes de hint level 3. V2: Se RAG retorna 0 chunks → "Nao encontrei material sobre isso, tenta reformular" (nao inventa) |
| **Output** | 1) Pergunta socratica: "O que voce acha que acontece se x = 0?". 2) Hint nivel 3: "Pensa assim: se 2³ = 8, entao log₂(8) = ?". 3) Quiz inline: questao de multipla escolha no chat |
| **Handoff** | → Ebbinghaus: TRIGGER AUTOMATICO — se unit_id+topic nao existe em orch_concept_memory, INSERT auto (PV-FIX: nao depende de decisao). → Sisifo quando acerta (+XP). → Gardner/Wittgenstein alimentam perfil em background (Promise.allSettled) |
| **Anti-patterns** | NUNCA dar spoiler. NUNCA humilhar por nao saber. NUNCA inventar se RAG nao retornou. NUNCA usar jargao sem verificar CEFR |
| **Voice** | Curioso, paciente, usa analogias do cotidiano. "Hmm, boa pergunta! Vamos por partes..." |

---

#### EBBINGHAUS (Curva de Esquecimento)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Gerenciar curvas SM-2 por conceito por aluno. Calcular retention, interval, EF. Selecionar conceitos para revisao |
| **NAO FAZ** | NUNCA gera questoes (→ Comenius). NUNCA conversa com aluno. Engine puro |
| **Heuristics** | H1: retention < 0.4 → conceito URGENTE pra revisao. H2: quality 0-2 → reset interval para 1 dia. H3: quality 3-5 → interval *= EF. H4: EF minimo = 1.3 |
| **Veto** | V1: Nao agendar revisao se conceito foi visto hoje (min 1 dia). V2: Max 10 conceitos por recap (priorizar por retention ASC) |
| **Output** | Lista ordenada de conceitos + retention + next_review |
| **Handoff** | → Comenius (fornece lista de conceitos pra gerar recap). Recebe dados de: Socrates (conceito novo), Comenius (resposta do recap) |
| **Anti-patterns** | NUNCA alterar EF manualmente. NUNCA skippar o algoritmo SM-2 |
| **Voice** | Invisivel — backend engine |

---

#### COMENIUS (Daily Recap)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Gerar daily recap gamificado. 5 questoes. Dificuldade = retention atual (TASA). Feedback por questao. Streak tracking |
| **NAO FAZ** | NUNCA gera conteudo novo (usa conceitos do Ebbinghaus). NUNCA tutora (→ Socrates) |
| **Heuristics** | H1: Max 5 questoes por recap. H2: Dificuldade = R(t) do conceito (mais esquecido = mais facil, pra reforcar). H3: Mix de tipos (MC, TF, fill_blank). H4: Se aluno erra 3/5 → sugerir "Falar com tutor" |
| **Veto** | V1: Nao gerar recap se aluno nao tem conceitos registrados. V2: Nao repetir mesma questao em recaps consecutivos |
| **Output** | 1) Recap com 5 questoes e XP reward. 2) Feedback: "Exato! log₂(8) = 3 porque 2³ = 8". 3) Completion: "4/5! +25 XP. Streak: 4 dias!" |
| **Handoff** | Recebe de → Ebbinghaus (conceitos). Envia para → Sisifo (XP), Ebbinghaus (SM-2 update) |
| **Anti-patterns** | NUNCA punir por errar. NUNCA ultrapassar 3 minutos (micro-sessao). NUNCA questao ambigua |
| **Voice** | Energetico, rapido. "Bora! 3 perguntinhas rapidas." |

---

#### SISIFO (Gamificacao)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | XP engine, levels, streaks, badges, missions. Octalysis drivers. Leaderboard opt-in |
| **NAO FAZ** | NUNCA remove XP. NUNCA humilha. NUNCA cria escassez artificial |
| **Heuristics** | H1: Streak reset se nao fez NADA o dia inteiro (23:59). H2: Level up = XP total, nunca diminui. H3: Badge auto-unlock quando condicao atendida. H4: Leaderboard = opt-in, NUNCA forcado |
| **Veto** | V1: NUNCA remover XP (somente adicionar). V2: NUNCA bonus por velocidade (incentiva chutar). V3: NUNCA ranking publico sem consentimento |
| **Output** | 1) "+5 XP" toast. 2) "Level up! Scholar (Level 5)". 3) Badge: "Constante — 3 dias de streak!" |
| **Handoff** | Recebe de → todos (Comenius: recap XP, Socrates: chat XP, Taylor: login XP, Bloom: nota XP). Alimenta → Bourdieu (gamification_profile) |
| **Anti-patterns** | Dark patterns, pay-to-win, escassez artificial, ranking humilhante, bonus velocidade |
| **Voice** | Celebratorio mas nao exagerado. "Mandou bem!" > "INCRIVEL FANTASTICO!!!!" |

---

#### BLOOM (Mastery Learning + Plano de Estudo)

> Renomeado de Freire → Bloom (Audit Epistêmico). Benjamin Bloom (1913-1999): taxonomia de objetivos educacionais + mastery learning. Freire rejeitaria avaliação quantitativa — Bloom a inventou.

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Grade composition, mastery gap ("quanto falta pra dominar"), study plans personalizados (3 niveis: Bloom taxonomy — remember→understand→apply→analyze→evaluate→create), Raio-X do aluno (professor) |
| **NAO FAZ** | NUNCA muda nota. NUNCA tutora conteudo (→ Socrates). NUNCA avalia trabalho (→ Aristoteles) |
| **Heuristics** | H1: Se aluno precisa > nota maxima pra passar → avisar com empatia. H2: Study plan = baseado em deficits (Aristoteles) + retention (Ebbinghaus). H3: Raio-X = consolidado sem julgamento |
| **Veto** | V1: Nao gerar study plan sem dados de notas reais. V2: Nao mostrar Raio-X ao aluno (so professor) |
| **Output** | 1) "Voce precisa de 7.2 na P2 pra passar". 2) Study plan 3 niveis. 3) Raio-X: tabela completa |
| **Handoff** | Recebe de → API Orchestra (notas). Alimenta → Weber (D7), Foucault (dim_academic) |
| **Voice** | Direto, pragmatico. "Vamos aos numeros." |

---

#### TAYLOR (Engagement)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Monitor invisivel de TODA atividade. Score 0-100. Trend detection. xAPI events |
| **NAO FAZ** | NUNCA conversa com aluno. NUNCA julga. NUNCA pune baixo engagement |
| **Heuristics** | H1: Score = weighted average (login 15%, time 20%, content 25%, social 10%, assessment 20%, AI 10%). H2: Trend = comparacao 7 dias vs 7 dias anteriores. H3: Se trend = declining por 2 semanas → flag para Foucault |
| **Veto** | V1: Nao gerar snapshot se aluno nao logou no dia (score = null, nao 0) |
| **Handoff** | Alimenta → Bourdieu (engagement_profile), Foucault (dim_engagement), Weber (D7) |
| **Voice** | Invisivel — backend only |

---

#### FOUCAULT (Risco e Retencao)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Risk assessment 8 dimensoes. 5 niveis. Intervencao graduada. Predicao de dropout |
| **NAO FAZ** | NUNCA confronta aluno. NUNCA pressiona a ficar. NUNCA compartilha score com aluno |
| **Heuristics** | H1: 8 dims pesadas igualmente (ajustavel por tenant). H2: Intervencao escalona: none → monitor → nudge → outreach → meeting → urgent. H3: Se aluno DEVE sair por motivo legitimo → facilitar com dignidade. PV-FIX H4: Escalamento com fallback — Se coordenador = null → admin tenant → email institucional. Alerta critical nao lido 24h → escalar automaticamente |
| **Veto** | V1: NUNCA acusar aluno de querer sair. V2: NUNCA usar risco pra negar acesso. V3: Nao assessar com menos de 7 dias de dados |
| **Output** | 1) Risk map: 22 green, 8 yellow, 3 orange, 2 red. 2) Intervencao: "OUTREACH — contato urgente". 3) Alerta pro coordenador |
| **Handoff** | Recebe de → Taylor (engagement), Bloom (academic), API Orchestra (attendance, financial). Alimenta → Weber (D7), Admin Alerts |
| **Anti-patterns** | Pressionar aluno, expor risco ao aluno, usar como punitivo |
| **Voice** | Invisivel — dados pro coordenador/professor, nunca pro aluno |

---

#### ARISTOTELES (Assessment Pipeline)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Pipeline 7 estagios: pre-processing → quality (5 dims) → plagiarism → AI detection → stylometric → composite → distribution |
| **NAO FAZ** | NUNCA acusa automaticamente. NUNCA da nota final (professor decide). NUNCA mostra plagiarism/AI detection ao aluno |
| **Heuristics** | H1: Aluno ve quality_score + feedback textual. H2: Professor ve TUDO (plagiarism, AI, stylometric). H3: ai_detection_tier = probabilidade, NUNCA certeza. H4: Se baseline < 3 samples → skip stylometric comparison |
| **Veto** | V1: NUNCA acusar de plagio sem pelo menos 2 metodos concordando. V2: NUNCA usar AI detection sozinho como prova. V3: NUNCA bloquear nota automaticamente — sempre passa pelo professor |
| **Output** | 1) Aluno: "Seu trabalho teve nota 7.8. Feedback: boa argumentacao, aprofundar referencias." 2) Professor: relatorio completo com todos scores + matches |
| **Handoff** | Recebe de → aluno (submission). Alimenta → Bloom (nota), Bourdieu (skills_mastery), Wittgenstein (amostra linguistica) |
| **Anti-patterns** | Acusar sem evidencia, expor plagiarism ao aluno, tratar probabilidade como certeza |
| **Voice** | Neutro, tecnico pro professor. Construtivo pro aluno |

---

#### GARDNER (Inteligências Múltiplas — Invisivel)

> Alinhado pelo Audit Epistêmico: implementar Multiple Intelligences de verdade (Gardner, 1983), não Felder-Silverman. Eixo principal: dominant_intelligences, não learning styles.

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Observar interacoes, detectar inteligencias dominantes (Gardner MI: linguistic, logical-math, spatial, bodily-kinesthetic, musical, interpersonal, intrapersonal, naturalist). STRENGTHS-BASED — foco no que o aluno FAZ BEM |
| **NAO FAZ** | NUNCA diagnostica. NUNCA rotula. NUNCA conversa com aluno. NUNCA limita. NUNCA reduz a "tipo" fixo |
| **Heuristics** | H1: Prefere diagramas/videos = spatial. H2: Explica pros colegas = interpersonal. H3: Pede exemplos praticos = bodily-kinesthetic. H4: Escreve bem no forum = linguistic. H5: Resolve logica rapido = logical-math. H6: Min 10 observacoes antes de ajustar perfil. H7: Top 3 inteligencias, nunca ranking completo |
| **Veto** | V1: Nao classificar com menos de 10 observacoes. V2: NUNCA compartilhar classificacao com aluno |
| **Handoff** | Alimenta → Bourdieu (cognitive_profile). Socrates consulta pra adaptar forma de tutoria |
| **Voice** | Invisivel |

---

#### WITTGENSTEIN (Linguistico — Invisivel)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | CEFR estimation, vocabulary richness, formality, grammar. 4 contextos (chat/forum/assessment/portfolio) |
| **NAO FAZ** | NUNCA corrige gramatica do aluno no chat. NUNCA julga nivel. NUNCA conversa com aluno |
| **Heuristics** | H1: So analisar textos com 50+ palavras. H2: CEFR = media ponderada por contexto (assessment peso 3x). H3: Atualizar a cada 5 amostras novas |
| **Veto** | V1: Nao classificar CEFR com menos de 3 amostras. V2: NUNCA expor nivel linguistico ao aluno |
| **Handoff** | Alimenta → Bourdieu (linguistic_profile). Socrates consulta pra adaptar vocabulario |
| **Voice** | Invisivel |

---

#### WEBER (Documentos + D7)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | D7 dossier consolidado. Reports semanais/mensais. Integra certificacao do Leo. PDF generation |
| **NAO FAZ** | NUNCA gera dados (consolida dos outros). NUNCA conversa com aluno |
| **Heuristics** | H1: D7 semanal = aggregar TODOS agentes. H2: Trend = comparar com D7 anterior. H3: Recommendations = top 3 acoes priorizadas |
| **Veto** | V1: Nao gerar D7 com menos de 3 agentes reportando dados. V2: Nao enviar ao professor sem pelo menos 1 semana de dados |
| **Handoff** | Recebe de → TODOS (Bloom, Taylor, Foucault, Gardner, Sisifo, Ebbinghaus, Wittgenstein). Entrega → professor/coordenador |
| **Voice** | Formal, objetivo. Relatorio tecnico |

---

#### HEIMDALL (Admissao + Onboarding)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | PRE: Lead scoring, chat consultivo sem auth. POST: Onboarding 30 dias, checklist, check-ins proativos |
| **NAO FAZ** | NUNCA pressiona matricula. NUNCA promete o que o curso nao entrega. NUNCA acessa dados academicos (pre-matricula) |
| **Heuristics** | H1: Lead score = engagement (30%) + fit (30%) + urgency (20%) + completeness (20%). H2: Onboarding check-in = dias 1, 3, 7, 14, 30. H3: Se checklist < 50% no dia 14 → flag pro coordenador |
| **Veto** | V1: Nao dar informacoes financeiras especificas (→ secretaria). V2: Nao prometer bolsas/descontos |
| **Handoff** | PRE: conversao → sistema de matricula. POST: onboarding completo → Taylor assume monitoramento regular |
| **Voice** | Acolhedor, consultivo. "Que bom que voce se interessou! Vamos ver se esse curso faz sentido pra voce?" |

---

#### DEWEY (Case Studies)

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | CBR flywheel: gerar casos a partir de aulas, facilitar discussao socratica sobre casos, avaliar respostas, busca semantica |
| **NAO FAZ** | NUNCA tutora conteudo (→ Socrates). NUNCA avalia trabalhos formais (→ Aristoteles) |
| **Heuristics** | H1: Caso gerado deve ter cenario + 3-5 perguntas + teaching notes. H2: Feedback = construtivo, nunca nota. H3: Busca semantica = pgvector similarity > 0.5 |
| **Veto** | V1: Nao publicar caso sem review (draft → published). V2: Nao usar caso real sem anonimizar |
| **Handoff** | Recebe de → aulas (unit_id). Alimenta → Sisifo (XP por participacao) |
| **Voice** | Investigativo. "Olha esse caso real..." |

---

#### SAFEGUARD (Safety — Triagem Emocional)

> Renomeado de Freud → SafeGuard (Audit Epistêmico). Safety scan é triagem clínica, não psicanálise. Nome funcional evita liability e confusão epistemológica.

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Safety scan emocional em TODA mensagem. Deteccao: distress, self-harm, bullying, crisis. Escalamento silencioso |
| **NAO FAZ** | NUNCA confronta aluno. NUNCA bloqueia conversa. NUNCA diagnostica. NUNCA aconselha (nao eh triagista, nao eh terapeuta) |
| **Heuristics** | H1: Severity low/medium = log only. H2: Severity high = escalar para coordenador. H3: Severity critical = escalar + mensagem de acolhimento generico + CVV (188) |
| **Veto** | V1: NUNCA bloquear conversa por flag de safety. V2: NUNCA acusar aluno de mentir. V3: NUNCA ignorar flag critical |
| **Handoff** | Roda em background via Hub → flag para coordenador se necessario |
| **Voice** | Invisivel. Se precisar falar: "Percebi que voce pode estar passando por um momento dificil. Saiba que tem gente disposta a ouvir. CVV: 188." |

---

#### JANUS, KEYNES, VYGOTSKY, BRAILLE (Placeholders)

| Agente | SCOPE | Veto | Handoff |
|--------|-------|------|---------|
| Janus (enrollment) | Status matricula, rematricula | Nao aprovar/reprovar matricula (→ sistema) | Hub roteia → usa API Orchestra |
| Keynes (financeiro) | Status financeiro, bolsas | Nao prometer valores (→ secretaria) | Hub roteia → usa API Orchestra |
| Vygotsky (ZPD) | Zona proximal, scaffolding level | Nao classificar sem dados | Alimenta Socrates (calibrar hints) |
| Braille (a11y) | Preferencias acessibilidade | Nao desativar sem consentimento | Adapta output de todos agentes |

---

#### ADMIN PAGE-GUIDE

| Campo | Conteudo |
|-------|----------|
| **SCOPE** | Chat RAG sobre plataforma. DOM Bridge (preencher campos). Walkthroughs guiados. Sugestoes por rota. Stuck detection |
| **NAO FAZ** | NUNCA executa acoes destrutivas (deletar aluno, revogar permissao). NUNCA preenche campos sensiveis (CPF, password). NUNCA acessa dados de outros tenants |
| **Heuristics** | H1: RAG filtrado por rota (so contexto relevante). H2: Se intent match walkthrough → oferecer CTA. H3: 30s sem acao + campos required vazios → sugestao proativa. H4: Max 3 alertas por sessao |
| **Veto** | V1: NUNCA preencher campo sensivel (SENSITIVE_PATTERNS). V2: NUNCA executar sem confirmacao do usuario ("Posso preencher?"). V3: NUNCA inventar se RAG nao retornou contexto |
| **Output** | 1) Resposta RAG: "Para importar alunos, clique em Importar...". 2) Walkthrough: 4 steps com highlight DOM. 3) Fill: "Preenchi Nome e Email. CPF eh sensivel — digite voce." |
| **Handoff** | Se pergunta sobre aluno especifico → deep link para pagina do aluno. Se pergunta pedagogica → "Isso é com o coordenador" |
| **Anti-patterns** | Inventar funcionalidade que nao existe. Preencher sem perguntar. Responder sobre outro tenant |
| **Voice** | Profissional, eficiente, acolhedor. "Posso te ajudar com isso!" |

---

## 22. WORKFLOW COM GATES — Sistema Imunologico ORCH

> "Cada gate é um ponto de VETO — sem dados válidos, não avança."

### Pipeline do Hub (Gate em cada step)

```
MSG ALUNO
    │
    ▼
┌─────────┐
│ GATE 0  │ Auth check — aluno logado?
│ VETO:   │ Sem auth → 401
└────┬────┘
     ▼
┌─────────┐
│ GATE 1  │ Profile exists?
│ VETO:   │ Se nao → criar com defaults
└────┬────┘
     ▼
┌─────────┐
│ GATE 2  │ Quota check — empresa tem saldo AI?
│ VETO:   │ Sem quota → msg "limite atingido"
│ PV-FIX: │ 80% → warning proativo. 95% → urgent. 100% → block
└────┬────┘
     ▼
┌─────────┐
│ GATE 3  │ Intent detection — confidence >= 0.6?
│ VETO:   │ < 0.6 → pedir reformulacao (max 3x, depois generica)
│ PV-FIX: │ reformulation_count >= 3 → resposta generica + log
└────┬────┘
     ▼
┌─────────┐
│ GATE 4  │ SafeGuard safety scan — critical?
│ VETO:   │ Critical → acolhimento + escalar
│ PV-FIX: │ Se coordenador = null → fallback: admin tenant → email institucional
└────┬────┘
     ▼
┌─────────┐
│ GATE 5  │ Agent response — sucesso?
│ VETO:   │ Erro → fallback generico + log
│ PV-FIX: │ CIRCUIT BREAKER: >3 fallbacks em 5min → "serviço indisponível"
│         │ Para de chamar Gemini até recovery. Economiza token + não frustra
└────┬────┘
     ▼
  RESPONSE
  (SSE stream + action chips + XP)
```

### Pipeline do Assessment (Aristoteles)

```
SUBMISSION
    │
    ▼
┌─────────┐
│ GATE 0  │ Texto > 50 palavras?
│ VETO:   │ Muito curto → rejeitar
└────┬────┘
     ▼
  STAGE 1: Pre-processing (clean text)
     │
     ▼
┌─────────┐
│ GATE 1  │ Lingua detectada = pt-BR?
│ VETO:   │ Outra lingua → flag + continuar
│ PV-FIX: │ Se lingua ≠ esperada → quality prompt na lingua detectada
│         │ OU avisar: "Seu trabalho parece estar em {lang}, confirma?"
└────┬────┘
     ▼
  STAGE 2: Quality Assessment (5 dims)
     │
     ▼
┌─────────┐
│ GATE 2  │ Quality score > 0?
│ VETO:   │ Score 0 = possivel lixo → flag
└────┬────┘
     ▼
  STAGE 3: Plagiarism (Winnowing)
     │
     ▼
  STAGE 4: AI Detection (3 tiers)
     │
     ▼
┌─────────┐
│ GATE 3  │ 2+ metodos concordam?
│ VETO:   │ Se so 1 metodo flagou → "inconclusive"
└────┬────┘
     ▼
  STAGE 5: Stylometric Profile
     │
     ▼
  STAGE 6: Composite Score
     │
     ▼
┌─────────┐
│ GATE 4  │ Professor review required?
│ VETO:   │ Se plagiarism > 0.7 OU ai_suspected → OBRIGATORIO review
│ PV-FIX: │ BLOQUEIO FISICO: nota so liberada quando
│         │ professor_reviewed_at IS NOT NULL (DB constraint)
│         │ Sem review = nota nao aparece pro aluno. Impossibilita pular.
└────┬────┘
     ▼
  STAGE 7: Distribution
  (aluno: feedback | professor: relatorio completo)
```

### Pipeline do Daily Recap (Comenius)

```
CRON 06:05
    │
    ▼
┌─────────┐
│ GATE 0  │ Aluno tem conceitos em orch_concept_memory?
│ VETO:   │ Zero conceitos → skip (nao gerar recap vazio)
└────┬────┘
     ▼
  Ebbinghaus: selecionar top-5 (retention ASC)
     │
     ▼
┌─────────┐
│ GATE 1  │ Pelo menos 3 conceitos selecionados?
│ VETO:   │ < 3 → completar com conceitos recentes
└────┬────┘
     ▼
  Comenius: gerar questoes (Gemini)
     │
     ▼
┌─────────┐
│ GATE 2  │ Questoes validas? (tem correct_answer, nao duplicadas)
│ VETO:   │ Invalida → regenerar (max 2 tentativas)
└────┬────┘
     ▼
  INSERT orch_daily_recap + questions
     │
     ▼
  Aluno abre → responde → SM-2 update → XP
```

### Pipeline do Admin Chat

```
MSG STAFF
    │
    ▼
┌─────────┐
│ GATE 0  │ Auth + role check (staff/coordinator/teacher)?
│ VETO:   │ Sem permissao → 403
└────┬────┘
     ▼
  DOM scan (rota + campos visiveis)
     │
     ▼
  RAG search (filtrado por rota)
     │
     ▼
┌─────────┐
│ GATE 1  │ RAG retornou chunks relevantes?
│ VETO:   │ 0 chunks → responder "Nao tenho info sobre isso" (nao inventar)
└────┬────┘
     ▼
  Build context + Gemini chat
     │
     ▼
┌─────────┐
│ GATE 2  │ Resposta menciona acao destrutiva?
│ VETO:   │ "Deletar", "revogar" → "Voce precisa fazer isso manualmente"
│ PV-FIX: │ Regex expandido: /deletar|excluir|remover|apagar|revogar|
│         │ desativar|bloquear|resetar|formatar|limpar\s+dados/i
│         │ Checklist de sinonimos — Gemini pode usar variações
└────┬────┘
     ▼
  RESPONSE (SSE + action chips + walkthrough CTA)
```

---

## 23. HANDOFF MAP — Quem passa pra quem

```
                    ┌─────────────────────┐
                    │        HUB          │
                    │  (entry + exit)     │
                    └──┬──┬──┬──┬──┬──┬──┘
                       │  │  │  │  │  │
         ┌─────────────┘  │  │  │  │  └─────────────┐
         │    ┌───────────┘  │  │  └───────────┐     │
         │    │    ┌─────────┘  └─────────┐    │     │
         ▼    ▼    ▼                      ▼    ▼     ▼
      SOCRATES BLOOM COMENIUS         WEBER HEIMDALL DEWEY
         │      │      │                │      │      │
         │      │      │                │      │      │
    ┌────┴──────┴──────┴────────────────┴──────┴──────┘
    │         BACKGROUND (apos cada interacao)
    ▼
┌────────────────────────────────────────────────┐
│  GARDNER → Bourdieu.cognitive_profile          │
│  WITTGENSTEIN → Bourdieu.linguistic_profile    │
│  TAYLOR → Bourdieu.engagement_profile          │
│  SAFEGUARD → orch_safety_flag (se necessario)      │
│  SISIFO → +XP (orch_xp_transaction)            │
│  EBBINGHAUS → conceito registrado (se novo)    │
└──────────────────┬─────────────────────────────┘
                   │
                   ▼
              BOURDIEU (perfil central)
                   │
                   ▼
         ┌─────────┴─────────┐
         │                   │
     FOUCAULT (cron)     WEBER (cron)
     risk assessment     D7 consolidado
         │                   │
         ▼                   ▼
    ADMIN ALERTS      PROFESSOR DASHBOARD
```

**Regra de ouro:** Todo agente sabe DE QUEM recebe e PRA QUEM passa. Nenhum agente opera no vácuo.

---

## 24. PV AUDIT — CORREÇÕES APLICADAS (Pedro Valério, 2026-03-13)

> "Se o executor CONSEGUE fazer errado, o erro VAI acontecer."
> Audit: 9 RED corrigidos, 7 YELLOW corrigidos. Zero caminhos errados tolerados.

### 24.1 Nova Tabela: orch_interaction_log (Observabilidade)

```sql
-- PV-FIX: Rastreamento completo da jornada aluno → agente → resultado
-- Sem isso, debug é impossível e "o que não é vigiado não é realizado"
CREATE TABLE orch_interaction_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL,               -- correlação de todo o pipeline
  tenant_id       UUID NOT NULL,
  student_id      UUID,                         -- null para admin
  user_id         UUID,                         -- para admin
  conversation_id UUID,
  message_preview VARCHAR(200),                 -- primeiros 200 chars (sem dados sensíveis)

  -- Pipeline tracking
  intent_detected VARCHAR(50),
  intent_confidence NUMERIC(3,2),
  agent_routed    VARCHAR(50),                  -- socrates, freire, comenius, etc.
  pipeline_steps  JSONB DEFAULT '[]'::jsonb,    -- [{step, status, duration_ms, error?}]

  -- Background updates tracking
  background_results JSONB DEFAULT '{}'::jsonb, -- {gardner: 'ok', sisifo: 'ok', freud: 'skipped'}

  -- Outcome
  response_type   VARCHAR(30),                  -- 'success', 'fallback', 'circuit_open', 'reformulation'
  tokens_used     INTEGER DEFAULT 0,
  duration_ms     INTEGER,
  error_message   TEXT,

  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_interaction_request ON orch_interaction_log(request_id);
CREATE INDEX idx_interaction_student ON orch_interaction_log(student_id, created_at DESC);
CREATE INDEX idx_interaction_errors ON orch_interaction_log(response_type)
  WHERE response_type IN ('fallback', 'circuit_open');
```

**TOTAL ATUALIZADO: 28 tabelas novas** + 11 do Leo = **39 tabelas no ecossistema ORCH**.

### 24.2 Circuit Breaker — GoogleGeminiService

```typescript
// circuit-breaker.ts — Protege contra Gemini outage
// PV-FIX: Single point of failure mata 100% do ORCH sem isso

interface CircuitState {
  status: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailure: Date | null;
  openedAt: Date | null;
}

const FAILURE_THRESHOLD = 5;      // falhas para abrir circuito
const WINDOW_MS = 60_000;         // janela de 1 minuto
const COOLDOWN_MS = 300_000;      // 5 min antes de tentar de novo (half-open)

const state: CircuitState = {
  status: 'closed',
  failureCount: 0,
  lastFailure: null,
  openedAt: null,
};

export function canCallGemini(): boolean {
  if (state.status === 'closed') return true;

  if (state.status === 'open') {
    // Cooldown expirou? → half-open (tenta 1 chamada)
    if (Date.now() - state.openedAt!.getTime() > COOLDOWN_MS) {
      state.status = 'half-open';
      return true;
    }
    return false; // circuito aberto, não chamar
  }

  // half-open: permite 1 chamada de teste
  return true;
}

export function recordSuccess(): void {
  state.status = 'closed';
  state.failureCount = 0;
}

export function recordFailure(): void {
  state.failureCount++;
  state.lastFailure = new Date();

  if (state.status === 'half-open') {
    // Falhou no teste → reabrir
    state.status = 'open';
    state.openedAt = new Date();
    return;
  }

  if (state.failureCount >= FAILURE_THRESHOLD) {
    state.status = 'open';
    state.openedAt = new Date();
    // Log: circuito abriu — Gemini indisponível
    console.error('[CIRCUIT-BREAKER] Gemini circuit OPEN — all AI features degraded');
  }
}

export function getCircuitStatus(): CircuitState {
  return { ...state };
}
```

**Uso no GoogleGeminiService:**
```typescript
async chat(prompt: string): Promise<string> {
  if (!canCallGemini()) {
    throw new ServiceUnavailableError(
      'Serviço de IA temporariamente indisponível. Tente novamente em alguns minutos.'
    );
  }
  try {
    const result = await this.gemini.chat(prompt);
    recordSuccess();
    return result;
  } catch (err) {
    recordFailure();
    throw err;
  }
}
```

### 24.3 Quota Proativa — Alertas em 80% e 95%

```typescript
// quota-monitor.ts — PV-FIX: aluno não pode descobrir que ficou sem quota no meio de uma interação

interface QuotaStatus {
  used: number;
  limit: number;
  percentage: number;
  level: 'normal' | 'warning' | 'urgent' | 'blocked';
}

function checkQuota(tenantId: string): QuotaStatus {
  const { used, limit } = getTenantQuota(tenantId);
  const pct = (used / limit) * 100;

  if (pct >= 100) return { used, limit, percentage: pct, level: 'blocked' };
  if (pct >= 95)  return { used, limit, percentage: pct, level: 'urgent' };
  if (pct >= 80)  return { used, limit, percentage: pct, level: 'warning' };
  return { used, limit, percentage: pct, level: 'normal' };
}

// No Hub pipeline, Gate 2:
const quota = checkQuota(tenant_id);
if (quota.level === 'blocked') {
  return res.status(429).json({ error: 'ai_quota_exceeded' });
}
if (quota.level === 'urgent') {
  // Incluir warning na response — aluno/admin sabe que está acabando
  responseMetadata.quotaWarning = `Seu plano tem ${100 - Math.floor(quota.percentage)}% de uso AI restante`;
}
if (quota.level === 'warning') {
  // Alerta para admin do tenant
  insertAdminAlert(tenant_id, {
    alert_type: 'quota_warning',
    category: 'system',
    severity: 'warning',
    title: `Quota AI em ${Math.floor(quota.percentage)}%`,
    description: `O tenant atingiu ${Math.floor(quota.percentage)}% da quota AI mensal.`,
    target_roles: ['admin'],
  });
}
```

### 24.4 Escalamento de Alertas Não Lidos

```typescript
// alert-escalation.ts — PV-FIX: coordenador offline = alerta perdido
// Cron: a cada 6 horas

async function escalateUnreadAlerts(): Promise<void> {
  // Buscar alertas critical não lidos há mais de 24h
  const staleAlerts = await db.query(`
    SELECT * FROM orch_admin_alert
    WHERE severity IN ('critical', 'urgent')
      AND read_by = '{}'
      AND dismissed_by = '{}'
      AND escalated_at IS NULL
      AND created_at < NOW() - INTERVAL '24 hours'
  `);

  for (const alert of staleAlerts.rows) {
    // Cadeia de escalamento:
    // 1. Coordenador do curso → 2. Admin do tenant → 3. Email institucional
    const escalationTarget = await findEscalationTarget(alert.tenant_id, alert.target_roles);

    if (escalationTarget.type === 'user') {
      // Criar novo alerta para o escalation target
      await db.query(`
        INSERT INTO orch_admin_alert (tenant_id, alert_type, category, severity, title, description, target_user_id)
        VALUES ($1, 'escalated_' || $2, $3, 'critical',
                '[ESCALADO] ' || $4, $5 || E'\n\nAlerta original não lido há 24h.', $6)
      `, [alert.tenant_id, alert.alert_type, alert.category, alert.title, alert.description, escalationTarget.userId]);
    } else if (escalationTarget.type === 'email') {
      // Fallback final: email institucional
      await sendEscalationEmail(escalationTarget.email, alert);
    }

    // Marcar como escalado
    await db.query(`
      UPDATE orch_admin_alert SET escalated_at = NOW(), escalated_to = $1 WHERE id = $2
    `, [escalationTarget.userId, alert.id]);
  }
}
```

### 24.5 Health Check de Agentes

```typescript
// agent-health-check.ts — PV-FIX: "o que não é vigiado não é realizado"
// Cron: Daily 05:00

interface AgentHealth {
  agent: string;
  lastActivity: Date | null;
  status: 'healthy' | 'degraded' | 'dead';
  details: string;
}

async function checkAgentHealth(): Promise<AgentHealth[]> {
  const agents = [
    { name: 'hub',         query: `SELECT MAX(created_at) FROM orch_interaction_log WHERE agent_routed IS NOT NULL` },
    { name: 'ebbinghaus',  query: `SELECT MAX(updated_at) FROM orch_concept_memory` },
    { name: 'comenius',    query: `SELECT MAX(created_at) FROM orch_daily_recap` },
    { name: 'taylor',      query: `SELECT MAX(snapshot_date) FROM orch_engagement_snapshot` },
    { name: 'foucault',    query: `SELECT MAX(assessed_at) FROM orch_risk_assessment` },
    { name: 'sisifo',      query: `SELECT MAX(created_at) FROM orch_xp_transaction` },
    { name: 'weber',       query: `SELECT MAX(generated_at) FROM orch_d7_report` },
    { name: 'aristoteles', query: `SELECT MAX(completed_at) FROM orch_assessment` },
    { name: 'circuit_breaker', query: null }, // check in-memory state
  ];

  const results: AgentHealth[] = [];

  for (const agent of agents) {
    if (!agent.query) {
      // Circuit breaker: check in-memory
      const cbStatus = getCircuitStatus();
      results.push({
        agent: agent.name,
        lastActivity: cbStatus.lastFailure,
        status: cbStatus.status === 'open' ? 'dead' : 'healthy',
        details: `Circuit: ${cbStatus.status}, failures: ${cbStatus.failureCount}`,
      });
      continue;
    }

    const { rows } = await db.query(agent.query);
    const lastActivity = rows[0]?.max;
    const hoursSince = lastActivity
      ? (Date.now() - new Date(lastActivity).getTime()) / 3_600_000
      : Infinity;

    results.push({
      agent: agent.name,
      lastActivity,
      status: hoursSince > 48 ? 'dead' : hoursSince > 24 ? 'degraded' : 'healthy',
      details: lastActivity ? `Last activity: ${hoursSince.toFixed(1)}h ago` : 'No activity ever',
    });
  }

  // Se qualquer agente está dead → alerta pro admin
  const deadAgents = results.filter(a => a.status === 'dead');
  if (deadAgents.length > 0) {
    await insertAdminAlert({
      alert_type: 'agent_health',
      category: 'system',
      severity: 'critical',
      title: `${deadAgents.length} agente(s) ORCH sem atividade`,
      description: deadAgents.map(a => `${a.agent}: ${a.details}`).join('\n'),
      target_roles: ['admin'],
    });
  }

  return results;
}
```

### 24.6 Assessment — Bloqueio Físico de Review

```sql
-- PV-FIX: nota NÃO pode ser liberada sem professor revisar quando requires_review = true
-- Adicionar na tabela orch_assessment:

ALTER TABLE orch_assessment ADD COLUMN requires_review BOOLEAN DEFAULT false;
ALTER TABLE orch_assessment ADD COLUMN professor_reviewed_at TIMESTAMPTZ;
ALTER TABLE orch_assessment ADD COLUMN professor_reviewer_id UUID;

-- Constraint: se requires_review, professor DEVE ter revisado antes de liberar
ALTER TABLE orch_assessment ADD CONSTRAINT chk_review_required
  CHECK (
    requires_review = false
    OR professor_reviewed_at IS NOT NULL
  );

-- Na query de notas visíveis ao aluno:
-- SELECT * FROM orch_assessment
-- WHERE student_id = $1
--   AND status = 'completed'
--   AND (requires_review = false OR professor_reviewed_at IS NOT NULL)
```

### 24.7 Zodiac Profile — REMOVIDO ✅

```
DECISÃO: REMOVER (Steven, 2026-03-13)

orch_zodiac_profile eliminado do schema.
Behavioral traits cobertos por Bourdieu (archetype) + Gardner (cognitive).
Se birth_date for necessário no futuro, adicionar como campo em
orch_student_profile — não como tabela separada.
```

### 24.8 Resumo das Correções

| # | Correção | Tipo | Seção Afetada |
|---|----------|------|---------------|
| 1 | NOT NULL + CHECK constraint no archetype | DB constraint | 4.1 |
| 2 | Quota proativa 80%/95%/100% | Automação | 6.1 Gate 2, 24.3 |
| 3 | Max 3 reformulações + resposta genérica | Bloqueio | 6.1 Step 4, Gate 3 |
| 4 | Fallback escalamento SafeGuard (coord=null) | Automação | Gate 4, Foucault |
| 5 | Circuit breaker no Gemini | Automação | 24.2 |
| 6 | Background updates independentes (allSettled) | Automação | 6.1 Step 9 |
| 7 | Trigger automático conceito → Ebbinghaus | Bloqueio | 6.1 Step 9, Socrates |
| 8 | Assessment língua ≠ esperada | UX | Assessment Gate 1 |
| 9 | Review obrigatório = DB constraint | DB constraint | 24.6 |
| 10 | Admin regex expandido ações destrutivas | Segurança | Admin Gate 2 |
| 11 | Alertas persistidos + escalamento 24h | Automação | 24.4 |
| 12 | Batch Comenius 50 + skip + fallback | Automação | Cron Jobs |
| 13 | Health check de agentes | Automação | 24.5 |
| 14 | orch_interaction_log (observabilidade) | DB + Logging | 24.1 |
| 15 | Zodiac: decisão pendente (recomendo remover) | Arquitetura | 24.7 |
| 16 | Cron circuit breaker reset | Automação | Cron Jobs |

**Tabelas adicionadas:** 1 (orch_interaction_log)
**Colunas adicionadas:** 3 (orch_assessment: requires_review, professor_reviewed_at, professor_reviewer_id)
**Colunas adicionadas:** 2 (orch_admin_alert: escalated_at, escalated_to)
**Constraints adicionados:** 2 (chk_archetype, chk_review_required)
**Índices adicionados:** 3 (interaction_log x3)
**Crons adicionados:** 2 (health check 05:00, circuit breaker hourly)

---

## 25. RECOMENDAÇÕES TEÓRICAS — Audit Epistêmico (Squad Epistemicos, 2026-03-13)

> Nous, Canon, Arche, Kritik e Epistemon auditaram os 20 agentes ORCH.
> 3 renomeações aplicadas (Freire→Bloom, Freud→SafeGuard, Gardner alinhado a MI).
> 9 lacunas teóricas identificadas. 5 para o aluno, 4 para o staff.

### 25.1 Renomeações Aplicadas

| Original | Novo | Justificativa |
|----------|------|---------------|
| **Freire** | **Bloom** | Paulo Freire rejeitaria avaliação quantitativa (*Pedagogia do Oprimido* critica educação bancária). Benjamin Bloom (1913-1999) inventou mastery learning e taxonomia educacional — perfeito para "quanto falta pra dominar" |
| **Freud** | **SafeGuard** | Safety scan é triagem clínica, não psicanálise. Freud é cientificamente contestado (Popper). Nome funcional evita liability e confusão epistemológica |
| **Gardner** | **Gardner** (alinhado) | Implementação mudou de Felder-Silverman (learning styles — contestado por Pashler 2008) para Multiple Intelligences real (Gardner 1983). Eixo: `dominant_intelligences`, não `felder_silverman` |

### 25.2 Lacuna 1: Metacognição — "O aluno sabe que não sabe?"

**Teoria:** Flavell (1979) — metacognição. Schraw & Dennison (1994) — MAI.

**Problema:** ORCH mede o que o aluno SABE mas nunca pergunta o que ele ACHA que sabe.

**Implementação:**
```
Antes do recap Comenius: "De 1 a 5, quão confiante você está sobre [conceito]?"
PV-FIX: Chip OBRIGATÓRIO — quiz NÃO inicia sem selecionar confiança (1 tap, 0 fricção)
Após recap: calibration_score = |confiança - performance|

Novos campos em orch_concept_memory:
  metacognitive_confidence  NUMERIC(2,1)  -- auto-avaliação 1-5
  calibration_score         NUMERIC(3,2)  -- |confiança - performance|

Heurísticas derivadas:
  Confiança ALTA + acerto BAIXO = Dunning-Kruger → Sócrates desafia mais
  Confiança BAIXA + acerto ALTO = Impostor → tom mais encorajador
```

**Custo:** Zero tokens. 1 pergunta. **Fase:** F2.

### 25.3 Lacuna 2: Autorregulação — "O aluno gerencia seu estudo?"

**Teoria:** Zimmerman (2002) — Self-Regulated Learning (SRL). 3 fases: Forethought → Performance → Self-reflection. Pintrich (2000) — SRL em 4 áreas.

**Problema:** ORCH faz tudo pelo aluno. Ebbinghaus agenda, Comenius gera quiz, Sócrates tutora. Aluno é passivo.

**Implementação:**
```
Hub → antes de rotear (1x por DIA por aluno, não por sessão):
  "Qual seu foco hoje?" (chip de ação, não campo aberto)
  Opções: [Revisar matéria] [Tirar dúvida] [Estudar pra prova] [Explorar]
  PV-FIX: Flag `ai_conversation.forethought_asked_today` — reset pelo cron diário
  Definição de sessão: 1x/dia. Se aluno abre/fecha 5x, pergunta só na primeira.

Hub → no final da sessão (2 min sem interagir OU fechar tab):
  "Isso te ajudou?" (1 tap: 👍 / 👎)
  PV-FIX: 1x/sessão no FINAL, não a cada 5 interações. Simples, não interrompe.

Novo campo em orch_student_profile.engagement_profile:
  "self_regulation_level": "passive|reactive|active|proactive"

Heurística:
  Se aluno NUNCA define foco → passive
  Se define mas não segue → reactive
  Se define e segue → active
  Se define, segue e avalia → proactive
```

**Custo:** Zero tokens. 1 chip. **Fase:** F5.

### 25.4 Lacuna 3: Transferência — "O aluno aplica fora do contexto?"

**Teoria:** Perkins & Salomon (1992) — near vs far transfer. Bransford et al. (2000) — *How People Learn*.

**Problema:** Sócrates tutora DENTRO do conteúdo. Ebbinghaus revisa O MESMO conceito. Nenhum agente testa aplicação em domínio diferente.

**Implementação:**
```
Heurística Sócrates H7:
  Se hint_count para conceito X >= 5 E quality média >= 4
  → propor problema de TRANSFER (domínio diferente, mesmo conceito)
  Exemplo: "Você entendeu log₂(8). Agora: pH = -log[H⁺]. Se [H⁺] = 0.001, pH = ?"
  PV-FIX: Domínios de transfer PRÉ-CONFIGURADOS por curso (não deixar Gemini inventar):
    Engenharia → física, química, economia
    Administração → estatística, finanças, logística
    Direito → lógica formal, hermenêutica, casos reais
    Saúde → bioquímica, farmacologia, epidemiologia
  Config: campo `transfer_domains TEXT[]` na tabela do curso/disciplina

Novo campo em orch_concept_memory:
  transfer_validated  BOOLEAN DEFAULT false
  transfer_domain     VARCHAR(100)  -- ex: "química - pH"

Se acerta → conceito marcado como transfer_validated = true
```

**Custo:** 1 chamada Gemini a cada 5 conceitos dominados. **Fase:** F2.

### 25.5 Lacuna 4: Motivação Intrínseca (SDT) — "Por que o aluno QUER aprender?"

**Teoria:** Deci & Ryan (1985, 2000) — Self-Determination Theory. 3 necessidades: **Autonomia** (eu escolho), **Competência** (eu consigo), **Pertencimento** (eu pertenço). Ryan & Deci (2017) — SDT em EdTech: retenção 2-3x maior que gamificação pura.

**Problema:** Sísifo é 100% motivação EXTRÍNSECA (XP, badges, streaks). SDT mostra que recompensas extrínsecas podem DESTRUIR motivação intrínseca (overjustification effect).

**Implementação:**
```
Heurísticas Sísifo:
  H5: A cada 5 interações, oferecer ESCOLHA (autonomia)
      "Quer revisar logaritmos ou geometria?"
  H6: Feedback de competência = progresso REAL > pontos abstratos
      "Você domina 23/40 conceitos do módulo" > "+5 XP"
  H7: Se engagement declinando E XP alto → suspeitar overjustification
      → reduzir saliência de XP, aumentar feedback de competência

Novo campo em orch_student_profile.gamification_profile:
  "motivation_balance": {
    "intrinsic_signals": 0,   -- escolhas ativas, estudo sem XP
    "extrinsic_signals": 0,   -- só age quando tem XP/badge
    "ratio": null              -- intrinsic / (intrinsic + extrinsic)
  }
```

**Custo:** Zero tokens. Lógica no Sísifo. **Fase:** F2.

### 25.6 Lacuna 5: Aprendizagem Social — "O aluno aprende com pares?"

**Teoria:** Bandura (1977) — Social Learning Theory. Vygotsky — ZPD na interação social.

**Problema:** ORCH é 100% aluno ↔ IA. Nenhum agente facilita aluno ↔ aluno.

**Implementação:**
```
Heurística Comenius H5:
  Se 3+ alunos no mesmo curso erraram mesmo conceito no recap
  → sugerir: "3 colegas também revisando logaritmos. Estudar juntos?"
  → Sísifo: +10 XP por participação social

  PV-FIX: DEPENDÊNCIA EXPLÍCITA — requer módulo de fórum social (NÃO EXISTE no Cogedu).
  Alternativa mínima (zero infra): sugerir estudo em grupo via canal da turma:
    "3 colegas também revisando logaritmos. Que tal combinar um estudo em grupo
     no grupo da turma?"
  → Não cria thread, não precisa de fórum. Apenas sugere.

Heurística Dewey:
  Case discussion = entre ALUNOS, mediada pela IA (não IA respondendo sozinha)
  PV-FIX: V1 = IA media. V2+ = entre alunos (quando fórum existir)
```

**Custo:** V1 = zero (sugestão). V2+ = módulo fórum. **Fase:** F7+ (V1 pode entrar em F2 como sugestão).

### 25.7 Lacuna 6: Decisão Pedagógica Assistida — "O professor sabe o que FAZER?"

**Teoria:** Mandinach & Gummer (2016) — Data Literacy for Teachers. Carnegie Learning MATHia — dashboard que mostra "confuso AGORA".

**Problema:** Weber entrega D7 com 20 métricas. Professor não tem tempo de interpretar 240 Raio-X.

**Implementação:**
```
Heurísticas Weber:
  H4: D7 SEMPRE inclui "Top 5 Prioridades da Semana" com ação sugerida
  H5: Ação = verbo imperativo + tempo estimado
      "Conversar com Maria (5 min) — engagement caiu 40% em 2 semanas"
      NÃO: "Maria tem engagement score 34, trend declining, risk yellow"
  H6: Se nenhum aluno está em risco → dizer "Sua turma está bem esta semana"
      (não forçar ação quando não precisa)
```

**Custo:** Zero — muda prompt do Weber. **Fase:** F6.

### 25.8 Lacuna 7: Feedback Staff → Sistema (Double-Loop)

**Teoria:** Argyris & Schön (1978) — Double-loop learning. Single-loop: ajusta output. Double-loop: questiona pressupostos.

**Problema:** Professor NUNCA alimenta o sistema de volta. Loop aberto.

**Implementação:**
```sql
CREATE TABLE orch_staff_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  staff_id          UUID NOT NULL,
  agent_source      VARCHAR(50) NOT NULL,    -- weber, foucault, bloom, aristoteles
  recommendation_id UUID,
  student_id        UUID,
  action            VARCHAR(20) NOT NULL,    -- agreed, dismissed, modified, irrelevant
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_staff_feedback_agent ON orch_staff_feedback(agent_source, action);
```

```
Endpoint: POST /orch-ava/staff-feedback
  { agentId, recommendationId, action, notes? }

No D7: cada recomendação tem botões [Concordo] [Discordo] [Irrelevante]
Feedback agregado: quais recomendações são sistematicamente ignoradas?
→ ajustar modelo (double-loop)

PV-FIX: Feedback PASSIVO além do ativo (não depender de boa vontade):
  Medir automaticamente:
    - Professor abriu o D7? (timestamp)
    - Quanto tempo ficou? (session duration)
    - Clicou em algum aluno depois? (click tracking)
  Se D7 ignorado 3 semanas seguidas:
    → alerta pro coordenador: "Professor X não acessa relatórios"
  Botões [Concordo/Discordo] = bônus, não fonte primária
```

**Tabela nova:** orch_staff_feedback. **Fase:** F6.

### 25.9 Lacuna 8: Contexto Institucional — Tenant Pedagógico

**Teoria:** Bronfenbrenner (1979) — Modelo Ecológico. Aluno existe em camadas.

**Problema:** ORCH trata todo tenant igual. Faculdade noturna (trabalhadores 30+) ≠ universidade integral (jovens 18-22).

**Implementação:**
```
PV-FIX: Campo `pedagogical_config JSONB` na tabela `tenant` existente (migration F1).
Endpoint: PUT /admin/tenant/pedagogy (admin only).
Default = null → usar defaults genéricos (recap 06:05, gamification high, etc.)

Default INTELIGENTE (se tenant não configurou):
  Após 2 semanas de uso → analisar horário de login dos alunos
  → sugerir automaticamente: "Seus alunos logam mais às 21h. Recap às 21:00?"
  → INSERT orch_admin_alert (type='tenant_config_suggestion')

Schema:
{
  "institutional_type": "noturno_trabalhador | integral | ead | hibrido",
  "avg_student_age": 28,
  "primary_challenges": ["fadiga", "tempo_limitado", "gap_academico"],
  "pedagogical_config": {
    "recap_cron_hour": 22,        -- não 06:05 pra quem trabalha de dia
    "session_max_minutes": 10,     -- micro-sessões
    "tone_default": "pragmatic",   -- menos socrático, mais direto
    "gamification_intensity": "low", -- adulto trabalhador ≠ jovem gamer
    "social_features": false        -- noturno tem pouca interação entre pares
  }
}
```

```sql
-- Migration F1: adicionar config pedagógica ao tenant
ALTER TABLE tenant ADD COLUMN pedagogical_config JSONB DEFAULT NULL;
-- NULL = usar defaults genéricos do sistema
```

**Impacto imediato:** Comenius cron configurável por tenant. **Fase:** F1.

### 25.10 Lacuna 9: Literacy de Dados — Walkthroughs Interpretativos

**Teoria:** Fullan (2001) — *The New Meaning of Educational Change*. Tecnologia muda, prática não.

**Problema:** Admin Page-Guide ensina a NAVEGAR, não a INTERPRETAR dados.

**Implementação:**
```yaml
# Novos walkthroughs para seed (orch_admin_walkthrough):

- id: interpret-d7
  title: "Como ler o relatório semanal do aluno"
  route: /teacher/reports
  steps:
    - { target: "#engagement-score", text: "Este número (0-100) mostra quão ativo o aluno está. Abaixo de 40 = risco de evasão." }
    - { target: "#risk-level", text: "Cores: verde = ok, amarelo = monitorar, laranja = conversar, vermelho = urgente." }
    - { target: "#top-priorities", text: "Estas são as 3 ações mais importantes pra você esta semana." }

- id: respond-to-risk
  title: "O que fazer com alunos em risco"
  route: /coordinator/risk
  steps:
    - { target: "#risk-map", text: "Este mapa mostra TODOS os alunos. Clique nos vermelhos primeiro." }
    - { target: "#intervention-suggest", text: "O sistema sugere ação, mas VOCÊ decide. Clique 'Concordo' ou 'Discordo'." }

- id: use-bloom-xray
  title: "Como usar o Raio-X para planejar aula"
  route: /teacher/student/:id
  steps:
    - { target: "#mastery-gap", text: "Estes conceitos ainda não foram dominados. Foque neles na próxima aula." }
    - { target: "#retention-curve", text: "Estes conceitos estão sendo esquecidos. Uma revisão rápida resolve." }
```

**Custo:** Seed data. **Fase:** F4.

### 25.11 Freire e Bourdieu no ORCH — Onde REALMENTE contribuem

> "Se tiramos Freire do nome do agente, onde ele DEVERIA estar?"

#### Paulo Freire — A Consciência Crítica do Sistema

Freire não deveria nomear um agente. Freire deveria ser uma **CAMADA TRANSVERSAL** — um princípio que atravessa TODOS os agentes:

| Princípio Freiriano | Como aplica no ORCH | Onde |
|---------------------|---------------------|------|
| **Dialogismo** (não monólogo) | Sócrates pergunta ANTES de responder. Hub oferece chips de ação (aluno escolhe próximo passo). Autorregulação: "qual seu foco hoje?" | Hub, Sócrates, Sísifo |
| **Práxis** (ação + reflexão) | Self-reflection pós-sessão ("isso te ajudou?"). Staff feedback no D7. Metacognição (confiança vs performance) | Hub, Weber, Comenius |
| **Conscientização** | Bloom mostra ao aluno ONDE está e PARA ONDE pode ir — mas o aluno DECIDE o caminho. Study plan = sugestão, não imposição | Bloom |
| **Anti-educação-bancária** | NENHUM agente "deposita" conhecimento. Sócrates guia, não entrega. Comenius revisa, não leciona. Dewey problematiza, não resolve | Todos |
| **Autonomia** | SDT no Sísifo (escolha). Autorregulação (foco). Transfer (aplicar por conta própria) | Sísifo, Hub |

**Implementação:** Adicionar em CADA agente no Quality Framework (Seção 21):
```
| **Princípio Freiriano** | [como este agente NÃO faz educação bancária] |
```

#### Pierre Bourdieu — Já Está (e está certo)

Bourdieu como nome do perfil central É defensável porque:
1. O perfil mapeia CAPITAL CULTURAL (conceito original de Bourdieu)
2. O campo `sociocultural` com `first_generation`, `digital_literacy` é Bourdieu puro
3. A ideia de que o contexto de origem IMPORTA para a adaptação pedagógica = habitus

**Mas deveria ir além:**
- Bourdieu hoje é só perfil estático. Deveria detectar **reprodução de desigualdade**
- Se alunos de primeira geração sistematicamente têm engagement menor → o sistema deve ALERTAR o coordenador que há padrão socioestrutural, não individual
- Foucault (risco) + Bourdieu (capital) = análise de QUEM está em risco e POR QUE (não só "score 7.2")

**Implementação:**
```
Heurística Foucault H5 (nova):
  Se alunos com first_generation=true têm risk_score médio > alunos com first_generation=false:
  → Alerta ao coordenador: "Padrão detectado: alunos de primeira geração têm risco 2x maior.
     Isso pode indicar necessidade de suporte institucional (tutoria, bolsa, mentoria),
     não falha individual."
  → Isso é Bourdieu + Freire operando juntos: conscientizar sobre reprodução estrutural
```

### 25.12 Sistema de Recomendação de Agentes por Pensadores

> "E se criássemos um sistema de recomendação de agentes com base em outros pensadores?"

Para cada desafio educacional detectado, o sistema sugere QUAL FRAMEWORK TEÓRICO aplicar:

```
┌─────────────────────────────────────────────────────────────┐
│           RECOMMENDER: Pensador → Ação                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PROBLEMA DETECTADO           PENSADOR          AGENTE      │
│  ─────────────────           ─────────          ──────      │
│  Aluno não sabe que           Flavell           Comenius    │
│  não sabe                     (metacognição)    (recap +    │
│                                                  confiança) │
│                                                             │
│  Aluno sabe mas               Perkins &         Sócrates    │
│  não aplica                   Salomon           (transfer   │
│                               (transferência)    problems)  │
│                                                             │
│  Aluno estuda só              Deci & Ryan       Sísifo      │
│  pelo XP                      (SDT)             (rebalance  │
│                                                  motivação) │
│                                                             │
│  Aluno isolado,               Bandura           Comenius +  │
│  sem pares                    (social learning)  Dewey      │
│                                                  (grupo)    │
│                                                             │
│  Turma com padrão             Bourdieu          Foucault    │
│  socioeconômico               (reprodução)      (alerta     │
│  no risco                                        estrutural)│
│                                                             │
│  Professor ignora             Argyris & Schön   Weber       │
│  recomendações                (double-loop)     (feedback   │
│                                                  loop)      │
│                                                             │
│  Aluno passivo,               Zimmerman         Hub         │
│  não planeja                  (SRL)             (forethought│
│                                                  prompt)    │
│                                                             │
│  Professor não sabe           Mandinach         Admin       │
│  ler dados                    (data literacy)   (walkthrough│
│                                                  interpret.)│
│                                                             │
│  Aluno maduro,                Knowles           Hub         │
│  trabalhador                  (andragogia)      (tenant     │
│                                                  config)    │
│                                                             │
│  Conceito dominado            Csikszentmihalyi  Sócrates    │
│  mas sem flow                 (flow)            (challenge  │
│                                                  calibrado) │
└─────────────────────────────────────────────────────────────┘
```

**Implementação futura (F8+):**
```typescript
// theorist-recommender.ts
// Detecta padrão → sugere framework → sugere ação do agente

interface TheoristRecommendation {
  pattern_detected: string;
  theorist: string;
  work: string;
  agent: string;
  action: string;
  confidence: number;
}

const RECOMMENDATIONS: TheoristRecommendation[] = [
  {
    pattern_detected: 'high_confidence_low_performance',
    theorist: 'Flavell (1979)',
    work: 'Metacognition and Cognitive Monitoring',
    agent: 'comenius',
    action: 'Adicionar pergunta de confiança antes do quiz',
    confidence: 0.9,
  },
  {
    pattern_detected: 'mastery_without_transfer',
    theorist: 'Perkins & Salomon (1992)',
    work: 'Transfer of Learning',
    agent: 'socrates',
    action: 'Propor problema de domínio diferente',
    confidence: 0.85,
  },
  {
    pattern_detected: 'extrinsic_only_motivation',
    theorist: 'Deci & Ryan (2000)',
    work: 'Self-Determination Theory',
    agent: 'sisifo',
    action: 'Reduzir saliência XP, aumentar feedback competência',
    confidence: 0.8,
  },
  {
    pattern_detected: 'socioeconomic_risk_pattern',
    theorist: 'Bourdieu (1979)',
    work: 'La Distinction + Reproduction',
    agent: 'foucault',
    action: 'Alertar coordenador sobre padrão estrutural',
    confidence: 0.75,
  },
  {
    pattern_detected: 'staff_ignores_recommendations',
    theorist: 'Argyris & Schön (1978)',
    work: 'Organizational Learning',
    agent: 'weber',
    action: 'Ativar double-loop: questionar pressupostos do modelo',
    confidence: 0.7,
  },
];
```

### 25.13 Resumo de Impacto

| Item | Tabelas | Campos | Endpoints | Fase |
|------|---------|--------|-----------|------|
| Renomeações (Bloom, SafeGuard, Gardner MI) | 0 | 3 alterados | 0 | Já aplicado |
| Metacognição | 0 | +2 em concept_memory | 0 | F2 |
| Autorregulação | 0 | +1 em engagement_profile | 0 | F5 |
| Transferência | 0 | +2 em concept_memory | 0 | F2 |
| SDT / Motivação | 0 | +1 em gamification_profile | 0 | F2 |
| Aprendizagem Social | 0 | 0 | 0 | F7+ |
| Ações no D7 | 0 | 0 | 0 | F6 |
| Staff Feedback | +1 (orch_staff_feedback) | — | +1 | F6 |
| Tenant Pedagógico | +1 config ou campo | — | 0 | F1 |
| Walkthroughs Interpretativos | 0 | 0 | 0 (seed) | F4 |
| Freire como camada transversal | 0 | 0 | 0 | Documentação |
| Bourdieu → reprodução estrutural | 0 | 0 | 0 | F3 (heurística Foucault) |
| Recommender por pensadores | 0 | 0 | 0 | F8+ |

**TOTAL:** +1 tabela, ~9 campos, +1 endpoint, 3 walkthroughs, 1 camada transversal.
Impacto teórico: **de sistema behaviorista para sistema humanista com fundamentação epistemológica.**
