import type { PoolClient } from 'pg';

interface GenerateCaseParams {
  tenantId: string;
  unitId: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

interface DiscussParams {
  caseId: string;
  studentId: string;
  response: string;
}

interface RateParams {
  caseId: string;
  professorRating: number;
  professorFeedback?: string;
}

interface ListParams {
  tenantId: string;
  unitId?: string;
  difficulty?: string;
  page?: number;
  limit?: number;
}

class OrchDewey {
  async generateCase(
    client: PoolClient,
    params: GenerateCaseParams,
  ): Promise<{
    id: string;
    title: string;
    description: string;
    context: string;
    challenge: string;
    learningObjectives: string[];
  }> {
    const { tenantId, unitId, difficulty = 'intermediate' } = params;

    // 1. Fetch lesson content via RAG
    const ragResult = await client.query<{ content: string }>(
      `SELECT content FROM orch_rag_chunk
       WHERE unit_id = $1 AND tenant_id = $2
       ORDER BY relevance_score DESC
       LIMIT 8`,
      [unitId, tenantId],
    );
    const lessonContent = ragResult.rows.map((r) => r.content).join('\n---\n');

    // 2. Search for high-rated similar cases (CBR flywheel)
    const similarCases = await client.query(
      `SELECT title, description, challenge, avg_rating
       FROM orch_case_study
       WHERE tenant_id = $1 AND avg_rating >= 3.5
       ORDER BY avg_rating DESC
       LIMIT 3`,
      [tenantId],
    );
    const cbrReference = similarCases.rows.length > 0
      ? `\n\nHigh-rated reference cases for quality calibration:\n${similarCases.rows.map((c) => `- "${c.title}": ${c.description} (rating: ${c.avg_rating})`).join('\n')}`
      : '';

    // 3. Generate case via LLM
    const { orchLLMService } = await import('../orch-llm.service');
    const caseJson = await orchLLMService.chat(client, {
      tenantId,
      messages: [
        {
          role: 'system',
          content: [
            'You are Dewey, a case study generator for the ORCH educational platform.',
            'Language: Brazilian Portuguese.',
            '',
            'Generate a case study based on the lesson content provided.',
            `Difficulty level: ${difficulty}`,
            '',
            'OUTPUT FORMAT (strict JSON):',
            '{',
            '  "title": "short descriptive title",',
            '  "description": "1-2 paragraph case description with a realistic scenario",',
            '  "context": "background information the student needs",',
            '  "challenge": "the specific problem or question to solve",',
            '  "learning_objectives": ["obj1", "obj2", "obj3"]',
            '}',
            '',
            'RULES:',
            '- Make the scenario realistic and relatable to Brazilian students.',
            '- The challenge should require critical thinking, not just recall.',
            '- Include enough context for the student to reason about the problem.',
            '- For "beginner": straightforward application. "intermediate": analysis required. "advanced": synthesis + evaluation.',
            cbrReference,
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Lesson content:\n${lessonContent}\n\nGenerate a ${difficulty} case study.`,
        },
      ],
      model: 'default',
      temperature: 0.8,
      maxTokens: 1200,
    });

    // 4. Parse LLM response
    let parsed: any;
    try {
      const jsonMatch = caseJson.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? caseJson);
    } catch {
      parsed = {
        title: 'Estudo de Caso',
        description: caseJson,
        context: '',
        challenge: '',
        learning_objectives: [],
      };
    }

    // 5. Generate embedding for semantic search
    let embedding: number[] | null = null;
    try {
      const { orchEmbeddingService } = await import('../orch-embedding.service');
      embedding = await orchEmbeddingService.generate(`${parsed.title} ${parsed.description} ${parsed.challenge}`);
    } catch {
      // Embedding is optional — case still works without it
    }

    // 6. Insert into database
    const result = await client.query(
      `INSERT INTO orch_case_study
         (tenant_id, unit_id, title, description, context, challenge, learning_objectives, difficulty, embedding, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)
       RETURNING id, title, description, context, challenge, learning_objectives`,
      [
        tenantId, unitId, parsed.title, parsed.description,
        parsed.context, parsed.challenge, parsed.learning_objectives ?? [],
        difficulty, embedding ? JSON.stringify(embedding) : null,
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      context: row.context,
      challenge: row.challenge,
      learningObjectives: row.learning_objectives,
    };
  }

  async getCase(
    client: PoolClient,
    caseId: string,
  ): Promise<any | null> {
    const caseResult = await client.query(
      `SELECT * FROM orch_case_study WHERE id = $1`,
      [caseId],
    );
    if (caseResult.rows.length === 0) return null;

    const discussions = await client.query(
      `SELECT d.*, u.name as student_name
       FROM orch_case_discussion d
       JOIN "user" u ON u.id = d.student_id
       WHERE d.case_id = $1
       ORDER BY d.created_at DESC`,
      [caseId],
    );

    return {
      ...caseResult.rows[0],
      discussions: discussions.rows,
    };
  }

  async listCases(
    client: PoolClient,
    params: ListParams,
  ): Promise<{ cases: any[]; total: number; page: number; limit: number }> {
    const { tenantId, unitId, difficulty, page = 1, limit = 20 } = params;
    const offset = (page - 1) * limit;

    let query = `SELECT id, title, description, difficulty, discussions_count, avg_rating, created_at
                 FROM orch_case_study WHERE tenant_id = $1`;
    const queryParams: any[] = [tenantId];

    if (unitId) {
      queryParams.push(unitId);
      query += ` AND unit_id = $${queryParams.length}`;
    }
    if (difficulty) {
      queryParams.push(difficulty);
      query += ` AND difficulty = $${queryParams.length}`;
    }

    const countResult = await client.query(
      query.replace(/SELECT .+ FROM/, 'SELECT COUNT(*) FROM'),
      queryParams,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    queryParams.push(limit, offset);
    query += ` ORDER BY created_at DESC LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;

    const result = await client.query(query, queryParams);

    return { cases: result.rows, total, page, limit };
  }

  async discuss(
    client: PoolClient,
    params: DiscussParams,
  ): Promise<{ aiFeedback: string; score: number }> {
    const { caseId, studentId, response } = params;

    // 1. Fetch case
    const caseResult = await client.query(
      `SELECT * FROM orch_case_study WHERE id = $1`,
      [caseId],
    );
    if (caseResult.rows.length === 0) {
      throw new Error('Case not found');
    }
    const caseStudy = caseResult.rows[0];

    // 2. Fetch student profile for personalization
    const profileResult = await client.query(
      `SELECT name, learning_style FROM orch_student_profile
       WHERE student_id = $1 LIMIT 1`,
      [studentId],
    );
    const studentName = profileResult.rows[0]?.name ?? 'Estudante';

    // 3. Evaluate via Socratic method
    const { orchLLMService } = await import('../orch-llm.service');
    const evaluation = await orchLLMService.chat(client, {
      tenantId: caseStudy.tenant_id,
      messages: [
        {
          role: 'system',
          content: [
            'You are Dewey, a Socratic evaluator for case study discussions.',
            'Language: Brazilian Portuguese.',
            '',
            `Case: "${caseStudy.title}"`,
            `Context: ${caseStudy.context}`,
            `Challenge: ${caseStudy.challenge}`,
            `Learning objectives: ${(caseStudy.learning_objectives ?? []).join(', ')}`,
            '',
            'EVALUATION RULES:',
            '- Use the Socratic method: ask probing questions to deepen the student\'s reasoning.',
            '- Score the response 0.0 to 1.0 based on depth, accuracy, and critical thinking.',
            '- If the response is shallow, ask follow-up questions instead of giving the answer.',
            '- If the response shows good reasoning, acknowledge it and push further.',
            '- Be encouraging. Never dismiss.',
            '',
            'OUTPUT FORMAT (strict JSON):',
            '{ "feedback": "your Socratic response", "score": 0.75 }',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `${studentName} responds:\n\n${response}`,
        },
      ],
      model: 'default',
      temperature: 0.7,
      maxTokens: 800,
    });

    // 4. Parse evaluation
    let feedback: string;
    let score: number;
    try {
      const jsonMatch = evaluation.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? evaluation);
      feedback = parsed.feedback;
      score = Math.max(0, Math.min(1, parsed.score));
    } catch {
      feedback = evaluation;
      score = 0.5;
    }

    // 5. Insert discussion
    await client.query(
      `INSERT INTO orch_case_discussion (case_id, student_id, student_response, ai_feedback, score)
       VALUES ($1, $2, $3, $4, $5)`,
      [caseId, studentId, response, feedback, score],
    );

    // 6. Update case discussion count
    await client.query(
      `UPDATE orch_case_study
       SET discussions_count = discussions_count + 1
       WHERE id = $1`,
      [caseId],
    );

    return { aiFeedback: feedback, score };
  }

  async searchSimilar(
    client: PoolClient,
    params: { query: string; tenantId: string; limit?: number },
  ): Promise<any[]> {
    const { query, tenantId, limit = 5 } = params;

    // Generate embedding for query
    const { orchEmbeddingService } = await import('../orch-embedding.service');
    const queryEmbedding = await orchEmbeddingService.generate(query);

    const result = await client.query(
      `SELECT id, title, description, difficulty, avg_rating,
              1 - (embedding <=> $1::vector) as similarity
       FROM orch_case_study
       WHERE tenant_id = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), tenantId, limit],
    );

    return result.rows;
  }

  async rate(
    client: PoolClient,
    params: RateParams,
  ): Promise<{ avgRating: number; totalRatings: number }> {
    const { caseId, professorRating, professorFeedback } = params;

    // Update the latest discussion with professor feedback (or create standalone rating)
    const latestDiscussion = await client.query(
      `SELECT id FROM orch_case_discussion
       WHERE case_id = $1 AND professor_rating IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [caseId],
    );

    if (latestDiscussion.rows.length > 0) {
      await client.query(
        `UPDATE orch_case_discussion
         SET professor_rating = $1, professor_feedback = $2
         WHERE id = $3`,
        [professorRating, professorFeedback ?? null, latestDiscussion.rows[0].id],
      );
    }

    // Recalculate average rating for the case
    const avgResult = await client.query(
      `SELECT AVG(professor_rating) as avg_rating, COUNT(professor_rating) as total
       FROM orch_case_discussion
       WHERE case_id = $1 AND professor_rating IS NOT NULL`,
      [caseId],
    );

    const avgRating = parseFloat(avgResult.rows[0].avg_rating) || 0;
    const totalRatings = parseInt(avgResult.rows[0].total, 10) || 0;

    await client.query(
      `UPDATE orch_case_study SET avg_rating = $1 WHERE id = $2`,
      [avgRating, caseId],
    );

    return { avgRating: Math.round(avgRating * 100) / 100, totalRatings };
  }
}

export const orchDewey = new OrchDewey();
