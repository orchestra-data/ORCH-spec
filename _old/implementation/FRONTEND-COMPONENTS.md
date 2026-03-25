# ORCH Frontend Components — Guia de Implementacao

> Para Giuseppe e equipe de frontend.
> Todos os componentes seguem o padrao visual do `OrchChat.tsx` existente.

## Convencoes Gerais

- **Estilizacao:** Tailwind CSS (consistente com OrchChat.tsx existente)
- **State management:** `useState` local (sem Zustand para componentes de chat)
- **API calls:** via `apiFetch` (wrapper existente no monorepo)
- **Icones:** `lucide-react`
- **Base path:** `client/src/components/orch/`

## Dependencias NPM Novas

| Pacote | Tamanho | Uso |
|--------|---------|-----|
| `driver.js` | ~4KB | Walkthroughs guiados (EPIC-04) |
| `canvas-confetti` | ~4KB | Confetti ao completar recap (EPIC-02) |

Nenhuma outra dependencia nova necessaria.

---

## EPIC-02 — AVA Intelligence

### 1. DailyRecapWidget.tsx

- **Path:** `client/src/components/orch/recap/DailyRecapWidget.tsx`
- **Epic:** EPIC-02
- **Descricao:** Card no dashboard do aluno mostrando status do recap diario + botao para iniciar.

```typescript
interface DailyRecapWidgetProps {
  studentId: string;
}
```

- **Estilo:** Card com borda arredondada, icone de calendario (lucide `CalendarCheck`), badge de status (pendente/completo/nao disponivel). Botao primario "Iniciar Recap".
- **State:** `useState` para status do recap (loading, pending, completed, unavailable).
- **API:** `GET /api/orch/recap/today?studentId={id}` para checar status, `POST /api/orch/recap/start` para iniciar.

---

### 2. RecapQuizScreen.tsx

- **Path:** `client/src/components/orch/recap/RecapQuizScreen.tsx`
- **Epic:** EPIC-02
- **Descricao:** Tela completa de quiz: exibicao de pergunta, input de resposta, feedback imediato, confetti ao completar todas as questoes.

```typescript
interface RecapQuizScreenProps {
  recapId: string;
}
```

- **Estilo:** Tela full-width, progress bar no topo, card de questao centralizado. Feedback verde (correto) / vermelho (incorreto) com explicacao. Confetti via `canvas-confetti` ao final.
- **State:** `useState` para questao atual, respostas, score, estado de feedback.
- **API:** `GET /api/orch/recap/{recapId}` para buscar questoes, `POST /api/orch/recap/{recapId}/answer` para submeter cada resposta.

---

### 3. GamificationBar.tsx

- **Path:** `client/src/components/orch/gamification/GamificationBar.tsx`
- **Epic:** EPIC-02
- **Descricao:** Barra compacta no header do AVA com badge de XP, icone de fogo (streak) e barra de progresso do nivel.

```typescript
interface GamificationBarProps {
  xp: number;
  level: number;
  streak: number;
}
```

- **Estilo:** Flex row, altura fixa 40px. Badge de nivel com gradiente. Icone `Flame` (lucide) para streak com numero ao lado. Progress bar com porcentagem ate proximo nivel.
- **State:** Nenhum state local, componente puro (props only).
- **API:** Nenhuma chamada direta. Dados vem do componente pai.

---

### 4. GamificationPanel.tsx

- **Path:** `client/src/components/orch/gamification/GamificationPanel.tsx`
- **Epic:** EPIC-02
- **Descricao:** Painel completo de gamificacao: perfil do aluno, grid de badges, lista de missoes ativas, tab de leaderboard.

```typescript
interface GamificationPanelProps {
  studentId: string;
}
```

- **Estilo:** Layout com tabs (Perfil | Badges | Missoes | Ranking). Grid 3 colunas para badges. Lista de missoes com progress bar individual. Leaderboard com avatar + nome + XP.
- **State:** `useState` para tab ativa, dados carregados de cada secao.
- **API:** `GET /api/orch/gamification/profile/{studentId}`, `GET /api/orch/gamification/badges/{studentId}`, `GET /api/orch/gamification/missions/{studentId}`, `GET /api/orch/gamification/leaderboard`.

