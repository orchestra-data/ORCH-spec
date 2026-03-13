# Guia de Integracao: Cogfy Messager + CogEdu

Este guia explica como configurar a integracao entre o Cogfy Messager e o CogEdu para tracking de eventos WhatsApp.

## Arquitetura

```
[WhatsApp]     [Cogfy Messager]              [CogEdu API]
    |               |                             |
    | Msg           |                             |
    |-------------->|                             |
    |               |                             |
    |               | GET /getMyEducationalContent
    |               | X-API-Key: cgfy_...         <-- UMA CHAMADA
    |               | cogfy-contact-wa-id: 5511999999999
    |               |---------------------------->|
    |               |                             |
    |               |           Middleware resolve usuario
    |               |           pelo telefone (phone_e164)
    |               |           e extrai tenant_id do usuario
    |               |                             |
    |               |           Endpoint processa
    |               |           usando req.user
    |               |                             |
    |               |<----------------------------|
    |               |     { content... }          |
    |<--------------|                             |
    | Resposta      |                             |
```

**IMPORTANTE**: O Cogfy Messager NAO precisa saber o tenant_id ou user_id!
- Ele envia apenas o **numero de telefone** no header `cogfy-contact-wa-id`
- A API resolve o usuario e tenant automaticamente pelo telefone

## 1. Configuracao

### 1.1 Migrations Necessarias

Execute as migrations **na ordem**:

```bash
# Rodar todas as migrations pendentes
npm run migrate:dev

# Ou executar individualmente:
npm run migrate:identity -- --file 1931000000--seed_cogfy_messager_service_account.sql
npm run migrate:identity -- --file 1932000000--whatsapp_event_idempotency.sql
npm run migrate:identity -- --file 1933000000--service_account_api_key.sql
```

### 1.2 Gerar API Key

```bash
# Requer DATABASE_URL_IDENTITY configurado
DATABASE_URL_IDENTITY="postgres://..." DATABASE_SSL=0 node scripts/generate-cogfy-api-key.js
```

**IMPORTANTE**: A API Key sera exibida **apenas uma vez**! Copie imediatamente.

Formato da chave: `cgfy_<64 caracteres hexadecimais>`

### 1.3 Configurar no Cogfy Messager

```bash
COGEDU_API_URL=https://api.cogedu.com.br
COGEDU_API_KEY=cgfy_<sua_api_key>
```

**Pronto!** Nao precisa configurar Keycloak.

## 2. Detalhes das Migrations

### Conteudo das Migrations

**1931000000--seed_cogfy_messager_service_account.sql**:
```sql
INSERT INTO service_account (
  id, tenant_id, keycloak_client_id, name, description, permissions, is_active
) VALUES (
  gen_random_uuid(),
  NULL,  -- NULL = cross-tenant (resolve tenant pelo usuario)
  'cogfy-messager',
  'Cogfy Messager',
  'WhatsApp integration - identifica usuarios por telefone',
  '[]'::jsonb,
  true
) ON CONFLICT (keycloak_client_id) WHERE tenant_id IS NULL
DO UPDATE SET is_active = EXCLUDED.is_active;
```

**1932000000--whatsapp_event_idempotency.sql**:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_experience_events_whatsapp_idempotency
ON experience_events (object_id)
WHERE object_type LIKE 'whatsapp_%';
```

**1933000000--service_account_api_key.sql**:
```sql
ALTER TABLE service_account
ADD COLUMN IF NOT EXISTS api_key_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_account_api_key_hash
  ON service_account (api_key_hash)
  WHERE api_key_hash IS NOT NULL;
```

## 3. Testando a Integracao

### 3.1 Teste com curl

```bash
curl -X GET "http://localhost:3000/getMyEducationalContent" \
  -H "X-API-Key: cgfy_<SUA_API_KEY>" \
  -H "cogfy-contact-wa-id: <TELEFONE_DO_ESTUDANTE>"
```

### 3.2 Headers

| Header | Obrigatorio | Descricao |
|--------|-------------|-----------|
| `X-API-Key` | Sim | API Key do service account |
| `cogfy-contact-wa-id` | Sim | Numero WhatsApp do estudante (formato E.164) |
| `cogfy-workspace-id` | Nao | ID do workspace no Cogfy (para auditoria) |
| `cogfy-conversation-id` | Nao | ID da conversa (para auditoria) |
| `cogfy-contact-id` | Nao | ID do contato no Cogfy (para auditoria) |

**IMPORTANTE**: O Cogfy Messager NAO envia `x-tenant-id` nem `x-cogfy-user-id`!
O middleware resolve automaticamente o usuario e tenant pelo telefone.

### 3.3 Formato do Telefone

O telefone pode ser enviado em varios formatos - o middleware normaliza automaticamente:

| Formato Enviado | Normalizado Para |
|-----------------|------------------|
| `11999999999` | `+5511999999999` |
| `5511999999999` | `+5511999999999` |
| `+5511999999999` | `+5511999999999` |
| `551199999999` | `+5511999999999` (adiciona 9) |

O telefone e comparado com a coluna `phone_e164` da tabela `user`.

### 3.4 Verificar Evento no Banco

```sql
SELECT
  id, actor_id, object_type, verb, timestamp,
  result_metadata, context_data
FROM experience_events
WHERE object_type LIKE 'whatsapp_%'
ORDER BY timestamp DESC
LIMIT 10;
```

## 4. Fluxo Completo

```
1. Estudante envia mensagem no WhatsApp
2. Cogfy Messager recebe a mensagem
3. Cogfy Messager chama API do CogEdu:
   - Header: X-API-Key: cgfy_<api_key>
   - Header: cogfy-contact-wa-id: <telefone_do_estudante>
