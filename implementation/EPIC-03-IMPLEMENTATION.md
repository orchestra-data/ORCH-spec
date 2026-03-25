# EPIC-03: Agentes Avancados AVA — Guia de Implementacao Cirurgico

**Para:** Giuseppe "King Witcher"
**Stack:** Express 5 + React 19 monorepo
**Codebase:** `C:/Projetos IA/Plataforma Cogedu/localhost/cogedu-dev-v6/cogedu-main/`
**Pontos totais:** 36 pts (3 + 13 + 5 + 5 + 5 + 5)
**Prazo estimado:** 2-3 semanas
**Dependencia:** EPIC-02 COMPLETO (Bloom grades + Taylor engagement data)

---

## Pre-Requisitos

Antes de comecar, confirmar que EPIC-02 esta funcional:

```sql
-- Bloom grades existem?
SELECT COUNT(*) FROM orch_bloom_assessment WHERE created_at > NOW() - INTERVAL '7 days';

-- Taylor snapshots existem?
SELECT COUNT(*) FROM orch_engagement_snapshot WHERE created_at > NOW() - INTERVAL '7 days';

-- Total de tabelas orch_* deve ser 9 (3 EPIC-01 + 6 EPIC-02)
SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'orch_%';
-- Deve retornar 9
```

Se qualquer query retornar 0: PARAR. EPIC-02 precisa estar rodando e gerando dados.

---

## STORY-03.1: Migration SQL — orch_advanced_agents (3 pts, Database)

**Arquivo pronto:** `implementation/migrations/1942000004--orch_advanced_agents.sql`

### Passo 1 — Copiar migration

```bash
cp "implementation/migrations/1942000004--orch_advanced_agents.sql" \
   libs/migrations/identity/1942000004--orch_advanced_agents.sql
```

### Passo 2 — Rodar migration

```bash
npm run migrate
```

### Passo 3 — Validar 6 novas tabelas

```sql
-- Contar tabelas orch_* — DEVE retornar 15
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'orch_%';
-- Esperado: 15 (3 EPIC-01 + 6 EPIC-02 + 6 EPIC-03)

-- Listar as 6 novas:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'orch_%'
ORDER BY table_name;
```

As 6 tabelas novas:

| Tabela | Agente | Funcao |
|--------|--------|--------|
| `orch_assessment` | Aristoteles | Submissoes + pipeline 7 estagios |
| `orch_stylometric_baseline` | Wittgenstein | Baseline estilometrica do aluno |
| `orch_cognitive_observation` | Gardner | Observacoes de inteligencia multipla |
| `orch_linguistic_sample` | Wittgenstein | Amostras linguisticas analisadas |
| `orch_risk_assessment` | Foucault | Avaliacoes de risco 8 dimensoes |
| `orch_d7_report` | Weber | Dossie consolidado D7 |

### Passo 4 — Validar constraints

```sql
-- CHECK constraint no review_status da orch_assessment
\d orch_assessment
-- Deve conter: CHECK (review_status IN ('pending', 'reviewed', 'contested'))

-- Verificar indices
SELECT indexname FROM pg_indexes WHERE tablename LIKE 'orch_%' ORDER BY indexname;
```

### Critério de Done

- [ ] 15 tabelas orch_* no banco
- [ ] Constraints CHECK validados
- [ ] Indices criados

---

## STORY-03.2: Aristoteles — Assessment Pipeline 7 Estagios (13 pts)

**Arquivo pronto:** `implementation/services/agents/orch-aristoteles.ts`

Este e o agente MAIS COMPLEXO do sistema. Leia o codigo inteiro antes de copiar.

### Passo 1 — Copiar service

```bash
cp "implementation/services/agents/orch-aristoteles.ts" \
   apps/api/src/app/services/agents/orch-aristoteles.ts
```

### Passo 2 — Entender o Pipeline

O pipeline executa 7 estagios SEQUENCIAIS para cada submissao:

```
Estagio 1: Recepcao     → Valida texto (>= 50 palavras)
Estagio 2: Qualidade    → LLM avalia 5 dimensoes (clarity, coherence, depth, originality, technical)
Estagio 3: Plagio       → Winnowing fingerprinting contra submissoes do mesmo assignment
Estagio 4: Deteccao IA  → Perplexity + Burstiness + desvio estilometrico
Estagio 5: Estilometria → Calcula baseline ou compara com baseline existente
Estagio 6: Score        → Composto ponderado com penalidades
Estagio 7: Feedback     → LLM gera texto construtivo (NUNCA acusatorio)
```

### Passo 3 — Detalhes de cada estagio

**Estagio 1 — Recepcao:**
- Contar palavras: `text.split(/\s+/).length`
- Se < 50: rejeitar com mensagem `"Texto muito curto. Minimo de 50 palavras para avaliacao."`
- Retornar HTTP 400, NAO processar pipeline

**Estagio 2 — Qualidade (LLM):**
- Usar Gemini structured output com Zod schema
- 5 dimensoes, cada uma 0-10:
  - `clarity`: clareza de expressao
  - `coherence`: coesao entre paragrafos
  - `depth`: profundidade de analise
  - `originality`: originalidade do pensamento
  - `technical`: dominio tecnico do tema
- Se rubrica do professor existe no assignment: incluir no prompt como criterio adicional

**Estagio 3 — Plagio (Winnowing):**
- Gerar k-grams com k=5 (sequencias de 5 caracteres)
- Aplicar rolling hash em cada k-gram
- Selecionar minimos locais por janela de tamanho 4 (fingerprints)
- Buscar fingerprints de OUTRAS submissoes do MESMO assignment:
```sql
SELECT fingerprints FROM orch_assessment
WHERE assignment_id = $1 AND student_id != $2 AND fingerprints IS NOT NULL;
```
- Score = % de fingerprints coincidentes (0.0 a 1.0)
- Se score > 0.3: flag `plagiarism_flag = true`
- **IMPORTANTE:** Flag NAO e acusacao. E sinal para o professor revisar.