---

### 5. GradesWidget.tsx

- **Path:** `client/src/components/orch/grades/GradesWidget.tsx`
- **Epic:** EPIC-02
- **Descricao:** Card resumo de notas + simulador "Quanto eu preciso?" para atingir nota minima.

```typescript
interface GradesWidgetProps {
  studentId: string;
}
```

- **Estilo:** Card com tabela compacta de notas por disciplina. Secao "Simulador" com slider para nota desejada e calculo automatico da nota necessaria nas proximas avaliacoes.
- **State:** `useState` para notas carregadas, valor do slider do simulador, resultado do calculo.
- **API:** `GET /api/orch/grades/summary/{studentId}`, `POST /api/orch/grades/simulate` (body: studentId, targetGrade).

---

### 6. StudyPlanCard.tsx

- **Path:** `client/src/components/orch/study/StudyPlanCard.tsx`
- **Epic:** EPIC-02
- **Descricao:** Card mostrando plano de estudo gerado com 3 niveis Bloom (Lembrar, Entender, Aplicar).

```typescript
interface StudyPlan {
  id: string;
  subject: string;
  bloomLevels: {
    remember: string[];
    understand: string[];
    apply: string[];
  };
  estimatedMinutes: number;
  createdAt: string;
}

interface StudyPlanCardProps {
  plan: StudyPlan;
}
```

- **Estilo:** Card com 3 secoes coloridas (uma por nivel Bloom). Icones `Brain`, `Lightbulb`, `Wrench` (lucide). Tempo estimado no rodape.
- **State:** Componente puro (props only).
- **API:** Nenhuma chamada direta. Dados vem do componente pai.

---

### 7. Rich Message Components (Chat)

Componentes renderizados dentro do chat do ORCH AVA, como blocos ricos em mensagens.

#### 7a. HintBlock.tsx

- **Path:** `client/src/components/orch/chat/HintBlock.tsx`
- **Epic:** EPIC-02
- **Descricao:** Bloco de dica socratica com indicador de nivel (1-5). Nivel 1 = dica sutil, nivel 5 = resposta quase direta.

```typescript
interface HintBlockProps {
  level: 1 | 2 | 3 | 4 | 5;
  content: string;
}
```

- **Estilo:** Card com borda lateral colorida (gradiente de azul claro a azul escuro conforme nivel). Icone `HelpCircle` (lucide). Indicador visual de nivel com 5 pontos.
- **State:** Componente puro.

#### 7b. QuizInline.tsx

- **Path:** `client/src/components/orch/chat/QuizInline.tsx`
- **Epic:** EPIC-02
- **Descricao:** Questao de quiz inline no chat com opcoes clicaveis.

```typescript
interface QuizInlineProps {
  question: string;
  options: string[];
  onAnswer: (selectedIndex: number) => void;
}
```

- **Estilo:** Card com pergunta em negrito, opcoes como botoes pill. Ao selecionar, destaca correto/incorreto com cores.
- **State:** `useState` para opcao selecionada e estado de feedback.

#### 7c. ProgressBar.tsx

- **Path:** `client/src/components/orch/chat/ProgressBar.tsx`
- **Epic:** EPIC-02
- **Descricao:** Barra de dominio de conceito exibida no chat.

```typescript
interface ProgressBarProps {
  value: number; // 0-100
  label: string;
}
```

- **Estilo:** Barra horizontal com label acima e porcentagem a direita. Cor varia: vermelho (<30), amarelo (30-70), verde (>70).
- **State:** Componente puro.

#### 7d. CodeBlock.tsx

- **Path:** `client/src/components/orch/chat/CodeBlock.tsx`
- **Epic:** EPIC-02
- **Descricao:** Bloco de codigo com syntax highlighting.

```typescript
interface CodeBlockProps {
  code: string;
  language: string;
}
```

