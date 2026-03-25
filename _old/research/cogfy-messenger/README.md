# Cogfy + Orch

Integracao do ORCH ADMIN com Cogfy Messenger para comunicacao via WhatsApp.

## Objetivo

Fazer o assistente ORCH ADMIN funcionar no Cogfy Messenger, permitindo que usuarios do Cogedu recebam orientacoes e executem acoes via WhatsApp.

## Arquivos

| Arquivo | Tamanho | Descricao |
|---------|---------|-----------|
| `README.md` | 2 KB | Este arquivo |
| `CONTEXTO-PROJETO.md` | 7 KB | Analise completa e plano de implementacao |
| `FASE1-MANUAL-IMPLEMENTACAO.md` | 19 KB | Assistente de orientacao (RAG + Engine) |
| `FASE2-MANUAL-CONSULTAS.md` | 22 KB | Consultas de dados via API |
| `FASE3-MANUAL-ACOES.md` | 28 KB | Acoes de escrita com confirmacao |
| `FASE4-MANUAL-SINCRONIZACAO.md` | 24 KB | Sincronizacao Widget + WhatsApp |
| `upload-embeddings.js` | 8 KB | Script para upload da knowledge base |

## Fases do Projeto

| Fase | Escopo | Esforco | Status |
|------|--------|---------|--------|
| **Fase 1** | Assistente de orientacao (RAG + Engine) | 1-2 dias | Manual pronto |
| **Fase 2** | Consultas de dados (HTTP cog → API leitura) | 1 dia | Manual pronto |
| **Fase 3** | Acoes de escrita (API /orch/execute + confirmacao) | 2-3 dias | Manual pronto |
| **Fase 4** | Sincronizacao Widget + WhatsApp | 3-5 dias | Manual pronto |

## Quick Start (Fase 1)

### 1. Configurar API Key

```powershell
$env:COGFY_API_KEY = "sua-api-key-do-cogfy"
```

### 2. Upload da Knowledge Base

```bash
cd "C:/Projetos IA/cogfy+orch"
node upload-embeddings.js
```

### 3. Seguir o Manual

Abra `FASE1-MANUAL-IMPLEMENTACAO.md` e siga os passos para:
- Criar workspace no Cogfy
- Criar Engine Assistant
- Criar Engine com workflow
- Publicar no numero WhatsApp

## Projetos Relacionados

| Projeto | Caminho |
|---------|---------|
| ORCH ADMIN | `C:/Projetos IA/ORCH ADMIN` |
| Cogfy Docs | `C:/Users/steev/Downloads/cogfy-messenger-docs-main (1)` |
| Agente Cogfy | `C:/Projetos IA/aios-core/.aios-core/development/agents/cogfy-expert.md` |

## Links

- Cogfy Messenger: https://messenger.cogfy.com
- API: https://messenger-public-api.cogfy.com

---

*Criado em 2026-02-06 por Cogfy Expert (Genesis)*
