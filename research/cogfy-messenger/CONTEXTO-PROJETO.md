# Contexto do Projeto: ORCH ADMIN + Cogfy Messenger

**Data:** 2026-02-06
**Objetivo:** Integrar o assistente ORCH ADMIN ao Cogfy Messenger para comunicacao via WhatsApp

---

## 1. Resumo Executivo

Este documento registra a analise e planejamento para fazer o **ORCH ADMIN** funcionar no **Cogfy Messenger**.

### O que e o ORCH ADMIN?

Assistente inteligente embarcado no sistema Cogedu que ajuda funcionarios a:
- Entender paginas do sistema
- Saber o que preencher em cada campo
- Seguir workflows passo-a-passo
- Resolver erros em tempo real

### O que e o Cogfy Messenger?

Plataforma de comunicacao empresarial via WhatsApp com:
- Assistentes IA customizaveis
- Engines com workflows visuais (Cogs)
- RAG via embeddings
- API REST completa

---

## 2. Analise do ORCH ADMIN

### Estrutura do Projeto

```
ORCH ADMIN/                              # 1.7 MB total
├── README.md                            # Visao geral
├── GUIA-IMPLANTACAO-CTO.md              # Guia de 11 fases
├── agent/
│   └── page-guide.md                    # Agente UAF (112 KB)
├── knowledge-base/                      # 604 KB - 14 arquivos YAML
│   ├── cogedu-pages-guide.yaml
│   ├── cogedu-admission-fields.yaml
│   ├── cogedu-educational-fields.yaml
│   ├── cogedu-exams-fields.yaml
│   ├── cogedu-users-fields.yaml
│   ├── cogedu-data-schema.yaml
│   ├── cogedu-workflows.yaml
│   ├── cogedu-ava-architecture.yaml
│   ├── cogedu-ava-pages-routes.yaml
│   ├── cogedu-ava-api-endpoints.yaml
│   ├── cogedu-ava-data-schema.yaml
│   ├── orch-memory-schema.yaml
│   ├── orch-proactive-alerts.yaml
│   └── zodiac-personas.yaml
├── auto-update/                         # Scripts TypeScript
└── feedback/                            # Banco de feedback
```

### Stack Atual

| Camada | Tecnologia |
|--------|------------|
| Frontend | Widget React no CommunicationHub |
| Comunicacao | postMessage (DOM) |
| Backend | Dify self-hosted |
| RAG | pgvector |
| LLM | OpenAI gpt-4o-mini |
| Knowledge Base | 14 YAMLs (604 KB) |

### Funcionalidades Atuais

1. **Guia contextual** - Detecta pagina pela URL
2. **Preenchimento de campos** - Preenche DOM via postMessage
3. **Resolucao de erros** - Explica mensagens de erro
4. **Passo a passo** - Guias numerados para tarefas

---

## 3. Analise do Cogfy Messenger

### Componentes Principais

| Componente | Funcao |
|------------|--------|
| Workspace | Ambiente isolado com configs proprias |
| Assistants | Agentes IA com modelo, instrucoes, plugins |
| Engines | Workflows visuais com Cogs |
| Cogs | Blocos: Router, LLM Router, HTTP Request, etc |
| Embeddings | RAG para knowledge base |
| Phone Numbers | Conexao com WhatsApp |

### API Disponivel

- Base: `https://messenger-public-api.cogfy.com`
- Auth: `Api-Key: <key>`
- Endpoints: contacts, conversations, messages, broadcasts, tags, embeddings

---

## 4. Desafio da Integracao

### Problema Principal

O ORCH foi projetado para rodar **dentro do navegador** com acesso ao DOM:
- Detecta URL da pagina atual
- Preenche campos automaticamente (`FILL_FIELD`)
- Le valores de campos (`READ_FIELDS`)

No **Cogfy Messenger (WhatsApp)**, **nao ha acesso ao DOM**.

### Impacto nas Funcionalidades

| Funcionalidade | Widget (atual) | WhatsApp (novo) |
|----------------|----------------|-----------------|
| Detectar pagina | Automatico (URL) | Usuario informa |
| Explicar campos | Contextual | Sob demanda |
| Preencher campos | Automatico | NAO POSSIVEL |
| Guiar workflows | Contextual | Sob demanda |
| Executar acoes | Via DOM | Via API (se implementado) |

