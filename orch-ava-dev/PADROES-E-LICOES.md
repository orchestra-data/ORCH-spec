# Padroes Obrigatorios e Licoes Aprendidas

## Regras do Admin que se aplicam ao AVA

### SQL

1. **`class_instance` usa `content_id` + `content_type`** — NUNCA `collection_id` (nao existe)
2. **`experience_events` usa `actor_id`** — NUNCA `student_id` (nao existe)
3. **PoolClient NAO suporta queries paralelas** — dentro de `withReadOnlyTransaction`, fazer queries sequenciais. `Promise.all` com o mesmo client QUEBRA.
4. **Joins com `status` ambiguo** — sempre qualificar: `ce.status`, `ci.status`, `u.status`
5. **Multi-tenant obrigatorio** — toda query filtra por `tenant_id` e `company_id = ANY($N::uuid[])`

### LLM / System Prompt

6. **Tom "nossa"** — "nossos alunos", "nosso curso". Orch faz parte da comunidade escolar.
7. **Responder so o perguntado** — se perguntaram "quantos alunos?", nao adicionar breakdown por genero.
8. **LLM provider configuravel via env** — NUNCA hardcodar `openai` ou `google`.
9. **Tool calling com `maxSteps: 5, toolChoice: 'auto'`** — padrao testado no Admin.

### Infra

10. **Harbor reescreve `.env.development.local`** — colocar vars em `.env.development`
11. **Keycloak sub != DB user.id** — sempre resolver via `keycloak_user_id` lookup antes de consultar dados
12. **Hot-reload nem sempre pega** — reiniciar API apos mudancas significativas (`npx kill-port 3001`)
13. **DOMPurify ja no package.json** — zero npm install para markdown

### Padrao de Agente (obrigatorio para TODOS)

Cada agente em `apps/api/src/app/services/agents/orch-{nome}.ts`:

```typescript
interface OrchAgent {
  /** Monta system prompt com personalidade + dados do aluno */
  buildSystemPrompt(profile: OrchStudentProfile, context: AgentContext): string;

  /** Logica especifica do agente (SM-2, quiz gen, XP calc, etc.) */
  execute(message: string, context: AgentContext): Promise<AgentResult>;

  /** Colhe sutilezas do dialogo para alimentar o perfil */
  extractInsights(conversation: Message[]): Promise<ProfileUpdate[]>;

  /** Tools especificas que este agente pode usar (alem das student tools) */
  getTools?(ctx: OrchToolContext): Record<string, CoreTool>;
}
```

### Delivery Pack (obrigatorio ao terminar cada fase)

```
backend/           ← todos os arquivos backend
frontend/          ← todos os arquivos frontend
evidence/          ← curl JSONs testados em localhost
INSTALL.md         ← mapa completo arquivo→destino + passo a passo
```

Push para `orchestra` remote em `orchestra-data/ORCH-spec`.
Email para `giuseppe.lanna@indigohive.com.br`.

---

## Erros que ja cometemos e NAO vamos repetir

| Erro | Onde | Consequencia | Regra |
|------|------|-------------|-------|
| `ci2.collection_id` | admin-tools.ts | Query falhava silenciosamente | Sempre verificar colunas reais via `\d tabela` |
| `ee.student_id` | admin-tools.ts | "column does not exist" | Verificar schema antes de escrever SQL |
| `Promise.all` no PoolClient | getInstitutionStats | "cannot execute in parallel" | Queries sequenciais obrigatorias |
| `status` ambiguo | getInstitutionStats | "column reference is ambiguous" | Sempre qualificar com alias |
| Prompt com dados extras | System prompt | LLM respondendo genero quando so perguntaram total | Regra explicita no prompt |
| Pack incompleto | Delivery | Giuseppe sem arquivos necessarios | Pack deve ter 100% dos arquivos |
| Conteudo futuro misturado | ORCH-spec | Giuseppe confuso | `_old/` para planejamento, raiz = deploy |
