# PLANO ORCH EVOLUTION — Da Base do Leo ao Estado da Arte

Data: 2026-03-13
Autor: Squad Cogedu Orchestra (@cogedu-chief)
Status: PROPOSTA PARA APROVACAO DO STEVEN

---

## VISAO GERAL

Transformar o tutor socratico basico do Leo (1 agente, sem memoria, sem quota) e o Communication Hub (chat sem AI) em um **ecossistema educacional AI-first** de nivel mundial, reutilizando 100% da infraestrutura existente.

```
HOJE (Leo)                          FUTURO (Evolution)
─────────────                       ──────────────────
1 tutor generico          →         Multi-agente com 6 especialistas
RAG sem memoria           →         Estado do aprendiz versionado + curva de esquecimento
Chat sem AI (admin)       →         Admin AI contextual com walkthroughs
Sem dashboard professor   →         LiveLab real-time
Sem gamificacao           →         XP, streaks, badges, micro-sessoes
Sem quota                 →         FinOps com enforcement
Client-side only memory   →         Persistencia cross-session + knowledge graph
Mock no AVA frontend      →         Wire-up real + streaming + rich messages
```

---

## FASE 0: CORRECOES CRITICAS (1-2 dias)
> Arrumar o que o Leo deixou quebrado/inseguro ANTES de evoluir

### 0.1 Seguranca
- [ ] Adicionar `requireAuth()` no `adminInterventionAudit` (middlewares = [])
- [ ] Adicionar validacao de permissao no `sendClassMessage` (qualquer user posta em qualquer turma)
- [ ] Verificar registro do `initiateStudentConversation` (path possivelmente ausente)
- [ ] Verificar registro do `searchComponentTranscription` (path export missing)

### 0.2 Limpeza
- [ ] Deletar `FloatingChat.tsx` (dead code, substituido por CommunicationHub)
- [ ] Deletar `AIAssistant.tsx` (mock hardcoded, nunca conectado)
- [ ] Deletar `FloatingAIAssistant.tsx` (mock hardcoded, nunca conectado)
- [ ] Remover console.log spam do `ClassChat.tsx`

### 0.3 Wire-up AVA
- [ ] Conectar `CertificatesPage` ao backend real (trocar MOCK por `GET /certification/my-certificates`)
- [ ] Conectar `DocumentsPage` ao backend real (trocar setTimeout por `POST /certification/documents/request`)
- [ ] Importar e usar `CertificationAPI` que ja existe em `lib/certificates/api.ts`

### 0.4 Permissoes
- [ ] Migrar endpoints de `edu.component.*` para `edu.certificate.*` (permissoes ja existem no seed)

**Entregavel:** Plataforma segura, limpa, certificacao conectada.

---

## FASE 1: ORCH AVA — TUTOR SOCRATICO EVOLUIDO (1-2 semanas)
> Evolucao incremental do pipeline do Leo, sem reescrever

### 1.1 Persistencia de Conversas (tabelas JA EXISTEM)
**Problema:** Historico eh client-side only. Refresh = perde tudo.
**Solucao:** As tabelas `ai_conversation` e `ai_conversation_message` JA existem (Leo criou mas nunca usou).

```
ANTES: AIChatTab → TutorClient → generateTutorResponse (sem persistir)
DEPOIS: AIChatTab → TutorClient → generateTutorResponse → GRAVA em ai_conversation + ai_conversation_message
                                                         → CARREGA historico ao abrir tab
```

**Mudancas:**
- `generateTutorResponse.ts`: apos resposta, inserir em `ai_conversation_message`
- `AIChatTab.tsx`: ao montar, carregar historico da `ai_conversation` do aluno/unidade
- Novo endpoint: `GET /tutor/conversations/:unitId` (historico por unidade)

**Fonte research:** IntelliCode (estado versionado), Memoria framework (knowledge graph)

### 1.2 Quota Enforcement (funcoes JA EXISTEM)
**Problema:** `check_company_ai_quota()` existe no banco mas endpoint nunca chama. Uso ilimitado.
**Solucao:** Adicionar check ANTES de chamar Gemini.

```typescript
// generateTutorResponse.ts — adicionar no inicio
const quotaCheck = await pool.query('SELECT check_company_ai_quota($1, $2)', [companyId, estimatedTokens]);
if (!quotaCheck.rows[0].allowed) {
  return res.status(429).json({ error: 'AI quota exceeded', remaining: quotaCheck.rows[0].remaining });
}
```

