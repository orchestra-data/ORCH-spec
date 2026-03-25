# EPIC-04: ORCH Admin — Intelligent Page-Guide — Guia de Implementacao Cirurgico

**Para:** Giuseppe "King Witcher"
**Stack:** Express 5 + React 19 monorepo
**Codebase Admin:** `C:/Projetos IA/Plataforma Cogedu/localhost/cogedu-dev-v6/cogedu-main/`
**Pontos totais:** 37 pts (3 + 5 + 8 + 3 + 5 + 8 + 5)
**Prazo estimado:** 1-2 semanas
**Status:** PRONTO PARA IMPLEMENTACAO

---

## PARALELISMO

EPIC-04 roda em PARALELO com EPIC-02 e EPIC-03. Unica excecao: alertas de risco de aluno (STORY-04.4 categoria `student`) dependem da tabela `orch_risk_assessment` criada no EPIC-03 (Foucault + Taylor). Se EPIC-03 ainda nao rodou, implementar as outras 3 categorias de alertas (class, admission, system) e deixar student como stub.

---

## PRE-REQUISITOS

Antes de comecar, validar:

```bash
# 1. Migrations anteriores ja rodaram?
psql -d dev -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'orch_%';"
# Deve retornar 15 (5 base + 3 EPIC-01 + 6 EPIC-02/03 = tabelas previas)
# Se retornar menos, rodar migrations pendentes primeiro

# 2. pgvector esta habilitado?
psql -d dev -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
# Deve retornar 1 row. Se vazio:
psql -d dev -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 3. OpenAI key para embeddings (ou Gemini)
echo $OPENAI_API_KEY
# Necessario para text-embedding-3-small. Alternativa: Gemini embeddings via GOOGLE_GENERATIVE_AI_API_KEY
```

---

## STORY-04.1: Migration SQL — orch_admin (3 pts, Database)

**Tempo estimado:** 30 minutos
**Complexidade:** Baixa
**Dependencias:** pgvector habilitado

### O que criar

Nenhum arquivo novo. A migration ja esta pronta.

### Passo a passo

**1. Copiar migration para o diretorio correto:**

```bash
cp "implementation/migrations/1942000005--orch_admin.sql" \
   apps/api/libs/migrations/identity/1942000005--orch_admin.sql
```

**2. Rodar a migration:**

```bash
# Via script do monorepo (preferido):
npm run migrate

# Ou manualmente:
psql -d dev -f apps/api/libs/migrations/identity/1942000005--orch_admin.sql
```

**3. Validar as 7 novas tabelas:**

```sql
-- Listar tabelas criadas por esta migration
SELECT table_name FROM information_schema.tables
WHERE table_name IN (
  'orch_admin_embedding',
  'orch_admin_conversation',
  'orch_admin_message',
  'orch_admin_walkthrough',
  'orch_admin_walkthrough_usage',
  'orch_admin_alert',
  'orch_staff_feedback'
)
ORDER BY table_name;
-- Deve retornar EXATAMENTE 7 rows
```

**4. Validar total orch_*:**

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'orch_%';
-- Deve retornar 22 (5 base + 3 EPIC-01 + 7 EPIC-02/03 + 7 EPIC-04)
```

**5. Validar HNSW index (busca vetorial):**

```sql
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_admin_embedding_vector';
-- Deve retornar 1 row

-- Testar que o index e do tipo correto (hnsw):
SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_admin_embedding_vector';
-- Deve conter "USING hnsw ... vector_cosine_ops"
```

**6. Validar constraints e checks:**

```sql
-- Verificar CHECK constraints
SELECT conname, consrc FROM pg_constraint
WHERE conrelid = 'orch_admin_conversation'::regclass AND contype = 'c';
-- Deve mostrar check para status IN ('active', 'archived', 'cold')

SELECT conname, consrc FROM pg_constraint
WHERE conrelid = 'orch_admin_alert'::regclass AND contype = 'c';
-- Deve mostrar checks para category e severity
```

### Troubleshooting

| Problema | Solucao |
|----------|---------|
| `type "vector" does not exist` | `CREATE EXTENSION IF NOT EXISTS vector;` |
| `relation "user" does not exist` | Migrations base nao rodaram. Rodar todas na ordem. |
| `index idx_admin_embedding_vector already exists` | Migration ja rodou. `DROP INDEX IF EXISTS idx_admin_embedding_vector;` e re-rodar. |
| `permission denied for extension vector` | Conectar como superuser: `psql -U postgres -d dev` |

### Definicao de pronto

- [ ] 7 tabelas criadas e visiveis no `\dt orch_*`
- [ ] Total orch_* = 22
- [ ] HNSW index ativo em `orch_admin_embedding`
- [ ] FKs apontando para `"user"(id)` sem erro
- [ ] `vector(1536)` aceito na coluna embedding

---

## STORY-04.2: Knowledge Base — Ingestion de 14 YAMLs (5 pts, Backend)

**Tempo estimado:** 1-2 dias
**Complexidade:** Media
**Dependencias:** STORY-04.1 completa

### O que criar

**14 arquivos YAML** em `apps/api/src/data/orch-knowledge/`:

| Arquivo | Rota associada | Dominio |
|---------|---------------|---------|
| `cogedu-students.yaml` | `/students` | student-mgmt |
| `cogedu-classes.yaml` | `/classes` | class-mgmt |
| `cogedu-courses.yaml` | `/courses` | course-mgmt |
| `cogedu-enrollment.yaml` | `/enrollment` | enrollment |
| `cogedu-grades.yaml` | `/grades` | assessment |
| `cogedu-attendance.yaml` | `/attendance` | attendance |
| `cogedu-certificates.yaml` | `/certificates` | certificates |
| `cogedu-financial.yaml` | `/financial` | financial |
| `cogedu-reports.yaml` | `/reports` | reporting |
| `cogedu-users.yaml` | `/users` | user-mgmt |
| `cogedu-permissions.yaml` | `/permissions` | security |
| `cogedu-settings.yaml` | `/settings` | config |
| `cogedu-communication.yaml` | `/communication` | communication |
| `cogedu-content.yaml` | `/content` | content |

**1 service file** copiado de `implementation/services/admin/orch-admin-knowledge.ts`

### Passo a passo

**1. Criar diretorio dos YAMLs:**

```bash
mkdir -p apps/api/src/data/orch-knowledge
```

**2. Estrutura de cada YAML:**

Cada YAML segue EXATAMENTE esta estrutura:

```yaml
# cogedu-students.yaml
module: students
route_context: /students
domain: student-mgmt
title: Cadastro e Gestao de Alunos
description: >
  Pagina de gestao de alunos. Permite cadastrar, editar, importar em lote,
  visualizar historico e gerar relatorios.

fields:
  - name: full_name
    label: Nome Completo
    type: text
    required: true
    description: Nome completo do aluno conforme documento oficial.

  - name: cpf
    label: CPF
    type: text
    required: true
    validation: "11 digitos numericos, validacao de digito verificador"
    description: CPF do aluno. Usado como identificador unico.

  - name: email
    label: Email
    type: email
    required: true
    description: Email para acesso a plataforma. Deve ser unico.

  - name: class_instance_id
    label: Turma
    type: select
    required: true
    description: Turma em que o aluno sera matriculado.

flows:
  - name: Cadastro individual
    steps:
      - "Clicar em 'Novo Aluno'"
      - "Preencher dados obrigatorios (nome, CPF, email)"
      - "Selecionar turma"
      - "Clicar em 'Salvar'"
    result: "Aluno criado e matriculado na turma selecionada."

  - name: Importacao em lote
    steps:
      - "Clicar em 'Importar'"
      - "Baixar modelo de planilha"
      - "Preencher planilha com dados dos alunos"
      - "Enviar planilha preenchida"
      - "Revisar preview dos dados"
      - "Confirmar importacao"
    result: "Alunos criados em lote. Erros listados para correcao."

