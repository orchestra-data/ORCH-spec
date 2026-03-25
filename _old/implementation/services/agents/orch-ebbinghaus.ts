import type { PoolClient } from 'pg';
import { z } from 'zod';

interface ReviewParams {
  studentId: string;
  conceptId: string;
  quality: number; // 0-5
}

interface ExtractConceptsParams {
  studentId: string;
  tenantId: string;
  message: string;
  agentResponse: string;
}

interface ConceptMemory {
  id: string;
  student_id: string;
  concept_id: string;
  concept_label: string;
  easiness_factor: number;
  repetitions: number;
  interval_days: number;
  retention: number;
  next_review: Date;
  last_review: Date;
}

const ConceptExtractionSchema = z.object({
  concepts: z.array(z.object({
    label: z.string(),
    description: z.string(),
    difficulty: z.number().min(1).max(5),
  })),
});

class OrchEbbinghaus {
  calculateRetention(lastReview: Date, intervalDays: number): number {
    const now = Date.now();
    const t = (now - lastReview.getTime()) / (1000 * 60 * 60 * 24); // days since review
    const S = Math.max(intervalDays, 1); // stability
    return Math.exp(-t / S);
  }

  async recordReview(client: PoolClient, params: ReviewParams): Promise<ConceptMemory> {
    const { studentId, conceptId, quality } = params;
    const q = Math.max(0, Math.min(5, Math.round(quality)));

    const existing = await client.query<ConceptMemory>(
      `SELECT * FROM orch_concept_memory
       WHERE student_id = $1 AND concept_id = $2
       LIMIT 1`,
      [studentId, conceptId],
    );

    let ef = existing.rows[0]?.easiness_factor ?? 2.5;
    let reps = existing.rows[0]?.repetitions ?? 0;
    let interval = existing.rows[0]?.interval_days ?? 1;

    if (q >= 3) {
      reps++;
      if (reps === 1) {
        interval = 1;
      } else if (reps === 2) {
        interval = 6;
      } else {
        interval = Math.round(interval * ef);
      }
    } else {
      reps = 0;
      interval = 1;
    }

    ef = Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

    const nextReview = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);

    const result = await client.query<ConceptMemory>(
      `INSERT INTO orch_concept_memory (student_id, concept_id, easiness_factor, repetitions, interval_days, retention, next_review, last_review, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1.0, $6, NOW(), NOW())
       ON CONFLICT (student_id, concept_id)
       DO UPDATE SET
         easiness_factor = $3,
         repetitions = $4,
         interval_days = $5,
         retention = 1.0,
         next_review = $6,
         last_review = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [studentId, conceptId, ef, reps, interval, nextReview],
    );

    return result.rows[0];
  }

  async getDueReviews(client: PoolClient, studentId: string, limit = 10): Promise<ConceptMemory[]> {
    const result = await client.query<ConceptMemory>(
      `SELECT * FROM orch_concept_memory
       WHERE student_id = $1 AND next_review <= NOW()
       ORDER BY retention ASC
       LIMIT $2`,
      [studentId, limit],
    );
    return result.rows;
  }

  async extractConcepts(client: PoolClient, params: ExtractConceptsParams): Promise<void> {
    const { studentId, tenantId, message, agentResponse } = params;

    const { orchLLMService } = await import('../orch-llm.service');
    const extracted = await orchLLMService.generateStructuredOutput(client, {
      tenantId,
      schema: ConceptExtractionSchema,
      prompt: `Extract educational concepts discussed in this tutor interaction.\n\nStudent: ${message}\n\nTutor: ${agentResponse}\n\nExtract the key concepts the student is learning about.`,
      model: 'default',
    });

    for (const concept of extracted.concepts) {
      await client.query(
        `INSERT INTO orch_concept (label, description, difficulty, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (label, tenant_id) DO NOTHING`,
        [concept.label, concept.description, concept.difficulty, tenantId],
      );

      const conceptRow = await client.query<{ id: string }>(
        `SELECT id FROM orch_concept WHERE label = $1 AND tenant_id = $2 LIMIT 1`,
        [concept.label, tenantId],
      );

      if (conceptRow.rows[0]) {
        await client.query(
          `INSERT INTO orch_concept_memory (student_id, concept_id, easiness_factor, repetitions, interval_days, retention, next_review, last_review, updated_at)
           VALUES ($1, $2, 2.5, 0, 1, 0.5, NOW() + INTERVAL '1 day', NOW(), NOW())
           ON CONFLICT (student_id, concept_id) DO NOTHING`,
          [studentId, conceptRow.rows[0].id],
        );
      }
    }
  }
}

export const orchEbbinghaus = new OrchEbbinghaus();
