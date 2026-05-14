import { Request, Response } from 'express';
import { AuditLogModel } from '../models/AuditLog';

export class AuditController {
  static async listLogs(req: Request, res: Response) {
    try {
      const limit = Number(req.query.limit) || 100;
      const logs = await AuditLogModel.list(Math.min(Math.max(limit, 1), 500));
      res.json(logs);
    } catch (error) {
      console.error('Audit log list error:', error);
      res.status(500).json({ error: 'Failed to load audit logs' });
    }
  }
}
