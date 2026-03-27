# PATCH-001: Orch Admin — Critical Fixes

**Data:** 2026-03-26
**Autor:** Steven (via Chief)
**Severity:** CRITICAL — 3 bugs ALTA, 3 bugs MEDIA
**Arquivos alterados:** 3
**Arquivos novos:** 2 (tests)

---

## Problema

O Orch Admin no ambiente dev AWS apresenta:
1. Acha que e estudante — responde como aluno
2. Nao busca dados do sistema — tools nao rodam
3. 500 intermitente — erros silenciosos
4. Diz que esta na pagina / — pageUrl nao processado
5. Nao acha instituicoes, turmas, alunos

## Causa Raiz

O **system prompt** referenciava 4 tools de ALUNO (`getMyGrades`, `getMyProgress`, `getMyAttendance`, `getMyCourseContent`) que o `filterToolsByRole('admin')` remove. O LLM recebia instrucao "REGRA ABSOLUTA: chame a ferramenta" mas as ferramentas nao existiam no contexto. Resultado: confusao de identidade + dados nao encontrados.

Adicionalmente: erros de auth e RAG eram silenciados (catch vazio), impossibilitando debug.

## Arquivos Alterados

### 1. `apps/api/src/app/services/admin/orch-admin-chat.ts`

**Mudancas:**
- **System prompt corrigido:** Removidas 4 referências a student tools (`getMyGrades`, `getMyProgress`, `getMyAttendance`, `getMyCourseContent`). Substituidas por admin tools corretas (`getStudentInfo` para notas de aluno, `getClassStats` para estatisticas)
- **RAG catch block:** Adicionado `console.warn` com mensagem de erro (era catch vazio)
- **Institution name catch block:** Adicionado `console.warn` com mensagem de erro (era catch vazio)

### 2. `apps/api/src/endpoints/orchAdminChat/orchAdminChat.ts`

**Mudancas:**
- **DB user.id lookup:** Se nao encontrar user, loga warning. Se query falhar, retorna 500 (antes fazia fallback silencioso para Keycloak sub)
- **accessibleCompanyIds:** Fallback agora SEMPRE inclui pelo menos `[resolvedCompanyId]` (antes podia ser `[]` que zerava todas queries)
- **pageUrl:** Aceita `pageUrl` no request body, injeta no `routeContext` para o LLM saber a pagina real
- **Logging:** Adicionado warning se accessibleCompanyIds resolver para vazio

### 3. `apps/web/src/components/communication-hub/OrchChat.tsx`

**Mudancas:**
- **routeContext:** Agora envia nome legivel da pagina (`getPageName()`) em vez do path bruto
- **pageUrl:** Adicionado campo `pageUrl` com `window.location.pathname` no body do request admin
- Antes: `{ message, sessionId, routeContext: "/educational/class-instances" }`
- Depois: `{ message, sessionId, routeContext: "Turmas", pageUrl: "/educational/class-instances" }`

## Como Aplicar

```bash
# 1. Substituir os 3 arquivos
cp backend/orch-admin-chat.ts apps/api/src/app/services/admin/orch-admin-chat.ts
cp backend/orchAdminChat.ts apps/api/src/endpoints/orchAdminChat/orchAdminChat.ts
cp frontend/OrchChat.tsx apps/web/src/components/communication-hub/OrchChat.tsx

# 2. Restart API
npm run dev  # ou pm2 restart

# 3. Testar
curl -s -X POST "http://localhost:3001/orch-admin/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"quantos alunos temos?","routeContext":"Dashboard","pageUrl":"/dashboard"}'
```

## Testes

Incluidos em `tests/`:
- `BUSINESS-RULES.md` — 47 regras de negocio testaveis
- `orch-admin-chat.test.ts` — Test suite Vitest (copiar para `apps/api/src/app/services/admin/__tests__/`)

```bash
npx vitest run orch-admin-chat.test.ts
```

## Checklist de Validacao

Apos aplicar o patch, testar CADA um:

| # | Pergunta | Tool esperada | Resultado esperado |
|---|----------|---------------|-------------------|
| 1 | "quantos alunos temos?" | listAllStudents | Numero real |
| 2 | "quantos cursos temos?" | listAllCourses | Lista com trilhas |
| 3 | "me de os numeros gerais" | getInstitutionStats | Dashboard completo |
| 4 | "quais provas tenho que corrigir?" | getPendingGrading | Lista ou "nenhuma" |
| 5 | "houve atividade nas ultimas 24h?" | getAccessLogs | Eventos reais |
| 6 | "dados do aluno Joao" | getStudentInfo | Info do aluno |
| 7 | "presenca do aluno Maria" | getStudentAttendance | Frequencia real |
| 8 | "como faco para criar uma turma?" | (walkthrough) | Guia passo a passo |
| 9 | "o que e esse campo?" | (explain via RAG) | Explicacao da pagina |
| 10 | "busca conteudo sobre matematica" | searchContent | Resultados |

Se QUALQUER test falhar → verificar logs do backend (`[orch_admin]` prefix).

## Proximos Passos (incrementais)

1. Este patch (bugs criticos)
2. Frontend: passar `pageUrl` no request body do `OrchChat.tsx`
3. Indexar knowledge base embeddings (`orch_admin_embedding`)
4. Adicionar mais admin tools conforme necessidade
5. Testes automatizados no CI
