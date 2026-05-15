import { Request, Response } from 'express';
import { CalendarEntryModel } from '../models/CalendarEntry';
import { AuditLogModel } from '../models/AuditLog';
import { getSessionAccount } from '../middleware/authSession';

function getAuditActor(req: Request) {
  return {
    actorId: typeof req.body?.actorId === 'string' ? req.body.actorId : null,
    actorName: typeof req.body?.actorName === 'string' ? req.body.actorName : null,
  };
}

export class CalendarController {
  static async listEntries(req: Request, res: Response) {
    try {
      const sessionAccount = await getSessionAccount(req);
      const accountId = sessionAccount?.id || (typeof req.query.accountId === 'string' ? req.query.accountId : '');
      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const entries = await CalendarEntryModel.listEntries(accountId);
      res.json(entries);
    } catch (error) {
      console.error('Calendar list error:', error);
      res.status(500).json({ error: 'Failed to load calendar entries' });
    }
  }

  static async createEntry(req: Request, res: Response) {
    try {
      const { accountId: requestedAccountId, category, date, dutyHours, districtWorked, specialStatus, color } = req.body as {
        accountId?: string;
        category?: string;
        date?: string;
        dutyHours?: string | number;
        districtWorked?: string;
        specialStatus?: string;
        color?: string;
      };
      const sessionAccount = await getSessionAccount(req);
      const accountId = sessionAccount?.id || requestedAccountId;
      const hours = Number(dutyHours);

      if (!accountId || !date || Number.isNaN(hours) || hours < 0 || !districtWorked) {
        return res.status(400).json({ error: 'Account, date, duty hours, and district worked are required' });
      }

      const entry = await CalendarEntryModel.createEntry({
        ownerAccountId: accountId,
        category: category || 'General Information',
        date,
        dutyHours: String(hours),
        districtWorked,
        specialStatus: specialStatus || 'None',
        color: color || '#9C865C',
      });

      const actor = getAuditActor(req);
      await AuditLogModel.create({
        ...actor,
        action: 'created',
        entityType: 'calendar_entry',
        entityId: entry.id,
        details: JSON.stringify(entry),
      });

      res.status(201).json(entry);
    } catch (error) {
      console.error('Calendar create error:', error);
      res.status(500).json({ error: 'Failed to create calendar entry' });
    }
  }

  static async updateEntry(req: Request, res: Response) {
    try {
      const { accountId: requestedAccountId, category, date, dutyHours, districtWorked, specialStatus, color } = req.body as {
        accountId?: string;
        category?: string;
        date?: string;
        dutyHours?: string | number;
        districtWorked?: string;
        specialStatus?: string;
        color?: string;
      };
      const sessionAccount = await getSessionAccount(req);
      const accountId = sessionAccount?.id || requestedAccountId;
      const hours = Number(dutyHours);

      if (!accountId || !date || Number.isNaN(hours) || hours < 0 || !districtWorked) {
        return res.status(400).json({ error: 'Account, date, duty hours, and district worked are required' });
      }

      const entry = await CalendarEntryModel.updateEntry(req.params.id, {
        ownerAccountId: accountId,
        category: category || 'General Information',
        date,
        dutyHours: String(hours),
        districtWorked,
        specialStatus: specialStatus || 'None',
        color: color || '#9C865C',
      });

      if (!entry) {
        return res.status(404).json({ error: 'Calendar entry not found' });
      }

      const actor = getAuditActor(req);
      await AuditLogModel.create({
        ...actor,
        action: 'updated',
        entityType: 'calendar_entry',
        entityId: entry.id,
        details: JSON.stringify(entry),
      });

      res.json(entry);
    } catch (error) {
      console.error('Calendar update error:', error);
      res.status(500).json({ error: 'Failed to update calendar entry' });
    }
  }

  static async deleteEntry(req: Request, res: Response) {
    try {
      const sessionAccount = await getSessionAccount(req);
      const accountId = sessionAccount?.id || (typeof req.body?.accountId === 'string' ? req.body.accountId : '');
      if (!accountId) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const deleted = await CalendarEntryModel.deleteEntry(req.params.id, accountId);

      if (!deleted) {
        return res.status(404).json({ error: 'Calendar entry not found' });
      }

      const actor = getAuditActor(req);
      await AuditLogModel.create({
        ...actor,
        action: 'deleted',
        entityType: 'calendar_entry',
        entityId: req.params.id,
        details: null,
      });

      res.json({ message: 'Calendar entry deleted successfully' });
    } catch (error) {
      console.error('Calendar delete error:', error);
      res.status(500).json({ error: 'Failed to delete calendar entry' });
    }
  }
}