**Mudancas:**
- `generateTutorResponse.ts`: adicionar quota check pre-call
- `AIChatTab.tsx`: tratar erro 429 com mensagem amigavel
- Dashboard admin: mostrar uso AI por turma/aluno (endpoints FinOps ja existem)

### 1.3 Backfill de Embeddings
**Problema:** So videos salvos APOS a migration tem embeddings. Videos antigos = tutor sem contexto.
**Solucao:** Script de backfill que processa todos componentes video existentes.

```bash
# Script: backfill-embeddings.ts
# Para cada componente video com transcricao e SEM embeddings:
# 1. Buscar transcricao do SmartPlayer
# 2. contentAnalysisService.analyzeTranscription()
# 3. textChunkingService.splitText()
# 4. embeddingService.generateEmbeddings()
# 5. Inserir em content_embedding
```

### 1.4 Streaming de Respostas
**Problema:** Resposta aparece toda de uma vez (apos Gemini terminar).
**Solucao:** Usar streaming do Vercel AI SDK (ja instalado no projeto).

```
ANTES: POST /generateTutorResponse → aguarda resposta completa → retorna JSON
DEPOIS: POST /generateTutorResponse → stream tokens via SSE → frontend renderiza token-by-token
```

**Mudancas:**
- `generateTutorResponse.ts`: usar `streamText()` do `@ai-sdk/google` em vez de `generateResponse()`
- `AIChatTab.tsx`: usar `useChat()` do `ai/react` ou implementar SSE reader
- Adicionar status hints: "Buscando contexto...", "Pensando...", "Respondendo..."

**Fonte research:** Pi (streaming com personalidade), Claude (status hints)

### 1.5 Veto Socratico Reforçado
**Problema:** O prompt socratico atual eh basico — nao tem graduated hints nem anti-sicofancia.
**Solucao:** Evoluir `generateSocraticPrompt()` com patterns do Khanmigo + HPO.

```
PROMPT EVOLUTION:
1. NUNCA dar resposta direta (Khanmigo veto)
2. Graduated hints (5 niveis):
   L1: Direcao estrategica ("Pense sobre o conceito de X...")
   L2: Sub-goal ("Primeiro, tente identificar Y...")
   L3: Exemplo similar ("Em um caso parecido, Z funciona assim...")
   L4: Exemplo deste problema ("Neste caso especifico...")
   L5: Resposta direta (SOMENTE apos 4 tentativas falhas)
3. Anti-sicofancia: se aluno diz algo errado, NAO validar
4. Tone-matching: adaptar formalidade ao registro do aluno
5. Peer framing: "Vamos descobrir juntos" em vez de "Eu vou te ensinar"
```

**Fonte research:** Khanmigo (veto), HPO (anti-sicofancia), Copa/EDF (peer framing), Carnegie (graduated hints)

**Entregavel Fase 1:** Tutor com memoria, quota, embeddings completos, streaming, hints graduais.

---

## FASE 2: ORCH ADMIN — AI CONTEXTUAL (1-2 semanas)
> Transformar o Communication Hub em assistente AI do funcionario

### 2.1 Arquitetura Admin AI

O CommunicationHub do Leo ja tem a infraestrutura perfeita: Dock com abas + HubPanel + ChatScreen.
A evolucao eh adicionar uma **terceira aba: ORCH** (alem de Chat e Alertas).

```
HOJE:                              DEPOIS:
┌─────────────────┐                ┌─────────────────┐
│  Dock            │                │  Dock            │
│  [Chat] [Alertas]│                │  [Chat] [ORCH] [Alertas] │
└─────────────────┘                └─────────────────┘
                                         │
                                   ┌─────▼─────┐
                                   │ OrchPanel  │
                                   │            │
                                   │ Context:   │
                                   │ /courses   │
                                   │            │
                                   │ "Como      │
                                   │  criar uma │
                                   │  oferta?"  │
                                   │            │
                                   │ [Action chips] │
                                   └───────────┘
```

### 2.2 Context por Rota (CommandBar pattern)

