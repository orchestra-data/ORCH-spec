-- ========================================================================
-- Migration 1942000005: ORCH Admin (EPIC-04)
-- RAG embeddings, conversations, walkthroughs, alerts, feedback
-- ========================================================================

-- ========================================================================
-- orch_admin_embedding — RAG vector store for admin knowledge
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admin_embedding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    source_file VARCHAR(200) NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    route_context VARCHAR(200),
    domain VARCHAR(50),
    embedding vector(1536) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_embedding_route_context
    ON orch_admin_embedding (route_context);

CREATE INDEX IF NOT EXISTS idx_admin_embedding_domain
    ON orch_admin_embedding (domain);

CREATE INDEX IF NOT EXISTS idx_admin_embedding_vector
    ON orch_admin_embedding USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE orch_admin_embedding IS 'RAG vector store — chunked admin documentation with 1536-dim embeddings for semantic search';

-- ========================================================================
-- orch_admin_conversation — 30-day memory conversations
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admin_conversation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'cold')),
    context_summary TEXT,
    faq_learned JSONB DEFAULT '[]',
    messages_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_admin_conversation_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

COMMENT ON TABLE orch_admin_conversation IS 'Admin assistant — conversation sessions with 30-day memory and FAQ learning';

-- ========================================================================
-- orch_admin_message — individual messages within conversations
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admin_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    route_context VARCHAR(200),
    dom_snapshot JSONB,
    action_taken JSONB,
    tokens_used INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_admin_message_conversation FOREIGN KEY (conversation_id) REFERENCES orch_admin_conversation(id) ON DELETE CASCADE
);

COMMENT ON TABLE orch_admin_message IS 'Admin assistant — individual messages with route context and DOM snapshots';

-- ========================================================================
-- orch_admin_walkthrough — guided walkthrough definitions
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admin_walkthrough (
    id VARCHAR(100) PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    route VARCHAR(200) NOT NULL,
    steps JSONB NOT NULL,
    trigger_intent TEXT[],
    trigger_stuck BOOLEAN DEFAULT false,
    times_used INTEGER DEFAULT 0,
    avg_completion REAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE orch_admin_walkthrough IS 'Admin assistant — guided walkthrough definitions with step-by-step instructions and intent triggers';

-- ========================================================================
-- orch_admin_walkthrough_usage — walkthrough completion tracking
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admin_walkthrough_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    walkthrough_id VARCHAR(100),
    user_id UUID,
    status VARCHAR(20) DEFAULT 'started' CHECK (status IN ('started', 'completed', 'abandoned')),
    step_reached INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,

    CONSTRAINT fk_walkthrough_usage_walkthrough FOREIGN KEY (walkthrough_id) REFERENCES orch_admin_walkthrough(id),
    CONSTRAINT fk_walkthrough_usage_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

COMMENT ON TABLE orch_admin_walkthrough_usage IS 'Admin assistant — per-user walkthrough usage tracking with completion status';

-- ========================================================================
-- orch_admin_alert — proactive alert system
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admin_alert (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('student', 'class', 'admission', 'system')),
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    action_url VARCHAR(500),
    action_label VARCHAR(100),
    target_roles TEXT[] DEFAULT '{}',
    target_user_id UUID,
    entity_type VARCHAR(50),
    entity_id UUID,
    read_by UUID[] DEFAULT '{}',
    dismissed_by UUID[] DEFAULT '{}',
    escalated_at TIMESTAMPTZ,
    escalated_to UUID,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_alert_tenant_category
    ON orch_admin_alert (tenant_id, category);

CREATE INDEX IF NOT EXISTS idx_admin_alert_created
    ON orch_admin_alert (created_at DESC);

COMMENT ON TABLE orch_admin_alert IS 'Admin assistant — proactive alerts with severity levels, role targeting, and escalation tracking';

-- ========================================================================
-- orch_staff_feedback — staff feedback on assistant responses
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_staff_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    message_id UUID,
    feedback_type VARCHAR(20) CHECK (feedback_type IN ('active', 'passive')),
    rating VARCHAR(20) CHECK (rating IN ('helpful', 'unhelpful', 'wrong', 'incomplete')),
    comment TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_staff_feedback_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

COMMENT ON TABLE orch_staff_feedback IS 'Admin assistant — staff feedback on assistant responses for continuous improvement';
