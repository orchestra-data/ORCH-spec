# Fase 2 — EPIC-02: Agentes Core (4 agentes reais)

> **Prerequisito:** Fase 1 completa (tool calling plugado, hub router fixado)
> **Resultado:** 4 agentes com logica real, migrations, tool calling proprio

---

## Visao geral

Transformar os 4 agentes de "strings de prompt" em services reais com algoritmos, tabelas e tools proprias.

| Agente | Responsabilidade | Algoritmo principal |
|--------|-----------------|-------------------|
| **Socrates** | Tutor dialogico | EDF loop (Explain → Diagnose → Fix) |
| **Ebbinghaus** | Revisao espacada | SM-2 (SuperMemo 2) |
| **Comenius** | Quiz/recap diario | Question generation a partir de conteudo |
| **Sisifo** | Gamificacao | XP engine + Octalysis framework |

---

## 2.1 Migration `1942000006--orch_ava_agents.sql`

**Criar em:** `libs/migrations/identity/1942000006--orch_ava_agents.sql`

```sql
-- Ebbinghaus: SM-2 spaced repetition cards
CREATE TABLE IF NOT EXISTS orch_concept_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  concept_key VARCHAR(200) NOT NULL,
  concept_label TEXT NOT NULL,
  source_component_id UUID,
  source_series_id UUID,
  easiness_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  interval_days INTEGER NOT NULL DEFAULT 1,
  repetition_count INTEGER NOT NULL DEFAULT 0,
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMPTZ,
  last_quality INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id, concept_key)
);
CREATE INDEX idx_ocm_user_review ON orch_concept_memory (user_id, tenant_id, next_review_at);

-- Comenius: daily recaps and questions
CREATE TABLE IF NOT EXISTS orch_daily_recap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  recap_date DATE NOT NULL DEFAULT CURRENT_DATE,
  topics JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  score NUMERIC(5,2),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id, recap_date)
);

CREATE TABLE IF NOT EXISTS orch_recap_question (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id UUID NOT NULL REFERENCES orch_daily_recap(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(30) NOT NULL DEFAULT 'multiple_choice',
  options JSONB,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  student_answer TEXT,
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ,
  source_component_id UUID,
  difficulty VARCHAR(10) DEFAULT 'medium',
  bloom_level VARCHAR(20) DEFAULT 'remember',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orq_recap ON orch_recap_question (recap_id);

-- Sisifo: gamification
CREATE TABLE IF NOT EXISTS orch_gamification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  xp_total INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  badges JSONB NOT NULL DEFAULT '[]',
  achievements JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS orch_xp_transaction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  xp_amount INTEGER NOT NULL,
  reason VARCHAR(100) NOT NULL,
  source_type VARCHAR(50),
  source_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_oxt_user ON orch_xp_transaction (user_id, tenant_id, created_at DESC);
```

---

## 2.2 Agente Socrates — Tutor Dialogico

**Criar:** `apps/api/src/app/services/agents/orch-socrates.ts`

### Conceito

Socrates NAO da respostas diretas. Ele guia o aluno com perguntas (maieutica).
Usa o loop EDF:
1. **Explain** — pede para o aluno explicar o que entendeu
2. **Diagnose** — identifica gaps no entendimento
3. **Fix** — guia o aluno a corrigir o gap com mais perguntas

### Tools especificas

- `getMyCourseContent` — busca conteudo que o aluno esta estudando
- `getMyProgress` — sabe onde o aluno parou
- `getMyGrades` — sabe onde o aluno tem dificuldade

### extractInsights

Analisa cada resposta do aluno e atualiza:
- `academic_profile.understanding_level` — baseado na qualidade das respostas
- `cognitive_profile.difficulty_areas` — topicos onde o aluno erra ou hesita
- `engagement_metrics.question_depth` — profundidade das perguntas feitas

### System Prompt (essencia)

```
Voce e Socrates, tutor do aluno na plataforma Cogedu.
Voce NUNCA da a resposta direta. Voce guia com perguntas.

Loop EDF:
1. Peca ao aluno para explicar o conceito com suas palavras
2. Identifique gaps ou misconceptions na explicacao
3. Faca uma pergunta que leve o aluno a corrigir o gap

Se o aluno pedir resposta direta: "Vamos pensar juntos..."
Se o aluno acertar: elogie e aprofunde
Se o aluno estiver frustrado: simplifique e encoraje

Use as ferramentas para saber o contexto do aluno (curso, progresso, notas).
```

---

## 2.3 Agente Ebbinghaus — Revisao Espacada

**Criar:** `apps/api/src/app/services/agents/orch-ebbinghaus.ts`

### Conceito

Implementa algoritmo SM-2 (SuperMemo 2) para revisao espacada.
Cada conceito aprendido vira um "card" na tabela `orch_concept_memory`.

### Algoritmo SM-2

```
Input: quality (0-5, auto-avaliacao do aluno)

Se quality >= 3 (acertou):
  Se repetition == 0: interval = 1
  Se repetition == 1: interval = 6
  Senao: interval = interval * easiness_factor
  repetition += 1
Senao (errou):
  repetition = 0
  interval = 1

easiness_factor = max(1.3, EF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
next_review = now + interval dias
```

### Tools especificas

- `getMyDueReviews` — **NOVA TOOL** — busca cards com `next_review_at <= NOW()`
- `recordReview` — **NOVA TOOL (WRITE)** — registra resultado de revisao (NOTA: precisa ser fora do withReadOnlyTransaction)
- `getMyProgress` — contexto de progresso geral

### extractInsights

