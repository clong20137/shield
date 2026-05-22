import { Request, Response } from 'express';
import { ErrorLogFilters, ErrorLogModel } from '../models/ErrorLog';
import { parsePagination } from '../utils/pagination';
import { cleanString } from '../utils/validation';

export class ErrorLogController {
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