common_errors:
  - error: "CPF ja cadastrado"
    cause: "Aluno ja existe no sistema com este CPF."
    solution: "Buscar pelo CPF na lista de alunos. Se for rematricula, usar fluxo de rematricula."

  - error: "Email invalido"
    cause: "Formato de email incorreto ou dominio inexistente."
    solution: "Verificar digitacao. Email deve conter @ e dominio valido."

  - error: "Turma lotada"
    cause: "Turma atingiu limite maximo de vagas."
    solution: "Verificar com coordenador se ha possibilidade de ampliar vagas ou redirecionar para outra turma."

business_rules:
  - "CPF e unico por tenant. Nao pode haver dois alunos com mesmo CPF."
  - "Email e unico globalmente. Nao pode haver dois usuarios com mesmo email."
  - "Ao cadastrar aluno, uma matricula (enrollment) e criada automaticamente."
  - "Aluno desativado nao pode ser matriculado em nova turma."

tips:
  - "Use a importacao em lote para cadastrar mais de 10 alunos de uma vez."
  - "O modelo de planilha ja vem com validacoes para evitar erros comuns."
  - "Alunos importados recebem email automatico com credenciais de acesso."
```

**IMPORTANTE:** Escrever TODOS os 14 YAMLs com o mesmo nivel de detalhe. Nao pular campos. Cada YAML deve ter no minimo: `module`, `route_context`, `domain`, `title`, `description`, `fields` (3+), `flows` (2+), `common_errors` (2+), `business_rules` (2+), `tips` (2+).

**3. Copiar service para o codebase:**

```bash
# Criar diretorio do service
mkdir -p apps/api/src/app/services/admin

# Copiar service
cp "implementation/services/admin/orch-admin-knowledge.ts" \
   apps/api/src/app/services/admin/orch-admin-knowledge.ts
```

**4. Verificar/adaptar script de ingestion:**

O Leo ja criou `apps/api/src/scripts/index-orch-knowledge.ts`. Verificar se suporta os novos YAMLs:

```bash
# Verificar existencia
ls apps/api/src/scripts/index-orch-knowledge.ts
```

Se o script existe, verificar:
- Ele le do diretorio `apps/api/src/data/orch-knowledge/`?
- Ele passa `route_context` e `domain` para o embedding?
- Ele usa `text-embedding-3-small` (1536 dims)?

Se NAO existe ou nao suporta, criar/adaptar com base no service `orch-admin-knowledge.ts`:

```typescript
// apps/api/src/scripts/index-orch-knowledge.ts
import { Pool } from 'pg';
import { orchAdminKnowledge } from '../app/services/admin/orch-admin-knowledge';
import { readdirSync } from 'fs';
import { resolve } from 'path';

const KNOWLEDGE_DIR = resolve(__dirname, '../data/orch-knowledge');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const tenantId = process.env.DEFAULT_TENANT_ID!;

  try {
    const files = readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.yaml'));
    console.log(`Encontrados ${files.length} YAMLs para ingestao.`);

    for (const file of files) {
      const filePath = resolve(KNOWLEDGE_DIR, file);
      const routeContext = file.replace('cogedu-', '/').replace('.yaml', '');
      const domain = file.replace('cogedu-', '').replace('.yaml', '');

      console.log(`Ingerindo ${file}...`);
      const result = await orchAdminKnowledge.ingestYAML(client, {
        tenantId,
        filePath,
        sourceFile: file,
        routeContext,
        domain,
      });
      console.log(`  -> ${result.chunksCreated} chunks criados`);
    }

    console.log('Ingestion completa.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
```

**5. Rodar ingestion:**

```bash
npx ts-node apps/api/src/scripts/index-orch-knowledge.ts
```

**6. Validar embeddings no banco:**

```sql
-- Contagem por arquivo fonte
SELECT source_file, COUNT(*) as chunks, AVG(length(chunk_text))::int as avg_size
FROM orch_admin_embedding
GROUP BY source_file
ORDER BY source_file;
-- Deve ter rows para cada um dos 14 YAMLs
-- avg_size deve estar entre 500-2000 caracteres

-- Contagem total
SELECT COUNT(*) FROM orch_admin_embedding;
-- Esperado: 100-300 chunks (depende do tamanho dos YAMLs)

-- Testar busca semantica
SELECT chunk_text, source_file,
  1 - (embedding <=> (SELECT embedding FROM orch_admin_embedding LIMIT 1)) as similarity
FROM orch_admin_embedding
ORDER BY embedding <=> (SELECT embedding FROM orch_admin_embedding LIMIT 1)
LIMIT 5;
-- Deve retornar chunks do mesmo arquivo com alta similaridade
```

### Troubleshooting

| Problema | Solucao |
|----------|---------|
| `OPENAI_API_KEY not set` | Configurar no `.env`. Ou trocar para Gemini embeddings no service. |
| Chunks muito grandes | Reduzir `chunkSize` de 1000 para 500 no `chunkText()` |
| Chunks muito pequenos | Aumentar `chunkSize` para 1500 |
| `relation "orch_admin_embedding" does not exist` | Rodar STORY-04.1 primeiro |
| YAML parse error | Validar YAML com `npx yaml-lint arquivo.yaml` |

### Definicao de pronto

- [ ] 14 YAMLs criados em `apps/api/src/data/orch-knowledge/`
- [ ] Cada YAML com: fields, flows, common_errors, business_rules, tips
- [ ] Service `orch-admin-knowledge.ts` em `apps/api/src/app/services/admin/`
- [ ] Script de ingestion funcional
- [ ] Embeddings inseridos no banco (100+ chunks)
- [ ] Busca semantica retornando resultados relevantes por rota

---

## STORY-04.3: Admin Chat Service — RAG + Gemini (8 pts, Backend)

**Tempo estimado:** 2-3 dias
**Complexidade:** Alta
**Dependencias:** STORY-04.1, STORY-04.2

### O que criar

**1 service file** copiado de `implementation/services/admin/orch-admin-chat.ts`
**1 ou 2 endpoint folders** dependendo da opcao escolhida

### Decisao de arquitetura: Opcao A ou B

**Opcao A (recomendada) — Estender orchChat existente:**
- Menos codigo, menos duplicacao
- Adicionar flag `isAdmin: boolean` no handler existente
- Se `isAdmin`, usar pipeline admin (RAG filtrado por rota, walkthroughs, DOM fill)
- Se `!isAdmin`, manter pipeline AVA (Hub Router, agentes)

**Opcao B — Endpoint separado:**
- Isolamento total
- Mais facil de testar e debugar independentemente
- Cria pasta `apps/api/src/endpoints/orchAdminChat/`

**Se escolher Opcao A:**

Arquivo: `apps/api/src/endpoints/orchChat/orchChat.ts`

Localizar o handler e adicionar deteccao de role:

```typescript
// No inicio do handler, apos requireAuth:
const userRole = req.user?.role; // ou req.user?.tenantContext?.role
const isStaff = ['admin', 'coordinator', 'teacher', 'staff'].includes(userRole);

if (isStaff && req.body.routeContext) {
  // Pipeline Admin
  const result = await orchAdminChat.chat(client, {
    userId: req.user.id,
    tenantId: req.user.tenantContext.primaryTenantId,
    message: req.body.message,
    routeContext: req.body.routeContext,
    sessionId: req.body.sessionId,
  });
  return res.json(result);
}

// Pipeline AVA (existente, nao mexer)
// ...codigo atual do Leo...
```

**Se escolher Opcao B:**

```bash
# Criar pasta do endpoint
mkdir -p apps/api/src/endpoints/orchAdminChat

# Copiar service
cp "implementation/services/admin/orch-admin-chat.ts" \
   apps/api/src/app/services/admin/orch-admin-chat.ts
```

Criar endpoint:

```
apps/api/src/endpoints/orchAdminChat/
├── index.ts
└── orchAdminChat.ts
```

**index.ts:**
```typescript
export * from './orchAdminChat';
```

**orchAdminChat.ts:**
```typescript
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchAdminChat } from '../../app/services/admin/orch-admin-chat';

export const method = 'POST';
export const path = '/orch-admin/chat';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { message, routeContext, sessionId } = req.body;
      const userId = req.user!.id;
      const tenantId = req.user!.tenantContext.primaryTenantId;

      const result = await orchAdminChat.chat(client, {
        userId,
        tenantId,
        message,
        routeContext,
        sessionId,
      });

      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  };
}
```

### Pipeline completo do chat (entender antes de implementar)

```
1. Recebe { message, routeContext, sessionId? }
   |
