import { cleanupRateLimitBuckets } from '../middleware/rateLimit';
import { AuthInviteModel } from '../models/AuthInvite';
import { AuthPasswordResetModel } from '../models/AuthPasswordReset';
import { AuthSessionModel } from '../models/AuthSession';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function runSecurityCleanup() {
  try {
    cleanupRateLimitBuckets();
    await Promise.all([
      AuthSessionModel.cleanupExpiredSessions(),
      AuthInviteModel.cleanupExpiredInvites(),
      AuthPasswordResetModel.cleanupExpiredResets(),
    ]);
  } catch (error) {
    console.error('Security cleanup error:', error);
  }
}

export function startSecurityCleanupJob() {
  void runSecurityCleanup();
  return setInterval(runSecurityCleanup, CLEANUP_INTERVAL_MS);
}
