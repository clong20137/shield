import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { QuickNoteModel } from '../models/QuickNote';
import { clearDashboardSummaryCacheForAccount } from '../services/appCache';

export class QuickNoteController {
  static async get(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const note = await QuickNoteModel.get(account.id);
      res.json(note);
    } catch (error) {
      console.error('Load quick note error:', error);
      res.status(500).json({ error: 'Failed to load quick note' });
    }
  }

  static async save(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const content = typeof req.body?.content === 'string' ? req.body.content.slice(0, 10000) : '';
      const note = await QuickNoteModel.save(account.id, content);
      clearDashboardSummaryCacheForAccount(account.id);
      res.json(note);
    } catch (error) {
      console.error('Save quick note error:', error);
      res.status(500).json({ error: 'Failed to save quick note' });
    }
  }
}
