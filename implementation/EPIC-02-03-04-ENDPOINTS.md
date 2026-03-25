# EPIC-02, 03, 04 — Endpoint Implementation Guide

All endpoints are prefixed with `/api/v1/orch`. Auth: Bearer JWT (Keycloak). Tenant resolved from token.

---

## EPIC-02: Orch AVA (Student-Facing AI)

### Recap (Spaced Repetition)

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| GET | `/recap/today` | Get today's recap session for the authenticated student | `orchRecap.getTodaySession(client, userId, tenantId)` |
| POST | `/recap/:id/start` | Start a recap session | `orchRecap.startSession(client, recapId, userId)` |
| POST | `/recap/:id/answer` | Submit an answer to a recap question | `orchRecap.submitAnswer(client, recapId, { questionId, answer })` |
| POST | `/recap/:id/complete` | Complete a recap session | `orchRecap.completeSession(client, recapId, userId)` |
| GET | `/recap/history` | List past recap sessions | `orchRecap.getHistory(client, userId, tenantId, { limit?, offset? })` |
| GET | `/recap/streak` | Get current streak and best streak | `orchRecap.getStreak(client, userId)` |

**GET /recap/today**
- Query: none
- Response: `{ id, questions: [{ id, text, type, options? }], totalQuestions, completedToday }`
- Auth: student role

**POST /recap/:id/answer**
- Body: `{ questionId: string, answer: string | string[] }`
- Response: `{ correct: boolean, explanation: string, xpEarned: number }`
- Auth: student role

---

### Gamification

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| GET | `/gamification/status` | Get XP, level, streaks for current user | `orchGamification.getStatus(client, userId, tenantId)` |
| GET | `/leaderboard` | Class/school leaderboard | `orchGamification.getLeaderboard(client, tenantId, { scope?, classId?, limit? })` |
| GET | `/badges` | List all badges and user progress | `orchGamification.getBadges(client, userId, tenantId)` |
| GET | `/missions` | List active missions/challenges | `orchGamification.getMissions(client, userId, tenantId)` |
| POST | `/claim-badge` | Claim a badge that is ready | `orchGamification.claimBadge(client, userId, { badgeId })` |

**GET /gamification/status**
- Response: `{ xp, level, streak, rank, nextLevelXp, badges: number, missionsActive: number }`

**GET /leaderboard**
- Query: `scope=class|school`, `classId?`, `limit=20`
- Response: `{ entries: [{ rank, userId, displayName, xp, level, avatar? }] }`

**POST /claim-badge**
- Body: `{ badgeId: string }`
- Response: `{ claimed: boolean, badge: { id, title, icon, rarity } }`

---

### Grades & Study Plan

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| GET | `/grades/summary` | Grade summary per subject for student | `orchGrades.getSummary(client, userId, tenantId)` |
| POST | `/grades/simulate` | Simulate "what-if" grades | `orchGrades.simulate(client, userId, { subjectId, grade })` |
| GET | `/study-plan` | Get current AI-generated study plan | `orchStudyPlan.getCurrent(client, userId, tenantId)` |
| POST | `/study-plan/generate` | Generate/regenerate study plan | `orchStudyPlan.generate(client, userId, tenantId)` |
| GET | `/student-xray/:studentId` | Full student X-ray (staff only) | `orchStudentXray.get(client, studentId, tenantId)` |

**GET /grades/summary**
- Response: `{ subjects: [{ id, name, grades: [{ label, value, weight }], average, trend }] }`

**POST /grades/simulate**
- Body: `{ subjectId: string, grade: number }`
- Response: `{ currentAvg, simulatedAvg, delta, willPass: boolean }`

**GET /student-xray/:studentId**
- Auth: staff/admin role
- Response: `{ student, riskLevel, d7Profile, grades, attendance, engagementMetrics, aiInteractions }`

---

## EPIC-03: AI Assessment & Risk Engine

### Assessment (Foucault Engine)

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| POST | `/assessment/submit` | Submit a completed assessment | `orchAssessment.submit(client, { studentId, assessmentId, answers })` |
| GET | `/assessment/:id` | Get assessment details | `orchAssessment.getById(client, assessmentId)` |
| GET | `/assessment/:id/report` | AI-generated assessment report | `orchAssessment.getReport(client, assessmentId)` |
| POST | `/assessment/:id/review` | Teacher review/override of AI grading | `orchAssessment.review(client, assessmentId, { teacherId, overrides })` |
| GET | `/assessment/student/:studentId` | All assessments for a student | `orchAssessment.getByStudent(client, studentId, { limit?, offset? })` |
| GET | `/assessment/class/:classId` | Class-level assessment analytics | `orchAssessment.getClassAnalytics(client, classId)` |

