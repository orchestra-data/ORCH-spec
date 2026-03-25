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
    chunk_index INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_admin_embedding_tenant
    ON orch_admin_embedding (tenant_id);

CREATE INDEX IF NOT EXISTS idx_admin_embedding_vector
    ON orch_admin_embedding USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ========================================================================
-- orch_admin_conversation — 30-day memory conversations
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admin_conversation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    title VARCHAR(200),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'cold')),
    context_summary TEXT,
    faq_learned JSONB DEFAULT '[]',
    messages_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- No FK: user_id stores Keycloak sub, not DB user.id
    CONSTRAINT chk_admin_conversation_user CHECK (user_id IS NOT NULL OR status = 'archived')
);

CREATE INDEX IF NOT EXISTS idx_admin_conversation_user
    ON orch_admin_conversation (user_id, tenant_id);

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

CREATE INDEX IF NOT EXISTS idx_admin_message_conversation
    ON orch_admin_message (conversation_id, created_at);

-- ========================================================================
-- orch_admin_walkthrough — guided walkthrough definitions
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admin_walkthrough (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id UUID,
    title TEXT NOT NULL,
    description TEXT,
    route VARCHAR(200) NOT NULL,
    steps JSONB NOT NULL,
    trigger_intent TEXT[],
    trigger_stuck BOOLEAN DEFAULT false,
    times_used INTEGER DEFAULT 0,
    avg_completion_pct REAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_walkthrough_route
    ON orch_admin_walkthrough (route);

CREATE INDEX IF NOT EXISTS idx_admin_walkthrough_tenant
    ON orch_admin_walkthrough (tenant_id);

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
    -- No FK: user_id stores Keycloak sub
    CONSTRAINT chk_walkthrough_usage_user CHECK (user_id IS NOT NULL)
);

-- ========================================================================
-- orch_admin_alert — proactive alert system
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_admin_alert (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    alert_type VARCHAR(50) NOT NULL DEFAULT 'general',
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
    source_id UUID,
    read_by UUID[] DEFAULT '{}',
    dismissed_by UUID[] DEFAULT '{}',
    escalated_at TIMESTAMPTZ,
    escalated_to UUID,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_alert_tenant_category
    ON orch_admin_alert (tenant_id, category);

CREATE INDEX IF NOT EXISTS idx_admin_alert_created
    ON orch_admin_alert (created_at DESC);

-- ========================================================================
-- orch_staff_feedback_active — explicit feedback on assistant messages
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_staff_feedback_active (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    message_id UUID,
    rating VARCHAR(20) CHECK (rating IN ('helpful', 'unhelpful', 'wrong', 'incomplete')),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- No FK: user_id stores Keycloak sub
    CONSTRAINT uq_staff_feedback_active_user_msg UNIQUE (user_id, message_id)
);

-- ========================================================================
-- orch_staff_feedback_passive — implicit usage tracking
-- ========================================================================
CREATE TABLE IF NOT EXISTS orch_staff_feedback_passive (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID,
    route VARCHAR(200),
    time_on_page_ms INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    scroll_depth_pct REAL DEFAULT 0,
    walkthrough_id VARCHAR(100),
    session_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),

    -- No FK: user_id stores Keycloak sub
    CONSTRAINT chk_staff_feedback_passive_user CHECK (user_id IS NOT NULL)
);

-- ========================================================================
-- search_orch_admin_knowledge — semantic search function
-- ========================================================================
CREATE OR REPLACE FUNCTION search_orch_admin_knowledge(
    p_tenant_id UUID,
    p_query_embedding vector(1536),
    p_route_context VARCHAR DEFAULT NULL,
    p_domain VARCHAR DEFAULT NULL,
    p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
    chunk_text TEXT,
    source_file VARCHAR(200),
    route_context VARCHAR(200),
    domain VARCHAR(50),
    similarity REAL
)
LANGUAGE sql STABLE
AS $$
    SELECT
        e.chunk_text,
        e.source_file,
        e.route_context,
        e.domain,
        (1 - (e.embedding <=> p_query_embedding))::real AS similarity
    FROM orch_admin_embedding e
    WHERE e.tenant_id = p_tenant_id
      AND (p_route_context IS NULL OR e.route_context = p_route_context)
      AND (p_domain IS NULL OR e.domain = p_domain)
    ORDER BY e.embedding <=> p_query_embedding
    LIMIT p_limit;
$$;