```typescript
// OrchAdminContext.tsx
const ROUTE_CONTEXT_MAP: Record<string, RouteContext> = {
  '/admission': {
    domain: 'Admissao',
    capabilities: ['criar oferta', 'gerenciar candidatos', 'processos seletivos'],
    knowledgeFile: 'cogedu-admission-fields.yaml',
    suggestedActions: ['Como criar uma nova oferta?', 'Como aprovar candidatos?']
  },
  '/educational': {
    domain: 'Educacional',
    capabilities: ['colecoes', 'trilhas', 'series', 'builder'],
    knowledgeFile: 'cogedu-educational-fields.yaml',
    suggestedActions: ['Como criar uma trilha?', 'Como configurar series?']
  },
  '/exams': {
    domain: 'Avaliacoes',
    capabilities: ['banco de questoes', 'avaliacoes', 'rubricas'],
    knowledgeFile: 'cogedu-exams-fields.yaml',
    suggestedActions: ['Como criar uma avaliacao?', 'Como corrigir provas?']
  },
  // ... todas as rotas
};

// Hook que detecta rota atual
function useOrchContext() {
  const location = useLocation();
  const context = ROUTE_CONTEXT_MAP[location.pathname] || DEFAULT_CONTEXT;
  return { context, suggestedActions: context.suggestedActions };
}
```

**Fonte research:** CommandBar (route-aware), Cursor (.cursor/rules/), HubSpot Breeze (record-aware)

### 2.3 Knowledge Base RAG (reutilizar infra do Leo)

O Leo ja construiu TODO o pipeline RAG:
- `EmbeddingService` (OpenAI text-embedding-3-small)
- `ComponentRAGService` (busca vetorial)
- `TextChunkingService` (chunking)
- pgvector (extensao ja instalada)

**Reutilizar para Admin AI:**
1. Pegar os 14 YAMLs do archive (`knowledge-base/*.yaml` — 604KB de conhecimento)
2. Chunk + embed + inserir em nova tabela `admin_knowledge_embedding`
3. Endpoint: `POST /orch-admin/chat` usa RAG sobre admin knowledge

```
Pipeline Admin AI:
1. Detectar rota atual → filtrar knowledge base relevante
2. Embedding da pergunta do usuario
3. Busca vetorial nos chunks da rota
4. System prompt com contexto da pagina + chunks relevantes
5. Gemini gera resposta
6. Streaming para o frontend
```

### 2.4 Deteccao de "Usuario Travado" (WalkMe/CommandBar pattern)

```typescript
// useStuckDetection.ts
function useStuckDetection() {
  const [stuckTimer, setStuckTimer] = useState<NodeJS.Timeout | null>(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    // Se usuario fica 30s em formulario sem submeter
    const timer = setTimeout(() => {
      setShowHint(true);
      // Mostrar sugestao proativa no OrchPanel
    }, 30000);

    const resetOnAction = () => {
      clearTimeout(timer);
      setShowHint(false);
    };

    document.addEventListener('click', resetOnAction);
    document.addEventListener('keydown', resetOnAction);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', resetOnAction);
      document.removeEventListener('keydown', resetOnAction);
    };
  }, [location.pathname]);

  return { showHint };
}
```

### 2.5 Action Chips + Suggested Actions

Apos cada resposta do Orch Admin, mostrar 2-3 chips clicaveis:

```typescript
// Exemplo de resposta com actions
{
  message: "Para criar uma nova oferta, va em Admissao > Ofertas > Nova Oferta...",
  actions: [
    { label: "Me guie passo a passo", type: "walkthrough", target: "/admission/offers/new" },
    { label: "Quais campos sao obrigatorios?", type: "question" },
    { label: "Ver ofertas existentes", type: "navigate", target: "/admission/offers" }
  ]
}
```

**Fonte research:** ShapeOf.ai (action chips reduzem friccao 40-60%)

### 2.6 Walkthroughs Guiados (WalkMe/Whatfix pattern)

Para tarefas complexas, Orch Admin guia o funcionario passo a passo:

```typescript
// walkthrough-engine.ts
const WALKTHROUGHS = {
  'criar-oferta': {
    steps: [
      { target: '#nav-admission', action: 'click', hint: 'Clique em Admissao' },
      { target: '#btn-new-offer', action: 'click', hint: 'Clique em Nova Oferta' },
      { target: '#field-name', action: 'fill', hint: 'Digite o nome da oferta' },
      { target: '#field-course', action: 'select', hint: 'Selecione o curso' },
      // ...
    ]
  },
  'matricular-aluno': { /* ... */ },
  'criar-avaliacao': { /* ... */ },
};
```

