import { Request, Response } from 'express';
import { CalendarEntryModel } from '../models/CalendarEntry';
import { CalendarShortcutModel } from '../models/CalendarShortcut';
import { AuditLogModel } from '../models/AuditLog';
import { getSessionAccount } from '../middleware/authSession';
import { broadcastAppEvent } from '../services/appEvents';
import { cleanRecord, cleanString, isOneOf, isValidHexColor, isValidIsoDate } from '../utils/validation';
import { parsePagination } from '../utils/pagination';

const calendarCategories = ['General Information', 'Trooper Daily'] as const;
const districtOptions = [
  'Area 1',
  'Toll Road',
  'Lowell',
  'Lafayette',
  'Peru',
  'Area 2',
  'Fort Wayne',
  'Bremen',
  'Area 3',
  'Bloomington',
  'Jasper',
  'Evansville',
  'Area 4',
  'Versailles',
  'Sellersburg',
  'Area 5',
  'Pendleton',
  'Indianapolis',
  'Putnamville',
  'Headquarters',
  'North Zone',
  'South Zone',
  'Central Zone',
  'Laboratory',
  'Polygraph',
  'CSI Section',
  'Digital Forensics Unit',
] as const;
const specialStatusOptions = ['None', 'TDY', 'Military Leave', 'Disability', 'Limited Duty'] as const;
const submissionStatusOptions = ['Draft', 'Submitted'] as const;

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

function validateCalendarEntryPayload(body: Record<string, unknown>) {
  const category = cleanString(body.category, 80) || 'General Information';
  const date = cleanString(body.date, 20);
  const districtWorked = cleanString(body.districtWorked, 100);
  const specialStatus = cleanString(body.specialStatus, 80) || 'None';
  const color = cleanString(body.color, 20) || '#9C865C';
  const submissionStatus = cleanString(body.submissionStatus, 30) || 'Draft';
  const hours = Number(body.dutyHours);

  if (!isOneOf(category, calendarCategories)) {
    return { error: 'Choose a valid calendar entry type' };
  }

  if (!date || !isValidIsoDate(date)) {
    return { error: 'Calendar date must use YYYY-MM-DD format' };
  }

  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    return { error: 'Duty hours must be between 0 and 24' };
  }

  if (!districtWorked || !isOneOf(districtWorked, districtOptions)) {
    return { error: 'Choose a valid district worked' };
  }

  if (!isOneOf(specialStatus, specialStatusOptions)) {
    return { error: 'Choose a valid special status' };
  }

  if (!isValidHexColor(color)) {
    return { error: 'Choose a valid calendar color' };
  }

  if (!isOneOf(submissionStatus, submissionStatusOptions)) {
    return { error: 'Choose save draft or submit for this Trooper Daily' };
  }

  return {
    value: {
      category,
      date,
      dutyHours: String(hours),
      districtWorked,
      specialStatus,
      color,
      submissionStatus,
      details: cleanRecord(body.details, 160, 1000),
    },
  };
}

function validateCalendarShortcutPayload(body: Record<string, unknown>) {
  const name = cleanString(body.name, 120);
  const districtWorked = cleanString(body.districtWorked, 100);
  const specialStatus = cleanString(body.specialStatus, 80) || 'None';
  const color = cleanString(body.color, 20) || '#9C865C';
  const hours = Number(body.dutyHours || 0);

  if (!name) {
    return { error: 'Shortcut name is required' };
  }

  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    return { error: 'Duty hours must be between 0 and 24' };
  }

  if (!districtWorked || !isOneOf(districtWorked, districtOptions)) {
    return { error: 'Choose a valid district worked' };
  }

  if (!isOneOf(specialStatus, specialStatusOptions)) {
    return { error: 'Choose a valid special status' };
  }

  if (!isValidHexColor(color)) {
    return { error: 'Choose a valid calendar color' };
  }

  return {
    value: {
      name,
      dutyHours: String(hours),
      districtWorked,
      specialStatus,
      color,
      details: cleanRecord(body.details, 160, 1000),
    },
  };
}

