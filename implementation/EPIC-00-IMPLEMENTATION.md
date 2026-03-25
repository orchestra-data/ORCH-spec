# EPIC-00: Cleanup & Security — Guia de Implementacao Cirurgico

**Para:** Giuseppe "King Witcher"
**Stack:** Express 5 + React 19 monorepo
**Codebase Admin:** `C:/Projetos IA/Plataforma Cogedu/localhost/cogedu-dev-v6/cogedu-main/`
**AVA (Student):** Paginas do AVA estao no mesmo monorepo — `apps/web/src/`
**Pontos totais:** 10 pts (3 + 1 + 1 + 2 + 3)
**Prioridade:** CRITICA — executar antes de qualquer outro EPIC

---

## STORY-00.1: Corrigir Vulnerabilidades de Seguranca (3 pts)

### 1A. Adicionar `requireAuth()` no endpoint `adminInterventionAudit`

**Arquivo:**
```
apps/api/src/endpoints/adminInterventionAudit/adminInterventionAudit.ts
```

**Problema:** O array `middlewares` esta vazio — qualquer pessoa pode consultar o audit log de intervencoes administrativas sem autenticacao.

**Localizar:**
```bash
grep -n "export const middlewares" apps/api/src/endpoints/adminInterventionAudit/adminInterventionAudit.ts
```

Vai retornar a linha 35:
```typescript
export const middlewares = [];
```

**Alterar para:**
```typescript
export const middlewares = [requireAuth()];
```

**Adicionar o import no topo do arquivo** (logo abaixo dos imports existentes de `express` e `pg`):
```typescript
import { requireAuth } from '../../app/auth';
```

O arquivo ja importa de `../../app/services/admin-intervention-service` — adicione o import de auth ANTES dele.

**Verificar:** O handler usa `req.headers['x-tenant-id']` na linha 40 mas NAO usa `req.user`. Apos adicionar requireAuth, considerar trocar para usar `req.user.tenantContext.primaryTenantId` em vez de confiar no header (que pode ser spoofado). Isso e um refactor bonus — o minimo e adicionar o middleware.

---

### 1B. Adicionar validacao de membership em `sendClassMessage`

**Arquivo:**
```
apps/api/src/endpoints/sendClassMessage/sendClassMessage.ts
```

**Problema:** Ha um TODO explicito na linha 46:
```typescript
// TODO: Validate if user is allowed to send to this class (e.g. is enrolled or is instructor)
```

O endpoint permite que qualquer usuario autenticado envie mensagens para QUALQUER turma, mesmo sem ser aluno ou professor dela.

**Localizar:**
```bash
grep -n "TODO.*Validate" apps/api/src/endpoints/sendClassMessage/sendClassMessage.ts
```

**Substituir o TODO (linha 46) por esta validacao:**

```typescript
            // Validate user belongs to this class (enrolled student or instructor)
            const membershipCheck = await pool.query(
                `SELECT 1 FROM class_enrollment
                 WHERE class_instance_id = $1
                 AND user_id = $2
                 AND status IN ('active', 'enrolled')
                 LIMIT 1`,
                [body.classInstanceId, senderId]
            );

            if (membershipCheck.rows.length === 0) {
                // Also check if user is instructor for this class
                const instructorCheck = await pool.query(
                    `SELECT 1 FROM class_instance
                     WHERE id = $1
                     AND (instructor_id = $2 OR created_by = $2)
                     LIMIT 1`,
                    [body.classInstanceId, senderId]
                );

                if (instructorCheck.rows.length === 0) {
                    return res.status(403).json({
                        error: 'User is not a member of this class',
                    });
                }
            }
```

**NOTA:** Verificar os nomes reais das colunas. Rodar antes:
```bash
grep -rn "class_enrollment" apps/api/src/ --include="*.ts" | head -20
grep -rn "class_instance" apps/api/src/ --include="*.sql" | head -20
```

Se a tabela de enrollment tiver colunas diferentes (ex: `student_id` em vez de `user_id`), ajustar. A query exata depende do schema real. O padrao no seed e:
- Tabela: `class_enrollment`
- Colunas provaveis: `class_instance_id`, `user_id` ou `student_id`, `status`

---

### Como Validar STORY-00.1