**Fonte research:** WalkMe (AutoWalk), Whatfix (SmartTips), Intercom Fin (Procedures)

**Entregavel Fase 2:** Admin AI contextual com RAG, deteccao de travado, walkthroughs, action chips.

---

## FASE 3: MULTI-AGENTE AVA (2-3 semanas)
> Evoluir de 1 tutor para ecossistema multi-agente

### 3.1 Arquitetura Multi-Agente

```
                    ┌──────────────────┐
                    │   Hub (Router)    │ ← Detecta intencao e roteia
                    └──────┬───────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
   │ Socrates   │    │ Ebbinghaus│    │ Foucault  │
   │ (Tutor)    │    │ (Review)  │    │ (Assess)  │
   │            │    │           │    │           │
   │ Socratic   │    │ Spaced    │    │ Self-eval │
   │ dialogue   │    │ repetition│    │ + metacog │
   └────────────┘    └───────────┘    └───────────┘

         ┌─────────────────┼─────────────────┐
         │                 │                 │
   ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
   │ Gardner   │    │ Comenius  │    │ Weber     │
   │ (Style)   │    │ (Recap)   │    │ (Reports) │
   │           │    │           │    │           │
   │ Learning  │    │ Daily     │    │ D7 weekly │
   │ style     │    │ check     │    │ digest    │
   │ detection │    │ Duolingo  │    │ professor │
   └───────────┘    └───────────┘    └───────────┘
```

### 3.2 Estado do Aprendiz Versionado (IntelliCode pattern)

```typescript
// learner-state.ts
interface LearnerState {
  version: number;
  studentId: string;
  unitId: string;

  // Mastery tracking
  skills: Record<string, {
    level: number;           // 0-100
    lastPracticed: Date;
    halfLife: number;        // dias ate decair 50%
    currentEstimate: number; // apos aplicar decaimento
    misconceptions: string[];
  }>;

  // Engagement
  engagement: {
    frustrationLevel: number;  // 0-10
    timeOnTask: number;        // segundos
    hintRequests: number;
    consecutiveErrors: number;
  };

  // Learning style (Felder-Silverman)
  style: {
    activeReflective: number;    // -1 (active) to +1 (reflective)
    sensingIntuitive: number;
    visualVerbal: number;
    sequentialGlobal: number;
    confidence: number;          // quao confiante estamos no perfil
  };

  // History
  updatedAt: Date;
  updatedBy: string;  // qual agente atualizou (single-writer)
}
```

**Tabela:** `learner_state` (nova) — JSON versionado por aluno/unidade
**SQL function:** `update_learner_state(student_id, unit_id, agent_id, patch)` — single-writer com log

**Fonte research:** IntelliCode (versioned state, single-writer), TASA (forgetting curves), PACE (Felder-Silverman)

### 3.3 Hub Router (intencao → agente)

```typescript
// hub-router.ts
async function routeToAgent(message: string, state: LearnerState): Promise<AgentId> {
  // Regras de roteamento por intencao
  if (isReviewRequest(message) || state.skills.some(s => s.currentEstimate < 0.5)) {
    return 'ebbinghaus'; // Spaced repetition
  }
  if (isAssessmentRequest(message) || isMetacognitiveQuery(message)) {
    return 'foucault'; // Self-evaluation
  }
  if (isDailyRecap(message)) {
    return 'comenius'; // Daily check
  }
  if (state.style.confidence < 0.5) {
    return 'gardner'; // Ainda detectando estilo
  }
  return 'socrates'; // Default: tutor socratico
}
```

### 3.4 Agente Ebbinghaus — Spaced Repetition

```
Trigger: Curva de esquecimento detecta skill decaindo abaixo de threshold
Acao: Push proativo "Faz 5 dias que voce nao pratica X. Quiz rapido de 3 min?"
Algoritmo: SM-2 modificado (SuperMemo) com ajuste por engagement
Integracao: Atualiza learner_state.skills[x].lastPracticed e halfLife
```