2. Cria ou carrega conversa (orch_admin_conversation)
   |
3. Detecta intent via keywords:
   - "como faco" / "passo a passo" / "walkthrough" → intent: walkthrough
   - "preencher" / "cadastrar" / "criar" → intent: form_fill
   - "o que e" / "explica" / "significado" → intent: explain
   - "navegar" / "onde fica" / "ir para" → intent: navigate
   - default → intent: query
   |
4. Switch por intent:
   |
   ├─ walkthrough → Busca em orch_admin_walkthrough por trigger_intent
   |   └─ Se encontrou → Retorna suggestedWalkthrough (SEM chamar LLM)
   |
   ├─ form_fill → Gera instrucoes DOM (SEM chamar LLM)
   |   └─ Retorna domFillAction: [{ selector, value, action }]
   |
   └─ explain/query/navigate → Pipeline RAG:
       ├─ Busca semantica em orch_admin_embedding (filtro route_context)
       ├─ Checa orch_faq (perguntas repetidas, resposta instantanea)
       ├─ Se nao tem FAQ → Chama Gemini com system prompt + contexto RAG
       └─ Salva pergunta para FAQ learning (se 3+ repeticoes → gera FAQ)
   |
5. Salva par mensagem (user + assistant) em orch_admin_message
   |
6. A cada 5 mensagens → Gera context_summary da conversa (economia de tokens)
   |
7. Retorna ChatResponse
```

### FAQ Learning (detalhe critico)

O FAQ learning evita chamar o LLM para perguntas repetidas:

```sql
-- Logica no service: antes de chamar LLM, verificar
SELECT answer, usage_count FROM orch_faq
WHERE similarity(question, $1) > 0.85
  AND tenant_id = $2
ORDER BY usage_count DESC
LIMIT 1;

-- Se encontrou: retornar answer direto, incrementar usage_count
-- Se NAO encontrou: chamar LLM, depois verificar se pergunta similar ja apareceu

-- Apos resposta do LLM: contar perguntas similares nos ultimos 30 dias
SELECT COUNT(DISTINCT conversation_id) FROM orch_admin_message
WHERE role = 'user'
  AND similarity(content, $1) > 0.80;

-- Se count >= 3: INSERT INTO orch_faq (question, answer, ...)
```

**ATENCAO:** A funcao `similarity()` e do pg_trgm. Verificar se a extensao esta habilitada:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### Memoria 30 dias

```sql
-- CRON job (rodar diariamente ou via endpoint agendado):
UPDATE orch_admin_conversation
SET status = 'archived', archived_at = NOW()
WHERE status = 'active'
  AND last_message_at < NOW() - INTERVAL '30 days';
```

O rolling summary funciona assim:
- A cada 5 mensagens novas, o service chama Gemini para resumir a conversa
- O resumo e salvo em `context_summary` da conversa
- Nas proximas mensagens, usa o resumo ao inves de todo o historico
- Economia: ~80% menos tokens por chamada em conversas longas

### Validacao

```bash
# 1. Chat basico (sem session)
curl -X POST http://localhost:3000/api/v1/orch-admin/chat \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"como cadastro um aluno?","routeContext":"/students"}'
# Esperado: resposta com sources de cogedu-students.yaml
# Se houver walkthrough create-student: suggestedWalkthrough no response

# 2. Chat com session existente
curl -X POST http://localhost:3000/api/v1/orch-admin/chat \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"e como importo em lote?","routeContext":"/students","sessionId":"UUID_DA_SESSAO_ANTERIOR"}'
# Esperado: resposta contextualizada sobre importacao em lote

# 3. Listar conversas
curl http://localhost:3000/api/v1/orch-admin/conversations \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Esperado: array com a conversa criada acima

# 4. Testar FAQ (repetir mesma pergunta 3+ vezes em sessoes diferentes)
# Na 4a vez: resposta deve vir SEM chamar LLM (verificar logs)
```

### Troubleshooting

| Problema | Solucao |
|----------|---------|
| RAG retorna chunks irrelevantes | Verificar que `route_context` esta sendo filtrado na query |
| Resposta generica demais | Aumentar `limit` na busca RAG de 5 para 8 |
| FAQ nao funciona | Verificar extensao `pg_trgm` e threshold de similaridade |
| Timeout no chat | Reduzir `maxTokens` do Gemini de 2048 para 1024 |
| SSE nao funciona | Verificar `Accept: text/event-stream` no header |

### Definicao de pronto

- [ ] Service `orch-admin-chat.ts` funcional
- [ ] Endpoint POST `/orch-admin/chat` respondendo
- [ ] Endpoint GET `/orch-admin/conversations` listando
- [ ] Intent detection funcionando (walkthrough, form_fill, explain, query, navigate)
- [ ] RAG filtrado por `route_context`
- [ ] FAQ learning: pergunta repetida 3x → resposta instantanea
- [ ] Rolling summary a cada 5 mensagens
- [ ] Arquivamento automatico apos 30 dias

---

## STORY-04.4: Proactive Alerts (3 pts, Backend)

**Tempo estimado:** 1 dia
**Complexidade:** Media
**Dependencias:** STORY-04.1. Categoria `student` depende de EPIC-03 (Foucault/Taylor).

### O que criar

**1 service file** copiado de `implementation/services/admin/orch-admin-alerts.ts`
**1 service file** copiado de `implementation/services/admin/orch-staff-feedback.ts`
**4 endpoint folders**

### Copiar services

```bash
cp "implementation/services/admin/orch-admin-alerts.ts" \
   apps/api/src/app/services/admin/orch-admin-alerts.ts

cp "implementation/services/admin/orch-staff-feedback.ts" \
   apps/api/src/app/services/admin/orch-staff-feedback.ts
```

### As 4 categorias de alertas

| Categoria | O que monitora | De onde vem os dados | Depende de |
|-----------|---------------|---------------------|------------|
| `student` | Risco subindo, frequencia baixa, nota caindo | `orch_risk_assessment` (Foucault) | EPIC-03 |
| `class` | Media abaixo de 6.0, ausencia > 30%, anomalias | `grade`, `attendance` API | Tabelas base |
| `admission` | Matricula pendente > 48h, docs incompletos | `enrollment` API | Tabelas base |
| `system` | Quota AI > 80%, erros recorrentes | `company_ai_config` | Config existente |

**Se EPIC-03 nao rodou ainda:** Comentar o bloco de alertas `student` no service e deixar um TODO:

```typescript
// TODO: Descomentar quando EPIC-03 (Foucault risk engine) estiver implementado
// const { rows: studentRisks } = await client.query(...)
```

### 3 severidades com regras

| Severity | Cor | Quando usar | Escalation |
|----------|-----|-------------|------------|
| `info` | Azul | Informativo, sem acao urgente | Nunca |
| `warning` | Amarelo | Acao recomendada em 48h | Apos 72h sem leitura |
| `critical` | Vermelho | Acao imediata necessaria | Apos 24h sem leitura |

### Criar endpoints

**Endpoint 1: GET /orch-admin/alerts**

```bash
mkdir -p apps/api/src/endpoints/orchAdminAlerts
```

```
apps/api/src/endpoints/orchAdminAlerts/
├── index.ts
└── orchAdminAlerts.ts
```

**orchAdminAlerts.ts:**
```typescript
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { orchAdminAlerts } from '../../app/services/admin/orch-admin-alerts';

