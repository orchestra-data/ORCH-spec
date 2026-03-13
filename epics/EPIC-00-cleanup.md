# EPIC-00: Correções + Limpeza

**Fase:** F0
**Prioridade:** CRITICAL (bloqueante para tudo)
**Estimativa:** 1-2 dias
**Dependências:** Nenhuma
**Entregável:** Plataforma segura, limpa, certificados funcionando no AVA

---

## Stories

### STORY-00.1: Corrigir vulnerabilidades de segurança
**Tipo:** Security Fix
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] `requireAuth()` adicionado em `endpoints/adminInterventionAudit/` (middlewares = [] → [requireAuth()])
- [ ] Validação de pertencimento à turma em `sendClassMessage` antes de enviar
- [ ] Testes de endpoint retornam 401 sem token e 403 sem permissão

### STORY-00.2: Verificar endpoints não registrados
**Tipo:** Bug Fix
**Pontos:** 1
**Critérios de Aceitação:**
- [ ] `initiateStudentConversation` verificado no router (`endpoints/index.ts`) — registrar se ausente
- [ ] `searchComponentTranscription` verificado no router — registrar se ausente
- [ ] Ambos endpoints respondem corretamente via Postman/curl

### STORY-00.3: Remover dead code (mocks)
**Tipo:** Cleanup
**Pontos:** 1
**Critérios de Aceitação:**
- [ ] `FloatingChat.tsx` deletado
- [ ] `AIAssistant.tsx` deletado
- [ ] `FloatingAIAssistant.tsx` deletado
- [ ] `console.log` removido de `ClassChat.tsx`
- [ ] Nenhuma referência/import quebrado após remoção (grep confirma)

### STORY-00.4: Migrar permissões de certificação
**Tipo:** Fix
**Pontos:** 2
**Critérios de Aceitação:**
- [ ] Permissões `edu.component.*` migradas para `edu.certificate.*` nos seeds
- [ ] Usuários com permissão antiga não perdem acesso (migration adiciona novos + mantém velhos temporariamente)

### STORY-00.5: Wire-up certificados e documentos no AVA
**Tipo:** Wire-up
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] `CertificatesPage.tsx`: `MOCK_API_CERTIFICATES` substituído por `GET /certification/my-certificates`
- [ ] `DocumentsPage.tsx`: `MOCK_DOCUMENTS` substituído por `POST /certification/documents/request`
- [ ] Loading states e error handling implementados
- [ ] Funciona no AVA do aluno com dados reais

---

## Definição de Done (Epic)
- [ ] Zero vulnerabilidades de segurança nos endpoints ORCH-adjacent
- [ ] Zero dead code de mocks antigos
- [ ] Certificados funcionando end-to-end no AVA
- [ ] Nenhum console.log em produção
