# Deep Research: ORCH State of the Art — Tutor AI + Admin AI

Data: 2026-03-13
Autor: Squad Cogedu Orchestra (@cogedu-chief)

---

## Parte 1: AI Tutoring — Estado da Arte (ORCH AVA)

### 1. Khanmigo (Khan Academy)
- Single LLM (GPT-4) multi-persona (tutor, writing coach, figura historica, career counselor)
- **Veto Socratico:** PROIBIDO dar respostas diretas. Guia aluno a descobrir
- Integrado no grafo de conteudo (sabe qual video assistiu, qual exercicio errou)
- Tutoria inline dentro dos exercicios
- Ferramentas pro professor: plano de aula (1h→15min), rubricas, quizzes, agrupamento por performance

### 2. Duolingo Max
- GPT-4 sobre engine gamificado existente
- **Roleplay:** conversas livres em cenarios realistas, transcricao com correcoes depois
- **Explain My Answer:** explicacao gramatical personalizada por resposta
- Remove medo de errar, streaks/XP, licoes 3-5min, audio-first

### 3. Synthesis Tutor
- Hibrido LLM + micro-avaliacoes por neurocientistas
- Bloqueia progressao ate dominio DEMONSTRADO
- Text-to-speech, resumos semanais para pais

### 4. Squirrel AI
- LAM treinado em 24M alunos, 10B comportamentos
- Decomposicao nano de conhecimento (dezenas de milhares de objetivos granulares)
- Precisao 78%→93%. MCM System para metacognicao

### 5. Carnegie Learning (MATHia)
- ITS classico (ACT-R/CMU) + ML. Responde a CADA acao (keystrokes, tempo, hints, erros)
- **APLSE:** prediz resultado final da prova
- **LiveLab:** dashboard real-time (quem esta confuso AGORA)
- RCT 18.000+ alunos: "nearly doubled growth"

### 6. Google LearnLM
- Fine-tuned Gemini para educacao
- 5 capacidades: Active Learning, Gestao de Carga Cognitiva, Adaptacao, Curiosidade, Metacognicao

### 7. Open-Source (GitHub)
- **Mr. Ranedeer** (29.7k stars) — prompt engineering, personalizacao radical
- **DeepTutor** (10.7k stars) — multi-agente, RAG hibrido, knowledge graph
- **llamatutor** (2k stars) — Llama 3.1 70B, web search, self-hostable

---

## Parte 2: Papers Academicos (2025-2026)

### IntelliCode (arXiv:2512.18669)
Estado do aprendiz versionado centralizado. 6 agentes especializados, single-writer policy. Mastery + misconceptions + spaced repetition + engagement.

### TASA (arXiv:2511.15163)
Modelo de 3 camadas: persona + memoria + curva de esquecimento. Questoes na dificuldade exata do estado ATUAL (apos decaimento).

### GraphMASAL (arXiv:2511.11035)
3 agentes (Diagnostician, Planner, Tutor) + Knowledge Graph + Neural IR. Caminho otimo entre estado atual e objetivo.

### HPO (arXiv:2512.22496)
Debate adversarial entre criticos pedagogicos. Modelo 8B supera GPT-4o (F1 0.845 vs 0.812) com 20x menos parametros.

### PACE (arXiv:2502.12633)
Felder-Silverman (4 dimensoes) adaptando FORMA do dialogo socratico ao perfil do aluno.

### Tutor CoPilot (arXiv:2410.03017)
AI sussurra no ouvido do tutor humano. RCT: 4pp melhoria geral, 9pp para tutores fracos. $20/tutor/ano.

### Copa/EDF (arXiv:2602.01415)
3 loops: Evidence → Decision → Feedback. Persona de "peer colaborativo".

---

## Parte 3: Admin AI — Estado da Arte (ORCH Admin)

### Intercom Fin
Pipeline 6 camadas. 65% resolucao AI. Procedures = workflows guiados conversacionais. Handoff com warm summary.

### Zendesk AI
Intelligent Triage automatico (classifica intent + sentiment antes de humano tocar). Suggested Reply inline.

### Notion AI
Contexto estrutural (workspace = memoria). Autofill proativo. Custom Agents 24/7.

### Salesforce Agentforce
Atlas Reasoning Engine. Agentes autonomos 24/7. Agent Builder com linguagem natural. Observabilidade total.

### CommandBar / Command.AI
SDK in-app. Deteccao de "usuario travado" (30s sem acao). Command palette Cmd+K. Nudges comportamentais. Walkthroughs.

### WalkMe / Whatfix
Contexto DOM-based. SmartTips em campos. AutoWalk proativo. Form automation. Analytics fortes (funis por campo, ROI).

### Cursor
`.cursor/rules/` como memoria persistente. Tab autocomplete proativo. Slider de autonomia.

---

## Parte 4: UX Magico — Conversacional Fluido

### O Padrao Pi (Inflection AI)
Voz treinada por terapeutas/dramaturgos/comediantes. Ausencia intencional de features produtivas. Analise emocional em cada mensagem. Quente, sem pressa, genuinamente curiosa.

