import { Request } from 'express';
import { AuditLogModel } from '../models/AuditLog';
import { cleanString } from './validation';

type AuditActor = {
  id?: string | null;
  displayName?: string | null;
  email?: string | null;
};

type SecurityAuditEvent = {
  req: Request;
  actor?: AuditActor | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
};

export function getRequestAuditFields(req: Request) {
  return {
    ipAddress: cleanString(req.ip || req.socket.remoteAddress, 45) || null,
    userAgent: cleanString(req.get('user-agent'), 255) || null,
  };
}

function safeAuditDetails(details: Record<string, unknown> = {}) {
  return JSON.stringify({
    method: details.method,
    path: details.path,
    permission: details.permission,
    requiredPermissions: details.requiredPermissions,
    reason: details.reason,
    targetId: details.targetId,
    entity: details.entity,
  });
}

export async function auditSecurityEvent({
  req,
  actor,
  action,
  entityType,
  entityId = null,
  details = {},
}: SecurityAuditEvent): Promise<void> {
  await AuditLogModel.create({
    actorId: actor?.id || null,
    actorName: actor?.displayName || actor?.email || null,
    action,
    entityType,
    entityId,
    details: safeAuditDetails({
      method: req.method,
      path: req.originalUrl || req.path,
      ...details,
    }),
    ...getRequestAuditFields(req),
  });
}