**POST /assessment/submit**
- Body: `{ studentId: string, assessmentId: string, answers: [{ questionId: string, answer: string }] }`
- Response: `{ submissionId, score, totalPoints, aiGradingStatus: 'pending' | 'complete' }`

**GET /assessment/:id/report**
- Response: `{ assessmentId, studentName, score, rubricBreakdown, strengthAreas, weakAreas, recommendations, bloomLevel }`

**POST /assessment/:id/review**
- Auth: teacher/admin role
- Body: `{ teacherId: string, overrides: [{ questionId: string, newScore: number, justification: string }] }`
- Response: `{ updated: boolean, newTotalScore: number }`

---

### Risk Engine (Taylor + Foucault)

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| GET | `/risk/class/:classId` | Risk overview for entire class | `orchRisk.getClassRisk(client, classId)` |
| GET | `/risk/student/:studentId` | Individual student risk details | `orchRisk.getStudentRisk(client, studentId)` |
| POST | `/risk/assess` | Trigger risk reassessment | `orchRisk.assess(client, { studentId?, classId? })` |

**GET /risk/class/:classId**
- Response: `{ classId, students: [{ id, name, riskLevel: 'green'|'yellow'|'red', riskScore, factors }], summary: { green, yellow, red } }`

**GET /risk/student/:studentId**
- Response: `{ studentId, riskLevel, riskScore, factors: [{ name, weight, value }], trend, lastAssessed, recommendations }`

**POST /risk/assess**
- Body: `{ studentId?: string, classId?: string }` (at least one required)
- Response: `{ assessed: number, updated: number }`

---

### D7 Intelligence Profile

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| GET | `/d7/:studentId` | Get D7 profile for student | `orchD7.getProfile(client, studentId)` |
| GET | `/d7/:studentId/weekly` | Weekly D7 snapshot | `orchD7.getWeekly(client, studentId)` |
| POST | `/d7/generate` | Generate/update D7 profile | `orchD7.generate(client, { studentId })` |
| GET | `/d7/class/:classId` | Aggregated D7 for a class | `orchD7.getClassProfile(client, classId)` |

**GET /d7/:studentId**
- Response:
```json
{
  "studentId": "uuid",
  "dimensions": {
    "cognitive": { "score": 7.5, "trend": "up", "details": "..." },
    "emotional": { "score": 6.0, "trend": "stable", "details": "..." },
    "social": { "score": 8.0, "trend": "up", "details": "..." },
    "behavioral": { "score": 5.5, "trend": "down", "details": "..." },
    "academic": { "score": 7.0, "trend": "up", "details": "..." },
    "motivational": { "score": 6.5, "trend": "stable", "details": "..." },
    "metacognitive": { "score": 7.0, "trend": "up", "details": "..." }
  },
  "overallScore": 6.8,
  "generatedAt": "2026-03-23T..."
}
```

**POST /d7/generate**
- Body: `{ studentId: string }`
- Auth: staff/admin role
- Response: `{ generated: boolean, profileId: string }`

---

## EPIC-04: Orch Admin (Staff-Facing AI)

### Chat (RAG-powered)

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| POST | `/orch-admin/chat` | Send message to Admin AI assistant | `orchAdminChat.chat(client, { userId, tenantId, message, routeContext, sessionId? })` |
| GET | `/orch-admin/conversations` | List user's conversations | `orchAdminChat.listConversations(client, userId, tenantId, limit?, offset?)` |

**POST /orch-admin/chat**
- Body: `{ message: string, routeContext: string, sessionId?: string }`
- Response: `{ sessionId, message, sources: [{ sourceFile, similarity }], suggestedWalkthrough?: { id, title }, domFillAction?: [{ selector, value, action }] }`
- Auth: staff/admin role
- Notes: Supports SSE streaming. Set `Accept: text/event-stream` for streaming mode.

**GET /orch-admin/conversations**
- Query: `limit=20`, `offset=0`
- Response: `{ conversations: [{ id, title, lastMessageAt, messageCount }] }`