**Estagio 4 — Deteccao IA:**
- **Perplexity estimation:** via LLM — pedir para estimar quao previsivel e o texto (0-1)
- **Burstiness:** calcular variancia no comprimento das sentencas
  - Humano: alta variancia (mistura sentencas curtas e longas)
  - IA: baixa variancia (sentencas de tamanho uniforme)
  - Formula: `std(sentence_lengths) / mean(sentence_lengths)`
  - Burstiness < 0.3 = suspeito
- **Desvio estilometrico:** se baseline existe na `orch_stylometric_baseline`, comparar metricas atuais vs baseline
- Score combinado normalizado 0-1
- Se score > 0.7: flag `ai_flag = true`

**Estagio 5 — Estilometria:**
- Calcular metricas:
  - `avg_sentence_length`: media de palavras por sentenca
  - `type_token_ratio`: palavras unicas / total de palavras
  - `punctuation_pattern`: frequencia relativa de ., ,, ;, :, !, ?
  - `conjunction_frequency`: frequencia de conectivos (e, mas, porem, contudo, etc.)
- Se e a PRIMEIRA submissao do aluno: CRIAR baseline na `orch_stylometric_baseline`
- Se baseline existe: calcular desvio padrao vs baseline
- Desvio > 2 sigma = flag `stylometric_deviation = true`

**Estagio 6 — Score Composto:**
```
quality_avg = media(clarity, coherence, depth, originality, technical)  // 0-10
plagiarism_penalty = plagiarism_flag ? -3.0 : 0                        // -30%
ai_penalty = ai_score > 0.7 ? -2.0 : 0                                // -20%
composite_score = max(0, quality_avg + plagiarism_penalty + ai_penalty) // 0-10
```

**Estagio 7 — Feedback:**
- LLM gera feedback CONSTRUTIVO
- Linguagem OBRIGATORIA:
  - "areas para melhoria" (NUNCA "problemas")
  - "oportunidades de desenvolvimento" (NUNCA "falhas")
  - "o professor ira revisar detalhes adicionais" (se ha flags)
- O que o ALUNO ve: `feedback_text` + `composite_score`
- O que o PROFESSOR ve: TUDO (quality dims, plagiarism score, AI score, stylometric, flags, evidencias)

### Passo 4 — Criar 6 endpoints

| # | Endpoint | Method | Path | Auth | Descricao |
|---|----------|--------|------|------|-----------|
| 1 | assessmentSubmit | POST | /assessment/submit | student | Submeter trabalho (dispara pipeline async) |
| 2 | assessmentGet | GET | /assessment/:id | student/professor | Ver resultado (filtrado por role) |
| 3 | assessmentReport | GET | /assessment/:id/report | professor | Relatorio completo com flags |
| 4 | assessmentReview | POST | /assessment/:id/review | professor | Professor revisa flags + nota final |
| 5 | assessmentStudent | GET | /assessment/student/:studentId | student | Minhas submissoes |
| 6 | assessmentClass | GET | /assessment/class/:classId | professor | Todas submissoes da turma |

Para cada endpoint, criar pasta + 2 arquivos seguindo o pattern do codebase:

```
apps/api/src/endpoints/assessmentSubmit/
  index.ts        → export * from './assessmentSubmit'
  assessmentSubmit.ts → handler + middlewares + validation
```

**Endpoint assessmentSubmit (o mais importante):**

```typescript
// assessmentSubmit.ts
import { Pool } from 'pg';
import { RequestHandler } from 'express';
import { object, string } from 'yup';
import { requireAuth } from '../../app/auth';
import { orchAristoteles } from '../../app/services/agents/orch-aristoteles';

export const path = '/assessment/submit';
export const method = 'POST';
export const middlewares = [requireAuth()];

const schema = object({
  assignmentId: string().uuid().required(),
  classInstanceId: string().uuid().required(),
  text: string().required().min(1),
});

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res) => {
    const client = await pool.connect();
    try {
      const body = await schema.validate(req.body);
      const userId = req.user.id;
      const tenantId = req.user.tenantContext.primaryTenantId;

      // Validar membership na turma
      const membership = await client.query(
        `SELECT 1 FROM class_enrollment
         WHERE class_instance_id = $1 AND user_id = $2
         AND status IN ('active', 'enrolled') LIMIT 1`,
        [body.classInstanceId, userId]
      );
      if (membership.rowCount === 0) {
        return res.status(403).json({ error: 'Voce nao pertence a esta turma.' });
      }

      // Contar palavras
      const wordCount = body.text.split(/\s+/).filter(Boolean).length;
      if (wordCount < 50) {
        return res.status(400).json({
          error: 'Texto muito curto. Minimo de 50 palavras para avaliacao.',
          wordCount,
        });
      }

      // Criar registro com status processing
      const { rows } = await client.query(
        `INSERT INTO orch_assessment (student_id, tenant_id, assignment_id, class_instance_id, submitted_text, word_count, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'processing')
         RETURNING id`,
        [userId, tenantId, body.assignmentId, body.classInstanceId, body.text, wordCount]
      );
      const assessmentId = rows[0].id;

      // Disparar pipeline ASYNC (nao bloqueia resposta)
      orchAristoteles.runPipeline(client, {
        assessmentId,
        studentId: userId,
        tenantId,
        assignmentId: body.assignmentId,
        text: body.text,
      }).catch(err => {
        console.error(`[aristoteles] Pipeline failed for ${assessmentId}:`, err);
        // Atualizar status para failed
        pool.query(
          `UPDATE orch_assessment SET status = 'failed', error_message = $1 WHERE id = $2`,
          [err.message, assessmentId]
        );
      });

      res.status(202).json({ assessmentId, status: 'processing' });
    } finally {
      client?.release();
    }
  };
}
```

