# EPIC-06: Dashboard Professor — LiveLab — Guia de Implementacao Cirurgico

**Para:** Giuseppe "King Witcher"
**Stack:** Express 5 + React 19 monorepo (Vite 7, Tailwind v4, Keycloak 26)
**Codebase:** `C:/Projetos IA/Plataforma Cogedu/localhost/cogedu-dev-v6/cogedu-main/`
**Pontos totais:** 16 pts (5 + 8 + 3)
**Prazo estimado:** 1 semana
**Dependencia:** EPIC-02 + EPIC-03 COMPLETOS (Taylor, Foucault, Weber, Bloom, Ebbinghaus)
**Status:** PRONTO PARA IMPLEMENTACAO

---

## DEPENDENCIAS CRITICAS

Este epic consome dados produzidos por EPIC-02 e EPIC-03. Se esses dados nao existem, o dashboard mostra zeros.

```sql
-- VALIDAR ANTES DE COMECAR. Todos devem retornar > 0.

-- Taylor (engagement) — EPIC-02
SELECT COUNT(*) FROM orch_engagement_snapshot;

-- Bloom (notas) — EPIC-02
SELECT COUNT(*) FROM orch_bloom_assessment;

-- Ebbinghaus (retencao) — EPIC-02
SELECT COUNT(*) FROM orch_concept_memory;

-- Foucault (risco) — EPIC-03
SELECT COUNT(*) FROM orch_risk_assessment;

-- Weber (D7) — EPIC-03
SELECT COUNT(*) FROM orch_d7_report;

-- Gardner (cognitivo) — EPIC-03
SELECT COUNT(*) FROM orch_cognitive_observation;

-- Student profiles — EPIC-02
SELECT COUNT(*) FROM orch_student_profile;

-- Total tabelas orch_* deve ser >= 15
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'orch_%';
```

Se QUALQUER query retornar 0: PARAR. Nao adianta construir dashboard sem dados. Resolver EPICs anteriores primeiro.

---

## STORY-06.1: Endpoints Dashboard (5 pts, API)

**Complexidade:** Media
**Tempo:** 2-3 dias
**Dependencias:** Tabelas de EPIC-02 + EPIC-03 populadas

### Overview

6 endpoints GET para alimentar o dashboard do professor. Todos requerem:
- `requireAuth()` middleware
- Validacao de role: `professor` ou `coordinator`
- Validacao de ownership: professor pertence a turma via tabela `class_instance` ou `enrollment`
- Pool client com release no finally

### Validacao de ownership (reutilizar em todos os endpoints)

Criar um helper em `apps/api/src/app/services/orch-dashboard-auth.ts`:

```typescript
import { PoolClient } from 'pg';

export async function validateTeacherOwnership(
  client: PoolClient,
  userId: string,
  classId: string,
  tenantId: string
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM class_instance ci
      JOIN class_instance_teacher cit ON cit.class_instance_id = ci.id
      WHERE ci.id = $1
        AND cit.teacher_id = $2
        AND ci.tenant_id = $3
    ) AS exists`,
    [classId, userId, tenantId]
  );
  return result.rows[0]?.exists ?? false;
}
```

Se `validateTeacherOwnership` retornar false: responder `403 Forbidden`.

---

### Endpoint 1: GET /dashboard/class/:classId — Overview da turma

**Path:** `apps/api/src/endpoints/orchDashboardClassOverview/`
**Arquivos:**
- `orchDashboardClassOverview.ts` (handler)
- `index.ts` (barrel: `export * from './orchDashboardClassOverview'`)

#### Handler

```typescript
import { Pool } from 'pg';
import { RequestHandler } from 'express';
import { object, string } from 'yup';
import { requireAuth } from '../../middlewares/requireAuth';
import { validateTeacherOwnership } from '../../app/services/orch-dashboard-auth';

export const method = 'GET';
export const path = '/api/v1/orch/dashboard/class/:classId';
export const middlewares = [requireAuth()];

const paramsSchema = object({
  classId: string().uuid().required(),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client;
    try {
      const { classId } = await paramsSchema.validate(req.params);
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      client = await pool.connect();

      const isOwner = await validateTeacherOwnership(client, userId, classId, tenantId);
      if (!isOwner) return res.status(403).json({ error: 'Voce nao pertence a esta turma' });

      const result = await client.query(`
        WITH class_students AS (
          SELECT e.student_id
          FROM enrollment e
          WHERE e.class_instance_id = $1
            AND e.status = 'active'
            AND e.tenant_id = $2
        ),
        engagement AS (
          SELECT
            AVG(es.engagement_score) AS avg_engagement
          FROM orch_engagement_snapshot es
          JOIN class_students cs ON cs.student_id = es.student_id
          WHERE es.snapshot_date = CURRENT_DATE
        ),
        mastery AS (
          SELECT
            AVG(sp.overall_mastery) AS avg_mastery
          FROM orch_student_profile sp
          JOIN class_students cs ON cs.student_id = sp.student_id
        ),
        risk AS (
          SELECT
            COUNT(*) FILTER (WHERE ra.risk_level IN ('yellow', 'orange', 'red', 'critical')) AS at_risk_count,
            COUNT(*) AS total_students
          FROM class_students cs
          LEFT JOIN LATERAL (
            SELECT risk_level
            FROM orch_risk_assessment ra2
            WHERE ra2.student_id = cs.student_id
            ORDER BY ra2.assessed_at DESC
            LIMIT 1
          ) ra ON true
        ),
        prediction AS (
          SELECT
            AVG(ba.final_score) AS avg_score,
            AVG(ba.final_score) -
              AVG(ba_prev.final_score) AS trend
          FROM orch_bloom_assessment ba
          JOIN class_students cs ON cs.student_id = ba.student_id
          LEFT JOIN LATERAL (
            SELECT final_score
            FROM orch_bloom_assessment ba2
            WHERE ba2.student_id = ba.student_id
              AND ba2.created_at < ba.created_at
            ORDER BY ba2.created_at DESC
            LIMIT 1
          ) ba_prev ON true
          WHERE ba.created_at > NOW() - INTERVAL '30 days'
        )
        SELECT
          r.total_students,
          COALESCE(ROUND(e.avg_engagement::numeric, 1), 0) AS avg_engagement,
          COALESCE(ROUND(m.avg_mastery::numeric, 1), 0) AS avg_mastery,
          COALESCE(r.at_risk_count, 0) AS at_risk_count,
          COALESCE(ROUND(p.avg_score::numeric, 1), 0) AS avg_score,
          COALESCE(ROUND(p.trend::numeric, 2), 0) AS trend
        FROM risk r, engagement e, mastery m, prediction p
      `, [classId, tenantId]);

      const row = result.rows[0];
      const trendDirection = row.trend > 0 ? 'subindo' : row.trend < 0 ? 'caindo' : 'estavel';

      return res.json({
        classId,
        totalStudents: Number(row.total_students),
        avgEngagement: Number(row.avg_engagement),
        avgMastery: Number(row.avg_mastery),
        atRiskCount: Number(row.at_risk_count),
        prediction: `Turma deve fechar com media ${row.avg_score} (tendencia ${trendDirection})`,
        avgScore: Number(row.avg_score),
        trend: Number(row.trend),
      });
    } catch (err) {
      console.error('[orchDashboardClassOverview]', err);
      return res.status(500).json({ error: 'Erro ao carregar overview da turma' });
    } finally {
      client?.release();
    }
  };
}
```

#### Response shape

```typescript
interface ClassOverviewResponse {
  classId: string;
  totalStudents: number;
  avgEngagement: number;   // 0-100
  avgMastery: number;      // 0-100
  atRiskCount: number;
  prediction: string;
  avgScore: number;
  trend: number;           // positivo = melhorando
}
```

#### Validacao

```bash
curl http://localhost:3000/api/v1/orch/dashboard/class/CLASS_UUID \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Deve retornar: totalStudents, avgEngagement, avgMastery, atRiskCount, prediction
```

---

### Endpoint 2: GET /dashboard/class/:classId/live — Quem esta online AGORA

**Path:** `apps/api/src/endpoints/orchDashboardLive/`
**Arquivos:**
- `orchDashboardLive.ts` (handler)
- `index.ts` (barrel)

#### SQL principal

```sql
SELECT DISTINCT ON (e.student_id)
  e.student_id,
  u.full_name,
  u.avatar_url,
  el.event_type,
  el.created_at AS last_seen,
  EXTRACT(EPOCH FROM (NOW() - el.created_at)) / 60 AS minutes_ago
