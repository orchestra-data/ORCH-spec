import type { PoolClient } from 'pg';
import { z } from 'zod';

// --- Types ---

type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

const AnalyzeSchema = z.object({
  studentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  text: z.string().min(1),
  context: z.string().optional(),
});

type AnalyzeParams = z.infer<typeof AnalyzeSchema>;

interface LinguisticSample {
  wordCount: number;
  sentenceCount: number;
  vocabularyRichness: number;
  formalityScore: number;
  grammarErrorCount: number;
  cefrEstimate: CEFRLevel;
}

interface LinguisticProfile {
  studentId: string;
  sampleCount: number;
  avgWordCount: number;
  avgVocabularyRichness: number;
  avgFormalityScore: number;
  avgGrammarErrors: number;
  currentCEFR: CEFRLevel;
  trend: 'improving' | 'stable' | 'declining';
}

// --- Formal word indicators (Portuguese) ---

const FORMAL_INDICATORS = [
  'portanto', 'todavia', 'outrossim', 'ademais', 'destarte', 'consoante',
  'mister', 'imprescindível', 'supracitado', 'doravante', 'precipuamente',
  'indubitavelmente', 'haja vista', 'no que tange', 'em face de',
  'consequentemente', 'primordialmente', 'sobretudo', 'entretanto', 'contudo',
  'nesse sentido', 'diante disso', 'com efeito', 'não obstante', 'à medida que',
];

class OrchWittgenstein {
  // ─── Calculate Type-Token Ratio ───

  private calculateTTR(text: string): number {
    const words = text
      .toLowerCase()
      .replace(/[^\w\sà-ú]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) return 0;

    const uniqueWords = new Set(words);
    return Math.round((uniqueWords.size / words.length) * 1000) / 1000;
  }

  // ─── Calculate formality score ───

  private calculateFormality(text: string): number {
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return 0;

    let formalCount = 0;
    for (const indicator of FORMAL_INDICATORS) {
      if (lower.includes(indicator)) formalCount++;
    }

    // Normalize: ratio of formal indicators found vs total possible, scaled by text length
    const rawScore = formalCount / FORMAL_INDICATORS.length;
    const lengthBonus = Math.min(0.2, words.length / 5000); // Longer texts tend more formal
    return Math.min(1, Math.round((rawScore + lengthBonus) * 1000) / 1000);
  }

  // ─── Estimate CEFR via LLM ───

  private async estimateCEFR(text: string, tenantId: string): Promise<CEFRLevel> {
    const { orchLLMService } = await import('../orch-llm.service');

    const response = await orchLLMService.chat(null, {
      tenantId,
      messages: [
        {
          role: 'system',
          content: [
            'You are a CEFR language proficiency classifier for Brazilian Portuguese.',
            'Classify the text into one of: A1, A2, B1, B2, C1, C2.',
            'Criteria:',
            '- A1: Very basic vocabulary, simple sentences, many errors.',
            '- A2: Basic vocabulary, short sentences, frequent errors.',
            '- B1: Intermediate vocabulary, some complex sentences, occasional errors.',
            '- B2: Good vocabulary range, varied structures, few errors.',
            '- C1: Rich vocabulary, sophisticated structures, rare errors.',
            '- C2: Near-native, nuanced expression, virtually no errors.',
            'Return ONLY the level code (e.g. "B1"). Nothing else.',
          ].join('\n'),
        },
        { role: 'user', content: text },
      ],
      model: 'default',
      temperature: 0.2,
      maxTokens: 10,
    });

    const level = response.trim().toUpperCase() as CEFRLevel;
    const validLevels: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    return validLevels.includes(level) ? level : 'B1';
  }

  // ─── Count grammar errors via LLM ───

  private async countGrammarErrors(text: string, tenantId: string): Promise<number> {
    const { orchLLMService } = await import('../orch-llm.service');

    const response = await orchLLMService.chat(null, {
      tenantId,
      messages: [
        {
          role: 'system',
          content:
            'Count the number of grammar, spelling, and punctuation errors in this Brazilian Portuguese text. Return ONLY a number. If zero errors, return 0.',
        },
        { role: 'user', content: text },
      ],
      model: 'default',
      temperature: 0.1,
      maxTokens: 10,
    });

    const count = parseInt(response.trim(), 10);
    return isNaN(count) ? 0 : Math.max(0, count);
  }

  // ─── Analyze a text sample ───

