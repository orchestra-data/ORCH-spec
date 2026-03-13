# ORCH AVA + ORCH Admin

Feature completa do sistema de orquestração inteligente Cogedu.

- **ORCH AVA:** 20 agentes IA para alunos (Hub conversacional + especialistas)
- **ORCH Admin:** Page-guide contextual para staff (coordenadores, professores, secretaria)

## Estrutura

```
spec/           — Especificações definitivas
  ORCH-MASTER-SPEC.md      v3.3 FINAL (3849 linhas) — spec completa com auditorias PV + Epistemicos
  ORCH-TECHNICAL-SPEC.md   Spec técnica de implementação

planning/       — Planos de evolução
  PLANO-ORCH-EVOLUTION.md     Plano original
  PLANO-ORCH-EVOLUTION-v2.md  Plano revisado

research/       — Pesquisas e análises
  analise-orch-admin-ava-localhost.md   Análise do estado atual no localhost
  research-orch-state-of-the-art.md    Estado da arte em IA educacional

epics/          — Épicos e stories (a gerar)
audits/         — Relatórios de auditoria
```

## Versões da Spec

| Versão | O que mudou |
|--------|-------------|
| v3.0 | Spec original completa |
| v3.1 | Auditoria Pedro Valério — circuit breaker, Promise.allSettled, gates, logging |
| v3.2 | Auditoria Epistemicos — renames (Bloom, SafeGuard, Gardner MI), 9 lacunas teóricas, Freire transversal, Bourdieu reprodução |
| v3.3 | PV Audit v2 — chips obrigatórios, sessão definida, feedback passivo, config pedagógica tenant |

## Auditorias Realizadas

1. **Pedro Valério (Process Absolutist)** — "impossibilitar caminhos errados"
2. **Squad Epistemicos** — validação teórica dos 20 agentes + recomendações
3. **Pedro Valério v2** — 8 fixes finais de processo