export const method = 'GET';
export const path = '/orch-admin/alerts';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantContext.primaryTenantId;
      const { category, unreadOnly, limit, offset } = req.query;

      const result = await orchAdminAlerts.getAlerts(client, {
        tenantId,
        userId,
        category: category as string | undefined,
        unreadOnly: unreadOnly === 'true',
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  };
}
```

**Endpoint 2: POST /orch-admin/alerts/:id/read**

```bash
mkdir -p apps/api/src/endpoints/orchAdminAlertsRead
```

```typescript
// orchAdminAlertsRead.ts
export const method = 'POST';
export const path = '/orch-admin/alerts/:id/read';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const userId = req.user!.id;
      await orchAdminAlerts.markRead(client, req.params.id, userId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  };
}
```

**Endpoint 3: POST /orch-admin/alerts/:id/dismiss**

```bash
mkdir -p apps/api/src/endpoints/orchAdminAlertsDismiss
```

Mesmo pattern do read, chamando `orchAdminAlerts.dismiss()`.

**Endpoint 4: POST /orch-admin/feedback**

```bash
mkdir -p apps/api/src/endpoints/orchAdminFeedback
```

```typescript
// orchAdminFeedback.ts
export const method = 'POST';
export const path = '/orch-admin/feedback';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantContext.primaryTenantId;
      const { messageId, rating, comment } = req.body;

      await orchStaffFeedback.submitActive(client, {
        userId,
        tenantId,
        messageId,
        rating,
        comment,
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  };
}
```

### Auto-escalation (CRON)

O service tem metodo `escalateStaleAlerts()`. Agendar para rodar a cada 6 horas:

**Opcao 1 — node-cron no boot do server:**

```typescript
// Em apps/api/src/app/index.ts ou arquivo de bootstrap
import cron from 'node-cron';
import { orchAdminAlerts } from './services/admin/orch-admin-alerts';

// A cada 6 horas
cron.schedule('0 */6 * * *', async () => {
  const client = await pool.connect();
  try {
    await orchAdminAlerts.escalateStaleAlerts(client, tenantId);
  } finally {
    client.release();
  }
});
```

**Opcao 2 — Endpoint manual + CRON externo:**

Criar endpoint `POST /orch-admin/alerts/escalate` (admin only) e chamar via crontab ou health check.

### Geracao de alertas

O metodo `generateAlerts()` no service cria alertas baseado em dados atuais. Agendar para rodar a cada 6 horas junto com escalation, ou expor como endpoint:

```bash
# Gerar alertas manualmente (para teste)
curl -X POST http://localhost:3000/api/v1/orch-admin/alerts/generate \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Validacao

```bash
# 1. Gerar alertas
curl -X POST http://localhost:3000/api/v1/orch-admin/alerts/generate \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Esperado: { created: N, byCategory: { class: X, admission: Y, system: Z } }

# 2. Listar alertas
curl "http://localhost:3000/api/v1/orch-admin/alerts?unreadOnly=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Esperado: { alerts: [...], total: N }

# 3. Marcar como lido
curl -X POST "http://localhost:3000/api/v1/orch-admin/alerts/ALERT_UUID/read" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Esperado: { success: true }

# 4. Dispensar
curl -X POST "http://localhost:3000/api/v1/orch-admin/alerts/ALERT_UUID/dismiss" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Esperado: { success: true }

# 5. Feedback
curl -X POST http://localhost:3000/api/v1/orch-admin/feedback \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messageId":"MSG_UUID","rating":"helpful","comment":"Resposta clara"}'
# Esperado: { success: true }

# 6. Verificar no banco
psql -d dev -c "SELECT category, severity, title FROM orch_admin_alert ORDER BY created_at DESC LIMIT 10;"
```

### Definicao de pronto

- [ ] 3 endpoints de alertas (list, read, dismiss) funcionando
- [ ] 1 endpoint de feedback funcionando
- [ ] `generateAlerts()` criando alertas para class, admission, system
- [ ] Alertas student como stub (se EPIC-03 pendente) ou funcional (se ja rodou)
- [ ] Auto-escalation agendada a cada 6h
- [ ] Severity correto: info/warning/critical
- [ ] `read_by` e `dismissed_by` atualizados corretamente

---

## STORY-04.5: Walkthroughs — Driver.js Integration (5 pts, Frontend)

**Tempo estimado:** 1-2 dias
**Complexidade:** Media
**Dependencias:** STORY-04.1 (tabelas), STORY-04.3 (integracao com chat)

### O que criar

**1 service file** copiado de `implementation/services/admin/orch-admin-walkthroughs.ts`
**3 endpoint folders** (list, start, complete)
**1 componente React** (`WalkthroughOverlay.tsx`)
**1 dependencia npm** (`driver.js`)

### Backend

**1. Copiar service:**

```bash
cp "implementation/services/admin/orch-admin-walkthroughs.ts" \
   apps/api/src/app/services/admin/orch-admin-walkthroughs.ts
```

**2. Seed dos 25 walkthroughs:**

O service ja tem 10 seeds completos no array `WALKTHROUGH_SEEDS`. Rodar o seed na primeira execucao:

```bash
# Via endpoint ou script:
curl -X POST http://localhost:3000/api/v1/orch-admin/walkthroughs/seed \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Os 15 stubs restantes Giuseppe deve completar baseado nas paginas reais. Stubs marcados com `// TODO: completar steps` no service. Para cada stub:
1. Abrir a pagina no browser
2. Inspecionar os elementos interativos
3. Anotar CSS selectors (usar `data-tour="nome"` quando possivel)
4. Escrever steps descritivos em portugues

**3. Criar endpoints:**

```bash
mkdir -p apps/api/src/endpoints/orchAdminWalkthroughs
mkdir -p apps/api/src/endpoints/orchAdminWalkthroughStart
mkdir -p apps/api/src/endpoints/orchAdminWalkthroughComplete
```

**GET /orch-admin/walkthroughs:**
```typescript
export const method = 'GET';
export const path = '/orch-admin/walkthroughs';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { route } = req.query;
      const walkthroughs = await orchAdminWalkthroughs.getAvailable(client, {
        tenantId: req.user!.tenantContext.primaryTenantId,
        route: route as string | undefined,
      });
      res.json({ walkthroughs });
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  };
}
```

**POST /orch-admin/walkthrough/:id/start:**
```typescript
export const method = 'POST';
export const path = '/orch-admin/walkthrough/:id/start';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const result = await orchAdminWalkthroughs.start(client, {
        walkthroughId: req.params.id,
        userId: req.user!.id,
      });
      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  };
}
```

**POST /orch-admin/walkthrough/:id/complete:**
```typescript
export const method = 'POST';
export const path = '/orch-admin/walkthrough/:id/complete';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      await orchAdminWalkthroughs.complete(client, {
        walkthroughId: req.params.id,
        userId: req.user!.id,
      });
      res.json({ completed: true });
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  };
}
```

### Frontend

**1. Instalar driver.js:**

```bash
cd apps/web
npm install driver.js
```

**2. Criar WalkthroughOverlay.tsx:**

Path: `apps/web/src/components/orch/WalkthroughOverlay.tsx`

```typescript
import { useEffect, useCallback } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { apiFetch } from '../../lib/api-fetch'; // ajustar path conforme monorepo

interface WalkthroughStep {
  order: number;
  selector: string;
  title: string;
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

interface WalkthroughOverlayProps {
  walkthroughId: string;
  steps: WalkthroughStep[];
  onComplete: () => void;
  onAbandon: (stepReached: number) => void;
}

export function WalkthroughOverlay({ walkthroughId, steps, onComplete, onAbandon }: WalkthroughOverlayProps) {
  const startWalkthrough = useCallback(async () => {
    // Registrar inicio no backend
    await apiFetch(`/api/v1/orch-admin/walkthrough/${walkthroughId}/start`, {
      method: 'POST',
    });

    const driverSteps: DriveStep[] = steps
      .sort((a, b) => a.order - b.order)
      .map((step) => ({
        element: step.selector,
        popover: {
          title: step.title,
          description: step.content,
          side: step.placement,
        },
      }));

    const driverInstance = driver({
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      nextBtnText: 'Proximo',
      prevBtnText: 'Anterior',
      doneBtnText: 'Concluir',
      progressText: '{{current}} de {{total}}',
      steps: driverSteps,
      onDestroyStarted: (element, step, opts) => {
        // Se nao completou todos os steps = abandon
        if (!opts.isLastStep) {
          const currentIndex = driverSteps.indexOf(step);
          onAbandon(currentIndex + 1);
        }
        opts.destroy();
      },
      onDestroyed: async (element, step, opts) => {
        if (opts.isLastStep) {
          // Registrar conclusao no backend
          await apiFetch(`/api/v1/orch-admin/walkthrough/${walkthroughId}/complete`, {
            method: 'POST',
          });
          onComplete();
        }
      },
    });

    driverInstance.drive();
  }, [walkthroughId, steps, onComplete, onAbandon]);

  useEffect(() => {
    startWalkthrough();
  }, [startWalkthrough]);

  return null; // driver.js gerencia o overlay diretamente no DOM
}
```