- **Estilo:** Fundo escuro (gray-900), fonte mono, botao "Copiar" no canto superior direito. Usar highlight nativo com CSS classes (sem dependencia extra pesada).
- **State:** `useState` para estado do botao "Copiar" (copiado/nao).

#### 7e. Expandable.tsx

- **Path:** `client/src/components/orch/chat/Expandable.tsx`
- **Epic:** EPIC-02
- **Descricao:** Bloco colapsavel de conteudo no chat.

```typescript
interface ExpandableProps {
  title: string;
  children: React.ReactNode;
}
```

- **Estilo:** Header clicavel com icone `ChevronDown`/`ChevronUp` (lucide). Conteudo com animacao de slide down.
- **State:** `useState` para aberto/fechado.

---

## EPIC-03 — Assessment + Analytics

### 8. AssessmentSubmit.tsx

- **Path:** `client/src/components/orch/assessment/AssessmentSubmit.tsx`
- **Epic:** EPIC-03
- **Descricao:** Formulario de submissao de texto dissertativo com contador de palavras.

```typescript
interface AssessmentSubmitProps {
  assignmentId: string;
  classInstanceId: string;
}
```

- **Estilo:** Textarea full-width com borda, contador de palavras no rodape (atualiza em tempo real), botao "Enviar" com confirmacao. Indicador de limite minimo/maximo de palavras.
- **State:** `useState` para texto, contagem de palavras, estado de submissao (idle, submitting, submitted, error).
- **API:** `POST /api/orch/assessment/submit` (body: assignmentId, classInstanceId, text).

---

### 9. AssessmentReport.tsx

- **Path:** `client/src/components/orch/assessment/AssessmentReport.tsx`
- **Epic:** EPIC-03
- **Descricao:** Visao do aluno: apenas feedback (sem flags de plagio ou indicadores internos).

```typescript
interface AssessmentReportProps {
  assessmentId: string;
}
```

- **Estilo:** Card com secoes: nota geral, feedback por criterio (rubrica), sugestoes de melhoria. Tons neutros, sem alertas visuais de flag.
- **State:** `useState` para dados do relatorio (loading, loaded, error).
- **API:** `GET /api/orch/assessment/{assessmentId}/report`.

---

### 10. AssessmentReview.tsx

- **Path:** `client/src/components/orch/assessment/AssessmentReview.tsx`
- **Epic:** EPIC-03
- **Descricao:** Visao do professor: todos os 7 estagios de avaliacao + indicadores de flag + formulario de revisao.

```typescript
interface AssessmentReviewProps {
  assessmentId: string;
}
```

- **Estilo:** Layout com 7 secoes (uma por estagio do pipeline). Cada secao com badge de status (aprovado/reprovado/pendente). Flags com icone `AlertTriangle` (lucide) em vermelho. Formulario de revisao com textarea + botoes "Aprovar" / "Solicitar Revisao".
- **State:** `useState` para dados de cada estagio, formulario de revisao.
- **API:** `GET /api/orch/assessment/{assessmentId}/review`, `POST /api/orch/assessment/{assessmentId}/review` (body: decision, feedback).

---

### 11. RiskDashboard.tsx

- **Path:** `client/src/components/orch/analytics/RiskDashboard.tsx`
- **Epic:** EPIC-03
- **Descricao:** Visao do professor: mapa de risco da turma com alunos codificados por cor.

```typescript
interface RiskDashboardProps {
  classInstanceId: string;
}
```

- **Estilo:** Grid de cards de alunos. Cada card com avatar, nome, indicador de risco (verde/amarelo/vermelho). Filtros por nivel de risco. Ordenacao por risco decrescente. Clique abre `StudentXray`.
- **State:** `useState` para lista de alunos, filtro ativo, ordenacao.
- **API:** `GET /api/orch/analytics/risk?classInstanceId={id}`.

---

### 12. D7ReportViewer.tsx