FROM enrollment e
JOIN "user" u ON u.id = e.student_id
LEFT JOIN LATERAL (
  SELECT event_type, created_at
  FROM experience_events ee
  WHERE ee.user_id = e.student_id
  ORDER BY ee.created_at DESC
  LIMIT 1
) el ON true
WHERE e.class_instance_id = $1
  AND e.status = 'active'
  AND e.tenant_id = $2
  AND el.created_at > NOW() - INTERVAL '15 minutes'
ORDER BY e.student_id, el.created_at DESC
```

#### Response shape

```typescript
interface LiveResponse {
  classId: string;
  onlineCount: number;
  students: {
    studentId: string;
    fullName: string;
    avatarUrl: string | null;
    lastEvent: string;        // tipo do ultimo evento
    lastSeen: string;         // ISO timestamp
    minutesAgo: number;
    isConfused: boolean;      // true se ultimo evento foi erro/duvida
  }[];
}
```

#### Logica de `isConfused`

```typescript
// Considerar "confused" se o ultimo evento do aluno foi:
const CONFUSED_EVENTS = ['ai_doubt', 'answer_wrong', 'help_request', 'retry_attempt'];
const isConfused = CONFUSED_EVENTS.includes(row.event_type);
```

#### Handler completo

```typescript
import { Pool } from 'pg';
import { RequestHandler } from 'express';
import { object, string } from 'yup';
import { requireAuth } from '../../middlewares/requireAuth';
import { validateTeacherOwnership } from '../../app/services/orch-dashboard-auth';

export const method = 'GET';
export const path = '/api/v1/orch/dashboard/class/:classId/live';
export const middlewares = [requireAuth()];

const paramsSchema = object({
  classId: string().uuid().required(),
});

const CONFUSED_EVENTS = ['ai_doubt', 'answer_wrong', 'help_request', 'retry_attempt'];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client;
    try {
      const { classId } = await paramsSchema.validate(req.params);
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      client = await pool.connect();

      const isOwner = await validateTeacherOwnership(client, userId, classId, tenantId);
      if (!isOwner) return res.status(403).json({ error: 'Voce nao pertence a esta turma' });

      const result = await client.query(`
        SELECT DISTINCT ON (e.student_id)
          e.student_id,
          u.full_name,
          u.avatar_url,
          el.event_type,
          el.created_at AS last_seen,
          EXTRACT(EPOCH FROM (NOW() - el.created_at)) / 60 AS minutes_ago
        FROM enrollment e
        JOIN "user" u ON u.id = e.student_id
        LEFT JOIN LATERAL (
          SELECT event_type, created_at
          FROM experience_events ee
          WHERE ee.user_id = e.student_id
          ORDER BY ee.created_at DESC
          LIMIT 1
        ) el ON true
        WHERE e.class_instance_id = $1
          AND e.status = 'active'
          AND e.tenant_id = $2
          AND el.created_at > NOW() - INTERVAL '15 minutes'
        ORDER BY e.student_id, el.created_at DESC
      `, [classId, tenantId]);

      const students = result.rows.map(row => ({
        studentId: row.student_id,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
        lastEvent: row.event_type,
        lastSeen: row.last_seen,
        minutesAgo: Math.round(Number(row.minutes_ago)),
        isConfused: CONFUSED_EVENTS.includes(row.event_type),
      }));

      return res.json({
        classId,
        onlineCount: students.length,
        students,
      });
    } catch (err) {
      console.error('[orchDashboardLive]', err);
      return res.status(500).json({ error: 'Erro ao carregar alunos online' });
    } finally {
      client?.release();
    }
  };
}
```

#### Validacao

```bash
curl http://localhost:3000/api/v1/orch/dashboard/class/CLASS_UUID/live \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Deve retornar: onlineCount, students[] com minutesAgo e isConfused
```

---

### Endpoint 3: GET /dashboard/class/:classId/mastery — Dominio medio por skill

**Path:** `apps/api/src/endpoints/orchDashboardMastery/`
**Arquivos:**
- `orchDashboardMastery.ts` (handler)
- `index.ts` (barrel)

#### SQL principal

```sql
SELECT
  cm.concept_label AS skill,
  ROUND(AVG(cm.retention_score)::numeric, 2) AS avg_retention,
  COUNT(DISTINCT cm.student_id) AS student_count,
  COUNT(*) FILTER (WHERE cm.retention_score < 0.5) AS struggling_count
FROM orch_concept_memory cm
JOIN enrollment e ON e.student_id = cm.student_id
WHERE e.class_instance_id = $1
  AND e.status = 'active'
  AND e.tenant_id = $2
GROUP BY cm.concept_label
ORDER BY avg_retention ASC
```

#### Response shape

```typescript
interface MasteryResponse {
  classId: string;
  skills: {
    skill: string;
    avgRetention: number;       // 0.0 - 1.0
    studentCount: number;
    strugglingCount: number;    // alunos com retencao < 50%
    strugglingPercent: number;  // strugglingCount / studentCount * 100
  }[];
}
```

#### Handler

```typescript
import { Pool } from 'pg';
import { RequestHandler } from 'express';
import { object, string } from 'yup';
import { requireAuth } from '../../middlewares/requireAuth';
import { validateTeacherOwnership } from '../../app/services/orch-dashboard-auth';

export const method = 'GET';
export const path = '/api/v1/orch/dashboard/class/:classId/mastery';
export const middlewares = [requireAuth()];

const paramsSchema = object({
  classId: string().uuid().required(),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client;
    try {
      const { classId } = await paramsSchema.validate(req.params);
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      client = await pool.connect();

      const isOwner = await validateTeacherOwnership(client, userId, classId, tenantId);
      if (!isOwner) return res.status(403).json({ error: 'Voce nao pertence a esta turma' });

      const result = await client.query(`
        SELECT
          cm.concept_label AS skill,
          ROUND(AVG(cm.retention_score)::numeric, 2) AS avg_retention,
          COUNT(DISTINCT cm.student_id) AS student_count,
          COUNT(*) FILTER (WHERE cm.retention_score < 0.5) AS struggling_count
        FROM orch_concept_memory cm
        JOIN enrollment e ON e.student_id = cm.student_id
        WHERE e.class_instance_id = $1
          AND e.status = 'active'
          AND e.tenant_id = $2
        GROUP BY cm.concept_label
        ORDER BY avg_retention ASC
      `, [classId, tenantId]);

      const skills = result.rows.map(row => ({
        skill: row.skill,
        avgRetention: Number(row.avg_retention),
        studentCount: Number(row.student_count),
        strugglingCount: Number(row.struggling_count),
        strugglingPercent: Math.round(
          (Number(row.struggling_count) / Number(row.student_count)) * 100
        ),
      }));

      return res.json({ classId, skills });
    } catch (err) {
      console.error('[orchDashboardMastery]', err);
      return res.status(500).json({ error: 'Erro ao carregar mastery da turma' });
    } finally {
      client?.release();
    }
  };
}
```

#### Validacao

```bash
curl http://localhost:3000/api/v1/orch/dashboard/class/CLASS_UUID/mastery \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Deve retornar: skills[] ordenados por avgRetention ASC (piores primeiro)
```

---

### Endpoint 4: GET /dashboard/class/:classId/risk-map — Mapa de risco visual

**Path:** `apps/api/src/endpoints/orchDashboardRiskMap/`
**Arquivos:**
- `orchDashboardRiskMap.ts` (handler)
- `index.ts` (barrel)

#### SQL principal

```sql
WITH latest_risk AS (
  SELECT DISTINCT ON (ra.student_id)
    ra.student_id,
    ra.risk_level,
    ra.risk_score,
    ra.dimensions,
    ra.assessed_at
  FROM orch_risk_assessment ra
  JOIN enrollment e ON e.student_id = ra.student_id
  WHERE e.class_instance_id = $1
    AND e.status = 'active'
    AND e.tenant_id = $2
  ORDER BY ra.student_id, ra.assessed_at DESC
)
SELECT
  risk_level,
  COUNT(*) AS count,
  json_agg(json_build_object(
    'studentId', lr.student_id,
    'riskScore', lr.risk_score,
    'assessedAt', lr.assessed_at
  )) AS students
FROM latest_risk lr
GROUP BY risk_level
ORDER BY
  CASE risk_level
    WHEN 'critical' THEN 1
    WHEN 'red' THEN 2
    WHEN 'orange' THEN 3
    WHEN 'yellow' THEN 4
    WHEN 'green' THEN 5
  END
```

#### Response shape

```typescript
interface RiskMapResponse {
  classId: string;
  summary: {
    green: number;
    yellow: number;
    orange: number;
    red: number;
    critical: number;
    total: number;
  };
  groups: {
    riskLevel: 'green' | 'yellow' | 'orange' | 'red' | 'critical';
    count: number;
    students: {
      studentId: string;
      riskScore: number;
      assessedAt: string;
    }[];
  }[];
}
```

#### Handler

```typescript
import { Pool } from 'pg';
import { RequestHandler } from 'express';
import { object, string } from 'yup';
import { requireAuth } from '../../middlewares/requireAuth';
import { validateTeacherOwnership } from '../../app/services/orch-dashboard-auth';

