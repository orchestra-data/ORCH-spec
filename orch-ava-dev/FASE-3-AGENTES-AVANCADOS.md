# Fase 3 — EPIC-03: Agentes Avancados (5 agentes)

> **Prerequisito:** Fase 2 completa (4 agentes core funcionando)
> **Resultado:** Perfil cognitivo/linguistico completo, risk assessment, relatorios

---

## Visao geral

Estes agentes sao mais analiticos — observam padroes ao longo do tempo.

| Agente | Responsabilidade | Quando atua |
|--------|-----------------|-------------|
| **Bloom** | Mastery learning + predicao de nota | Quando aluno pergunta sobre notas/estudo |
| **Taylor** | Engajamento snapshot | CRON (background, nao conversacional) |
| **Aristoteles** | Assessment pipeline | Quando avaliacao e submetida |
| **Gardner** | Perfil cognitivo MI | Analise passiva de dialogos |
| **Wittgenstein** | Perfil linguistico CEFR | Analise passiva de dialogos |
| **Foucault** | Risk assessment | CRON + triggers de queda |

---

## Migration `1942000007--orch_ava_advanced.sql`

**Criar em:** `libs/migrations/identity/1942000007--orch_ava_advanced.sql`

```sql
-- Taylor: engagement snapshots
CREATE TABLE IF NOT EXISTS orch_engagement_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  login_count INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  components_completed INTEGER DEFAULT 0,
  time_spent_minutes INTEGER DEFAULT 0,
  quiz_attempts INTEGER DEFAULT 0,
  avg_quiz_score NUMERIC(5,2),
  streak_days INTEGER DEFAULT 0,
  engagement_score NUMERIC(5,2),
  trend VARCHAR(20) DEFAULT 'stable',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id, snapshot_date)
);
CREATE INDEX idx_oes_user ON orch_engagement_snapshot (user_id, tenant_id, snapshot_date DESC);

-- Aristoteles: assessment observations
CREATE TABLE IF NOT EXISTS orch_assessment_observation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  assessment_attempt_id UUID,
  observation_type VARCHAR(50) NOT NULL,
  evidence JSONB NOT NULL,
  confidence NUMERIC(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gardner: multiple intelligences observations
CREATE TABLE IF NOT EXISTS orch_cognitive_observation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  intelligence_type VARCHAR(30) NOT NULL,
  evidence_text TEXT NOT NULL,
  score_delta NUMERIC(4,2),
  source_conversation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_oco_user ON orch_cognitive_observation (user_id, tenant_id, intelligence_type);

-- Wittgenstein: linguistic samples
CREATE TABLE IF NOT EXISTS orch_linguistic_sample (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  sample_text TEXT NOT NULL,
  word_count INTEGER,
  avg_word_length NUMERIC(4,2),
  sentence_count INTEGER,
  complexity_score NUMERIC(4,2),
  cefr_estimate VARCHAR(5),
  vocabulary_richness NUMERIC(4,2),
  source_conversation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ols_user ON orch_linguistic_sample (user_id, tenant_id, created_at DESC);

-- Foucault: risk assessment
CREATE TABLE IF NOT EXISTS orch_risk_assessment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  assessment_date DATE NOT NULL,
  overall_risk VARCHAR(10) NOT NULL DEFAULT 'low',
  dimensions JSONB NOT NULL DEFAULT '{}',
  triggers JSONB DEFAULT '[]',
  recommended_actions JSONB DEFAULT '[]',
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id, assessment_date)
);
CREATE INDEX idx_ora_risk ON orch_risk_assessment (tenant_id, overall_risk, assessment_date DESC);

-- Weber: consolidated reports
CREATE TABLE IF NOT EXISTS orch_d7_report (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  report_type VARCHAR(20) NOT NULL DEFAULT 'weekly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary JSONB NOT NULL,
  highlights JSONB DEFAULT '[]',
  concerns JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id, report_type, period_start)
);
```

---

## 3.1 Bloom — Mastery Learning

**Criar:** `apps/api/src/app/services/agents/orch-bloom.ts`

### O que faz

- Calcula nivel de mastery por serie/unidade (baseado em notas + completion)
- Gera plano de estudo personalizado
- Prediz nota final baseado em tendencia
- Identifica gaps de conhecimento

### Tools

- `getMyGrades` — notas reais
- `getMyProgress` — progresso por componente
- `getMasteryMap` — **NOVA** — calcula mastery por unidade (% completion * score weight)
- `getStudyPlan` — **NOVA** — gera plano priorizado (unidades com baixo mastery primeiro)