**Fonte research:** TASA (forgetting curves), Duolingo (spaced repetition), Ebbinghaus original

### 3.5 Agente Comenius — Daily Recap (Duolingo-style)

```
Trigger: Primeiro acesso do dia OU apos completar unidade
Formato: 3-5 perguntas rapidas sobre conteudo recente
UX: Cards com opcoes clicaveis (nao digitacao), feedback imediato
Gamificacao: +XP por acerto, streak por dias consecutivos
Integracao: Atualiza learner_state com resultados
```

### 3.6 Agente Foucault — Self-Evaluation + Metacognicao

```
Trigger: Apos completar topico OU quando solicitado
Acao:
  1. "Antes de ver a resposta, quao confiante voce esta? (1-5)"
  2. Revela resposta
  3. "Sua confianca bateu com o resultado?"
  4. Calibration score → ajusta learner_state
Fonte: Google LearnLM (metacognicao), Carnegie Learning (confidence calibration)
```

### 3.7 Agente Gardner — Learning Style Detection

```
Deteccao implicita (primeiras 10 interacoes):
- Aluno pede exemplos? → Sensing
- Aluno pede teoria? → Intuitive
- Aluno pede diagramas? → Visual
- Aluno prefere texto? → Verbal
- Aluno quer overview? → Global
- Aluno quer passo-a-passo? → Sequential

Apos deteccao: adapta FORMA de todas as respostas dos outros agentes
Fonte: PACE (Felder-Silverman)
```

### 3.8 Agente Weber — D7 Reports (Professor)

```
Trigger: Cron semanal (domingo noite)
Output: Relatorio consolidado por turma
Conteudo:
  - Alunos com mais dificuldade (top 5 por frustracao)
  - Skills com maior decaimento coletivo
  - Alunos que nao acessaram ha N dias
  - Insights de estilo de aprendizagem da turma
  - Recomendacoes de intervencao

Entrega: Notificacao no CommunicationHub do professor + email
Fonte: Carnegie Learning (LiveLab, APLSE)
```

**Entregavel Fase 3:** 6 agentes especializados, estado do aprendiz versionado, spaced repetition, daily recap, reports.

---

## FASE 4: UX MAGICO (1-2 semanas)
> Transformar a experiencia de "funcional" para "magica"

### 4.1 Rich Messages

```typescript
// message-types.ts
type OrchMessage =
  | { type: 'text'; content: string }
  | { type: 'hint'; level: 1|2|3|4|5; content: string }
  | { type: 'quiz'; question: string; options: string[]; correct: number }
  | { type: 'progress'; skill: string; before: number; after: number }
  | { type: 'action-chips'; chips: { label: string; action: string }[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'expandable'; title: string; content: string }
  | { type: 'confidence-check'; question: string; scale: [1,5] }
  | { type: 'walkthrough-step'; step: number; total: number; instruction: string }
  | { type: 'streak'; days: number; xp: number; badge?: string };
```

### 4.2 Personalidade Consistente

```yaml
# socrates-persona.yaml
name: Socrates
traits:
  - Curioso genuinamente (nunca finge interesse)
  - Paciente infinitamente (nunca apresse)
  - Direto sem ser frio (nao enrola)
  - Bem-humorado com timing (humor natural, nunca forcado)
  - Honesto sobre incerteza ("Nao tenho certeza, mas vamos investigar juntos")

never:
  - Dar resposta direta antes do nivel 5 de hint
  - Validar resposta errada por educacao (anti-sicofancia)
  - Usar emojis excessivos
  - Falar como assistente ("Como posso ajuda-lo?")
  - Mudar de personalidade entre sessoes

always:
  - Abrir com pergunta, nao com afirmacao
  - Usar "vamos" em vez de "voce deve"
  - Reconhecer esforco antes de corrigir
  - Adaptar formalidade ao registro do aluno

first_message: "E ai! Vi que voce ta estudando {tema}. O que mais chamou sua atencao ate agora?"
```

**Fonte research:** Pi (tone treinado por especialistas), Character.AI (consistencia), Copa/EDF (peer framing)

### 4.3 Gamificacao Base