export const method = 'GET';
export const path = '/api/v1/orch/dashboard/class/:classId/risk-map';
export const middlewares = [requireAuth()];

const paramsSchema = object({
  classId: string().uuid().required(),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client;
    try {
      const { classId } = await paramsSchema.validate(req.params);
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      client = await pool.connect();

      const isOwner = await validateTeacherOwnership(client, userId, classId, tenantId);
      if (!isOwner) return res.status(403).json({ error: 'Voce nao pertence a esta turma' });

      const result = await client.query(`
        WITH latest_risk AS (
          SELECT DISTINCT ON (ra.student_id)
            ra.student_id,
            ra.risk_level,
            ra.risk_score,
            ra.assessed_at
          FROM orch_risk_assessment ra
          JOIN enrollment e ON e.student_id = ra.student_id
          WHERE e.class_instance_id = $1
            AND e.status = 'active'
            AND e.tenant_id = $2
          ORDER BY ra.student_id, ra.assessed_at DESC
        )
        SELECT
          risk_level,
          COUNT(*) AS count,
          json_agg(json_build_object(
            'studentId', student_id,
            'riskScore', risk_score,
            'assessedAt', assessed_at
          )) AS students
        FROM latest_risk
        GROUP BY risk_level
        ORDER BY
          CASE risk_level
            WHEN 'critical' THEN 1
            WHEN 'red' THEN 2
            WHEN 'orange' THEN 3
            WHEN 'yellow' THEN 4
            WHEN 'green' THEN 5
          END
      `, [classId, tenantId]);

      const summary = { green: 0, yellow: 0, orange: 0, red: 0, critical: 0, total: 0 };
      const groups = result.rows.map(row => {
        const level = row.risk_level as keyof typeof summary;
        const count = Number(row.count);
        if (level in summary) summary[level] = count;
        summary.total += count;
        return {
          riskLevel: level,
          count,
          students: row.students,
        };
      });

      return res.json({ classId, summary, groups });
    } catch (err) {
      console.error('[orchDashboardRiskMap]', err);
      return res.status(500).json({ error: 'Erro ao carregar mapa de risco' });
    } finally {
      client?.release();
    }
  };
}
```

#### Validacao

```bash
curl http://localhost:3000/api/v1/orch/dashboard/class/CLASS_UUID/risk-map \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Deve retornar: summary com contagem por nivel + groups com lista de alunos
```

---

### Endpoint 5: GET /dashboard/class/:classId/predictions — Predicoes de nota final

**Path:** `apps/api/src/endpoints/orchDashboardPredictions/`
**Arquivos:**
- `orchDashboardPredictions.ts` (handler)
- `index.ts` (barrel)

#### SQL principal

```sql
WITH class_students AS (
  SELECT e.student_id
  FROM enrollment e
  WHERE e.class_instance_id = $1
    AND e.status = 'active'
    AND e.tenant_id = $2
),
student_composites AS (
  SELECT
    cs.student_id,
    u.full_name,
    COALESCE(sp.overall_mastery, 0) AS mastery,
    COALESCE(es.engagement_score, 0) AS engagement,
    COALESCE(ba.avg_score, 0) AS avg_grade,
    COALESCE(
      CASE ra.risk_level
        WHEN 'green' THEN 1.0
        WHEN 'yellow' THEN 0.8
        WHEN 'orange' THEN 0.6
        WHEN 'red' THEN 0.3
        WHEN 'critical' THEN 0.1
      END, 0.5
    ) AS risk_factor
  FROM class_students cs
  JOIN "user" u ON u.id = cs.student_id
  LEFT JOIN orch_student_profile sp ON sp.student_id = cs.student_id
  LEFT JOIN LATERAL (
    SELECT engagement_score
    FROM orch_engagement_snapshot
    WHERE student_id = cs.student_id
    ORDER BY snapshot_date DESC
    LIMIT 1
  ) es ON true
  LEFT JOIN LATERAL (
    SELECT AVG(final_score) AS avg_score
    FROM orch_bloom_assessment
    WHERE student_id = cs.student_id
      AND created_at > NOW() - INTERVAL '90 days'
  ) ba ON true
  LEFT JOIN LATERAL (
    SELECT risk_level
    FROM orch_risk_assessment
    WHERE student_id = cs.student_id
    ORDER BY assessed_at DESC
    LIMIT 1
  ) ra ON true
)
SELECT
  student_id,
  full_name,
  mastery,
  engagement,
  avg_grade,
  risk_factor,
  -- Predicao ponderada: 40% nota, 25% mastery, 20% engagement, 15% risco
  ROUND(
    (avg_grade * 0.40 + mastery * 0.25 + engagement * 0.20 + risk_factor * 10 * 0.15)::numeric,
    1
  ) AS predicted_final
FROM student_composites
ORDER BY predicted_final ASC
```

#### Response shape

```typescript
interface PredictionsResponse {
  classId: string;
  classPredictedAvg: number;
  students: {
    studentId: string;
    fullName: string;
    mastery: number;
    engagement: number;
    avgGrade: number;
    riskFactor: number;
    predictedFinal: number;    // nota predita 0-10
    willPass: boolean;         // predictedFinal >= 6.0
  }[];
  distribution: {
    above8: number;
    between6and8: number;
    below6: number;
  };
}
```

#### Handler

```typescript
import { Pool } from 'pg';
import { RequestHandler } from 'express';
import { object, string } from 'yup';
import { requireAuth } from '../../middlewares/requireAuth';
import { validateTeacherOwnership } from '../../app/services/orch-dashboard-auth';

export const method = 'GET';
export const path = '/api/v1/orch/dashboard/class/:classId/predictions';
export const middlewares = [requireAuth()];

const paramsSchema = object({
  classId: string().uuid().required(),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client;
    try {
      const { classId } = await paramsSchema.validate(req.params);
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      client = await pool.connect();

      const isOwner = await validateTeacherOwnership(client, userId, classId, tenantId);
      if (!isOwner) return res.status(403).json({ error: 'Voce nao pertence a esta turma' });

      const result = await client.query(`
        WITH class_students AS (
          SELECT e.student_id
          FROM enrollment e
          WHERE e.class_instance_id = $1
            AND e.status = 'active'
            AND e.tenant_id = $2
        ),
        student_composites AS (
          SELECT
            cs.student_id,
            u.full_name,
            COALESCE(sp.overall_mastery, 0) AS mastery,
            COALESCE(es.engagement_score, 0) AS engagement,
            COALESCE(ba.avg_score, 0) AS avg_grade,
            COALESCE(
              CASE ra.risk_level
                WHEN 'green' THEN 1.0
                WHEN 'yellow' THEN 0.8
                WHEN 'orange' THEN 0.6
                WHEN 'red' THEN 0.3
                WHEN 'critical' THEN 0.1
              END, 0.5
            ) AS risk_factor
          FROM class_students cs
          JOIN "user" u ON u.id = cs.student_id
          LEFT JOIN orch_student_profile sp ON sp.student_id = cs.student_id
          LEFT JOIN LATERAL (
            SELECT engagement_score
            FROM orch_engagement_snapshot
            WHERE student_id = cs.student_id
            ORDER BY snapshot_date DESC
            LIMIT 1
          ) es ON true
          LEFT JOIN LATERAL (
            SELECT AVG(final_score) AS avg_score
            FROM orch_bloom_assessment
            WHERE student_id = cs.student_id
              AND created_at > NOW() - INTERVAL '90 days'
          ) ba ON true
          LEFT JOIN LATERAL (
            SELECT risk_level
            FROM orch_risk_assessment
            WHERE student_id = cs.student_id
            ORDER BY assessed_at DESC
            LIMIT 1
          ) ra ON true
        )
        SELECT
          student_id,
          full_name,
          mastery,
          engagement,
          avg_grade,
          risk_factor,
          ROUND(
            (avg_grade * 0.40 + mastery * 0.25 + engagement * 0.20 + risk_factor * 10 * 0.15)::numeric,
            1
          ) AS predicted_final
        FROM student_composites
        ORDER BY predicted_final ASC
      `, [classId, tenantId]);

      const students = result.rows.map(row => ({
        studentId: row.student_id,
        fullName: row.full_name,
        mastery: Number(row.mastery),
        engagement: Number(row.engagement),
        avgGrade: Number(row.avg_grade),
        riskFactor: Number(row.risk_factor),
        predictedFinal: Number(row.predicted_final),
        willPass: Number(row.predicted_final) >= 6.0,
      }));

      const classPredictedAvg = students.length > 0
        ? Math.round(students.reduce((s, st) => s + st.predictedFinal, 0) / students.length * 10) / 10
        : 0;

      const distribution = {
        above8: students.filter(s => s.predictedFinal >= 8).length,
        between6and8: students.filter(s => s.predictedFinal >= 6 && s.predictedFinal < 8).length,
        below6: students.filter(s => s.predictedFinal < 6).length,
      };

      return res.json({ classId, classPredictedAvg, students, distribution });
    } catch (err) {
      console.error('[orchDashboardPredictions]', err);
      return res.status(500).json({ error: 'Erro ao calcular predicoes' });
    } finally {
      client?.release();
    }
  };
}
```

> **Nota:** A v1 usa formula ponderada local. Em EPIC-07, substituir por chamada ao Gemini para predicao mais sofisticada. A formula ponderada serve como fallback caso Gemini esteja offline.

#### Validacao

```bash
curl http://localhost:3000/api/v1/orch/dashboard/class/CLASS_UUID/predictions \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Deve retornar: classPredictedAvg, students[] com predictedFinal, distribution
```

---

### Endpoint 6: GET /dashboard/student/:studentId — Deep dive do aluno

**Path:** `apps/api/src/endpoints/orchDashboardStudentDetail/`
**Arquivos:**
- `orchDashboardStudentDetail.ts` (handler)
- `index.ts` (barrel)

#### SQL principal (3 queries separadas por clareza)

**Query 1 — Profile + risk:**
```sql
SELECT
  u.id AS student_id,
  u.full_name,
  u.avatar_url,
  sp.overall_mastery,
  sp.learning_style,
  sp.archetype,
  g.xp_total,
  g.level,
  g.current_streak,
  ra.risk_level,
  ra.risk_score,
  ra.dimensions AS risk_dimensions,
  ra.assessed_at AS risk_assessed_at
