import type { PoolClient } from 'pg';
import { z } from 'zod';

// --- Schemas ---

const SubmitAssessmentSchema = z.object({
  studentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  classInstanceId: z.string().uuid(),
  text: z.string().min(1),
  url: z.string().url().optional(),
});

type SubmitAssessmentParams = z.infer<typeof SubmitAssessmentSchema>;

interface QualityDimensions {
  clarity: number;
  coherence: number;
  depth: number;
  originality: number;
  technical: number;
}

interface PlagiarismMatch {
  source: string;
  similarity: number;
  excerpt: string;
}

interface PlagiarismResult {
  score: number;
  matches: PlagiarismMatch[];
}

interface AIDetectionResult {
  score: number;
  perplexity: number;
  burstiness: number;
}

interface StylometricResult {
  deviation: number;
  avgSentenceLength: number;
  ttr: number;
  punctuationPattern: Record<string, number>;
}

interface CompositeResult {
  score: number;
  weights: Record<string, number>;
}

interface AssessmentResult {
  id: string;
  stage: number;
  quality: QualityDimensions;
  plagiarism: PlagiarismResult;
  aiDetection: AIDetectionResult;
  stylometric: { deviation: number };
  composite: CompositeResult;
  feedback: string;
  reviewStatus: 'pending' | 'reviewed' | 'contested';
}

interface TeacherReviewParams {
  assessmentId: string;
  professorNotes: string;
  finalGrade: number;
}

// --- Winnowing constants ---

const KGRAM_SIZE = 5;
const WINDOW_SIZE = 4;

class OrchAristoteles {
  // ─── Stage 1: Receive & Validate ───

  private stage1_receive(text: string): { valid: boolean; wordCount: number; error?: string } {
    const trimmed = text.trim();
    if (!trimmed) return { valid: false, wordCount: 0, error: 'Empty submission' };

    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount < 50) {
      return { valid: false, wordCount, error: `Minimum 50 words required. Found: ${wordCount}` };
    }

