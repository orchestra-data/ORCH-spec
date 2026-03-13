# EPIC-02: Agentes Core AVA

**Fase:** F2
**Prioridade:** HIGH
**Estimativa:** 2-3 semanas
**Dependências:** EPIC-01 concluído (Hub + Bourdieu + persistência)
**Entregável:** 6 agentes que fazem o aluno QUERER voltar todo dia

---

## Stories

### STORY-02.1: Migration SQL — orch_core_agents
**Tipo:** Database
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] Migration `20260321_orch_core_agents.sql` criada
- [ ] `orch_concept_memory` (Ebbinghaus): concept_id, easiness_factor, interval_days, repetitions, retention, next_review
- [ ] `orch_daily_recap` (Comenius): student_id, recap_date, status, questions_total/correct, xp_earned, streak_day
- [ ] `orch_recap_question` (Comenius): recap_id, concept_id, question_type, question_text, options, correct/student_answer, is_correct
- [ ] `orch_gamification` (Sísifo): xp_total, level, streak_days/best/last, badges, missions, octalysis
- [ ] `orch_xp_transaction` (Sísifo): student_id, amount, source, source_id, description
- [ ] `orch_engagement_snapshot` (Taylor): snapshot_date, score, trend, login/time/content/social/assessment/ai_score
- [ ] Indexes em student_id, next_review, recap_date

### STORY-02.2: Sócrates — Tutor Socrático Inteligente
**Tipo:** Backend Service
**Pontos:** 8
**Critérios de Aceitação:**
- [ ] `services/agents/orch-socrates.ts` criado
- [ ] RAG via ComponentRAGService (Leo) para contexto da aula
- [ ] Prompt socrático com perfil Bourdieu do aluno
- [ ] Graduated hints (5 níveis): guia → pista → exemplo → explicação parcial → resposta completa
- [ ] EDF loop (Evaluate-Diagnose-Feedback)
- [ ] `orch-socrates-critic.ts`: HPO adversarial (2 críticos + moderador), só ativa hint_level >= 3
- [ ] Hub roteia corretamente para Sócrates
- [ ] Testa: conversa com 5 perguntas, verifica hint graduation

### STORY-02.3: Ebbinghaus — Spaced Repetition Engine
**Tipo:** Backend Service
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `services/agents/orch-ebbinghaus.ts` criado
- [ ] SM-2 algorithm: calcula EF, interval, retention R(t)=e^(-t/S)
- [ ] `selectConceptsForReview()`: WHERE next_review <= NOW()
- [ ] Automatic trigger: Hub STEP 9 dispara update de conceito após interação com Sócrates (via Promise.allSettled)
- [ ] Testa: conceito revisado com acerto → interval aumenta; com erro → interval diminui

### STORY-02.4: Comenius — Daily Recap + Quiz
**Tipo:** Backend Service + Frontend
**Pontos:** 8
**Critérios de Aceitação:**
- [ ] `services/agents/orch-comenius.ts` criado
- [ ] Seleciona 5 conceitos do Ebbinghaus por aluno
- [ ] Gera questões via Gemini structured output, dificuldade = retention atual (TASA)
- [ ] Batch size max 50 alunos por execução de CRON
- [ ] Endpoints: `GET /recap/today`, `POST /recap/:id/start`, `POST /recap/:id/answer`, `POST /recap/:id/complete`, `GET /recap/history`, `GET /recap/streak`
- [ ] `DailyRecapWidget.tsx`: card no dashboard + tela de questões + feedback + confetti
- [ ] Testa: aluno recebe recap, responde, XP computado, conceitos atualizados no Ebbinghaus