**Endpoint assessmentGet — FILTRAGEM POR ROLE (critico):**

```typescript
// No handler de assessmentGet:
const assessment = await client.query(
  'SELECT * FROM orch_assessment WHERE id = $1 AND tenant_id = $2',
  [req.params.id, tenantId]
);

if (assessment.rowCount === 0) {
  return res.status(404).json({ error: 'Assessment nao encontrado.' });
}

const row = assessment.rows[0];
const userRole = req.user.role; // 'student' | 'professor' | 'coordinator'

if (userRole === 'student') {
  // ALUNO VE APENAS:
  return res.json({
    id: row.id,
    status: row.status,
    compositeScore: row.composite_score,
    feedbackText: row.feedback_text,
    submittedAt: row.created_at,
    reviewStatus: row.review_status,
    // NADA de flags, plagiarism_score, ai_score, quality_dimensions
  });
}

// PROFESSOR/COORDINATOR VE TUDO:
return res.json(row);
```

### REGRA CRITICA: Assessment Gate 1

```
╔══════════════════════════════════════════════════════════════════╗
║  NUNCA mostrar flags de plagio/IA ao aluno.                     ║
║  Professor DEVE revisar antes de nota final.                    ║
║  DB constraint: professor_reviewed_at e NULL ate professor      ║
║  fazer review.                                                  ║
║  Aluno ve apenas feedback_text e composite_score                ║
║  (sem breakdown de plagio/AI).                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### Passo 5 — Validacao

```bash
# 1. Submeter trabalho
curl -X POST http://localhost:3000/assessment/submit \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assignmentId": "UUID_DO_ASSIGNMENT",
    "classInstanceId": "UUID_DA_TURMA",
    "text": "Este e um texto de exemplo que deve ter pelo menos cinquenta palavras para ser aceito pelo pipeline de avaliacao do Aristoteles. Preciso continuar escrevendo para garantir que o contador de palavras ultrapasse o limite minimo exigido pelo sistema de avaliacao automatica."
  }'
# Esperado: HTTP 202, { assessmentId: "...", status: "processing" }

# 2. Aguardar pipeline (5-15 segundos) e verificar como ALUNO
curl http://localhost:3000/assessment/UUID_DO_ASSESSMENT \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# Esperado: composite_score + feedback_text APENAS
# NAO deve conter: plagiarism_score, ai_score, quality_dimensions, flags

# 3. Verificar como PROFESSOR (relatorio completo)
curl http://localhost:3000/assessment/UUID_DO_ASSESSMENT/report \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Esperado: TUDO — quality dims, plagiarism, AI detection, stylometric, flags

# 4. Professor faz review
curl -X POST http://localhost:3000/assessment/UUID_DO_ASSESSMENT/review \
  -H "Authorization: Bearer $PROFESSOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"professorNotes": "Revisado, sem problemas.", "finalGrade": 8.5}'
# Esperado: HTTP 200, professor_reviewed_at preenchido

# 5. Testar rejeicao de texto curto
curl -X POST http://localhost:3000/assessment/submit \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"assignmentId": "UUID", "classInstanceId": "UUID", "text": "Texto muito curto."}'
# Esperado: HTTP 400, { error: "Texto muito curto..." }

# 6. Testar acesso negado — aluno tentando ver report
curl http://localhost:3000/assessment/UUID/report \
  -H "Authorization: Bearer $STUDENT_TOKEN"
# Esperado: HTTP 403
```

### Criterio de Done

- [ ] Pipeline 7 estagios executa sem erro
- [ ] Winnowing gera fingerprints e compara submissoes
- [ ] Texto < 50 palavras rejeitado com HTTP 400
- [ ] Aluno ve APENAS composite_score + feedback_text
- [ ] Professor ve TUDO via /report
- [ ] Review do professor preenche professor_reviewed_at
- [ ] Pipeline async nao bloqueia resposta (HTTP 202)
- [ ] Falha no pipeline atualiza status para 'failed'

---

## STORY-03.3: Gardner — Cognitive Profile (5 pts, Backend, INVISIVEL)

**Arquivo pronto:** `implementation/services/agents/orch-gardner.ts`

**INVISIVEL**: roda em background apos CADA interacao. O aluno NUNCA sabe que esta sendo observado.

### Passo 1 — Copiar service

```bash
cp "implementation/services/agents/orch-gardner.ts" \
   apps/api/src/app/services/agents/orch-gardner.ts
```

### Passo 2 — Integrar no Hub Router

Localizar o arquivo do Hub Router:

```bash
grep -rn "orchAvaChat" apps/api/src/endpoints/
```

No handler do chat (onde a resposta do agente ja foi gerada), adicionar ao bloco de operacoes background:

```typescript
import { orchGardner } from '../../app/services/agents/orch-gardner';

