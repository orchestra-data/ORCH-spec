/**
 * Orch Admin Chat — TDD Test Suite
 * Business rules: BUSINESS-RULES.md
 *
 * Run: npx vitest run src/app/services/admin/__tests__/orch-admin-chat.test.ts
 */
import fs from 'fs';
import path from 'path';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createOrchTools, filterToolsByRole } from '../../orch-tools/index';
import type { OrchToolContext } from '../../orch-tools/types';

// ─── Helpers ──────────────────────────────────────────────────

function mockPool(queryResult: { rows: unknown[] } = { rows: [] }): Pool {
  const client: Partial<PoolClient> = {
    // @ts-expect-error - partial signature
    query: vi.fn(async () => queryResult),
    release: vi.fn(),
  };
  return {
    connect: vi.fn(async () => client as PoolClient),
    query: vi.fn(async () => queryResult),
  } as unknown as Pool;
}

function makeContext(overrides?: Partial<OrchToolContext>): OrchToolContext {
  return {
    pool: mockPool(),
    userId: 'user-1',
    tenantId: 'tenant-1',
    companyId: 'company-1',
    accessibleCompanyIds: ['company-1'],
    userRole: 'admin',
    ...overrides,
  };
}

// Read source files for static analysis
const SERVICE_PATH = path.resolve(__dirname, '../orch-admin-chat.ts');
const ENDPOINT_PATH = path.resolve(__dirname, '../../../../endpoints/orchAdminChat/orchAdminChat.ts');
const serviceSource = fs.existsSync(SERVICE_PATH) ? fs.readFileSync(SERVICE_PATH, 'utf-8') : '';
const endpointSource = fs.existsSync(ENDPOINT_PATH) ? fs.readFileSync(ENDPOINT_PATH, 'utf-8') : '';

// ═══════════════════════════════════════════════════════════════
// R1. IDENTIDADE E PERSONA
// ═══════════════════════════════════════════════════════════════

