import { Request, Response } from 'express';
import { ErrorLogFilters, ErrorLogModel } from '../models/ErrorLog';
import { getSessionAccount } from '../middleware/authSession';
import { parsePagination } from '../utils/pagination';
import { cleanMultiline, cleanString } from '../utils/validation';

export class ErrorLogController {
  static async createClientLog(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const level = cleanString(req.body?.level, 30) || 'warning';
      const message = cleanString(req.body?.message, 500) || 'Client diagnostic';
      const context = cleanMultiline(req.body?.context, 8000);
      const route = cleanString(req.body?.route, 500) || req.get('referer') || null;

      await ErrorLogModel.create({
        level,
        message,
        stack: context || null,
        route,
        method: 'CLIENT',
        userId: account.id,
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      });

      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Client error log create error:', error);
      res.status(500).json({ error: 'Failed to write client error log' });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const pagination = parsePagination(req.query, { defaultPageSize: 50, maxPageSize: 250 });
      const filters: ErrorLogFilters = {
        q: cleanString(req.query.q, 200),
        level: cleanString(req.query.level, 30),
        from: cleanString(req.query.from, 40),
        to: cleanString(req.query.to, 40),
      };

      const result = await ErrorLogModel.list(filters, pagination.pageSize, pagination.offset);
      res.json({
        ...result,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    } catch (error) {
      console.error('Error log list error:', error);
      res.status(500).json({ error: 'Failed to load error logs' });
    }
  }
}
