import type { PoolClient } from 'pg';
import { z } from 'zod';

const QuestionSchema = z.object({
  question: z.string(),
  type: z.enum(['multiple_choice', 'true_false', 'fill_blank']),
  options: z.array(z.string()).optional(),
  correct_answer: z.string(),
  difficulty: z.number().min(1).max(5),
});

const RecapQuestionsSchema = z.object({
  questions: z.array(QuestionSchema),
});

type Question = z.infer<typeof QuestionSchema>;

interface Recap {
  id: string;
  student_id: string;
  tenant_id: string;
  date: string;
  status: 'pending' | 'in_progress' | 'completed';
  score: number | null;
  questions: RecapQuestion[];
}

interface RecapQuestion {
  id: string;
  recap_id: string;
  concept_id: string;
  question: string;
  type: string;
  options: string[] | null;
  correct_answer: string;
  student_answer: string | null;
  is_correct: boolean | null;
  difficulty: number;
}

interface GenerateRecapParams {
  studentId: string;
  tenantId: string;
}

interface AnswerParams {
  recapId: string;
  questionId: string;
  studentAnswer: string;
}

class OrchComenius {
  async generateDailyRecap(client: PoolClient, params: GenerateRecapParams): Promise<Recap> {
    const { studentId, tenantId } = params;

    const { orchEbbinghaus } = await import('./orch-ebbinghaus');
    const dueConcepts = await orchEbbinghaus.getDueReviews(client, studentId, 5);

    if (dueConcepts.length === 0) {
      const fallback = await client.query(
        `SELECT * FROM orch_concept_memory
         WHERE student_id = $1
         ORDER BY retention ASC LIMIT 5`,
        [studentId],
      );
      dueConcepts.push(...fallback.rows);
    }

    const conceptLabels = await client.query<{ id: string; label: string }>(
      `SELECT id, label FROM orch_concept WHERE id = ANY($1)`,
      [dueConcepts.map((c) => c.concept_id)],
    );

    const { orchLLMService } = await import('../orch-llm.service');
    const generated = await orchLLMService.generateStructuredOutput(client, {
      tenantId,
      schema: RecapQuestionsSchema,
      prompt: `Generate 5 review questions in Brazilian Portuguese for these concepts:\n${conceptLabels.rows.map((c) => `- ${c.label}`).join('\n')}\n\nMix question types: multiple_choice, true_false, fill_blank. Vary difficulty 1-5.`,
      model: 'default',
    });

    const recapResult = await client.query<{ id: string }>(
      `INSERT INTO orch_daily_recap (student_id, tenant_id, date, status, created_at)
       VALUES ($1, $2, CURRENT_DATE, 'pending', NOW())
       RETURNING id`,
      [studentId, tenantId],
    );
    const recapId = recapResult.rows[0].id;

    const questions: RecapQuestion[] = [];
    for (let i = 0; i < generated.questions.length; i++) {
      const q = generated.questions[i];
      const conceptId = dueConcepts[i % dueConcepts.length]?.concept_id ?? null;

      const qResult = await client.query<RecapQuestion>(
        `INSERT INTO orch_recap_question (recap_id, concept_id, question, type, options, correct_answer, difficulty, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [recapId, conceptId, q.question, q.type, q.options ? JSON.stringify(q.options) : null, q.correct_answer, q.difficulty],
      );
      questions.push(qResult.rows[0]);
    }

    return {
      id: recapId,
      student_id: studentId,
      tenant_id: tenantId,
      date: new Date().toISOString().split('T')[0],
      status: 'pending',
      score: null,
      questions,
    };
  }

  async answerQuestion(client: PoolClient, params: AnswerParams): Promise<{ isCorrect: boolean; xpAwarded: number }> {
    const { recapId, questionId, studentAnswer } = params;

    const q = await client.query<RecapQuestion>(
      `SELECT * FROM orch_recap_question WHERE id = $1 AND recap_id = $2 LIMIT 1`,
      [questionId, recapId],
    );
    if (q.rows.length === 0) throw new Error('Question not found');

    const question = q.rows[0];
    const isCorrect = studentAnswer.trim().toLowerCase() === question.correct_answer.trim().toLowerCase();

    await client.query(
      `UPDATE orch_recap_question SET student_answer = $1, is_correct = $2, answered_at = NOW()
       WHERE id = $3`,
      [studentAnswer, isCorrect, questionId],
    );

    await client.query(
      `UPDATE orch_daily_recap SET status = 'in_progress' WHERE id = $1 AND status = 'pending'`,
      [recapId],
    );

    if (question.concept_id) {
      const { orchEbbinghaus } = await import('./orch-ebbinghaus');
      await orchEbbinghaus.recordReview(client, {
        studentId: (await client.query(`SELECT student_id FROM orch_daily_recap WHERE id = $1`, [recapId])).rows[0].student_id,
        conceptId: question.concept_id,
        quality: isCorrect ? 4 : 1,
      });
    }

    const { orchSisifo } = await import('./orch-sisifo');
    const recap = await client.query(`SELECT student_id, tenant_id FROM orch_daily_recap WHERE id = $1`, [recapId]);
    const { student_id, tenant_id } = recap.rows[0];
    const xpAwarded = isCorrect ? 5 : 0;

    if (xpAwarded > 0) {
      await orchSisifo.awardXP(client, {
        studentId: student_id,
        tenantId: tenant_id,
        amount: xpAwarded,
        source: 'recap_question',
        sourceId: questionId,
      });
    }

    return { isCorrect, xpAwarded };
  }

  async completeRecap(client: PoolClient, recapId: string): Promise<{ score: number; streak: number; bonusXP: number }> {
    const questions = await client.query<RecapQuestion>(
      `SELECT * FROM orch_recap_question WHERE recap_id = $1`,
      [recapId],
    );

    const total = questions.rows.length;
    const correct = questions.rows.filter((q) => q.is_correct).length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    await client.query(
      `UPDATE orch_daily_recap SET status = 'completed', score = $1, completed_at = NOW() WHERE id = $2`,
      [score, recapId],
    );

    const recap = await client.query(`SELECT student_id, tenant_id FROM orch_daily_recap WHERE id = $1`, [recapId]);
    const { student_id, tenant_id } = recap.rows[0];

    const streak = await this.getStreak(client, student_id);

    let bonusXP = 0;
    if (score === 100) {
      bonusXP = 10;
      const { orchSisifo } = await import('./orch-sisifo');
      await orchSisifo.awardXP(client, {
        studentId: student_id,
        tenantId: tenant_id,
        amount: bonusXP,
        source: 'perfect_recap',
        sourceId: recapId,
      });
    }

    return { score, streak, bonusXP };
  }

  async getToday(client: PoolClient, studentId: string): Promise<Recap | null> {
    const result = await client.query<Recap>(
      `SELECT r.*, json_agg(q.*) AS questions
       FROM orch_daily_recap r
       LEFT JOIN orch_recap_question q ON q.recap_id = r.id
       WHERE r.student_id = $1 AND r.date = CURRENT_DATE
       GROUP BY r.id
       LIMIT 1`,
      [studentId],
    );
    return result.rows[0] ?? null;
  }

  async getHistory(client: PoolClient, studentId: string, limit = 30): Promise<Recap[]> {
    const result = await client.query<Recap>(
      `SELECT * FROM orch_daily_recap
       WHERE student_id = $1
       ORDER BY date DESC
       LIMIT $2`,
      [studentId, limit],
    );
    return result.rows;
  }

  async getStreak(client: PoolClient, studentId: string): Promise<number> {
    const result = await client.query<{ streak: number }>(
      `WITH dates AS (
         SELECT DISTINCT date FROM orch_daily_recap
         WHERE student_id = $1 AND status = 'completed'
         ORDER BY date DESC
       ),
       gaps AS (
         SELECT date, date - (ROW_NUMBER() OVER (ORDER BY date DESC))::int AS grp
         FROM dates
       )
       SELECT COUNT(*)::int AS streak FROM gaps
       WHERE grp = (SELECT grp FROM gaps LIMIT 1)`,
      [studentId],
    );
    return result.rows[0]?.streak ?? 0;
  }
}

export const orchComenius = new OrchComenius();
