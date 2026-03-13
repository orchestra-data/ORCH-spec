# AIOS Fullstack - Complete Database Schema Overview

**Generated:** 2025-11-12 | **Updated:** 2026-01-09
**Migrations Applied:** 1787000000 - 1792000000 (Educational Entities Update), 1914000000 - 1915000000 (Entity Reusability), 1921000001 (BI Dashboard v2 Indexes)
**Total Tables:** 63
**Diagram File:** `DATABASE_SCHEMA_COMPLETE.mmd`

---

## 📊 Database Architecture Summary

### Entity Organization (59 Tables)

#### 1. **Identity & Authentication Layer** (15 tables)
Core entities for multi-tenant identity management:
- **Core:** `user`, `company`, `group`, `role`, `permission`
- **Relationships:** `user_company`, `user_role`, `role_permission`, `group_member`
- **Permission Overrides:** `user_permission_allow`, `user_company_permission_allow`, `group_permission_allow`, `company_permission_allow`, `user_company_role`

#### 2. **User Extended Data** (8 tables)
Flexible user profile extensions:
- **Profiles:** `user_student_profile`, `user_employee_profile`
- **Documents & Records:** `user_document`, `user_education_record`, `user_education_entry`, `user_guardian`
- **Addresses:** `address`, `user_address`, `address_assignment`

#### 3. **Company Extended Data** (4 tables)
Company hierarchy and documentation:
- `company_complementary_info`, `company_document`, `company_hierarchy`

#### 4. **Custom Fields System** (6 tables)
Meta-programming for extensibility:
- **User:** `custom_field_definition_user`, `custom_field_set_user`
- **Company:** `custom_field_definition_company`, `custom_field_set_company`
- **Group:** `custom_field_definition_group`, `custom_field_set_group`

#### 5. **Educational Content Hierarchy** (5 tables)
Structured learning content organization:
```
Collection > Pathway > Series > Unit > Component
```
- `collection`, `pathway`, `series`, `unit`, `component`

#### 5.1 **Educational Entity Junction Tables** (4 tables) ✨ NEW
Many-to-many relationships for entity reusability:
- `pathway_collection` - Pathways can belong to multiple collections
- `series_pathway` - Series can belong to multiple pathways
- `unit_series` - Units can belong to multiple series
- `component_unit` - Components can belong to multiple units

#### 6. **Enrollment & Progress** (2 tables)
Student enrollment and progress tracking:
- `enrollment`, `student_progress`

#### 7. **xAPI Tracking System** (2 tables) ✨ NEW
Universal activity tracking for ALL educational entities:
- `xapi_event` - All user activities
- `video_session_summary` - Aggregated video analytics

#### 8. **Video Annotations** (1 table) ✨ NEW
Notebook LM-style timeline annotations:
- `video_annotation` - Notes, questions, bookmarks, highlights with threaded replies

#### 9. **Assessment System** (7 tables) ✨ NEW
Complete assessment ecosystem with IRT:
- `assessment_question_bank` - Reusable question pools
- `assessment_question` - Questions with IRT parameters
- `student_ability` - IRT theta tracking
- `assessment_attempt` - Submissions + attendance proof
- `assessment_answer` - Individual answers
- `plagiarism_check` - Turnitin/Copyleaks integration
- `proctoring_session` - Webcam, screen, face recognition, geolocation

#### 10. **Discussion Groups** (2 tables) ✨ NEW
Manual assignment (V1), Auto-assignment ready (V2):
- `discussion_group` - Group instances
- `discussion_group_member` - Membership tracking

#### 11. **AI Processing & Embeddings** (4 tables) ✨ NEW
AI content generation + RAG with pgvector:
- `ai_processing_job` - Async job queue (thumbnails, captions, clips, podcasts, case studies)
- `content_embedding` - Vector embeddings for semantic search (1536 dimensions)
- `ai_conversation` - Tutor Q&A sessions (`session_summary JSONB`, `unit_id`, `company_id`, `title`, soft-delete via `deleted_at`)
- `ai_conversation_message` - Chat messages with context retrieval (`analytics JSONB` for per-turn pedagogical indicators, `tool_invocations JSONB`, `context_used JSONB` for RAG chunks)

