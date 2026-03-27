# Fase 1 — Plugar Tool Calling no Orch AVA

> **Estimativa:** Rapido, alto impacto
> **Resultado:** Aluno pergunta "como estao minhas notas?" e recebe dados REAIS
> **Prerequisito:** Dev rodando (`bash harbor-dev.sh`)

---

## O problema

O `orchAvaChat.ts` tem pipeline completo de 15 etapas, mas na etapa 10 (LLM call), NAO passa tools. O LLM responde com base apenas no prompt e RAG — sem dados reais do aluno.

Quando o aluno pergunta "como estao minhas notas?", o Orch responde genericamente. Com tool calling, o LLM chama `getMyGrades` e responde com dados exatos.

## O que fazer

### 1.1 Fix bug no `orch-hub-router.ts`

**Arquivo:** `apps/api/src/app/services/orch-hub-router.ts`

**Bug:** `KEYWORD_PATTERNS` usa tuples como comma-expression:
```typescript
// ERRADO (avalia como string, nao tuple)
(/ajuda|help|duvida/, 'socrates')

// CORRETO (array literal)
[/ajuda|help|duvida/, 'socrates']
```

**Acao:** Trocar TODOS os patterns de `(/regex/, 'string')` para `[/regex/, 'string']`.

### 1.2 Plugar tool calling no `orchAvaChat.ts`

**Arquivo:** `apps/api/src/endpoints/orchAvaChat/orchAvaChat.ts`

**Mudancas necessarias:**

**1.2a. Adicionar imports:**
```typescript
import { createOrchTools, filterToolsByRole } from '../../app/services/orch-tools';
import type { OrchToolContext } from '../../app/services/orch-tools/types';
import { resolveUserRole } from '../../app/utils/resolve-user-role';
```

**1.2b. Depois do profile load (etapa 4), antes do intent detection (etapa 5), adicionar:**
```typescript
// Resolve user role for tool filtering
const userRole = await resolveUserRole(pool, dbUserId, tenantId, companyId ?? tenantId);

// Build tool context
const toolContext: OrchToolContext = {
  pool,
  userId: dbUserId,
  tenantId,
  companyId: companyId ?? tenantId,
  accessibleCompanyIds: accessibleCompanyIds.length > 0 ? accessibleCompanyIds : companyId ? [companyId] : [],
  userRole,
};
const allTools = createOrchTools(toolContext);
const availableTools = filterToolsByRole(allTools, userRole);
```

**1.2c. Na etapa 10 (LLM call), adicionar tools:**
```typescript
// ANTES:
const response = await orchLLMService.generateResponse(systemPrompt, chatMessages);

// DEPOIS:
const hasTools = availableTools && Object.keys(availableTools).length > 0;
const response = await orchLLMService.generateResponse(systemPrompt, chatMessages, {
  ...(hasTools ? { tools: availableTools, maxSteps: 5, toolChoice: 'auto' } : {}),
});
```

**1.2d. Atualizar system prompt para incluir mapeamento de tools:**

Adicionar ao system prompt do AVA (no bloco que monta o prompt, etapa 9):
```
## Ferramentas Disponiveis
Voce tem ferramentas para consultar dados reais do aluno.
Quando o aluno perguntar sobre dados pessoais, use a ferramenta correspondente.
- Notas, provas → getMyGrades
- Progresso, aulas completadas → getMyProgress
- Presenca, faltas → getMyAttendance
- Turmas, matriculas → getMyEnrollments
- Conteudo do curso → getMyCourseContent
- Perfil → getMyProfile
- Buscar conteudo → searchContent
NUNCA invente dados. Use as ferramentas e reporte os dados exatos.
```

### 1.3 Testar

```bash
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/cogedu/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=web&username=admin@cogedu.dev&password=admin123" | \
  python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Teste 1: notas
curl -s -X POST "http://localhost:3001/orch-ava/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"como estao minhas notas?","pageUrl":"/home"}' | \
  python -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','ERR')[:500])"

# Teste 2: matriculas
curl -s -X POST "http://localhost:3001/orch-ava/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"em quais turmas estou matriculado?","pageUrl":"/home"}' | \
  python -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','ERR')[:500])"

# Teste 3: presenca
curl -s -X POST "http://localhost:3001/orch-ava/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"como esta minha presenca?","pageUrl":"/home"}' | \
  python -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','ERR')[:500])"
```

**Resultado esperado:** Respostas com dados reais do seed (4 alunos, 2 cursos, 5 turmas).

### 1.4 Verificar erros

```bash
cat /tmp/api-dev*.log | strings | grep "orch_tool_error" | tail -5
```

Zero erros = Fase 1 completa.