### Character.AI
75 min/dia media (ChatGPT = 7 min). Recompensa variavel. Playground social. 65% Gen Z reporta conexao emocional.

### Streaming + Typing Indicators
Maior impacto com menor esforco. Status hints ("Pensando...", "Buscando..."). Animacao de cursor com fisica.

### Rich Messages
Code blocks, action buttons, progress bars, inline citations, expandable sections, interactive charts, form components.

### Generative UI
AI renderiza componentes interativos, nao texto. Static / Declarative / Open-ended GenUI. Artifacts do Claude.ai como referencia.

### Engajamento Proativo
Wayfinders, action chips (2-3 apos resposta, -40-60% friccao), sugestoes ambientais, smart defaults que aprendem.

### Personalidade
6 dimensoes: objetivo, personificacao, poder, traits (3-5 fixos), range de tom, comportamentos chave. Consistencia > perfeicao.

### Memoria Cross-Session
Weighted knowledge graph. Controles obrigatorios: viewer, edit/delete, opt-out, clareza de privacidade.

### Voz (2025-2026)
Barge-in obrigatorio. Silencio 0.5-1s antes de responder. Prosody = personalidade. Multimodal continuity.

---

## Parte 5: Libs Frontend Recomendadas

| Lib | Stars | O que faz |
|-----|-------|-----------|
| **assistant-ui** | 6.9k (YC) | React chat UI completa, streaming, Radix-style |
| **Vercel AI SDK** | 20M+ dl/mes | useChat, useCompletion, streamUI, AI Elements |
| **CopilotKit** | open-source | Frontend for agents, Generative UI, human-in-the-loop |
| **chatscope** | — | Typing indicators, message bubbles |
| **ShapeOf.ai** | — | Pattern library para AI UX |

---

## Parte 6: Top Patterns para Implementar

### ORCH AVA — Top 10

| # | Pattern | Fonte | Impacto |
|---|---------|-------|---------|
| 1 | Socratic Veto | Khanmigo, HPO | Alto |
| 2 | Estado do aprendiz versionado | IntelliCode | Alto |
| 3 | Curva de esquecimento + revisao proativa | TASA, Duolingo | Alto |
| 4 | Multi-agente especializado | IntelliCode, GraphMASAL | Alto |
| 5 | Hints graduais (5 niveis) | Carnegie, Khanmigo | Medio |
| 6 | Dashboard professor real-time | Carnegie LiveLab | Alto |
| 7 | Persona de colega | Copa/EDF | Medio |
| 8 | Criticos adversariais | HPO | Medio |
| 9 | Adaptacao Felder-Silverman | PACE | Medio |
| 10 | Micro-sessoes + gamificacao | Duolingo | Alto |

### ORCH Admin — Top 10

| # | Pattern | Fonte | Impacto |
|---|---------|-------|---------|
| 1 | Context por rota | CommandBar, Cursor | Alto |
| 2 | Record-aware sidebar | HubSpot, Salesforce | Alto |
| 3 | Deteccao de "travou" | CommandBar, WalkMe | Alto |
| 4 | Command palette (Ctrl+K) | CommandBar, Linear | Alto |
| 5 | Walkthroughs guiados | WalkMe, Whatfix, Fin | Alto |
| 6 | Diff antes de acoes bulk | Cursor | Medio |
| 7 | Cards proativos de anomalias | Salesforce | Medio |
| 8 | SmartTips em campos | WalkMe, Whatfix | Medio |
| 9 | Agentes background | Salesforce, Notion | Medio |
| 10 | 3 camadas: Ambient/Conversacional/Guiado | Cross-platform | Alto |

### UX Magico — Top 10

| # | Pattern | Fonte | Impacto |
|---|---------|-------|---------|
| 1 | Streaming + status hints | Claude, ChatGPT | Alto |
| 2 | Action chips apos resposta | ShapeOf.ai | Alto |
| 3 | Memoria cross-session | Perplexity, Replika | Alto |
| 4 | Personalidade consistente | Pi, Character.AI | Alto |
| 5 | Primeira mensagem = convite | Pi | Medio |
| 6 | Rich messages | Claude, GPT | Alto |
| 7 | Tone-matching | Pi | Medio |
| 8 | Generative UI | Vercel, CopilotKit | Alto |
| 9 | Onboarding conversacional | Top AI tools | Medio |
| 10 | Voice com barge-in <500ms | Gemini Live | Medio |

---

## Fontes Academicas

- IntelliCode — arXiv:2512.18669
- TASA — arXiv:2511.15163
- GraphMASAL — arXiv:2511.11035
- HPO — arXiv:2512.22496
- MALPP — arXiv:2601.17346
- PACE — arXiv:2502.12633
- Tutor CoPilot — arXiv:2410.03017
- Copa/EDF — arXiv:2602.01415
- MedTutor-R1 — arXiv:2512.05671
- DPO Tutoring — arXiv:2503.06424