// Apos gerar responseText, adicionar ao bloco Promise.allSettled:
orchGardner.observe(client, {
  studentId: userId,
  tenantId,
  interactionType: detectInteractionType(body.message, responseText),
  metadata: {
    intent: detectedIntent,
    agent: agentUsed,
    messageLength: body.message.length,
    responseLength: responseText.length,
  }
}).catch(() => {}); // Fire-and-forget, NUNCA bloquear o chat
```

### Passo 3 — Funcao detectInteractionType

Adicionar ao service ou como utility:

```typescript
function detectInteractionType(
  userMessage: string,
  responseText: string
): string {
  const msg = userMessage.toLowerCase();

  if (/v[ií]deo|assistir|visual/.test(msg)) return 'spatial';
  if (/f[oó]rmula|c[oó]digo|c[aá]lcul|matem[aá]tic/.test(msg)) return 'logical-mathematical';
  if (/grupo|equipe|colab|discuss/.test(msg)) return 'interpersonal';
  if (/refle[xç]|auto-|sentir|emo[çc]/.test(msg)) return 'intrapersonal';
  if (/diagrama|mapa|esquema|desenh/.test(msg)) return 'spatial';
  if (/m[uú]sica|ritmo|som|melodia/.test(msg)) return 'musical';
  if (/corpo|movimento|pr[aá]tic|experiment/.test(msg)) return 'bodily-kinesthetic';
  if (/natureza|ecolog|ambient|sustent/.test(msg)) return 'naturalistic';

  // Default baseado em comprimento (texto longo = linguistico)
  if (userMessage.split(/\s+/).length > 100) return 'linguistic';

  return 'linguistic'; // default
}
```

### Passo 4 — Mapeamento das 8 Inteligencias Gardner

| Inteligencia | Sinais de Deteccao | Exemplo de Interacao |
|-------------|-------------------|---------------------|
| Linguistica | Texto longo, vocabulario rico, analogias | "Pode explicar com mais detalhes?" |
| Logico-matematica | Pede formulas, codigo, calculos | "Como resolver essa equacao?" |
| Espacial | Pede video, diagrama, mapa, esquema | "Tem um diagrama disso?" |
| Musical | Menciona musica, ritmo, som | "Tem algum podcast sobre isso?" |
| Corporal-cinestesica | Pede pratica, experimento, hands-on | "Como fazer na pratica?" |
| Interpessoal | Discussao em grupo, colaboracao | "Posso discutir com colegas?" |
| Intrapessoal | Auto-reflexao, sentimentos, diario | "Estou refletindo sobre..." |
| Naturalista | Natureza, ecologia, classificacao | "Como categorizar esses organismos?" |

### Passo 5 — Atualizacao do Bourdieu

O Gardner atualiza o perfil Bourdieu do aluno SOMENTE apos 10+ observacoes:

```typescript
// Dentro do service, apos salvar observacao:
const countResult = await client.query(
  `SELECT COUNT(*) as total FROM orch_cognitive_observation WHERE student_id = $1`,
  [studentId]
);

if (parseInt(countResult.rows[0].total) >= 10) {
  // Agregar inteligencias dominantes
  const profile = await client.query(
    `SELECT intelligence_signal, COUNT(*) as freq, AVG(confidence) as avg_conf
     FROM orch_cognitive_observation
     WHERE student_id = $1
     GROUP BY intelligence_signal
     ORDER BY freq DESC`,
    [studentId]
  );

  const dominantIntelligences = profile.rows.slice(0, 3).map(r => ({
    type: r.intelligence_signal,
    frequency: parseInt(r.freq),
    confidence: parseFloat(r.avg_conf),
  }));

  // Atualizar Bourdieu
  await orchProfileService.updateField(client, {
    studentId,
    agentId: 'gardner',
    fieldPath: 'cognitive_profile',
    newValue: {
      dominant_intelligences: dominantIntelligences,
      total_observations: parseInt(countResult.rows[0].total),
      last_updated: new Date().toISOString(),
    },
    reasoning: `Based on ${countResult.rows[0].total} interaction observations`,
  });
}
```

**STRENGTHS-BASED:** O perfil NUNCA diz "fraco em X". Sempre "mais forte em Y, Z".

### Passo 6 — Validacao

```sql
-- Simular 10+ interacoes variadas e verificar:
SELECT intelligence_signal, COUNT(*) as freq, AVG(confidence) as avg_conf
FROM orch_cognitive_observation
WHERE student_id = 'UUID_DO_ALUNO'
GROUP BY intelligence_signal
ORDER BY freq DESC;
-- Deve refletir padroes reais de interacao

-- Verificar perfil Bourdieu atualizado:
SELECT cognitive_profile FROM orch_student_profile WHERE student_id = 'UUID_DO_ALUNO';
-- dominant_intelligences deve estar preenchido apos 10+ observacoes
```

### Nao tem endpoint

Gardner NAO tem endpoint proprio. Ele opera invisivel via Hub Router. Os dados sao consumidos pelo Weber (D7 reports) e pelo proprio Hub Router (para adaptar respostas).

### Criterio de Done

- [ ] Service importado e chamado no Hub Router
- [ ] Observacoes gravadas na orch_cognitive_observation
- [ ] Perfil Bourdieu atualizado apos 10+ observacoes
- [ ] Fire-and-forget: falha no Gardner NUNCA bloqueia o chat
- [ ] Deteccao cobre as 8 inteligencias

---

## STORY-03.4: Wittgenstein — Linguistic Profile (5 pts, Backend, INVISIVEL)

**Arquivo pronto:** `implementation/services/agents/orch-wittgenstein.ts`

**INVISIVEL**: analisa textos com 50+ palavras em background. O aluno NAO sabe.

### Passo 1 — Copiar service

```bash
cp "implementation/services/agents/orch-wittgenstein.ts" \
   apps/api/src/app/services/agents/orch-wittgenstein.ts
```

### Passo 2 — Integrar no Hub Router

No mesmo handler do chat, apos o bloco do Gardner:

```typescript
import { orchWittgenstein } from '../../app/services/agents/orch-wittgenstein';