#### 12. **System Infrastructure** (4 tables)
Event sourcing and migration tracking:
- `event_log`, `outbox`, `dead_letter_log`, `__migration`

---

## 🔗 Key Relationships

### Educational Hierarchy Flow
```
Collection (Company-owned course catalog)
  └─> Pathway (Learning tracks within collection)
      └─> Series (Modules within pathway)
          └─> Unit (Topics within module)
              └─> Component (Individual learning activities)
```

### Entity Reusability (NEW - Migration 1914000000, 1915000000)
Educational entities can now be shared across multiple parents via junction tables:

```
Component ──┬── Unit A (via component_unit)
            └── Unit B (same component in multiple units)

Unit ──┬── Series A (via unit_series)
       └── Series B (same unit in multiple series)

Series ──┬── Pathway A (via series_pathway)
         └── Pathway B (same series in multiple pathways)

Pathway ──┬── Collection A (via pathway_collection)
          └── Collection B (same pathway in multiple collections)
```

**API Response Fields:**
- `GET /getComponent` returns `linked_unit_ids: string[]`
- `GET /getUnit` returns `linked_series_ids: string[]`
- `GET /getSeries` returns `linked_pathway_ids: string[]`
- `GET /getPathway` returns `linked_collection_ids: string[]`

**API Update Fields:**
- `PATCH /updateComponent` accepts `unit_ids: string[]`
- `PATCH /updateUnit` accepts `series_ids: string[]`
- `PATCH /updateSeries` accepts `pathway_ids: string[]`
- `PATCH /updatePathway` accepts `collection_ids: string[]`

### Multi-Tenancy Pattern
Every entity includes:
- `tenant_id` - Logical isolation for SaaS multi-tenancy
- `company_id` - Educational institution/organization
- Soft deletes via `deleted_at` (user-facing data only)

### Component Types & Subtypes
**Type 1: Streaming/Media**
- Video On Demand (VOD)
- Live Streaming
- Podcast
- Audio

**Type 2: Activity**
- Discussion Forum
- Group Work
- Whiteboard
- Case Study

**Type 3: Assessment**
- Quiz
- Exam
- Assignment
- Self-Assessment

**Type 4: Resource**
- Reading Material
- File Repository
- External Link
- Calendar Event (Conference/Palestra)

### Feature Flags on Component (Migration 1787000000)
13 new columns added for granular feature control:
```sql
enable_xapi_tracking         -- Track all user activity
enable_ai_features           -- AI content generation
enable_annotations           -- Video timeline annotations
enable_ai_qa                 -- AI Q&A chatbot
group_work_enabled           -- Group collaboration
discussion_enabled           -- Discussion forums
proctoring_enabled           -- Assessment surveillance
anti_plagiarism_enabled      -- Plagiarism detection
assessment_mode              -- manual | irt_adaptive | ai_generated
question_generation_mode     -- manual | bank_selection | ai_generated
conference_provider          -- zoom | teams | meet | jitsi
conference_date              -- Scheduled event time
conference_link              -- External meeting URL
```

### xAPI Event Tracking (Migration 1788000000)
Universal tracking for 15 event types:
- `video.*` - play, pause, seek, complete, speed_change
- `assessment.*` - start, answer, submit
- `discussion.*` - post, reply, react
- `ai.*` - question, answer
- `reading.*` - start, progress, complete
- `chat.*` - send_message

Foreign keys to context entities:
- `assessment_attempt_id` - Links to assessment attempts
- `discussion_group_id` - Links to discussion groups
- `ai_conversation_id` - Links to AI Q&A sessions

