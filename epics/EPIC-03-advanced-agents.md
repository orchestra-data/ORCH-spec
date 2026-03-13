# EPIC-03: Agentes Avançados AVA

**Fase:** F3
**Prioridade:** HIGH
**Estimativa:** 2-3 semanas
**Dependências:** EPIC-02 concluído (dados de Bloom + Taylor necessários)
**Entregável:** Assessment pipeline, perfil cognitivo/linguístico, risco, D7 reports

---

## Stories

### STORY-03.1: Migration SQL — orch_advanced_agents
**Tipo:** Database
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] Migration `20260407_orch_advanced_agents.sql` criada
- [ ] `orch_assessment` (Aristóteles): submission + 5 quality dims + plagiarism + AI detection + stylometric + composite
- [ ] `orch_stylometric_baseline` (Aristóteles): baseline estilométrico por aluno
- [ ] `orch_cognitive_observation` (Gardner): observações de interação (invisível)
- [ ] `orch_linguistic_sample` (Wittgenstein): amostras de texto analisadas
- [ ] `orch_risk_assessment` (Foucault): 8 dimensões, 5 níveis, intervenção sugerida
- [ ] `orch_d7_report` (Weber): dossier consolidado
- [ ] Constraint: `orch_assessment.review_status` CHECK ('pending','reviewed','contested')

### STORY-03.2: Aristóteles — Assessment Pipeline (7 Stages)
**Tipo:** Backend Service
**Pontos:** 13
**Critérios de Aceitação:**
- [ ] `services/agents/orch-aristoteles.ts` — orquestrador do pipeline
- [ ] Stage 1: Recepção + validação do submission
- [ ] Stage 2: `orch-aristoteles-quality.ts` — 5 dims via Gemini structured output
- [ ] Stage 3: `orch-aristoteles-plagiarism.ts` — Winnowing fingerprinting + cosine similarity
- [ ] Stage 4: `orch-aristoteles-ai-detect.ts` — perplexity analysis + stylometric comparison
- [ ] Stage 5: `orch-aristoteles-stylometric.ts` — perfil estilométrico vs baseline
- [ ] Stage 6: Composite score (média ponderada)
- [ ] Stage 7: Feedback generation para aluno (sem acusar, apenas feedback construtivo)
- [ ] **CRÍTICO:** NUNCA acusa automaticamente — professor sempre revisa flags
- [ ] Gate Assessment 1: professor OBRIGADO a revisar antes de nota final
- [ ] Endpoints: `POST /assessment/submit`, `GET /assessment/:id`, `GET /assessment/:id/report`, `POST /assessment/:id/review`, `GET /assessment/student/:studentId`, `GET /assessment/class/:classId`
- [ ] Testa: submeter trabalho, verificar 7 stages, professor vê flags, aluno vê só feedback

### STORY-03.3: Gardner — Perfil Cognitivo (Invisível)
**Tipo:** Backend Service
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `services/agents/orch-gardner.ts` criado
- [ ] Analisa CADA interação em background (Promise.allSettled)
- [ ] Detecta 8 inteligências Gardner MI: linguistic, logical-math, spatial, musical, bodily-kinesthetic, interpersonal, intrapersonal, naturalist
- [ ] Triggers: vídeo vs texto, velocidade de resposta, exemplos vs teoria, sequencial vs global
- [ ] Atualiza `cognitive_profile.intelligence_observations` no Bourdieu
- [ ] **STRENGTHS-BASED:** NUNCA diagnostica, NUNCA rotula
- [ ] Testa: após 10 interações variadas, perfil cognitivo reflete preferências

### STORY-03.4: Wittgenstein — Perfil Linguístico (Invisível)
**Tipo:** Backend Service
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `services/agents/orch-wittgenstein.ts` criado
- [ ] Analisa textos longos (fórum, assessment, chat com 50+ palavras)
- [ ] Métricas: CEFR estimation, vocabulary richness (TTR), formality score, grammar errors
- [ ] 4 contextos: chat/forum/assessment/portfolio
- [ ] Salva em `orch_linguistic_sample`, atualiza `linguistic_profile` no Bourdieu
- [ ] Background via Promise.allSettled
- [ ] Testa: após 5 textos longos, perfil linguístico reflete nível real

### STORY-03.5: Foucault — Risk Assessment
**Tipo:** Backend Service
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `services/agents/orch-foucault.ts` criado
- [ ] 8 dimensões quantitativas (engagement, notas, frequência, financeiro, interação AI, social, temporal, acadêmico)
- [ ] 5 níveis: green → yellow → orange → red → critical
- [ ] Intervenção graduada: none → monitor → nudge → outreach → meeting → urgent
- [ ] Detecta padrões SOCIOECONÔMICOS (Bourdieu reprodução) — alerta coordenador sobre padrões estruturais vs individuais
- [ ] CRON 14:05: `batchRiskAssessment()`
- [ ] Constraint ético: se aluno DEVE sair (motivo legítimo), facilitar com dignidade
- [ ] Endpoints: `GET /risk/class/:classId`, `GET /risk/student/:studentId`, `POST /risk/assess`
- [ ] Testa: aluno com engagement baixo → amarelo; aluno sem login 7 dias → laranja

### STORY-03.6: Weber — D7 Reports
**Tipo:** Backend Service
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `services/agents/orch-weber.ts` criado
- [ ] Consolida TODOS agentes: Bloom (acadêmico), Taylor (engagement), Foucault (risco), Gardner (cognitivo), Sísifo (gamificação), Ebbinghaus (retenção), Wittgenstein (linguístico)
- [ ] CRON weekly Sun 04:00: `generateWeeklyD7()`
- [ ] CRON 1st of month: `generateMonthlyD7()`
- [ ] Integra com certificação do Leo (`GET /certification/my-certificates`)
- [ ] Endpoints: `GET /d7/:studentId`, `GET /d7/:studentId/weekly`, `POST /d7/generate`, `GET /d7/class/:classId`, `GET /d7/:studentId/download`
- [ ] Output JSONB (PDF server-side = F7)
- [ ] Testa: gerar D7, verificar que consolida dados de todos agentes

---

## Definição de Done (Epic)
- [ ] Assessment pipeline funcional com 7 stages
- [ ] Professor revisa ANTES de nota final (constraint no DB)
- [ ] Perfil cognitivo (Gardner MI) sendo construído invisivelmente
- [ ] Perfil linguístico com CEFR estimation
- [ ] Mapa de risco por turma com 5 níveis
- [ ] D7 reports semanais consolidando todos agentes
- [ ] Nenhum agente "acusa" — todos fornecem evidências para revisão humana
