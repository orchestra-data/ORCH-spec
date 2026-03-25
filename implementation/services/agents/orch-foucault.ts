import type { PoolClient } from 'pg';
import { z } from 'zod';

// --- Types ---

type RiskLevel = 'green' | 'yellow' | 'orange' | 'red' | 'critical';
type Intervention = 'none' | 'monitor' | 'nudge' | 'outreach' | 'urgent';

interface RiskDimensions {
  dim_academic: number;
  dim_attendance: number;
  dim_engagement: number;
  dim_financial: number;
  dim_social: number;
  dim_emotional: number;
  dim_temporal: number;
  dim_vocational: number;
}

interface RiskAssessment {
  studentId: string;
  tenantId: string;
  dimensions: RiskDimensions;
  composite: number;
  level: RiskLevel;
  intervention: Intervention;
  structuralFlags: string[];
  assessedAt: string;
}

interface RiskTrend {
  current: RiskAssessment;
  previous: RiskAssessment | null;
  direction: 'improving' | 'stable' | 'worsening';
}

const AssessSchema = z.object({
  studentId: z.string().uuid(),
  tenantId: z.string().uuid(),
});

// --- Weights ---

const DIMENSION_WEIGHTS: Record<keyof RiskDimensions, number> = {
  dim_academic: 0.20,
  dim_attendance: 0.15,
  dim_engagement: 0.15,
  dim_financial: 0.10,
  dim_social: 0.10,
  dim_emotional: 0.10,
  dim_temporal: 0.10,
  dim_vocational: 0.10,
};

class OrchFoucault {
  // ─── Level & Intervention mapping ───

  private getLevel(composite: number): RiskLevel {
    if (composite <= 20) return 'green';
    if (composite <= 40) return 'yellow';
    if (composite <= 60) return 'orange';
    if (composite <= 80) return 'red';
    return 'critical';
  }

  private getIntervention(level: RiskLevel): Intervention {
    const map: Record<RiskLevel, Intervention> = {
      green: 'none',
      yellow: 'monitor',
      orange: 'nudge',
      red: 'outreach',
      critical: 'urgent',
    };
    return map[level];
  }

  // ─── Dimension calculators ───

  private async calcAcademic(client: PoolClient, studentId: string, tenantId: string): Promise<number> {
    const result = await client.query<{ avg_grade: number }>(
      `SELECT AVG(composite_score) AS avg_grade
       FROM orch_assessment
       WHERE student_id = $1 AND tenant_id = $2 AND composite_score IS NOT NULL`,
      [studentId, tenantId],
    );
    const avg = result.rows[0]?.avg_grade ?? 5;
    // Invert: low grades = high risk. Scale 0-10 grade → 0-100 risk
    return Math.max(0, Math.min(100, (1 - avg / 10) * 100));
  }