**3. Customizar CSS do driver.js (tema Cogedu):**

Criar `apps/web/src/styles/driver-cogedu.css`:

```css
/* Tema Cogedu para Driver.js */
.driver-popover {
  border-radius: 12px;
  font-family: inherit;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.driver-popover .driver-popover-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.driver-popover .driver-popover-description {
  font-size: 14px;
  color: #475569;
  line-height: 1.5;
}

.driver-popover .driver-popover-progress-text {
  font-size: 12px;
  color: #94a3b8;
}

.driver-popover-next-btn,
.driver-popover-prev-btn {
  border-radius: 8px;
  font-size: 14px;
  padding: 8px 16px;
}

.driver-popover-next-btn {
  background-color: #2563eb; /* blue-600 — cor primaria Cogedu */
  color: white;
}

.driver-popover-prev-btn {
  background-color: #f1f5f9;
  color: #475569;
}
```

Importar em `WalkthroughOverlay.tsx`:
```typescript
import '../../styles/driver-cogedu.css';
```

**4. Adicionar `data-tour` attributes nas paginas:**

Para cada walkthrough funcionar, os elementos alvo precisam de selectors estaveis. A melhor pratica e adicionar `data-tour="nome"` nos componentes:

```tsx
// Exemplo: Pagina de cadastro de aluno
<input data-tour="student-name" ... />
<input data-tour="student-cpf" ... />
<input data-tour="student-email" ... />
<select data-tour="student-class" ... />
<button data-tour="submit-btn" ... />
```

**IMPORTANTE:** Adicionar `data-tour` em TODAS as paginas que tem walkthrough. Sao 25 walkthroughs, entao todas as paginas principais precisam desses atributos. Fazer isso ANTES de testar os walkthroughs.

### Integracao com Admin Chat

Quando o chat retorna `suggestedWalkthrough`, o frontend deve:

```typescript
// No OrchAdminPanel (STORY-04.6):
if (chatResponse.suggestedWalkthrough) {
  // Mostrar botao inline na mensagem
  // "Me guie passo a passo" → dispara WalkthroughOverlay
}
```

### Validacao

1. Rodar seed: `curl -X POST .../walkthroughs/seed`
2. Verificar banco: `SELECT id, title, route FROM orch_admin_walkthrough ORDER BY id;` — 25 rows
3. Ir para `/students/new` no browser
4. Perguntar no ORCH Admin: "como cadastro um aluno?"
5. Resposta deve incluir `suggestedWalkthrough: { id: 'create-student', ... }`
6. Clicar "Me guie" → Driver.js inicia
7. Seguir steps → ao final, verificar no banco: `SELECT * FROM orch_admin_walkthrough_usage WHERE walkthrough_id = 'create-student';` — status = 'completed'
8. Fechar no meio → verificar abandon: status = 'abandoned', step_reached = N

### Definicao de pronto

- [ ] `driver.js` instalado
- [ ] 25 walkthroughs seeded no banco (10 completos + 15 stubs)
- [ ] Endpoints: list, start, complete funcionando
- [ ] `WalkthroughOverlay.tsx` com tema Cogedu
- [ ] `data-tour` attributes nas paginas principais
- [ ] Integracao com chat (botao "Me guie")
- [ ] Tracking de completion e abandon no banco

---

## STORY-04.6: Frontend — OrchPanel no CommunicationHub (8 pts, Frontend)

**Tempo estimado:** 2-3 dias
**Complexidade:** Alta
**Dependencias:** STORY-04.3, STORY-04.4, STORY-04.5

### O que criar

8 componentes em `apps/web/src/components/orch/` (ou `communication-hub/`, seguir convencao existente do `OrchChat.tsx`).

**REGRA:** O `OrchChat.tsx` do Leo JA EXISTE. NAO reescrever. Estender ou criar componentes irmao.

### Componente 1: OrchAdminPanel.tsx

**Path:** `apps/web/src/components/orch/OrchAdminPanel.tsx`
**O que faz:** Painel principal do ORCH Admin para staff. Substituto do OrchChat quando usuario e staff.

```typescript
import { useState, useEffect } from 'react';
import { Zap, MessageSquare, Bell, HelpCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-fetch';
import { useAuth } from '../../hooks/useAuth';
import { OrchSuggestedQuestions } from './OrchSuggestedQuestions';
import { AlertsBadge } from './AlertsBadge';
import { AlertsPanel } from './AlertsPanel';
import { WalkthroughOverlay } from './WalkthroughOverlay';

export function OrchAdminPanel() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'chat' | 'alerts'>('chat');
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [walkthroughData, setWalkthroughData] = useState<any>(null);

  // Detectar rota atual para contexto
  const currentRoute = window.location.pathname;

  const sendMessage = async (message: string) => {
    setMessages(prev => [...prev, { role: 'user', content: message }]);

    const response = await apiFetch<ChatResponse>('/api/v1/orch-admin/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        routeContext: currentRoute,
        sessionId,
      }),
    });

    setSessionId(response.sessionId);
    setMessages(prev => [...prev, { role: 'assistant', content: response.message }]);

    // Se sugeriu walkthrough, preparar botao
    if (response.suggestedWalkthrough) {
      setWalkthroughData(response.suggestedWalkthrough);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <OrchHeader route={currentRoute} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Body */}
      {activeTab === 'chat' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Sugestoes se chat vazio */}
          {messages.length === 0 && (
            <OrchSuggestedQuestions route={currentRoute} onSelect={sendMessage} />
          )}

          {/* Mensagens */}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Botao de walkthrough */}
          {walkthroughData && (
            <button
              onClick={() => {/* disparar WalkthroughOverlay */}}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition"
            >
              <HelpCircle size={16} />
              Me guie passo a passo
            </button>
          )}
        </div>
      ) : (
        <AlertsPanel tenantId={user.tenantContext.primaryTenantId} />
      )}

      {/* Input (apenas na tab chat) */}
      {activeTab === 'chat' && (
        <div className="border-t p-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && input.trim() && sendMessage(input.trim())}
              placeholder="Pergunte sobre esta pagina..."
              className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => input.trim() && sendMessage(input.trim())}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Walkthrough overlay (portal) */}
      {walkthroughData && walkthroughData.active && (
        <WalkthroughOverlay
          walkthroughId={walkthroughData.id}
          steps={walkthroughData.steps}
          onComplete={() => setWalkthroughData(null)}
          onAbandon={() => setWalkthroughData(null)}
        />
      )}
    </div>
  );
}
```

**IMPORTANTE:** Este e um ESQUELETO. Giuseppe deve:
1. Adaptar imports e paths ao monorepo real
2. Adicionar loading states
3. Adicionar error handling
4. Adicionar feedback buttons (helpful/unhelpful) em cada mensagem do assistant
5. Integrar com o `CommunicationHub` existente (detectar role e renderizar OrchAdminPanel ou OrchChat)

### Componente 2: OrchHeader.tsx

```typescript
// apps/web/src/components/orch/OrchHeader.tsx
import { Zap, MessageSquare, Bell } from 'lucide-react';
import { AlertsBadge } from './AlertsBadge';

interface OrchHeaderProps {
  route: string;
  activeTab: 'chat' | 'alerts';
  onTabChange: (tab: 'chat' | 'alerts') => void;
}

const ROUTE_LABELS: Record<string, string> = {
  '/students': 'Alunos',
  '/classes': 'Turmas',
  '/courses': 'Cursos',
  '/enrollment': 'Matriculas',
  '/grades': 'Notas',
  '/attendance': 'Presenca',
  '/certificates': 'Certificados',
  '/financial': 'Financeiro',
  '/reports': 'Relatorios',
  '/users': 'Usuarios',
  '/permissions': 'Permissoes',
  '/settings': 'Configuracoes',
  '/communication': 'Comunicacao',
  '/content': 'Conteudo',
};

function getRouteLabel(route: string): string {
  // Match parcial: /students/123 → 'Alunos'
  for (const [key, label] of Object.entries(ROUTE_LABELS)) {
    if (route.startsWith(key)) return label;
  }
  return 'Geral';
}

export function OrchHeader({ route, activeTab, onTabChange }: OrchHeaderProps) {
  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Zap size={20} className="text-blue-600" />
        <span className="font-semibold text-sm text-slate-800">Orch Admin</span>
        <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">
          {getRouteLabel(route)}
        </span>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onTabChange('chat')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition ${
            activeTab === 'chat' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <MessageSquare size={14} />
          Chat
        </button>
        <button
          onClick={() => onTabChange('alerts')}
          className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition relative ${
            activeTab === 'alerts' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Bell size={14} />
          Alertas
          <AlertsBadge />
        </button>
      </div>
    </div>
  );
}
```

