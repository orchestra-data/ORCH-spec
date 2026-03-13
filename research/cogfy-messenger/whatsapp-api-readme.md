# WhatsApp Agentico Orchestra

Sistema de atendimento via WhatsApp para a plataforma Orchestra Educacao, implementado com **Cogfy Messenger**.

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/orchestra-data/whatsapp-agentico-orchestra)
[![Node](https://img.shields.io/badge/node-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 📋 Visao Geral

Este projeto fornece:

1. **30 APIs REST** (`/wpp/*`) para integracao com Cogfy Messenger
2. **Documentacao completa** para equipe Cogfy implementar o Engine
3. **Documentacao tecnica** para devs Orchestra implementarem o backend
4. **188 intencoes mapeadas** com templates de resposta personalizados
5. **12 perfis de personalidade** para comunicacao adaptativa

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                    USUARIO WHATSAPP                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    COGFY MESSENGER                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ ENGINE: "Orchestra Atendimento"                           │  │
│  │   • Router Cog → Verifica tags do contato                │  │
│  │   • LLM Router Cog → Classifica entre 188 intencoes      │  │
│  │   • HTTP Request Cog → Chama APIs /wpp/*                 │  │
│  │   • Run Assistant Cog → Gera resposta personalizada      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              WHATSAPP AGENTICO ORCHESTRA API                    │
│                     (Este repositorio)                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 30 Endpoints /wpp/*                                       │  │
│  │   • /wpp/auth/* (3) - Autenticacao                       │  │
│  │   • /wpp/candidate/* (6) - Candidatos                    │  │
│  │   • /wpp/student/* (14) - Alunos                         │  │
│  │   • /wpp/alumni/* (5) - Ex-alunos                        │  │
│  │   • /wpp/support/* (2) - Suporte                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      COGEDU API                                 │
│               (421 endpoints existentes)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Pre-requisitos

- Node.js 20+
- npm ou yarn
- Acesso a API Cogedu (para integracao completa)

### Instalacao

```bash
# Clone o repositorio
git clone https://github.com/orchestra-data/whatsapp-agentico-orchestra.git
cd whatsapp-agentico-orchestra

# Instale as dependencias
npm install

# Configure as variaveis de ambiente
cp .env.example .env
# Edite .env com suas configuracoes

# Inicie em modo desenvolvimento
npm run dev
```

### Build para Producao

```bash
npm run build
npm start
```

---

## 📡 Endpoints da API

### Autenticacao (`/wpp/auth/*`)

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/wpp/auth/login` | Autentica usuario via telefone |
| POST | `/wpp/auth/validate` | Valida token JWT |
| GET | `/wpp/auth/profile` | Retorna perfil do usuario |

### Candidato (`/wpp/candidate/*`)

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/wpp/candidate/courses` | Lista cursos disponiveis |
| GET | `/wpp/candidate/courses/:id` | Detalhes de um curso |
| GET | `/wpp/candidate/courses/:id/classes` | Turmas de um curso |
| POST | `/wpp/candidate/admission/start` | Inicia inscricao |
| GET | `/wpp/candidate/admission/docs` | Documentos necessarios |
| POST | `/wpp/candidate/visit` | Agenda visita ao campus |
| GET | `/wpp/candidate/transfer` | Info sobre transferencia |

### Aluno (`/wpp/student/*`)

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/wpp/student/schedule/today` | Aulas de hoje |
| GET | `/wpp/student/schedule/next` | Proxima aula |
| GET | `/wpp/student/grades` | Todas as notas |
| GET | `/wpp/student/grades/:disciplina` | Nota especifica |
| GET | `/wpp/student/attendance` | Frequencia |
| GET | `/wpp/student/financial` | Situacao financeira |
| GET | `/wpp/student/financial/invoices` | Boletos |
| GET | `/wpp/student/exams` | Calendario de provas |
| POST | `/wpp/student/documents/request` | Solicita documento |
| GET | `/wpp/student/activities` | Atividades pendentes |
| GET | `/wpp/student/content/:disciplina` | Material da disciplina |

### Ex-Aluno (`/wpp/alumni/*`)

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/wpp/alumni/documents/request` | Solicita diploma |
| GET | `/wpp/alumni/documents/transcript` | Historico escolar |
| GET | `/wpp/alumni/career/jobs` | Vagas de emprego |
| GET | `/wpp/alumni/education/courses` | Pos-graduacao |
| GET | `/wpp/alumni/community/groups` | Comunidade alumni |
| PUT | `/wpp/alumni/profile` | Atualiza cadastro |

### Suporte (`/wpp/support/*`)

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/wpp/support/transfer` | Transfere para humano |
| POST | `/wpp/support/feedback` | Envia feedback |

---

## 📁 Estrutura do Projeto

```
whatsapp-agentico-orchestra/
├── src/                      # Codigo fonte da API
│   ├── config/              # Configuracoes
│   ├── controllers/         # Controllers (30 endpoints)
│   ├── middlewares/         # Auth, validation, logging
│   ├── routes/              # Definicao de rotas
│   ├── services/            # Integracao com Cogedu
│   ├── types/               # TypeScript types
│   ├── utils/               # Utilitarios
│   └── index.ts             # Entry point
├── docs/                     # Documentacao completa
│   ├── 00-LEIA-PRIMEIRO.md  # Guia inicial
│   ├── 00-INDEX.md          # Indice da documentacao
│   ├── 01-SISTEMA-PERSONALIDADE.md
│   ├── 02-INTENTS-CANDIDATO*.md
│   ├── 03-INTENTS-ALUNO*.md
│   ├── 04-INTENTS-EXALUNO.md
│   ├── 05-API-SPECIFICATION.md
│   ├── 09-ENTREGA-DEVS.md
│   ├── 10-GUIA-IMPLEMENTACAO-DEVS.md
│   ├── 11-GUIA-COGFY-WHATSAPP.md
│   └── 12-GUIA-COGFY-ENGINES.md
├── exports/                  # Arquivos de exportacao
│   ├── COGFY-DOCUMENTO-COMPLETO.md
│   ├── COGFY-ENGINES-CONFIG.json
│   ├── INTENTS-COMPLETO.csv
│   └── DOCS-COMPLETO.zip
├── .env.example             # Exemplo de variaveis de ambiente
├── package.json             # Dependencias
├── tsconfig.json            # Configuracao TypeScript
└── README.md                # Este arquivo
```

---

## 📚 Documentacao

### Para Devs Orchestra

1. `docs/09-ENTREGA-DEVS.md` - Resumo tecnico
2. `docs/10-GUIA-IMPLEMENTACAO-DEVS.md` - Passo a passo das APIs
3. `docs/05-API-SPECIFICATION.md` - Especificacao completa

### Para Equipe Cogfy

1. `docs/11-GUIA-COGFY-WHATSAPP.md` - Conceitos gerais
2. `docs/12-GUIA-COGFY-ENGINES.md` - Implementacao tecnica
3. `exports/COGFY-DOCUMENTO-COMPLETO.md` - Tudo em um arquivo

### Exportacoes

| Arquivo | Uso |
|---------|-----|
| `exports/COGFY-DOCUMENTO-COMPLETO.md` | PDF unico para Cogfy |
| `exports/INTENTS-COMPLETO.csv` | Planilha para Excel |
| `exports/COGFY-ENGINES-CONFIG.json` | Import direto no Cogfy |

---

## 🎭 12 Perfis de Personalidade

Baseado na data de nascimento, adaptamos o tom da resposta:

| # | Perfil | Tom | Engine Assistant |
|---|--------|-----|------------------|
| 1 | INICIADOR | Direto, energico, curto | Orch-Iniciador |
| 2 | ESTAVEL | Detalhado, tranquilizador | Orch-Estavel |
| 3 | COMUNICADOR | Informativo, interativo | Orch-Comunicador |
| 4 | ACOLHEDOR | Caloroso, empatico | Orch-Acolhedor |
| 5 | CONFIANTE | Valoriza, VIP | Orch-Confiante |
| 6 | ANALITICO | Estruturado, preciso | Orch-Analitico |
| 7 | HARMONICO | Elegante, equilibrado | Orch-Harmonico |
| 8 | INTENSO | Direto, sem rodeios | Orch-Intenso |
| 9 | EXPLORADOR | Entusiasmado, positivo | Orch-Explorador |
| 10 | REALIZADOR | Profissional, pratico | Orch-Realizador |
| 11 | INOVADOR | Criativo, tech | Orch-Inovador |
| 12 | SENSIVEL | Gentil, compreensivo | Orch-Sensivel |

> **IMPORTANTE:** NUNCA mencionar signos ou astrologia nas respostas!

---

## 📊 Numeros do Projeto

| Item | Quantidade |
|------|------------|
| Endpoints API | 30 |
| Intencoes mapeadas | 188 |
| LLM Router Paths | 21 |
| Engine Assistants | 12 |
| Perfis de usuario | 3 (candidato, aluno, ex-aluno) |
| Templates de resposta | 2.256 |
| Tags Cogfy | 19 |

---

## 🔐 Autenticacao

A API usa JWT (JSON Web Token) para autenticacao.

### Headers Necessarios

```
Authorization: Bearer <token>
Content-Type: application/json
```

### Fluxo de Autenticacao

1. Cogfy chama `POST /wpp/auth/login` com telefone do usuario
2. API retorna token JWT + tipo de usuario + perfil de personalidade
3. Cogfy armazena token nas propriedades do contato
4. Requisicoes subsequentes incluem token no header

---

## 🛠️ Desenvolvimento

### Scripts Disponiveis

```bash
npm run dev      # Desenvolvimento com hot reload
npm run build    # Build para producao
npm start        # Inicia servidor de producao
npm run lint     # Verifica codigo
npm test         # Executa testes
```

### Variaveis de Ambiente

```env
PORT=3001
NODE_ENV=development
COGEDU_API_URL=http://localhost:3000
COGEDU_TENANT_ID=your-tenant-uuid
JWT_SECRET=your-secret-key
```

---

## 🤝 Integracao com Cogfy

### Tags do Contato

| Tag | Descricao |
|-----|-----------|
| `tipo:candidato` | Usuario e candidato |
| `tipo:aluno` | Usuario e aluno matriculado |
| `tipo:exaluno` | Usuario e ex-aluno |
| `perfil:1` a `perfil:12` | Perfil de personalidade |
| `onboarding:completo` | Onboarding finalizado |

### Propriedades do Contato

| Propriedade | Descricao |
|-------------|-----------|
| `orchestraUserId` | ID do usuario no Cogedu |
| `orchestraToken` | JWT para autenticacao |
| `orchestraUserType` | candidato/aluno/exaluno |
| `personalityProfile` | Numero 1-12 |

---

## 📝 Licenca

MIT License - veja [LICENSE](LICENSE) para detalhes.

---

## 👥 Equipe

- **Orchestra Team** - Desenvolvimento
- **Cogfy Team** - Integracao WhatsApp

---

**Versao 2.0.0 - Janeiro 2026 - Cogfy Messenger**
