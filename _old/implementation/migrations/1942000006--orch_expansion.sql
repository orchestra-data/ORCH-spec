-- ========================================================================
-- Migration 1942000006: ORCH Expansion (EPIC-07)
-- Admission, onboarding, case studies, safety, ZPD, accessibility
-- ========================================================================

-- ========================================================================
-- orch_admission_lead — Heimdall PRE mode: leads from landing page chat
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admission_lead (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name TEXT,
    email TEXT,
    phone TEXT,
    source VARCHAR(50) DEFAULT 'organic' CHECK (source IN ('organic', 'referral', 'ad', 'event')),
    interest_area TEXT,
    education_level VARCHAR(50),
    lead_score REAL DEFAULT 0,
    score_engagement REAL DEFAULT 0,
    score_fit REAL DEFAULT 0,
    score_urgency REAL DEFAULT 0,
    score_completeness REAL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'enrolled', 'lost')),
    conversation_id UUID,
    messages_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admission_lead_tenant_status
    ON orch_admission_lead (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_admission_lead_score
    ON orch_admission_lead (lead_score DESC);

CREATE INDEX IF NOT EXISTS idx_admission_lead_email
    ON orch_admission_lead (email) WHERE email IS NOT NULL;

COMMENT ON TABLE orch_admission_lead IS 'Heimdall PRE mode — leads captured from unauthenticated landing page chat, scored 0-100';

-- ========================================================================
-- orch_onboarding_progress — Heimdall POST mode: 30-day student onboarding
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID NOT NULL,
    checklist JSONB DEFAULT '{
        "profile_complete": false,
        "first_login": false,
        "watched_intro": false,
        "explored_courses": false,
        "first_ai_interaction": false,
        "first_assignment": false,
        "joined_chat": false,
        "completed_recap": false,
        "met_coordinator": false,
        "feedback_given": false
    }'::jsonb,
    completed_count INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 10,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    last_checkin TIMESTAMPTZ,
    next_checkin TIMESTAMPTZ,

    CONSTRAINT fk_onboarding_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT uq_onboarding_student_tenant UNIQUE (student_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tenant
    ON orch_onboarding_progress (tenant_id);

COMMENT ON TABLE orch_onboarding_progress IS 'Heimdall POST mode — 10-item gamified onboarding checklist for first 30 days';

-- ========================================================================
-- orch_case_study — Dewey: AI-generated case studies from lesson content
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_case_study (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    unit_id UUID,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    context TEXT,
    challenge TEXT,
    learning_objectives TEXT[],
    difficulty VARCHAR(20) DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    embedding vector(1536),
    created_by UUID,
    discussions_count INTEGER DEFAULT 0,
    avg_rating REAL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_study_tenant_unit
    ON orch_case_study (tenant_id, unit_id);

CREATE INDEX IF NOT EXISTS idx_case_study_difficulty
    ON orch_case_study (difficulty);

CREATE INDEX IF NOT EXISTS idx_case_study_embedding
    ON orch_case_study USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE orch_case_study IS 'Dewey CBR flywheel — AI-generated case studies with 1536-dim embeddings for semantic search';

-- ========================================================================
-- orch_case_discussion — Dewey: Socratic discussions on cases
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_case_discussion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL,
    student_id UUID NOT NULL,
    student_response TEXT NOT NULL,
    ai_feedback TEXT,
    score REAL,
    feedback_quality REAL,
    professor_feedback TEXT,
    professor_rating INTEGER CHECK (professor_rating BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_discussion_case FOREIGN KEY (case_id) REFERENCES orch_case_study(id) ON DELETE CASCADE,
    CONSTRAINT fk_discussion_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_case_discussion_case
    ON orch_case_discussion (case_id);

CREATE INDEX IF NOT EXISTS idx_case_discussion_student
    ON orch_case_discussion (student_id);

COMMENT ON TABLE orch_case_discussion IS 'Dewey — student responses and AI Socratic feedback on case studies';

-- ========================================================================
-- orch_safety_flag — SafeGuard: silent risk detection flags
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_safety_flag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID NOT NULL,
    flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN ('emotional_distress', 'self_harm_risk', 'bullying', 'crisis_language')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    trigger_text VARCHAR(200),
    trigger_context JSONB,
    escalated_to UUID,
    escalated_at TIMESTAMPTZ,
    resolved BOOLEAN DEFAULT false,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_safety_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_safety_flag_unresolved
    ON orch_safety_flag (tenant_id, severity) WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_safety_flag_student
    ON orch_safety_flag (student_id);

COMMENT ON TABLE orch_safety_flag IS 'SafeGuard — silent background safety scan flags. NEVER blocks conversation. Escalates to coordinator.';

-- ========================================================================
-- orch_zpd_assessment — Vygotsky: Zone of Proximal Development
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_zpd_assessment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID NOT NULL,
    concept_id VARCHAR(100) NOT NULL,
    can_do_alone JSONB DEFAULT '[]'::jsonb,
    can_do_guided JSONB DEFAULT '[]'::jsonb,
    cannot_do JSONB DEFAULT '[]'::jsonb,
    scaffolding_level INTEGER DEFAULT 3 CHECK (scaffolding_level BETWEEN 1 AND 5),
    last_assessed TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_zpd_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT uq_zpd_student_concept UNIQUE (student_id, concept_id)
);

CREATE INDEX IF NOT EXISTS idx_zpd_tenant
    ON orch_zpd_assessment (tenant_id);

COMMENT ON TABLE orch_zpd_assessment IS 'Vygotsky placeholder — ZPD zones per student per concept. Scaffolding 1-5.';

-- ========================================================================
-- orch_accessibility_preference — Braille: accessibility needs
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_accessibility_preference (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID NOT NULL,
    needs JSONB DEFAULT '{
        "screen_reader": false,
        "high_contrast": false,
        "font_size": 16,
        "captions": false,
        "audio_description": false,
        "keyboard_nav": false,
        "reduce_motion": false,
        "dyslexia_font": false
    }'::jsonb,
    assistive_tech TEXT[],
    preferences_source VARCHAR(30) CHECK (preferences_source IN ('self_reported', 'detected', 'coordinator_set')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_accessibility_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT uq_accessibility_student_tenant UNIQUE (student_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_accessibility_tenant
    ON orch_accessibility_preference (tenant_id);

COMMENT ON TABLE orch_accessibility_preference IS 'Braille placeholder — per-student accessibility preferences and assistive tech declarations';

-- ========================================================================
-- Blockchain placeholder — add column to existing certificates table
-- ========================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orch_certificate') THEN
        ALTER TABLE orch_certificate ADD COLUMN IF NOT EXISTS blockchain_tx VARCHAR(100);
        ALTER TABLE orch_certificate ADD COLUMN IF NOT EXISTS blockchain_verified_at TIMESTAMPTZ;
        COMMENT ON COLUMN orch_certificate.blockchain_tx IS 'OpenTimestamps hash — placeholder for future blockchain verification';
    END IF;
END $$;