  async analyzeSample(client: PoolClient, params: AnalyzeParams): Promise<LinguisticSample> {
    const { studentId, tenantId, text, context } = AnalyzeSchema.parse(params);

    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    // Only analyze texts with 50+ words
    if (wordCount < 50) {
      throw new Error(`Text too short for linguistic analysis. Minimum 50 words, found ${wordCount}.`);
    }

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const sentenceCount = sentences.length;

    const vocabularyRichness = this.calculateTTR(text);
    const formalityScore = this.calculateFormality(text);

    // LLM-based analyses (parallel)
    const [grammarErrorCount, cefrEstimate] = await Promise.all([
      this.countGrammarErrors(text, tenantId),
      this.estimateCEFR(text, tenantId),
    ]);

    const sample: LinguisticSample = {
      wordCount,
      sentenceCount,
      vocabularyRichness,
      formalityScore,
      grammarErrorCount,
      cefrEstimate,
    };

    // Persist sample
    await client.query(
      `INSERT INTO orch_linguistic_sample (
        student_id, tenant_id, word_count, sentence_count,
        vocabulary_richness, formality_score, grammar_error_count,
        cefr_estimate, context, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [studentId, tenantId, wordCount, sentenceCount, vocabularyRichness, formalityScore, grammarErrorCount, cefrEstimate, context ?? null],
    );

    // If enough samples, update Bourdieu linguistic profile
    const countResult = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM orch_linguistic_sample WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );
    const sampleCount = parseInt(countResult.rows[0].cnt, 10);

    if (sampleCount >= 5) {
      await this.updateLinguisticProfile(client, studentId, tenantId);
    }

    return sample;
  }

  // ─── Update aggregate linguistic profile ───

  private async updateLinguisticProfile(client: PoolClient, studentId: string, tenantId: string): Promise<void> {
    const result = await client.query<{
      avg_vocab: number;
      avg_formality: number;
      avg_grammar: number;
      latest_cefr: CEFRLevel;
      sample_count: number;
    }>(
      `SELECT
        AVG(vocabulary_richness) AS avg_vocab,
        AVG(formality_score) AS avg_formality,
        AVG(grammar_error_count) AS avg_grammar,
        (SELECT cefr_estimate FROM orch_linguistic_sample WHERE student_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1) AS latest_cefr,
        COUNT(*) AS sample_count
       FROM orch_linguistic_sample
       WHERE student_id = $1 AND tenant_id = $2`,
      [studentId, tenantId],
    );

    const row = result.rows[0];

    await client.query(
      `INSERT INTO orch_linguistic_profile (
        student_id, tenant_id, avg_vocabulary_richness, avg_formality_score,
        avg_grammar_errors, current_cefr, sample_count, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (student_id, tenant_id) DO UPDATE SET
        avg_vocabulary_richness = $3, avg_formality_score = $4,
        avg_grammar_errors = $5, current_cefr = $6, sample_count = $7, updated_at = NOW()`,
      [studentId, tenantId, row.avg_vocab, row.avg_formality, row.avg_grammar, row.latest_cefr, row.sample_count],
    );
  }

  // ─── Get linguistic profile ───

  async getProfile(client: PoolClient, studentId: string): Promise<LinguisticProfile | null> {
    const result = await client.query<{
      student_id: string;
      sample_count: number;
      avg_vocabulary_richness: number;
      avg_formality_score: number;
      avg_grammar_errors: number;
      current_cefr: CEFRLevel;
    }>(
      `SELECT student_id, sample_count, avg_vocabulary_richness, avg_formality_score,
              avg_grammar_errors, current_cefr
       FROM orch_linguistic_profile
       WHERE student_id = $1`,
      [studentId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    // Calculate trend from last 5 samples
    const trendResult = await client.query<{ cefr_estimate: CEFRLevel }>(
      `SELECT cefr_estimate FROM orch_linguistic_sample
       WHERE student_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [studentId],
    );

    const cefrOrder: Record<CEFRLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
    const recent = trendResult.rows.map((r) => cefrOrder[r.cefr_estimate]);
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (recent.length >= 3) {
      const first = recent[recent.length - 1];
      const last = recent[0];
      if (last > first) trend = 'improving';
      else if (last < first) trend = 'declining';
    }

    return {
      studentId: row.student_id,
      sampleCount: row.sample_count,
      avgWordCount: 0, // Not stored in aggregate — would require recalc
      avgVocabularyRichness: row.avg_vocabulary_richness,
      avgFormalityScore: row.avg_formality_score,
      avgGrammarErrors: row.avg_grammar_errors,
      currentCEFR: row.current_cefr,
      trend,
    };
  }
}

export const orchWittgenstein = new OrchWittgenstein();
