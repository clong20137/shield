import { Request, Response } from 'express';
import { AuditLogModel } from '../models/AuditLog';
import { getSessionAccount } from '../middleware/authSession';

function requestAuditFields(req: Request) {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
  };
}

export class SystemController {
  static async restartApi(req: Request, res: Response) {
    try {
      const actor = await getSessionAccount(req);
      await AuditLogModel.create({
        actorId: actor?.id || null,
        actorName: actor?.displayName || actor?.email || null,
        action: 'system.api_restart_requested',
        entityType: 'system',
        entityId: 'shield-api',
        details: JSON.stringify({
          pid: process.pid,
          manager: process.env.pm_id !== undefined ? 'pm2' : 'node',
        }),
        ...requestAuditFields(req),
      });

      res.json({
        message: process.env.pm_id !== undefined
          ? 'API restart requested. PM2 will bring Shield API back online.'
          : 'API shutdown requested. A service manager must be running to bring it back online.',
        managedByPm2: process.env.pm_id !== undefined,
      });

      setTimeout(() => {
        process.exit(0);
      }, 1000);
    } catch (error) {
      console.error('Restart API error:', error);
      res.status(500).json({ error: 'Failed to request API restart' });
    }
  }
}