// Condicional: so analisa textos com 50+ palavras
const wordCount = body.message.split(/\s+/).filter(Boolean).length;
if (wordCount >= 50) {
  orchWittgenstein.analyzeSample(client, {
    studentId: userId,
    tenantId,
    text: body.message,
    context: 'chat',
  }).catch(() => {}); // Fire-and-forget
}
```

### Passo 3 — Metricas Calculadas

| Metrica | Formula | Descricao |
|---------|---------|-----------|
| `vocabulary_richness` | unique_words / total_words | Type-Token Ratio (TTR). Humano educado: 0.6-0.8 |
| `formality_score` | formal_words / total_words | 0 = informal, 1 = muito formal |
| `grammar_error_count` | via LLM structured output | Numero de erros gramaticais detectados |
| `cefr_estimate` | via LLM structured output | A1, A2, B1, B2, C1, C2 |
| `avg_sentence_length` | total_words / total_sentences | Media de palavras por sentenca |

**Calculo local (sem LLM):**

```typescript
function calculateLocalMetrics(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  return {
    vocabulary_richness: uniqueWords.size / words.length,
    avg_sentence_length: words.length / sentences.length,
    total_words: words.length,
    total_sentences: sentences.length,
  };
}
```

**Calculo via LLM (Gemini structured output):**

```typescript
const llmAnalysis = await orchLlmService.generateStructured({
  model: 'gemini-2.5-flash',
  schema: z.object({
    formality_score: z.number().min(0).max(1),
    grammar_error_count: z.number().int().min(0),
    cefr_estimate: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
    grammar_errors: z.array(z.string()).optional(),
  }),
  prompt: `Analise este texto em portugues brasileiro.
Avalie formalidade (0-1), conte erros gramaticais, e estime nivel CEFR.

Texto:
"${text}"`,
});
```

### Passo 4 — Atualizacao do Bourdieu

O Wittgenstein atualiza o perfil Bourdieu apos 5+ amostras:

```typescript
const samplesResult = await client.query(
  `SELECT COUNT(*) as total FROM orch_linguistic_sample WHERE student_id = $1`,
  [studentId]
);
const samplesCount = parseInt(samplesResult.rows[0].total);

if (samplesCount >= 5) {
  // Agregar metricas das ultimas 5 amostras
  const recentSamples = await client.query(
    `SELECT cefr_estimate, vocabulary_richness, formality_score, avg_sentence_length
     FROM orch_linguistic_sample
     WHERE student_id = $1
     ORDER BY created_at DESC LIMIT 5`,
    [studentId]
  );

  const avgRichness = average(recentSamples.rows.map(r => r.vocabulary_richness));
  const avgFormality = average(recentSamples.rows.map(r => r.formality_score));
  const latestCefr = recentSamples.rows[0].cefr_estimate;

  await orchProfileService.updateField(client, {
    studentId,
    agentId: 'wittgenstein',
    fieldPath: 'linguistic_profile',
    newValue: {
      cefr_level: latestCefr,
      vocabulary_richness: avgRichness,
      formality_range: {
        min: Math.min(...recentSamples.rows.map(r => r.formality_score)),
        max: Math.max(...recentSamples.rows.map(r => r.formality_score)),
      },
      avg_sentence_length: average(recentSamples.rows.map(r => r.avg_sentence_length)),
      samples_count: samplesCount,
    },
    reasoning: `Based on ${samplesCount} text samples`,
  });
}
```

### Passo 5 — Validacao

```sql
-- Apos enviar 5+ mensagens longas (50+ palavras) no chat:
SELECT cefr_estimate, vocabulary_richness, formality_score, avg_sentence_length
FROM orch_linguistic_sample
WHERE student_id = 'UUID_DO_ALUNO'
ORDER BY created_at DESC LIMIT 5;
-- Valores devem ser coerentes com o nivel do aluno

-- Verificar perfil Bourdieu:
SELECT linguistic_profile FROM orch_student_profile WHERE student_id = 'UUID_DO_ALUNO';
-- cefr_level deve estar preenchido apos 5+ amostras
```

### Nao tem endpoint

Wittgenstein NAO tem endpoint proprio. Opera invisivel via Hub Router. Dados consumidos pelo Aristoteles (estagio 5 — estilometria) e pelo Weber (D7 reports).

### Criterio de Done

- [ ] Service importado e chamado no Hub Router (condicional 50+ palavras)
- [ ] Amostras gravadas na orch_linguistic_sample
- [ ] Metricas locais calculadas corretamente (TTR, avg sentence length)
- [ ] LLM estima CEFR e formality
- [ ] Perfil Bourdieu atualizado apos 5+ amostras
- [ ] Fire-and-forget: falha NUNCA bloqueia o chat

---

## STORY-03.5: Foucault — Risk Assessment (5 pts, Backend)

**Arquivo pronto:** `implementation/services/agents/orch-foucault.ts`

### Passo 1 — Copiar service

```bash
cp "implementation/services/agents/orch-foucault.ts" \
   apps/api/src/app/services/agents/orch-foucault.ts
