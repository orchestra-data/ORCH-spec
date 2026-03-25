import type { PoolClient } from 'pg';
import { z } from 'zod';

const IngestParams = z.object({
  tenantId: z.string().uuid(),
  filePath: z.string(),
  sourceFile: z.string(),
  routeContext: z.string().optional(),
  domain: z.string().optional(),
});
type IngestParams = z.infer<typeof IngestParams>;

const SearchParams = z.object({
  tenantId: z.string().uuid(),
  query: z.string().min(1),
  routeContext: z.string().optional(),
  domain: z.string().optional(),
  limit: z.number().int().positive().default(5),
});
type SearchParams = z.infer<typeof SearchParams>;

interface SearchResult {
  chunkText: string;
  sourceFile: string;
  similarity: number;
}

interface IngestResult {
  chunksCreated: number;
}

interface KnowledgeStats {
  bySourceFile: Record<string, number>;
  byDomain: Record<string, number>;
  total: number;
}

class OrchAdminKnowledge {
  /**
   * Ingest a YAML file into the RAG knowledge base.
   * Reads content, chunks it, generates embeddings, and stores in orch_admin_embedding.
   */
  async ingestYAML(client: PoolClient, params: IngestParams): Promise<IngestResult> {
    const validated = IngestParams.parse(params);
    const fs = await import('fs/promises');
    const content = await fs.readFile(validated.filePath, 'utf-8');

    const chunks = this.chunkText(content, 1000, 200);
    let chunksCreated = 0;

    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk);

      await client.query(
        `INSERT INTO orch_admin_embedding
           (tenant_id, chunk_text, embedding, source_file, route_context, domain)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          validated.tenantId,
          chunk,
          JSON.stringify(embedding),
          validated.sourceFile,
          validated.routeContext ?? null,
          validated.domain ?? null,
        ]
      );
      chunksCreated++;
    }

    return { chunksCreated };
  }

  /**
   * Delete all embeddings for a tenant and re-ingest from source files.
   */
  async reindex(client: PoolClient, tenantId: string): Promise<{ reindexed: number }> {
    const { rows: sources } = await client.query(
      `SELECT DISTINCT source_file FROM orch_admin_embedding WHERE tenant_id = $1`,
      [tenantId]
    );

    await client.query(
      `DELETE FROM orch_admin_embedding WHERE tenant_id = $1`,
      [tenantId]
    );

    let total = 0;
    for (const { source_file } of sources) {
      try {
        const result = await this.ingestYAML(client, {
          tenantId,
          filePath: source_file,
          sourceFile: source_file,
        });
        total += result.chunksCreated;
      } catch {
        // Source file may no longer exist — skip silently
      }
    }

    return { reindexed: total };
  }

  /**
   * Semantic search over the knowledge base using pgvector similarity.
   * Calls the search_orch_knowledge() PL/pgSQL function (already exists from Leo).
   */
  async search(client: PoolClient, params: SearchParams): Promise<SearchResult[]> {
    const validated = SearchParams.parse(params);
    const queryEmbedding = await this.generateEmbedding(validated.query);

    const { rows } = await client.query(
      `SELECT chunk_text, source_file, similarity
       FROM search_orch_knowledge($1, $2, $3, $4, $5)`,
      [
        validated.tenantId,
        JSON.stringify(queryEmbedding),
        validated.routeContext ?? null,
        validated.domain ?? null,
        validated.limit,
      ]
    );

    return rows.map((r) => ({
      chunkText: r.chunk_text,
      sourceFile: r.source_file,
      similarity: r.similarity,
    }));
  }

  /**
   * Count embeddings grouped by source_file and domain for a tenant.
   */
  async getStats(client: PoolClient, tenantId: string): Promise<KnowledgeStats> {
    const { rows: byFile } = await client.query(
      `SELECT source_file, COUNT(*)::int AS count
       FROM orch_admin_embedding WHERE tenant_id = $1
       GROUP BY source_file`,
      [tenantId]
    );

    const { rows: byDomain } = await client.query(
      `SELECT COALESCE(domain, 'unset') AS domain, COUNT(*)::int AS count
       FROM orch_admin_embedding WHERE tenant_id = $1
       GROUP BY domain`,
      [tenantId]
    );

    const bySourceFile: Record<string, number> = {};
    let total = 0;
    for (const r of byFile) {
      bySourceFile[r.source_file] = r.count;
      total += r.count;
    }

    const byDomainMap: Record<string, number> = {};
    for (const r of byDomain) {
      byDomainMap[r.domain] = r.count;
    }

    return { bySourceFile, byDomain: byDomainMap, total };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private chunkText(text: string, maxTokens: number, overlap: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    const chunkSize = maxTokens; // approximate: 1 token ≈ 0.75 words
    const step = chunkSize - overlap;
    for (let i = 0; i < words.length; i += step) {
      chunks.push(words.slice(i, i + chunkSize).join(' '));
    }
    return chunks;
  }

  /**
   * Generate an embedding vector for the given text.
   * Delegates to orchLLMService or falls back to OpenAI embeddings API.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: wire to orchLLMService.embed(text) or OpenAI embeddings endpoint
    // Placeholder — returns empty vector until LLM service integration
    throw new Error('generateEmbedding: not yet wired to orchLLMService / OpenAI');
  }
}

export const orchAdminKnowledge = new OrchAdminKnowledge();
