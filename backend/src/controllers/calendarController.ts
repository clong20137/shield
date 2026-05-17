import { Request, Response } from 'express';
import { CalendarEntryModel } from '../models/CalendarEntry';
import { AuditLogModel } from '../models/AuditLog';
import { getSessionAccount } from '../middleware/authSession';
import { broadcastAccountEvent } from '../services/appEvents';

function getAuditActor(account: { id: string; displayName: string; email: string } | null) {
  return {
    actorId: account?.id || null,
    actorName: account?.displayName || account?.email || null,
  };
}

async function getCalendarAccount(req: Request, requestedAccountId?: string) {
  const sessionAccount = await getSessionAccount(req);

  if (!sessionAccount) {
    return null;
  }

  if (requestedAccountId && requestedAccountId !== sessionAccount.id) {
    throw Object.assign(new Error('Calendar account mismatch'), { statusCode: 403 });
  }

  return sessionAccount;
}

export class CalendarController {
  static async listEntries(req: Request, res: Response) {
    try {
      const requestedAccountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
      const account = await getCalendarAccount(req, requestedAccountId);
      if (!account) {
        return res.status(401).json({ error: 'Sign in to view your calendar' });
      }

      const entries = await CalendarEntryModel.listEntries(account.id);
      res.json(entries);
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 403) {
        return res.status(403).json({ error: 'Calendar account mismatch' });
      }

      console.error('Calendar list error:', error);
      res.status(500).json({ error: 'Failed to load calendar entries' });
    }
  }

  static async createEntry(req: Request, res: Response) {
    try {
      const { accountId: requestedAccountId, category, date, dutyHours, districtWorked, specialStatus, color, details } = req.body as {
        accountId?: string;
        category?: string;
        date?: string;
        dutyHours?: string | number;
        districtWorked?: string;
        specialStatus?: string;
        color?: string;
        details?: Record<string, string>;
      };
      const account = await getCalendarAccount(req, requestedAccountId);
      const accountId = account?.id;
      const hours = Number(dutyHours);

      if (!accountId || !date || Number.isNaN(hours) || hours < 0 || !districtWorked) {
        return res.status(accountId ? 400 : 401).json({ error: accountId ? 'Date, duty hours, and district worked are required' : 'Sign in to update your calendar' });
      }

      const entry = await CalendarEntryModel.createEntry({
        ownerAccountId: accountId,
        category: category || 'General Information',
        date,
        dutyHours: String(hours),
        districtWorked,
        specialStatus: specialStatus || 'None',
        color: color || '#9C865C',
        details: details && typeof details === 'object' ? details : {},
      });

      const actor = getAuditActor(account);
      await AuditLogModel.create({
        ...actor,
        action: 'created',
        entityType: 'calendar_entry',
        entityId: entry.id,
        details: JSON.stringify(entry),
      });

      broadcastAccountEvent(accountId, { type: 'calendar-updated', entityId: entry.id });
      res.status(201).json(entry);
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 403) {
        return res.status(403).json({ error: 'Calendar account mismatch' });
      }

      console.error('Calendar create error:', error);
      res.status(500).json({ error: 'Failed to create calendar entry' });
    }
  }

  static async updateEntry(req: Request, res: Response) {
    try {
      const { accountId: requestedAccountId, category, date, dutyHours, districtWorked, specialStatus, color, details } = req.body as {
        accountId?: string;
        category?: string;
        date?: string;
        dutyHours?: string | number;
        districtWorked?: string;
        specialStatus?: string;
        color?: string;
        details?: Record<string, string>;
      };
      const account = await getCalendarAccount(req, requestedAccountId);
      const accountId = account?.id;
      const hours = Number(dutyHours);

      if (!accountId || !date || Number.isNaN(hours) || hours < 0 || !districtWorked) {
        return res.status(accountId ? 400 : 401).json({ error: accountId ? 'Date, duty hours, and district worked are required' : 'Sign in to update your calendar' });
      }

      const entry = await CalendarEntryModel.updateEntry(req.params.id, {
        ownerAccountId: accountId,
        category: category || 'General Information',
        date,
        dutyHours: String(hours),
        districtWorked,
        specialStatus: specialStatus || 'None',
        color: color || '#9C865C',
        details: details && typeof details === 'object' ? details : {},
      });

      if (!entry) {
        return res.status(404).json({ error: 'Calendar entry not found' });
      }

      const actor = getAuditActor(account);
      await AuditLogModel.create({
        ...actor,
        action: 'updated',
        entityType: 'calendar_entry',
        entityId: entry.id,
        details: JSON.stringify(entry),
      });

      broadcastAccountEvent(accountId, { type: 'calendar-updated', entityId: entry.id });
      res.json(entry);
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 403) {
        return res.status(403).json({ error: 'Calendar account mismatch' });
      }

      console.error('Calendar update error:', error);
      res.status(500).json({ error: 'Failed to update calendar entry' });
    }
  }

  static async deleteEntry(req: Request, res: Response) {
    try {
      const requestedAccountId = typeof req.body?.accountId === 'string' ? req.body.accountId : undefined;
      const account = await getCalendarAccount(req, requestedAccountId);
      const accountId = account?.id;
      if (!accountId) {
        return res.status(401).json({ error: 'Sign in to update your calendar' });
      }

      const deleted = await CalendarEntryModel.deleteEntry(req.params.id, accountId);

      if (!deleted) {
        return res.status(404).json({ error: 'Calendar entry not found' });
      }

      const actor = getAuditActor(account);
      await AuditLogModel.create({
        ...actor,
        action: 'deleted',
        entityType: 'calendar_entry',
        entityId: req.params.id,
        details: null,
      });

      broadcastAccountEvent(accountId, { type: 'calendar-updated', entityId: req.params.id });
      res.json({ message: 'Calendar entry deleted successfully' });
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 403) {
        return res.status(403).json({ error: 'Calendar account mismatch' });
      }

      console.error('Calendar delete error:', error);
      res.status(500).json({ error: 'Failed to delete calendar entry' });
    }
  }
}