- **Path:** `client/src/components/orch/analytics/D7ReportViewer.tsx`
- **Epic:** EPIC-03
- **Descricao:** Visualizador do relatorio D7 consolidado com secoes por agente.

```typescript
interface D7ReportViewerProps {
  reportId: string;
}
```

- **Estilo:** Layout de secoes empilhadas, cada uma com header indicando o agente (Socrates, Bloom, Taylor, etc.). Graficos simples (barras horizontais) para metricas. Secao de recomendacoes no final.
- **State:** `useState` para dados do relatorio, secao expandida.
- **API:** `GET /api/orch/analytics/d7/{reportId}`.

---

### 13. StudentXray.tsx

- **Path:** `client/src/components/orch/analytics/StudentXray.tsx`
- **Epic:** EPIC-03
- **Descricao:** Visao 360 graus do aluno para o professor: academico + engajamento + risco + cognitivo.

```typescript
interface StudentXrayProps {
  studentId: string;
}
```

- **Estilo:** Layout com 4 paineis em grid 2x2: Academico (notas, frequencia), Engajamento (Taylor metrics), Risco (Foucault assessment), Cognitivo (Bloom levels, Ebbinghaus retention). Cada painel com icone e cor tematica.
- **State:** `useState` para dados de cada painel (carregamento independente).
- **API:** `GET /api/orch/analytics/xray/{studentId}` (retorna todos os dados consolidados).

---

## EPIC-04 — Admin Intelligence

### 14. OrchPanel.tsx

- **Path:** `client/src/components/orch/admin/OrchPanel.tsx`
- **Epic:** EPIC-04
- **Descricao:** Nova tab no CommunicationHub do admin. Substitui/estende o OrchChat existente com capacidades administrativas.

```typescript
interface OrchPanelProps {
  onClose: () => void;
}
```

- **Estilo:** Painel lateral (slide-in da direita, consistente com OrchChat.tsx). Header com titulo "ORCH Admin" + botao fechar. Area de chat + area de sugestoes + area de preview de acoes.
- **State:** `useState` para mensagens, input, estado de carregamento, preview ativo.
- **API:** `POST /api/orch/admin/chat` (body: message, route), `GET /api/orch/admin/suggestions?route={route}`.

---

### 15. OrchSuggestedQuestions.tsx

- **Path:** `client/src/components/orch/admin/OrchSuggestedQuestions.tsx`
- **Epic:** EPIC-04
- **Descricao:** 3 perguntas sugeridas baseadas na rota atual do admin.

```typescript
interface OrchSuggestedQuestionsProps {
  route: string;
}
```

- **Estilo:** 3 chips/pills clicaveis abaixo do input do chat. Icone `MessageSquare` (lucide). Hover com sombra sutil. Texto truncado se muito longo.
- **State:** `useState` para perguntas carregadas (recarrega quando route muda).
- **API:** `GET /api/orch/admin/suggestions?route={route}`.

---

### 16. AlertsPanel.tsx

- **Path:** `client/src/components/orch/admin/AlertsPanel.tsx`
- **Epic:** EPIC-04
- **Descricao:** Lista de alertas proativos com icones de severidade e botoes de acao.

```typescript
interface AlertsPanelProps {
  tenantId: string;
}
```

- **Estilo:** Lista vertical de cards de alerta. Severidade: `critical` (vermelho, icone `AlertOctagon`), `warning` (amarelo, icone `AlertTriangle`), `info` (azul, icone `Info`). Cada card com titulo, descricao, timestamp, botoes "Ver Detalhes" e "Dispensar".
- **State:** `useState` para lista de alertas, filtro por severidade.
- **API:** `GET /api/orch/admin/alerts?tenantId={id}`, `POST /api/orch/admin/alerts/{alertId}/dismiss`.

---

### 17. WalkthroughOverlay.tsx

- **Path:** `client/src/components/orch/admin/WalkthroughOverlay.tsx`
- **Epic:** EPIC-04
- **Descricao:** Wrapper do `driver.js` para walkthroughs guiados no admin.

