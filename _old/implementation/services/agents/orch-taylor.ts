import type { PoolClient } from 'pg';

const ENGAGEMENT_WEIGHTS = {
  login: 0.10,
  time: 0.20,
  content: 0.25,
  social: 0.10,
  assessment: 0.20,
  ai: 0.15,
};

interface CalculateEngagementParams {
  studentId: string;
  tenantId: string;
  date?: string; // ISO date, defaults to today
}

interface EngagementSnapshot {
  studentId: string;
  date: string;
  loginScore: number;
  timeScore: number;
  contentScore: number;
  socialScore: number;
  assessmentScore: number;
  aiScore: number;
  compositeScore: number;
  trend: 'rising' | 'stable' | 'declining';
}

interface SubScores {
  login: number;
  time: number;
  content: number;
  social: number;
  assessment: number;
  ai: number;
}

class OrchTaylor {
  async calculateEngagement(client: PoolClient, params: CalculateEngagementParams): Promise<EngagementSnapshot> {
    const { studentId, tenantId, date } = params;
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    const events = await client.query<{ event_type: string; event_count: number; total_duration: number }>(
      `SELECT event_type,
              COUNT(*)::int AS event_count,
              COALESCE(SUM(duration_seconds), 0)::int AS total_duration
       FROM experience_event
       WHERE student_id = $1 AND tenant_id = $2 AND event_date = $3
       GROUP BY event_type`,
      [studentId, tenantId, targetDate],
    );

    const eventMap = new Map(events.rows.map((e) => [e.event_type, e]));

    const sub: SubScores = {
      login: this.scoreLogin(eventMap.get('login')?.event_count ?? 0),
      time: this.scoreTime(eventMap.get('session')?.total_duration ?? 0),
      content: this.scoreContent(
        (eventMap.get('video_watched')?.event_count ?? 0) +
        (eventMap.get('material_opened')?.event_count ?? 0) +
        (eventMap.get('page_viewed')?.event_count ?? 0),
      ),
      social: this.scoreSocial(
        (eventMap.get('forum_post')?.event_count ?? 0) +
        (eventMap.get('comment')?.event_count ?? 0),
      ),
      assessment: this.scoreAssessment(
        (eventMap.get('quiz_completed')?.event_count ?? 0) +
        (eventMap.get('assignment_submitted')?.event_count ?? 0),
      ),
      ai: this.scoreAI(eventMap.get('ai_interaction')?.event_count ?? 0),
    };

    const compositeScore = Math.round(
      sub.login * ENGAGEMENT_WEIGHTS.login +
      sub.time * ENGAGEMENT_WEIGHTS.time +
      sub.content * ENGAGEMENT_WEIGHTS.content +
      sub.social * ENGAGEMENT_WEIGHTS.social +
      sub.assessment * ENGAGEMENT_WEIGHTS.assessment +
      sub.ai * ENGAGEMENT_WEIGHTS.ai,
    );

    const trend = await this.calculateTrend(client, studentId, tenantId, compositeScore);

    return {
      studentId,
      date: targetDate,
      loginScore: sub.login,
      timeScore: sub.time,
      contentScore: sub.content,
      socialScore: sub.social,
      assessmentScore: sub.assessment,
      aiScore: sub.ai,
      compositeScore,
      trend,
    };
  }

  async snapshotEngagement(client: PoolClient, tenantId: string): Promise<number> {
    const students = await client.query<{ student_id: string }>(
      `SELECT DISTINCT student_id FROM orch_student_profile
       WHERE tenant_id = $1 AND is_active = true`,
      [tenantId],
    );

    let processed = 0;
    for (const { student_id } of students.rows) {
      const snapshot = await this.calculateEngagement(client, { studentId: student_id, tenantId });

      await client.query(
        `INSERT INTO orch_engagement_snapshot
         (student_id, tenant_id, date, login_score, time_score, content_score, social_score, assessment_score, ai_score, composite_score, trend, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (student_id, tenant_id, date)
         DO UPDATE SET login_score = $4, time_score = $5, content_score = $6, social_score = $7,
                       assessment_score = $8, ai_score = $9, composite_score = $10, trend = $11`,
        [student_id, tenantId, snapshot.date, snapshot.loginScore, snapshot.timeScore,
         snapshot.contentScore, snapshot.socialScore, snapshot.assessmentScore, snapshot.aiScore,
         snapshot.compositeScore, snapshot.trend],
      );

      await this.updateProfileEngagement(client, student_id, snapshot);
      processed++;
    }

    return processed;
  }

  async updateProfileEngagement(client: PoolClient, studentId: string, snapshot: EngagementSnapshot): Promise<void> {
    const level = snapshot.compositeScore >= 80 ? 'high'
      : snapshot.compositeScore >= 50 ? 'medium'
      : snapshot.compositeScore >= 20 ? 'low'
      : 'inactive';

    await client.query(
      `UPDATE orch_student_profile
       SET engagement_level = $1, engagement_score = $2, engagement_trend = $3, updated_at = NOW()
       WHERE student_id = $4`,
      [level, snapshot.compositeScore, snapshot.trend, studentId],
    );
  }

  private async calculateTrend(
    client: PoolClient,
    studentId: string,
    tenantId: string,
    currentScore: number,
  ): Promise<'rising' | 'stable' | 'declining'> {
    const history = await client.query<{ composite_score: number }>(
      `SELECT composite_score FROM orch_engagement_snapshot
       WHERE student_id = $1 AND tenant_id = $2
       ORDER BY date DESC LIMIT 7`,
      [studentId, tenantId],
    );

    if (history.rows.length < 3) return 'stable';

    const avg = history.rows.reduce((sum, r) => sum + r.composite_score, 0) / history.rows.length;
    const diff = currentScore - avg;

    if (diff > 10) return 'rising';
    if (diff < -10) return 'declining';
    return 'stable';
  }

  private scoreLogin(count: number): number {
    return count >= 1 ? 100 : 0;
  }

  private scoreTime(seconds: number): number {
    const minutes = seconds / 60;
    if (minutes >= 60) return 100;
    if (minutes >= 30) return 75;
    if (minutes >= 15) return 50;
    if (minutes >= 5) return 25;
    return 0;
  }

  private scoreContent(interactions: number): number {
    return Math.min(100, interactions * 20);
  }

  private scoreSocial(posts: number): number {
    return Math.min(100, posts * 33);
  }

  private scoreAssessment(completed: number): number {
    return Math.min(100, completed * 50);
  }

  private scoreAI(interactions: number): number {
    return Math.min(100, interactions * 25);
  }
}

export const orchTaylor = new OrchTaylor();
