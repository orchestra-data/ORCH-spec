import type { PoolClient } from 'pg';
import { z } from 'zod';

// --- Types ---

type ReportType = 'weekly' | 'monthly' | 'on_demand';
type TrendDirection = 'improving' | 'stable' | 'declining';

interface D7Data {
  summary: string;
  academic: { gpa: number; trend: string; strengths: string[]; gaps: string[] };
  engagement: { score: number; trend: string; peak_hours: string[]; preferred_content: string };
  risk: { level: string; dimensions: Record<string, number>; intervention: string };
  cognitive: { top_intelligences: string[]; learning_style: string };
  gamification: { xp: number; level: number; streak: number; badges_count: number };
  retention: { concepts_mastered: number; concepts_due: number; avg_retention: number };
  linguistic: { cefr: string; vocabulary: number; formality: number };
  recommendations: string[];
  trend_vs_last: TrendDirection;
}

interface D7Report {
  id: string;
  studentId: string;
  tenantId: string;
  type: ReportType;
  data: D7Data;
  viewedByTeacher: boolean;
  createdAt: string;
}

const GenerateSchema = z.object({
  studentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.enum(['weekly', 'monthly', 'on_demand']),
});

type GenerateParams = z.infer<typeof GenerateSchema>;

class OrchWeber {
  // ─── Collect data from all agents ───

  private async collectAcademic(client: PoolClient, studentId: string, tenantId: string) {
    const result = await client.query<{ avg_score: number; count: string }>(
      `SELECT AVG(composite_score) AS avg_score, COUNT(*) AS count
       FROM orch_assessment
       WHERE student_id = $1 AND tenant_id = $2 AND composite_score IS NOT NULL`,
      [studentId, tenantId],
    );
    const gpa = Math.round((result.rows[0]?.avg_score ?? 0) * 100) / 100;

    // Strengths & gaps from quality dimensions
    const qualityResult = await client.query<{ quality_scores: Record<string, number> }>(
      `SELECT quality_scores FROM orch_assessment
       WHERE student_id = $1 AND tenant_id = $2 AND quality_scores IS NOT NULL
       ORDER BY created_at DESC LIMIT 5`,
      [studentId, tenantId],
    );

    const dimSums: Record<string, number> = {};
    const dimCounts: Record<string, number> = {};
    for (const row of qualityResult.rows) {
      for (const [key, val] of Object.entries(row.quality_scores)) {
        dimSums[key] = (dimSums[key] || 0) + val;
        dimCounts[key] = (dimCounts[key] || 0) + 1;
      }
    }

    const dimAvgs = Object.entries(dimSums).map(([key, sum]) => ({
      name: key,
      avg: sum / (dimCounts[key] || 1),
    }));
    dimAvgs.sort((a, b) => b.avg - a.avg);

    const strengths = dimAvgs.slice(0, 2).map((d) => d.name);
    const gaps = dimAvgs.slice(-2).map((d) => d.name);

    // Trend: compare last 2 assessments
    const trendResult = await client.query<{ composite_score: number }>(
      `SELECT composite_score FROM orch_assessment
       WHERE student_id = $1 AND tenant_id = $2 AND composite_score IS NOT NULL
       ORDER BY created_at DESC LIMIT 2`,
      [studentId, tenantId],
    );

    let trend = 'stable';
    if (trendResult.rows.length >= 2) {
      const diff = trendResult.rows[0].composite_score - trendResult.rows[1].composite_score;
      if (diff > 0.5) trend = 'improving';
      else if (diff < -0.5) trend = 'declining';
    }

    return { gpa, trend, strengths, gaps };
  }

