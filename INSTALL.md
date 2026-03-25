# Instalacao: Orch Admin — EPIC-04 + EPIC-04B (Admin Tools + Markdown)

> **Data:** 2026-03-25
> **Branch origem:** dev
> **Testado em:** localhost:3001 (harbor-dev)
> **ZERO migracoes novas.** ZERO npm install. Tudo usa schema e deps existentes.

---

## Resumo

O Orch Admin e um assistente IA integrado ao painel do colaborador (admin/coordenador/professor).
Usa tool calling com GPT-4o-mini para consultar dados REAIS do sistema via ferramentas seguras (READ ONLY).

**O que esta funcionando e testado:**
- Chat com LLM + tool calling (7 admin tools + 7 student tools + 1 shared)
- Markdown rendering no widget (negrito, italico, listas)
- Tom "nossa instituicao" — Orch faz parte da comunidade escolar
- Multi-tenant (accessibleCompanyIds)
- 4 camadas de seguranca (READ ONLY tx, statement_timeout, role filter, requiredRole)

---

## Passo 1: Copiar Backend (4 arquivos)

```bash
# 1. Admin tools (7 novas + 3 existentes)
cp backend/admin-tools.ts apps/api/src/app/services/orch-tools/admin-tools.ts

# 2. Tool index (filterToolsByRole atualizado)
cp backend/orch-tools-index.ts apps/api/src/app/services/orch-tools/index.ts

# 3. Chat service (system prompt + institution name + companyId)
cp backend/orch-admin-chat.ts apps/api/src/app/services/admin/orch-admin-chat.ts

# 4. Endpoint (passa companyId pro chat)
cp backend/orchAdminChat-endpoint.ts apps/api/src/endpoints/orchAdminChat/orchAdminChat.ts
```

## Passo 2: Copiar Frontend (1 arquivo)

```bash
# Widget com markdown rendering (usa DOMPurify que JA esta no package.json)
cp frontend/OrchChat.tsx apps/web/src/components/communication-hub/OrchChat.tsx
```

## Passo 3: Build e Restart

```bash
npm run build:types
npm run dev
```

## Passo 4: Testar

Abrir o sistema, login como admin, clicar no widget Orch (canto inferior direito).

Perguntas para testar:

| Pergunta | Tool chamada | Resposta esperada |
|----------|-------------|-------------------|
| "quantos cursos temos?" | listAllCourses | Lista cursos com pathways e alunos |
| "quantos alunos temos?" | listAllStudents | Contagem sem dados extras |
| "me de os numeros gerais" | getInstitutionStats | Dashboard completo |
| "quais provas tenho que corrigir?" | getPendingGrading | Lista ou "nenhuma pendente" |
| "houve atividade nas ultimas 24h?" | getAccessLogs | Eventos ou "nenhuma atividade" |
| "o aluno X e assiduo?" | getStudentAttendance | Presenca do aluno |
| "comunicacao do prof Y com alunos?" | getTeacherActivity | Mensagens do professor |

**Negrito e listas devem aparecer formatados** (nao como asteriscos).

---

## Mapa de Arquivos

| Arquivo no pack | Destino no projeto |
|-----------------|-------------------|
| `backend/admin-tools.ts` | `apps/api/src/app/services/orch-tools/admin-tools.ts` |
| `backend/orch-tools-index.ts` | `apps/api/src/app/services/orch-tools/index.ts` |
| `backend/orch-admin-chat.ts` | `apps/api/src/app/services/admin/orch-admin-chat.ts` |
| `backend/orchAdminChat-endpoint.ts` | `apps/api/src/endpoints/orchAdminChat/orchAdminChat.ts` |
| `frontend/OrchChat.tsx` | `apps/web/src/components/communication-hub/OrchChat.tsx` |

## Troubleshooting

| Problema | Causa | Solucao |
|----------|-------|---------|
| 500 no /orch-admin/chat | API nao recarregou | Restart: `npm run dev` |
| Asteriscos no chat | OrchChat.tsx antigo | Verificar que copiou o OrchChat.tsx |
| "nao tenho essa informacao" | Tool nao registrada | Verificar orch-tools-index.ts (adminToolNames) |
| Dados vazios | Seed sem dados | Normal em dev limpo — seed tem 4 alunos, 2 cursos |

## Evidencia

Pasta `evidence/` contem 6 JSONs com respostas reais testadas em localhost:3001.

---

*Pack gerado: 2026-03-25 por Chief (Squad Cogedu)*
