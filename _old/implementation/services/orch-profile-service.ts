import type { PoolClient } from 'pg';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface OrchStudentProfile {
  id: string;
  student_id: string;
  tenant_id: string;
  archetype: string;
  tone_preference: string;
  engagement_score: number;
  streak_days: number;
  xp_total: number;
  level: number;
  cognitive_snapshot: Record<string, unknown>;
  accessibility_flags: Record<string, unknown>;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProfileAuditRecord {
  id: string;
  student_id: string;
  agent_id: string;
  field_path: string;
  old_value: unknown;
  new_value: unknown;
  reasoning: string;
  version_at: number;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const UpdateFieldParamsSchema = z.object({
  studentId: z.string().uuid(),
  agentId: z.string(),
  fieldPath: z.string().min(1),
  newValue: z.unknown(),
  reasoning: z.string().min(1),
});

type UpdateFieldParams = z.infer<typeof UpdateFieldParamsSchema>;

// ---------------------------------------------------------------------------
// OrchProfileService
// ---------------------------------------------------------------------------

class OrchProfileService {
  async loadOrCreate(
    client: PoolClient,
    studentId: string,
    tenantId: string,
  ): Promise<OrchStudentProfile> {
    const SELECT_SQL = `
      SELECT *
      FROM orch_student_profile
      WHERE student_id = $1 AND tenant_id = $2
      LIMIT 1
    `;

    const existing = await client.query<OrchStudentProfile>(SELECT_SQL, [studentId, tenantId]);

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const INSERT_SQL = `
      INSERT INTO orch_student_profile
        (student_id, tenant_id, archetype, tone_preference, engagement_score,
         streak_days, xp_total, level, cognitive_snapshot, accessibility_flags, version)
      VALUES
        ($1, $2, 'explorer', 'friendly', 0, 0, 0, 1, '{}'::jsonb, '{}'::jsonb, 1)
      RETURNING *
    `;

    const created = await client.query<OrchStudentProfile>(INSERT_SQL, [studentId, tenantId]);
    return created.rows[0];
  }

  async updateField(
    client: PoolClient,
    params: UpdateFieldParams,
  ): Promise<OrchStudentProfile> {
    const validated = UpdateFieldParamsSchema.parse(params);
    const { studentId, agentId, fieldPath, newValue, reasoning } = validated;

    // 1. Read current value for audit trail
    const CURRENT_SQL = `
      SELECT version, ${this.buildJsonbExtract(fieldPath)} AS current_value
      FROM orch_student_profile
      WHERE student_id = $1
    `;
    const current = await client.query<{ version: number; current_value: unknown }>(
      CURRENT_SQL,
      [studentId],
    );

    if (current.rows.length === 0) {
      throw new Error(`Profile not found for student ${studentId}`);
    }

    const oldValue = current.rows[0].current_value;
    const currentVersion = current.rows[0].version;

    // 2. Update the field using jsonb_set for nested paths, direct SET for top-level
    const isTopLevel = !fieldPath.includes('.');
    let UPDATE_SQL: string;
    let updateParams: unknown[];

    if (isTopLevel) {
      UPDATE_SQL = `
        UPDATE orch_student_profile
        SET ${fieldPath} = $1, version = version + 1, updated_at = NOW()
        WHERE student_id = $2
        RETURNING *
      `;
      updateParams = [newValue, studentId];
    } else {
      const pathParts = fieldPath.split('.');
      const column = pathParts[0];
      const jsonPath = `{${pathParts.slice(1).join(',')}}`;

      UPDATE_SQL = `
        UPDATE orch_student_profile
        SET ${column} = jsonb_set(COALESCE(${column}, '{}'::jsonb), $1::text[], $2::jsonb),
            version = version + 1,
            updated_at = NOW()
        WHERE student_id = $3
        RETURNING *
      `;
      updateParams = [jsonPath, JSON.stringify(newValue), studentId];
    }

    const updated = await client.query<OrchStudentProfile>(UPDATE_SQL, updateParams);

    // 3. Insert audit record
    const AUDIT_SQL = `
      INSERT INTO orch_profile_audit
        (student_id, agent_id, field_path, old_value, new_value, reasoning, version_at)
      VALUES
        ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
    `;
    await client.query<ProfileAuditRecord>(AUDIT_SQL, [
      studentId,
      agentId,
      fieldPath,
      JSON.stringify(oldValue),
      JSON.stringify(newValue),
      reasoning,
      currentVersion,
    ]);

    return updated.rows[0];
  }

  async getAuditTrail(
    client: PoolClient,
    studentId: string,
    limit = 50,
  ): Promise<ProfileAuditRecord[]> {
    const SQL = `
      SELECT *
      FROM orch_profile_audit
      WHERE student_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await client.query<ProfileAuditRecord>(SQL, [studentId, limit]);
    return result.rows;
  }

  async detectArchetype(
    client: PoolClient,
    studentId: string,
  ): Promise<string> {
    // Placeholder: returns current archetype from profile.
    // Future: analyze interaction patterns (frequency, agent affinity, time-of-day)
    // to suggest archetype transitions (explorer → achiever → specialist).
    const SQL = `
      SELECT archetype
      FROM orch_student_profile
      WHERE student_id = $1
      LIMIT 1
    `;

    const result = await client.query<{ archetype: string }>(SQL, [studentId]);
    return result.rows[0]?.archetype ?? 'explorer';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildJsonbExtract(fieldPath: string): string {
    const parts = fieldPath.split('.');
    if (parts.length === 1) return parts[0];

    const column = parts[0];
    const jsonKeys = parts.slice(1);
    const arrows = jsonKeys.map((k) => `'${k}'`).join('->');
    return `${column}->${arrows}`;
  }
}

export const orchProfileService = new OrchProfileService();
