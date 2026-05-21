import { Request, Response } from 'express';
import { AuditLogModel } from '../models/AuditLog';
import { parsePagination } from '../utils/pagination';
import { cleanString } from '../utils/validation';

function cleanDateFilter(value: unknown, endOfDay = false): string | undefined {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  const dateValue = endOfDay && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T23:59:59` : value;
  const timestamp = Date.parse(dateValue);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ');
}

export class AuditController {
  static async listLogs(req: Request, res: Response) {
    try {
      const { page, pageSize, offset } = parsePagination(req.query, { defaultPageSize: 50, maxPageSize: 500 });
      const result = await AuditLogModel.list({
        q: cleanString(req.query.q, 200),
        actorId: cleanString(req.query.actorId, 36),
        action: cleanString(req.query.action, 100),
        entityType: cleanString(req.query.entityType, 100),
        from: cleanDateFilter(req.query.from),
        to: cleanDateFilter(req.query.to, true),
      }, pageSize, offset);

      res.json({
        data: result.data,
        total: result.total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
        actions: result.actions,
        entityTypes: result.entityTypes,
      });
    } catch (error) {
      console.error('Audit log list error:', error);
      res.status(500).json({ error: 'Failed to load audit logs' });
    }
  }
}
