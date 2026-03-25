// apps/api/src/app/services/orch-llm-service.ts
//
// Provider-agnostic LLM wrapper built on Vercel AI SDK.
// Swapping providers = changing ORCH_LLM_PROVIDER env var. Zero code changes.
//
// Already installed in package.json:
//   "ai": "^4.3.19"
//   "@ai-sdk/google": "^1.2.22"
//   "@ai-sdk/openai": "^1.0.0"

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, generateObject, type LanguageModel, type CoreTool } from 'ai';
import { z } from 'zod';

// ─── Provider Registry ───────────────────────────────────────────
// Add new providers here. Each returns a LanguageModel from its adapter.

type ProviderFactory = (modelId: string) => LanguageModel;

const providers: Record<string, ProviderFactory> = {
  google: (modelId: string) => {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
    });
    return google(modelId) as LanguageModel;
  },

  openai: (modelId: string) => {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });
    return openai(modelId) as LanguageModel;
  },

  // Future: add anthropic, mistral, etc.
  // anthropic: (modelId) => {
  //   const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  //   return anthropic(modelId);
  // },
};

// ─── Configuration ───────────────────────────────────────────────

export interface OrchLLMConfig {
  provider: string; // 'google' | 'openai' | 'anthropic' | ...
  modelId: string; // 'gemini-2.5-flash' | 'gpt-4o-mini' | ...
}

// Default config from env vars (fallback to Gemini)
function getDefaultConfig(): OrchLLMConfig {
  return {
    provider: process.env.ORCH_LLM_PROVIDER || 'google',
    modelId: process.env.ORCH_LLM_MODEL || 'gemini-2.5-flash',
  };
}

// ─── Intent Classification Schema ────────────────────────────────

const OrchIntentSchema = z.object({
  intent: z.enum([
    'greeting',
    'explain',
    'workflow',
    'query',
    'feedback',
    'navigate',
    'error',
    'correction',
  ]),
  confidence: z.number().min(0).max(1),
  entities: z.array(z.string()).optional(), // e.g., ['aluno', 'nota'] or ['processo seletivo']
  summary: z.string(), // one-line summary of what user wants
});

export type OrchIntent = z.infer<typeof OrchIntentSchema>;

// ─── OrchLLMService ──────────────────────────────────────────────

export class OrchLLMService {
  /**
   * Create a model instance from config.
   * Can be overridden per-request (e.g., per-tenant config from DB).
   */
  private createModel(config?: OrchLLMConfig): LanguageModel {
    const { provider, modelId } = config || getDefaultConfig();

    const factory = providers[provider];
    if (!factory) {
      throw new Error(
        `Unknown LLM provider: "${provider}". Available: ${Object.keys(providers).join(', ')}`
      );
    }

    return factory(modelId);
  }

  /**
   * Generate a text response with usage tracking.
   * Optionally accepts tools and maxSteps for tool calling support (backward compatible).
   */
  async generateResponse(
    systemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    config?: Partial<OrchLLMConfig> & {
      tools?: Record<string, CoreTool>;
      maxSteps?: number;
      toolChoice?: 'auto' | 'required' | 'none';
    }
  ): Promise<{
    text: string;
    usage: any;
    provider: string;
    model: string;
    toolCalls?: Array<{ toolName: string; args: unknown; result: unknown }>;
    steps?: Array<unknown>;
  }> {
    const resolvedConfig = { ...getDefaultConfig(), ...config };
    const model = this.createModel(resolvedConfig);

    const result = await generateText({
      model,
      system: systemPrompt,
      messages,
      ...(config?.tools && {
        tools: config.tools,
        toolChoice: (config?.toolChoice ?? 'auto') as 'auto' | 'required' | 'none',
        maxSteps: config?.maxSteps ?? 3,
      }),
    });

    return {
      text: result.text,
      usage: result.usage,
      provider: resolvedConfig.provider,
      model: resolvedConfig.modelId,
      toolCalls: result.toolCalls as unknown as
        | Array<{ toolName: string; args: unknown; result: unknown }>
        | undefined,
      steps: result.steps as unknown as Array<unknown> | undefined,
    };
  }

  /**
   * Generate structured output with Zod schema.
   */
  async generateStructuredOutput<T>(
    schema: z.ZodSchema<T>,
    prompt: string,
    system?: string,
    config?: OrchLLMConfig
  ): Promise<{ object: T; usage: any; provider: string; model: string }> {
    const resolvedConfig = config || getDefaultConfig();
    const model = this.createModel(resolvedConfig);

    const result = await generateObject({
      model,
      schema,
      prompt,
      ...(system && { system }),
    });

    return {
      object: result.object as T,
      usage: result.usage,
      provider: resolvedConfig.provider,
      model: resolvedConfig.modelId,
    };
  }

  /**
   * Classify user intent before generating main response.
   * Uses a lightweight structured output call (fast + cheap).
   */
  async classifyIntent(
    message: string,
    pageUrl: string | null,
    config?: OrchLLMConfig
  ): Promise<OrchIntent> {
    const { object } = await this.generateStructuredOutput(
      OrchIntentSchema,
      `Classifique a intencao do usuario no contexto do sistema CoGEdu (LMS educacional).

Mensagem: "${message}"
Pagina atual: ${pageUrl || 'desconhecida'}

Categorias:
- greeting: saudacao, oi, bom dia
- explain: quer entender campo, botao, pagina, funcionalidade
- workflow: quer saber como fazer algo passo a passo
- query: quer consultar dados (aluno, turma, nota, processo)
- feedback: sugestao, reclamacao, bug report
- navigate: quer ir para outra pagina ou encontrar menu
- error: esta reportando um erro ou problema tecnico
- correction: esta corrigindo algo que voce disse errado

Extraia entidades relevantes (aluno, turma, nota, campo, etc.).
Retorne confianca entre 0 e 1.`,
      'Voce e um classificador de intencoes para um assistente de LMS educacional.',
      config
    );

    return object;
  }
}

export const orchLLMService = new OrchLLMService();
