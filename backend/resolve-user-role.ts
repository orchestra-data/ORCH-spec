import type { Pool, PoolClient } from 'pg';

export type OrchUserRole = 'admin' | 'professor' | 'student';

/**
 * Resolves the user's effective role for Orch tool filtering.
 * Hierarchy: admin > professor > student
 *
 * Uses RBAC permission keys (validated against real DB):
 * - admin: has 'bi.read' (Super Administrador, Tenant Administrator, BI Manager)
 * - professor: has 'edu.attendance.session.manage' (Instructor, Academic Coordinator)
 * - student: default (has 'edu.progress.read_own' or fewer permissions)
 *
 * Note: role_permission uses permission_id (UUID FK), requires JOIN with permission table.
 */
export async function resolveUserRole(
  client: Pool | PoolClient,
  userId: string,
  tenantId: string,
  companyId: string
): Promise<OrchUserRole> {
  const result = await client.query<{ key: string }>(
    `SELECT DISTINCT p.key
     FROM user_company_role ucr
     JOIN role_permission rp ON rp.role_id = ucr.role_id
     JOIN permission p ON p.id = rp.permission_id
     WHERE ucr.user_id = $1
       AND ucr.company_id = $2
       AND ucr.tenant_id = $3
       AND p.key IN ('bi.read', 'edu.attendance.session.manage')`,
    [userId, companyId, tenantId]
  );

  const keys = new Set(result.rows.map((r) => r.key));

  if (keys.has('bi.read')) return 'admin';
  if (keys.has('edu.attendance.session.manage')) return 'professor';
  return 'student';
}
