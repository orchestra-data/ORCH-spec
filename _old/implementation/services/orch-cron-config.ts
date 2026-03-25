/**
 * ORCH CRON Jobs Configuration
 *
 * Integration: Add these to the existing cron scheduler in the Cogedu API.
 * Each job has: schedule (cron expression), handler function name, description, retry config.
 */

export interface OrchCronJob {
  id: string;
  schedule: string;
  handler: string;
  service: string;
  description: string;
  retryOnFailure: boolean;
  maxRetries: number;
  timeoutMs: number;
  epic: string;
}

export const ORCH_CRON_JOBS: OrchCronJob[] = [
  // ─────────────────────────────────────────────
  // EPIC-01: Hub Router
  // ─────────────────────────────────────────────
  {
    id: 'orch-circuit-breaker-check',
    schedule: '0 * * * *', // Every hour
    handler: 'checkCircuitHealth',
    service: 'orch-hub-router',
    description: 'Check Gemini health, close circuit if healthy',
    retryOnFailure: false,
    maxRetries: 0,
    timeoutMs: 10_000,
    epic: 'EPIC-01',
  },

  // ─────────────────────────────────────────────
  // EPIC-02: AVA Intelligence
  // ─────────────────────────────────────────────
  {
    id: 'orch-health-check',
    schedule: '0 5 * * *', // Daily 05:00
    handler: 'healthCheck',
    service: 'orch-health',
    description: 'Check Gemini, DB, Redis health',
    retryOnFailure: true,
    maxRetries: 3,
    timeoutMs: 30_000,
    epic: 'EPIC-02',
  },
  {
    id: 'orch-ebbinghaus-review',
    schedule: '0 6 * * *', // Daily 06:00
    handler: 'getDueReviews',
    service: 'orch-ebbinghaus',
    description: 'Flag concepts due for review today',
    retryOnFailure: true,
    maxRetries: 2,
    timeoutMs: 60_000,
    epic: 'EPIC-02',
  },
  {
    id: 'orch-comenius-recap',
    schedule: '5 6 * * *', // Daily 06:05
    handler: 'generateDailyRecapsBatch',
    service: 'orch-comenius',
    description: 'Generate daily recap quizzes (batch 50 students)',
    retryOnFailure: true,
    maxRetries: 2,
    timeoutMs: 300_000, // 5 min for batch
    epic: 'EPIC-02',
  },
  {
    id: 'orch-taylor-engagement',
    schedule: '0 14 * * *', // Daily 14:00
    handler: 'snapshotEngagement',
    service: 'orch-taylor',
    description: 'Daily engagement snapshot for all active students',
    retryOnFailure: true,
    maxRetries: 2,
    timeoutMs: 300_000,
    epic: 'EPIC-02',
  },
  {
    id: 'orch-sisifo-streaks',
    schedule: '59 23 * * *', // Daily 23:59
    handler: 'checkStreaksBatch',
    service: 'orch-sisifo',
    description: 'Check and update streaks for all students',
    retryOnFailure: true,
    maxRetries: 2,
    timeoutMs: 120_000,
    epic: 'EPIC-02',
  },

  // ─────────────────────────────────────────────
  // EPIC-03: Assessment + Analytics
  // ─────────────────────────────────────────────
  {
    id: 'orch-foucault-risk',
    schedule: '5 14 * * *', // Daily 14:05 (after Taylor)
    handler: 'batchAssess',
    service: 'orch-foucault',
    description: 'Batch risk assessment for all active students',
    retryOnFailure: true,
    maxRetries: 2,
    timeoutMs: 300_000,
    epic: 'EPIC-03',
  },
  {
    id: 'orch-weber-weekly',
    schedule: '0 4 * * 0', // Sunday 04:00
    handler: 'generateWeeklyBatch',
    service: 'orch-weber',
    description: 'Generate weekly D7 reports for all students',
    retryOnFailure: true,
    maxRetries: 3,
    timeoutMs: 600_000, // 10 min for batch
    epic: 'EPIC-03',
  },
  {
    id: 'orch-weber-monthly',
    schedule: '0 4 1 * *', // 1st of month 04:00
    handler: 'generateMonthlyBatch',
    service: 'orch-weber',
    description: 'Generate monthly D7 reports for all students',
    retryOnFailure: true,
    maxRetries: 3,
    timeoutMs: 600_000,
    epic: 'EPIC-03',
  },

  // ─────────────────────────────────────────────
  // EPIC-04: Admin Intelligence
  // ─────────────────────────────────────────────
  {
    id: 'orch-admin-alerts',
    schedule: '0 7 * * 1-5', // Weekdays 07:00
    handler: 'generateAlerts',
    service: 'orch-admin-alerts',
    description: 'Generate proactive alerts for staff',
    retryOnFailure: true,
    maxRetries: 2,
    timeoutMs: 120_000,
    epic: 'EPIC-04',
  },
  {
    id: 'orch-admin-escalation',
    schedule: '0 */6 * * *', // Every 6 hours
    handler: 'autoEscalate',
    service: 'orch-admin-alerts',
    description: 'Auto-escalate unread critical alerts > 24h',
    retryOnFailure: true,
    maxRetries: 2,
    timeoutMs: 60_000,
    epic: 'EPIC-04',
  },
  {
    id: 'orch-admin-archive',
    schedule: '0 3 * * 0', // Sunday 03:00
    handler: 'archiveOld',
    service: 'orch-admin-chat',
    description: 'Archive admin conversations inactive > 30 days',
    retryOnFailure: false,
    maxRetries: 0,
    timeoutMs: 60_000,
    epic: 'EPIC-04',
  },
];
