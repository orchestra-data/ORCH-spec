import type { PoolClient } from 'pg';
import { z } from 'zod';
import { embeddingService } from '../embedding-service';

const IngestParams = z.object({
  tenantId: z.string().uuid(),
  sourceFile: z.string(),
  routeContext: z.string().optional(),
  domain: z.string().optional(),
  chunks: z.array(z.string()).min(1),
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

class OrchAdminKnowledge {
  async ingestChunks(client: PoolClient, params: IngestParams): Promise<{ chunksCreated: number }> {
    const validated = IngestParams.parse(params);
    let chunksCreated = 0;

    for (let i = 0; i < validated.chunks.length; i++) {
      const chunk = validated.chunks[i];
      const embedding = await embeddingService.generateEmbedding(chunk);

      await client.query(
        `INSERT INTO orch_admin_embedding
           (tenant_id, chunk_text, chunk_index, embedding, source_file, route_context, domain)
         VALUES ($1, $2, $3, $4::vector, $5, $6, $7)`,
        [
          validated.tenantId,
          chunk,
          i,
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

  async search(client: PoolClient, params: SearchParams): Promise<SearchResult[]> {
    const validated = SearchParams.parse(params);
    const queryEmbedding = await embeddingService.generateEmbedding(validated.query);

    const { rows } = await client.query(
      `SELECT chunk_text, source_file, similarity
       FROM search_orch_admin_knowledge($1, $2::vector, $3, $4, $5)`,
      [
        validated.tenantId,
        JSON.stringify(queryEmbedding),
        validated.routeContext ?? null,
        validated.domain ?? null,
        validated.limit,
      ]
    );

    return rows.map((r: any) => ({
      chunkText: r.chunk_text,
      sourceFile: r.source_file,
      similarity: r.similarity,
    }));
  }

  async getStats(client: PoolClient, tenantId: string): Promise<{ total: number; byDomain: Record<string, number> }> {
    const { rows } = await client.query(
      `SELECT COALESCE(domain, 'unset') AS domain, COUNT(*)::int AS count
       FROM orch_admin_embedding WHERE tenant_id = $1
       GROUP BY domain`,
      [tenantId]
    );

    const byDomain: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byDomain[r.domain] = r.count;
      total += r.count;
    }

    return { total, byDomain };
  }

  chunkText(text: string, maxWords = 800, overlap = 150): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    const step = maxWords - overlap;
    for (let i = 0; i < words.length; i += step) {
      chunks.push(words.slice(i, i + maxWords).join(' '));
    }
    return chunks;
  }
}

export const orchAdminKnowledge = new OrchAdminKnowledge();
