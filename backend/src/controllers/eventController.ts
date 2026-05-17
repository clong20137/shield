import { Request, Response } from 'express';
import { AuthSessionModel } from '../models/AuthSession';
import { addAppEventClient } from '../services/appEvents';
import { isWellFormedSessionToken } from '../middleware/authSession';

export class EventController {
  static async stream(req: Request, res: Response) {
    try {
      const token = typeof req.query.token === 'string' && isWellFormedSessionToken(req.query.token) ? req.query.token : '';
      const account = token ? await AuthSessionModel.getAccountForToken(token) : null;
      if (!account) {
        return res.status(401).json({ error: 'Session expired or invalid' });
      }

      addAppEventClient(account.id, res);
    } catch (error) {
      console.error('App events error:', error);
      res.status(500).json({ error: 'Failed to start app updates' });
    }
  }
}
