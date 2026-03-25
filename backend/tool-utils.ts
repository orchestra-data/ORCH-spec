import type { Pool, PoolClient } from 'pg';

import { TOOL_LIMITS } from './types';

/**
 * SECURITY-LAYER-1: Execute function inside a READ ONLY transaction.
 *
 * Guarantees at the PostgreSQL level:
 * - INSERT/UPDATE/DELETE are REJECTED: "cannot execute INSERT in a read-only transaction"
 * - statement_timeout cancels slow queries server-side (not just JS-side like Promise.race)
 *
 * ALL tool executions MUST go through this function.
 */
export async function withReadOnlyTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
  timeoutMs: number = TOOL_LIMITS.TOOL_TIMEOUT_MS
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    // SET doesn't support $1 params — validate as integer to prevent injection
    const safeTimeout = Math.max(0, Math.floor(timeoutMs));
    await client.query(`SET LOCAL statement_timeout = '${safeTimeout}'`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Sanitize string inputs for ILIKE queries to prevent injection via search parameters.
 * Escapes special LIKE characters (%, _, \) and truncates to 200 chars.
 */
export function sanitizeSearchInput(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&').substring(0, 200);
}

/**
 * Truncate tool result before sending to LLM.
 * Keeps result under MAX_RESULT_CHARS to avoid token bloat.
 */
export function truncateResult(result: unknown): unknown {
  const json = JSON.stringify(result);
  if (json.length <= TOOL_LIMITS.MAX_RESULT_CHARS) return result;
  if (Array.isArray(result)) {
    const truncated = result.slice(0, 5);
    return [...truncated, { _truncated: true, totalItems: result.length }];
  }
  // Truncate large non-array objects by keeping only the stringified prefix
  if (typeof result === 'object' && result !== null) {
    return { _truncated: true, preview: json.substring(0, TOOL_LIMITS.MAX_RESULT_CHARS - 50) };
  }
  return result;
}