4. Middleware cogfy-user-context.ts:
   - Valida API Key
   - Normaliza telefone para E.164
   - Busca usuario por phone_e164 na tabela user
   - Extrai tenant_id do registro do usuario
   - Substitui req.user com contexto do estudante
   - Substitui req.tenantContext com tenant do estudante
5. Endpoint processa a requisicao (usa req.user.id normalmente)
6. Middleware enfileira evento no outbox (apos response)
7. Consumer persiste em experience_events
8. BI Dashboard exibe analytics
```

## 5. Troubleshooting

### API Key invalida
```json
{
  "error": "INVALID_API_KEY",
  "message": "Invalid or inactive API key"
}
```
- Verifique se a API Key foi gerada corretamente com `node scripts/generate-cogfy-api-key.js`
- Verifique se o service account esta ativo no banco (`is_active = true`)
- Verifique se a API Key esta completa (formato: `cgfy_<64 caracteres>`)

### Usuario nao encontrado (404)
```json
{
  "error": "USER_NOT_FOUND",
  "message": "Usuario nao encontrado com este numero de telefone"
}
```
- Verifique se o telefone esta cadastrado na coluna `phone_e164` da tabela `user`
- O usuario deve ter `user_type = 'student'` e `deleted_at IS NULL`
- Verifique o formato do telefone (deve ser normalizavel para E.164)

### Verificar telefone no banco
```sql
SELECT id, full_name, email, phone_e164, tenant_id, user_type
FROM "user"
WHERE phone_e164 LIKE '%999999999%'
  AND deleted_at IS NULL;
```

### Evento duplicado ignorado
```
WhatsApp event skipped (duplicate)
```
- Normal! O sistema usa idempotencia por requestId
- Cada requestId so gera um evento

### Dados nao aparecem no BI
- Verifique o range de datas no filtro
- Confira se o consumer esta rodando
- Verifique se ha eventos em `experience_events`

## 6. Arquivos Relevantes

```
apps/api/src/
├── app/
│   ├── auth/
│   │   └── service-account.ts          # Validacao de API Key
│   └── middleware/
│       ├── cogfy-user-context.ts       # Resolve usuario por telefone
│       └── index.ts                    # Registro dos middlewares
├── consumers/
│   └── whatsapp-interaction-consumer.ts # Consumer de eventos
└── endpoints/
    ├── getMyEducationalContent/        # Endpoint que gera eventos
    └── getBIWhatsAppAnalytics/         # Endpoint do BI

scripts/
└── generate-cogfy-api-key.js           # Gera API Key para cogfy-messager

libs/
├── event-types/src/index.ts            # Tipos de eventos
└── migrations/identity/
    ├── 1931000000--seed_cogfy_messager_service_account.sql
    ├── 1932000000--whatsapp_event_idempotency.sql
    └── 1933000000--service_account_api_key.sql

docs/
├── HANDOFF_COGFY_MESSAGER_EVENT_TRACKING.md  # Tracking de eventos
└── HANDOFF_COGFY_MESSAGER_API_KEY_MIGRATION.md # Migracao para API Key
```

## 7. Exemplo de Codigo para Cogfy Messager

```typescript
// cogfy-messager/src/cogedu-client.ts

interface CogeduClientConfig {
  apiUrl: string;
  apiKey: string;  // cgfy_<64 caracteres>
}

class CogeduClient {
  constructor(private config: CogeduClientConfig) {}

  async getEducationalContent(
    waId: string,
    cogfyContext?: { workspaceId?: string; conversationId?: string; contactId?: string }
  ) {
    const response = await fetch(`${this.config.apiUrl}/getMyEducationalContent`, {
      headers: {
        'X-API-Key': this.config.apiKey,
        'cogfy-contact-wa-id': waId,
        ...(cogfyContext?.workspaceId && { 'cogfy-workspace-id': cogfyContext.workspaceId }),
        ...(cogfyContext?.conversationId && { 'cogfy-conversation-id': cogfyContext.conversationId }),
        ...(cogfyContext?.contactId && { 'cogfy-contact-id': cogfyContext.contactId }),
      },
    });

    if (response.status === 401) {
      throw new Error('API Key invalida ou inativa');
    }

    if (response.status === 404) {
      throw new Error('Estudante nao cadastrado com este telefone');
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }
}

// Uso:
const client = new CogeduClient({
  apiUrl: process.env.COGEDU_API_URL!,
  apiKey: process.env.COGEDU_API_KEY!,
});
```

## 8. Checklist de Integracao

**Banco de Dados:**
- [ ] Migration 1931000000 executada (service account)
- [ ] Migration 1932000000 executada (idempotencia)
- [ ] Migration 1933000000 executada (api_key_hash)
- [ ] Script `generate-cogfy-api-key.js` executado
- [ ] API Key copiada e armazenada de forma segura

**Cogfy Messager:**
- [ ] `COGEDU_API_URL` configurado
- [ ] `COGEDU_API_KEY` configurado

**Testes:**
- [ ] Estudante de teste tem `phone_e164` preenchido
- [ ] Chamada retorna dados do estudante (200)
- [ ] API Key invalida retorna 401 INVALID_API_KEY
- [ ] Telefone invalido retorna 404 USER_NOT_FOUND
- [ ] Evento aparece em `outbox` (imediato)
- [ ] Evento aparece em `experience_events` (apos consumer)

**Consumer (Opcional - para BI):**
- [ ] RabbitMQ rodando
- [ ] Consumer de eventos iniciado (`npm run worker:outbox`)

---

*Documento atualizado em 2026-01-26*
*Versao: 4.0 - Removido fluxo OAuth M2M (apenas API Key)*
