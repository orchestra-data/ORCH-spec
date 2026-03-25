import type { PoolClient } from 'pg';
import { z } from 'zod';

interface GradesSummaryParams {
  studentId: string;
  tenantId: string;
}

interface SimulateGradeParams {
  studentId: string;
  assessmentId: string;
  desiredGrade: number;
}

interface StudyPlanParams {
  studentId: string;
  tenantId: string;
  unitId?: string;
}

interface StudentXrayParams {
  studentId: string;
  tenantId: string;
}

interface GradeSummary {
  assessmentId: string;
  assessmentName: string;
  weight: number;
  grade: number | null;
  maxGrade: number;
}

interface SimulationResult {
  desiredGrade: number;
  currentWeightedAverage: number;
  remainingAssessments: { id: string; name: string; weight: number; requiredGrade: number }[];
  achievable: boolean;
}

const StudyActivitySchema = z.object({
  activities: z.array(z.object({
    level: z.enum(['remember', 'understand', 'apply']),
    concept: z.string(),
    activity: z.string(),
    estimatedMinutes: z.number(),
    resources: z.array(z.string()),
  })),
});

interface StudyPlan {
  studentId: string;
  gaps: { conceptId: string; conceptLabel: string; retention: number }[];
  activities: z.infer<typeof StudyActivitySchema>['activities'];
}

interface StudentXray {
  studentId: string;
  grades: GradeSummary[];
  weightedAverage: number;
  gamification: { totalXP: number; level: number; levelName: string; streak: number };
  engagement: { score: number; trend: string } | null;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  masteryGaps: { concept: string; retention: number }[];
}

class OrchBloom {
  async getGradesSummary(client: PoolClient, params: GradesSummaryParams): Promise<GradeSummary[]> {
    const { studentId, tenantId } = params;

    const result = await client.query<GradeSummary>(
      `SELECT a.id AS "assessmentId", a.name AS "assessmentName", a.weight,
              sg.grade, a.max_grade AS "maxGrade"
       FROM assessment a
       LEFT JOIN student_grade sg ON sg.assessment_id = a.id AND sg.student_id = $1
       WHERE a.tenant_id = $2
       ORDER BY a.due_date ASC`,
      [studentId, tenantId],
    );
    return result.rows;
  }

