import { Request, Response } from 'express';
import { addAppEventClient } from '../services/appEvents';
import { getSessionAccount } from '../middleware/authSession';

export class EventController {
  static async stream(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
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
