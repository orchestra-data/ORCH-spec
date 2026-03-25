-- =============================================================================
-- Migration: ORCH Foundation Tables (EPIC-01)
-- Description: Bourdieu student profile, single-writer audit trail,
--              and pipeline observability for the ORCH ecosystem
-- =============================================================================

-- =============================================================================
-- 1. orch_student_profile — Bourdieu Central Profile
--    Single source of truth for all student intelligence.
--    Each JSONB column is owned by a specific agent (single-writer pattern).
-- =============================================================================

CREATE TABLE IF NOT EXISTS orch_student_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID NOT NULL,
    version INTEGER DEFAULT 1,

    -- 12 communication archetypes (Bourdieu habitus mapping)
    communication_archetype VARCHAR(50) NOT NULL DEFAULT 'explorer',

    -- JSONB profiles (each fed by a different agent)
    academic_profile JSONB DEFAULT '{"gpa":null,"standing":"regular","trend":"stable","strongest_subjects":[],"weakest_subjects":[],"attendance_rate":null}'::jsonb,
    cognitive_profile JSONB DEFAULT '{"dominant_intelligences":[],"learning_preferences":[],"metacognitive_calibration":0,"confidence_level":0}'::jsonb,
    linguistic_profile JSONB DEFAULT '{"cefr_level":null,"vocabulary_richness":null,"formality_range":[0,0],"preferred_register":"informal","detected_language":"pt-BR"}'::jsonb,
    engagement_profile JSONB DEFAULT '{"score":0,"trend":"unknown","login_frequency":null,"avg_session_minutes":null,"last_active":null,"peak_hours":[],"preferred_content_type":null}'::jsonb,
    gamification_profile JSONB DEFAULT '{"xp":0,"level":1,"streak_days":0,"streak_last_date":null,"badges":[],"octalysis_drivers":{"meaning":0,"accomplishment":0,"empowerment":0,"ownership":0,"social":0,"scarcity":0,"unpredictability":0,"avoidance":0}}'::jsonb,
    risk_profile JSONB DEFAULT '{"score":0,"level":"green","dimensions":{"academic":0,"attendance":0,"engagement":0,"financial":0,"social":0,"emotional":0,"temporal":0,"vocational":0},"last_assessment":null,"interventions":[]}'::jsonb,
    forgetting_curves JSONB DEFAULT '{}'::jsonb,
    skills_mastery JSONB DEFAULT '{}'::jsonb,
    sociocultural JSONB DEFAULT '{"capital_cultural":null,"capital_social":null,"first_generation":null,"digital_literacy":null}'::jsonb,

    -- Metadata
    updated_by VARCHAR(50) NOT NULL DEFAULT 'system',
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Foreign keys
    CONSTRAINT fk_orch_profile_student FOREIGN KEY (student_id)
        REFERENCES "user"(id) ON DELETE CASCADE,

    -- Constraints
    CONSTRAINT uq_orch_profile_student_tenant UNIQUE (student_id, tenant_id),
    CONSTRAINT chk_orch_profile_archetype CHECK (communication_archetype IN (
        'explorer', 'scholar', 'pragmatic', 'creative', 'competitor', 'social',
        'reflective', 'anxious', 'skeptic', 'leader', 'observer', 'rebel'
    ))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orch_profile_student ON orch_student_profile(student_id);
CREATE INDEX IF NOT EXISTS idx_orch_profile_tenant ON orch_student_profile(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orch_profile_archetype ON orch_student_profile(communication_archetype);

COMMENT ON TABLE orch_student_profile IS
    'Bourdieu central profile: single source of truth for student intelligence. Each JSONB column is owned by a specific agent (single-writer pattern). 12 communication archetypes derived from habitus mapping. Version column enables optimistic locking.';

-- =============================================================================
-- 2. orch_profile_audit — Single-Writer Audit Trail
--    Every profile mutation is logged with agent_id, field_path, and reasoning.
--    Enables traceability and rollback of any agent decision.
-- =============================================================================

CREATE TABLE IF NOT EXISTS orch_profile_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    agent_id VARCHAR(50) NOT NULL,
    field_path TEXT NOT NULL,       -- e.g. 'engagement_profile.score'
    old_value JSONB,
    new_value JSONB,
    reasoning TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Foreign keys
    CONSTRAINT fk_orch_audit_student FOREIGN KEY (student_id)
        REFERENCES "user"(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orch_audit_student ON orch_profile_audit(student_id);
CREATE INDEX IF NOT EXISTS idx_orch_audit_agent ON orch_profile_audit(agent_id);
CREATE INDEX IF NOT EXISTS idx_orch_audit_created ON orch_profile_audit(created_at);

COMMENT ON TABLE orch_profile_audit IS
    'Single-writer audit trail: every profile mutation logged with agent_id, field_path (dot-notation), old/new values, and reasoning. Enables full traceability and rollback of any agent decision.';

-- =============================================================================
-- 3. orch_interaction_log — Pipeline Observability
--    Logs every ORCH interaction: intent detection, agent routing,
--    pipeline steps, background results, and performance metrics.
-- =============================================================================

CREATE TABLE IF NOT EXISTS orch_interaction_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    student_id UUID,              -- null for admin interactions
    user_id UUID,                 -- for admin interactions
    conversation_id UUID,
    message_preview VARCHAR(200),

    -- Intent & routing
    intent_detected VARCHAR(50),
    intent_confidence NUMERIC(3,2),
    agent_routed VARCHAR(50),

    -- Pipeline trace
    pipeline_steps JSONB DEFAULT '[]'::jsonb,
    background_results JSONB DEFAULT '{}'::jsonb,

    -- Response metrics
    response_type VARCHAR(30),    -- success, fallback, circuit_open, reformulation
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orch_log_request ON orch_interaction_log(request_id);
CREATE INDEX IF NOT EXISTS idx_orch_log_student_created ON orch_interaction_log(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_log_response_type ON orch_interaction_log(response_type)
    WHERE response_type IN ('fallback', 'circuit_open');

COMMENT ON TABLE orch_interaction_log IS
    'Pipeline observability: logs every ORCH interaction with intent detection, agent routing, pipeline steps, background results, and performance metrics. Partial index on fallback/circuit_open for anomaly monitoring.';
