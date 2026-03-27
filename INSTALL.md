# Instalacao: Orch Admin — Completo (EPIC-04 + EPIC-04B)

> **Data:** 2026-03-25
> **Branch origem:** dev
> **Testado em:** localhost:3001 (harbor-dev)
> **Dependencia:** Migration `1942000005--orch_admin.sql` (inclusa no pack)
> **Env vars necessarias:** `OPENAI_API_KEY`, `ORCH_LLM_PROVIDER=openai`, `ORCH_LLM_MODEL=gpt-4o-mini`

---

## Resumo

O Orch Admin e um assistente IA integrado ao painel do colaborador (admin/coordenador/professor).
Usa tool calling com GPT-4o-mini para consultar dados REAIS do sistema via ferramentas seguras (READ ONLY).

**O que esta funcionando e testado:**
- Chat com LLM + tool calling (10 admin tools + 1 queryData SQL dinamico + 7 student tools + 1 shared)
- **queryData**: admin pergunta QUALQUER COISA sobre dados e o LLM gera SQL seguro (READ ONLY, tenant-isolated, validated, audited)
- Markdown rendering no widget (negrito, italico, listas)
- Tom "nossa instituicao" — Orch faz parte da comunidade escolar
- Multi-tenant (accessibleCompanyIds)
- 4 camadas de seguranca (READ ONLY tx, statement_timeout, role filter, requiredRole)
- 10 endpoints REST (chat, conversations, walkthroughs, alerts, feedback, suggestions)

---

## Passo 0: Migration

```bash
# Rodar a migration do Orch Admin (cria tabelas orch_admin_*)
psql -d $DATABASE_NAME -f backend/1942000005--orch_admin.sql
```

## Passo 1: Env Vars

Adicionar ao `.env` (ou `.env.production`):

```
OPENAI_API_KEY=sk-proj-...
ORCH_LLM_PROVIDER=openai
ORCH_LLM_MODEL=gpt-4o-mini
```

## Passo 2: Copiar Backend — Services

```bash
# Orch Tools (6 arquivos — pasta completa)
cp backend/admin-tools.ts    apps/api/src/app/services/orch-tools/admin-tools.ts
cp backend/orch-tools-index.ts apps/api/src/app/services/orch-tools/index.ts
cp backend/shared-tools.ts   apps/api/src/app/services/orch-tools/shared-tools.ts
cp backend/student-tools.ts  apps/api/src/app/services/orch-tools/student-tools.ts
cp backend/tool-utils.ts     apps/api/src/app/services/orch-tools/tool-utils.ts
cp backend/types.ts          apps/api/src/app/services/orch-tools/types.ts

# Admin Services (4 arquivos)
cp backend/orch-admin-chat.ts        apps/api/src/app/services/admin/orch-admin-chat.ts
cp backend/orch-admin-knowledge.ts   apps/api/src/app/services/admin/orch-admin-knowledge.ts
cp backend/orch-admin-alerts.ts      apps/api/src/app/services/admin/orch-admin-alerts.ts
cp backend/orch-admin-walkthroughs.ts apps/api/src/app/services/admin/orch-admin-walkthroughs.ts
cp backend/orch-staff-feedback.ts    apps/api/src/app/services/admin/orch-staff-feedback.ts

# LLM Service + User Role Resolver
cp backend/orch-llm-service.ts  apps/api/src/app/services/orch-llm-service.ts
cp backend/resolve-user-role.ts apps/api/src/app/utils/resolve-user-role.ts
```

## Passo 3: Copiar Backend — Endpoints (10 pastas)

```bash
# Copiar TODAS as pastas de endpoints
cp -r backend/endpoints/orchAdminChat              apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminConversations      apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminAlerts             apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminAlertRead          apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminAlertDismiss       apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminWalkthroughs       apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminWalkthroughStart   apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminWalkthroughComplete apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminFeedback           apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminSuggestions              apps/api/src/endpoints/
cp -r backend/endpoints/orchAdminConversationMessages     apps/api/src/endpoints/
```

Os endpoints sao auto-descobertos pelo `load-endpoints.ts`. NAO precisa registrar.

## Passo 4: Copiar Frontend (4 arquivos)

```bash
cp frontend/OrchChat.tsx           apps/web/src/components/communication-hub/OrchChat.tsx
cp frontend/CommunicationHub.tsx   apps/web/src/components/communication-hub/CommunicationHub.tsx
cp frontend/FloatingHubButton.tsx  apps/web/src/components/communication-hub/FloatingHubButton.tsx
cp frontend/HubPanel.tsx           apps/web/src/components/communication-hub/HubPanel.tsx
```

`DOMPurify` JA esta no `package.json`. NAO precisa `npm install`.

## Passo 5: Build e Restart

```bash
npm run build:types
npm run dev   # ou pm2 restart
```

## Passo 6: Testar

Login como admin. Widget Orch no canto inferior direito.

| Pergunta | Tool | Resposta esperada |
|----------|------|-------------------|
| "quantos cursos temos?" | listAllCourses | Lista cursos com pathways e alunos |
| "quantos alunos temos?" | listAllStudents | Contagem sem dados extras |
| "me de os numeros gerais" | getInstitutionStats | Dashboard completo |
| "quais provas tenho que corrigir?" | getPendingGrading | Lista ou "nenhuma pendente" |
| "houve atividade nas ultimas 24h?" | getAccessLogs | Eventos ou "nenhuma atividade" |
| "o aluno X e assiduo?" | getStudentAttendance | Presenca do aluno |
| "comunicacao do prof Y?" | getTeacherActivity | Mensagens do professor |

**Negrito e listas devem aparecer formatados** (nao como asteriscos).

---

