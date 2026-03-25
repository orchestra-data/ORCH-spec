import type { PoolClient } from 'pg';
import { z } from 'zod';

// --- Intelligence types ---

const INTELLIGENCES = [
  'linguistic',
  'logical_mathematical',
  'spatial',
  'musical',
  'bodily_kinesthetic',
  'interpersonal',
  'intrapersonal',
  'naturalistic',
] as const;

type Intelligence = (typeof INTELLIGENCES)[number];

const SIGNAL_MAP: Record<string, Intelligence[]> = {
  video_watch: ['spatial'],
  long_text_read: ['linguistic'],
  code_exercise: ['logical_mathematical'],
  group_discussion: ['interpersonal'],
  self_reflection: ['intrapersonal'],
  diagram_request: ['spatial'],
  formula_solve: ['logical_mathematical'],
  analogy_use: ['linguistic', 'spatial'],
  music_interaction: ['musical'],
  physical_activity: ['bodily_kinesthetic'],
  nature_observation: ['naturalistic'],
  debate_participation: ['linguistic', 'interpersonal'],
  journaling: ['intrapersonal', 'linguistic'],
  pattern_recognition: ['logical_mathematical', 'spatial'],
};

const ObserveSchema = z.object({
  studentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  interactionType: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

type ObserveParams = z.infer<typeof ObserveSchema>;

interface CognitiveProfile {
  studentId: string;
  intelligences: Array<{ type: Intelligence; score: number; confidence: number; observationCount: number }>;
  topStrengths: Intelligence[];
}

class OrchGardner {
  // ─── Observe an interaction ───

  async observe(client: PoolClient, params: ObserveParams): Promise<void> {
    const { studentId, tenantId, interactionType, metadata } = ObserveSchema.parse(params);

    const signals = SIGNAL_MAP[interactionType];
    if (!signals || signals.length === 0) return;

    // Insert observation for each mapped intelligence
    for (const intelligence of signals) {
      await client.query(
        `INSERT INTO orch_cognitive_observation (student_id, tenant_id, intelligence_type, interaction_type, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [studentId, tenantId, intelligence, interactionType, JSON.stringify(metadata ?? {})],
      );
    }

    // Check if we should update confidence for any intelligence
    for (const intelligence of signals) {
      const countResult = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM orch_cognitive_observation
         WHERE student_id = $1 AND tenant_id = $2 AND intelligence_type = $3`,
        [studentId, tenantId, intelligence],
      );

      const count = parseInt(countResult.rows[0].cnt, 10);
      if (count >= 10) {
        const confidence = this.calculateConfidence(count);
        await this.updateProfile(client, studentId, tenantId, intelligence, confidence, count);
      }
    }
  }

  // ─── Calculate confidence ───

  private calculateConfidence(observationCount: number): number {
    // Logarithmic growth: more observations = higher confidence, asymptotic to 1.0
    // 10 obs = 0.5, 20 obs = 0.65, 50 obs = 0.85, 100 obs = 0.95
    return Math.min(0.99, 1 - 1 / (1 + Math.log2(observationCount / 5)));
  }

  // ─── Update cognitive profile ───

  private async updateProfile(
    client: PoolClient,
    studentId: string,
    tenantId: string,
    intelligence: Intelligence,
    confidence: number,
    observationCount: number,
  ): Promise<void> {
    // Score: weighted by observation frequency relative to total observations
    const totalResult = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM orch_cognitive_observation
       WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );
    const total = parseInt(totalResult.rows[0].cnt, 10);
    const score = total > 0 ? Math.round((observationCount / total) * 100) / 100 : 0;

    await client.query(
      `INSERT INTO orch_cognitive_profile (student_id, tenant_id, intelligence_type, score, confidence, observation_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (student_id, tenant_id, intelligence_type) DO UPDATE SET
         score = $4, confidence = $5, observation_count = $6, updated_at = NOW()`,
      [studentId, tenantId, intelligence, score, confidence, observationCount],
    );
  }

  // ─── Get full profile ───

  async getProfile(client: PoolClient, studentId: string): Promise<CognitiveProfile> {
    const result = await client.query<{
      intelligence_type: Intelligence;
      score: number;
      confidence: number;
      observation_count: number;
    }>(
      `SELECT intelligence_type, score, confidence, observation_count
       FROM orch_cognitive_profile
       WHERE student_id = $1
       ORDER BY score DESC`,
      [studentId],
    );

    const intelligences = result.rows.map((r) => ({
      type: r.intelligence_type,
      score: r.score,
      confidence: r.confidence,
      observationCount: r.observation_count,
    }));

    // STRENGTHS-BASED: top 3 intelligences only
    const topStrengths = intelligences
      .filter((i) => i.confidence >= 0.5)
      .slice(0, 3)
      .map((i) => i.type);

    return { studentId, intelligences, topStrengths };
  }
}

export const orchGardner = new OrchGardner();
