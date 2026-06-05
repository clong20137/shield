import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { UrgentAlertAudienceType, UrgentAlertModel, UrgentAlertSeverity } from '../models/UrgentAlert';
import { AuditLogModel } from '../models/AuditLog';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';
import { cleanMultiline, cleanString, isOneOf } from '../utils/validation';

const severities = ['Advisory', 'Important', 'Urgent', 'Critical'] as const;
const audienceTypes = ['everyone', 'district', 'users'] as const;

function requestAuditFields(req: Request) {
  return {
    ipAddress: cleanString(req.ip || req.socket.remoteAddress, 45) || null,
    userAgent: cleanString(req.get('user-agent'), 255) || null,
  };
}

function cleanTargetUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => cleanString(item, 36))
        .filter(Boolean),
    ),
  ).slice(0, 500);
}

function parseExpiresAt(value: unknown): Date | null {
  const rawValue = cleanString(value, 40);
  if (!rawValue) {
    return null;
  }

  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return null;
  }

  return date;
}

export class UrgentAlertController {
  static async listPending(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const alerts = await UrgentAlertModel.listPendingForUser(account.id);
      res.json(alerts);
    } catch (error) {
      console.error('List urgent alerts error:', error);
      res.status(500).json({ error: 'Failed to load urgent alerts' });
    }
  }

  static async listRecent(req: Request, res: Response) {
    try {
      const alerts = await UrgentAlertModel.listRecent();
      res.json(alerts);
    } catch (error) {
      console.error('List recent urgent alerts error:', error);
      res.status(500).json({ error: 'Failed to load alert history' });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const title = cleanString(req.body?.title, 160);
      const message = cleanMultiline(req.body?.message, 2000);
      const severityInput = cleanString(req.body?.severity, 30);
      const audienceInput = cleanString(req.body?.audienceType, 30);
      const severity: UrgentAlertSeverity = isOneOf(severityInput, severities) ? severityInput : 'Urgent';
      const audienceType: UrgentAlertAudienceType = isOneOf(audienceInput, audienceTypes) ? audienceInput : 'everyone';
      const targetDistrict = cleanString(req.body?.targetDistrict, 100);
      const targetUserIds = cleanTargetUserIds(req.body?.targetUserIds);
      const requireAcknowledgement = req.body?.requireAcknowledgement !== false;
      const expiresAt = parseExpiresAt(req.body?.expiresAt);

      if (!title || !message) {
        return res.status(400).json({ error: 'Alert title and message are required' });
      }

      if (audienceType === 'district' && !targetDistrict) {
        return res.status(400).json({ error: 'Choose a district for this alert' });
      }

      if (audienceType === 'users' && targetUserIds.length === 0) {
        return res.status(400).json({ error: 'Choose at least one person for this alert' });
      }

      const alert = await UrgentAlertModel.create({
        title,
        message,
        severity,
        audienceType,
        targetDistrict: audienceType === 'district' ? targetDistrict : null,
        targetUserIds: audienceType === 'users' ? targetUserIds : [],
        requireAcknowledgement,
        expiresAt,
        createdBy: account.id,
        createdByName: account.displayName || account.email,
      });

      if (audienceType === 'everyone') {
        broadcastAppEvent({ type: 'urgent-alert-created', entityId: alert.id });
      } else {
        alert.recipientIds.forEach((recipientId) => {
          broadcastAccountEvent(recipientId, { type: 'urgent-alert-created', entityId: alert.id });
        });
      }

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'alerts.sent',
        entityType: 'urgent_alert',
        entityId: alert.id,
        details: JSON.stringify({
          title,
          severity,
          audienceType,
          audienceLabel: alert.audienceLabel,
          recipientCount: alert.recipientIds.length,
          requireAcknowledgement,
          expiresAt,
        }),
        ...requestAuditFields(req),
      });

      res.status(201).json(alert);
    } catch (error) {
      console.error('Create urgent alert error:', error);
      res.status(500).json({ error: 'Failed to send urgent alert' });
    }
  }

  static async acknowledge(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const acknowledged = await UrgentAlertModel.acknowledge(req.params.id, account.id);
      if (!acknowledged) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      broadcastAccountEvent(account.id, { type: 'urgent-alert-updated', entityId: req.params.id });
      res.json({ message: 'Alert acknowledged' });
    } catch (error) {
      console.error('Acknowledge urgent alert error:', error);
      res.status(500).json({ error: 'Failed to acknowledge urgent alert' });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const removedAlert = await UrgentAlertModel.remove(req.params.id);
      if (!removedAlert) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      broadcastAppEvent({ type: 'urgent-alert-updated', entityId: req.params.id });

      await AuditLogModel.create({
        actorId: account.id,
        actorName: account.displayName || account.email,
        action: 'alerts.removed',
        entityType: 'urgent_alert',
        entityId: req.params.id,
        details: JSON.stringify({
          title: removedAlert.title,
          severity: removedAlert.severity,
          audienceType: removedAlert.audienceType,
          audienceLabel: removedAlert.audienceLabel,
        }),
        ...requestAuditFields(req),
      });

      res.json({ message: 'Urgent alert removed' });
    } catch (error) {
      console.error('Remove urgent alert error:', error);
      res.status(500).json({ error: 'Failed to remove urgent alert' });
    }
  }
}