- Quando o aluno menciona um conceito, cria card se nao existe
- Quando o aluno demonstra dominio, aumenta quality
- Quando o aluno confunde conceitos, diminui quality

---

## 2.4 Agente Comenius — Quiz e Recap

**Criar:** `apps/api/src/app/services/agents/orch-comenius.ts`

### Conceito

Gera quizzes e recaps diarios a partir do conteudo que o aluno estudou.
Usa Taxonomia de Bloom para variar dificuldade.

### Niveis Bloom nas questoes

- `remember` — "O que e...?" / "Cite..."
- `understand` — "Explique com suas palavras..."
- `apply` — "Como voce usaria...?"
- `analyze` — "Compare... com..."
- `evaluate` — "Qual a melhor abordagem para...?"
- `create` — "Proponha uma solucao para..."

### Tools especificas

- `getMyCourseContent` — busca conteudo para gerar questoes
- `getMyProgress` — sabe quais componentes o aluno ja completou
- `getTodayRecap` — **NOVA TOOL** — busca recap do dia (ou gera se nao existe)

### Fluxo do quiz

1. Aluno diz "quiz" ou "recap" ou "quero revisar"
2. Comenius verifica se existe recap do dia em `orch_daily_recap`
3. Se nao: gera 5 questoes via LLM baseado nos componentes completados
4. Apresenta questao por questao (1 por mensagem)
5. Avalia resposta, registra em `orch_recap_question`
6. No final: score + feedback + conceitos para revisar (envia para Ebbinghaus)

---

## 2.5 Agente Sisifo — Gamificacao

**Criar:** `apps/api/src/app/services/agents/orch-sisifo.ts`

### Conceito

Engine de XP, streaks, badges e leaderboard. Baseado no Octalysis framework.

### Tabela de XP por acao

| Acao | XP | Fonte |
|------|-----|-------|
| Completar componente (video) | 10 | experience_events |
| Completar componente (quiz) | 20 | experience_events |
| Quiz score >= 80% | 15 (bonus) | orch_recap_question |
| Review SM-2 (quality >= 4) | 5 | orch_concept_memory |
| Streak diario | streak_days * 2 | orch_gamification |
| Primeiro acesso do dia | 5 | login |

### Niveis

| Level | XP minimo | Titulo |
|-------|----------|--------|
| 1 | 0 | Iniciante |
| 2 | 100 | Aprendiz |
| 3 | 300 | Estudioso |
| 4 | 600 | Dedicado |
| 5 | 1000 | Mestre |
| 6 | 1500 | Lenda |

### Badges (exemplos)

- "Primeira Aula" — completou 1 componente
- "Maratonista" — completou 10 componentes em 1 dia
- "Constante" — streak de 7 dias
- "Perfeccionista" — 3 quizzes com 100%
- "Curioso" — fez 20 perguntas ao Socrates

### Tools especificas

- `getMyXP` — **NOVA TOOL** — retorna XP, level, streak, badges
- `getLeaderboard` — **NOVA TOOL** — top 10 da turma (por turma do aluno)

### extractInsights

- Quando aluno menciona "XP", "nivel", "badge" → engajamento gamificado alto
- Quando aluno ignora gamificacao → perfil menos competitivo
- Atualiza `engagement_metrics.gamification_affinity`

---

## Integracao no orchAvaChat.ts

Apos criar os 4 services, o pipeline muda na etapa 5 (agent selection):

```typescript
// ANTES: prompt string hardcoded
const agentPrompt = AGENT_PROMPTS[agent];

// DEPOIS: service real
import { orchSocrates } from '../services/agents/orch-socrates';
import { orchEbbinghaus } from '../services/agents/orch-ebbinghaus';
import { orchComenius } from '../services/agents/orch-comenius';
import { orchSisifo } from '../services/agents/orch-sisifo';

const agents = { socrates: orchSocrates, ebbinghaus: orchEbbinghaus, comenius: orchComenius, sisifo: orchSisifo };
const activeAgent = agents[agent];

// Etapa 9: prompt com personalidade
const systemPrompt = activeAgent
  ? activeAgent.buildSystemPrompt(profile, { ragContext, pageUrl, history })
  : AGENT_PROMPTS[agent]; // fallback para bloom/weber (fase 3)

// Etapa 10: execute com tools do agente
const agentTools = activeAgent?.getTools?.(toolContext) ?? {};
const allAvailableTools = { ...availableTools, ...agentTools };

// Etapa 11 (nova): extract insights
if (activeAgent) {
  const insights = await activeAgent.extractInsights([...history, { role: 'user', content: message }, { role: 'assistant', content: response.text }]);
  for (const update of insights) {
    await orchProfileService.updateField(dbUserId, tenantId, update.fieldPath, update.value);
  }
}
```

---

## Testes por agente

### Socrates
```
"me explica o que e uma variavel em programacao"
→ Deve fazer pergunta de volta, NAO dar resposta direta

"nao sei, me diz"
→ Deve simplificar e guiar, NAO capitular
```

### Ebbinghaus
```
"o que preciso revisar hoje?"
→ Deve consultar orch_concept_memory e listar cards due

"acertei tudo"
→ Deve atualizar SM-2 (easiness up, interval up)
```

### Comenius
```
"quero fazer um quiz"
→ Deve gerar 5 questoes baseadas nos componentes completados

"a resposta e B"
→ Deve avaliar, dar feedback, registrar em orch_recap_question
```

### Sisifo
```
"quantos XP eu tenho?"
→ Deve consultar orch_gamification e responder com level/streak/badges

"quero ver o ranking da turma"
→ Deve mostrar top 10 da turma do aluno
```