  async simulateGrade(client: PoolClient, params: SimulateGradeParams): Promise<SimulationResult> {
    const { studentId, assessmentId, desiredGrade } = params;

    const tenantResult = await client.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM assessment WHERE id = $1 LIMIT 1`,
      [assessmentId],
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;
    if (!tenantId) throw new Error('Assessment not found');

    const grades = await this.getGradesSummary(client, { studentId, tenantId });

    const completed = grades.filter((g) => g.grade !== null);
    const remaining = grades.filter((g) => g.grade === null);

    const completedWeightedSum = completed.reduce((sum, g) => sum + (g.grade! / g.maxGrade) * g.weight, 0);
    const totalWeight = grades.reduce((sum, g) => sum + g.weight, 0);
    const currentWeightedAverage = totalWeight > 0 ? (completedWeightedSum / totalWeight) * 10 : 0;

    const remainingWeight = remaining.reduce((sum, g) => sum + g.weight, 0);
    const neededWeightedSum = (desiredGrade / 10) * totalWeight - completedWeightedSum;
    const avgNeededRatio = remainingWeight > 0 ? neededWeightedSum / remainingWeight : Infinity;

    const achievable = avgNeededRatio <= 1.0;

    const remainingAssessments = remaining.map((g) => ({
      id: g.assessmentId,
      name: g.assessmentName,
      weight: g.weight,
      requiredGrade: Math.min(g.maxGrade, Math.round(avgNeededRatio * g.maxGrade * 100) / 100),
    }));

    return { desiredGrade, currentWeightedAverage, remainingAssessments, achievable };
  }

  async generateStudyPlan(client: PoolClient, params: StudyPlanParams): Promise<StudyPlan> {
    const { studentId, tenantId, unitId } = params;

    const unitFilter = unitId ? `AND c.unit_id = $3` : '';
    const queryParams: string[] = [studentId, tenantId];
    if (unitId) queryParams.push(unitId);

    const gaps = await client.query<{ concept_id: string; concept_label: string; retention: number }>(
      `SELECT cm.concept_id, c.label AS concept_label, cm.retention
       FROM orch_concept_memory cm
       JOIN orch_concept c ON c.id = cm.concept_id
       WHERE cm.student_id = $1 AND c.tenant_id = $2 ${unitFilter}
         AND cm.retention < 0.6
       ORDER BY cm.retention ASC
       LIMIT 10`,
      queryParams,
    );

    const gapList = gaps.rows.map((g) => ({
      conceptId: g.concept_id,
      conceptLabel: g.concept_label,
      retention: g.retention,
    }));

    if (gapList.length === 0) {
      return { studentId, gaps: [], activities: [] };
    }

    const { orchLLMService } = await import('../orch-llm.service');
    const generated = await orchLLMService.generateStructuredOutput(client, {
      tenantId,
      schema: StudyActivitySchema,
      prompt: [
        'Generate a study plan in Brazilian Portuguese using Bloom\'s Taxonomy.',
        'For each concept below, create activities at 3 levels: Remember, Understand, Apply.',
        '',
        'Concepts with low mastery:',
        ...gapList.map((g) => `- ${g.conceptLabel} (retention: ${Math.round(g.retention * 100)}%)`),
        '',
        'Each activity should be actionable, specific, and include estimated time and resources.',
      ].join('\n'),
      model: 'default',
    });

    return { studentId, gaps: gapList, activities: generated.activities };
  }

  async getStudentXray(client: PoolClient, params: StudentXrayParams): Promise<StudentXray> {
    const { studentId, tenantId } = params;

    const grades = await this.getGradesSummary(client, { studentId, tenantId });
    const completedGrades = grades.filter((g) => g.grade !== null);
    const totalWeight = grades.reduce((sum, g) => sum + g.weight, 0);
    const weightedSum = completedGrades.reduce((sum, g) => sum + (g.grade! / g.maxGrade) * g.weight, 0);
    const weightedAverage = totalWeight > 0 ? (weightedSum / totalWeight) * 10 : 0;

    const { orchSisifo } = await import('./orch-sisifo');
    const gamStatus = await orchSisifo.getStatus(client, studentId, tenantId);

    const engagementResult = await client.query<{ composite_score: number; trend: string }>(
      `SELECT composite_score, trend FROM orch_engagement_snapshot
       WHERE student_id = $1 AND tenant_id = $2
       ORDER BY date DESC LIMIT 1`,
      [studentId, tenantId],
    );
    const engagement = engagementResult.rows[0]
      ? { score: engagementResult.rows[0].composite_score, trend: engagementResult.rows[0].trend }
      : null;

    const gapsResult = await client.query<{ concept: string; retention: number }>(
      `SELECT c.label AS concept, cm.retention
       FROM orch_concept_memory cm
       JOIN orch_concept c ON c.id = cm.concept_id
       WHERE cm.student_id = $1 AND c.tenant_id = $2 AND cm.retention < 0.6
       ORDER BY cm.retention ASC LIMIT 5`,
      [studentId, tenantId],
    );

    const engScore = engagement?.score ?? 50;
    const riskLevel: StudentXray['riskLevel'] =
      weightedAverage < 4 || engScore < 20 ? 'critical'
      : weightedAverage < 6 || engScore < 40 ? 'high'
      : weightedAverage < 7 || engScore < 60 ? 'medium'
      : 'low';

    return {
      studentId,
      grades,
      weightedAverage: Math.round(weightedAverage * 100) / 100,
      gamification: {
        totalXP: gamStatus.totalXP,
        level: gamStatus.level,
        levelName: gamStatus.levelName,
        streak: gamStatus.currentStreak,
      },
      engagement,
      riskLevel,
      masteryGaps: gapsResult.rows,
    };
  }
}

export const orchBloom = new OrchBloom();