## Mapa Completo de Arquivos (37 arquivos)

### Backend — Services (13 arquivos)

| Arquivo no pack | Destino |
|-----------------|---------|
| `backend/admin-tools.ts` | `apps/api/src/app/services/orch-tools/admin-tools.ts` |
| `backend/orch-tools-index.ts` | `apps/api/src/app/services/orch-tools/index.ts` |
| `backend/shared-tools.ts` | `apps/api/src/app/services/orch-tools/shared-tools.ts` |
| `backend/student-tools.ts` | `apps/api/src/app/services/orch-tools/student-tools.ts` |
| `backend/tool-utils.ts` | `apps/api/src/app/services/orch-tools/tool-utils.ts` |
| `backend/types.ts` | `apps/api/src/app/services/orch-tools/types.ts` |
| `backend/orch-admin-chat.ts` | `apps/api/src/app/services/admin/orch-admin-chat.ts` |
| `backend/orch-admin-knowledge.ts` | `apps/api/src/app/services/admin/orch-admin-knowledge.ts` |
| `backend/orch-admin-alerts.ts` | `apps/api/src/app/services/admin/orch-admin-alerts.ts` |
| `backend/orch-admin-walkthroughs.ts` | `apps/api/src/app/services/admin/orch-admin-walkthroughs.ts` |
| `backend/orch-staff-feedback.ts` | `apps/api/src/app/services/admin/orch-staff-feedback.ts` |
| `backend/orch-llm-service.ts` | `apps/api/src/app/services/orch-llm-service.ts` |
| `backend/resolve-user-role.ts` | `apps/api/src/app/utils/resolve-user-role.ts` |

### Backend — Endpoints (10 pastas, 20 arquivos)

| Pasta no pack | Destino |
|---------------|---------|
| `backend/endpoints/orchAdminChat/` | `apps/api/src/endpoints/orchAdminChat/` |
| `backend/endpoints/orchAdminConversations/` | `apps/api/src/endpoints/orchAdminConversations/` |
| `backend/endpoints/orchAdminAlerts/` | `apps/api/src/endpoints/orchAdminAlerts/` |
| `backend/endpoints/orchAdminAlertRead/` | `apps/api/src/endpoints/orchAdminAlertRead/` |
| `backend/endpoints/orchAdminAlertDismiss/` | `apps/api/src/endpoints/orchAdminAlertDismiss/` |
| `backend/endpoints/orchAdminWalkthroughs/` | `apps/api/src/endpoints/orchAdminWalkthroughs/` |
| `backend/endpoints/orchAdminWalkthroughStart/` | `apps/api/src/endpoints/orchAdminWalkthroughStart/` |
| `backend/endpoints/orchAdminWalkthroughComplete/` | `apps/api/src/endpoints/orchAdminWalkthroughComplete/` |
| `backend/endpoints/orchAdminFeedback/` | `apps/api/src/endpoints/orchAdminFeedback/` |
| `backend/endpoints/orchAdminSuggestions/` | `apps/api/src/endpoints/orchAdminSuggestions/` |
| `backend/endpoints/orchAdminConversationMessages/` | `apps/api/src/endpoints/orchAdminConversationMessages/` |

### Backend — Migration (1 arquivo)

| Arquivo | Destino |
|---------|---------|
| `backend/1942000005--orch_admin.sql` | `libs/migrations/identity/1942000005--orch_admin.sql` |

### Frontend (4 arquivos)

| Arquivo | Destino |
|---------|---------|
| `frontend/OrchChat.tsx` | `apps/web/src/components/communication-hub/OrchChat.tsx` |
| `frontend/CommunicationHub.tsx` | `apps/web/src/components/communication-hub/CommunicationHub.tsx` |
| `frontend/FloatingHubButton.tsx` | `apps/web/src/components/communication-hub/FloatingHubButton.tsx` |
| `frontend/HubPanel.tsx` | `apps/web/src/components/communication-hub/HubPanel.tsx` |

---

## Endpoints REST Criados

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/orch-admin/chat` | Chat com LLM + tool calling |
| GET | `/orch-admin/conversations` | Lista conversas do usuario |
| GET | `/orch-admin/walkthroughs` | Lista walkthroughs disponiveis |
| POST | `/orch-admin/walkthrough/:id/start` | Inicia walkthrough |
| POST | `/orch-admin/walkthrough/:id/complete` | Completa walkthrough |
| GET | `/orch-admin/alerts` | Lista alertas proativos |
| POST | `/orch-admin/alerts/:id/read` | Marca alerta como lido |
| POST | `/orch-admin/alerts/:id/dismiss` | Descarta alerta |
| POST | `/orch-admin/feedback` | Thumbs up/down |
| GET | `/orch-admin/suggestions/:route` | Sugestoes por rota |

## Troubleshooting

| Problema | Causa | Solucao |
|----------|-------|---------|
| 500 no /orch-admin/chat | OPENAI_API_KEY ausente | Verificar .env |
| 500 no /orch-admin/chat | Migration nao rodou | Rodar `1942000005--orch_admin.sql` |
| 500 no /orch-admin/chat | API nao recarregou | Restart |
| Asteriscos no chat | OrchChat.tsx antigo | Verificar que copiou OrchChat.tsx |
| "nao tenho essa informacao" | Tool nao registrada | Verificar orch-tools-index.ts |
| Dados vazios | Seed sem dados | Normal — seed tem 4 alunos, 2 cursos |

## Evidencia

Pasta `evidence/` contem 6 JSONs com respostas reais testadas em localhost:3001.

---

*Pack gerado: 2026-03-25 por Chief (Squad Cogedu)*
*37 arquivos, 10 endpoints, 15 tools, zero deps novas*