### Assessment Workflow (Migration 1790000000)
```
1. Teacher creates question_bank (reusable pools)
2. Teacher adds questions with IRT parameters
3. Student starts assessment_attempt
4. System selects questions adaptively (IRT 2PL)
5. Student submits answers
6. System calculates IRT theta (student ability)
7. Optional: plagiarism_check (Turnitin/Copyleaks)
8. Optional: proctoring_session (levels 0-3)
9. Teacher reviews + provides rich feedback
10. For presencial events: attendance_proof upload
```

### AI Processing Pipeline (Migration 1792000000 + 202603110001)
```
1. Teacher enables AI features on component
2. Backend queues ai_processing_job (thumbnail, caption, etc.)
3. OpenAI/AssemblyAI/ElevenLabs processes content
4. Results stored in component.content_data + output_data
5. For RAG: content chunked into content_embedding
6. pgvector HNSW index enables semantic search
7. PATCH /updateComponent triggers SmartPlayer AI analysis (Google Gemini):
   - Saves ai_summary, ai_theme, ai_tags, ai_syllabus, ai_suggestions into component.metadata
8. Student asks question via ai_conversation (POST /generateTutorResponse)
9. System retrieves relevant chunks via semantic search (pgvector)
10. Google Gemini generates Socratic context-aware answer
11. Conversation and both messages (user + assistant) persisted to ai_conversation / ai_conversation_message
12. Per-turn pedagogical analytics evaluated by Gemini (15 indicators across 5 dimensions)
    and stored in ai_conversation_message.analytics
13. Cost tracking in cost_cents fields
```

**component.metadata AI Fields** (populated by PATCH /updateComponent → SmartPlayer pipeline):
```
ai_summary    TEXT   — One-paragraph content summary
ai_theme      TEXT   — Primary topic/theme label
ai_tags       TEXT[] — Keyword tags
ai_syllabus   TEXT[] — Ordered syllabus items
ai_suggestions JSONB[] — [{text, label, icon}] suggested student questions
ai_analysis   JSONB  — Full raw AI analysis object (backward compat)
```

### ✅ Enrollment Isolation for Progress/Attendance (Implemented 2026-01-23)

Progress and attendance is now tracked separately per enrollment, allowing students
enrolled in multiple class instances to have independent progress per turma.

**Problem Solved:** Same component used in Mat 1 and Mat 2 turmas. Previously, if student
completed in Mat 1, it incorrectly showed as completed in Mat 2. Now tracked separately.

**Migrations Applied:**
- `1769002533--enrollment-isolation.sql` - Changed unique constraints
- `1930000000--fix_sync_experience_trigger_on_conflict.sql` - Updated trigger ON CONFLICT

**Unique Constraints (using COALESCE for NULL safety):**
```sql
-- student_progress: Now includes enrollment
CREATE UNIQUE INDEX idx_progress_user_component_enrollment_unique
  ON student_progress (user_id, component_id,
    COALESCE(class_enrollment_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deleted_at IS NULL AND component_id IS NOT NULL;

-- attendance_record: Now includes class_instance
CREATE UNIQUE INDEX attendance_record_unique
  ON attendance_record (student_id, component_id,
    COALESCE(class_instance_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- attendance_proof: NEW constraint for proof isolation
CREATE UNIQUE INDEX idx_attendance_proof_user_component_class_unique
  ON attendance_proof (user_id, component_id,
    COALESCE(class_instance_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status != 'rejected';
```

**Behavior Rules:**
- Students: Frontend passes `classInstanceId` via EnrollmentContext
- Employees: Can access without enrollment (validation bypass)
- Each enrollment tracks progress independently
- Attendance proofs and records are isolated per class_instance

**Documentation:**
- Backend: `docs/HANDOFF_ENROLLMENT_ISOLATION.md`
- Frontend: `docs/HANDOFF_ENROLLMENT_ISOLATION_FRONTEND.md`

---

## 📈 Database Statistics