```bash
# 1. Testar adminInterventionAudit sem token (deve dar 401)
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:3001/api/admin/intervention-audit \
  -H "x-tenant-id: 00000000-0000-4000-8000-000000000001"
# Esperado: 401

# 2. Testar sendClassMessage com user que NAO pertence a turma (deve dar 403)
# (usar um token valido de um usuario que nao esta enrolled)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3001/api/sendClassMessage \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "x-tenant-id: 00000000-0000-4000-8000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{"classInstanceId": "UUID_TURMA", "content": "test"}'
# Esperado: 403

# 3. Testar sendClassMessage com user que PERTENCE a turma (deve dar 201)
# Esperado: 201 com o objeto da mensagem
```

---

## STORY-00.2: Verificar Endpoints Nao Registrados (1 pt)

### Contexto Importante

O sistema usa **auto-loading** de endpoints. O arquivo:
```
apps/api/src/app/load-endpoints/load-endpoints.ts
```

Le TODAS as pastas dentro de `apps/api/src/endpoints/` e importa automaticamente. NAO existe um arquivo `index.ts` central que lista endpoints manualmente.

**Regra do auto-loader:** Qualquer pasta que:
- NAO tem `.` no nome
- NAO comeca com `_`
- NAO e `__tests__`

...sera importada automaticamente.

### Verificacao

Os dois endpoints JA EXISTEM como pastas:

```
apps/api/src/endpoints/initiateStudentConversation/
  ├── index.ts                          (re-exporta)
  └── initiateStudentConversation.ts    (handler com requireAuth + yup)

apps/api/src/endpoints/searchComponentTranscription/
  ├── index.ts                          (re-exporta)
  └── searchComponentTranscription.ts   (handler com requireAuth + RAG service)
```

Ambos exportam `method`, `path`, `middlewares` e `handler` corretamente.

### O que verificar

1. **Confirmar que o auto-loader esta pegando eles:**
```bash
# Subir o servidor e procurar nos logs
grep "initiateStudentConversation\|searchComponentTranscription" <log-output>
# Ou procurar na saida de startup: "[endpoint-loader] importing ..."
```

2. **Testar via curl que respondem:**
```bash
# initiateStudentConversation (POST, requer auth)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3001/api/initiateStudentConversation \
  -H "Content-Type: application/json"
# Esperado: 401 (sem token) — prova que o endpoint esta registrado

# searchComponentTranscription (POST, requer auth)
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3001/api/searchComponentTranscription \
  -H "Content-Type: application/json"
# Esperado: 401 (sem token) — prova que o endpoint esta registrado

# Se retornar 404 = endpoint NAO esta sendo carregado
```

3. **Se retornar 404**, verificar:
   - O auto-loader busca em `apps/api/src/endpoints/`
   - Verificar se o nome da pasta tem caracter invalido
   - Verificar logs de startup por erros de import

### Como Validar STORY-00.2

```bash
# Ambos devem retornar 401 (nao 404)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/initiateStudentConversation
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/searchComponentTranscription
```

Se ambos retornam 401: **Story concluida** — eles ja estao registrados via auto-loader.

---

## STORY-00.3: Remover Codigo Morto (1 pt)

### 3A. Deletar `FloatingChat.tsx`

**Arquivo:**
```
apps/web/src/components/FloatingChat.tsx
```

**Antes de deletar**, verificar quem importa:
```bash
grep -rn "FloatingChat" apps/web/src/ --include="*.tsx" --include="*.ts"
```

Na investigacao atual, so o proprio arquivo exporta `FloatingChat`. Se houver outros imports, remover essas linhas tambem.

```bash
rm apps/web/src/components/FloatingChat.tsx
```

### 3B. Deletar `AIAssistant.tsx`

**Localizar:**
```bash
find apps/web/src -name "AIAssistant.tsx" -o -name "AIAssistant.ts"
```

Na investigacao atual, o arquivo NAO foi encontrado no monorepo dev-v6. Pode ter sido removido ou estar no AVA (repo separado). Se nao existir, pular.

### 3C. Deletar `FloatingAIAssistant.tsx`

**Localizar:**
```bash
find apps/web/src -name "FloatingAIAssistant.tsx" -o -name "FloatingAIAssistant.ts"
```

Na investigacao atual, o arquivo NAO foi encontrado no monorepo dev-v6. Pode ter sido removido ou estar no AVA (repo separado). Se nao existir, pular.

### 3D. Remover `console.log` de `ClassChat.tsx`

**Localizar:**
```bash
find apps/web/src -name "ClassChat.tsx" -path "*/chat/*"
grep -rn "ClassChat" apps/web/src/ --include="*.tsx" | head -10
```

