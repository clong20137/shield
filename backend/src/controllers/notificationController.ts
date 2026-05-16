import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { UserNotificationModel } from '../models/UserNotification';

export class NotificationController {
  static async list(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const notifications = await UserNotificationModel.listForUser(account.id);
      res.json(notifications);
    } catch (error) {
      console.error('List notifications error:', error);
      res.status(500).json({ error: 'Failed to load notifications' });
    }
  }

  static async markRead(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      await UserNotificationModel.markRead(req.params.id, account.id);
      res.json({ message: 'Notification marked read' });
    } catch (error) {
      console.error('Mark notification read error:', error);
      res.status(500).json({ error: 'Failed to update notification' });
    }
  }
}