FROM "user" u
LEFT JOIN orch_student_profile sp ON sp.student_id = u.id
LEFT JOIN orch_gamification g ON g.student_id = u.id
LEFT JOIN LATERAL (
  SELECT risk_level, risk_score, dimensions, assessed_at
  FROM orch_risk_assessment
  WHERE student_id = u.id
  ORDER BY assessed_at DESC
  LIMIT 1
) ra ON true
WHERE u.id = $1
```

**Query 2 — Engagement ultimos 30 dias (para sparkline):**
```sql
SELECT
  snapshot_date,
  engagement_score,
  session_count,
  total_time_minutes
FROM orch_engagement_snapshot
WHERE student_id = $1
  AND snapshot_date > CURRENT_DATE - INTERVAL '30 days'
ORDER BY snapshot_date ASC
```

**Query 3 — Ultimo D7:**
```sql
SELECT
  id,
  report_type,
  report_data,
  generated_at
FROM orch_d7_report
WHERE student_id = $1
ORDER BY generated_at DESC
LIMIT 1
```

**Query 4 — Top 3 inteligencias Gardner:**
```sql
SELECT
  intelligence_type,
  confidence_score
FROM orch_cognitive_observation
WHERE student_id = $1
ORDER BY confidence_score DESC
LIMIT 3
```

#### Response shape

```typescript
interface StudentDetailResponse {
  studentId: string;
  fullName: string;
  avatarUrl: string | null;
  profile: {
    overallMastery: number;
    learningStyle: string;
    archetype: string;
  };
  gamification: {
    xpTotal: number;
    level: number;
    currentStreak: number;
  };
  risk: {
    riskLevel: string;
    riskScore: number;
    dimensions: Record<string, number>;  // 8 dimensoes Foucault
    assessedAt: string;
  } | null;
  engagementHistory: {
    date: string;
    score: number;
    sessions: number;
    minutes: number;
  }[];
  topIntelligences: {
    type: string;
    confidence: number;
  }[];
  lastD7: {
    id: string;
    type: string;
    data: Record<string, unknown>;
    generatedAt: string;
  } | null;
}
```

#### Handler

```typescript
import { Pool } from 'pg';
import { RequestHandler } from 'express';
import { object, string } from 'yup';
import { requireAuth } from '../../middlewares/requireAuth';

export const method = 'GET';
export const path = '/api/v1/orch/dashboard/student/:studentId';
export const middlewares = [requireAuth()];

const paramsSchema = object({
  studentId: string().uuid().required(),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    let client;
    try {
      const { studentId } = await paramsSchema.validate(req.params);
      const userId = req.user.id;
      const tenantId = req.user.tenantId;

      client = await pool.connect();

      // Validar que o professor tem acesso a este aluno
      // (aluno esta em alguma turma do professor)
      const accessCheck = await client.query(`
        SELECT EXISTS(
          SELECT 1 FROM enrollment e
          JOIN class_instance_teacher cit ON cit.class_instance_id = e.class_instance_id
          WHERE e.student_id = $1
            AND cit.teacher_id = $2
            AND e.tenant_id = $3
            AND e.status = 'active'
        ) AS has_access
      `, [studentId, userId, tenantId]);

      if (!accessCheck.rows[0]?.has_access) {
        return res.status(403).json({ error: 'Voce nao tem acesso a este aluno' });
      }

      // Query 1: Profile + risk
      const profileResult = await client.query(`
        SELECT
          u.id AS student_id,
          u.full_name,
          u.avatar_url,
          sp.overall_mastery,
          sp.learning_style,
          sp.archetype,
          g.xp_total,
          g.level,
          g.current_streak,
          ra.risk_level,
          ra.risk_score,
          ra.dimensions AS risk_dimensions,
          ra.assessed_at AS risk_assessed_at
        FROM "user" u
        LEFT JOIN orch_student_profile sp ON sp.student_id = u.id
        LEFT JOIN orch_gamification g ON g.student_id = u.id
        LEFT JOIN LATERAL (
          SELECT risk_level, risk_score, dimensions, assessed_at
          FROM orch_risk_assessment
          WHERE student_id = u.id
          ORDER BY assessed_at DESC
          LIMIT 1
        ) ra ON true
        WHERE u.id = $1
      `, [studentId]);

      if (profileResult.rows.length === 0) {
        return res.status(404).json({ error: 'Aluno nao encontrado' });
      }

      const p = profileResult.rows[0];

      // Query 2: Engagement history (30 days)
      const engagementResult = await client.query(`
        SELECT snapshot_date, engagement_score, session_count, total_time_minutes
        FROM orch_engagement_snapshot
        WHERE student_id = $1
          AND snapshot_date > CURRENT_DATE - INTERVAL '30 days'
        ORDER BY snapshot_date ASC
      `, [studentId]);

      // Query 3: Last D7
      const d7Result = await client.query(`
        SELECT id, report_type, report_data, generated_at
        FROM orch_d7_report
        WHERE student_id = $1
        ORDER BY generated_at DESC
        LIMIT 1
      `, [studentId]);

      // Query 4: Top 3 Gardner intelligences
      const gardnerResult = await client.query(`
        SELECT intelligence_type, confidence_score
        FROM orch_cognitive_observation
        WHERE student_id = $1
        ORDER BY confidence_score DESC
        LIMIT 3
      `, [studentId]);

      return res.json({
        studentId: p.student_id,
        fullName: p.full_name,
        avatarUrl: p.avatar_url,
        profile: {
          overallMastery: Number(p.overall_mastery ?? 0),
          learningStyle: p.learning_style ?? 'unknown',
          archetype: p.archetype ?? 'unknown',
        },
        gamification: {
          xpTotal: Number(p.xp_total ?? 0),
          level: Number(p.level ?? 1),
          currentStreak: Number(p.current_streak ?? 0),
        },
        risk: p.risk_level ? {
          riskLevel: p.risk_level,
          riskScore: Number(p.risk_score),
          dimensions: p.risk_dimensions ?? {},
          assessedAt: p.risk_assessed_at,
        } : null,
        engagementHistory: engagementResult.rows.map(row => ({
          date: row.snapshot_date,
          score: Number(row.engagement_score),
          sessions: Number(row.session_count),
          minutes: Number(row.total_time_minutes),
        })),
        topIntelligences: gardnerResult.rows.map(row => ({
          type: row.intelligence_type,
          confidence: Number(row.confidence_score),
        })),
        lastD7: d7Result.rows.length > 0 ? {
          id: d7Result.rows[0].id,
          type: d7Result.rows[0].report_type,
          data: d7Result.rows[0].report_data,
          generatedAt: d7Result.rows[0].generated_at,
        } : null,
      });
    } catch (err) {
      console.error('[orchDashboardStudentDetail]', err);
      return res.status(500).json({ error: 'Erro ao carregar detalhes do aluno' });
    } finally {
      client?.release();
    }
  };
}
```

#### Validacao

```bash
curl http://localhost:3000/api/v1/orch/dashboard/student/STUDENT_UUID \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Deve retornar: profile, gamification, risk, engagementHistory[], topIntelligences[], lastD7
```

---

### Registro dos endpoints

Registrar todos os 6 endpoints no router principal. Localizar o arquivo de registro (provavelmente `apps/api/src/endpoints/index.ts` ou equivalente) e adicionar:

```typescript
import * as orchDashboardClassOverview from './orchDashboardClassOverview';
import * as orchDashboardLive from './orchDashboardLive';
import * as orchDashboardMastery from './orchDashboardMastery';
import * as orchDashboardRiskMap from './orchDashboardRiskMap';
import * as orchDashboardPredictions from './orchDashboardPredictions';
import * as orchDashboardStudentDetail from './orchDashboardStudentDetail';
```

Seguir o mesmo padrao de registro dos endpoints existentes do ORCH.

### Resumo de arquivos STORY-06.1

| # | Path | Tipo |
|---|------|------|
| 1 | `apps/api/src/app/services/orch-dashboard-auth.ts` | Service (helper auth) |
| 2 | `apps/api/src/endpoints/orchDashboardClassOverview/orchDashboardClassOverview.ts` | Endpoint |
| 3 | `apps/api/src/endpoints/orchDashboardClassOverview/index.ts` | Barrel |
| 4 | `apps/api/src/endpoints/orchDashboardLive/orchDashboardLive.ts` | Endpoint |
| 5 | `apps/api/src/endpoints/orchDashboardLive/index.ts` | Barrel |
| 6 | `apps/api/src/endpoints/orchDashboardMastery/orchDashboardMastery.ts` | Endpoint |
| 7 | `apps/api/src/endpoints/orchDashboardMastery/index.ts` | Barrel |
| 8 | `apps/api/src/endpoints/orchDashboardRiskMap/orchDashboardRiskMap.ts` | Endpoint |
| 9 | `apps/api/src/endpoints/orchDashboardRiskMap/index.ts` | Barrel |
| 10 | `apps/api/src/endpoints/orchDashboardPredictions/orchDashboardPredictions.ts` | Endpoint |
| 11 | `apps/api/src/endpoints/orchDashboardPredictions/index.ts` | Barrel |
| 12 | `apps/api/src/endpoints/orchDashboardStudentDetail/orchDashboardStudentDetail.ts` | Endpoint |
| 13 | `apps/api/src/endpoints/orchDashboardStudentDetail/index.ts` | Barrel |

### Definicao de pronto STORY-06.1

- [ ] 6 endpoints respondem 200 com dados reais
- [ ] Todos requerem Bearer token (401 sem token)
- [ ] Professor de outra turma recebe 403
- [ ] Queries nao fazem full table scan (conferir `EXPLAIN ANALYZE`)
- [ ] Zero mocks, zero dados hardcoded

---

## STORY-06.2: Frontend — Teacher Dashboard Page (8 pts)

**Complexidade:** Alta
**Tempo:** 3-4 dias
**Dependencias:** STORY-06.1 (6 endpoints funcionando)

### Pre-requisito: instalar Recharts

```bash
cd apps/web
npm install recharts
```

> Recharts e o unico pacote novo. Lucide-react ja existe no projeto.

---

### Estrutura de pastas

```
apps/web/src/pages/dashboard/
  TeacherDashboard.tsx          # Pagina principal (rota /dashboard/teacher)