Na investigacao atual, `ClassChat.tsx` NAO foi encontrado no monorepo dev-v6. Pode estar em:
- `apps/web/src/components/chat/ClassChat.tsx`
- `apps/web/src/components/communication-hub/ClassChat.tsx`
- Ou no AVA separado

Se encontrar, remover TODOS os `console.log`:
```bash
grep -n "console.log" <path-to-ClassChat.tsx>
```

E deletar cada linha que contem `console.log`. Manter `console.error` e `console.warn`.

### 3E. Verificar imports quebrados apos delecao

```bash
# Apos deletar os arquivos, rodar:
npx tsc --noEmit 2>&1 | grep -i "FloatingChat\|AIAssistant\|FloatingAIAssistant\|ClassChat"

# Se houver erros, corrigir os imports nos arquivos referenciados
```

### Como Validar STORY-00.3

```bash
# 1. Confirmar arquivos deletados
ls apps/web/src/components/FloatingChat.tsx 2>/dev/null && echo "ERRO: ainda existe" || echo "OK: deletado"

# 2. Confirmar sem console.log (se ClassChat existir)
grep -c "console.log" apps/web/src/components/chat/ClassChat.tsx 2>/dev/null
# Esperado: 0 ou arquivo nao encontrado

# 3. TypeScript compila sem erros relacionados
npx tsc --noEmit 2>&1 | grep -c "FloatingChat\|AIAssistant"
# Esperado: 0
```

---

## STORY-00.4: Migrar Permissoes de Certificacao (2 pts)

### Contexto

O sistema de certificados originalmente usava permissoes `edu.component.*` (da migration `1785000002`). Agora existe uma migration propria `1926000001--certification-permissions.sql` que ja criou as permissoes `edu.certificate.*` e `edu.document.*`.

**Arquivos relevantes:**

| Arquivo | Conteudo |
|---------|----------|
| `libs/migrations/identity/1785000002--educational_permissions_and_roles.sql` | Permissoes originais `edu.component.*` |
| `libs/migrations/identity/1926000001--certification-permissions.sql` | Permissoes novas `edu.certificate.*` + `edu.document.*` |
| `apps/api/src/endpoints/permissionsCatalog/permissionsCatalog.ts` | Catalogo frontend que lista permissoes por grupo |
| `scripts/seed-dev-complete.sql` | Seeds de dev com `edu.component.*` (linhas 103-107) |
| `scripts/seed-dev-complete-safe.sql` | Seeds safe com `ON CONFLICT DO NOTHING` |

### 4A. Verificar que a migration `1926000001` ja rodou

```bash
# Conectar ao banco dev (porta 5433 para dev-v6)
psql -h localhost -p 5433 -U postgres -d dev -c \
  "SELECT key FROM permission WHERE key LIKE 'edu.certificate.%' OR key LIKE 'edu.document.%' ORDER BY key;"
```

Deveria retornar:
- `edu.certificate.create`
- `edu.certificate.read`
- `edu.certificate.update`
- `edu.certificate.delete`
- `edu.document.read`
- `edu.document.approve`

Se NAO existirem, rodar a migration manualmente:
```bash
psql -h localhost -p 5433 -U postgres -d dev -f \
  libs/migrations/identity/1926000001--certification-permissions.sql
```

### 4B. Atualizar o permissionsCatalog para incluir `edu.certificate`

**Arquivo:**
```
apps/api/src/endpoints/permissionsCatalog/permissionsCatalog.ts
```

**Localizar:**
```bash
grep -n "edu.component" apps/api/src/endpoints/permissionsCatalog/permissionsCatalog.ts
```

No catalogo de grupos (por volta da linha 40), adicionar `edu.certificate` como grupo novo:

```typescript
{ id: 'edu.certificate', label: 'Certificados', crud: true, keyPrefix: 'edu.certificate' },
{ id: 'edu.document', label: 'Documentos Academicos', crud: false, keyPrefix: 'edu.document' },
```

Adicionar logo apos a linha de `edu.component`.

Nos templates de roles (buscar por `edu.component.*` nas linhas ~268 e ~306), adicionar:
```typescript
'edu.certificate.*',
'edu.document.*',
```

### 4C. NAO remover `edu.component.*` ainda

As permissoes `edu.component.*` sao usadas para componentes de CONTEUDO (videos, PDFs, etc.), nao so certificados. **NAO deletar.** O que fazemos e ADICIONAR as novas permissoes de certificado, sem remover as de componente.

A confusao vem do nome — `edu.component.*` controla componentes educacionais (learning objects), nao certificados. Os endpoints de certificado ja usam `edu.certificate.*` (verificar na migration `1926000001`).