```

### Passo 2 — 8 Dimensoes de Risco

Cada dimensao gera um score de 0 a 100:

| # | Dimensao | Fonte de Dados | Logica de Risco |
|---|----------|---------------|-----------------|
| 1 | `academic` | Bloom grades (orch_bloom_assessment) | Nota < 5 = risco alto (80+) |
| 2 | `attendance` | Attendance API | < 75% presenca = risco (70+) |
| 3 | `engagement` | Taylor snapshot (orch_engagement_snapshot) | Score < 30 = risco (70+) |
| 4 | `financial` | Student profile flags | Bolsista com pendencia = risco |
| 5 | `social` | Chat/forum participation count | Zero interacoes = risco (60+) |
| 6 | `emotional` | Wittgenstein sentiment + help-seeking patterns | Sentimento negativo recorrente = risco |
| 7 | `temporal` | Login patterns (horarios, frequencia) | Irregular/somente noturno = atencao |
| 8 | `vocational` | Course completion trajectory | Desistencia parcial de disciplinas = risco |

**Score composto:**
```typescript
const compositeRisk = Math.round(
  dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) /
  dimensions.reduce((sum, d) => sum + d.weight, 0)
);
```

Pesos sugeridos:
```
academic: 1.5, attendance: 1.3, engagement: 1.2, financial: 0.8,
social: 0.8, emotional: 1.0, temporal: 0.6, vocational: 0.8
```

### Passo 3 — 5 Niveis + Intervencoes

| Nivel | Range | Cor | Intervencao |
|-------|-------|-----|-------------|
| `green` | 0-20 | Verde | Nenhuma acao |
| `yellow` | 21-40 | Amarelo | Monitor — alerta interno para coordenador |
| `orange` | 41-60 | Laranja | Nudge — notificacao proativa ao aluno |
| `red` | 61-80 | Vermelho | Outreach — coordenador entra em contato |
| `critical` | 81-100 | Preto | Urgent — reuniao obrigatoria com aluno |

```typescript
function getRiskLevel(score: number): { level: string; color: string; intervention: string } {
  if (score <= 20) return { level: 'green', color: '#22c55e', intervention: 'none' };
  if (score <= 40) return { level: 'yellow', color: '#eab308', intervention: 'monitor' };
  if (score <= 60) return { level: 'orange', color: '#f97316', intervention: 'nudge' };
  if (score <= 80) return { level: 'red', color: '#ef4444', intervention: 'outreach' };
  return { level: 'critical', color: '#1f2937', intervention: 'urgent_meeting' };
}
```

### Passo 4 — Reproducao Social (Bourdieu)

Apos calcular risco, verificar se o padrao e ESTRUTURAL:

```typescript
// Se risco alto E capital cultural/social baixo no perfil Bourdieu:
const profile = await orchProfileService.getProfile(client, studentId);
const culturalCapital = profile?.capital_cultural?.level || 'unknown';
const socialCapital = profile?.capital_social?.level || 'unknown';

if (compositeRisk > 60 && (culturalCapital === 'low' || socialCapital === 'low')) {
  // Flag STRUCTURAL — nao e falha individual
  await client.query(
    `UPDATE orch_risk_assessment
     SET structural_flag = true,
         structural_note = 'Padrao estrutural detectado — correlacao entre risco academico e capital cultural/social. Nao e falha individual do aluno.'
     WHERE id = $1`,
    [assessmentId]
  );
}
```

**IMPORTANTE:** O alerta ao coordenador DEVE incluir: "Padrao estrutural detectado — nao e falha individual."

### Passo 5 — CRON

Foucault roda via CRON as 14:05 (5 minutos apos Taylor gerar snapshots de engagement as 14:00):

```typescript
// Em algum scheduler (cron.ts ou similar):
import { orchFoucault } from '../services/agents/orch-foucault';

// 14:05 diariamente
cron.schedule('5 14 * * *', async () => {
  const client = await pool.connect();
  try {
    await orchFoucault.batchAssess(client, tenantId);
    console.log('[foucault] Batch risk assessment completed');
  } catch (err) {
    console.error('[foucault] Batch assessment failed:', err);
  } finally {
    client?.release();
  }
});
```

### Passo 6 — 3 Endpoints

| # | Endpoint | Method | Path | Auth |
|---|----------|--------|------|------|
| 1 | riskClass | GET | /risk/class/:classId | professor/coordinator |
| 2 | riskStudent | GET | /risk/student/:studentId | professor/coordinator |
| 3 | riskAssess | POST | /risk/assess | system (CRON only) |

Criar pastas + arquivos para cada endpoint.

**ETICO:** Se aluno precisa sair por razao legitima, facilitar com dignidade. O sistema NUNCA pune. Ele ALERTA humanos para que AJUDEM.

### Passo 7 — Validacao

```bash
# Risk de um aluno
curl http://localhost:3000/risk/student/STUDENT_UUID \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Esperado: risk_score, risk_level (color), 8 dimensoes, intervention sugerida

# Risk map da turma
curl http://localhost:3000/risk/class/CLASS_UUID \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Esperado: lista de alunos com risk_level (color-coded)

# Verificar flag structural no banco
SELECT structural_flag, structural_note
FROM orch_risk_assessment
WHERE student_id = 'UUID' AND structural_flag = true;
```

### Criterio de Done

- [ ] 8 dimensoes calculadas com fontes reais
- [ ] 5 niveis de risco com intervencoes corretas
- [ ] Flag STRUCTURAL detectada quando capital cultural/social baixo
- [ ] CRON 14:05 funcional (apos Taylor 14:00)
- [ ] Endpoints protegidos: apenas professor/coordinator
- [ ] Aluno NAO tem acesso aos endpoints de risco

---

## STORY-03.6: Weber — D7 Reports (5 pts, Backend)

**Arquivo pronto:** `implementation/services/agents/orch-weber.ts`

O Weber e o CONSOLIDADOR. Ele nao gera dados novos — ele AGREGA dados de TODOS os outros agentes em um dossie unico.

### Passo 1 — Copiar service

```bash
cp "implementation/services/agents/orch-weber.ts" \
   apps/api/src/app/services/agents/orch-weber.ts