### Componente 3: OrchSuggestedQuestions.tsx

```typescript
// apps/web/src/components/orch/OrchSuggestedQuestions.tsx
import { useState, useEffect } from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { apiFetch } from '../../lib/api-fetch';

interface OrchSuggestedQuestionsProps {
  route: string;
  onSelect: (question: string) => void;
}

interface Suggestion {
  id: string;
  title: string;
  description: string;
}

export function OrchSuggestedQuestions({ route, onSelect }: OrchSuggestedQuestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const encodedRoute = encodeURIComponent(route);
    apiFetch<{ suggestions: Suggestion[] }>(`/api/v1/orch-admin/suggestions/${encodedRoute}`)
      .then(data => setSuggestions(data.suggestions))
      .catch(() => setSuggestions([]));
  }, [route]);

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <MessageCircleQuestion size={14} />
        Perguntas frequentes desta pagina
      </div>
      {suggestions.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.title)}
          className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition text-sm text-slate-700"
        >
          {s.title}
        </button>
      ))}
    </div>
  );
}
```

### Componente 4: AlertsBadge.tsx

```typescript
// apps/web/src/components/orch/AlertsBadge.tsx
import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api-fetch';

export function AlertsBadge() {
  const [count, setCount] = useState(0);
  const [hasCritical, setHasCritical] = useState(false);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await apiFetch<{ alerts: any[]; total: number }>(
          '/api/v1/orch-admin/alerts?unreadOnly=true&limit=100'
        );
        setCount(data.total);
        setHasCritical(data.alerts.some(a => a.severity === 'critical'));
      } catch {
        // silencioso
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000); // poll a cada 1 min
    return () => clearInterval(interval);
  }, []);

  if (count === 0) return null;

  return (
    <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${
      hasCritical ? 'bg-red-500' : 'bg-amber-500'
    }`}>
      {count > 9 ? '9+' : count}
    </span>
  );
}
```

### Componente 5: AlertsPanel.tsx

```typescript
// apps/web/src/components/orch/AlertsPanel.tsx
import { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, XCircle, ExternalLink, X } from 'lucide-react';
import { apiFetch } from '../../lib/api-fetch';

interface Alert {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  actionUrl: string | null;
  createdAt: string;
  isRead: boolean;
}

interface AlertsPanelProps {
  tenantId: string;
}

