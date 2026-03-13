# PLANO ORCH EVOLUTION v2 — Blend Completo: Leo + Specs Originais + State of the Art

Data: 2026-03-13
Autor: Squad Cogedu Orchestra (@cogedu-chief)
Status: PROPOSTA PARA APROVACAO DO STEVEN

---

## VISAO

Construir sobre a infraestrutura que o Leo ja deixou funcionando (RAG pipeline, embeddings, services, CommunicationHub) e implementar os 20 agentes que voce projetou, turbinados com os patterns do state-of-the-art.

```
SPECS ORIGINAIS (seus agentes)     +    LEO (infra pronta)     +    RESEARCH (inovacoes)
─────────────────────────          ─────────────────────       ──────────────────────
15 agentes AVA + 5 placeholders    GoogleGeminiService         IntelliCode (versioned state)
Hub router invisivel               EmbeddingService            HPO (criticos adversariais)
Bourdieu (perfil central)          ComponentRAGService         Carnegie (LiveLab dashboard)
12 arquetipos zodiacais            TextChunkingService         Pi (personality design)
page-guide v4.0 com DOM bridge     pgvector instalado          assistant-ui (React chat lib)
14 YAMLs knowledge base            CommunicationHub live       Generative UI
25 walkthroughs                    Socket.IO funcionando       Streaming + status hints
D7 system (Weber)                  RabbitMQ events             Action chips
Octalysis gamification             ai_conversation (criada)    Voice-first (futuro)
8-dim dropout prediction           company_ai_config (criada)  Memory control UX
```

---

## FASE 0: CORRECOES + LIMPEZA (1-2 dias)

### Seguranca
- [ ] `requireAuth()` no `adminInterventionAudit` (middlewares = [])
- [ ] Validacao de permissao no `sendClassMessage`
- [ ] Verificar registro de `initiateStudentConversation` e `searchComponentTranscription`

### Limpeza
- [ ] Deletar `FloatingChat.tsx`, `AIAssistant.tsx`, `FloatingAIAssistant.tsx` (dead code)
- [ ] Remover console.log do `ClassChat.tsx`
- [ ] Migrar permissoes `edu.component.*` → `edu.certificate.*`

### Wire-up Certificacao AVA
- [ ] Conectar `CertificatesPage` a `GET /certification/my-certificates`
- [ ] Conectar `DocumentsPage` a `POST /certification/documents/request`

---

## FASE 1: FUNDACAO MULTI-AGENTE (1-2 semanas)

### 1.1 Hub Router (seu spec `_hub/hub-guide.md`)

Implementar o Hub como voce projetou: **unico ponto de entrada**, aluno NUNCA ve agentes internos.

```typescript
// hub-router.ts — baseado no seu hub-guide.md
interface IntentDetection {
  intent: string;
  confidence: number;
  handler: AgentId;
}

async function hubRoute(message: string, studentId: string): Promise<AgentResponse> {
  // 1. Freud safety scan (background, non-blocking) — PLACEHOLDER por enquanto
  // 2. Carregar perfil Bourdieu (arquetipo, nome, contexto)
  const profile = await loadBourdieu(studentId);
  // 3. Carregar historico
  const history = await loadConversation(studentId);
  // 4. Detectar intent (gpt-4o-mini, threshold 0.6, max 3)
  const intents = await detectIntents(message, history);
  // 5. Rotear para agente especialista
  const response = await routeToAgent(intents[0], message, profile, history);
  // 6. Aplicar transformacao de arquetipo (12 arquetipos Bourdieu)
  const transformed = applyArchetype(response, profile.archetype);
  // 7. Entregar
  return transformed;
}

// Rotas diretas (Hub responde sem rotear)
const DIRECT_INTENTS = ['greeting', 'small_talk', 'gratitude', 'farewell', 'identity'];

// Mapa de roteamento (do seu hub-guide.md)
const ROUTE_MAP: Record<string, AgentId> = {
  'grade_check': 'freire',
  'score_calculation': 'freire',
  'study_plan': 'freire',
  'content_doubt': 'socrates',
  'assessment_feedback': 'aristoteles',
  'financial': 'keynes',        // placeholder
  'enrollment': 'janus',        // placeholder
  'admission': 'heimdall',
  'document_request': 'weber',
  'gamification': 'sisifo',
  'emotional_support': 'freud', // placeholder
  'engagement': 'taylor',       // invisible
  'cognitive': 'gardner',       // invisible
  'linguistic': 'wittgenstein', // invisible
  'risk': 'foucault',          // invisible
  'profile': 'bourdieu',       // invisible
};
```

