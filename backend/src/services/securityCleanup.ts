import { cleanupRateLimitBuckets } from '../middleware/rateLimit';
import { AuthInviteModel } from '../models/AuthInvite';
import { AuthPasswordResetModel } from '../models/AuthPasswordReset';
import { AuthSessionModel } from '../models/AuthSession';
import pool from '../config/database';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const IMPORT_JOB_RETENTION_DAYS = Number.parseInt(process.env.IMPORT_JOB_RETENTION_DAYS || '14', 10);

async function cleanupOldImportJobs() {
  const retentionDays = Number.isFinite(IMPORT_JOB_RETENTION_DAYS) && IMPORT_JOB_RETENTION_DAYS > 0 ? IMPORT_JOB_RETENTION_DAYS : 14;
  await pool.query(
    `DELETE FROM import_jobs
     WHERE \`status\` IN ('completed', 'failed')
       AND COALESCE(\`completedAt\`, \`updatedAt\`, \`createdAt\`) < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [retentionDays],
  );
}

async function runSecurityCleanup() {
  try {
    cleanupRateLimitBuckets();
    await Promise.all([
      AuthSessionModel.cleanupExpiredSessions(),
      AuthInviteModel.cleanupExpiredInvites(),
      AuthPasswordResetModel.cleanupExpiredResets(),
      cleanupOldImportJobs(),
    ]);
  } catch (error) {
    console.error('Security cleanup error:', error);
  }
}

export function startSecurityCleanupJob() {
  void runSecurityCleanup();
  return setInterval(runSecurityCleanup, CLEANUP_INTERVAL_MS);
}