  private async calcAttendance(client: PoolClient, studentId: string, tenantId: string): Promise<number> {
    const result = await client.query<{ total: string; absences: string }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absences
       FROM orch_attendance
       WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );
    const total = parseInt(result.rows[0]?.total ?? '0', 10);
    const absences = parseInt(result.rows[0]?.absences ?? '0', 10);
    if (total === 0) return 20; // No data = mild risk
    const absenceRate = absences / total;
    return Math.min(100, Math.round(absenceRate * 100));
  }

  private async calcEngagement(client: PoolClient, studentId: string, tenantId: string): Promise<number> {
    // From Taylor (engagement agent) latest snapshot
    const result = await client.query<{ engagement_score: number }>(
      `SELECT engagement_score
       FROM orch_engagement_snapshot
       WHERE student_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [studentId, tenantId],
    );
    if (result.rows.length === 0) return 30; // No data = moderate risk
    // Engagement 0-100 → invert for risk
    return Math.max(0, 100 - (result.rows[0].engagement_score ?? 50));
  }

  private async calcFinancial(client: PoolClient, studentId: string, tenantId: string): Promise<number> {
    const result = await client.query<{ financial_risk_flag: boolean }>(
      `SELECT financial_risk_flag
       FROM orch_student_profile
       WHERE student_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [studentId, tenantId],
    );
    return result.rows[0]?.financial_risk_flag ? 70 : 10;
  }

  private async calcSocial(client: PoolClient, studentId: string, tenantId: string): Promise<number> {
    // Social interactions: forum posts, chat messages in last 30 days
    const result = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM orch_interaction_log
       WHERE student_id = $1 AND tenant_id = $2
         AND agent IN ('forum', 'chat', 'group')
         AND created_at > NOW() - INTERVAL '30 days'`,
      [studentId, tenantId],
    );
    const count = parseInt(result.rows[0]?.cnt ?? '0', 10);
    // 0 interactions = high risk, 20+ = low risk
    if (count >= 20) return 10;
    if (count >= 10) return 30;
    if (count >= 5) return 50;
    return 80;
  }

  private async calcEmotional(client: PoolClient, studentId: string, tenantId: string): Promise<number> {
    // From Wittgenstein sentiment signals + help-seeking patterns
    const result = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM orch_interaction_log
       WHERE student_id = $1 AND tenant_id = $2
         AND (message ILIKE '%ajuda%' OR message ILIKE '%não consigo%' OR message ILIKE '%desistir%'
              OR message ILIKE '%difícil%' OR message ILIKE '%ansied%' OR message ILIKE '%estress%')
         AND created_at > NOW() - INTERVAL '30 days'`,
      [studentId, tenantId],
    );
    const helpSeeking = parseInt(result.rows[0]?.cnt ?? '0', 10);
    if (helpSeeking >= 10) return 80;
    if (helpSeeking >= 5) return 50;
    if (helpSeeking >= 2) return 30;
    return 10;
  }

  private async calcTemporal(client: PoolClient, studentId: string, tenantId: string): Promise<number> {
    // Late submissions + irregular login times
    const lateResult = await client.query<{ late_count: string; total_count: string }>(
      `SELECT
        SUM(CASE WHEN submitted_at > due_date THEN 1 ELSE 0 END) AS late_count,
        COUNT(*) AS total_count
       FROM orch_assessment
       WHERE student_id = $1 AND tenant_id = $2 AND due_date IS NOT NULL`,
      [studentId, tenantId],
    );
    const lateCount = parseInt(lateResult.rows[0]?.late_count ?? '0', 10);
    const totalCount = parseInt(lateResult.rows[0]?.total_count ?? '0', 10);
    const lateRatio = totalCount > 0 ? lateCount / totalCount : 0;
    return Math.min(100, Math.round(lateRatio * 100));
  }

  private async calcVocational(client: PoolClient, studentId: string, tenantId: string): Promise<number> {
    // Course completion trajectory: % of expected milestones completed
    const result = await client.query<{ completed: string; expected: string }>(
      `SELECT
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        COUNT(*) AS expected
       FROM orch_learning_milestone
       WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );
    const completed = parseInt(result.rows[0]?.completed ?? '0', 10);
    const expected = parseInt(result.rows[0]?.expected ?? '0', 10);
    if (expected === 0) return 20;
    const completionRate = completed / expected;
    return Math.max(0, Math.min(100, Math.round((1 - completionRate) * 100)));
  }

  // ─── Full risk assessment ───

  async assessRisk(client: PoolClient, params: z.infer<typeof AssessSchema>): Promise<RiskAssessment> {
    const { studentId, tenantId } = AssessSchema.parse(params);

    const [
      dim_academic,
      dim_attendance,
      dim_engagement,
      dim_financial,
      dim_social,
      dim_emotional,
      dim_temporal,
      dim_vocational,
    ] = await Promise.all([
      this.calcAcademic(client, studentId, tenantId),
      this.calcAttendance(client, studentId, tenantId),
      this.calcEngagement(client, studentId, tenantId),
      this.calcFinancial(client, studentId, tenantId),
      this.calcSocial(client, studentId, tenantId),
      this.calcEmotional(client, studentId, tenantId),
      this.calcTemporal(client, studentId, tenantId),
      this.calcVocational(client, studentId, tenantId),
    ]);

    const dimensions: RiskDimensions = {
      dim_academic, dim_attendance, dim_engagement, dim_financial,
      dim_social, dim_emotional, dim_temporal, dim_vocational,
    };

    let composite = 0;
    for (const [key, weight] of Object.entries(DIMENSION_WEIGHTS)) {
      composite += dimensions[key as keyof RiskDimensions] * weight;
    }
    composite = Math.round(composite * 100) / 100;

    const level = this.getLevel(composite);
    const intervention = this.getIntervention(level);

    // Persist
    await client.query(
      `INSERT INTO orch_risk_assessment (
        student_id, tenant_id, dimensions, composite, level, intervention, assessed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [studentId, tenantId, JSON.stringify(dimensions), composite, level, intervention],
    );

    return {
      studentId, tenantId, dimensions, composite, level, intervention,
      structuralFlags: [],
      assessedAt: new Date().toISOString(),
    };
  }

  // ─── Batch assess all students ───

  async batchAssess(client: PoolClient, tenantId: string): Promise<RiskAssessment[]> {
    const studentsResult = await client.query<{ student_id: string }>(
      `SELECT DISTINCT student_id FROM orch_student_profile WHERE tenant_id = $1 AND active = true`,
      [tenantId],
    );

    const assessments: RiskAssessment[] = [];
    for (const row of studentsResult.rows) {
      const assessment = await this.assessRisk(client, { studentId: row.student_id, tenantId });
      assessments.push(assessment);
    }

    // Detect structural patterns
    await this.detectReproductionPattern(client, tenantId, assessments);

    return assessments;
  }

  // ─── Class risk map ───

  async getClassRiskMap(
    client: PoolClient,
    classInstanceId: string,
  ): Promise<Array<{ studentId: string; level: RiskLevel; composite: number }>> {
    const result = await client.query<{ student_id: string; level: RiskLevel; composite: number }>(
      `SELECT ra.student_id, ra.level, ra.composite
       FROM orch_risk_assessment ra
       INNER JOIN orch_class_enrollment ce ON ce.student_id = ra.student_id
       WHERE ce.class_instance_id = $1
         AND ra.assessed_at = (
           SELECT MAX(ra2.assessed_at) FROM orch_risk_assessment ra2
           WHERE ra2.student_id = ra.student_id
         )
       ORDER BY ra.composite DESC`,
      [classInstanceId],
    );

    return result.rows.map((r) => ({
      studentId: r.student_id,
      level: r.level,
      composite: r.composite,
    }));
  }

  // ─── Student risk with trend ───

  async getStudentRisk(client: PoolClient, studentId: string): Promise<RiskTrend | null> {
    const result = await client.query<{
      student_id: string;
      tenant_id: string;
      dimensions: RiskDimensions;
      composite: number;
      level: RiskLevel;
      intervention: Intervention;
      assessed_at: string;
    }>(
      `SELECT student_id, tenant_id, dimensions, composite, level, intervention, assessed_at
       FROM orch_risk_assessment
       WHERE student_id = $1
       ORDER BY assessed_at DESC
       LIMIT 2`,
      [studentId],
    );

    if (result.rows.length === 0) return null;

    const toAssessment = (row: typeof result.rows[0]): RiskAssessment => ({
      studentId: row.student_id,
      tenantId: row.tenant_id,
      dimensions: row.dimensions,
      composite: row.composite,
      level: row.level,
      intervention: row.intervention,
      structuralFlags: [],
      assessedAt: row.assessed_at,
    });

    const current = toAssessment(result.rows[0]);
    const previous = result.rows.length > 1 ? toAssessment(result.rows[1]) : null;

    let direction: 'improving' | 'stable' | 'worsening' = 'stable';
    if (previous) {
      const diff = current.composite - previous.composite;
      if (diff < -5) direction = 'improving'; // Lower risk = improving
      else if (diff > 5) direction = 'worsening';
    }

    return { current, previous, direction };
  }

  // ─── Bourdieu: detect social reproduction patterns ───

  private async detectReproductionPattern(
    client: PoolClient,
    tenantId: string,
    assessments: RiskAssessment[],
  ): Promise<void> {
    // Group by socioeconomic indicators and check if risk clusters
    const highRisk = assessments.filter((a) => a.composite > 60);
    if (highRisk.length < 5) return;

    const studentIds = highRisk.map((a) => a.studentId);

    const profilesResult = await client.query<{ student_id: string; socioeconomic_group: string }>(
      `SELECT student_id, socioeconomic_group
       FROM orch_student_profile
       WHERE student_id = ANY($1) AND tenant_id = $2 AND socioeconomic_group IS NOT NULL`,
      [studentIds, tenantId],
    );

    // Count risk students per socioeconomic group
    const groupCounts: Record<string, number> = {};
    for (const row of profilesResult.rows) {
      groupCounts[row.socioeconomic_group] = (groupCounts[row.socioeconomic_group] || 0) + 1;
    }

    // If any group has 60%+ of high-risk students, flag structural
    const totalHighRisk = highRisk.length;
    for (const [group, count] of Object.entries(groupCounts)) {
      if (count / totalHighRisk >= 0.6) {
        await client.query(
          `INSERT INTO orch_structural_alert (tenant_id, alert_type, description, data, created_at)
           VALUES ($1, 'social_reproduction', $2, $3, NOW())`,
          [
            tenantId,
            `Structural pattern detected: ${count}/${totalHighRisk} high-risk students from socioeconomic group "${group}". This may indicate systemic barriers, not individual deficiency.`,
            JSON.stringify({ group, count, totalHighRisk, ratio: Math.round((count / totalHighRisk) * 100) }),
          ],
        );
      }
    }
  }
}

export const orchFoucault = new OrchFoucault();
