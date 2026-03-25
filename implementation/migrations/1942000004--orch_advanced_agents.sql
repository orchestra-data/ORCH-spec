-- ========================================================================
-- Migration 1942000004: ORCH Advanced Agents (EPIC-03)
-- Aristoteles (Assessment), Gardner (Cognitive), Wittgenstein (Linguistic),
-- Foucault (Risk), Weber (D7 Reports)
-- ========================================================================

-- ========================================================================
-- orch_assessment — Aristoteles quality + plagiarism + AI detection pipeline
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_assessment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID,
    assignment_id UUID,
    class_instance_id UUID,
    submission_text TEXT NOT NULL,
    submission_url TEXT,
    submitted_at TIMESTAMPTZ DEFAULT now(),
    quality_clarity REAL,
    quality_coherence REAL,
    quality_depth REAL,
    quality_originality REAL,
    quality_technical REAL,
    plagiarism_score REAL,
    plagiarism_matches JSONB DEFAULT '[]',
    ai_detection_score REAL,
    ai_perplexity REAL,
    ai_burstiness REAL,
    stylometric_deviation REAL,
    composite_score REAL,
    composite_weights JSONB,
    feedback_text TEXT,
    feedback_generated_at TIMESTAMPTZ,
    review_status VARCHAR(20) DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'contested')),
    professor_reviewed_at TIMESTAMPTZ,
    professor_notes TEXT,
    professor_final_grade REAL,
    pipeline_stage INTEGER DEFAULT 0,
    pipeline_log JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_assessment_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE
);

COMMENT ON TABLE orch_assessment IS 'Aristoteles agent — submission assessment pipeline with quality, plagiarism, AI detection, and stylometric analysis';

-- ========================================================================
-- orch_stylometric_baseline — Aristoteles writing fingerprint
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_stylometric_baseline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID,
    tenant_id UUID NOT NULL,
    avg_sentence_length REAL,
    vocabulary_richness REAL,
    punctuation_pattern JSONB,
    conjunction_frequency JSONB,
    paragraph_length_avg REAL,
    samples_count INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_stylometric_baseline_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT uq_stylometric_baseline_student_tenant UNIQUE (student_id, tenant_id)
);

COMMENT ON TABLE orch_stylometric_baseline IS 'Aristoteles agent — per-student writing fingerprint baseline for stylometric deviation detection';

-- ========================================================================
-- orch_cognitive_observation — Gardner multiple intelligence signals
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_cognitive_observation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID,
    observation_type VARCHAR(50) NOT NULL,
    intelligence_signal VARCHAR(50) NOT NULL,
    confidence REAL DEFAULT 0.5,
    source_interaction_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_cognitive_observation_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cognitive_observation_student_signal
    ON orch_cognitive_observation (student_id, intelligence_signal);

COMMENT ON TABLE orch_cognitive_observation IS 'Gardner agent — cognitive observation signals mapped to multiple intelligences';

-- ========================================================================
-- orch_linguistic_sample — Wittgenstein language proficiency tracking
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_linguistic_sample (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID,
    sample_text TEXT NOT NULL,
    sample_context VARCHAR(30) CHECK (sample_context IN ('chat', 'forum', 'assessment', 'portfolio')),
    word_count INTEGER,
    cefr_estimate VARCHAR(5),
    vocabulary_richness REAL,
    formality_score REAL,
    grammar_error_count INTEGER,
    grammar_errors JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_linguistic_sample_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_linguistic_sample_student_created
    ON orch_linguistic_sample (student_id, created_at);

COMMENT ON TABLE orch_linguistic_sample IS 'Wittgenstein agent — linguistic sample analysis with CEFR estimation and vocabulary richness (TTR)';

-- ========================================================================
-- orch_risk_assessment — Foucault multi-dimensional dropout risk
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_risk_assessment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID,
    assessment_date DATE DEFAULT CURRENT_DATE,
    risk_score REAL NOT NULL,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('green', 'yellow', 'orange', 'red', 'critical')),
    dim_academic REAL DEFAULT 0,
    dim_attendance REAL DEFAULT 0,
    dim_engagement REAL DEFAULT 0,
    dim_financial REAL DEFAULT 0,
    dim_social REAL DEFAULT 0,
    dim_emotional REAL DEFAULT 0,
    dim_temporal REAL DEFAULT 0,
    dim_vocational REAL DEFAULT 0,
    intervention VARCHAR(30) CHECK (intervention IN ('none', 'monitor', 'nudge', 'outreach', 'meeting', 'urgent')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_risk_assessment_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE,
    CONSTRAINT uq_risk_assessment_student_date UNIQUE (student_id, assessment_date)
);

COMMENT ON TABLE orch_risk_assessment IS 'Foucault agent — multi-dimensional dropout risk assessment with 8 dimensions and intervention levels';

-- ========================================================================
-- orch_d7_report — Weber data-driven reports for teachers
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_d7_report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    student_id UUID,
    report_type VARCHAR(30) NOT NULL CHECK (report_type IN ('weekly', 'monthly', 'semester', 'on_demand')),
    report_date DATE NOT NULL,
    generated_by VARCHAR(50) DEFAULT 'weber',
    data JSONB NOT NULL,
    pdf_url TEXT,
    viewed_by_teacher BOOLEAN DEFAULT false,
    viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_d7_report_student FOREIGN KEY (student_id) REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_d7_report_student_date
    ON orch_d7_report (student_id, report_date DESC);

COMMENT ON TABLE orch_d7_report IS 'Weber agent — D7 periodic reports (weekly/monthly/semester) with PDF export and teacher view tracking';