**Reutiliza do Leo:** `GoogleGeminiService` para intent detection (gemini-2.5-flash-lite).

### 1.2 Bourdieu — Perfil Central (seu spec `bourdieu-guide.md`)

```sql
-- Tabela: orch_student_profiles (JSONB versionado)
CREATE TABLE orch_student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES "user"(id),
  version INTEGER DEFAULT 1,

  -- Perfil (do seu spec)
  communication_archetype VARCHAR(50), -- 12 arquetipos
  academic_profile JSONB,     -- GPA, standing, trends
  cognitive_profile JSONB,    -- Gardner guidelines
  linguistic_profile JSONB,   -- Wittgenstein CEFR level
  engagement_profile JSONB,   -- Taylor metrics
  sociocultural JSONB,        -- Bourdieu habitus
  gamification_profile JSONB, -- Sisifo XP, level, motivations

  -- State of the art additions
  learning_style JSONB,       -- Felder-Silverman (PACE paper)
  skills JSONB,               -- Mastery por skill (IntelliCode pattern)
  forgetting_curves JSONB,    -- Ebbinghaus decay por conceito (TASA paper)

  updated_by VARCHAR(50),     -- single-writer: qual agente atualizou
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(student_id, tenant_id)
);

-- Single-writer audit (IntelliCode pattern)
CREATE TABLE orch_profile_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  agent_id VARCHAR(50) NOT NULL,
  field_path TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Blend:** Seu Bourdieu (12 arquetipos, perfil multidimensional) + IntelliCode (versioned state, single-writer, audit trail) + PACE (Felder-Silverman) + TASA (forgetting curves).

### 1.3 Persistencia de Conversas (tabelas JA EXISTEM)

`ai_conversation` e `ai_conversation_message` criadas pelo Leo mas nunca usadas.

- `generateTutorResponse.ts`: apos resposta, gravar em `ai_conversation_message`
- Novo endpoint: `GET /tutor/conversations/:unitId` (historico por unidade)
- `AIChatTab.tsx`: ao montar, carregar historico

### 1.4 Quota Enforcement (funcoes JA EXISTEM)

Adicionar `check_company_ai_quota()` antes de cada chamada Gemini. Tratar 429 no frontend.

---

## FASE 2: AGENTES CORE AVA (2-3 semanas)

### 2.1 Socrates (seu spec `socrates-guide.md` + research HPO)

**Base:** Seu spec (modo Dialogico + modo Tutor, adaptacao linguistica via Wittgenstein, cognitiva via Gardner).

**Turbinado com:**
- **HPO adversarial critics:** Shadow agent revisa cada resposta do Socrates. Um critico "ajude mais" + um "deixe lutar". Moderador escolhe. Ativa apenas quando hint level >= 3 (economia de tokens).
- **Graduated hints (Carnegie):** 5 niveis como voce imaginou, mas agora com tracking de quantos hints por conceito por aluno → alimenta forgetting curve.
- **Evidence-Decision-Feedback loop (Copa/EDF):** Cada resposta do aluno passa por: Evidence (o que revela?) → Decision (qual intervencao?) → Feedback (gerar resposta).

**Reutiliza do Leo:** `generateTutorResponse.ts` pipeline inteiro (RAG search, Gemini call, FinOps logging). Evolui o prompt e adiciona o estado versionado.

### 2.2 Freire (seu spec `freire-guide.md`)

Implementar como projetado:
- Grade composition do Orchestra API
- "Quanto preciso tirar na P2" calculator
- Study plans personalizados (3 niveis, baseados em deficits do Aristoteles + Ebbinghaus)
- Raio-X do Aluno (relatorio pro professor)
- Scheduled: Raio-X semanal (Sun 04:00), study plan daily (06:00)

### 2.3 Ebbinghaus + Comenius (seus specs + TASA paper)

**Merge inteligente:** Seus dois specs tem overlap (4-stage pipeline identico). Implementar como:
- **Ebbinghaus engine** (backend): curva de esquecimento SM-2, decay R(t) = e^(-t/S), scheduling de revisao
- **Comenius UI** (frontend): daily recap gamificado, streaks, XP

**Turbinado com TASA:** Difficulty ajustada ao estado ATUAL (pos-decaimento), nao ao pico de maestria.

**Tabelas (do seu spec):** `orch_ava_daily_recap`, `orch_ava_recap_question`, `orch_ava_recap_response`, `orch_ava_recap_streak`, `orch_ava_concept_memory`

**Endpoints (do seu spec):**
- `GET /orch-ava/comenius/recap/today`
- `POST /orch-ava/comenius/recap/:recapId/start`
- `POST /orch-ava/comenius/recap/:recapId/answer`
- `POST /orch-ava/comenius/recap/:recapId/complete`

### 2.4 Sisifo — Gamificacao (seu spec + Duolingo patterns)

Implementar como projetado (Octalysis, 12 levels, missions, streaks, badges).

**Tabela:** `orch_ava_gamification` (student_id, xp, level, streak_days, streak_last, badges JSONB, missions JSONB)

**Anti-patterns (do seu spec):** NUNCA remover pontos, ranking publico humilhante, escassez artificial, dark patterns, bonus de velocidade.

### 2.5 Taylor — Engajamento (seu spec)

Monitor invisivel de TODA atividade (xAPI, logins, attendance). Engagement score 0-100 calibrado por tipo de curso. Cache em `orch_taylor_engagement_cache`.

### 2.6 Foucault — Risco e Retencao (seu spec + LTV business case)

8 dimensoes quantitativas + coleta qualitativa "como quem nao quer nada". Risk scoring 5 niveis com intervencao graduada. Constraint etico: se aluno DEVE sair, facilitar com dignidade.

---

## FASE 3: AGENTES AVANCADOS AVA (2-3 semanas)

### 3.1 Aristoteles — Pipeline de Avaliacao (seu spec)

7 estagios: pre-processing → quality assessment (5 dims) → plagiarism detection → AI detection (3 tiers) → stylometric profile → composite score → result distribution.

**NUNCA acusa automaticamente.** Tudo sao probabilidades. Relatorio completo so pro professor.

**Tech:** BERTimbau, StyloMetrix, Binoculars, Winnowing, spaCy pt_core_news_lg.

### 3.2 Gardner — Percepcao Cognitiva (seu spec + PACE)

STRENGTHS-BASED, NUNCA diagnostica. Double invisible. Output: apenas "guidelines praticas" para outros agentes.

**Turbinado com PACE:** Adicionar deteccao Felder-Silverman (Active/Reflective, Sensing/Intuitive, Visual/Verbal, Sequential/Global) nas primeiras 10 interacoes.

### 3.3 Wittgenstein — Analise Linguistica (seu spec)

CEFR classification, NILC-Metrix, 4 perfis contextuais (chat/forum/assessment/portfolio).

**Tech:** spaCy, Stanza PT, langdetect, NILC-Metrix, LanguageTool, fine-tuned BERTimbau.

### 3.4 Weber — Documentos + D7 (seu spec)

Documentos academicos + sistema D7 (dossier consolidado de todos agentes).

**Integracao com certificacao do Leo:** Weber usa `GET /certification/my-certificates` e `POST /certification/documents/request` que Leo ja construiu.

### 3.5 Heimdall — Admissao + Onboarding (seu spec)

Pre-enrollment (sales consultivo) + Post-enrollment (onboarding 30 dias). Lead scoring 0-100.

### 3.6 Dewey — Case Studies (seu spec)

CBR flywheel: pesquisa → gera caso → valida → publica → facilita discussao socratica → aprende.

---

## FASE 4: ORCH ADMIN (1-2 semanas)

### 4.1 OrchWidget no CommunicationHub (seu spec `OrchWidget.spec.md`)

Adicionar tab "ORCH" no CommunicationHub existente do Leo:

```
CommunicationHub (Leo)
├── Dock [Chat] [ORCH] [Alertas]
├── HubPanel (conversas — Leo)
├── ChatScreen (DM/turma — Leo)
├── OrchPanel (NOVO — seu spec)
│   ├── OrchHeader
│   ├── OrchMessageList + TypingIndicator
│   ├── OrchSuggestedQuestions
│   └── OrchInputBox
└── NotificationsPanel (Leo)
```

### 4.2 DOM Bridge (seu spec `orch-bridge.spec.md`)

Implementar como projetado: `window.postMessage` no channel `orch-page-guide`.
- SCAN_PAGE, READ_FIELDS, FILL_FIELD, CLEAR_FIELD
- React 19 compat via native setter
- Rate limiting 100 cmds/60s
- Sensitive fields blocked (cpf, password, card)

### 4.3 Knowledge Base RAG (reutilizar infra do Leo)

**Decisao arquitetural: NAO usar Dify.** Reutilizar o pipeline RAG do Leo:
- `EmbeddingService` (OpenAI text-embedding-3-small)
- `TextChunkingService` (1000 chars, 200 overlap)
- pgvector (ja instalado)

Chunk os 14 YAMLs → embed → inserir em `admin_knowledge_embedding` → busca vetorial filtrada por rota.

**Custo estimado:** ~$4.91/mês (como seu CTO guide calculou).

### 4.4 Context por Rota (seu spec + CommandBar pattern)

62 rotas mapeadas no `cogedu-pages-guide.yaml`. Cada rota tem:
- Dominio, capabilities, suggested actions
- Knowledge file relevante
- Campos e workflows associados

### 4.5 Alertas Proativos (seu spec `orch-proactive-alerts.yaml`)

10 alertas em 4 categorias: student (3), class (3), admission (3), system (1).
Max 3 por sessao. Cron daily/weekly. Badge no Dock.

### 4.6 Zodiac Engine (seu spec — feature flag OFF no launch)

12 perfis comportamentais invisiveis. Calculado por birth_date. LGPD-compliant. Feature flag `zodiac_adaptation = false`.

### 4.7 Memoria Persistente (seu spec `orch-memory-schema.yaml`)

30 dias ativo, 1 ano arquivo, 2 anos frio. Context loading em 5 steps no inicio de sessao. FAQ learning automatico.

### 4.8 25 Walkthroughs (seu spec `cogedu-workflows.yaml`)

Todos os workflows documentados, ativados por intent ou action chip.

---

## FASE 5: UX MAGICO (1-2 semanas)

### 5.1 Streaming + Status Hints
Token-by-token via SSE. "Buscando contexto...", "Analisando...", "Respondendo..."

### 5.2 Rich Messages + Action Chips
Text, hints graduais, quizzes, progress bars, code blocks, expandable sections, action chips (2-3 por resposta).

### 5.3 Personalidade do Orch (Pi pattern + seu spec)
Traits fixos: curioso, paciente, direto, bem-humorado, honesto sobre incerteza.
First message: convite, nao lista de features.
Tone-matching: adapta ao registro do aluno.

### 5.4 Sugestoes Proativas no Player
Pausa >30s → "Algo confuso?". Volta 3x → "Quer explorar juntos?". Termina video → "O que achou?"

### 5.5 Lib Frontend
**assistant-ui** (6.9k stars, YC) para chat UI. Streaming, rich messages, composable primitives.

---

## FASE 6: DASHBOARD PROFESSOR — LiveLab (1 semana)

### 6.1 Dashboard Real-Time (Carnegie LiveLab + seu D7)

Quem esta confuso agora, mastery medio, skills criticos, recomendacoes.

### 6.2 D7 Consolidado (seu Weber spec)

Reports semanais de todos agentes → dossier por aluno com metricas, trends, recomendacoes.

### 6.3 APLSE Preditivo (Carnegie pattern)

Predizer resultado final da turma a partir dos dados atuais.

---

## FASE 7: REFINAMENTOS (ongoing)

- [ ] Agentes placeholder: Freud, Janus, Keynes, Vygotsky, Braille
- [ ] Voice mode (Gemini Live API)
- [ ] Expansion packs (STEM, Wellbeing, Career, Accessibility)
- [ ] Blockchain anchoring (certificados)
- [ ] PDF server-side (Puppeteer)
- [ ] Backfill embeddings (videos antigos)

---

## PRIORIDADE DE IMPLEMENTACAO

| Prioridade | Agentes | Justificativa |
|-----------|---------|---------------|
| P0 | Hub + Socrates + Bourdieu | Base: router + tutor + perfil. Sem eles nada funciona |
| P0 | Orch Admin (Widget + RAG) | Impacto imediato pro time interno |
| P1 | Ebbinghaus + Comenius + Sisifo | Engajamento: memoria + recap + gamificacao |
| P1 | Freire + Weber | Jornada academica + documentos + D7 reports |
| P2 | Taylor + Foucault | Analytics + retencao (invisíveis, rodam em background) |
| P2 | Gardner + Wittgenstein | Adaptacao cognitiva + linguistica (invisíveis) |
| P3 | Aristoteles | Pipeline complexo (BERTimbau, plagiarism, AI detection) |
| P3 | Heimdall + Dewey | Admissao + case studies |
| P4 | Freud, Janus, Keynes, Vygotsky, Braille | Placeholders para futuro |

---

## O QUE REUTILIZAMOS DO LEO (ZERO reescrita)

| Componente Leo | Usado por |
|---------------|-----------|
| `GoogleGeminiService` | Hub (intent), Socrates (tutor), Admin (chat), todos |
| `EmbeddingService` | Admin RAG, Socrates RAG, Dewey case search |
| `ComponentRAGService` | Socrates (busca em transcricoes) |
| `TextChunkingService` | Admin knowledge base, Dewey cases |
| `ContentAnalysisService` | Socrates (ai_analysis metadata) |
| `CommunicationHub` (6 files) | Admin (add tab ORCH), Weber (D7 delivery), Foucault (alertas) |
| `ChatContext` + polling | Hub (conversation state) |
| `conversation-event-publisher` | Weber (document events), Heimdall (onboarding events) |
| `content_embedding` table | Socrates RAG |
| `ai_conversation` table | Hub (persistencia) |
| `company_ai_config` table | FinOps quota enforcement |
| `experience_events` table | Taylor (engagement xAPI), FinOps |
| Socket.IO | Real-time notifications, D7 delivery |
| pgvector | Admin RAG, Socrates RAG, Dewey |

---

## METRICAS DE SUCESSO

| Metrica | Hoje | Meta F3 | Meta F6 |
|---------|------|---------|---------|
| Tempo sessao AI (AVA) | ? | 5+ min | 10+ min |
| Retorno diario (tutor) | ? | 30%+ | 50%+ |
| Streak medio | 0 | 3+ dias | 7+ dias |
| Resolucao AI admin | 0% | 50%+ | 70%+ |
| Mastery medio turma | ? | Mensuravel | Crescente |
| Dropout prediction accuracy | 0 | 60%+ | 80%+ |
| Professores usando dashboard | 0 | 50%+ | 80%+ |
| NPS tutor AI | ? | 7+ | 8.5+ |
