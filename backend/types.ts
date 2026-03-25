import type { Pool } from 'pg';

import type { OrchUserRole } from '../../utils/resolve-user-role';

export interface OrchToolContext {
  pool: Pool;
  userId: string;
  tenantId: string;
  companyId: string;
  accessibleCompanyIds: string[];
  userRole: OrchUserRole;
}

export const TOOL_LIMITS = {
  MAX_ROWS: 20,
  MAX_RESULT_CHARS: 3000,
  TOOL_TIMEOUT_MS: 5000,
} as const;