### Tables Added in Migrations:
- **1787000000:** 0 new tables (13 columns added to `component`)
- **1788000000:** 2 tables (xAPI tracking)
- **1789000000:** 1 table (video annotations)
- **1790000000:** 7 tables (assessment system)
- **1791000000:** 2 tables (discussion groups)
- **1792000000:** 4 tables (AI processing)
- **1914000000:** 3 tables (pathway_collection, series_pathway, unit_series)
- **1915000000:** 1 table (component_unit)
- **1921000001:** BI Dashboard v2 performance indexes (17 indexes)
- **Total new tables:** 20

### Indexes Created:
- Component feature flags: 10 indexes
- xAPI tracking: 11 indexes
- Video annotations: 8 indexes
- Assessment system: 20+ indexes
- Discussion groups: 8 indexes
- AI processing: 10 indexes (including HNSW vector index)
- **BI Dashboard v2 (1921000001):** 17 indexes
  - User table: 4 indexes (type_status_tenant, birth_date, gender, created_at_tenant)
  - Class instance: 1 index (status_tenant)
  - Enrollment: 1 index (class_status)
  - Student progress: 2 indexes (score_tenant, completed_at)
  - Experience events: 2 indexes (period, student)
  - Component: 2 indexes (type_tenant, subtype_tenant)
  - Admin entity events: 3 indexes (period, actor, object_type)
  - Assessment attempt: 2 indexes (status_tenant, started_at)
- **Total new indexes:** 77+

### Functions & Triggers:
- `update_video_session_summary()` - xAPI aggregation
- `get_annotation_stats()` - Annotation analytics
- `get_annotation_timeline()` - Video player helper
- `select_adaptive_question()` - IRT question selection
- `update_student_ability()` - IRT theta calculation
- `get_group_member_count()` - Group validation
- `can_add_group_member()` - Membership check
- `get_group_stats()` - Group analytics
- `semantic_search()` - RAG vector search
- `get_ai_cost_summary()` - AI cost analytics
- **Total functions:** 10
- **Total triggers:** 4

### Extensions:
- **pgvector** - Vector similarity search for RAG (OpenAI embeddings 1536 dimensions)

---

## 💾 Storage Estimates (1000 students, 500 components)

### New Tables (First Year):
- `xapi_event`: ~500MB (100 events/student/month)
- `video_session_summary`: ~2MB
- `video_annotation`: ~50MB (10 annotations/video)
- Assessment tables: ~200MB
- `content_embedding`: ~800MB (1000 chunks × 1536-dim vectors)
- Discussion tables: ~10MB
- AI tables: ~50MB
- **Total:** ~1.6GB additional storage/year

### Growth Rate:
- **Linear:** ~1.6GB per 1000 students per year
- **Exponential:** xAPI events (can be archived/aggregated)

---

## 💰 Cost Estimates (1000 students)

### AI API Usage (Monthly):
- 500 videos with AI features: $50
  - Thumbnails (DALL-E 3): $0.04/image
  - Captions (Whisper): $0.006/minute
  - Clips (GPT-4): $0.02/video
  - Podcasts (TTS): $0.015/1000 chars
  - Case studies (GPT-4): $0.05/video
- 10,000 AI Q&A queries: $20
  - GPT-4 + embeddings: $0.002/query
- **Total monthly AI costs:** ~$70

### Database Costs:
- Depends on cloud provider
- Consider read replicas for analytics
- Archive old xAPI events to reduce cost

---

## 🔍 Viewing the Diagram

### Option 1: Mermaid Live Editor
1. Open https://mermaid.live
2. Paste contents of `DATABASE_SCHEMA_COMPLETE.mmd`
3. View interactive diagram

### Option 2: VSCode Extension
1. Install "Markdown Preview Mermaid Support" extension
2. Open `DATABASE_SCHEMA_COMPLETE.mmd`
3. Right-click > "Open Preview"

### Option 3: GitHub
1. Push file to GitHub repository
2. GitHub automatically renders `.mmd` files

### Option 4: Documentation Tools
- **MkDocs** with mermaid2 plugin
- **Docusaurus** with mermaid support
- **GitBook** with mermaid integration