```
Sistema XP:
- Responder quiz do Comenius: +10 XP
- Completar sessao de tutoria: +5 XP
- Streak diario: +15 XP (multiplicador por dias consecutivos)
- Confidence calibration certeira: +20 XP
- Revisao proativa (Ebbinghaus): +10 XP

Badges:
- "Perguntador Insaciavel" (50 perguntas ao tutor)
- "Memoria de Elefante" (10 revisoes espacadas sem erro)
- "Metacognitivo" (calibracao de confianca > 80% accuracy)
- "Maratonista" (7 dias consecutivos de streak)

Tabela: `student_gamification` (student_id, xp, streak_days, streak_last_date, badges JSONB)
```

### 4.4 Primeira Mensagem Perfeita

```
RUIM: "Ola! Eu sou seu assistente de IA. Posso ajudar com duvidas sobre o conteudo..."
BOM: "E ai! Vi que voce ta na aula sobre {tema}. Algo que voce achou confuso ou quer explorar mais?"

RUIM (admin): "Bem-vindo ao Orch Admin! Posso ajudar com navegacao, formularios e duvidas..."
BOM (admin): "Voce ta na pagina de {Admissao}. Quer criar uma oferta, gerenciar candidatos, ou outra coisa?"
```

### 4.5 Sugestoes Proativas no Player

```
Triggers no AIChatTab:
- Aluno pausa video por >30s → "Algo ficou confuso nessa parte?"
- Aluno volta video 3x no mesmo trecho → "Parece que esse trecho eh importante. Quer que a gente explore juntos?"
- Aluno termina video sem interagir → "O que voce achou mais interessante?"
- Aluno nao acessa ha 3 dias → push notification "Faz 3 dias! Quiz rapido de 2 min sobre {ultimo topico}?"
```

**Fonte research:** CommandBar (proactive nudges), Duolingo (engagement loops)

**Entregavel Fase 4:** Rich messages, personalidade consistente, gamificacao, sugestoes proativas.

---

## FASE 5: DASHBOARD PROFESSOR (1 semana)
> LiveLab inspirado no Carnegie Learning

### 5.1 Dashboard Real-Time

```
┌─────────────────────────────────────────────────────────┐
│  LiveLab — Turma: Audiovisual 2026.1                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔴 Precisam de Atencao (3)         📊 Turma Overview   │
│  ┌──────────────────────────┐       ┌───────────────┐  │
│  │ Ana Silva — travada em   │       │ Mastery medio │  │
│  │ "Iluminacao 3 pontos"    │       │ ████████░░ 78%│  │
│  │ ha 12 min. 3 hints.      │       │               │  │
│  │                          │       │ Engagement    │  │
│  │ Pedro Santos — frustrado │       │ ███████░░░ 65%│  │
│  │ Nivel 7/10. 5 erros      │       │               │  │
│  │ consecutivos em "Codec"  │       │ Streak medio  │  │
│  │                          │       │ 4.2 dias      │  │
│  │ Maria Oliveira — inativa │       └───────────────┘  │
│  │ ha 5 dias. Ultimo acesso │                          │
│  │ 2026-03-08               │       📈 Skills Criticos │
│  └──────────────────────────┘       ┌───────────────┐  │
│                                     │ Codec H.264 ▼ │  │
│  💡 Recomendacoes                   │ 3-point light▼│  │
│  "3 alunos travados em Codec —      │ Color grade ▲ │  │
│   considere revisao em grupo"       └───────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Endpoints do Dashboard

```
GET /tutor/dashboard/turma/:classInstanceId
  → { students: StudentSummary[], classMetrics: ClassMetrics, alerts: Alert[] }

GET /tutor/dashboard/student/:studentId
  → { learnerState: LearnerState, conversations: ConversationSummary[], skillGraph: SkillNode[] }

GET /tutor/dashboard/reports/weekly/:classInstanceId
  → { d7Report: D7Report } (gerado pelo Weber)
