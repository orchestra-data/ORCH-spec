# Orch AVA — Instrucoes de Desenvolvimento

## O que e o Orch AVA

O Orch AVA e um assistente IA para ALUNOS dentro da plataforma Cogedu.
Diferente do Orch Admin (que ajuda colaboradores a navegar o sistema), o Orch AVA:

- **Tutoria personalizada** — cada agente tem uma especialidade pedagogica
- **Colhe sutilezas dos dialogos** — analisa como o aluno escreve, o que pergunta, onde erra
- **Alimenta perfil adaptativo** — 12 arquetipos Bourdieu, engajamento, risco, gamificacao
- **Consulta dados reais** — notas, presenca, progresso, conteudo (via tool calling)
- **Adapta o tom** — transforma a resposta de acordo com o arquetipo do aluno

## Estrutura deste diretorio

```
orch-ava-dev/
├── README.md                          ← VOCE ESTA AQUI
├── FASE-1-TOOL-CALLING.md            ← Instrucoes da Fase 1 (rapida, alto impacto)
├── FASE-2-AGENTES-CORE.md            ← Instrucoes da Fase 2 (4 agentes reais)
├── FASE-3-AGENTES-AVANCADOS.md       ← Instrucoes da Fase 3 (5 agentes avancados)
├── ARQUITETURA.md                     ← Como tudo se conecta (diagrama + fluxos)
├── INVENTARIO-CODIGO-EXISTENTE.md    ← O que JA existe, arquivo por arquivo
├── PADROES-E-LICOES.md              ← Padroes obrigatorios + licoes do Admin
└── MAPA-TABELAS.md                  ← Mapeamento tabelas DB ↔ agentes (zero tabelas novas)
```

## Status das Fases

| Fase | Status | Data |
|------|--------|------|
| Fase 1 — Tool Calling | **COMPLETA, testada em runtime** | 2026-03-26 |
| Fase 2 — Agentes Core | **COMPLETA, 4 agentes testados em runtime** | 2026-03-26 |
| Fase 3 — Agentes Avancados | **COMPLETA, 5 agentes + 2 passivos testados** | 2026-03-26 |

## O que a Fase 1 entregou

- Tool calling plugado no endpoint `POST /orch-ava/chat`
- 7 student tools disponíveis (getMyGrades, getMyProgress, getMyAttendance, getMyEnrollments, getMyCourseContent, getMyProfile, searchContent)
- Hub router: fix tuples + keywords retornam intents corretos
- Keycloak sub → DB user.id lookup (Regra 11 PADROES)
- Persist: `tool_invocations` e `context_used` salvos em `ai_conversation_message`
- Migration: `component_id` nullable em `ai_conversation`
- `actorType: 'student'` em experience_events

## Bugs encontrados e corrigidos na Fase 1

1. **KEYWORD_PATTERNS usava `()` em vez de `[]`** — comma-expression avaliava como string
2. **KEYWORD_PATTERNS retornava nomes de agente** em vez de nomes de intent — `resolveAgent` não encontrava
3. **`req.user.id` é keycloak sub, não DB user.id** — FK violation em orch_student_profile
4. **`component_id` NOT NULL em ai_conversation** — AVA chatea sem componente (home/feed)
5. **`actorType: 'user'` não existe** no check constraint de experience_events — corrigido para `'student'`
6. **`toolCalls` vazio no multi-step** — Vercel AI SDK guarda nas `steps`, não no resultado final

## Ordem de leitura

1. `INVENTARIO-CODIGO-EXISTENTE.md` — entender o que ja tem
2. `ARQUITETURA.md` — entender como tudo se conecta
3. `PADROES-E-LICOES.md` — regras a seguir
4. `MAPA-TABELAS.md` — onde armazenar dados colhidos (ZERO tabelas novas)
5. ~~`FASE-1-TOOL-CALLING.md`~~ — **COMPLETA**
6. `FASE-2-AGENTES-CORE.md` — proximo passo
7. `FASE-3-AGENTES-AVANCADOS.md` — depois da Fase 2 testada
