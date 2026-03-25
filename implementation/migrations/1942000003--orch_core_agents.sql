-- ========================================================================
-- Migration 1942000003: ORCH Core Agents (EPIC-02)
-- Ebbinghaus (SM-2), Comenius (Daily Recap), Sisifo (Gamification), Taylor (Engagement)
-- ========================================================================

-- ========================================================================
-- orch_concept_memory — Ebbinghaus SM-2 spaced repetition
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_concept_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID NOT NULL,
    concept_id VARCHAR(100) NOT NULL,
    concept_label TEXT NOT NULL,
    source_unit_id UUID,
    easiness_factor REAL DEFAULT 2.5,
    interval_days INTEGER DEFAULT 1,
    repetitions INTEGER DEFAULT 0,
    retention REAL DEFAULT 1.0,
    last_review TIMESTAMPTZ,
    next_review TIMESTAMPTZ,
    last_quality INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_concept_memory_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT uq_concept_memory_student_concept UNIQUE (student_id, concept_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_memory_student_next_review
    ON orch_concept_memory (student_id, next_review);

COMMENT ON TABLE orch_concept_memory IS 'Ebbinghaus agent — SM-2 spaced repetition memory per student+concept';

-- ========================================================================
-- orch_daily_recap — Comenius daily review sessions
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_daily_recap (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID,
    recap_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    questions_total INTEGER DEFAULT 5,
    questions_correct INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    time_spent_sec INTEGER DEFAULT 0,
    streak_day INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_daily_recap_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT uq_daily_recap_student_date UNIQUE (student_id, recap_date)
);

COMMENT ON TABLE orch_daily_recap IS 'Comenius agent — daily recap sessions tracking questions, XP, and streaks';

-- ========================================================================
-- orch_recap_question — Comenius individual recap questions
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_recap_question (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recap_id UUID,
    concept_id VARCHAR(100) NOT NULL,
    question_type VARCHAR(30) CHECK (question_type IN ('multiple_choice', 'true_false', 'fill_blank', 'short_answer', 'match')),
    question_text TEXT NOT NULL,
    options JSONB,
    correct_answer TEXT NOT NULL,
    difficulty REAL DEFAULT 0.5,
    source_unit_id UUID,
    student_answer TEXT,
    is_correct BOOLEAN,
    answered_at TIMESTAMPTZ,
    time_spent_sec INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_recap_question_recap FOREIGN KEY (recap_id) REFERENCES orch_daily_recap(id) ON DELETE CASCADE
);

COMMENT ON TABLE orch_recap_question IS 'Comenius agent — individual questions within a daily recap session';

-- ========================================================================
-- orch_gamification — Sisifo gamification profile
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_gamification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID,
    xp_total INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak_days INTEGER DEFAULT 0,
    streak_best INTEGER DEFAULT 0,
    streak_last DATE,
    badges JSONB DEFAULT '[]',
    missions JSONB DEFAULT '[]',
    octalysis JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_gamification_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT uq_gamification_student_tenant UNIQUE (student_id, tenant_id)
);

COMMENT ON TABLE orch_gamification IS 'Sisifo agent — gamification profile with XP, levels, streaks, badges, and Octalysis dimensions';

-- ========================================================================
-- orch_xp_transaction — Sisifo XP ledger
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_xp_transaction (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID,
    amount INTEGER NOT NULL,
    source VARCHAR(50) NOT NULL,
    source_id VARCHAR(100),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_xp_transaction_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_xp_transaction_student_created
    ON orch_xp_transaction (student_id, created_at);

COMMENT ON TABLE orch_xp_transaction IS 'Sisifo agent — immutable XP transaction ledger (always positive amounts)';

-- ========================================================================
-- orch_engagement_snapshot — Taylor engagement scoring
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_engagement_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID,
    snapshot_date DATE DEFAULT CURRENT_DATE,
    score REAL NOT NULL,
    trend VARCHAR(20) DEFAULT 'stable' CHECK (trend IN ('rising', 'stable', 'declining', 'critical')),
    login_score REAL,
    time_score REAL,
    content_score REAL,
    social_score REAL,
    assessment_score REAL,
    ai_score REAL,
    events_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_engagement_snapshot_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT uq_engagement_snapshot_student_date UNIQUE (student_id, snapshot_date)
);

COMMENT ON TABLE orch_engagement_snapshot IS 'Taylor agent — daily engagement snapshot with multi-dimensional scoring';