```

### 5.3 Alertas Proativos para Professor

```
Via CommunicationHub (ja existe!):
- Notificacao quando aluno atinge frustration > 7
- Notificacao quando 3+ alunos travam no mesmo conceito
- Notificacao semanal com D7 report
- Notificacao quando aluno nao acessa ha 5+ dias
```

**Fonte research:** Carnegie Learning (LiveLab, APLSE), Squirrel AI (alertas real-time)

**Entregavel Fase 5:** Dashboard professor, alertas proativos, D7 reports.

---

## FASE 6: REFINAMENTOS (ongoing)
> Nice-to-have que elevam ainda mais

### 6.1 Voice Mode (futuro)
- Integrar Gemini Live API para conversas por voz
- Barge-in, <500ms latencia, prosody alinhada com persona

### 6.2 Criticos Adversariais (HPO pattern)
- Shadow agent que revisa CADA resposta do Socrates
- Um critico "ajude mais" + um critico "deixe lutar"
- Moderador escolhe melhor resposta
- Custo: 3x tokens por resposta (usar apenas em momentos criticos)

### 6.3 Expansion Packs
- STEM (Newton, Euler, Turing) — tutores especializados por disciplina
- Wellbeing (Aurora) — detector de estresse, sugestoes de pausa
- Career (Atlas) — orientacao profissional baseada em performance

### 6.4 Blockchain Anchoring (certificados)
- Coluna `blockchain_tx` ja existe na tabela `certificate`
- Integrar OpenTimestamps para prova de existencia

### 6.5 PDF Server-Side (certificados)
- Puppeteer no backend gerando PDF do template JSONB
- Cache no S3 (coluna `pdf_url` ja existe)

---

## STACK TECNICO

### Reutilizado do Leo (ZERO reescrita)
| Componente | Status | Uso |
|-----------|--------|-----|
| `GoogleGeminiService` | Funcionando | Tutor + Admin AI |
| `EmbeddingService` | Funcionando | RAG tutor + RAG admin |
| `ComponentRAGService` | Funcionando | Busca vetorial |
| `TextChunkingService` | Funcionando | Chunking |
| `ContentAnalysisService` | Funcionando | Analise de transcricoes |
| `CommunicationHub` | Funcionando | Chat + ORCH tab |
| `ChatContext` | Funcionando | State management |
| `conversation-event-publisher` | Funcionando | RabbitMQ events |
| pgvector | Instalado | Vector search |
| Socket.IO | Funcionando | Real-time |
| `content_embedding` | Populado | RAG store |
| `ai_conversation` | Criada (vazia) | Persistencia |
| `company_ai_config` | Criada | Quotas |
| `experience_events` | Populado | FinOps logging |

### Novo (a criar)
| Componente | Fase | Descricao |
|-----------|------|-----------|
| `learner_state` | F3 | Estado versionado do aluno |
| `admin_knowledge_embedding` | F2 | RAG admin knowledge |
| `student_gamification` | F4 | XP, streaks, badges |
| Hub Router | F3 | Roteamento multi-agente |
| Ebbinghaus Engine | F3 | Spaced repetition SM-2 |
| OrchPanel component | F2 | UI do admin AI |
| LiveLab Dashboard | F5 | Dashboard professor |

### Libs a adicionar
| Lib | Para que |
|-----|---------|
| `assistant-ui` | Chat UI (streaming, rich messages, action chips) |
| Vercel AI SDK (ja existe) | `useChat`, streaming, SSE |

---

## TIMELINE

| Fase | Escopo | Duracao | Dependencia |
|------|--------|---------|-------------|
| F0 | Correcoes criticas | 1-2 dias | Nenhuma |
| F1 | Tutor evoluido | 1-2 semanas | F0 |
| F2 | Admin AI contextual | 1-2 semanas | F0 |
| F3 | Multi-agente | 2-3 semanas | F1 |
| F4 | UX magico | 1-2 semanas | F1 + F2 |
| F5 | Dashboard professor | 1 semana | F3 |
| F6 | Refinamentos | Ongoing | F4 + F5 |

**F1 e F2 podem rodar em paralelo** (tutor e admin sao independentes).
**F4 pode comecar junto com F3** (UX e independente de multi-agente para features basicas).

---

## METRICAS DE SUCESSO

| Metrica | Hoje | Meta |
|---------|------|------|
| Tempo medio de sessao AI (AVA) | ? (sem tracking) | 8+ min |
| Retorno diario (alunos usando tutor) | ? | 40%+ |
| Resolucao AI admin (sem escalar humano) | 0% (nao existe) | 60%+ |
| Mastery medio da turma | ? (sem tracking) | Mensuravel |
| Streak medio dos alunos | 0 (nao existe) | 5+ dias |
| NPS do tutor AI | ? | 8+ |
| Professores usando dashboard | 0 | 70%+ |
