# EPIC-05: UX Mágico

**Fase:** F5
**Prioridade:** MEDIUM
**Estimativa:** 1-2 semanas
**Dependências:** EPIC-01 (Hub com SSE funcionando)
**Entregável:** Streaming fluido, rich messages, action chips, personalidade consistente

---

## Stories

### STORY-05.1: SSE Streaming Backend + Frontend
**Tipo:** Full-stack
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] Backend: `res.setHeader('Content-Type', 'text/event-stream')`, stream tokens do Gemini
- [ ] Frontend: `EventSource` ou `fetch` com reader, renderiza token por token com cursor animado
- [ ] 3 fases visíveis: searching → thinking → responding
- [ ] Status hints: "Buscando contexto sobre logaritmos...", "Analisando sua dúvida...", "Respondendo..."
- [ ] Graceful degradation: se SSE falha, fallback para resposta completa

### STORY-05.2: Rich Messages Components
**Tipo:** Frontend
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `<StreamingText />` — toda resposta
- [ ] `<HintBlock level={1-5} />` — Sócrates graduated hints com visual distinto por nível
- [ ] `<QuizInline question={...} />` — quiz dentro do chat
- [ ] `<ProgressBar value={0.7} label="Logaritmos" />` — mastery de conceito
- [ ] `<CodeBlock language="python" />` — respostas com código (syntax highlight)
- [ ] `<Expandable title="Detalhes">...</Expandable>` — info colapsada
- [ ] `<AlertCard severity="warning" />` — alertas inline (admin)

### STORY-05.3: Action Chips
**Tipo:** Frontend + Backend
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] 2-3 chips por resposta, NUNCA mais que 3 (obrigatório, não sugerido)
- [ ] 4 tipos: `message` (envia texto), `walkthrough` (inicia guia), `link` (abre URL), `dom-fill` (preenche)
- [ ] Gemini gera chips baseados no contexto da conversa
- [ ] Chips aparecem abaixo da última msg, antes do input
- [ ] Chips desaparecem após nova mensagem

### STORY-05.4: Personalidade ORCH — System Prompts
**Tipo:** Backend
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] Traits definidos: curioso, paciente, direto, bem-humorado, honesto
- [ ] Variações por contexto: primeira msg do dia, acerto, erro, frustração, admin staff
- [ ] Archetype transformer aplica personalidade consistente entre sessões
- [ ] "Não tenho certeza" > inventar; "Vou verificar" > chutar
- [ ] Testa: 10 conversas diferentes, personalidade é consistente

### STORY-05.5: Sugestões Proativas no Player de Vídeo
**Tipo:** Frontend
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] Pausa >30s → "Algo confuso nesse trecho? Posso ajudar."
- [ ] Volta 3x no mesmo ponto → "Quer explorar esse tópico juntos?"
- [ ] Termina vídeo → "O que achou da aula? Alguma dúvida?"
- [ ] 5min sem interação pós-vídeo → "Tem um recap rápido esperando. ~2 min."
- [ ] Sugestões NÃO bloqueiam o player, são não-intrusivas

---

## Definição de Done (Epic)
- [ ] Toda interação AI é streaming com cursor animado
- [ ] Status hints indicam fase do processamento
- [ ] Rich messages renderizam corretamente (hints, quiz, code, progress)
- [ ] Action chips funcionais em 4 tipos
- [ ] Personalidade ORCH consistente e humana
- [ ] Player de vídeo sugere interação nos momentos certos
