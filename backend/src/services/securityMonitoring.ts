import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { AuditLog } from '../models/AuditLog';
import { UserNotificationModel } from '../models/UserNotification';
import { broadcastAccountEvent } from './appEvents';

interface SecurityRecipientRow extends RowDataPacket {
  id: string;
}

interface CountRow extends RowDataPacket {
  total: number;
}

type SecurityAlert = {
  key: string;
  title: string;
  message: string;
  cooldownMinutes: number;
};

const repeatedEventRules: Record<string, { threshold: number; windowMinutes: number; title: string; message: (count: number, log: AuditLog) => string }> = {
  'auth.login_failed': {
    threshold: 5,
    windowMinutes: 15,
    title: 'Repeated failed sign-ins',
    message: (count, log) => `${count} failed sign-in attempts were recorded in 15 minutes from ${log.ipAddress || 'an unknown IP address'}.`,
  },
  'auth.unlock_failed': {
    threshold: 5,
    windowMinutes: 15,
    title: 'Repeated unlock failures',
    message: (count, log) => `${count} lock-screen unlock failures were recorded in 15 minutes from ${log.ipAddress || 'an unknown IP address'}.`,
  },
  'security.permission_denied': {
    threshold: 5,
    windowMinutes: 15,
    title: 'Repeated permission denials',
    message: (count, log) => `${count} permission denials were recorded in 15 minutes for ${log.actorName || log.actorId || log.ipAddress || 'an unknown actor'}.`,
  },
};

const immediateRiskEvents: Record<string, { title: string; message: (log: AuditLog) => string; cooldownMinutes: number }> = {
  'roles.assigned': {
    title: 'Role assignment changed',
    message: (log) => `${log.actorName || 'An administrator'} changed account role access.`,
    cooldownMinutes: 10,
  },
  'roles.created': {
    title: 'Role created',
    message: (log) => `${log.actorName || 'An administrator'} created a role definition.`,
    cooldownMinutes: 10,
  },
  'roles.updated': {
    title: 'Role updated',
    message: (log) => `${log.actorName || 'An administrator'} updated a role definition.`,
    cooldownMinutes: 10,
  },
  'auth.2fa_disabled': {
    title: 'MFA disabled',
    message: (log) => `MFA was disabled for ${log.actorName || log.actorId || 'an account'}.`,
    cooldownMinutes: 10,
  },
  'auth.password_admin_reset': {
    title: 'Administrator password reset',
    message: (log) => `${log.actorName || 'An administrator'} reset an account password.`,
    cooldownMinutes: 10,
  },
  'users.deleted': {
    title: 'User deleted',
    message: (log) => `${log.actorName || 'An administrator'} deleted a user record.`,
    cooldownMinutes: 10,
  },
  'users.imported': {
    title: 'User import completed',
    message: (log) => `${log.actorName || 'An administrator'} imported user accounts.`,
    cooldownMinutes: 30,
  },
};

function getMonitorKey(log: AuditLog): string {
  return log.actorId || log.ipAddress || log.actorName || 'unknown';
}

function getAlertEntityId(alertKey: string): string {
  return alertKey.slice(0, 100);
}

async function getSecurityRecipients(): Promise<string[]> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query<SecurityRecipientRow[]>(
      `SELECT DISTINCT u.\`id\`
       FROM users u
       LEFT JOIN roles r ON r.\`name\` = u.\`role\`
       WHERE u.\`passwordHash\` IS NOT NULL
         AND u.\`isActive\` = 1
         AND (
           u.\`role\` = 'administrator'
           OR r.\`permissions\` LIKE '%"audit:view"%'
           OR r.\`permissions\` LIKE '%"admin:audit"%'
         )`,
    );

    return rows.map((row) => row.id).filter(Boolean);
  } finally {
    conn.release();
  }
}

async function countRecentMatchingAuditLogs(log: AuditLog, windowMinutes: number): Promise<number> {
  const conn = await pool.getConnection();
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const monitorKey = getMonitorKey(log);
    const [rows] = await conn.query<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM audit_logs
       WHERE \`action\` = ?
         AND \`createdAt\` >= ?
         AND (
           COALESCE(\`actorId\`, '') = ?
           OR COALESCE(\`ipAddress\`, '') = ?
           OR COALESCE(\`actorName\`, '') = ?
         )`,
      [log.action, since, monitorKey, monitorKey, monitorKey],
    );

    return Number(rows[0]?.total || 0);
  } finally {
    conn.release();
  }
}

async function sendSecurityAlert(alert: SecurityAlert) {
  const entityId = getAlertEntityId(alert.key);
  const cooldownSince = new Date(Date.now() - alert.cooldownMinutes * 60 * 1000);
  const hasRecent = await UserNotificationModel.hasRecent('security_alert', 'security_monitor', entityId, cooldownSince);
  if (hasRecent) {
    return;
  }

  const recipients = await getSecurityRecipients();
  await Promise.all(recipients.map(async (userId) => {
    await UserNotificationModel.create({
      userId,
      type: 'security_alert',
      title: alert.title,
      message: alert.message,
      entityType: 'security_monitor',
      entityId,
    });
    broadcastAccountEvent(userId, { type: 'notification-created', entityId });
  }));
}

export async function evaluateSecurityAuditLog(log: AuditLog): Promise<void> {
  const repeatedRule = repeatedEventRules[log.action];
  if (repeatedRule) {
    const count = await countRecentMatchingAuditLogs(log, repeatedRule.windowMinutes);
    if (count >= repeatedRule.threshold) {
      await sendSecurityAlert({
        key: `${log.action}:${getMonitorKey(log)}`,
        title: repeatedRule.title,
        message: repeatedRule.message(count, log),
        cooldownMinutes: repeatedRule.windowMinutes,
      });
    }
  }

  const immediateRule = immediateRiskEvents[log.action];
  if (immediateRule) {
    await sendSecurityAlert({
      key: `${log.action}:${log.entityId || getMonitorKey(log)}`,
      title: immediateRule.title,
      message: immediateRule.message(log),
      cooldownMinutes: immediateRule.cooldownMinutes,
    });
  }
}

