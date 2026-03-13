# EPIC-06: Dashboard Professor — LiveLab

**Fase:** F6
**Prioridade:** MEDIUM
**Estimativa:** 1 semana
**Dependências:** EPIC-02 + EPIC-03 concluídos (precisa dados de Taylor, Foucault, Weber)
**Entregável:** Professor vê turma em tempo real + D7 reports

---

## Stories

### STORY-06.1: Endpoints Dashboard (6 endpoints)
**Tipo:** API
**Pontos:** 5
**Critérios de Aceitação:**
- [ ] `GET /dashboard/class/:classId` — JOIN enrollment + profile + engagement + risk → overview
- [ ] `GET /dashboard/class/:classId/live` — experience_events WHERE created_at > NOW() - 15min (quem está online)
- [ ] `GET /dashboard/class/:classId/mastery` — AVG skills_mastery por skill por turma
- [ ] `GET /dashboard/class/:classId/risk-map` — COUNT por risk_level da turma
- [ ] `GET /dashboard/class/:classId/predictions` — AVG composites + trend → Gemini "prediz nota final"
- [ ] `GET /dashboard/student/:studentId` — Deep dive: profile + engagement chart + risk dims + D7
- [ ] Todos com permissão de professor + validação de turma

### STORY-06.2: Frontend — Teacher Dashboard Page
**Tipo:** Frontend
**Pontos:** 8
**Critérios de Aceitação:**
- [ ] `TeacherDashboard.tsx`: nova página /dashboard/teacher
- [ ] `ClassOverview.tsx`: 4 KPI cards (engagement médio, mastery médio, alunos em risco, prediction)
- [ ] `LiveSection.tsx`: quem está online, quem está "confuso" AGORA (baseado em interações AI)
- [ ] `StruggleTopics.tsx`: bar chart com tópicos de maior dificuldade (Recharts/Nivo)
- [ ] `StudentTable.tsx`: tabela sortable com todos alunos (nome, engagement, risco, última atividade)
- [ ] `StudentDetailPanel.tsx`: side sheet com deep dive (charts, radar, D7)
- [ ] `npm install recharts` (ou nivo)
- [ ] Dados REAIS (não mock) — vêm dos endpoints acima

### STORY-06.3: Integração D7 no Dashboard
**Tipo:** Integration
**Pontos:** 3
**Critérios de Aceitação:**
- [ ] Professor clica no aluno → abre D7 mais recente
- [ ] D7 mostra: acadêmico (Bloom), engagement (Taylor), risco (Foucault), cognitivo (Gardner), gamificação (Sísifo), retenção (Ebbinghaus), linguístico (Wittgenstein)
- [ ] Link para download (JSONB na v1, PDF na F7)
- [ ] Testa: abrir dashboard, clicar em 3 alunos, D7 reflete dados reais

---

## Definição de Done (Epic)
- [ ] Professor abre dashboard e vê turma com dados reais
- [ ] LiveSection atualiza (polling ou SSE)
- [ ] Mapa de risco visual por turma
- [ ] D7 acessível por clique no aluno
- [ ] Charts renderizam corretamente com Recharts/Nivo