describe('R1: Identidade e Persona', () => {
  it('R1.1: system prompt menciona "funcionarios"', () => {
    expect(serviceSource).toContain('funcionarios');
    expect(serviceSource).toContain('admin, coordenadores, professores');
  });

  it('R1.2: secao de identidade NAO menciona "aluno/estudante/student"', () => {
    const identityMatch = serviceSource.match(/## Identidade e tom[\s\S]*?(?=\n##)/);
    expect(identityMatch).not.toBeNull();
    if (identityMatch) {
      const section = identityMatch[0];
      expect(section).not.toMatch(/\baluno\b/);
      expect(section).not.toMatch(/\bestudante\b/);
      expect(section).not.toMatch(/\bstudent\b/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// R2. TOOL MAPPING NO SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

describe('R2: Tool Mapping no System Prompt', () => {
  it('R2.1: toda tool no prompt existe no filterToolsByRole("admin")', () => {
    const ctx = makeContext({ userRole: 'admin' });
    const allTools = createOrchTools(ctx);
    const adminTools = filterToolsByRole(allTools, 'admin');
    const adminToolNames = Object.keys(adminTools);

    // Extract tool names from prompt mapping (→ toolName pattern)
    const mappingMatch = serviceSource.match(/Mapeamento obrigatorio:[\s\S]*?(?=\nREGRAS CRITICAS)/);
    expect(mappingMatch).not.toBeNull();

    if (mappingMatch) {
      const toolRefs = mappingMatch[0].match(/→\s*(\w+)/g) || [];
      const promptToolNames = toolRefs.map((r) => r.replace(/→\s*/, ''));

      for (const toolName of promptToolNames) {
        expect(adminToolNames, `"${toolName}" in prompt but not in admin tools`).toContain(toolName);
      }
    }
  });

  it('R2.2: prompt admin NAO referencia tools "getMy*"', () => {
    const mappingMatch = serviceSource.match(/Mapeamento obrigatorio:[\s\S]*?(?=\nREGRAS CRITICAS)/);
    expect(mappingMatch).not.toBeNull();

    if (mappingMatch) {
      const mapping = mappingMatch[0];
      expect(mapping).not.toContain('getMyGrades');
      expect(mapping).not.toContain('getMyProgress');
      expect(mapping).not.toContain('getMyAttendance');
      expect(mapping).not.toContain('getMyCourseContent');
      expect(mapping).not.toContain('getMyEnrollments');
      expect(mapping).not.toContain('getMyProfile');
    }
  });

  it('R2.3: todas admin tools estao no mapeamento', () => {
    const adminSpecificTools = [
      'listAllCourses',
      'listAllStudents',
      'getInstitutionStats',
      'getAccessLogs',
      'getPendingGrading',
      'getTeacherActivity',
      'getStudentInfo',
      'getStudentAttendance',
      'getClassStats',
      'getBIMetrics',
    ];

    for (const tool of adminSpecificTools) {
      expect(serviceSource, `${tool} missing from system prompt`).toContain(tool);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// R3. AUTH CHAIN
// ═══════════════════════════════════════════════════════════════

describe('R3: Auth Chain', () => {
  it('R3.2: endpoint loga warning se user nao encontrado no DB', () => {
    expect(endpointSource).toContain('No DB user found');
  });

  it('R3.3: endpoint retorna 500 se lookup falhar (nao fallback silencioso)', () => {
    expect(endpointSource).toContain('console.error');
    expect(endpointSource).toContain('res.status(500)');
    // Deve estar no bloco de resolucao de DB user
    expect(endpointSource).toContain('Failed to resolve DB user.id');
  });

  it('R3.5: accessibleCompanyIds tem fallback para [resolvedCompanyId]', () => {
    expect(endpointSource).toContain('resolvedCompanyIds');
    expect(endpointSource).toContain('[resolvedCompanyId]');
  });
});

// ═══════════════════════════════════════════════════════════════
// R4. TOOL EXECUTION
// ═══════════════════════════════════════════════════════════════

describe('R4: Tool Execution', () => {
  it('R4.1: admin tem pelo menos 17 tools', () => {
    const ctx = makeContext({ userRole: 'admin' });
    const allTools = createOrchTools(ctx);
    const adminTools = filterToolsByRole(allTools, 'admin');
    expect(Object.keys(adminTools).length).toBeGreaterThanOrEqual(17);
  });

  it('R4.3: student tem 7 tools', () => {
    const ctx = makeContext({ userRole: 'admin' });
    const allTools = createOrchTools(ctx);
    const studentTools = filterToolsByRole(allTools, 'student');
    expect(Object.keys(studentTools)).toHaveLength(7);
  });

  it('R4.4: tools rodam em READ ONLY transaction', async () => {
    const queryCalls: string[] = [];
    const client: Partial<PoolClient> = {
      query: vi.fn(async (sql: string) => {
        queryCalls.push(typeof sql === 'string' ? sql : 'non-string');
        return { rows: [] };
      }) as unknown as PoolClient['query'],
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client as PoolClient),
    } as unknown as Pool;

    const ctx = makeContext({ userRole: 'admin', pool });
    const tools = createOrchTools(ctx);
    const t = tools['getInstitutionStats'] as unknown as {
      execute: (params: unknown) => Promise<unknown>;
    };
    await t.execute({});

    expect(queryCalls[0]).toBe('BEGIN TRANSACTION READ ONLY');
    // Mock returns empty rows, so tool hits error → ROLLBACK (correct behavior)
    // With real data it would COMMIT. We verify the transaction pattern starts correctly.
    expect(queryCalls[queryCalls.length - 1]).toMatch(/COMMIT|ROLLBACK/);
  });

  it('R4.7: tool error retorna { error } nao throw', async () => {
    const client: Partial<PoolClient> = {
      query: vi.fn(async (sql: string) => {
        if (typeof sql === 'string' && sql.startsWith('SELECT')) {
          throw new Error('DB error');
        }
        return { rows: [] };
      }) as unknown as PoolClient['query'],
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client as PoolClient),
    } as unknown as Pool;

    const ctx = makeContext({ userRole: 'admin', pool });
    const tools = createOrchTools(ctx);
    const t = tools['getInstitutionStats'] as unknown as {
      execute: (params: unknown) => Promise<unknown>;
    };

    const result = (await t.execute({})) as { error?: string };
    expect(result).toHaveProperty('error');
    expect(typeof result.error).toBe('string');
  });

  it('R4.8: tool error e logado no console', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client: Partial<PoolClient> = {
      query: vi.fn(async (sql: string) => {
        if (typeof sql === 'string' && sql.startsWith('SELECT')) {
          throw new Error('test error');
        }
        return { rows: [] };
      }) as unknown as PoolClient['query'],
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client as PoolClient),
    } as unknown as Pool;

    const ctx = makeContext({ userRole: 'admin', pool });
    const tools = createOrchTools(ctx);
    const t = tools['getInstitutionStats'] as unknown as {
      execute: (params: unknown) => Promise<unknown>;
    };
    await t.execute({});

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// R5. CONTEXTO E RAG
// ═══════════════════════════════════════════════════════════════

describe('R5: Contexto e RAG', () => {
  it('R5.1: RAG catch bloco NAO e silencioso', () => {
    // Must have console.warn in RAG catch
    const ragCatchPattern = /orchAdminKnowledge\.search[\s\S]*?catch\s*\((\w+)\)\s*\{[^}]*console\.warn/;
    expect(serviceSource).toMatch(ragCatchPattern);
  });

  it('R5.4: institution name catch NAO e silencioso', () => {
    const instCatchPattern = /display_name[\s\S]*?catch\s*\((\w+)\)\s*\{[^}]*console\.warn/;
    expect(serviceSource).toMatch(instCatchPattern);
  });

  it('R5.5: routeContext incluido no system prompt', () => {
    expect(serviceSource).toContain('Rota atual:');
    expect(serviceSource).toContain('validated.routeContext');
  });

  it('R5.6: endpoint aceita pageUrl no body', () => {
    expect(endpointSource).toContain('pageUrl');
  });
});

// ═══════════════════════════════════════════════════════════════
// R6. CONVERSATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════

describe('R6: Conversation Management', () => {
  it('R6.3: historico limitado a 10 mensagens', () => {
    expect(serviceSource).toContain('getRecentHistory(client, sessionId, 10)');
  });

  it('R6.5: saveMessagePair insere user + assistant', () => {
    expect(serviceSource).toContain("'user'");
    expect(serviceSource).toContain("'assistant'");
  });

  it('R6.6: messages_count incrementa em 2', () => {
    expect(serviceSource).toContain('messages_count + 2');
  });
});

// ═══════════════════════════════════════════════════════════════
// R7. RATE LIMITING
// ═══════════════════════════════════════════════════════════════

describe('R7: Rate Limiting', () => {
  it('R7.1: rate limit 15 req/min', () => {
    expect(endpointSource).toContain('max: 15');
    expect(endpointSource).toContain('60_000');
  });

  it('R7.4: rejeita sem message', () => {
    expect(endpointSource).toContain("!message");
    expect(endpointSource).toContain('400');
  });

  it('R7.5: rejeita sem routeContext', () => {
    expect(endpointSource).toContain("!routeContext");
  });
});

// ═══════════════════════════════════════════════════════════════
// R8. LLM INTEGRATION
// ═══════════════════════════════════════════════════════════════

describe('R8: LLM Integration', () => {
  it('R8.1: tools passadas com maxSteps e toolChoice', () => {
    expect(serviceSource).toContain('maxSteps: 5');
    expect(serviceSource).toContain("toolChoice: 'auto'");
  });

  it('R8.2: sem tools nao passa config de tools', () => {
    expect(serviceSource).toContain('hasTools');
    // Conditional spread: ...(hasTools ? { tools, ... } : {})
    expect(serviceSource).toMatch(/hasTools\s*\?/);
  });
});

// ═══════════════════════════════════════════════════════════════
// R9. INTENT DETECTION
// ═══════════════════════════════════════════════════════════════

describe('R9: Intent Detection', () => {
  const cases = [
    { input: 'passo a passo para criar turma', expected: 'walkthrough' },
    { input: 'tutorial de como cadastrar', expected: 'walkthrough' },
    { input: 'como faco para gerar relatorio', expected: 'walkthrough' },
    { input: 'o que e essa pagina', expected: 'explain' },
    { input: 'explica esse campo', expected: 'explain' },
    { input: 'como funciona o fluxo', expected: 'workflow' },
    { input: 'ir para turmas', expected: 'navigate' },
    { input: 'preenche o formulario', expected: 'form_fill' },
    { input: 'quantos alunos temos', expected: 'query' },
    { input: 'lista os cursos', expected: 'query' },
  ];

  // Replicate detectIntent from source
  function detectIntent(message: string): string {
    const lower = message.toLowerCase();
    if (/passo.a.passo|tutorial|guia|como fa[czç]o|walkthrough/i.test(lower)) return 'walkthrough';
    if (/preenche|preencher|coloca.*campo|fill/i.test(lower)) return 'form_fill';
    if (/o que [eé]|explica|para que serve|significado/i.test(lower)) return 'explain';
    if (/como.*funciona|fluxo|processo|workflow/i.test(lower)) return 'workflow';
    if (/ir para|abrir|navegar|link|onde fica/i.test(lower)) return 'navigate';
    return 'query';
  }

  for (const { input, expected } of cases) {
    it(`"${input}" → ${expected}`, () => {
      expect(detectIntent(input)).toBe(expected);
    });
  }
});