const SEVERITY_CONFIG = {
  info: { icon: AlertCircle, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
  critical: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
};

export function AlertsPanel({ tenantId }: AlertsPanelProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ alerts: Alert[] }>('/api/v1/orch-admin/alerts?limit=50')
      .then(data => setAlerts(data.alerts))
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (alertId: string) => {
    await apiFetch(`/api/v1/orch-admin/alerts/${alertId}/read`, { method: 'POST' });
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, isRead: true } : a));
  };

  const dismiss = async (alertId: string) => {
    await apiFetch(`/api/v1/orch-admin/alerts/${alertId}/dismiss`, { method: 'POST' });
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  if (loading) return <div className="p-4 text-sm text-slate-400">Carregando alertas...</div>;
  if (alerts.length === 0) return <div className="p-4 text-sm text-slate-400">Nenhum alerta no momento.</div>;

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {alerts.map(alert => {
        const config = SEVERITY_CONFIG[alert.severity];
        const Icon = config.icon;
        return (
          <div
            key={alert.id}
            onClick={() => !alert.isRead && markRead(alert.id)}
            className={`p-3 rounded-lg border ${config.border} ${config.bg} ${!alert.isRead ? 'ring-1 ring-offset-1' : 'opacity-75'} cursor-pointer`}
          >
            <div className="flex items-start gap-2">
              <Icon size={16} className={config.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{alert.title}</p>
                <p className="text-xs text-slate-600 mt-0.5">{alert.description}</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); dismiss(alert.id); }} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            </div>
            {alert.actionUrl && (
              <a href={alert.actionUrl} className="flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline">
                <ExternalLink size={12} /> Ver detalhes
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### Componente 6: DomFillPreview.tsx

```typescript
// apps/web/src/components/orch/DomFillPreview.tsx
import { Check, X } from 'lucide-react';

interface FillAction {
  selector: string;
  value: string;
  action: 'fill' | 'select' | 'click';
  label?: string;
}

interface DomFillPreviewProps {
  actions: FillAction[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function DomFillPreview({ actions, onConfirm, onCancel }: DomFillPreviewProps) {
  return (
    <div className="border rounded-lg p-3 bg-blue-50 space-y-2">
      <p className="text-sm font-medium text-slate-800">Preencher formulario automaticamente?</p>
      <div className="space-y-1">
        {actions.map((a, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-mono bg-white px-1 rounded">{a.label || a.selector}</span>
            <span className="text-slate-400">=</span>
            <span className="font-medium text-slate-800">{a.value}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onConfirm} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition">
          <Check size={12} /> Confirmar
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 text-slate-700 rounded text-xs hover:bg-slate-300 transition">
          <X size={12} /> Cancelar
        </button>
      </div>
    </div>
  );
}
```

### Componente 7: StuckDetector.tsx

```typescript
// apps/web/src/components/orch/StuckDetector.tsx
import { useState, useEffect, useCallback } from 'react';
import { HelpCircle } from 'lucide-react';

interface StuckDetectorProps {
  timeoutMs?: number;        // default 30000 (30s)
  cooldownMs?: number;       // default 300000 (5min)
  onRequestHelp: () => void; // abre OrchAdminPanel
}

export function StuckDetector({ timeoutMs = 30_000, cooldownMs = 300_000, onRequestHelp }: StuckDetectorProps) {
  const [showBubble, setShowBubble] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const resetTimer = useCallback(() => {
    setShowBubble(false);
  }, []);

  useEffect(() => {
    if (dismissed) return;

    let timer: ReturnType<typeof setTimeout>;

    const startTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setShowBubble(true), timeoutMs);
    };

    // Reset em qualquer interacao
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, startTimer));
    startTimer();

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, startTimer));
    };
  }, [timeoutMs, dismissed]);

  const handleDismiss = () => {
    setShowBubble(false);
    setDismissed(true);
    // Reativar apos cooldown
    setTimeout(() => setDismissed(false), cooldownMs);
  };

  if (!showBubble) return null;

  return (
    <div className="fixed bottom-24 right-6 animate-bounce z-50">
      <div className="bg-white shadow-lg rounded-2xl p-3 border border-blue-200 flex items-center gap-3 max-w-xs">
        <HelpCircle size={24} className="text-blue-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-slate-800">Precisa de ajuda?</p>
          <p className="text-xs text-slate-500">Posso explicar esta pagina.</p>
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => { setShowBubble(false); onRequestHelp(); }}
            className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
          >
            Sim
          </button>
          <button
            onClick={handleDismiss}
            className="px-2 py-1 text-slate-400 text-xs hover:text-slate-600"
          >
            Nao
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Componente 8: dom-bridge.ts

```typescript
// apps/web/src/lib/dom-bridge.ts

interface ScannedField {
  selector: string;
  type: string;
  label: string | null;
  value: string;
  name: string | null;
}

/**
 * Escaneia campos visiveis do formulario na pagina atual.
 */
export function scanPage(): ScannedField[] {
  const fields: ScannedField[] = [];
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input:not([type="hidden"]), select, textarea'
  );

  inputs.forEach(el => {
    if (!el.offsetParent) return; // nao visivel

    fields.push({
      selector: buildUniqueSelector(el),
      type: el.tagName.toLowerCase() + (el instanceof HTMLInputElement ? `[${el.type}]` : ''),
      label: findLabel(el),
      value: el.value,
      name: el.name || null,
    });
  });

  return fields;
}

/**
 * Preenche um campo no DOM.
 */
export function fillField(selector: string, value: string): boolean {
  const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  if (!el) return false;

  // Simular evento nativo para que React detecte a mudanca
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/**
 * Gera CSS selector unico para um elemento.
 */
export function buildUniqueSelector(element: Element): string {
  // Prioridade 1: data-tour
  if (element.hasAttribute('data-tour')) {
    return `[data-tour="${element.getAttribute('data-tour')}"]`;
  }

  // Prioridade 2: id
  if (element.id) {
    return `#${element.id}`;
  }

  // Prioridade 3: name
  if (element.hasAttribute('name')) {
    return `[name="${element.getAttribute('name')}"]`;
  }

  // Prioridade 4: data-testid
  if (element.hasAttribute('data-testid')) {
    return `[data-testid="${element.getAttribute('data-testid')}"]`;
  }

  // Prioridade 5: path no DOM (fallback)
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.className && typeof current.className === 'string') {
      const cls = current.className.split(' ').filter(c => c && !c.startsWith('hover:') && !c.startsWith('focus:'))[0];
      if (cls) selector += `.${cls}`;
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

/**
 * Encontra label associada a um campo.
 */
export function findLabel(element: Element): string | null {
  // 1. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // 2. <label for="id">
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent?.trim() || null;
  }

  // 3. Closest <label> pai
  const parentLabel = element.closest('label');
  if (parentLabel) return parentLabel.textContent?.trim() || null;

  // 4. placeholder
  if (element instanceof HTMLInputElement && element.placeholder) {
    return element.placeholder;
  }

  return null;
}
```

### Integracao com CommunicationHub

O `CommunicationHub` existente ja tem tab "Orch" com `OrchChat`. Adicionar deteccao de role:

```typescript
// No CommunicationHub.tsx (localizar onde renderiza OrchChat):
// ANTES:
// <OrchChat />

// DEPOIS:
const { user } = useAuth();
const isStaff = ['admin', 'coordinator', 'teacher', 'staff'].includes(user?.role);

{isStaff ? <OrchAdminPanel /> : <OrchChat />}
```

### Validacao

1. Login como **staff** → CommunicationHub deve mostrar `OrchAdminPanel`
2. Login como **student** → CommunicationHub deve mostrar `OrchChat` (sem mudanca)
3. Na tab Chat: 3 sugestoes contextuais baseadas na rota
4. Enviar pergunta → resposta do admin chat com fontes
5. Se walkthrough disponivel → botao "Me guie passo a passo" aparece
6. Tab Alertas: badge com contagem, lista de alertas com cores por severity
7. Clicar alerta → marca como lido (opacity muda)
8. Dispensar alerta → some da lista
9. Ficar 30s parado → bolha "Precisa de ajuda?" aparece (StuckDetector)
10. Clicar "Sim" → abre OrchAdminPanel

### Definicao de pronto

- [ ] 8 componentes criados e renderizando
- [ ] OrchAdminPanel exibido para staff, OrchChat para student
- [ ] Sugestoes contextuais por rota
- [ ] Chat funcional com RAG + walkthroughs
- [ ] AlertsBadge com poll a cada 1 min
- [ ] AlertsPanel com 3 cores de severity
- [ ] DomFillPreview com confirm/cancel
- [ ] StuckDetector com timeout 30s e cooldown 5min
- [ ] dom-bridge: scanPage + fillField + buildUniqueSelector

---

## STORY-04.7: Admin Endpoints — 12 endpoints (5 pts, API)

**Tempo estimado:** 1 dia
**Complexidade:** Baixa (se services ja estao prontos)
**Dependencias:** STORY-04.3, STORY-04.4, STORY-04.5

### Mapa completo de endpoints

| # | Method | Path | Service | Pasta |
|---|--------|------|---------|-------|
| 1 | POST | /orch-admin/chat | orchAdminChat.chat | orchAdminChat/ |
| 2 | GET | /orch-admin/conversations | orchAdminChat.listConversations | orchAdminConversations/ |
| 3 | GET | /orch-admin/context/:route | orchAdminKnowledge.search | orchAdminContext/ |
| 4 | GET | /orch-admin/suggestions/:route | orchAdminWalkthroughs.suggestWhenStuck | orchAdminSuggestions/ |
| 5 | POST | /orch-admin/walkthrough/:id/start | orchAdminWalkthroughs.start | orchAdminWalkthroughStart/ |
| 6 | POST | /orch-admin/walkthrough/:id/complete | orchAdminWalkthroughs.complete | orchAdminWalkthroughComplete/ |
| 7 | GET | /orch-admin/walkthroughs | orchAdminWalkthroughs.getAvailable | orchAdminWalkthroughs/ |
| 8 | GET | /orch-admin/alerts | orchAdminAlerts.getAlerts | orchAdminAlerts/ |
| 9 | POST | /orch-admin/alerts/:id/read | orchAdminAlerts.markRead | orchAdminAlertsRead/ |
| 10 | POST | /orch-admin/alerts/:id/dismiss | orchAdminAlerts.dismiss | orchAdminAlertsDismiss/ |
| 11 | POST | /orch-admin/feedback | orchStaffFeedback.submitActive | orchAdminFeedback/ |
| 12 | POST | /orch-admin/dom/scan | local processing | orchAdminDomScan/ |

### Pattern para TODOS os endpoints

Cada endpoint segue EXATAMENTE este pattern:

```
apps/api/src/endpoints/{endpointName}/
├── index.ts          → export * from './{endpointName}'
└── {endpointName}.ts → method, path, middlewares, handler
```

**Template index.ts (igual para todos):**
```typescript
export * from './{endpointName}';
```

**Template {endpointName}.ts:**
```typescript
import type { RequestHandler } from 'express';
import type { Pool } from 'pg';
import { requireAuth } from '../../app/auth';
import { SERVICE_IMPORT } from '../../app/services/admin/SERVICE_FILE';

export const method = 'METHOD'; // GET ou POST
export const path = '/orch-admin/PATH';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const userId = req.user!.id;
      const tenantId = req.user!.tenantContext.primaryTenantId;

      // ... logica especifica do endpoint ...

      res.json(result);
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  };
}
```

### Criar todos de uma vez

```bash
# Criar pastas
cd apps/api/src/endpoints
mkdir -p orchAdminChat orchAdminConversations orchAdminContext orchAdminSuggestions \
  orchAdminWalkthroughStart orchAdminWalkthroughComplete orchAdminWalkthroughs \
  orchAdminAlerts orchAdminAlertsRead orchAdminAlertsDismiss \
  orchAdminFeedback orchAdminDomScan
```

### Endpoint 12 (especial): DOM Scan

O DOM scan NAO chama LLM. Apenas recebe snapshot do frontend e armazena para contexto:

```typescript
// apps/api/src/endpoints/orchAdminDomScan/orchAdminDomScan.ts
export const method = 'POST';
export const path = '/orch-admin/dom/scan';
export const middlewares = [requireAuth()];

export function handler({ pool }: { pool: Pool }): RequestHandler {
  return async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { route, elements } = req.body;
      // Armazenar snapshot no contexto da conversa ativa (se houver)
      // Ou em memoria do service para uso pelo chat
      res.json({ processed: true, fieldsDetected: elements?.length || 0 });
    } catch (err) {
      next(err);
    } finally {
      client.release();
    }
  };
}
```

### Auth matrix

| Role | Acesso |
|------|--------|
| student | NENHUM endpoint do EPIC-04 |
| teacher | Todos os endpoints |
| coordinator | Todos os endpoints |
| admin | Todos os endpoints |

Implementar verificacao de role no middleware ou no handler:

```typescript
// Opcao 1: Middleware dedicado
import { requireRole } from '../../app/auth';
export const middlewares = [requireAuth(), requireRole(['admin', 'coordinator', 'teacher', 'staff'])];

// Opcao 2: Check no handler (se requireRole nao existe)
if (!['admin', 'coordinator', 'teacher', 'staff'].includes(req.user?.role)) {
  return res.status(403).json({ error: 'Acesso restrito a staff' });
}
```

### Validacao completa (rodar TODOS)

```bash
# Obter token de admin
ADMIN_TOKEN="eyJ..." # token JWT valido

# Script de teste (salvar como test-epic04-endpoints.sh):
echo "=== EPIC-04 Endpoint Tests ==="

echo "1. POST /orch-admin/chat"
curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/v1/orch-admin/chat" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"como cadastro aluno?","routeContext":"/students"}'

echo "\n2. GET /orch-admin/conversations"
curl -s -w "\n%{http_code}" "http://localhost:3000/api/v1/orch-admin/conversations" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo "\n3. GET /orch-admin/context/:route"
curl -s -w "\n%{http_code}" "http://localhost:3000/api/v1/orch-admin/context/%2Fstudents" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo "\n4. GET /orch-admin/suggestions/:route"
curl -s -w "\n%{http_code}" "http://localhost:3000/api/v1/orch-admin/suggestions/%2Fstudents" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo "\n5. GET /orch-admin/walkthroughs"
curl -s -w "\n%{http_code}" "http://localhost:3000/api/v1/orch-admin/walkthroughs" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo "\n6. POST /orch-admin/walkthrough/:id/start"
curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/v1/orch-admin/walkthrough/create-student/start" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo "\n7. POST /orch-admin/walkthrough/:id/complete"
curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/v1/orch-admin/walkthrough/create-student/complete" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo "\n8. GET /orch-admin/alerts"
curl -s -w "\n%{http_code}" "http://localhost:3000/api/v1/orch-admin/alerts" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo "\n9. POST /orch-admin/alerts/:id/read"
curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/v1/orch-admin/alerts/PLACEHOLDER_UUID/read" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo "\n10. POST /orch-admin/alerts/:id/dismiss"
curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/v1/orch-admin/alerts/PLACEHOLDER_UUID/dismiss" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

echo "\n11. POST /orch-admin/feedback"
curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/v1/orch-admin/feedback" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messageId":"00000000-0000-0000-0000-000000000001","rating":"helpful"}'