  private async collectEngagement(client: PoolClient, studentId: string, tenantId: string) {
    const result = await client.query<{
      engagement_score: number;
      peak_hours: string[];
      preferred_content: string;
    }>(
      `SELECT engagement_score, peak_hours, preferred_content
       FROM orch_engagement_snapshot
       WHERE student_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [studentId, tenantId],
    );

    if (result.rows.length === 0) {
      return { score: 0, trend: 'stable', peak_hours: [], preferred_content: 'unknown' };
    }

    const row = result.rows[0];

    // Trend from last 2 snapshots
    const trendResult = await client.query<{ engagement_score: number }>(
      `SELECT engagement_score FROM orch_engagement_snapshot
       WHERE student_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 2`,
      [studentId, tenantId],
    );
    let trend = 'stable';
    if (trendResult.rows.length >= 2) {
      const diff = trendResult.rows[0].engagement_score - trendResult.rows[1].engagement_score;
      if (diff > 5) trend = 'improving';
      else if (diff < -5) trend = 'declining';
    }

    return {
      score: row.engagement_score ?? 0,
      trend,
      peak_hours: row.peak_hours ?? [],
      preferred_content: row.preferred_content ?? 'unknown',
    };
  }

  private async collectRisk(client: PoolClient, studentId: string) {
    const result = await client.query<{
      level: string;
      dimensions: Record<string, number>;
      intervention: string;
    }>(
      `SELECT level, dimensions, intervention
       FROM orch_risk_assessment
       WHERE student_id = $1
       ORDER BY assessed_at DESC LIMIT 1`,
      [studentId],
    );

    if (result.rows.length === 0) {
      return { level: 'unknown', dimensions: {}, intervention: 'none' };
    }

    const row = result.rows[0];
    return { level: row.level, dimensions: row.dimensions, intervention: row.intervention };
  }

  private async collectCognitive(client: PoolClient, studentId: string) {
    const result = await client.query<{ intelligence_type: string; score: number }>(
      `SELECT intelligence_type, score
       FROM orch_cognitive_profile
       WHERE student_id = $1 AND confidence >= 0.5
       ORDER BY score DESC LIMIT 3`,
      [studentId],
    );

    const topIntelligences = result.rows.map((r) => r.intelligence_type);

    // Learning style derivation
    let learningStyle = 'multimodal';
    if (topIntelligences.includes('linguistic')) learningStyle = 'reading/writing';
    else if (topIntelligences.includes('spatial')) learningStyle = 'visual';
    else if (topIntelligences.includes('bodily_kinesthetic')) learningStyle = 'kinesthetic';
    else if (topIntelligences.includes('musical')) learningStyle = 'auditory';

    return { top_intelligences: topIntelligences, learning_style: learningStyle };
  }

  private async collectGamification(client: PoolClient, studentId: string, tenantId: string) {
    const result = await client.query<{
      xp: number;
      level: number;
      streak: number;
      badges_count: number;
    }>(
      `SELECT xp, level, streak, badges_count
       FROM orch_gamification_profile
       WHERE student_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [studentId, tenantId],
    );

    if (result.rows.length === 0) {
      return { xp: 0, level: 1, streak: 0, badges_count: 0 };
    }

    return result.rows[0];
  }

  private async collectRetention(client: PoolClient, studentId: string, tenantId: string) {
    const result = await client.query<{
      mastered: string;
      due: string;
      avg_retention: number;
    }>(
      `SELECT
        SUM(CASE WHEN retention_score >= 0.8 THEN 1 ELSE 0 END) AS mastered,
        SUM(CASE WHEN next_review_at <= NOW() THEN 1 ELSE 0 END) AS due,
        AVG(retention_score) AS avg_retention
       FROM orch_retention_card
       WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );

    return {
      concepts_mastered: parseInt(result.rows[0]?.mastered ?? '0', 10),
      concepts_due: parseInt(result.rows[0]?.due ?? '0', 10),
      avg_retention: Math.round((result.rows[0]?.avg_retention ?? 0) * 100) / 100,
    };
  }

  private async collectLinguistic(client: PoolClient, studentId: string) {
    const result = await client.query<{
      current_cefr: string;
      avg_vocabulary_richness: number;
      avg_formality_score: number;
    }>(
      `SELECT current_cefr, avg_vocabulary_richness, avg_formality_score
       FROM orch_linguistic_profile
       WHERE student_id = $1
       LIMIT 1`,
      [studentId],
    );

    if (result.rows.length === 0) {
      return { cefr: 'unknown', vocabulary: 0, formality: 0 };
    }

    const row = result.rows[0];
    return {
      cefr: row.current_cefr,
      vocabulary: row.avg_vocabulary_richness,
      formality: row.avg_formality_score,
    };
  }

  // ─── Determine trend vs last report ───

  private async getTrendVsLast(client: PoolClient, studentId: string, tenantId: string): Promise<TrendDirection> {
    const result = await client.query<{ data: D7Data }>(
      `SELECT data FROM orch_d7_report
       WHERE student_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [studentId, tenantId],
    );

    if (result.rows.length === 0) return 'stable';

    const lastData = result.rows[0].data;
    // Simple heuristic: compare academic GPA trend
    if (lastData.academic?.trend === 'improving') return 'improving';
    if (lastData.academic?.trend === 'declining') return 'declining';
    return 'stable';
  }

