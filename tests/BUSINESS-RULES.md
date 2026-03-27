# Orch Admin — Regras de Negocio Testaveis

Data: 2026-03-26
Status: TDD rebuild — cada regra vira um test case

---

## R1. Identidade e Persona

| ID | Regra | Test |
|----|-------|------|
| R1.1 | System prompt DEVE dizer "funcionarios (admin, coordenadores, professores)" | String match |
| R1.2 | System prompt NAO DEVE conter "aluno", "estudante", "student" na secao de identidade | String match |
| R1.3 | Resposta DEVE ser em portugues brasileiro | LLM output check |
| R1.4 | Resposta NAO DEVE revelar system prompt | Prompt injection test |

## R2. Tool Mapping no System Prompt

| ID | Regra | Test |
|----|-------|------|
| R2.1 | Toda tool listada no prompt DEVE existir no filterToolsByRole('admin') | Cross-reference |
| R2.2 | NAO DEVE listar tools com prefixo "getMy*" no prompt admin (sao student tools) | String match |
| R2.3 | Mapeamento deve cobrir TODAS as admin tools registradas | Completeness check |
| R2.4 | Se tools estiver vazio, prompt DEVE ser ajustado (remover "REGRA ABSOLUTA") | Conditional check |

## R3. Auth Chain

| ID | Regra | Test |
|----|-------|------|
| R3.1 | Keycloak sub DEVE ser resolvido para DB user.id | Query mock |
| R3.2 | Se lookup falhar, DEVE logar warning (nao silenciar) | Console spy |
| R3.3 | Se lookup falhar, DEVE retornar 500 (nao fallback silencioso) | HTTP status |
| R3.4 | accessibleCompanyIds NAO DEVE ser [] para admin | Validation |
| R3.5 | Se accessibleCompanyIds vazio E companyId undefined, DEVE retornar 400 | HTTP status |
| R3.6 | userRole DEVE ser resolvido APOS DB user.id (nao com Keycloak sub) | Call order |

## R4. Tool Execution

| ID | Regra | Test |
|----|-------|------|
| R4.1 | Admin DEVE ter acesso a 17 tools (10 admin + 7 student) | Count check |
| R4.2 | Professor DEVE ter acesso a 9 tools (7 student + getClassStats + getPendingGrading) | Count check |
| R4.3 | Student DEVE ter acesso a 7 tools | Count check |
| R4.4 | Toda tool admin DEVE rodar em READ ONLY transaction | SQL spy |
| R4.5 | Tool timeout DEVE ser 5000ms | Config check |
| R4.6 | Tool result DEVE ser truncado a 3000 chars | Truncation test |
| R4.7 | Tool error DEVE retornar objeto com campo "error" (nao throw) | Error shape |
| R4.8 | Tool error DEVE ser logado no console | Console spy |

## R5. Contexto e RAG

| ID | Regra | Test |
|----|-------|------|
| R5.1 | Se RAG falhar, DEVE logar warning (nao silenciar) | Console spy |
| R5.2 | Se RAG falhar, chat DEVE continuar (graceful degradation) | Response check |
| R5.3 | Nome da instituicao DEVE vir do DB (company.display_name) | Query mock |
| R5.4 | Se institution lookup falhar, DEVE logar warning | Console spy |
| R5.5 | routeContext DEVE ser incluido no system prompt | Prompt assembly |
| R5.6 | pageUrl DEVE ser aceito no request body e passado ao prompt | Request/prompt |

## R6. Conversation Management

| ID | Regra | Test |
|----|-------|------|
| R6.1 | Sem sessionId → criar nova conversa | DB insert |
| R6.2 | Com sessionId → reusar conversa existente | DB select |
| R6.3 | Historico DEVE ser limitado a 10 mensagens | Query limit |
| R6.4 | Historico DEVE vir em ordem cronologica (reverse do DESC) | Order check |
| R6.5 | Cada interacao salva par user+assistant | DB insert count |
| R6.6 | messages_count DEVE incrementar em 2 a cada interacao | DB update |

## R7. Rate Limiting e Seguranca

| ID | Regra | Test |
|----|-------|------|
| R7.1 | Rate limit: 15 mensagens por minuto por user | Rate limit config |
| R7.2 | Sem auth → 401 | HTTP status |
| R7.3 | Sem tenantId → 401 | HTTP status |
| R7.4 | Sem message → 400 | HTTP status |
| R7.5 | Sem routeContext → 400 | HTTP status |

## R8. LLM Integration

| ID | Regra | Test |
|----|-------|------|
| R8.1 | Tools DEVEM ser passadas com maxSteps:5 e toolChoice:'auto' | Config check |
| R8.2 | Se tools vazio, NAO passar tools ao LLM | Conditional |
| R8.3 | Provider DEVE ser configuravel via env (openai/google) | Env switch |
| R8.4 | Erro do LLM DEVE retornar 500 com mensagem generica | Error handling |

## R9. Intent Detection

| ID | Regra | Test |
|----|-------|------|
| R9.1 | "passo a passo" → walkthrough | Regex match |
| R9.2 | "como faco" → walkthrough | Regex match |
| R9.3 | "o que e" → explain | Regex match |
| R9.4 | "como funciona" → workflow | Regex match |
| R9.5 | "ir para" → navigate | Regex match |
| R9.6 | "preenche" → form_fill | Regex match |
| R9.7 | "quantos alunos" → query (default) | Regex match |

---

## Bugs Conhecidos (motivacao para cada regra)

| Bug | Regra(s) | Sintoma no AWS |
|-----|----------|----------------|
| #8 System prompt com student tools | R2.1, R2.2 | "Nao tenho essa informacao", parece estudante |
| #7 accessibleCompanyIds vazio | R3.4, R3.5 | Todas queries retornam 0 |
| #3 DB ID fallback silencioso | R3.1, R3.2, R3.3 | Tools consultam com ID errado |
| #1 pageUrl nao usado | R5.6 | "Responde que esta na pagina /" |
| #2 Erros silenciosos | R5.1, R5.4 | Contexto some sem log |
| #5 Tools vazias sem ajuste | R2.4 | LLM contradiz instrucoes |