```typescript
interface WalkthroughOverlayProps {
  walkthroughId: string;
  onComplete: () => void;
  onAbandon: () => void;
}
```

- **Estilo:** Overlay do driver.js com tema customizado (cores do ORCH). Popover com seta, botoes "Proximo" / "Anterior" / "Pular". Progress dots no rodape.
- **State:** Gerenciado internamente pelo driver.js. `useEffect` para iniciar/destruir.
- **Dependencia:** `driver.js` (~4KB gzipped).
- **API:** `GET /api/orch/admin/walkthrough/{walkthroughId}` (retorna steps), `POST /api/orch/admin/walkthrough/{walkthroughId}/complete`.

---

### 18. StuckDetector.tsx

- **Path:** `client/src/components/orch/admin/StuckDetector.tsx`
- **Epic:** EPIC-04
- **Descricao:** Detecta 30s de inatividade na tela e exibe bolha proativa com sugestao.

```typescript
interface StuckDetectorProps {
  route: string;
}
```

- **Estilo:** Bolha flutuante no canto inferior direito (acima do OrchPanel trigger). Animacao de fade-in. Icone `HelpCircle` (lucide) + texto curto. Clique abre OrchPanel com a sugestao pre-carregada.
- **State:** `useState` para visibilidade da bolha, texto da sugestao. `useEffect` com timer de 30s (resetado a cada interacao: click, scroll, keypress).
- **API:** `GET /api/orch/admin/stuck-hint?route={route}`.

---

### 19. DomFillPreview.tsx

- **Path:** `client/src/components/orch/admin/DomFillPreview.tsx`
- **Epic:** EPIC-04
- **Descricao:** Preview dos campos que o ORCH vai preencher antes de executar a acao. Confirmacao obrigatoria.

```typescript
interface DomField {
  selector: string;
  label: string;
  currentValue: string;
  newValue: string;
}

interface DomFillPreviewProps {
  fields: DomField[];
  onConfirm: () => void;
}
```

- **Estilo:** Card modal com tabela de 3 colunas: Campo, Valor Atual, Novo Valor. Novo valor destacado em verde. Botao "Confirmar e Preencher" (primario) + "Cancelar" (secundario). Aviso: "O ORCH vai preencher X campos no formulario."
- **State:** `useState` para estado de confirmacao.
- **API:** Nenhuma chamada direta. Dados vem do OrchPanel via props.

---

## Resumo por Epic

| Epic | Componentes | Qtd |
|------|-------------|-----|
| EPIC-02 | DailyRecapWidget, RecapQuizScreen, GamificationBar, GamificationPanel, GradesWidget, StudyPlanCard, HintBlock, QuizInline, ProgressBar, CodeBlock, Expandable | 11 |
| EPIC-03 | AssessmentSubmit, AssessmentReport, AssessmentReview, RiskDashboard, D7ReportViewer, StudentXray | 6 |
| EPIC-04 | OrchPanel, OrchSuggestedQuestions, AlertsPanel, WalkthroughOverlay, StuckDetector, DomFillPreview | 6 |
| **Total** | | **23** |

## Notas de Implementacao

1. **Ordem de implementacao sugerida:** EPIC-02 chat components primeiro (HintBlock, QuizInline, etc.) pois sao os mais simples e dao feedback visual rapido. Depois GamificationBar (header). Depois EPIC-04 OrchPanel (base para tudo do admin).

2. **Testes:** Cada componente deve ter ao menos um teste com React Testing Library. Focar em interacoes (clique, submit) e estados (loading, error, success).

3. **Responsividade:** Todos os componentes devem funcionar em telas >= 768px. O AVA nao tem requisito mobile por enquanto.

4. **Acessibilidade:** Usar `aria-label` em botoes de icone, `role="alert"` em mensagens de erro, `aria-live="polite"` em contadores atualizados dinamicamente.

5. **Importacoes comuns:**
```typescript
import { apiFetch } from '@/lib/apiFetch';
import { useState, useEffect } from 'react';
import { IconName } from 'lucide-react';
```