### 4D. Atualizar seeds de dev

**Arquivo:** `scripts/seed-dev-complete-safe.sql`

Adicionar ao final (ou na secao de permissions):

```sql
-- Certification permissions (edu.certificate.* + edu.document.*)
-- Estas permissoes sao criadas pela migration 1926000001, mas o seed precisa ter para ambientes fresh
INSERT INTO public.permission VALUES (uuid_generate_v4(), NULL, 'edu.certificate.create', 'Criar Certificados', 'Pode criar templates de certificado e emitir certificados') ON CONFLICT DO NOTHING;
INSERT INTO public.permission VALUES (uuid_generate_v4(), NULL, 'edu.certificate.read', 'Visualizar Certificados', 'Pode visualizar templates e certificados emitidos') ON CONFLICT DO NOTHING;
INSERT INTO public.permission VALUES (uuid_generate_v4(), NULL, 'edu.certificate.update', 'Editar Certificados', 'Pode editar templates de certificado') ON CONFLICT DO NOTHING;
INSERT INTO public.permission VALUES (uuid_generate_v4(), NULL, 'edu.certificate.delete', 'Excluir/Revogar Certificados', 'Pode excluir templates e revogar certificados') ON CONFLICT DO NOTHING;
INSERT INTO public.permission VALUES (uuid_generate_v4(), NULL, 'edu.document.read', 'Visualizar Documentos', 'Pode visualizar solicitacoes de documentos academicos') ON CONFLICT DO NOTHING;
INSERT INTO public.permission VALUES (uuid_generate_v4(), NULL, 'edu.document.approve', 'Aprovar Documentos', 'Pode aprovar solicitacoes de documentos academicos') ON CONFLICT DO NOTHING;
```

**NOTA:** A migration `1926000001` ja usa `ON CONFLICT (tenant_id, key) DO NOTHING`, entao e seguro rodar multiplas vezes.

### Como Validar STORY-00.4

```bash
# 1. Permissoes existem no banco
psql -h localhost -p 5433 -U postgres -d dev -c \
  "SELECT key, name FROM permission WHERE key LIKE 'edu.certificate.%' OR key LIKE 'edu.document.%';"
# Esperado: 6 linhas

# 2. Admin tem as permissoes
psql -h localhost -p 5433 -U postgres -d dev -c \
  "SELECT p.key FROM role_permission rp
   JOIN permission p ON rp.permission_id = p.id
   JOIN role r ON rp.role_id = r.id
   WHERE r.slug = 'admin' AND p.key LIKE 'edu.certificate.%';"
# Esperado: 4 linhas (create, read, update, delete)

# 3. Coordinator tem permissoes limitadas
psql -h localhost -p 5433 -U postgres -d dev -c \
  "SELECT p.key FROM role_permission rp
   JOIN permission p ON rp.permission_id = p.id
   JOIN role r ON rp.role_id = r.id
   WHERE r.slug = 'coordinator' AND (p.key LIKE 'edu.certificate.%' OR p.key LIKE 'edu.document.%');"
# Esperado: create, read, document.read, document.approve

# 4. PermissionsCatalog retorna os novos grupos
curl -s http://localhost:3001/api/permissions-catalog | grep -o "edu.certificate"
# Esperado: encontra matches
```

---

## STORY-00.5: Wire-up Certificados e Documentos no AVA (3 pts)

### Contexto

Os endpoints de backend JA EXISTEM e funcionam:
- `GET /certification/my-certificates` — arquivo: `apps/api/src/endpoints/getStudentCertificates/getStudentCertificates.ts`
- `POST /certification/documents/request` — arquivo: `apps/api/src/endpoints/requestDocument/requestDocument.ts`

Os tipos da API AVA tambem existem em:
```
libs/ava-api-types/src/endpoints/certification/
```

O que falta e o FRONTEND conectar a esses endpoints em vez de usar dados mock.

### 5A. Localizar `CertificatesPage.tsx`

```bash
find apps/web/src -name "*Certificate*Page*" -o -name "*certificates*page*"
grep -rn "MOCK_API_CERTIFICATES\|MOCK_CERTIFICATES\|mockCertificates" apps/web/src/ --include="*.tsx" --include="*.ts"
```

Se o arquivo NAO existir no monorepo admin (provavel — pode ser do AVA separado), ele precisa ser CRIADO em:
```
apps/web/src/routes/certification/MyCertificates/MyCertificatesPage.tsx
```