    return { valid: true, wordCount };
  }

  // ─── Stage 2: Quality Analysis ───

  private async stage2_quality(text: string, tenantId: string): Promise<QualityDimensions> {
    const { orchLLMService } = await import('../orch-llm.service');

    const systemPrompt = [
      'You are an academic quality evaluator. Analyze the submitted text and score each dimension from 0 to 10.',
      'Return ONLY valid JSON with these exact keys: clarity, coherence, depth, originality, technical.',
      'Each value must be a number between 0 and 10.',
      'Be rigorous but fair.',
    ].join('\n');

    const response = await orchLLMService.chat(null, {
      tenantId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Evaluate this text:\n\n${text}` },
      ],
      model: 'default',
      temperature: 0.3,
      maxTokens: 200,
    });

    const parsed = JSON.parse(response);
    return {
      clarity: Math.min(10, Math.max(0, Number(parsed.clarity) || 0)),
      coherence: Math.min(10, Math.max(0, Number(parsed.coherence) || 0)),
      depth: Math.min(10, Math.max(0, Number(parsed.depth) || 0)),
      originality: Math.min(10, Math.max(0, Number(parsed.originality) || 0)),
      technical: Math.min(10, Math.max(0, Number(parsed.technical) || 0)),
    };
  }

  // ─── Stage 3: Plagiarism Detection (Winnowing) ───

  private generateKgrams(text: string): string[] {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const kgrams: string[] = [];
    for (let i = 0; i <= normalized.length - KGRAM_SIZE; i++) {
      kgrams.push(normalized.substring(i, i + KGRAM_SIZE));
    }
    return kgrams;
  }

  private hashKgram(kgram: string): number {
    let hash = 0;
    for (let i = 0; i < kgram.length; i++) {
      hash = ((hash << 5) - hash + kgram.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  private winnowFingerprints(hashes: number[]): number[] {
    if (hashes.length < WINDOW_SIZE) return hashes;

    const fingerprints: number[] = [];
    for (let i = 0; i <= hashes.length - WINDOW_SIZE; i++) {
      const window = hashes.slice(i, i + WINDOW_SIZE);
      fingerprints.push(Math.min(...window));
    }
    return [...new Set(fingerprints)];
  }

  private async stage3_plagiarism(
    client: PoolClient,
    text: string,
    studentId: string,
    assignmentId: string,
  ): Promise<PlagiarismResult> {
    const kgrams = this.generateKgrams(text);
    const hashes = kgrams.map((kg) => this.hashKgram(kg));
    const fingerprints = this.winnowFingerprints(hashes);
    const fingerprintSet = new Set(fingerprints);

    // Fetch other submissions for the same assignment
    const othersResult = await client.query<{ student_id: string; fingerprints: number[]; text_excerpt: string }>(
      `SELECT student_id, fingerprints, SUBSTRING(submission_text, 1, 200) AS text_excerpt
       FROM orch_assessment
       WHERE assignment_id = $1 AND student_id != $2 AND fingerprints IS NOT NULL`,
      [assignmentId, studentId],
    );

    const matches: PlagiarismMatch[] = [];
    for (const other of othersResult.rows) {
      if (!other.fingerprints || other.fingerprints.length === 0) continue;

      const otherSet = new Set(other.fingerprints);
      let overlap = 0;
      for (const fp of fingerprintSet) {
        if (otherSet.has(fp)) overlap++;
      }

      const similarity = fingerprintSet.size > 0 ? overlap / fingerprintSet.size : 0;
      if (similarity > 0.3) {
        matches.push({
          source: `student:${other.student_id}`,
          similarity: Math.round(similarity * 100) / 100,
          excerpt: other.text_excerpt,
        });
      }
    }

    const maxSimilarity = matches.length > 0 ? Math.max(...matches.map((m) => m.similarity)) : 0;

    return { score: maxSimilarity, matches };
  }

  // ─── Stage 4: AI Detection ───

  private async stage4_aiDetect(
    text: string,
    tenantId: string,
    baseline?: StylometricResult | null,
  ): Promise<AIDetectionResult> {
    // Burstiness: human text has varied sentence lengths; AI text is uniform
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const lengths = sentences.map((s) => s.trim().split(/\s+/).length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
    const variance = lengths.reduce((a, b) => a + (b - avgLen) ** 2, 0) / (lengths.length || 1);
    const stdDev = Math.sqrt(variance);
    // Normalize burstiness: low stdDev relative to mean = more AI-like
    const burstiness = avgLen > 0 ? Math.min(1, stdDev / avgLen) : 0;

    // LLM perplexity estimation
    const { orchLLMService } = await import('../orch-llm.service');
    const response = await orchLLMService.chat(null, {
      tenantId,
      messages: [
        {
          role: 'system',
          content:
            'Estimate how likely this text was generated by AI. Return ONLY a JSON object: { "perplexity": number (0-100, lower=more AI-like), "ai_probability": number (0.0-1.0) }.',
        },
        { role: 'user', content: text },
      ],
      model: 'default',
      temperature: 0.2,
      maxTokens: 100,
    });

    const parsed = JSON.parse(response);
    let score = Math.min(1, Math.max(0, Number(parsed.ai_probability) || 0));
    const perplexity = Math.min(100, Math.max(0, Number(parsed.perplexity) || 50));

    // If we have a baseline, stylometric deviation increases suspicion
    if (baseline && baseline.deviation > 0.5) {
      score = Math.min(1, score + 0.1);
    }

    return { score, perplexity, burstiness };
  }

  // ─── Stage 5: Stylometric Profiling ───

  private calculateStylometricFeatures(text: string): Omit<StylometricResult, 'deviation'> {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
    const uniqueWords = new Set(words);

    const avgSentenceLength = words.length / (sentences.length || 1);
    const ttr = words.length > 0 ? uniqueWords.size / words.length : 0;

    const punctuationPattern: Record<string, number> = {};
    const punctuations = text.match(/[,;:!?\-()]/g) || [];
    for (const p of punctuations) {
      punctuationPattern[p] = (punctuationPattern[p] || 0) + 1;
    }
    // Normalize by word count
    for (const key of Object.keys(punctuationPattern)) {
      punctuationPattern[key] = Math.round((punctuationPattern[key] / (words.length || 1)) * 1000) / 1000;
    }

    return { avgSentenceLength, ttr, punctuationPattern };
  }

  private async stage5_stylometric(
    client: PoolClient,
    text: string,
    studentId: string,
    tenantId: string,
  ): Promise<StylometricResult> {
    const features = this.calculateStylometricFeatures(text);

    // Check for existing baseline
    const baselineResult = await client.query<{
      avg_sentence_length: number;
      ttr: number;
      punctuation_pattern: Record<string, number>;
    }>(
      `SELECT avg_sentence_length, ttr, punctuation_pattern
       FROM orch_stylometric_baseline
       WHERE student_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [studentId, tenantId],
    );

    let deviation = 0;

    if (baselineResult.rows.length > 0) {
      const baseline = baselineResult.rows[0];
      const sentenceDiff = Math.abs(features.avgSentenceLength - baseline.avg_sentence_length) / (baseline.avg_sentence_length || 1);
      const ttrDiff = Math.abs(features.ttr - baseline.ttr) / (baseline.ttr || 1);
      deviation = Math.min(1, (sentenceDiff + ttrDiff) / 2);
    } else {
      // Create baseline from first submission
      await client.query(
        `INSERT INTO orch_stylometric_baseline (student_id, tenant_id, avg_sentence_length, ttr, punctuation_pattern, sample_count, created_at)
         VALUES ($1, $2, $3, $4, $5, 1, NOW())
         ON CONFLICT (student_id, tenant_id) DO UPDATE SET
           avg_sentence_length = $3, ttr = $4, punctuation_pattern = $5,
           sample_count = orch_stylometric_baseline.sample_count + 1`,
        [studentId, tenantId, features.avgSentenceLength, features.ttr, JSON.stringify(features.punctuationPattern)],
      );
    }

    return { deviation, ...features };
  }

  // ─── Stage 6: Composite Score ───

  private stage6_composite(
    quality: QualityDimensions,
    plagiarism: PlagiarismResult,
    aiDetection: AIDetectionResult,
  ): CompositeResult {
    const weights = { quality: 0.5, plagiarism: 0.25, aiDetection: 0.25 };

    const qualityAvg = (quality.clarity + quality.coherence + quality.depth + quality.originality + quality.technical) / 5;
    const qualityNormalized = qualityAvg / 10; // 0-1

    // Plagiarism penalty: high similarity = lower score
    const plagiarismPenalty = plagiarism.score > 0.5 ? plagiarism.score * weights.plagiarism : 0;

    // AI penalty: only applied if confidence > 0.7
    const aiPenalty = aiDetection.score > 0.7 ? (aiDetection.score - 0.7) * weights.aiDetection : 0;

    const score = Math.max(0, Math.min(10, qualityNormalized * 10 * weights.quality / weights.quality - plagiarismPenalty * 10 - aiPenalty * 10));

    return {
      score: Math.round(score * 100) / 100,
      weights: { quality: weights.quality, plagiarism_penalty: plagiarismPenalty, ai_penalty: aiPenalty },
    };
  }

  // ─── Stage 7: Feedback Generation ───

  private async stage7_feedback(
    quality: QualityDimensions,
    plagiarism: PlagiarismResult,
    aiDetection: AIDetectionResult,
    composite: CompositeResult,
    tenantId: string,
  ): Promise<string> {
    const { orchLLMService } = await import('../orch-llm.service');

    const systemPrompt = [
      'You are a supportive academic advisor generating feedback for a student submission.',
      'Language: Brazilian Portuguese.',
      'RULES:',
      '- Be CONSTRUCTIVE. Never accuse.',
      '- Use "areas for improvement" language.',
      '- Highlight strengths first, then suggestions.',
      '- NEVER mention plagiarism or AI detection directly. If there are concerns, suggest "revisiting sources" or "adding more personal analysis".',
      '- Keep it under 200 words.',
    ].join('\n');

    const context = JSON.stringify({ quality, compositeScore: composite.score });

    const feedback = await orchLLMService.chat(null, {
      tenantId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate feedback based on this analysis:\n${context}` },
      ],
      model: 'default',
      temperature: 0.6,
      maxTokens: 400,
    });

    return feedback;
  }

  // ─── Public: Submit Assessment ───

  async submitAssessment(client: PoolClient, params: SubmitAssessmentParams): Promise<AssessmentResult> {
    const validated = SubmitAssessmentSchema.parse(params);
    const { studentId, tenantId, assignmentId, classInstanceId, text, url } = validated;

    // Stage 1
    const received = this.stage1_receive(text);
    if (!received.valid) {
      throw new Error(`Assessment rejected: ${received.error}`);
    }

    // Stage 2
    const quality = await this.stage2_quality(text, tenantId);

    // Stage 3
    const plagiarism = await this.stage3_plagiarism(client, text, studentId, assignmentId);

    // Stage 5 (before stage 4 so we can pass baseline)
    const stylometric = await this.stage5_stylometric(client, text, studentId, tenantId);

    // Stage 4
    const aiDetection = await this.stage4_aiDetect(text, tenantId, stylometric);

    // Stage 6
    const composite = this.stage6_composite(quality, plagiarism, aiDetection);

    // Stage 7
    const feedback = await this.stage7_feedback(quality, plagiarism, aiDetection, composite, tenantId);

    // Persist
    const fingerprints = this.winnowFingerprints(
      this.generateKgrams(text).map((kg) => this.hashKgram(kg)),
    );

    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO orch_assessment (
        student_id, tenant_id, assignment_id, class_instance_id,
        submission_text, submission_url, word_count,
        quality_scores, plagiarism_result, ai_detection_result,
        stylometric_result, composite_score, feedback,
        fingerprints, review_status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', NOW())
      RETURNING id`,
      [
        studentId, tenantId, assignmentId, classInstanceId,
        text, url ?? null, received.wordCount,
        JSON.stringify(quality), JSON.stringify(plagiarism), JSON.stringify(aiDetection),
        JSON.stringify(stylometric), composite.score, feedback,
        JSON.stringify(fingerprints),
      ],
    );

    return {
      id: insertResult.rows[0].id,
      stage: 7,
      quality,
      plagiarism,
      aiDetection,
      stylometric: { deviation: stylometric.deviation },
      composite,
      feedback,
      reviewStatus: 'pending',
    };
  }

  // ─── Public: Get Assessment ───

  async getAssessment(client: PoolClient, assessmentId: string): Promise<AssessmentResult | null> {
    const result = await client.query<{
      id: string;
      quality_scores: QualityDimensions;
      plagiarism_result: PlagiarismResult;
      ai_detection_result: AIDetectionResult;
      stylometric_result: { deviation: number };
      composite_score: number;
      feedback: string;
      review_status: 'pending' | 'reviewed' | 'contested';
    }>(
      `SELECT id, quality_scores, plagiarism_result, ai_detection_result,
              stylometric_result, composite_score, feedback, review_status
       FROM orch_assessment
       WHERE id = $1`,
      [assessmentId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      stage: 7,
      quality: row.quality_scores,
      plagiarism: row.plagiarism_result,
      aiDetection: row.ai_detection_result,
      stylometric: row.stylometric_result,
      composite: { score: row.composite_score, weights: {} },
      feedback: row.feedback,
      reviewStatus: row.review_status,
    };
  }

  // ─── Public: Teacher Review ───

  async teacherReview(client: PoolClient, params: TeacherReviewParams): Promise<void> {
    const { assessmentId, professorNotes, finalGrade } = params;

    await client.query(
      `UPDATE orch_assessment
       SET review_status = 'reviewed',
           professor_notes = $2,
           final_grade = $3,
           professor_reviewed_at = NOW()
       WHERE id = $1`,
      [assessmentId, professorNotes, finalGrade],
    );
  }

  // ─── Public: Class Assessments ───

  async getClassAssessments(
    client: PoolClient,
    classInstanceId: string,
  ): Promise<Array<{ id: string; studentId: string; compositeScore: number; reviewStatus: string }>> {
    const result = await client.query<{
      id: string;
      student_id: string;
      composite_score: number;
      review_status: string;
    }>(
      `SELECT id, student_id, composite_score, review_status
       FROM orch_assessment
       WHERE class_instance_id = $1
       ORDER BY created_at DESC`,
      [classInstanceId],
    );

    return result.rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      compositeScore: r.composite_score,
      reviewStatus: r.review_status,
    }));
  }
}

export const orchAristoteles = new OrchAristoteles();