  // ─── Generate LLM summary ───

  private async generateSummary(data: Omit<D7Data, 'summary' | 'recommendations' | 'trend_vs_last'>, tenantId: string): Promise<{ summary: string; recommendations: string[] }> {
    const { orchLLMService } = await import('../orch-llm.service');

    const response = await orchLLMService.chat(null, {
      tenantId,
      messages: [
        {
          role: 'system',
          content: [
            'You are an educational analyst generating a consolidated student report summary.',
            'Language: Brazilian Portuguese.',
            'Rules:',
            '- Be concise (max 150 words for summary).',
            '- Provide 3-5 actionable recommendations.',
            '- Strengths-based approach: highlight positives first.',
            '- Never accuse or label negatively.',
            'Return ONLY valid JSON: { "summary": "...", "recommendations": ["...", "..."] }',
          ].join('\n'),
        },
        { role: 'user', content: `Student data:\n${JSON.stringify(data, null, 2)}` },
      ],
      model: 'default',
      temperature: 0.5,
      maxTokens: 500,
    });

    const parsed = JSON.parse(response);
    return {
      summary: String(parsed.summary ?? ''),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    };
  }

  // ─── Public: Generate D7 Report ───

  async generateD7(client: PoolClient, params: GenerateParams): Promise<D7Report> {
    const { studentId, tenantId, type } = GenerateSchema.parse(params);

    // Collect all agent data in parallel
    const [academic, engagement, risk, cognitive, gamification, retention, linguistic] = await Promise.all([
      this.collectAcademic(client, studentId, tenantId),
      this.collectEngagement(client, studentId, tenantId),
      this.collectRisk(client, studentId),
      this.collectCognitive(client, studentId),
      this.collectGamification(client, studentId, tenantId),
      this.collectRetention(client, studentId, tenantId),
      this.collectLinguistic(client, studentId),
    ]);

    const trendVsLast = await this.getTrendVsLast(client, studentId, tenantId);

    const partialData = { academic, engagement, risk, cognitive, gamification, retention, linguistic };
    const { summary, recommendations } = await this.generateSummary(partialData, tenantId);

    const data: D7Data = {
      summary,
      academic,
      engagement,
      risk,
      cognitive,
      gamification,
      retention,
      linguistic,
      recommendations,
      trend_vs_last: trendVsLast,
    };

    // Persist
    const insertResult = await client.query<{ id: string; created_at: string }>(
      `INSERT INTO orch_d7_report (student_id, tenant_id, type, data, viewed_by_teacher, created_at)
       VALUES ($1, $2, $3, $4, false, NOW())
       RETURNING id, created_at`,
      [studentId, tenantId, type, JSON.stringify(data)],
    );

    return {
      id: insertResult.rows[0].id,
      studentId,
      tenantId,
      type,
      data,
      viewedByTeacher: false,
      createdAt: insertResult.rows[0].created_at,
    };
  }

  // ─── Batch generators ───

  async generateWeeklyBatch(client: PoolClient, tenantId: string): Promise<D7Report[]> {
    return this.generateBatch(client, tenantId, 'weekly');
  }