**Implementacao:**

```typescript
import { useState, useEffect } from 'react';
import { useApiClient } from '../../../hooks/useApiClient';

interface Certificate {
  id: string;
  templateName: string;
  issuedAt: string;
  status: 'active' | 'revoked' | 'expired';
  downloadUrl?: string;
  validationCode: string;
}

export function MyCertificatesPage() {
  const api = useApiClient();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCertificates() {
      try {
        setLoading(true);
        const response = await api.get('/certification/my-certificates');
        setCertificates(response.data.certificates ?? response.data);
      } catch (err) {
        setError('Erro ao carregar certificados. Tente novamente.');
        console.error('Failed to fetch certificates:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCertificates();
  }, [api]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 text-destructive rounded-md">
        {error}
      </div>
    );
  }

  if (certificates.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        Voce ainda nao possui certificados emitidos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {certificates.map((cert) => (
        <div key={cert.id} className="border rounded-lg p-4 flex justify-between items-center">
          <div>
            <h3 className="font-medium">{cert.templateName}</h3>
            <p className="text-sm text-muted-foreground">
              Emitido em: {new Date(cert.issuedAt).toLocaleDateString('pt-BR')}
            </p>
            <p className="text-xs text-muted-foreground">
              Codigo: {cert.validationCode}
            </p>
          </div>
          <div className="flex gap-2">
            {cert.downloadUrl && (
              <a href={cert.downloadUrl} target="_blank" rel="noreferrer"
                 className="text-sm text-primary hover:underline">
                Download
              </a>
            )}
            <span className={`text-xs px-2 py-1 rounded ${
              cert.status === 'active' ? 'bg-green-100 text-green-800' :
              cert.status === 'revoked' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {cert.status === 'active' ? 'Ativo' :
               cert.status === 'revoked' ? 'Revogado' : 'Expirado'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**NOTA:** Adaptar ao hook de API real do projeto. Verificar:
```bash
grep -rn "useApiClient\|useApi\|apiClient\|useFetch" apps/web/src/hooks/ --include="*.ts" | head -10
```

Se o projeto usa `fetch` com `apiClient.ts`, adaptar para o padrao existente. **ZERO AXIOS.**

### 5B. Localizar `DocumentsPage.tsx`

```bash
find apps/web/src -name "*Document*Page*" -o -name "*documents*page*"
grep -rn "MOCK_DOCUMENTS\|mockDocuments" apps/web/src/ --include="*.tsx" --include="*.ts"
```

Se nao existir, criar em:
```
apps/web/src/routes/certification/RequestDocument/RequestDocumentPage.tsx
```

**Implementacao:**

```typescript
import { useState } from 'react';
import { useApiClient } from '../../../hooks/useApiClient';

type DocumentType =
  | 'enrollment_declaration'
  | 'completion_declaration'
  | 'attendance_declaration'
  | 'affiliation_declaration'
  | 'grade_report';

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  enrollment_declaration: 'Declaracao de Matricula',
  completion_declaration: 'Declaracao de Conclusao',
  attendance_declaration: 'Declaracao de Frequencia',
  affiliation_declaration: 'Declaracao de Vinculo',
  grade_report: 'Historico Escolar',
};

export function RequestDocumentPage() {
  const api = useApiClient();
  const [selectedType, setSelectedType] = useState<DocumentType | ''>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedType) {
      setError('Selecione o tipo de documento.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await api.post('/certification/documents/request', {
        type: selectedType,
        reason: reason || undefined,
      });

      setSuccess(
        `Solicitacao criada com sucesso. Protocolo: ${response.data.protocolNumber ?? response.data.id}`
      );
      setSelectedType('');
      setReason('');
    } catch (err) {
      setError('Erro ao solicitar documento. Tente novamente.');
      console.error('Failed to request document:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium mb-1">
          Tipo de Documento
        </label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as DocumentType)}
          className="w-full border rounded-md p-2"
        >
          <option value="">Selecione...</option>
          {Object.entries(DOCUMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Motivo (opcional)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border rounded-md p-2"
          rows={3}
          placeholder="Descreva o motivo da solicitacao..."
        />
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 text-green-800 rounded-md text-sm">
          {success}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !selectedType}
        className="bg-primary text-primary-foreground px-4 py-2 rounded-md disabled:opacity-50"
      >
        {loading ? 'Enviando...' : 'Solicitar Documento'}
      </button>
    </form>
  );
}
```

### 5C. Registrar as rotas (se necessario)

Verificar se ja existem rotas para essas paginas:
```bash
grep -rn "my-certificates\|request-document\|MyCertificates\|RequestDocument" apps/web/src/ --include="*.tsx" --include="*.ts" | head -10
```

Se nao existirem, adicionar no router de certificacao:
```
apps/web/src/routes/certification/index.ts
```

### Como Validar STORY-00.5

```bash
# 1. Backend responde (com auth)
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:3001/api/certification/my-certificates \
  -H "Authorization: Bearer TOKEN"
# Esperado: 200 (com token valido) ou 401 (sem token)

# 2. Request document funciona
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3001/api/certification/documents/request \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "enrollment_declaration"}'
# Esperado: 201 ou 200

# 3. Frontend compila sem erros
npx tsc --noEmit

# 4. Verificar que nao ha mais mocks
grep -rn "MOCK_API_CERTIFICATES\|MOCK_DOCUMENTS\|MOCK_CERTIFICATES" apps/web/src/
# Esperado: 0 resultados
```

---

## Done Checklist

### STORY-00.1: Seguranca (3 pts)
- [ ] `adminInterventionAudit.ts` tem `requireAuth()` no array de middlewares
- [ ] `adminInterventionAudit.ts` tem `import { requireAuth } from '../../app/auth'`
- [ ] `sendClassMessage.ts` valida membership (enrollment ou instructor) antes de enviar
- [ ] `sendClassMessage.ts` retorna 403 quando usuario nao pertence a turma
- [ ] Endpoint audit retorna 401 sem token
- [ ] Endpoint sendClassMessage retorna 403 sem membership

### STORY-00.2: Endpoints (1 pt)
- [ ] `initiateStudentConversation` responde (401, nao 404) sem auth
- [ ] `searchComponentTranscription` responde (401, nao 404) sem auth
- [ ] Logs de startup confirmam que ambos sao carregados

### STORY-00.3: Codigo morto (1 pt)
- [ ] `FloatingChat.tsx` deletado
- [ ] `AIAssistant.tsx` deletado (se existir)
- [ ] `FloatingAIAssistant.tsx` deletado (se existir)
- [ ] Zero `console.log` em `ClassChat.tsx` (se existir)
- [ ] `npx tsc --noEmit` compila sem erros relacionados
- [ ] Zero imports quebrados (`grep -rn "FloatingChat\|AIAssistant" apps/web/src/`)

### STORY-00.4: Permissoes (2 pts)
- [ ] Permissoes `edu.certificate.*` existem no banco
- [ ] Permissoes `edu.document.*` existem no banco
- [ ] Role admin tem `edu.certificate.*` + `edu.document.*`
- [ ] Role coordinator tem `edu.certificate.create/read` + `edu.document.read/approve`
- [ ] `permissionsCatalog.ts` inclui grupos `edu.certificate` e `edu.document`
- [ ] Seeds atualizados com as novas permissoes
- [ ] Permissoes `edu.component.*` NAO foram removidas (sao para outro dominio)

### STORY-00.5: Wire-up AVA (3 pts)
- [ ] `CertificatesPage` chama `GET /certification/my-certificates` (nao mock)
- [ ] `DocumentsPage` chama `POST /certification/documents/request` (nao mock)
- [ ] Loading state funciona (spinner enquanto carrega)
- [ ] Error state funciona (mensagem de erro quando falha)
- [ ] Empty state funciona (mensagem quando nao tem certificados)
- [ ] Zero `MOCK_*` restantes no codigo frontend
- [ ] TypeScript compila sem erros

---

## Ordem de Execucao Recomendada

```
1. STORY-00.1 (seguranca) — mais critico
2. STORY-00.3 (limpeza) — rapido, desbloqueia tsc limpo
3. STORY-00.2 (verificacao) — so curl, 15 min
4. STORY-00.4 (permissoes) — precisa antes do 00.5
5. STORY-00.5 (wire-up) — depende de permissoes funcionando
```

## Dicas Rapidas

- **API base URL dev:** `http://localhost:3001/api/`
- **Banco dev:** `psql -h localhost -p 5433 -U postgres -d dev`
- **TypeCheck:** `npx tsc --noEmit` (rodar da raiz do monorepo)
- **Auto-loader:** Endpoints novos so precisam de uma pasta em `apps/api/src/endpoints/` — zero config
- **Auth import:** `import { requireAuth } from '../../app/auth'` (barrel export)
- **ZERO AXIOS:** Usar `fetch` via `apiClient.ts` no frontend
