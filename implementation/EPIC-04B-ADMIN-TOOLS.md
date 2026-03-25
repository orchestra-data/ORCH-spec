# EPIC-04B: Orch Admin — Admin-Specific Tools + Markdown Rendering

**Para:** Giuseppe "King Witcher"
**Depends on:** EPIC-04 (must be deployed first)
**Status:** TESTADO EM DEV — 7/7 tools passando, 0 erros

---

## O QUE MUDA

EPIC-04 deployou o Orch Admin com tool calling, mas as tools eram orientadas ao aluno logado.
Quando o admin perguntava "quantos alunos temos?", recebia "nao ha registros" porque as tools filtravam pelo user logado.

**EPIC-04B adiciona 7 tools admin-specific** que consultam dados da instituicao inteira, filtrados por nivel de permissao (multi-tenant via accessibleCompanyIds).

Tambem adiciona **markdown rendering** no widget frontend (negrito, italico, listas).

---

## ARQUIVOS MODIFICADOS (5 arquivos)

### 1. `apps/api/src/app/services/orch-tools/admin-tools.ts`

**Acao:** SUBSTITUIR O ARQUIVO INTEIRO pelo conteudo abaixo.

**7 novas tools adicionadas:**

| Tool | Permissao | O que faz |
|------|-----------|-----------|
| `getStudentAttendance` | admin | Presenca/frequencia de um aluno por nome |
| `listAllCourses` | admin | Lista collections + pathways + series + alunos matriculados |
| `listAllStudents` | admin | Lista alunos com filtros (genero, turma, status, busca). Modo countOnly |
| `getInstitutionStats` | admin | Dashboard: total alunos, cursos, turmas, taxa de conclusao |
| `getAccessLogs` | admin | Log de atividade via experience_events (BRONZE layer) |
| `getPendingGrading` | professor | Avaliacoes submetidas aguardando correcao |
| `getTeacherActivity` | admin | Comunicacao professor-alunos via conversation/conversation_message |

**Tools existentes preservadas:** `getClassStats`, `getStudentInfo`, `getBIMetrics`

**Detalhes tecnicos:**
- Todas as queries usam `ctx.tenantId` + `ctx.accessibleCompanyIds` (multi-tenant)
- Todas passam por `secureTool` (READ ONLY transaction + statement_timeout + requiredRole)
- `class_instance` usa `content_id` + `content_type` (NAO `collection_id`)
- `experience_events` usa `actor_id` (NAO `student_id`)
- `getInstitutionStats` usa queries sequenciais (PoolClient nao suporta paralelas)
- Joins com ambiguidade de `status` usam alias qualificado (`ce.status`)

---

### 2. `apps/api/src/app/services/orch-tools/index.ts`

**Acao:** Atualizar `filterToolsByRole` — adicionar novas tools nos arrays.

**Mudanca no diff:**

```diff
-  const professorToolNames = [...studentToolNames, 'getClassStats'];
-  const adminToolNames = [...professorToolNames, 'getStudentInfo', 'getBIMetrics'];
+  const professorToolNames = [...studentToolNames, 'getClassStats', 'getPendingGrading'];
+  const adminToolNames = [
+    ...professorToolNames,
+    'getStudentInfo',
+    'getStudentAttendance',
+    'getBIMetrics',
+    'listAllCourses',
+    'listAllStudents',
+    'getInstitutionStats',
+    'getAccessLogs',
+    'getTeacherActivity',
+  ];
```

---

### 3. `apps/api/src/app/services/admin/orch-admin-chat.ts`

**Acao:** 3 mudancas neste arquivo:

**3a. System prompt — identidade e tom (topo do ADMIN_SYSTEM_PROMPT):**

```diff
 const ADMIN_SYSTEM_PROMPT = `Voce e o Orch, assistente inteligente da plataforma Cogedu.
+Voce faz parte da equipe — e uma extensao da comunidade escolar.
 Voce ajuda funcionarios (admin, coordenadores, professores) a usar a plataforma.
+
+## Identidade e tom
+- Trate a instituicao como NOSSA: "nossos alunos", "nossos cursos", "nossa instituicao"
+- Use o nome da instituicao quando disponivel no contexto (nunca "a instituicao" generico)
+- Seja proximo e colaborativo, como um colega que conhece bem o sistema
+- Responda APENAS o que foi perguntado — nao adicione dados extras que nao foram solicitados
```

**3b. Regras de resposta — adicionar regra de resposta enxuta:**

```diff
 - Use listas numeradas para passo a passo