---

### Page Context

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| GET | `/orch-admin/context/:route` | Get knowledge context for a route | `orchAdminKnowledge.search(client, { tenantId, query: route, routeContext: route })` |
| GET | `/orch-admin/suggestions/:route` | Get proactive suggestions for a route | `orchAdminWalkthroughs.suggestWhenStuck(client, route)` |

**GET /orch-admin/context/:route**
- Param: `route` (URL-encoded, e.g., `/students/new`)
- Response: `{ chunks: [{ chunkText, sourceFile, similarity }], walkthroughs: [{ id, title }] }`

**GET /orch-admin/suggestions/:route**
- Response: `{ suggestions: [{ id, title, description, steps: number }] }`

---

### Walkthroughs

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| GET | `/orch-admin/walkthroughs` | List all walkthroughs | `orchAdminWalkthroughs.getAvailable(client, { tenantId, route? })` |
| POST | `/orch-admin/walkthrough/:id/start` | Start a walkthrough | `orchAdminWalkthroughs.start(client, { walkthroughId, userId })` |
| POST | `/orch-admin/walkthrough/:id/complete` | Complete a walkthrough | `orchAdminWalkthroughs.complete(client, { walkthroughId, userId })` |

**GET /orch-admin/walkthroughs**
- Query: `route?` (filter by page)
- Response: `{ walkthroughs: [{ id, title, description, route, steps: number, timesUsed, avgCompletionPct }] }`

**POST /orch-admin/walkthrough/:id/start**
- Response: `{ walkthroughId, userId, status: 'in_progress', steps: [{ order, selector, title, content, placement }] }`

**POST /orch-admin/walkthrough/:id/complete**
- Response: `{ completed: true }`

---

### Alerts

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| GET | `/orch-admin/alerts` | Get alerts for current user | `orchAdminAlerts.getAlerts(client, { tenantId, userId, category?, unreadOnly? })` |
| POST | `/orch-admin/alerts/:id/read` | Mark alert as read | `orchAdminAlerts.markRead(client, alertId, userId)` |
| POST | `/orch-admin/alerts/:id/dismiss` | Dismiss alert | `orchAdminAlerts.dismiss(client, alertId, userId)` |

**GET /orch-admin/alerts**
- Query: `category?=student|class|admission|system`, `unreadOnly?=true`, `limit=50`, `offset=0`
- Response: `{ alerts: [{ id, category, severity, title, description, actionUrl, createdAt, isRead }], total: number }`

**POST /orch-admin/alerts/:id/read**
- Response: `{ success: true }`

**POST /orch-admin/alerts/:id/dismiss**
- Response: `{ success: true }`

---

### Feedback

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| POST | `/orch-admin/feedback` | Submit feedback on assistant message | `orchStaffFeedback.submitActive(client, { userId, tenantId, messageId, rating, comment? })` |

**POST /orch-admin/feedback**
- Body: `{ messageId: string, rating: 'helpful' | 'unhelpful', comment?: string }`
- Response: `{ success: true }`

---

### DOM Scanner

| Method | Path | Description | Service Method |
|--------|------|-------------|----------------|
| POST | `/orch-admin/dom/scan` | Receive DOM snapshot for context awareness | `orchAdminContext.processDomSnapshot(client, { tenantId, route, elements })` |

**POST /orch-admin/dom/scan**
- Body: `{ route: string, elements: [{ selector: string, type: string, label?: string, value?: string }] }`
- Response: `{ processed: true, fieldsDetected: number }`
- Notes: Called by frontend SDK on page load/navigation. Enables form_fill and walkthrough features.

---

## Summary

| Epic | Endpoints | Story Points |
|------|-----------|-------------|
| EPIC-02 (Orch AVA) | 16 | 34 |
| EPIC-03 (Assessment & Risk) | 13 | 29 |
| EPIC-04 (Orch Admin) | 12 | 21 |
| **Total** | **41** | **84** |

## Auth Matrix

| Role | EPIC-02 | EPIC-03 | EPIC-04 |
|------|---------|---------|---------|
| Student | Full access (own data) | Read own assessments/risk/D7 | No access |
| Teacher | Read + student-xray | Full access (own classes) | Full access |
| Coordinator | Read + student-xray | Full access (all classes) | Full access |
| Admin | Full access | Full access | Full access |
