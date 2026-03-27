# Mapa de Tabelas — Orch AVA

> Verificado em: 2026-03-25, banco `dev` (docker dev-postgres)
> Decisao: ZERO tabelas novas. Tudo cabe nas JSONB existentes.

---

## Tabela central: `orch_student_profile`

Cada agente e **single-writer** de sua coluna JSONB. Auditoria via `orch_profile_audit`.

| Coluna JSONB | Agente writer | Schema dos dados |
|-------------|---------------|-----------------|
| `academic_profile` | Bloom | `{gpa, standing, trend, strongest_subjects[], weakest_subjects[], attendance_rate}` |
| `cognitive_profile` | Gardner (futuro) | `{dominant_intelligences[], learning_preferences[], metacognitive_calibration, confidence_level}` |
| `linguistic_profile` | Wittgenstein (futuro) | `{cefr_level, vocabulary_richness, formality_range, preferred_register, detected_language}` |
| `engagement_profile` | Taylor (futuro) | `{score, trend, login_frequency, avg_session_minutes, peak_hours[], preferred_content_type}` |
| `gamification_profile` | Sisifo | `{xp, level, streak_days, streak_last_date, badges[], octalysis_drivers{8 dimensoes}}` |
| `risk_profile` | Foucault (futuro) | `{score, level, dimensions{8 eixos}, interventions[], last_assessment}` |
| `forgetting_curves` | Ebbinghaus | `{"conceito_id": {interval, easeFactor, nextReview, repetitions, lastReview}}` |
| `skills_mastery` | Comenius | `{quiz_history: [{date, topic, questions, score, difficulty}], mastery_map: {"skill": level}}` |
| `sociocultural` | Sistema | `{capital_cultural, capital_social, first_generation, digital_literacy}` |

Coluna escalar:
| Coluna | Tipo | Agente | Uso |
|--------|------|--------|-----|
| `communication_archetype` | VARCHAR(50) | Hub/Sistema | 12 arquetipos Bourdieu |
| `version` | INTEGER | Sistema | Optimistic locking |

---

## Colunas JSONB em `ai_conversation_message` (existem, estao NULL)

| Coluna | O que armazenar | Quem popula |
|--------|----------------|-------------|
| `tool_invocations` | `[{toolCallId, toolName, args, result}]` | Pipeline etapa 12 (persist) |
| `analytics` | `{engagement, cognitive, metacognition, affect, pedagogical}` | Extract insights (pos-resposta) |
| `context_used` | `[{embedding_id, similarity_score, content_snippet}]` | RAG service |

---

## Coluna JSONB em `ai_conversation` (existe, esta NULL)

| Coluna | O que armazenar | Quem popula |
|--------|----------------|-------------|
| `session_summary` | `{diagnosis_summary, key_issue, recommended_intervention, tags, aggregates}` | Ao encerrar conversa |

---

## Tabela de auditoria: `orch_profile_audit`

Toda escrita no `orch_student_profile` DEVE gravar:

```sql
INSERT INTO orch_profile_audit (student_id, agent_id, field_path, old_value, new_value, reasoning)
VALUES ($1, 'ebbinghaus', 'forgetting_curves.conceito_123', '{"interval":1}', '{"interval":3}', 'Acertou revisao, SM-2 aumentou intervalo');
```

---

## Tabelas de LEITURA (tools do aluno, READ ONLY)

| Dado | Tabela fonte | Tool |
|------|-------------|------|
| Notas | `assessment_attempt` + `assessment_answer` | `getMyGrades` |
| Progresso | `student_progress` + `experience_metrics_aggregated` | `getMyProgress` |
| Presenca | `attendance_record` + `attendance_calculation` | `getMyAttendance` |
| Matriculas | `class_enrollment` + `class_instance` | `getMyEnrollments` |
| Conteudo | `collection → pathway → series → unit → component` | `getMyCourseContent` |
| Perfil basico | `user` + `user_student_profile` | `getMyProfile` |
| Habilidade IRT | `student_ability` | Comenius (futuro) |
| Videos assistidos | `video_session_summary` | Taylor (futuro) |
| Notas do aluno | `component_note` | Socrates (futuro) |

---

## Tabelas de ESCRITA (pipeline orchAvaChat)

| Dado | Tabela | Etapa |
|------|--------|-------|
| Conversa (header) | `ai_conversation` | 12 |
| Mensagens | `ai_conversation_message` | 12 |
| Roteamento/obs | `orch_interaction_log` | 13 |
| Uso de tokens | `experience_events` | 14 (FinOps) |
| Perfil do aluno | `orch_student_profile` | Extract insights (futuro) |
| Audit trail | `orch_profile_audit` | Junto com perfil |

---

## Decisao: por que ZERO tabelas novas

| Necessidade | Solucao SEM tabela nova |
|------------|------------------------|
| SM-2 por conceito (Ebbinghaus) | `forgetting_curves` JSONB — cada key e um conceito |
| XP/badges/streak (Sisifo) | `gamification_profile` JSONB — ja tem schema completo |
| Quiz history (Comenius) | `skills_mastery` JSONB — array de quizzes + mapa de dominio |
| Analytics por msg | `ai_conversation_message.analytics` — ja existe, so popular |
| Tool calls log | `ai_conversation_message.tool_invocations` — ja existe, so popular |
| Resumo de sessao | `ai_conversation.session_summary` — ja existe, so popular |

Se no futuro o volume de dados JSONB ficar pesado (ex: milhares de conceitos em forgetting_curves),
podemos extrair para tabela propria. Mas comecamos simples.
