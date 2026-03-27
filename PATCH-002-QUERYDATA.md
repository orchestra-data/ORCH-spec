# PATCH-002: queryData + Memória Persistente + Identidade do Usuário

**Data:** 2026-03-27
**Autor:** Steven (via Chief)
**Severity:** ENHANCEMENT + MEDIUM FIX
**Arquivos alterados:** 5 + 1 novo endpoint

---

## O que muda

### 1. Nova tool `queryData` em `admin-tools.ts`

Admin pode perguntar QUALQUER COISA sobre dados do sistema. O LLM gera um SELECT PostgreSQL seguro que executa em READ ONLY transaction.

**Segurança (6 camadas):**
1. `validateQuerySafety()` — regex rejeita INSERT/UPDATE/DELETE/DROP/system tables/comments/multi-statement
2. Deve conter `$1` (tenant_id) — sem tenant = rejeitado
3. LIMIT forçado a max 50 rows
4. `secureTool` wrapper — READ ONLY transaction + statement_timeout 5s
5. `requiredRole: 'admin'` — defense in depth
6. `truncateResult()` — max 3000 chars para o LLM

**Schema exposto ao LLM:** 20 tabelas principais com colunas, tipos e relações. As 176 tabelas do banco estão acessíveis, mas o schema documenta as mais relevantes para o gestor.

**Audit trail:** Todo queryData loga `[orch_queryData] user=X explanation="Y" rows=Z`

### 2. Fix `getAccessLogs` em `admin-tools.ts`

**Bug:** Filtrava apenas por `tenant_id`, sem `accessibleCompanyIds`. Admin de filial via logs de todas filiais.

**Fix:** Adicionado filtro `ee.actor_id IN (SELECT uc2.user_id FROM user_company uc2 WHERE uc2.company_id = ANY($2::uuid[]))`.

### 3. System prompt atualizado em `orch-admin-chat.ts`

Adicionado mapeamento de perguntas complexas → queryData com exemplos de uso.

---

### 4. Identidade do usuário em `orchAdminChat.ts` (endpoint)

Agora resolve `full_name`, `gender`, `role_title`, `user_type` do usuário logado e passa como `userProfile` para o service.

### 5. Memória persistente em `orch-admin-chat.ts` (service)

**3 camadas de memória:**

| Camada | O que faz | Como |
|--------|----------|------|
| Identidade | Sabe quem é o usuário, gênero, cargo | Query `"user"` no endpoint, injeta no system prompt |
| Sessão persistente | Não perde histórico no refresh | `localStorage` salva `sessionId`, frontend restaura mensagens |
| Cross-session | Lembra conversas anteriores | A cada 6 mensagens gera resumo via LLM, salva em `context_summary`. Próxima sessão carrega últimos 3 resumos |

**Tratamento natural:**
- Usa primeiro nome OCASIONALMENTE (1 a cada 3-4 mensagens)
- Pronomes corretos baseados no gênero (ele/ela, o/a)
- Na primeira mensagem de sessão, cumprimenta pelo nome
- Não repete nome roboticamente

### 6. Novo endpoint `GET /orch-admin/conversations/:id/messages`

Retorna últimas mensagens de uma conversa (para restaurar histórico no frontend após reload).

## Arquivos alterados

```
backend/admin-tools.ts       — +150 linhas (queryData tool + schema + validation)
backend/orch-tools-index.ts  — +1 linha ('queryData' no adminToolNames)
backend/orch-admin-chat.ts   — +115 linhas (identidade, memória cross-session, resumo, timeAgo)
backend/orchAdminChat.ts     — +10 linhas (resolve userProfile, passa ao service)
frontend/OrchChat.tsx         — +40 linhas (localStorage session, restaura histórico)
backend/endpoints/orchAdminConversationMessages/ — NOVO (2 arquivos, restaurar mensagens)
```

## Como aplicar

Mesmos passos do INSTALL.md — todos arquivos alterados já estão nas pastas `backend/` e `frontend/`.
PATCH-001 está ABSORVIDO nestes arquivos (não precisa aplicar separado).

## Testes

| # | Pergunta | Esperado |
|---|----------|----------|
| 1 | "qual aluno tem mais faltas?" | Ranking por absent_sessions |
| 2 | "correlação entre presença e nota" | AVG attendance × AVG score |
| 3 | "turmas com evasão acima de 20%" | ratio dropped/total |
| 4 | "quantas aulas de vídeo vs quizzes?" | COUNT por component_type |
| 5 | "hierarquia do curso Computer Science" | collection→pathway→series→unit |
| 6 | "evolução de matrículas por mês" | GROUP BY date_trunc |
| 7 | "DELETE FROM user" | REJEITADO: "Query deve comecar com SELECT" |
| 8 | Query sem $1 | REJEITADO: "Query deve filtrar por tenant_id" |