echo "\n12. POST /orch-admin/dom/scan"
curl -s -w "\n%{http_code}" -X POST "http://localhost:3000/api/v1/orch-admin/dom/scan" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"route":"/students","elements":[{"selector":"#name","type":"input","label":"Nome"}]}'

echo "\n=== Done ==="
```

**Criterio:** Todos devem retornar 200 (ou 201). Se retornar 401 = problema de auth. Se retornar 404 = endpoint nao registrado no router.

### Registro no router

Verificar se o monorepo auto-registra endpoints ou se precisa registro manual:

```bash
# Buscar como endpoints sao registrados
grep -r "orchChat" apps/api/src/app/ --include="*.ts" -l
```

Se for auto-discovery (le da pasta `endpoints/`): apenas criar as pastas com a estrutura correta.
Se for manual: adicionar cada endpoint no arquivo de rotas.

### Definicao de pronto

- [ ] 12 pastas de endpoint criadas em `apps/api/src/endpoints/`
- [ ] Cada pasta com `index.ts` + `{nome}.ts`
- [ ] `requireAuth()` em TODOS
- [ ] Role check: student bloqueado, staff/teacher/coordinator/admin permitido
- [ ] Script de teste passando 12/12 (http 200)
- [ ] Endpoints registrados no router (auto ou manual)

---

## CHECKLIST FINAL EPIC-04

### Database (STORY-04.1)
- [ ] 7 tabelas criadas (orch_admin_embedding, orch_admin_conversation, orch_admin_message, orch_admin_walkthrough, orch_admin_walkthrough_usage, orch_admin_alert, orch_staff_feedback)
- [ ] Total orch_* = 22
- [ ] pgvector ativo + HNSW index em orch_admin_embedding
- [ ] pg_trgm ativo (para FAQ similarity)

### Knowledge Base (STORY-04.2)
- [ ] 14 YAMLs em `apps/api/src/data/orch-knowledge/`
- [ ] Script de ingestion funcional
- [ ] Embeddings no banco (100+ chunks)
- [ ] Busca semantica retornando resultados filtrados por rota

### Admin Chat (STORY-04.3)
- [ ] Chat contextualizado por rota (RAG filtrado)
- [ ] Intent detection: walkthrough, form_fill, explain, query, navigate
- [ ] FAQ learning: 3+ repeticoes = resposta instantanea
- [ ] Rolling summary a cada 5 mensagens
- [ ] Arquivamento automatico apos 30 dias
- [ ] SSE streaming funcional

### Alertas (STORY-04.4)
- [ ] 4 categorias: student, class, admission, system
- [ ] 3 severidades: info, warning, critical
- [ ] Auto-escalation de critical em 24h
- [ ] CRON de geracao + escalation a cada 6h
- [ ] Staff feedback ativo (rating + comment) e passivo (tracking)

### Walkthroughs (STORY-04.5)
- [ ] driver.js instalado
- [ ] 25 walkthroughs seeded (10 completos + 15 stubs)
- [ ] `data-tour` attributes nas paginas principais
- [ ] WalkthroughOverlay.tsx com tema Cogedu
- [ ] Tracking: start, complete, abandon + step_reached

### Frontend (STORY-04.6)
- [ ] OrchAdminPanel renderizado para staff
- [ ] OrchChat mantido para student (sem mudanca)
- [ ] OrchHeader com badge de rota
- [ ] OrchSuggestedQuestions: 3 perguntas por rota
- [ ] AlertsBadge com poll 1min (vermelho=critical, amarelo=warning)
- [ ] AlertsPanel com 3 cores + dismiss + action_url
- [ ] DomFillPreview com confirm/cancel
- [ ] StuckDetector: 30s timeout, 5min cooldown
- [ ] dom-bridge: scanPage, fillField, buildUniqueSelector, findLabel

### Endpoints (STORY-04.7)
- [ ] 12 endpoints criados e registrados
- [ ] `requireAuth()` em TODOS
- [ ] Role check bloqueando students
- [ ] Script de teste 12/12 passando

---

## ORDEM DE EXECUCAO RECOMENDADA

```
Dia 1:
  STORY-04.1 (migration) ........ 30 min
  STORY-04.2 (YAMLs + ingestion)  4-6h

Dia 2-3:
  STORY-04.3 (admin chat service)  8-12h

Dia 4:
  STORY-04.4 (alertas + feedback)  4-6h
  STORY-04.5 (walkthroughs backend) 2-3h

Dia 5-6:
  STORY-04.5 (walkthroughs frontend) 3-4h
  STORY-04.6 (8 componentes)      8-10h

Dia 7:
  STORY-04.7 (12 endpoints)       4-6h
  Testes de integracao             2-3h
```

**Total:** 7-10 dias uteis

---

## REFERENCIAS CRUZADAS

| Documento | Path | Conteudo |
|-----------|------|----------|
| Guia principal | `implementation/GUIA-GIUSEPPE.md` | Visao geral + patterns |
| Endpoints EPIC-04 | `implementation/EPIC-02-03-04-ENDPOINTS.md` (secao EPIC-04) | Contratos de API |
| Migration SQL | `implementation/migrations/1942000005--orch_admin.sql` | DDL das 7 tabelas |
| Service: Knowledge | `implementation/services/admin/orch-admin-knowledge.ts` | RAG ingestion + search |
| Service: Chat | `implementation/services/admin/orch-admin-chat.ts` | Admin chat + intent |
| Service: Alerts | `implementation/services/admin/orch-admin-alerts.ts` | Alertas proativos |
| Service: Walkthroughs | `implementation/services/admin/orch-admin-walkthroughs.ts` | Guias passo-a-passo |
| Service: Feedback | `implementation/services/admin/orch-staff-feedback.ts` | Feedback ativo + passivo |
| Frontend guide | `implementation/FRONTEND-COMPONENTS.md` | Componentes React |