export class CalendarController {
  static async listShortcuts(req: Request, res: Response) {
    try {
      const account = await getCalendarAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in to view shortcuts' });
      }

      const shortcuts = await CalendarShortcutModel.listShortcuts(account.id);
      res.json(shortcuts);
    } catch (error) {
      console.error('Calendar shortcut list error:', error);
      res.status(500).json({ error: 'Failed to load calendar shortcuts' });
    }
  }

  static async createShortcut(req: Request, res: Response) {
    try {
      const account = await getCalendarAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in to save shortcuts' });
      }

      const validation = validateCalendarShortcutPayload(req.body);
      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid shortcut' });
      }

      const shortcut = await CalendarShortcutModel.createShortcut({
        ownerAccountId: account.id,
        ...validation.value,
      });
      res.status(201).json(shortcut);
    } catch (error) {
      console.error('Calendar shortcut create error:', error);
      res.status(500).json({ error: 'Failed to save calendar shortcut' });
    }
  }

  static async updateShortcut(req: Request, res: Response) {
    try {
      const account = await getCalendarAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in to update shortcuts' });
      }

      const validation = validateCalendarShortcutPayload(req.body);
      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid shortcut' });
      }

      const shortcut = await CalendarShortcutModel.updateShortcut(req.params.id, {
        ownerAccountId: account.id,
        ...validation.value,
      });

      if (!shortcut) {
        return res.status(404).json({ error: 'Shortcut not found' });
      }

      res.json(shortcut);
    } catch (error) {
      console.error('Calendar shortcut update error:', error);
      res.status(500).json({ error: 'Failed to update calendar shortcut' });
    }
  }

  static async deleteShortcut(req: Request, res: Response) {
    try {
      const account = await getCalendarAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in to delete shortcuts' });
      }

      const deleted = await CalendarShortcutModel.deleteShortcut(req.params.id, account.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Shortcut not found' });
      }

      res.json({ message: 'Shortcut deleted successfully' });
    } catch (error) {
      console.error('Calendar shortcut delete error:', error);
      res.status(500).json({ error: 'Failed to delete calendar shortcut' });
    }
  }

  static async listEntries(req: Request, res: Response) {
    try {
      const requestedAccountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
      const account = await getCalendarAccount(req, requestedAccountId);
      if (!account) {
        return res.status(401).json({ error: 'Sign in to view your calendar' });
      }

      const pagination = parsePagination(req.query, { defaultPageSize: 1000, maxPageSize: 2000 });
      const entries = await CalendarEntryModel.listEntries(account.id, pagination.pageSize, pagination.offset);
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
      const requestedAccountId = cleanString(req.body?.accountId, 36) || undefined;
      const account = await getCalendarAccount(req, requestedAccountId);
      const accountId = account?.id;

      if (!accountId) {
        return res.status(401).json({ error: 'Sign in to update your calendar' });
      }

      const validation = validateCalendarEntryPayload(req.body);
      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid calendar entry' });
      }

      const entry = await CalendarEntryModel.createEntry({
        ownerAccountId: accountId,
        ...validation.value,
      });

      const actor = getAuditActor(account);
      await AuditLogModel.create({
        ...actor,
        action: 'created',
        entityType: 'calendar_entry',
        entityId: entry.id,
        details: JSON.stringify(entry),
      });

      broadcastAppEvent({ type: 'calendar-updated', entityId: entry.id });
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
      const requestedAccountId = cleanString(req.body?.accountId, 36) || undefined;
      const account = await getCalendarAccount(req, requestedAccountId);
      const accountId = account?.id;

      if (!accountId) {
        return res.status(401).json({ error: 'Sign in to update your calendar' });
      }

      const validation = validateCalendarEntryPayload(req.body);
      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid calendar entry' });
      }

      const entry = await CalendarEntryModel.updateEntry(req.params.id, {
        ownerAccountId: accountId,
        ...validation.value,
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

      broadcastAppEvent({ type: 'calendar-updated', entityId: entry.id });
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

      broadcastAppEvent({ type: 'calendar-updated', entityId: req.params.id });
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