---

## 3.2 Taylor — Engagement Monitor (CRON)

**Criar:** `apps/api/src/app/services/agents/orch-taylor.ts`

### O que faz (NAO conversacional — roda em background)

- CRON diario: consolida metricas do dia em `orch_engagement_snapshot`
- Detecta queda de engajamento (compara com media dos ultimos 7 dias)
- Se queda > 30%: cria alerta em `orch_admin_alert` para coordenador
- Calcula `trend`: rising, stable, declining, critical

### Fonte de dados

- `experience_events` (logins, completions, interacoes)
- `orch_interaction_log` (mensagens ao Orch)
- `orch_gamification` (streaks)

---

## 3.3 Gardner — Perfil Cognitivo MI

**Criar:** `apps/api/src/app/services/agents/orch-gardner.ts`

### O que faz (analise PASSIVA — roda dentro do extractInsights)

Observa como o aluno interage e mapeia para as 8 inteligencias de Gardner:

| Inteligencia | Indicador |
|-------------|-----------|
| Linguistica | Textos longos, vocabulario rico |
| Logico-matematica | Perguntas de "por que", raciocinio |
| Espacial | Pede diagramas, visualizacoes |
| Musical | Menciona ritmo, audio, podcasts |
| Corporal-cinestesica | Pede exemplos praticos, atividades |
| Interpessoal | Menciona grupo, colegas, discussao |
| Intrapessoal | Reflexao, auto-avaliacao |
| Naturalista | Exemplos da natureza, sistemas |

### Como coleta

NAO pergunta diretamente. Observa:
- Tipos de perguntas que o aluno faz
- Como o aluno pede explicacoes (visual? textual? praticar?)
- Reacoes a diferentes formatos de conteudo

Registra em `orch_cognitive_observation` e acumula score em `orch_student_profile.cognitive_profile`.

---

## 3.4 Wittgenstein — Perfil Linguistico

**Criar:** `apps/api/src/app/services/agents/orch-wittgenstein.ts`

### O que faz (analise PASSIVA)

Analisa as mensagens do aluno para determinar nivel CEFR:

| CEFR | Indicadores |
|------|------------|
| A1 | Frases curtas, vocabulario basico, erros frequentes |
| A2 | Frases simples conectadas, vocabulario limitado |
| B1 | Paragrafos, conectores, vocabulario adequado |
| B2 | Argumentacao, vocabulario variado, poucos erros |
| C1 | Nuance, ironia, vocabulario sofisticado |
| C2 | Dominio completo, estilo pessoal |

### Metricas calculadas

- `word_count` — extensao media das mensagens
- `avg_word_length` — complexidade lexical
- `vocabulary_richness` — type/token ratio
- `sentence_count` — complexidade sintatica
- `complexity_score` — formula combinada

Registra amostras em `orch_linguistic_sample` (1 amostra a cada 10 mensagens).

---

## 3.5 Foucault — Risk Assessment

**Criar:** `apps/api/src/app/services/agents/orch-foucault.ts`

### O que faz

Avalia risco de evasao/reprovacao em 8 dimensoes:

| Dimensao | Fonte | Weight |
|----------|-------|--------|
| Presenca | attendance_calculation | 0.20 |
| Notas | assessment_attempt | 0.20 |
| Engajamento | orch_engagement_snapshot | 0.15 |
| Streak | orch_gamification | 0.10 |
| Progresso | student_progress | 0.15 |
| Linguistico | orch_linguistic_sample | 0.05 |
| Cognitivo | orch_cognitive_observation | 0.05 |
| Social | conversation (mensagens enviadas) | 0.10 |

### Classificacao

- `low` (score >= 70) — aluno engajado
- `medium` (50-69) — sinais de alerta
- `high` (30-49) — intervencao recomendada
- `critical` (< 30) — alerta urgente para coordenador

### Triggers de alerta

- Streak quebrado apos 5+ dias
- 3 quizzes consecutivos com score < 50%
- 0 logins em 7 dias
- Queda de presenca > 20pp em 30 dias

---

## Ordem de implementacao dentro da Fase 3

1. **Bloom** (depende de getMyGrades + getMyProgress — ja existem)
2. **Gardner + Wittgenstein** (analise passiva — plugam no extractInsights)
3. **Taylor** (CRON — independente)
4. **Foucault** (depende de todos acima para score completo)
5. **Weber** (relatorio D7 — consolida tudo que os outros geram)
