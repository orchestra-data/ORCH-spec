import type { PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ClassStudentRow {
  id: string;
  name: string;
  communication_archetype: string | null;
  engagement_profile: Record<string, unknown> | null;
  risk_profile: Record<string, unknown> | null;
  gamification_profile: Record<string, unknown> | null;
  engagement_score: number | null;
  engagement_trend: string | null;
  risk_level: string | null;
  risk_score: number | null;
}

export interface ClassOverview {
  students: ClassStudentRow[];
  avgEngagement: number;
  avgMastery: number;
  atRiskCount: number;
  totalStudents: number;
}

export interface OnlineStudent {
  studentId: string;
  name: string;
  lastActive: Date;
  eventsCount: number;
  isConfused: boolean;
}

export interface ClassLive {
  onlineStudents: OnlineStudent[];
}

export interface SkillMastery {
  skillId: string;
  skillLabel: string;
  avgMastery: number;
  studentsBelowThreshold: number;
}

export interface ClassMastery {
  skills: SkillMastery[];
}

export interface ClassRiskMap {
  green: number;
  yellow: number;
  orange: number;
  red: number;
  critical: number;
}

export interface ClassPredictions {
  predictedAvgGrade: number;
  confidence: number;
  narrative: string;
  trendVsLastMonth: number;
}

export interface EngagementSnapshot {
  snapshot_date: string;
  score: number;
  trend: string;
}

export interface RiskDimension {
  dimension: string;
  score: number;
  level: string;
}

export interface StudentDeepDive {
  profile: Record<string, unknown>;
  engagementHistory: EngagementSnapshot[];
  riskAssessment: RiskDimension[];
  d7Report: Record<string, unknown> | null;
  gamification: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// OrchDashboardService
// ---------------------------------------------------------------------------

class OrchDashboardService {
  /**
   * Overview of all students in a class with profiles, engagement and risk.
   */
  async getClassOverview(
    client: PoolClient,
    classInstanceId: string,
    tenantId: string,
  ): Promise<ClassOverview> {
    const { rows } = await client.query<ClassStudentRow>(
      `SELECT u.id, u.name,
        osp.communication_archetype, osp.engagement_profile, osp.risk_profile, osp.gamification_profile,
        oes.score as engagement_score, oes.trend as engagement_trend,
        ora.risk_level, ora.risk_score
      FROM class_enrollment ce
      JOIN "user" u ON u.id = ce.student_id
      LEFT JOIN orch_student_profile osp ON osp.student_id = u.id AND osp.tenant_id = $2
      LEFT JOIN orch_engagement_snapshot oes ON oes.student_id = u.id AND oes.snapshot_date = CURRENT_DATE
      LEFT JOIN orch_risk_assessment ora ON ora.student_id = u.id AND ora.assessment_date = CURRENT_DATE
      WHERE ce.class_instance_id = $1
      ORDER BY u.name`,
      [classInstanceId, tenantId],
    );

    const totalStudents = rows.length;

    const engagementScores = rows
      .map((r) => r.engagement_score)
      .filter((s): s is number => s !== null);
    const avgEngagement =
      engagementScores.length > 0
        ? engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length
        : 0;

    // avgMastery derived from engagement as proxy until mastery table aggregation
    const avgMastery = avgEngagement;

    const atRiskCount = rows.filter(
      (r) => r.risk_level === 'red' || r.risk_level === 'critical',
    ).length;

    return { students: rows, avgEngagement, avgMastery, atRiskCount, totalStudents };
  }

  /**
   * Students active in the last 15 minutes with confusion detection.
   */
  async getClassLive(
    client: PoolClient,
    classInstanceId: string,
    tenantId: string,
  ): Promise<ClassLive> {
    const { rows } = await client.query<{
      student_id: string;
      name: string;
      last_active: Date;
      events_count: string;
    }>(
      `SELECT DISTINCT ee.actor_id as student_id, u.name,
        MAX(ee.timestamp) as last_active,
        COUNT(*) as events_count
      FROM experience_events ee
      JOIN class_enrollment ce ON ce.student_id = ee.actor_id AND ce.class_instance_id = $1
      JOIN "user" u ON u.id = ee.actor_id
      WHERE ee.timestamp > NOW() - INTERVAL '15 minutes'
        AND ee.tenant_id = $2
      GROUP BY ee.actor_id, u.name
      ORDER BY last_active DESC`,
      [classInstanceId, tenantId],
    );

    // Detect confusion: check if last AI interaction was doubt/error intent
    const onlineStudents: OnlineStudent[] = [];
    for (const row of rows) {
      const { rows: intentRows } = await client.query<{ intent: string }>(
        `SELECT metadata->>'intent' as intent
        FROM experience_events
        WHERE actor_id = $1 AND tenant_id = $2
          AND verb IN ('asked', 'interacted')
        ORDER BY timestamp DESC
        LIMIT 1`,
        [row.student_id, tenantId],
      );

      const lastIntent = intentRows[0]?.intent ?? '';
      const isConfused = lastIntent === 'doubt' || lastIntent === 'error';

      onlineStudents.push({
        studentId: row.student_id,
        name: row.name,
        lastActive: row.last_active,
        eventsCount: parseInt(row.events_count, 10),
        isConfused,
      });
    }

    return { onlineStudents };
  }

  /**
   * Aggregate skills mastery from orch_student_profile for all class students.
   */
  async getClassMastery(
    client: PoolClient,
    classInstanceId: string,
    tenantId: string,
  ): Promise<ClassMastery> {
    const { rows } = await client.query<{
      skill_id: string;
      skill_label: string;
      avg_mastery: string;
      below_threshold: string;
    }>(
      `WITH class_students AS (
        SELECT student_id FROM class_enrollment WHERE class_instance_id = $1
      ),
      skill_data AS (
        SELECT
          skill->>'id' as skill_id,
          skill->>'label' as skill_label,
          (skill->>'mastery')::numeric as mastery
        FROM class_students cs
        JOIN orch_student_profile osp ON osp.student_id = cs.student_id AND osp.tenant_id = $2,
        jsonb_array_elements(osp.cognitive_snapshot->'skills_mastery') as skill
      )
      SELECT
        skill_id,
        skill_label,
        AVG(mastery) as avg_mastery,
        COUNT(*) FILTER (WHERE mastery < 0.5) as below_threshold
      FROM skill_data
      GROUP BY skill_id, skill_label
      ORDER BY avg_mastery ASC`,
      [classInstanceId, tenantId],
    );

    const skills: SkillMastery[] = rows.map((r) => ({
      skillId: r.skill_id,
      skillLabel: r.skill_label,
      avgMastery: parseFloat(r.avg_mastery),
      studentsBelowThreshold: parseInt(r.below_threshold, 10),
    }));

    return { skills };
  }

  /**
   * Risk distribution across the class (latest assessment per student).
   */
  async getClassRiskMap(
    client: PoolClient,
    classInstanceId: string,
    _tenantId: string,
  ): Promise<ClassRiskMap> {
    const { rows } = await client.query<{ risk_level: string; count: string }>(
      `SELECT ora.risk_level, COUNT(*) as count
      FROM orch_risk_assessment ora
      JOIN class_enrollment ce ON ce.student_id = ora.student_id AND ce.class_instance_id = $1
      WHERE ora.assessment_date = (
        SELECT MAX(assessment_date) FROM orch_risk_assessment WHERE student_id = ora.student_id
      )
      GROUP BY ora.risk_level`,
      [classInstanceId],
    );

    const map: ClassRiskMap = { green: 0, yellow: 0, orange: 0, red: 0, critical: 0 };
    for (const row of rows) {
      const level = row.risk_level as keyof ClassRiskMap;
      if (level in map) {
        map[level] = parseInt(row.count, 10);
      }
    }

    return map;
  }

  /**
   * Predictions for class performance using engagement + mastery + risk trends.
   */
  async getClassPredictions(
    client: PoolClient,
    classInstanceId: string,
    tenantId: string,
  ): Promise<ClassPredictions> {
    // Gather current averages
    const overview = await this.getClassOverview(client, classInstanceId, tenantId);

    // Gather last month averages for trend
    const { rows: lastMonthRows } = await client.query<{ avg_score: string }>(
      `SELECT AVG(oes.score) as avg_score
      FROM orch_engagement_snapshot oes
      JOIN class_enrollment ce ON ce.student_id = oes.student_id AND ce.class_instance_id = $1
      WHERE oes.snapshot_date BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '30 days'`,
      [classInstanceId],
    );

    const lastMonthAvg = parseFloat(lastMonthRows[0]?.avg_score ?? '0');
    const trendVsLastMonth =
      lastMonthAvg > 0 ? overview.avgEngagement - lastMonthAvg : 0;

    // Simple prediction based on current engagement and risk ratio
    const riskRatio =
      overview.totalStudents > 0
        ? overview.atRiskCount / overview.totalStudents
        : 0;
    const predictedAvgGrade = Math.max(0, Math.min(10, overview.avgEngagement * (1 - riskRatio * 0.3)));
    const confidence = overview.totalStudents >= 10 ? 0.75 : 0.5;

    // Build narrative (placeholder — in production, route to orchLLMService)
    const narrative =
      riskRatio > 0.3
        ? `Atencion: ${overview.atRiskCount} de ${overview.totalStudents} alunos em risco. Tendencia de queda.`
        : trendVsLastMonth > 0
          ? `Turma em evolucao positiva. Engajamento medio subiu ${trendVsLastMonth.toFixed(1)} pontos no ultimo mes.`
          : `Turma estavel. Monitorar alunos com engajamento abaixo da media.`;

    return { predictedAvgGrade, confidence, narrative, trendVsLastMonth };
  }

  /**
   * Full deep-dive for a single student: profile, engagement history, risk, D7, gamification.
   */
  async getStudentDeepDive(
    client: PoolClient,
    studentId: string,
    tenantId: string,
  ): Promise<StudentDeepDive> {
    // Full profile
    const { rows: profileRows } = await client.query(
      `SELECT * FROM orch_student_profile WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );
    const profile = profileRows[0] ?? {};

    // Last 30 days engagement snapshots
    const { rows: engagementHistory } = await client.query<EngagementSnapshot>(
      `SELECT snapshot_date::text, score, trend
      FROM orch_engagement_snapshot
      WHERE student_id = $1
        AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY snapshot_date ASC`,
      [studentId],
    );

    // Latest risk assessment — all dimensions
    const { rows: riskAssessment } = await client.query<RiskDimension>(
      `SELECT dimension, score, level
      FROM orch_risk_dimension
      WHERE assessment_id = (
        SELECT id FROM orch_risk_assessment
        WHERE student_id = $1
        ORDER BY assessment_date DESC
        LIMIT 1
      )
      ORDER BY dimension`,
      [studentId],
    );

    // Latest D7 report
    const { rows: d7Rows } = await client.query(
      `SELECT * FROM orch_d7_report
      WHERE student_id = $1 AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT 1`,
      [studentId, tenantId],
    );
    const d7Report = d7Rows[0] ?? null;

    // Gamification status
    const { rows: gamRows } = await client.query(
      `SELECT gamification_profile FROM orch_student_profile
      WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );
    const gamification = gamRows[0]?.gamification_profile ?? null;

    return { profile, engagementHistory, riskAssessment, d7Report, gamification };
  }
}

export const orchDashboardService = new OrchDashboardService();
