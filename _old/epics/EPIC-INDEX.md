# ORCH AVA + ORCH Admin — Índice de Épicos

## Visão Geral

| Épico | Fase | Stories | Pontos | Estimativa | Dependência |
|-------|------|---------|--------|------------|-------------|
| EPIC-00 Cleanup | F0 | 5 | 10 | 1-2 dias | Nenhuma |
| EPIC-01 Foundation | F1 | 7 | 25 | 1-2 sem | EPIC-00 |
| EPIC-02 Core Agents | F2 | 9 | 47 | 2-3 sem | EPIC-01 |
| EPIC-03 Advanced Agents | F3 | 6 | 36 | 2-3 sem | EPIC-02 |
| EPIC-04 ORCH Admin | F4 | 7 | 37 | 1-2 sem | Nenhuma (paralelo) |
| EPIC-06 Dashboard LiveLab | F6 | 3 | 16 | 1 sem | EPIC-02 + EPIC-03 |
| EPIC-07 Expansion | F7 | 7 | 34 | 2-3 sem | EPIC-01-03 |
| **TOTAL** | | **44 stories** | **205 pts** | **~10-14 sem** | |

> **EPIC-05 (UX Mágico) ELIMINADO** — conteúdo absorvido:
> - SSE streaming + personalidade + action chips → **EPIC-01** (STORY-01.7)
> - Rich messages + sugestões no player → **EPIC-02** (STORY-02.9)
> - UX não é uma fase separada — é parte de cada implementação

## Nota: Local de Funcionamento

O ORCH funciona no **mesmo botão do CommunicationHub** que já existe hoje.
- **ORCH AVA (aluno):** tab AI do CommunicationHub existente
- **ORCH Admin (staff):** nova tab no CommunicationHub (OrchPanel)
- Não há componente novo flutuante — é o mesmo ponto de entrada

## Grafo de Dependências

```
EPIC-00 (F0) ─── 1-2 dias
│
EPIC-01 (F1) ─── 1-2 sem (inclui SSE, personalidade, action chips)
│
├── EPIC-02 (F2) ─── 2-3 sem (inclui rich messages, sugestões player)
│   │
│   └── EPIC-03 (F3) ─── 2-3 sem
│       │
│       └── EPIC-06 (F6) ─── 1 sem
│
├── EPIC-04 (F4) ─── 1-2 sem ← PARALELO (time separado)
│
└── EPIC-07 (F7) ─── 2-3 sem (após EPIC-03)
```

## Paralelização

| Semana | Dev A (Backend) | Dev B (Frontend/Admin) |
|--------|-----------------|----------------------|
| 1 | EPIC-00 (cleanup) | EPIC-00 (cleanup) |
| 2-3 | EPIC-01 (foundation backend) | EPIC-01 (foundation frontend + SSE + UX) |
| 4-6 | EPIC-02 (core agents backend) | EPIC-04 (admin) |
| 7-9 | EPIC-03 (advanced agents) | EPIC-02 (rich messages + frontend agents) |
| 10 | EPIC-06 (dashboard) | EPIC-06 (dashboard frontend) |
| 11-13 | EPIC-07 (expansion) | EPIC-07 (expansion frontend) |

**Com 2 devs: ~10 semanas | Com 3 devs: ~7 semanas**

## Métricas Totais

| Métrica | Quantidade |
|---------|------------|
| Tabelas DB | 28 |
| Endpoints | 75 |
| Migrations | 5 |
| Agentes | 20 (15 funcionais + 5 placeholders) |
| CRONs | 8 |
| Components Frontend | ~25 |