+- Responda SOMENTE o que foi perguntado. Se perguntaram "quantos alunos?", responda a quantidade. NAO adicione breakdown por genero, status ou outros dados que nao foram solicitados
```

**3c. Mapeamento de tools atualizado:**

```diff
-- Quantos cursos, quais cursos → getMyEnrollments (admin ve todos)
-- Quantos alunos, dados de alunos, perfil → getStudentInfo
+- Quantos cursos, quais cursos, lista cursos → listAllCourses
+- Quantos alunos, lista alunos, filtrar por genero/turma → listAllStudents
+- Visao geral, numeros da instituicao, dashboard geral → getInstitutionStats
+- Quem acessou, log de acesso, atividade recente → getAccessLogs
+- Provas para corrigir, avaliacoes pendentes → getPendingGrading
+- Comunicacao do professor, mensagens enviadas → getTeacherActivity
+- Dados de um aluno especifico por nome → getStudentInfo
+- Presenca, frequencia, assiduidade de um aluno → getStudentAttendance
```

**3d. ChatParams — adicionar companyId:**

```diff
 const ChatParams = z.object({
   userId: z.string().uuid(),
   tenantId: z.string().uuid(),
+  companyId: z.string().uuid().optional(),
   message: z.string().min(1),
```

**3e. Injetar nome da instituicao no prompt (no metodo chat, antes de `// Build prompt`):**

```typescript
    // Resolve institution name for personalized responses
    let institutionName = 'nossa instituicao';
    if (params.companyId) {
      try {
        const { rows } = await client.query(
          `SELECT display_name, legal_name FROM company WHERE id = $1 LIMIT 1`,
          [params.companyId]
        );
        if (rows[0]) institutionName = rows[0].display_name || rows[0].legal_name || institutionName;
      } catch { /* fallback to generic */ }
    }
```

E no systemPrompt adicionar a linha `Instituicao: ${institutionName}`.

---

### 4. `apps/api/src/endpoints/orchAdminChat/orchAdminChat.ts`

**Acao:** Passar `companyId` para o chat.

```diff
       const result = await orchAdminChat.chat(client, {
         userId,
         tenantId,
+        companyId: companyId ?? undefined,
         message,
         routeContext,
```

---

### 5. `apps/web/src/components/communication-hub/OrchChat.tsx`

**Acao:** Adicionar markdown rendering. Duas mudancas:

**5a. Adicionar imports e funcao `renderMarkdown` no topo:**

```tsx
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import DOMPurify from 'dompurify';  // JA INSTALADO no package.json
import { X, Send, Zap } from 'lucide-react';
import { apiFetch } from '../../client/apiClient';

/** Lightweight markdown → HTML for chat messages. No external deps. */
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^(\d+)\.\s+(.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/^[-•]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) =>
      m.includes('list-decimal') ? `<ol class="space-y-0.5">${m}</ol>` : `<ul class="space-y-0.5">${m}</ul>`
    )
    .replace(/\n/g, '<br/>');
}
```

**5b. Substituir o render de mensagens (linha ~141):**

```diff
-              {/* Render content with basic markdown-like formatting */}
-              <div className="whitespace-pre-wrap">{msg.content}</div>
+              <div
+                className="orch-md"
+                dangerouslySetInnerHTML={{
+                  __html: DOMPurify.sanitize(renderMarkdown(msg.content)),
+                }}
+              />
```

---

## ZERO MIGRATIONS

Nenhuma migration necessaria. Todas as tools consultam tabelas existentes.

## ZERO NPM INSTALL

`dompurify` ja esta no package.json (`v3.3.1`). O markdown rendering usa regex puro.

---

## CURL EVIDENCE (testado em dev 2026-03-25)

```
=== 1. quantos cursos ===
Atualmente, temos **2 cursos** disponíveis:
1. Computer Science Fundamentals Program (Publicado, 4 trilhas, 7 disciplinas, 5 alunos)
2. Curso de Administração 101 (Publicado, 0 trilhas, 0 disciplinas, 0 alunos)

=== 2. quantos alunos + genero ===
Temos **4 alunos**, **nenhum** do sexo feminino.

=== 3. visao geral da instituicao ===
- Total de alunos: 4 (4 ativos)
- Total de cursos: 2 (2 publicados)
- Total de turmas: 5 (4 ativas)
- Total de matriculas: 5 (5 ativas, 0 concluidas, 0 canceladas)
- Taxa de conclusao: 0%

=== 4. provas para corrigir ===
Nenhuma prova pendente para correcao.

=== 5. atividade nas ultimas 24h ===
Nenhuma atividade registrada (experience_events vazio no seed).

=== 6. comunicacao professor ===
Professor nao encontrado (correto — nome nao existe no seed).

=== 7. aluno X e assiduo? ===
jasexeh: 0 sessoes, 0% presenca, risco baixo, nao em risco de reprovacao.
```

Todos os 7 testes passaram com **zero erros** no log da API.

---

## COMO TESTAR

```bash
# 1. Subir dev
bash "C:/Projetos IA/Plataforma Cogedu/localhost/harbor-dev.sh"

# 2. Login
# http://localhost:5174 → admin@cogedu.dev / admin123

# 3. Abrir widget Orch (canto inferior direito)

# 4. Testar perguntas:
# "quantos cursos temos?"
# "quantos alunos temos e quantos sao do sexo feminino?"
# "me de os numeros gerais da instituicao"
# "quais provas tenho que corrigir?"
# "houve atividade na plataforma nas ultimas 24h?"
# "o aluno jasexeh e assiduo?"
```