apps/web/src/components/dashboard/
  ClassOverview.tsx              # 4 KPI cards
  LiveSection.tsx                # Alunos online agora
  StruggleTopics.tsx             # Bar chart topicos dificeis
  StudentTable.tsx               # Tabela de alunos
  StudentDetailPanel.tsx         # Painel lateral
```

### Rota

Adicionar no router (`apps/web/src/routes/` ou equivalente):

```typescript
{
  path: '/dashboard/teacher',
  element: <TeacherDashboard />,
  // Proteger com role: 'teacher' ou 'coordinator'
}
```

---

### Componente 1: TeacherDashboard.tsx — Pagina principal

**Path:** `apps/web/src/pages/dashboard/TeacherDashboard.tsx`

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { apiFetch } from '../../lib/apiFetch';
import { ClassOverview } from '../../components/dashboard/ClassOverview';
import { LiveSection } from '../../components/dashboard/LiveSection';
import { StruggleTopics } from '../../components/dashboard/StruggleTopics';
import { StudentTable } from '../../components/dashboard/StudentTable';
import { StudentDetailPanel } from '../../components/dashboard/StudentDetailPanel';

export function TeacherDashboard() {
  const { user } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [overview, setOverview] = useState<ClassOverviewData | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Buscar turmas do professor
  useEffect(() => {
    apiFetch<{ id: string; name: string }[]>('/api/v1/classes/teacher/mine')
      .then(data => {
        setClasses(data);
        if (data.length > 0) setSelectedClassId(data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  // Refresh overview a cada 60s
  const fetchOverview = useCallback(async () => {
    if (!selectedClassId) return;
    const data = await apiFetch<ClassOverviewData>(
      `/api/v1/orch/dashboard/class/${selectedClassId}`
    );
    setOverview(data);
  }, [selectedClassId]);

  useEffect(() => {
    fetchOverview();
    intervalRef.current = setInterval(fetchOverview, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchOverview]);

  // Cleanup ao desmontar — previne memory leak
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Nenhuma turma encontrada para este professor.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Dashboard do Professor
        </h1>
        <select
          value={selectedClassId}
          onChange={e => setSelectedClassId(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm"
        >
          {classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Grid 2 colunas desktop, 1 mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coluna esquerda */}
        <div className="space-y-6">
          <ClassOverview classId={selectedClassId} />
          <StruggleTopics classId={selectedClassId} />
        </div>

        {/* Coluna direita */}
        <div className="space-y-6">
          <LiveSection classId={selectedClassId} />
        </div>
      </div>

      {/* Tabela full-width abaixo */}
      <div className="mt-6">
        <StudentTable
          classId={selectedClassId}
          onSelectStudent={setSelectedStudentId}
        />
      </div>

      {/* Painel lateral */}
      {selectedStudentId && (
        <StudentDetailPanel
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
}
```

---

### Componente 2: ClassOverview.tsx — 4 KPI cards