---

## 5. Caminhos Avaliados

### CAMINHO 1: Assistente de Orientacao (ESCOLHIDO para Fase 1)

**Conceito:** Orch como assistente de suporte via WhatsApp.

**Arquitetura:**
```
Usuario (WhatsApp) → Cogfy Engine → RAG (14 YAMLs) → LLM → Resposta
```

**Prós:**
- Rapido de implementar (1-2 dias)
- Sem backend adicional
- Knowledge base pronta

**Contras:**
- Sem preenchimento de campos
- Sem deteccao automatica de pagina

### CAMINHO 2: Orquestrador de Acoes via API

**Conceito:** Orch executa acoes no Cogedu via webhooks.

**Arquitetura:**
```
Usuario (WhatsApp) → Cogfy Engine → HTTP Request → API Cogedu → Acao
```

**Prós:**
- Mantem capacidade de acao
- Automacao poderosa

**Contras:**
- Requer autenticacao WhatsApp → Cogedu
- Mais complexo

### CAMINHO 3: Hibrido (Widget + WhatsApp)

**Conceito:** Ambos os canais sincronizados.

**Prós:**
- Melhor experiencia
- Todas funcionalidades

**Contras:**
- Mais complexo
- Dois sistemas para manter

---

## 6. Plano de Implementacao

### Roadmap

| Fase | Escopo | Esforco |
|------|--------|---------|
| **Fase 1** | Assistente de orientacao (RAG + Engine) | 1-2 dias |
| **Fase 2** | Consultas de dados (HTTP cog → API leitura) | 1 dia |
| **Fase 3** | Acoes de escrita (HTTP cog → API /orch/execute) | 2-3 dias |
| **Fase 4** | Sincronizacao com widget | 3-5 dias |

### Fase 1 - Detalhamento

1. **Criar workspace** no Cogfy Messenger
2. **Upload dos 14 YAMLs** como embeddings via API
3. **Criar Engine Assistant** com instrucoes do Orch
4. **Criar Engine** com workflow (Commands + Default)
5. **Publicar** no numero WhatsApp
6. **Testar** e validar

---

## 7. Arquivos Criados

| Arquivo | Descricao |
|---------|-----------|
| `CONTEXTO-PROJETO.md` | Este documento |
| `FASE1-MANUAL-IMPLEMENTACAO.md` | Manual passo-a-passo da Fase 1 |
| `upload-embeddings.js` | Script para upload dos YAMLs |

---

## 8. Referencias

### Projetos Relacionados

| Projeto | Caminho | Descricao |
|---------|---------|-----------|
| ORCH ADMIN | `C:/Projetos IA/ORCH ADMIN` | Assistente original |
| Cogfy Docs | `C:/Users/steev/Downloads/cogfy-messenger-docs-main (1)` | Documentacao Cogfy |
| Agente Cogfy | `C:/Projetos IA/aios-core/.aios-core/development/agents/cogfy-expert.md` | Agente especialista |

### URLs Importantes

- Cogfy Messenger: https://messenger.cogfy.com
- Cogfy API: https://messenger-public-api.cogfy.com
- Documentacao: https://docs.cogfy.com (assumido)

---

## 9. Decisoes Tecnicas

| Decisao | Opcao Escolhida | Justificativa |
|---------|-----------------|---------------|
| Abordagem inicial | Orientacao (Fase 1) | Rapido, valida conceito |
| Formato KB | Manter YAMLs | Ja estruturados para RAG |
| Modelo LLM | gpt-4o-mini | Custo-beneficio |
| Chunking | 2000 chars | Bom para retrieval |

---

## 10. Proximos Passos

1. [ ] Executar Fase 1 conforme manual
2. [ ] Testar com usuarios reais
3. [ ] Coletar feedback
4. [ ] Planejar Fase 2 (consultas de dados)
5. [ ] Avaliar necessidade de Fase 4 (sincronizacao)

---

*Documento gerado por Cogfy Expert - 2026-02-06*