---

## 🎯 V1 Scope (Currently Implemented)

### ✅ Included Features:
- xAPI tracking (simplified - no sentiment/tab switches/tool interaction/screen time)
- AI content generation (text-only, no voice synthesis)
- Video annotations (no WebSocket real-time sync)
- Full assessment system (IRT, plagiarism, proctoring, attendance proof)
- Manual discussion groups
- Calendar/Resources (references to Company entities)
- Document upload fields (attendance proof for presencial events)
- RAG Q&A with semantic search

### ❌ V2 Features (Not Implemented Yet):
- Sentiment analytics in xAPI
- Tab switch tracking
- Tool interaction tracking
- Screen time tracking
- AI voice synthesis (ElevenLabs)
- Real-time WebSocket sync for annotations
- Automatic group assignment algorithms
- Advanced proctoring with ML face detection

---

## 🛠️ Backend Development Roadmap

### Phase 1: Update TypeScript Interfaces
Update `ComponentRow` interface with 13 new feature flag columns.

### Phase 2: Create Repository Classes
- `XAPIEventRepository`
- `VideoAnnotationRepository`
- `AssessmentQuestionRepository`
- `AssessmentAttemptRepository`
- `DiscussionGroupRepository`
- `AIProcessingJobRepository`
- `ContentEmbeddingRepository`

### Phase 3: Implement Service Layer
- `XAPITrackingService`
- `VideoAnalyticsService`
- `AnnotationService`
- `AssessmentService` (with IRT)
- `DiscussionGroupService`
- `AIContentService`
- `AIQAService` (RAG with semantic search)

### Phase 4: Create API Endpoints
- `POST /api/xapi/event` - Track user activity
- `GET/POST/PATCH/DELETE /api/annotations` - Annotation CRUD
- `GET/POST/PATCH/DELETE /api/assessments` - Assessment CRUD
- `GET/POST/PATCH/DELETE /api/discussion-groups` - Group CRUD
- `POST /api/ai/jobs` - Queue AI processing
- `POST /api/ai/chat` - AI Q&A interface

### Phase 5: Frontend Integration
- Update component forms with feature flags
- Video player with xAPI tracking
- Annotation timeline UI (Notebook LM-style)
- Assessment builder (question banks)
- Assessment taking UI (with proctoring)
- AI Q&A chat interface
- Discussion group management UI

---

## 📚 Reference Documents

### Architecture & Decisions:
- `COMPONENT_STORAGE_ARCHITECTURE_DECISION.md` - Hybrid approach rationale
- `IMPLEMENTATION_CLARIFICATIONS_AND_DECISIONS_V2.md` - All user decisions
- `FINAL_IMPLEMENTATION_SPEC.md` - Complete JSONB schemas

### Migrations:
- `1787000000--component_feature_flags.sql` (273 lines)
- `1788000000--xapi_tracking_system.sql` (304 lines)
- `1789000000--video_annotations.sql` (342 lines)
- `1790000000--assessment_system.sql` (615 lines)
- `1791000000--discussion_groups.sql` (378 lines)
- `1792000000--ai_processing_embeddings.sql` (553 lines)

### Testing:
- `TEST_MIGRATIONS.md` - Complete testing guide
- `DB_SAGE_MIGRATIONS_COMPLETE.md` - Executive summary

---

## ✅ Migration Status

**Current Status:** ✅ **ALL MIGRATIONS SUCCESSFULLY APPLIED**

**Verification Results:**
- All 16 new tables created
- All 13 new component columns added
- pgvector extension installed
- All 60+ indexes created
- All 10 helper functions created
- All 4 triggers created
- All foreign keys established
- Sample data tests passed

**Database:** PostgreSQL 17 (education-postgres container)
**Environment:** Development (`dev` database)
**Next Step:** Backend service implementation

---

*Database schema designed by Winston 🏗️ & DB Sage 🗄️ | 2025-11-12*
*Ready for production deployment* ✅