  async generateMonthlyBatch(client: PoolClient, tenantId: string): Promise<D7Report[]> {
    return this.generateBatch(client, tenantId, 'monthly');
  }

  private async generateBatch(client: PoolClient, tenantId: string, type: ReportType): Promise<D7Report[]> {
    const studentsResult = await client.query<{ student_id: string }>(
      `SELECT DISTINCT student_id FROM orch_student_profile WHERE tenant_id = $1 AND active = true`,
      [tenantId],
    );

    const reports: D7Report[] = [];
    for (const row of studentsResult.rows) {
      const report = await this.generateD7(client, { studentId: row.student_id, tenantId, type });
      reports.push(report);
    }

    return reports;
  }

  // ─── Get single report ───

  async getReport(client: PoolClient, reportId: string): Promise<D7Report | null> {
    const result = await client.query<{
      id: string;
      student_id: string;
      tenant_id: string;
      type: ReportType;
      data: D7Data;
      viewed_by_teacher: boolean;
      created_at: string;
    }>(
      `SELECT id, student_id, tenant_id, type, data, viewed_by_teacher, created_at
       FROM orch_d7_report
       WHERE id = $1`,
      [reportId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      studentId: row.student_id,
      tenantId: row.tenant_id,
      type: row.type,
      data: row.data,
      viewedByTeacher: row.viewed_by_teacher,
      createdAt: row.created_at,
    };
  }

  // ─── Student report history ───

  async getStudentReports(client: PoolClient, studentId: string, type?: ReportType): Promise<D7Report[]> {
    const query = type
      ? `SELECT id, student_id, tenant_id, type, data, viewed_by_teacher, created_at
         FROM orch_d7_report WHERE student_id = $1 AND type = $2 ORDER BY created_at DESC`
      : `SELECT id, student_id, tenant_id, type, data, viewed_by_teacher, created_at
         FROM orch_d7_report WHERE student_id = $1 ORDER BY created_at DESC`;

    const params = type ? [studentId, type] : [studentId];
    const result = await client.query<{
      id: string; student_id: string; tenant_id: string; type: ReportType;
      data: D7Data; viewed_by_teacher: boolean; created_at: string;
    }>(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      tenantId: row.tenant_id,
      type: row.type,
      data: row.data,
      viewedByTeacher: row.viewed_by_teacher,
      createdAt: row.created_at,
    }));
  }

  // ─── Class reports ───

  async getClassReports(
    client: PoolClient,
    classInstanceId: string,
    type?: ReportType,
  ): Promise<D7Report[]> {
    const typeFilter = type ? `AND d7.type = $2` : '';
    const params: string[] = type ? [classInstanceId, type] : [classInstanceId];

    const result = await client.query<{
      id: string; student_id: string; tenant_id: string; type: ReportType;
      data: D7Data; viewed_by_teacher: boolean; created_at: string;
    }>(
      `SELECT d7.id, d7.student_id, d7.tenant_id, d7.type, d7.data, d7.viewed_by_teacher, d7.created_at
       FROM orch_d7_report d7
       INNER JOIN orch_class_enrollment ce ON ce.student_id = d7.student_id
       WHERE ce.class_instance_id = $1 ${typeFilter}
         AND d7.created_at = (
           SELECT MAX(d72.created_at) FROM orch_d7_report d72
           WHERE d72.student_id = d7.student_id ${type ? `AND d72.type = $2` : ''}
         )
       ORDER BY d7.created_at DESC`,
      params,
    );

    return result.rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      tenantId: row.tenant_id,
      type: row.type,
      data: row.data,
      viewedByTeacher: row.viewed_by_teacher,
      createdAt: row.created_at,
    }));
  }

  // ─── Mark as viewed ───

  async markViewed(client: PoolClient, reportId: string, teacherId: string): Promise<void> {
    await client.query(
      `UPDATE orch_d7_report
       SET viewed_by_teacher = true, viewed_by_teacher_id = $2, viewed_at = NOW()
       WHERE id = $1`,
      [reportId, teacherId],
    );
  }
}

export const orchWeber = new OrchWeber();