### STORY-02.5: Sísifo — Gamification Engine
**Tipo:** Backend Service + Frontend
**Pontos:** 8
**Critérios de Aceitação:**
- [ ] `services/agents/orch-sisifo.ts` criado
- [ ] XP engine: calcula level, streak check, badge unlock, mission progress
- [ ] Anti-patterns enforced (sem P2W, sem grinding vazio)
- [ ] Octalysis integration (8 core drives)
- [ ] Endpoints: `GET /gamification/status`, `/leaderboard`, `/badges`, `/missions`, `POST /claim-badge`
- [ ] `GamificationBar.tsx`: XP badge + streak fire + progress bar no header AVA
- [ ] `GamificationPanel.tsx`: profile, badges, missions, leaderboard
- [ ] CRON 23:59: `checkStreaks()` — reset streak se não fez nada hoje
- [ ] Testa: ganhar XP, subir level, manter streak 3 dias, perder streak

### STORY-02.6: Bloom — Mastery Learning + Study Plans
**Tipo:** Backend Service + Frontend
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `services/agents/orch-bloom.ts` criado
- [ ] Mastery learning engine (API Orchestra para notas)
- [ ] Mastery gap calculator ("quanto falta pra dominar")
- [ ] Study plan generator (3 níveis: Bloom taxonomy — remember/understand/apply)
- [ ] Raio-X do aluno (endpoint para professor)
- [ ] Endpoints: `GET /grades/summary`, `/simulate`, `GET /study-plan`, `POST /study-plan/generate`, `GET /student-xray/:studentId`
- [ ] `GradesWidget.tsx`: notas resumidas + simulador "quanto preciso?"
- [ ] Testa: aluno vê notas, simula, gera plano de estudo

### STORY-02.7: Taylor — Engagement Monitor (Invisível)
**Tipo:** Backend Service
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] `services/agents/orch-taylor.ts` criado
- [ ] Agregação de `experience_events` em score 0-100
- [ ] 6 sub-scores: login, time, content, social, assessment, ai
- [ ] CRON 14:00: `snapshotEngagement()` — snapshot diário
- [ ] Background update via Promise.allSettled (nunca bloqueia Hub)
- [ ] Testa: após 3 dias de atividade, verificar snapshots com scores coerentes

### STORY-02.8: CRONs da Fase 2
**Tipo:** Infrastructure
**Pontos:** 2
**Critérios de Aceitação:**
- [ ] CRON 05:00: health check (verifica Gemini, DB, Redis)
- [ ] CRON 06:00: Ebbinghaus `selectConceptsForReview()`
- [ ] CRON 06:05: Comenius `generateDailyRecaps()` (batch 50)
- [ ] CRON 14:00: Taylor `snapshotEngagement()`
- [ ] CRON 23:59: Sísifo `checkStreaks()`
- [ ] CRON horário: circuit breaker reset check
- [ ] Todos com logging e retry em caso de falha

### STORY-02.9: Rich Messages + Sugestões no Player
**Tipo:** Frontend
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `<HintBlock level={1-5} />` — Sócrates graduated hints com visual distinto por nível
- [ ] `<QuizInline question={...} />` — quiz dentro do chat (Comenius/Sócrates)
- [ ] `<ProgressBar value={0.7} label="Logaritmos" />` — mastery de conceito (Bloom)
- [ ] `<CodeBlock language="python" />` — respostas com código (syntax highlight)
- [ ] `<Expandable title="Detalhes">...</Expandable>` — info colapsada
- [ ] Action chips tipo `walkthrough` e `dom-fill` (para Admin)
- [ ] Player de vídeo: pausa >30s → "Algo confuso?"; volta 3x → "Quer explorar juntos?"
- [ ] Pós-vídeo: "O que achou?" e "Tem recap esperando (~2min)"
- [ ] Sugestões NÃO bloqueiam o player, são não-intrusivas

---

## Definição de Done (Epic)
- [ ] Aluno tem tutor socrático com hints graduais
- [ ] Daily recap com 5 questões personalizadas
- [ ] Gamificação ativa: XP, streak, badges, leaderboard
- [ ] Notas com simulador "quanto preciso?"
- [ ] Engagement tracking invisível funcionando
- [ ] Spaced repetition atualizando a cada interação
- [ ] Todos os CRONs executando em schedule
