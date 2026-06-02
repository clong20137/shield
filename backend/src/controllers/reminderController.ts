import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { ReminderModel } from '../models/Reminder';
import { broadcastAccountEvent } from '../services/appEvents';
import { cleanString, isValidIsoDate } from '../utils/validation';

export class ReminderController {
  static async list(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const dueCount = await ReminderModel.createDueNotifications(account.id);
      if (dueCount > 0) {
        broadcastAccountEvent(account.id, { type: 'notification-created' });
        broadcastAccountEvent(account.id, { type: 'reminder-updated' });
      }

      const reminders = await ReminderModel.list(account.id);
      res.json(reminders);
    } catch (error) {
      console.error('List reminders error:', error);
      res.status(500).json({ error: 'Failed to load reminders' });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const title = cleanString(req.body?.title, 90);
      if (!title) {
        return res.status(400).json({ error: 'Reminder title is required' });
      }

      const remindOn = cleanString(req.body?.remindOn, 20);
      if (!remindOn || !isValidIsoDate(remindOn)) {
        return res.status(400).json({ error: 'Reminder date must use YYYY-MM-DD format' });
      }

      const reminder = await ReminderModel.create(account.id, title, remindOn);
      const dueCount = await ReminderModel.createDueNotifications(account.id);
      if (dueCount > 0) {
        broadcastAccountEvent(account.id, { type: 'notification-created', entityId: reminder.id });
      }
      broadcastAccountEvent(account.id, { type: 'reminder-updated', entityId: reminder.id });
      res.status(201).json(reminder);
    } catch (error) {
      console.error('Create reminder error:', error);
      res.status(500).json({ error: 'Failed to create reminder' });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const title = req.body?.title === undefined ? undefined : cleanString(req.body.title, 90);
      if (req.body?.title !== undefined && !title) {
        return res.status(400).json({ error: 'Reminder title is required' });
      }

      const remindOn = req.body?.remindOn === undefined ? undefined : cleanString(req.body.remindOn, 20);
      if (req.body?.remindOn !== undefined && (!remindOn || !isValidIsoDate(remindOn))) {
        return res.status(400).json({ error: 'Reminder date must use YYYY-MM-DD format' });
      }

      const reminder = await ReminderModel.update(req.params.id, account.id, {
        title,
        remindOn,
        completed: typeof req.body?.completed === 'boolean' ? req.body.completed : undefined,
      });

      if (!reminder) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      const dueCount = await ReminderModel.createDueNotifications(account.id);
      if (dueCount > 0) {
        broadcastAccountEvent(account.id, { type: 'notification-created', entityId: reminder.id });
      }
      broadcastAccountEvent(account.id, { type: 'reminder-updated', entityId: reminder.id });
      res.json(reminder);
    } catch (error) {
      console.error('Update reminder error:', error);
      res.status(500).json({ error: 'Failed to update reminder' });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const deleted = await ReminderModel.delete(req.params.id, account.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Reminder not found' });
      }

      broadcastAccountEvent(account.id, { type: 'reminder-updated', entityId: req.params.id });
      res.json({ message: 'Reminder deleted' });
    } catch (error) {
      console.error('Delete reminder error:', error);
      res.status(500).json({ error: 'Failed to delete reminder' });
    }
  }
}