```

### Passo 2 — 7 Secoes do Dossie D7

| # | Secao | Agente Fonte | Dados Agregados |
|---|-------|-------------|-----------------|
| 1 | `academic` | Bloom | Notas, gaps de conhecimento, plano de estudos |
| 2 | `engagement` | Taylor | Score de engajamento, tendencia, horarios de pico |
| 3 | `risk` | Foucault | Nivel de risco, 8 dimensoes, intervencao sugerida |
| 4 | `cognitive` | Gardner | Top 3 inteligencias dominantes, estilo de aprendizado |
| 5 | `gamification` | Sisifos | XP total, nivel, streak atual, badges conquistados |
| 6 | `retention` | Ebbinghaus | Conceitos em revisao, media de retencao |
| 7 | `linguistic` | Wittgenstein | Nivel CEFR, riqueza de vocabulario, formalidade |

### Passo 3 — Funcao de Agregacao

```typescript
async function generateD7(client: PoolClient, studentId: string, tenantId: string, type: 'weekly' | 'monthly') {
  // Buscar dados de TODOS os agentes em paralelo
  const [bloom, taylor, foucault, gardner, sisifo, ebbinghaus, wittgenstein] = await Promise.allSettled([
    getBloomData(client, studentId, type),
    getTaylorData(client, studentId, type),
    getFoucaultData(client, studentId),
    getGardnerData(client, studentId),
    getSisifoData(client, studentId),
    getEbbinghausData(client, studentId),
    getWittgensteinData(client, studentId),
  ]);

  // Montar dossie (graceful degradation — secao vazia se agente falhar)
  const report = {
    student_id: studentId,
    tenant_id: tenantId,
    report_type: type,
    period_start: getPeriodStart(type),
    period_end: new Date(),
    sections: {
      academic: bloom.status === 'fulfilled' ? bloom.value : { error: 'No data' },
      engagement: taylor.status === 'fulfilled' ? taylor.value : { error: 'No data' },
      risk: foucault.status === 'fulfilled' ? foucault.value : { error: 'No data' },
      cognitive: gardner.status === 'fulfilled' ? gardner.value : { error: 'No data' },
      gamification: sisifo.status === 'fulfilled' ? sisifo.value : { error: 'No data' },
      retention: ebbinghaus.status === 'fulfilled' ? ebbinghaus.value : { error: 'No data' },
      linguistic: wittgenstein.status === 'fulfilled' ? wittgenstein.value : { error: 'No data' },
    },
    summary: '', // Gerado por LLM abaixo
    recommendations: [], // Gerado por LLM abaixo
  };

  // LLM gera sumario executivo + recomendacoes
  const llmSummary = await generateSummary(report.sections);
  report.summary = llmSummary.summary;
  report.recommendations = llmSummary.recommendations;

  // Salvar no banco
  const { rows } = await client.query(
    `INSERT INTO orch_d7_report (student_id, tenant_id, report_type, period_start, period_end, sections, summary, recommendations)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [studentId, tenantId, type, report.period_start, report.period_end,
     JSON.stringify(report.sections), report.summary, JSON.stringify(report.recommendations)]
  );

  return { reportId: rows[0].id, ...report };
}
```

### Passo 4 — CRONs

```typescript
// Domingo 04:00 — Relatorio semanal
cron.schedule('0 4 * * 0', async () => {
  const client = await pool.connect();
  try {
    await orchWeber.generateWeeklyBatch(client, tenantId);
    console.log('[weber] Weekly D7 batch completed');
  } catch (err) {
    console.error('[weber] Weekly batch failed:', err);
  } finally {
    client?.release();
  }
});

// Dia 1 de cada mes 04:00 — Relatorio mensal
cron.schedule('0 4 1 * *', async () => {
  const client = await pool.connect();
  try {
    await orchWeber.generateMonthlyBatch(client, tenantId);
    console.log('[weber] Monthly D7 batch completed');
  } catch (err) {
    console.error('[weber] Monthly batch failed:', err);
  } finally {
    client?.release();
  }
});
```

### Passo 5 — 5 Endpoints

| # | Endpoint | Method | Path | Auth | Descricao |
|---|----------|--------|------|------|-----------|
| 1 | d7Student | GET | /d7/:studentId | professor | Ultimo D7 do aluno |
| 2 | d7Weekly | GET | /d7/:studentId/weekly | professor | Historico semanal |
| 3 | d7Generate | POST | /d7/generate | system/professor | Gerar D7 sob demanda |
| 4 | d7Class | GET | /d7/class/:classId | professor | D7 de toda a turma |
| 5 | d7Download | GET | /d7/:studentId/download | professor | Download JSON (PDF = EPIC-07) |

**Nota:** Download como PDF sera implementado no EPIC-07 (futuro). Por enquanto, download retorna JSON.

### Passo 6 — Validacao

```bash
# Gerar D7 sob demanda
curl -X POST http://localhost:3000/d7/generate \
  -H "Authorization: Bearer $PROFESSOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"studentId": "UUID_DO_ALUNO", "type": "weekly"}'
# Esperado: reportId + status 'generated'

# Ler D7 completo
curl http://localhost:3000/d7/STUDENT_UUID \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Esperado: summary + 7 secoes de agentes + recommendations + trend

# D7 da turma
curl http://localhost:3000/d7/class/CLASS_UUID \
  -H "Authorization: Bearer $PROFESSOR_TOKEN"
# Esperado: lista de D7s dos alunos da turma

# Download JSON
curl http://localhost:3000/d7/STUDENT_UUID/download \
  -H "Authorization: Bearer $PROFESSOR_TOKEN" \
  -o d7-report.json
# Esperado: arquivo JSON com dossie completo

# Verificar no banco
SELECT id, report_type, period_start, period_end, summary
FROM orch_d7_report
WHERE student_id = 'UUID_DO_ALUNO'
ORDER BY created_at DESC LIMIT 3;
```

### Criterio de Done

- [ ] Agregacao de 7 agentes via Promise.allSettled
- [ ] Graceful degradation: secao vazia se agente sem dados (nao quebra)
- [ ] LLM gera sumario executivo + recomendacoes
- [ ] CRON semanal (domingo 04:00) funcional
- [ ] CRON mensal (dia 1, 04:00) funcional
- [ ] 5 endpoints protegidos (apenas professor)
- [ ] Download JSON funcional

---

## RESUMO DE TODOS OS ENDPOINTS EPIC-03

| # | Endpoint | Method | Path | Auth | Story |
|---|----------|--------|------|------|-------|
| 1 | assessmentSubmit | POST | /assessment/submit | student | 03.2 |
| 2 | assessmentGet | GET | /assessment/:id | student/professor | 03.2 |
| 3 | assessmentReport | GET | /assessment/:id/report | professor | 03.2 |
| 4 | assessmentReview | POST | /assessment/:id/review | professor | 03.2 |
| 5 | assessmentStudent | GET | /assessment/student/:studentId | student | 03.2 |
| 6 | assessmentClass | GET | /assessment/class/:classId | professor | 03.2 |
| 7 | riskClass | GET | /risk/class/:classId | professor/coordinator | 03.5 |
| 8 | riskStudent | GET | /risk/student/:studentId | professor/coordinator | 03.5 |
| 9 | riskAssess | POST | /risk/assess | system | 03.5 |
| 10 | d7Student | GET | /d7/:studentId | professor | 03.6 |
| 11 | d7Weekly | GET | /d7/:studentId/weekly | professor | 03.6 |
| 12 | d7Generate | POST | /d7/generate | system/professor | 03.6 |
| 13 | d7Class | GET | /d7/class/:classId | professor | 03.6 |
| 14 | d7Download | GET | /d7/:studentId/download | professor | 03.6 |

**Total: 14 endpoints novos.**

---

## RESUMO DE CRONs EPIC-03

| CRON | Horario | Agente | Funcao |
|------|---------|--------|--------|
| Foucault batch | 14:05 diariamente | Foucault | Risk assessment de todos alunos ativos |
| Weber semanal | Domingo 04:00 | Weber | D7 report semanal |
| Weber mensal | Dia 1, 04:00 | Weber | D7 report mensal |

**Nota:** Foucault roda 5 minutos APOS Taylor (14:00) para garantir dados frescos de engagement.

---

## CHECKLIST FINAL EPIC-03

```
INFRA
- [ ] 6 tabelas criadas (total 15 orch_*)
- [ ] Indices criados para queries frequentes
- [ ] CHECK constraints validados

ARISTOTELES (13 pts)
- [ ] Pipeline 7 estagios funcional end-to-end
- [ ] Winnowing fingerprinting detecta similaridade entre submissoes
- [ ] Texto < 50 palavras rejeitado com HTTP 400
- [ ] Professor OBRIGATORIO para review antes de nota (Gate 1)
- [ ] Aluno NUNCA ve flags de plagio/IA (apenas feedback construtivo)
- [ ] 6 endpoints criados e testados

GARDNER (5 pts)
- [ ] Observa invisivel via Hub Router
- [ ] 8 inteligencias mapeadas
- [ ] Atualiza Bourdieu apos 10+ observacoes
- [ ] STRENGTHS-BASED: nunca diz "fraco em X"

WITTGENSTEIN (5 pts)
- [ ] Analisa textos 50+ palavras em background
- [ ] Calcula TTR, formality, CEFR via LLM
- [ ] Atualiza Bourdieu apos 5+ amostras
- [ ] Fire-and-forget (nunca bloqueia chat)

FOUCAULT (5 pts)
- [ ] 8 dimensoes de risco com fontes reais
- [ ] 5 niveis com intervencoes graduadas
- [ ] Reproducao social (Bourdieu) detectada como STRUCTURAL
- [ ] CRON 14:05 funcional
- [ ] ETICO: sistema alerta, nunca pune

WEBER (5 pts)
- [ ] D7 consolida dados de TODOS os 7 agentes
- [ ] Graceful degradation (secao vazia se agente sem dados)
- [ ] CRON semanal domingo 04:00
- [ ] CRON mensal dia 1, 04:00
- [ ] 5 endpoints criados e testados

SEGURANCA
- [ ] Todos 14 endpoints com requireAuth() + role validation
- [ ] Aluno NAO acessa /report, /risk/*, /d7/*
- [ ] Zero acusacoes automaticas — TODOS sao flags para humanos revisarem
- [ ] professor_reviewed_at NULL ate professor fazer review
```

---

## ORDEM DE IMPLEMENTACAO SUGERIDA

```
Semana 1:
  Dia 1-2: STORY-03.1 (migration) + STORY-03.3 (Gardner — simples, invisivel)
  Dia 3-4: STORY-03.4 (Wittgenstein — similar ao Gardner)
  Dia 5:   Testar Gardner + Wittgenstein no Hub Router

Semana 2:
  Dia 1-3: STORY-03.2 (Aristoteles — 7 estagios, mais complexo)
  Dia 4-5: STORY-03.2 continuacao (6 endpoints + testes)

Semana 3:
  Dia 1-2: STORY-03.5 (Foucault — 8 dimensoes + CRON)
  Dia 3-4: STORY-03.6 (Weber — agregacao + CRONs)
  Dia 5:   Teste integrado end-to-end (todos agentes juntos)
```

**Duvidas: perguntar ao Steven (PO) ou ao Leo (arquitetura base).**