**Path:** `apps/web/src/components/dashboard/ClassOverview.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Activity, Target, AlertTriangle, TrendingUp } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';

interface ClassOverviewProps {
  classId: string;
}

interface OverviewData {
  avgEngagement: number;
  avgMastery: number;
  atRiskCount: number;
  prediction: string;
  avgScore: number;
}

function kpiColor(value: number, thresholds: { good: number; warn: number }): string {
  if (value >= thresholds.good) return 'text-green-600 bg-green-50 border-green-200';
  if (value >= thresholds.warn) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

export function ClassOverview({ classId }: ClassOverviewProps) {
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    apiFetch<OverviewData>(`/api/v1/orch/dashboard/class/${classId}`)
      .then(setData);
  }, [classId]);

  if (!data) return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;

  const cards = [
    {
      label: 'Engajamento',
      value: `${data.avgEngagement}%`,
      icon: Activity,
      color: kpiColor(data.avgEngagement, { good: 70, warn: 40 }),
    },
    {
      label: 'Dominio',
      value: `${data.avgMastery}%`,
      icon: Target,
      color: kpiColor(data.avgMastery, { good: 70, warn: 40 }),
    },
    {
      label: 'Em Risco',
      value: String(data.atRiskCount),
      icon: AlertTriangle,
      // Invertido: mais alunos em risco = pior
      color: data.atRiskCount === 0
        ? 'text-green-600 bg-green-50 border-green-200'
        : data.atRiskCount <= 3
          ? 'text-yellow-600 bg-yellow-50 border-yellow-200'
          : 'text-red-600 bg-red-50 border-red-200',
    },
    {
      label: 'Predicao',
      value: `${data.avgScore}`,
      icon: TrendingUp,
      color: kpiColor(data.avgScore * 10, { good: 70, warn: 50 }),
      subtitle: data.prediction,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {cards.map(card => (
        <div
          key={card.label}
          className={`rounded-xl border p-4 ${card.color}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <card.icon className="h-5 w-5" />
            <span className="text-sm font-medium">{card.label}</span>
          </div>
          <div className="text-3xl font-bold">{card.value}</div>
          {card.subtitle && (
            <div className="text-xs mt-1 opacity-75">{card.subtitle}</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

### Componente 3: LiveSection.tsx — Quem esta online AGORA

**Path:** `apps/web/src/components/dashboard/LiveSection.tsx`

```typescript
import { useState, useEffect, useRef } from 'react';
import { Circle, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';

interface LiveSectionProps {
  classId: string;
}

interface OnlineStudent {
  studentId: string;
  fullName: string;
  avatarUrl: string | null;
  minutesAgo: number;
  isConfused: boolean;
}

export function LiveSection({ classId }: LiveSectionProps) {
  const [students, setStudents] = useState<OnlineStudent[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetch = () => {
      apiFetch<{ onlineCount: number; students: OnlineStudent[] }>(
        `/api/v1/orch/dashboard/class/${classId}/live`
      ).then(data => {
        setStudents(data.students);
        setOnlineCount(data.onlineCount);
      });
    };

    fetch();
    intervalRef.current = setInterval(fetch, 30_000); // 30s polling

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [classId]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Online Agora
        </h2>
        <span className="inline-flex items-center gap-1 text-sm text-green-600">
          <Circle className="h-2 w-2 fill-green-500" />
          {onlineCount} aluno{onlineCount !== 1 ? 's' : ''}
        </span>
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum aluno online no momento.</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {students.map(s => (
            <div
              key={s.studentId}
              className={`flex items-center gap-3 p-2 rounded-lg ${
                s.isConfused ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
              }`}
            >
              {/* Avatar */}
              <div className="relative">
                <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium text-white">
                  {s.avatarUrl ? (
                    <img
                      src={s.avatarUrl}
                      alt={s.fullName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    s.fullName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                  s.minutesAgo <= 5 ? 'bg-green-500' : 'bg-gray-400'
                }`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {s.fullName}
                </p>
                <p className="text-xs text-gray-500">
                  {s.minutesAgo <= 1 ? 'agora' : `ha ${s.minutesAgo}min`}
                </p>
              </div>

              {/* Confused indicator */}
              {s.isConfused && (
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### Componente 4: StruggleTopics.tsx — Topicos mais dificeis

**Path:** `apps/web/src/components/dashboard/StruggleTopics.tsx`

```typescript
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { apiFetch } from '../../lib/apiFetch';

interface StruggleTopicsProps {
  classId: string;
}

interface SkillData {
  skill: string;
  avgRetention: number;
  strugglingPercent: number;
}

function retentionColor(value: number): string {
  if (value >= 0.7) return '#22c55e';
  if (value >= 0.5) return '#eab308';
  if (value >= 0.3) return '#f97316';
  return '#ef4444';
}

export function StruggleTopics({ classId }: StruggleTopicsProps) {
  const [skills, setSkills] = useState<SkillData[]>([]);

  useEffect(() => {
    apiFetch<{ skills: SkillData[] }>(
      `/api/v1/orch/dashboard/class/${classId}/mastery`
    ).then(data => {
      // Top 10 piores retencoes
      setSkills(data.skills.slice(0, 10));
    });
  }, [classId]);

  if (skills.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Topicos com Dificuldade
        </h2>
        <p className="text-sm text-gray-400">Sem dados de retencao ainda.</p>
      </div>
    );
  }

  const chartData = skills.map(s => ({
    name: s.skill.length > 25 ? s.skill.slice(0, 22) + '...' : s.skill,
    fullName: s.skill,
    retention: Math.round(s.avgRetention * 100),
    struggling: s.strugglingPercent,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Topicos com Dificuldade
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        % de retencao media por conceito (piores primeiro)
      </p>
      <ResponsiveContainer width="100%" height={skills.length * 40 + 20}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 20, bottom: 0, left: 120 }}
        >
          <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number) => [`${value}%`, 'Retencao']}
            labelFormatter={(label: string) => {
              const item = chartData.find(d => d.name === label);
              return item?.fullName ?? label;
            }}
          />
          <Bar dataKey="retention" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={retentionColor(entry.retention / 100)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

---

### Componente 5: StudentTable.tsx — Tabela de alunos

**Path:** `apps/web/src/components/dashboard/StudentTable.tsx`

```typescript
import { useState, useEffect, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';

interface StudentTableProps {
  classId: string;
  onSelectStudent: (studentId: string) => void;
}

interface StudentRow {
  studentId: string;
  fullName: string;
  engagement: number;
  riskLevel: string;
  predictedFinal: number;
  lastActivity: string;
}

const RISK_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  green:    { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Baixo' },
  yellow:   { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Atencao' },
  orange:   { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Moderado' },
  red:      { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Alto' },
  critical: { bg: 'bg-red-200',    text: 'text-red-900',    label: 'Critico' },
};

type SortKey = 'fullName' | 'engagement' | 'riskLevel' | 'predictedFinal';

export function StudentTable({ classId, onSelectStudent }: StudentTableProps) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('fullName');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    // Combinar dados de predictions (tem tudo que precisamos)
    apiFetch<{
      students: {
        studentId: string;
        fullName: string;
        engagement: number;
        predictedFinal: number;
      }[];
    }>(`/api/v1/orch/dashboard/class/${classId}/predictions`).then(data => {
      // Enriquecer com risk-map
      apiFetch<{
        groups: { riskLevel: string; students: { studentId: string }[] }[];
      }>(`/api/v1/orch/dashboard/class/${classId}/risk-map`).then(riskData => {
        const riskMap = new Map<string, string>();
        riskData.groups.forEach(g => {
          g.students.forEach(s => riskMap.set(s.studentId, g.riskLevel));
        });

        setStudents(data.students.map(s => ({
          studentId: s.studentId,
          fullName: s.fullName,
          engagement: s.engagement,
          riskLevel: riskMap.get(s.studentId) ?? 'green',
          predictedFinal: s.predictedFinal,
          lastActivity: '', // Pode ser enriquecido com /live
        })));
      });
    });
  }, [classId]);

  const riskOrder = { critical: 0, red: 1, orange: 2, yellow: 3, green: 4 };

  const filtered = useMemo(() => {
    let result = students.filter(s =>
      s.fullName.toLowerCase().includes(search.toLowerCase())
    );

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'fullName':
          cmp = a.fullName.localeCompare(b.fullName);
          break;
        case 'engagement':
          cmp = a.engagement - b.engagement;
          break;
        case 'riskLevel':
          cmp = (riskOrder[a.riskLevel as keyof typeof riskOrder] ?? 4)
              - (riskOrder[b.riskLevel as keyof typeof riskOrder] ?? 4);
          break;
        case 'predictedFinal':
          cmp = a.predictedFinal - b.predictedFinal;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [students, search, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return null;
    return sortAsc
      ? <ChevronUp className="h-4 w-4 inline" />
      : <ChevronDown className="h-4 w-4 inline" />;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Alunos</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar aluno..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-64"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th
                className="px-4 py-3 text-left cursor-pointer hover:text-gray-700"
                onClick={() => handleSort('fullName')}
              >
                Nome <SortIcon column="fullName" />
              </th>
              <th
                className="px-4 py-3 text-center cursor-pointer hover:text-gray-700"
                onClick={() => handleSort('engagement')}
              >
                Engajamento <SortIcon column="engagement" />
              </th>
              <th
                className="px-4 py-3 text-center cursor-pointer hover:text-gray-700"
                onClick={() => handleSort('riskLevel')}
              >
                Risco <SortIcon column="riskLevel" />
              </th>
              <th
                className="px-4 py-3 text-center cursor-pointer hover:text-gray-700"
                onClick={() => handleSort('predictedFinal')}
              >
                Nota Predita <SortIcon column="predictedFinal" />
              </th>
              <th className="px-4 py-3 text-center">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(s => {
              const risk = RISK_BADGE[s.riskLevel] ?? RISK_BADGE.green;
              return (
                <tr
                  key={s.studentId}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => onSelectStudent(s.studentId)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {s.fullName}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {s.engagement}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${risk.bg} ${risk.text}`}>
                      {risk.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-medium">
                    {s.predictedFinal}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      className="text-blue-600 hover:text-blue-800 text-sm"
                      onClick={e => {
                        e.stopPropagation();
                        onSelectStudent(s.studentId);
                      }}
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="p-8 text-center text-sm text-gray-400">
          {search ? 'Nenhum aluno encontrado.' : 'Sem alunos nesta turma.'}
        </div>
      )}
    </div>
  );
}
```

---

### Componente 6: StudentDetailPanel.tsx — Painel lateral (side sheet)

**Path:** `apps/web/src/components/dashboard/StudentDetailPanel.tsx`

```typescript
import { useState, useEffect } from 'react';
import { X, Flame, Trophy, BookOpen } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import { apiFetch } from '../../lib/apiFetch';

interface StudentDetailPanelProps {
  studentId: string;
  onClose: () => void;
}

interface StudentDetail {
  studentId: string;
  fullName: string;
  avatarUrl: string | null;
  profile: {
    overallMastery: number;
    learningStyle: string;
    archetype: string;
  };
  gamification: {
    xpTotal: number;
    level: number;
    currentStreak: number;
  };
  risk: {
    riskLevel: string;
    riskScore: number;
    dimensions: Record<string, number>;
    assessedAt: string;
  } | null;
  engagementHistory: {
    date: string;
    score: number;
    sessions: number;
    minutes: number;
  }[];
  topIntelligences: {
    type: string;
    confidence: number;
  }[];
  lastD7: {
    id: string;
    type: string;
    data: Record<string, unknown>;
    generatedAt: string;
  } | null;
}

const RISK_COLOR: Record<string, string> = {
  green: 'text-green-600',
  yellow: 'text-yellow-600',
  orange: 'text-orange-600',
  red: 'text-red-600',
  critical: 'text-red-800',
};

export function StudentDetailPanel({ studentId, onClose }: StudentDetailPanelProps) {
  const [data, setData] = useState<StudentDetail | null>(null);
  const [showD7, setShowD7] = useState(false);

  useEffect(() => {
    apiFetch<StudentDetail>(
      `/api/v1/orch/dashboard/student/${studentId}`
    ).then(setData);
  }, [studentId]);

  if (!data) {
    return (
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Radar data das 8 dimensoes Foucault
  const radarData = data.risk
    ? Object.entries(data.risk.dimensions).map(([key, value]) => ({
        dimension: key.replace(/_/g, ' '),
        value: Number(value),
        fullMark: 10,
      }))
    : [];

  // Sparkline data
  const sparklineData = data.engagementHistory.map(h => ({
    date: new Date(h.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    score: h.score,
  }));

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700">
            {data.avatarUrl ? (
              <img
                src={data.avatarUrl}
                alt={data.fullName}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              data.fullName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">{data.fullName}</h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Trophy className="h-3.5 w-3.5" />
              <span>Nivel {data.gamification.level}</span>
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              <span>{data.gamification.currentStreak} dias</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Engagement sparkline */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Engajamento (30 dias)
            </h3>
            {sparklineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={sparklineData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip formatter={(v: number) => [`${v}%`, 'Engajamento']} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400">Sem dados de engajamento.</p>
            )}
          </section>

          {/* Risk radar */}
          {radarData.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Risco — 8 Dimensoes Foucault
                <span className={`ml-2 font-bold ${RISK_COLOR[data.risk!.riskLevel]}`}>
                  ({data.risk!.riskLevel.toUpperCase()})
                </span>
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 10]} />
                  <Radar
                    dataKey="value"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </section>
          )}

          {/* Cognitive profile (Gardner) */}
          {data.topIntelligences.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Perfil Cognitivo (Gardner)
              </h3>
              <div className="space-y-2">
                {data.topIntelligences.map((intel, i) => (
                  <div key={intel.type} className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600 w-40 truncate">
                      {i + 1}. {intel.type.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 rounded-full h-2"
                        style={{ width: `${intel.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-10 text-right">
                      {Math.round(intel.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Gamification stats */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Gamificacao
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-lg font-bold text-purple-700">
                  {data.gamification.xpTotal.toLocaleString('pt-BR')}
                </div>
                <div className="text-xs text-purple-500">XP Total</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-lg font-bold text-blue-700">
                  {data.gamification.level}
                </div>
                <div className="text-xs text-blue-500">Nivel</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-3">
                <div className="text-lg font-bold text-orange-700">
                  {data.gamification.currentStreak}
                </div>
                <div className="text-xs text-orange-500">Streak</div>
              </div>
            </div>
          </section>

          {/* Last D7 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Dossie D7 (Weber)
            </h3>
            {data.lastD7 ? (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Gerado em: {new Date(data.lastD7.generatedAt).toLocaleDateString('pt-BR')}
                  {' '}({data.lastD7.type})
                </p>
                <button
                  onClick={() => setShowD7(true)}
                  className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                  <BookOpen className="inline h-4 w-4 mr-2" />
                  Ver D7 Completo
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-400 mb-2">Nenhum D7 gerado ainda.</p>
                <button
                  onClick={() => {
                    apiFetch('/api/v1/orch/d7/generate', {
                      method: 'POST',
                      body: JSON.stringify({
                        studentId: data.studentId,
                        type: 'on_demand',
                      }),
                    }).then(() => {
                      // Recarregar dados apos geracao
                      apiFetch<StudentDetail>(
                        `/api/v1/orch/dashboard/student/${studentId}`
                      ).then(setData);
                    });
                  }}
                  className="w-full px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700"
                >
                  Gerar D7
                </button>
              </div>
            )}
          </section>
        </div>

        {/* D7 Viewer modal (renderizado condicionalmente) */}
        {showD7 && data.lastD7 && (
          <D7InlineViewer
            d7={data.lastD7}
            studentName={data.fullName}
            onClose={() => setShowD7(false)}
          />
        )}
      </div>
    </>
  );
}

// D7 viewer inline no mesmo arquivo (simples, sera extraido na STORY-06.3)
function D7InlineViewer({
  d7,
  studentName,
  onClose,
}: {
  d7: { id: string; data: Record<string, unknown>; generatedAt: string };
  studentName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            D7 — {studentName}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>
        <pre className="text-sm text-gray-700 whitespace-pre-wrap">
          {JSON.stringify(d7.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
```

---

### Definicao de pronto STORY-06.2

- [ ] Rota `/dashboard/teacher` acessivel com login de professor
- [ ] Seletor de turma funciona e recarrega todos componentes
- [ ] 4 KPI cards com valores reais e cores semanticas
- [ ] LiveSection atualiza a cada 30s (conferir Network tab)
- [ ] StruggleTopics renderiza bar chart com Recharts
- [ ] StudentTable sortavel por 4 colunas + busca funcional
- [ ] Click em aluno abre StudentDetailPanel com dados
- [ ] Sparkline de engagement renderiza 30 dias
- [ ] Radar chart de risco renderiza 8 dimensoes
- [ ] Perfil cognitivo Gardner mostra top 3
- [ ] Botao "Ver D7" abre viewer
- [ ] Polling nao causa memory leak (testar com React DevTools Profiler)
- [ ] Recharts instalado e sem erros de build
- [ ] Responsivo: 1 coluna em mobile, 2 em desktop

---

## STORY-06.3: D7 Integration into Dashboard (3 pts)

**Complexidade:** Baixa-Media
**Tempo:** 1 dia
**Dependencias:** STORY-06.2 (painel lateral), EPIC-03 STORY com D7/Weber

### Extrair D7ReportViewer.tsx

Na STORY-06.2 criamos um `D7InlineViewer` simplificado. Agora extrair para componente completo.

**Path:** `apps/web/src/components/dashboard/D7ReportViewer.tsx`

```typescript
import { useState, useEffect } from 'react';
import { X, Download, RefreshCw } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch';

interface D7ReportViewerProps {
  studentId: string;
  reportId?: string;    // se nao fornecido, pega o mais recente
  onClose: () => void;
}

interface D7Report {
  id: string;
  studentId: string;
  reportType: string;
  generatedAt: string;
  sections: {
    academic: {
      agent: 'Bloom';
      grades: { subject: string; score: number; trend: string }[];
      gaps: string[];
      studyPlan: string;
    };
    engagement: {
      agent: 'Taylor';
      score: number;
      trend: string;
      peakHours: string[];
      weeklyAvg: number;
    };
    risk: {
      agent: 'Foucault';
      level: string;
      dimensions: Record<string, number>;
      topFactors: string[];
    };
    cognitive: {
      agent: 'Gardner';
      topIntelligences: { type: string; confidence: number }[];
      recommendations: string[];
    };
    gamification: {
      agent: 'Sisifo';
      xp: number;
      level: number;
      streak: number;
      badges: number;
    };
    retention: {
      agent: 'Ebbinghaus';
      avgRetention: number;
      conceptsTracked: number;
      weakConcepts: string[];
    };
    linguistic: {
      agent: 'Wittgenstein';
      cefrLevel: string;
      vocabularySize: number;
      writingScore: number;
    };
  };
  recommendations: string[];
  trendVsLast: string;   // "melhorou", "estavel", "piorou"
}

const SECTION_CONFIG = [
  { key: 'academic',     title: 'Academico',     agent: 'Bloom',        color: 'blue' },
  { key: 'engagement',   title: 'Engajamento',   agent: 'Taylor',       color: 'green' },
  { key: 'risk',         title: 'Risco',         agent: 'Foucault',     color: 'red' },
  { key: 'cognitive',    title: 'Cognitivo',     agent: 'Gardner',      color: 'purple' },
  { key: 'gamification', title: 'Gamificacao',   agent: 'Sisifo',       color: 'orange' },
  { key: 'retention',    title: 'Retencao',      agent: 'Ebbinghaus',   color: 'yellow' },
  { key: 'linguistic',   title: 'Linguistico',   agent: 'Wittgenstein', color: 'indigo' },
] as const;

export function D7ReportViewer({ studentId, reportId, onClose }: D7ReportViewerProps) {
  const [report, setReport] = useState<D7Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const url = reportId
        ? `/api/v1/orch/d7/${reportId}`
        : `/api/v1/orch/d7/${studentId}`;
      const data = await apiFetch<D7Report>(url);
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [studentId, reportId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await apiFetch('/api/v1/orch/d7/generate', {
        method: 'POST',
        body: JSON.stringify({ studentId, type: 'on_demand' }),
      });
      await fetchReport();
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `d7-${studentId}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-xl font-bold text-gray-900">
            Dossie D7
          </h2>
          <div className="flex items-center gap-2">
            {report && (
              <button
                onClick={handleDownload}
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Download JSON"
              >
                <Download className="h-5 w-5 text-gray-500" />
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="p-2 hover:bg-gray-100 rounded-lg"
              title="Gerar novo D7"
            >
              <RefreshCw className={`h-5 w-5 text-gray-500 ${generating ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : !report ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">Nenhum D7 encontrado para este aluno.</p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? 'Gerando...' : 'Gerar D7 Agora'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Meta */}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>
                  Gerado: {new Date(report.generatedAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>Tipo: {report.reportType}</span>
                <span className={
                  report.trendVsLast === 'melhorou' ? 'text-green-600' :
                  report.trendVsLast === 'piorou' ? 'text-red-600' : 'text-gray-600'
                }>
                  Tendencia: {report.trendVsLast}
                </span>
              </div>

              {/* 7 secoes */}
              {SECTION_CONFIG.map(section => {
                const sectionData = report.sections[section.key as keyof typeof report.sections];
                if (!sectionData) return null;

                return (
                  <div
                    key={section.key}
                    className={`border border-${section.color}-200 rounded-xl p-4 bg-${section.color}-50/30`}
                  >
                    <h3 className={`text-base font-semibold text-${section.color}-700 mb-3`}>
                      {section.title}
                      <span className="text-xs font-normal text-gray-500 ml-2">
                        Agente: {section.agent}
                      </span>
                    </h3>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                      {JSON.stringify(sectionData, null, 2)}
                    </pre>
                  </div>
                );
              })}

              {/* Recomendacoes */}
              {report.recommendations.length > 0 && (
                <div className="border border-gray-200 rounded-xl p-4">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">
                    Recomendacoes
                  </h3>
                  <ul className="space-y-2">
                    {report.recommendations.map((rec, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="text-blue-500 font-bold">{i + 1}.</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Footer */}
              <div className="text-center text-xs text-gray-400 pt-4 border-t">
                D7 v1 — Download JSON. PDF sera disponivel no EPIC-07.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Atualizar StudentDetailPanel para usar D7ReportViewer

Substituir o `D7InlineViewer` temporario pelo componente real:

```typescript
// No StudentDetailPanel.tsx, trocar:
// import D7InlineViewer (local)
// por:
import { D7ReportViewer } from './D7ReportViewer';

// No render, trocar:
{showD7 && data.lastD7 && (
  <D7InlineViewer d7={data.lastD7} studentName={data.fullName} onClose={() => setShowD7(false)} />
)}
// por:
{showD7 && (
  <D7ReportViewer
    studentId={data.studentId}
    reportId={data.lastD7?.id}
    onClose={() => setShowD7(false)}
  />
)}
```

### Endpoints D7 necessarios (ja definidos no EPIC-03)

Confirmar que estes endpoints do EPIC-03 existem e funcionam:

| Method | Path | Funcao |
|--------|------|--------|
| GET | `/api/v1/orch/d7/:studentId` | Buscar ultimo D7 |
| POST | `/api/v1/orch/d7/generate` | Gerar D7 on-demand |

Se nao existem: implementar seguindo o mesmo padrao dos 6 endpoints da STORY-06.1.

### Validacao

```bash
# Gerar D7 se nao existe
curl -X POST http://localhost:3000/api/v1/orch/d7/generate \
  -H "Authorization: Bearer $PROFESSOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"studentId":"STUDENT_UUID","type":"on_demand"}'
# Deve retornar: { id, status: 'generating' } ou { id, status: 'complete' }

# Buscar D7
curl http://localhost:3000/api/v1/orch/d7/STUDENT_UUID \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Deve retornar: 7 secoes com dados reais dos agentes
```

### Validacao no browser

1. Abrir `/dashboard/teacher`
2. Clicar em qualquer aluno na tabela
3. Painel lateral abre com dados
4. Clicar "Ver D7 Completo"
5. Modal abre com 7 secoes coloridas
6. Botao download gera JSON valido
7. Botao refresh gera novo D7 e recarrega
8. Se nao tem D7: botao "Gerar D7 Agora" funciona

### Definicao de pronto STORY-06.3

- [ ] D7ReportViewer renderiza 7 secoes (uma por agente)
- [ ] Botao "Ver D7" no painel lateral funciona
- [ ] Botao "Gerar D7" cria D7 via POST e recarrega
- [ ] Download JSON funcional
- [ ] Se aluno sem D7: mostra estado vazio + botao gerar
- [ ] D7 com dados reais dos 7 agentes (zero mocks)

---

## CHECKLIST FINAL EPIC-06

- [ ] 6 endpoints com dados reais (zero mocks)
- [ ] Auth + ownership validados em todos endpoints
- [ ] 4 KPI cards com valores corretos e cores semanticas
- [ ] LiveSection atualiza a cada 30s
- [ ] StruggleTopics mostra conceitos reais com bar chart
- [ ] StudentTable sortavel por 4 colunas + busca por nome
- [ ] StudentDetailPanel com engagement sparkline + risk radar
- [ ] D7ReportViewer renderiza 7 secoes com dados reais
- [ ] Recharts instalado e renderizando sem erros
- [ ] Validacao de role (so professor/coordinator)
- [ ] Polling nao causa memory leak (cleanup no unmount)
- [ ] Responsivo mobile/desktop
- [ ] Nenhum full table scan (validar com EXPLAIN ANALYZE nas 6 queries)

---

## TROUBLESHOOTING

| Problema | Solucao |
|----------|---------|
| `recharts` nao renderiza | Verificar que `ResponsiveContainer` tem width/height definidos. Pai precisa ter altura fixa. |
| 403 em todos endpoints | Token nao tem role `teacher`. Conferir Keycloak realm roles. |
| Dados zerados nos KPIs | EPIC-02/03 nao popularam dados. Rodar agentes para gerar snapshots/assessments. |
| `experience_events` nao existe | Tabela pode ter nome diferente no codebase. Verificar com `\dt *event*` no psql. |
| Memory leak no polling | Conferir que `clearInterval` roda no cleanup do `useEffect`. Testar com React DevTools. |
| Radar chart vazio | `orch_risk_assessment.dimensions` pode ser `null`. Conferir que Foucault popula as 8 dimensoes. |
| D7 retorna 404 | Weber ainda nao gerou D7 para este aluno. Usar POST `/d7/generate` primeiro. |
| `class_instance_teacher` nao existe | Nome da tabela pode ser diferente. Buscar com `\dt *teacher*` no psql. Ajustar query de ownership. |

---

## ORDEM DE EXECUCAO RECOMENDADA

```
Dia 1-2: STORY-06.1 (6 endpoints)
  1. Criar orch-dashboard-auth.ts (helper de ownership)
  2. Endpoint 1: /dashboard/class/:classId (overview)
  3. Endpoint 2: /dashboard/class/:classId/live
  4. Endpoint 3: /dashboard/class/:classId/mastery
  5. Endpoint 4: /dashboard/class/:classId/risk-map
  6. Endpoint 5: /dashboard/class/:classId/predictions
  7. Endpoint 6: /dashboard/student/:studentId
  8. Registrar no router + testar com curl

Dia 3-4: STORY-06.2 (frontend)
  1. npm install recharts
  2. TeacherDashboard.tsx (pagina + rota)
  3. ClassOverview.tsx (4 KPIs)
  4. LiveSection.tsx (online agora)
  5. StruggleTopics.tsx (bar chart)
  6. StudentTable.tsx (tabela sortavel)
  7. StudentDetailPanel.tsx (painel lateral com charts)

Dia 5: STORY-06.3 (D7 integration)
  1. D7ReportViewer.tsx (componente completo)
  2. Conectar ao StudentDetailPanel
  3. Testar fluxo completo: tabela → painel → D7
  4. Testes de memory leak e responsividade
```
