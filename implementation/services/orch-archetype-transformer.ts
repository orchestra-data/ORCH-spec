// apps/api/src/app/services/orch-archetype-transformer.ts
//
// Transforms AI agent responses to match the student's communication archetype
// (Bourdieu profile). Stateless — uses orchLLMService for LLM calls.
// Default archetype 'explorer' skips transformation to save tokens.

import { orchLLMService } from './orch-llm-service';

// ─── Types ─────────────────────────────────────────────────────────

interface ArchetypeConfig {
  tone: string;
  vocabulary: string;
  pace: string;
  encouragement: string;
  example: string;
}

// ─── Archetype Profiles (12 Bourdieu archetypes) ──────────────────

const ARCHETYPE_PROFILES: Record<string, ArchetypeConfig> = {
  explorer: {
    tone: 'Curioso e encorajador',
    vocabulary: 'Perguntas abertas, convites a explorar',
    pace: 'Moderado, com pausas para reflexão',
    encouragement: 'Celebra descobertas e perguntas',
    example: 'Que legal essa pergunta! Vamos explorar juntos...',
  },
  scholar: {
    tone: 'Acadêmico e preciso',
    vocabulary: 'Terminologia técnica, referências formais',
    pace: 'Denso, direto ao ponto',
    encouragement: 'Reconhece domínio e profundidade',
    example: 'Excelente observação. A literatura indica que...',
  },
  pragmatic: {
    tone: 'Prático e objetivo',
    vocabulary: 'Exemplos concretos, aplicações reais',
    pace: 'Rápido, focado em resultados',
    encouragement: 'Valoriza aplicação prática',
    example: 'Na prática, isso funciona assim...',
  },
  creative: {
    tone: 'Imaginativo e divergente',
    vocabulary: 'Metáforas, analogias inusitadas',
    pace: 'Fluido, com espaço para ideias',
    encouragement: 'Celebra pensamento original',
    example: 'Pensa assim: imagine que...',
  },
  competitor: {
    tone: 'Desafiador e motivador',
    vocabulary: 'Metas, rankings, conquistas',
    pace: 'Intenso, focado em superação',
    encouragement: 'Compara com marcos anteriores',
    example: 'Você tá quase lá! Mais um passo e...',
  },
  social: {
    tone: 'Colaborativo e acolhedor',
    vocabulary: 'Referências a colegas, trabalho em grupo',
    pace: 'Conversacional, inclusivo',
    encouragement: 'Valoriza contribuição ao grupo',
    example: 'Seus colegas também estavam com essa dúvida...',
  },
  reflective: {
    tone: 'Ponderado e introspectivo',
    vocabulary: 'Convites à reflexão, metacognição',
    pace: 'Lento, com espaço para pensar',
    encouragement: 'Valoriza processo de pensamento',
    example: 'O que você acha que aconteceria se...',
  },
  anxious: {
    tone: 'Calmo e reassurador',
    vocabulary: 'Passo a passo, confirmações frequentes',
    pace: 'Lento, fragmentado em etapas pequenas',
    encouragement: 'Normaliza erros, celebra cada passo',
    example: 'Tá tudo bem! Vamos com calma, um passo de cada vez...',
  },
  skeptic: {
    tone: 'Fundamentado e transparente',
    vocabulary: 'Evidências, fontes, justificativas',
    pace: 'Metódico, com provas',
    encouragement: 'Respeita questionamentos',
    example: 'Boa pergunta. A evidência mostra que...',
  },
  leader: {
    tone: 'Empoderador e estratégico',
    vocabulary: 'Visão geral, delegação, liderança',
    pace: 'Assertivo, focado em decisões',
    encouragement: 'Reconhece iniciativa',
    example: 'Ótima iniciativa! Agora o próximo passo seria...',
  },
  observer: {
    tone: 'Gentil e não-invasivo',
    vocabulary: 'Ofertas suaves, sem pressão',
    pace: 'Pausado, respeitando silêncio',
    encouragement: 'Sutil, sem forçar participação',
    example: 'Se quiser, posso te mostrar um exemplo...',
  },
  rebel: {
    tone: 'Provocativo e irreverente',
    vocabulary: 'Desafios ao convencional, alternativas',
    pace: 'Direto, sem rodeios',
    encouragement: 'Valoriza pensamento independente',
    example: 'E se a gente pensasse diferente sobre isso?',
  },
};

// ─── OrchArchetypeTransformer ─────────────────────────────────────

class OrchArchetypeTransformer {
  /**
   * Transform an AI response to match the student's archetype tone.
   * Explorer (default) returns as-is to save tokens.
   */
  async transform(response: string, archetype: string): Promise<string> {
    const key = archetype.toLowerCase();

    // Default archetype — skip LLM call, save tokens
    if (key === 'explorer' || !ARCHETYPE_PROFILES[key]) {
      return response;
    }

    const systemPrompt = this.buildTransformPrompt(key);

    // Cap max tokens at 1.2x original to prevent bloat
    const estimatedTokens = Math.ceil(response.length / 3);
    const maxTokens = Math.ceil(estimatedTokens * 1.2);

    const result = await orchLLMService.generateResponse(
      systemPrompt,
      [{ role: 'user', content: response }],
      { maxTokens }
    );

    return result.text || response;
  }

  /**
   * Returns the config for a given archetype, or null if invalid.
   */
  getArchetypeConfig(archetype: string): ArchetypeConfig | null {
    return ARCHETYPE_PROFILES[archetype.toLowerCase()] ?? null;
  }

  /**
   * Builds the system prompt for LLM-based tone transformation.
   * CRITICAL: factual content must never change — only tone, vocabulary, and pace.
   */
  buildTransformPrompt(archetype: string): string {
    const config = ARCHETYPE_PROFILES[archetype.toLowerCase()];
    if (!config) {
      return '';
    }

    return [
      'Você é um adaptador de tom para comunicação educacional.',
      'Sua tarefa: reescrever a mensagem do assistente no tom descrito abaixo.',
      '',
      'REGRA ABSOLUTA: Mantenha TODO o conteúdo factual. Mude APENAS tom, vocabulário e ritmo.',
      'Nunca adicione informações que não existam no original.',
      'Nunca remova informações factuais do original.',
      'Mantenha o mesmo idioma do original.',
      '',
      `## Perfil de comunicação: ${archetype}`,
      `- Tom: ${config.tone}`,
      `- Vocabulário: ${config.vocabulary}`,
      `- Ritmo: ${config.pace}`,
      `- Estilo de encorajamento: ${config.encouragement}`,
      `- Exemplo de fala: "${config.example}"`,
      '',
      'Reescreva a mensagem a seguir nesse perfil. Responda APENAS com a mensagem reescrita, sem explicações.',
    ].join('\n');
  }
}

// ─── Singleton Export ─────────────────────────────────────────────

export const orchArchetypeTransformer = new OrchArchetypeTransformer();
