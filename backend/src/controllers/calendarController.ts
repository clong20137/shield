import { Request, Response } from 'express';
import { CalendarEntryModel } from '../models/CalendarEntry';
import { CalendarShortcutModel } from '../models/CalendarShortcut';
import { ReminderModel } from '../models/Reminder';
import { SystemSettingModel } from '../models/SystemSetting';
import { AuditLogModel } from '../models/AuditLog';
import { AuthAccountModel } from '../models/AuthAccount';
import { UserModel } from '../models/User';
import { UserNotificationModel } from '../models/UserNotification';
import { getSessionAccount } from '../middleware/authSession';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';
import { cleanMultiline, cleanRecord, cleanString, isOneOf, isValidHexColor, isValidIsoDate } from '../utils/validation';
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
const specialStatusOptions = ['None', 'TDY', 'Military Leave', 'Disability', 'Limited Duty', 'Training', 'Vacation Day', 'Sick Day', 'Day Off'] as const;
const submissionStatusOptions = ['Draft', 'Submitted'] as const;
const tCodeOptionsSettingKey = 'trooperDaily.tCodeOptions';
const defaultTCodeOptions = ['T-1', 'T-2', 'T-3'];
const fleetBookingReminderSourceType = 'fleet-booking';
const fleetBookingReminderKind = 'booking-start';
const fleetBookingStatuses = ['requested', 'approved', 'denied', 'canceled'] as const;
type FleetBookingStatus = typeof fleetBookingStatuses[number];

const fleetBookingStatusLabels: Record<FleetBookingStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  denied: 'Denied',
  canceled: 'Canceled',
};

function isValidLocalDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) {
    return false;
  }

  const [datePart, timePart] = value.split('T');
  if (!isValidIsoDate(datePart)) {
    return false;
  }

  const [hour, minute] = timePart.split(':').map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function formatLocalDateTime(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function subtractMinutesFromLocalDateTime(value: string, minutes: number): string {
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  date.setMinutes(date.getMinutes() - minutes);
  return formatLocalDateTime(date);
}

function normalizeFleetBookingStatus(value: string): FleetBookingStatus {
  const normalizedValue = value.trim().toLowerCase().replace(/\s+/gu, '-');
  if (['approved', 'approve', 'accepted', 'confirmed', 'scheduled', 'in-progress', 'waiting-on-parts', 'ready-for-pickup', 'complete'].includes(normalizedValue)) {
    return 'approved';
  }

  if (['denied', 'deny', 'declined', 'rejected', 'returned'].includes(normalizedValue)) {
    return 'denied';
  }

  if (['canceled', 'cancelled', 'cancel'].includes(normalizedValue)) {
    return 'canceled';
  }

  return 'requested';
}

function normalizeTCodeOptions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value
    .map((option) => cleanString(option, 80))
    .filter((option): option is string => Boolean(option))))
    .slice(0, 100);
}

async function getTCodeOptions(): Promise<string[]> {
  const storedValue = await SystemSettingModel.getString(tCodeOptionsSettingKey, JSON.stringify(defaultTCodeOptions));
  try {
    const options = normalizeTCodeOptions(JSON.parse(storedValue));
    return options.length > 0 ? options : defaultTCodeOptions;
  } catch {
    return defaultTCodeOptions;
  }
}

function getAuditActor(account: { id: string; displayName: string; email: string } | null) {
  return {
    actorId: account?.id || null,
    actorName: account?.displayName || account?.email || null,
  };
}

function getSupervisorLookupValues(account: { displayName?: string; firstName?: string; lastName?: string; email?: string }) {
  return Array.from(new Set([
    account.displayName,
    `${account.firstName || ''} ${account.lastName || ''}`.trim(),
    account.email,
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))));
}

async function canViewHiddenUsers(account: { id: string; role: string }) {
  if (account.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('users:view-hidden');
}

async function canViewProfileCalendar(account: { id: string; role: string; displayName?: string; firstName?: string; lastName?: string; email?: string }, targetUser: { id: string; supervisor?: string; calendarHidden?: boolean }) {
  if (account.id === targetUser.id || account.role === 'administrator') {
    return true;
  }

  if (targetUser.calendarHidden) {
    return false;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  if (permissions.includes('calendar:view-profiles')) {
    return true;
  }

  const supervisor = targetUser.supervisor?.trim().toLowerCase();
  return Boolean(supervisor && getSupervisorLookupValues(account).includes(supervisor));
}

async function getFleetNotificationRecipients(ownerAccountId: string) {
  const accounts = await AuthAccountModel.listAccounts(true);
  const recipients = new Map<string, { id: string; role: string }>();
  const ownerAccount = accounts.find((account) => account.id === ownerAccountId);
  if (ownerAccount) {
    recipients.set(ownerAccount.id, ownerAccount);
  }

  await Promise.all(accounts.map(async (account) => {
    if (account.role === 'administrator') {
      recipients.set(account.id, account);
      return;
    }

    const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
    if (permissions.includes('fleet:bookings:manage')) {
      recipients.set(account.id, account);
    }
  }));

  return Array.from(recipients.values());
}

async function canSyncFleetBooking(account: { id: string; role: string }, ownerAccountId: string) {
  if (account.id === ownerAccountId || account.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('fleet:bookings:manage');
}

async function createFleetBookingNotifications(input: {
  ownerAccountId: string;
  bookingId: string;
  title: string;
  status: FleetBookingStatus;
  previousStatus?: FleetBookingStatus | null;
  startAt: string;
  location: string;
}) {
  if (input.previousStatus === input.status) {
    return;
  }

  const statusLabel = fleetBookingStatusLabels[input.status];
  const previousStatusLabel = input.previousStatus ? fleetBookingStatusLabels[input.previousStatus] : null;
  const message = previousStatusLabel
    ? `Fleet booking ${input.title} changed from ${previousStatusLabel} to ${statusLabel}.`
    : `Fleet booking ${input.title} is ${statusLabel}.`;
  const recipients = await getFleetNotificationRecipients(input.ownerAccountId);

  await Promise.all(recipients.map(async (recipient) => {
    await UserNotificationModel.create({
      userId: recipient.id,
      type: 'fleet',
      title: 'Fleet Booking Updated',
      message: `${message} ${input.location ? `Location: ${input.location}. ` : ''}Start: ${input.startAt}.`,
      entityType: 'fleet_booking',
      entityId: input.bookingId,
    });
    broadcastAccountEvent(recipient.id, { type: 'notification-created', entityId: input.bookingId });
    broadcastAccountEvent(recipient.id, { type: 'fleet-booking-updated', entityId: input.bookingId });
  }));
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
      details: cleanRecord(body.details, 160, 5000),
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
      details: cleanRecord(body.details, 160, 5000),
    },
  };
}

function validateFleetBookingPayload(body: Record<string, unknown>, bookingIdParam?: string) {
  const bookingId = cleanString(bookingIdParam || body.bookingId, 80);
  const ownerAccountId = cleanString(body.ownerAccountId || body.accountId, 36);
  const title = cleanString(body.title, 120);
  const serviceType = cleanString(body.serviceType, 120);
  const startAt = cleanString(body.startAt, 20);
  const endAt = cleanString(body.endAt, 20);
  const location = cleanString(body.location, 100) || 'Headquarters';
  const vehicleLabel = cleanString(body.vehicleLabel || body.vehicle, 120);
  const rawStatus = cleanString(body.status, 50) || 'Requested';
  const status = normalizeFleetBookingStatus(rawStatus);
  const statusLabel = fleetBookingStatusLabels[status];
  const notes = cleanMultiline(body.notes, 1000);
  const reminderLeadMinutes = Number(body.reminderLeadMinutes ?? 30);

  if (!bookingId) {
    return { error: 'Fleet booking ID is required' };
  }

  if (!ownerAccountId) {
    return { error: 'Fleet booking owner account is required' };
  }

  if (!title) {
    return { error: 'Fleet booking title is required' };
  }

  if (!startAt || !isValidLocalDateTime(startAt)) {
    return { error: 'Fleet booking start time must use YYYY-MM-DDTHH:mm format' };
  }

  if (!endAt || !isValidLocalDateTime(endAt)) {
    return { error: 'Fleet booking end time must use YYYY-MM-DDTHH:mm format' };
  }

  if (!Number.isFinite(reminderLeadMinutes) || reminderLeadMinutes < 0 || reminderLeadMinutes > 1440) {
    return { error: 'Reminder lead time must be between 0 and 1440 minutes' };
  }

  return {
    value: {
      bookingId,
      ownerAccountId,
      title,
      serviceType,
      startAt,
      endAt,
      location,
      vehicleLabel,
      status,
      statusLabel,
      notes,
      reminderLeadMinutes,
    },
  };
}

export class CalendarController {
  static async listTCodeOptions(req: Request, res: Response) {
    try {
      const options = await getTCodeOptions();
      res.json({ options });
    } catch (error) {
      console.error('T-Code options list error:', error);
      res.status(500).json({ error: 'Failed to load T-Code options' });
    }
  }

  static async updateTCodeOptions(req: Request, res: Response) {
    try {
      const options = normalizeTCodeOptions((req.body as { options?: unknown }).options);
      await SystemSettingModel.setString(tCodeOptionsSettingKey, JSON.stringify(options));
      res.json({ options });
    } catch (error) {
      console.error('T-Code options update error:', error);
      res.status(500).json({ error: 'Failed to save T-Code options' });
    }
  }

  static async listProfileEntries(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in to view profile calendar' });
      }

      const targetUser = await UserModel.getUserById(req.params.accountId);
      if (!targetUser || (targetUser.isHidden && targetUser.id !== account.id && !(await canViewHiddenUsers(account)))) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!(await canViewProfileCalendar(account, targetUser))) {
        return res.status(403).json({ error: 'Profile calendar permission required' });
      }

      const pagination = parsePagination(req.query, { defaultPageSize: 90, maxPageSize: 365 });
      const entries = await CalendarEntryModel.listEntries(targetUser.id, pagination.pageSize, pagination.offset);
      res.json(entries);
    } catch (error) {
      console.error('Profile calendar list error:', error);
      res.status(500).json({ error: 'Failed to load profile calendar' });
    }
  }

  static async syncFleetBooking(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in to sync Fleet bookings' });
      }

      const validation = validateFleetBookingPayload(req.body, req.params.bookingId);
      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid Fleet booking' });
      }

      const targetUser = await UserModel.getUserById(validation.value.ownerAccountId);
      if (!targetUser) {
        return res.status(404).json({ error: 'Fleet booking owner not found' });
      }

      if (!(await canSyncFleetBooking(account, validation.value.ownerAccountId))) {
        return res.status(403).json({ error: 'Fleet booking sync permission required' });
      }

      const existingEntry = await CalendarEntryModel.findFleetBookingEntry(validation.value.ownerAccountId, validation.value.bookingId);
      const previousStatus = existingEntry?.details?.status
        ? normalizeFleetBookingStatus(existingEntry.details.status)
        : null;

      if (validation.value.status === 'canceled' || validation.value.status === 'denied') {
        const deletedCalendarEntries = await CalendarEntryModel.deleteFleetBookingEntry(validation.value.ownerAccountId, validation.value.bookingId);
        const deletedReminders = await ReminderModel.deleteLinked(validation.value.ownerAccountId, fleetBookingReminderSourceType, validation.value.bookingId);
        await createFleetBookingNotifications({
          ownerAccountId: validation.value.ownerAccountId,
          bookingId: validation.value.bookingId,
          title: validation.value.title,
          status: validation.value.status,
          previousStatus,
          startAt: validation.value.startAt,
          location: validation.value.location,
        });
        broadcastAppEvent({ type: 'calendar-updated', entityId: validation.value.bookingId });
        broadcastAppEvent({ type: 'fleet-booking-updated', entityId: validation.value.bookingId });
        broadcastAccountEvent(validation.value.ownerAccountId, { type: 'reminder-updated', entityId: validation.value.bookingId });
        return res.json({ deletedCalendarEntries, deletedReminders });
      }

      const entry = await CalendarEntryModel.upsertFleetBookingEntry(validation.value);
      const reminder = validation.value.status === 'approved'
        ? await ReminderModel.upsertLinked(
          validation.value.ownerAccountId,
          `Fleet booking: ${validation.value.title}`,
          subtractMinutesFromLocalDateTime(validation.value.startAt, validation.value.reminderLeadMinutes).slice(0, 10),
          subtractMinutesFromLocalDateTime(validation.value.startAt, validation.value.reminderLeadMinutes),
          [
            validation.value.vehicleLabel ? `Vehicle: ${validation.value.vehicleLabel}` : '',
            validation.value.location ? `Location: ${validation.value.location}` : '',
            validation.value.notes,
          ].filter(Boolean).join('\n'),
          fleetBookingReminderSourceType,
          validation.value.bookingId,
          fleetBookingReminderKind,
        )
        : null;

      if (validation.value.status !== 'approved') {
        await ReminderModel.deleteLinked(validation.value.ownerAccountId, fleetBookingReminderSourceType, validation.value.bookingId);
      }

      await AuditLogModel.create({
        ...getAuditActor(account),
        action: 'synced',
        entityType: 'fleet_booking',
        entityId: validation.value.bookingId,
        details: JSON.stringify({ calendarEntryId: entry.id, reminderId: reminder?.id || null, status: validation.value.status }),
      });

      await createFleetBookingNotifications({
        ownerAccountId: validation.value.ownerAccountId,
        bookingId: validation.value.bookingId,
        title: validation.value.title,
        status: validation.value.status,
        previousStatus,
        startAt: validation.value.startAt,
        location: validation.value.location,
      });

      broadcastAppEvent({ type: 'calendar-updated', entityId: entry.id });
      broadcastAppEvent({ type: 'fleet-booking-updated', entityId: validation.value.bookingId });
      broadcastAccountEvent(validation.value.ownerAccountId, { type: 'reminder-updated', entityId: reminder?.id || validation.value.bookingId });
      res.json({ calendarEntry: entry, reminder });
    } catch (error) {
      console.error('Fleet booking calendar sync error:', error);
      res.status(500).json({ error: 'Failed to sync Fleet booking' });
    }
  }

  static async deleteFleetBooking(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in to sync Fleet bookings' });
      }

      const ownerAccountId = cleanString(req.body?.ownerAccountId || req.body?.accountId || req.query.ownerAccountId || req.query.accountId, 36);
      const bookingId = cleanString(req.params.bookingId || req.body?.bookingId, 80);
      if (!bookingId || !ownerAccountId) {
        return res.status(400).json({ error: 'Fleet booking ID and owner account are required' });
      }

      if (!(await canSyncFleetBooking(account, ownerAccountId))) {
        return res.status(403).json({ error: 'Fleet booking sync permission required' });
      }

      const existingEntry = await CalendarEntryModel.findFleetBookingEntry(ownerAccountId, bookingId);
      const deletedCalendarEntries = await CalendarEntryModel.deleteFleetBookingEntry(ownerAccountId, bookingId);
      const deletedReminders = await ReminderModel.deleteLinked(ownerAccountId, fleetBookingReminderSourceType, bookingId);
      await createFleetBookingNotifications({
        ownerAccountId,
        bookingId,
        title: existingEntry?.details?.title || 'Fleet booking',
        status: 'canceled',
        previousStatus: existingEntry?.details?.status ? normalizeFleetBookingStatus(existingEntry.details.status) : null,
        startAt: existingEntry?.details?.startAt || '',
        location: existingEntry?.details?.location || '',
      });

      await AuditLogModel.create({
        ...getAuditActor(account),
        action: 'deleted',
        entityType: 'fleet_booking',
        entityId: bookingId,
        details: JSON.stringify({ deletedCalendarEntries, deletedReminders }),
      });

      broadcastAppEvent({ type: 'calendar-updated', entityId: bookingId });
      broadcastAppEvent({ type: 'fleet-booking-updated', entityId: bookingId });
      broadcastAccountEvent(ownerAccountId, { type: 'reminder-updated', entityId: bookingId });
      res.json({ deletedCalendarEntries, deletedReminders });
    } catch (error) {
      console.error('Fleet booking calendar delete error:', error);
      res.status(500).json({ error: 'Failed to delete Fleet booking sync' });
    }
  }

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

  static async autosaveDraft(req: Request, res: Response) {
    try {
      const requestedAccountId = cleanString(req.body?.accountId, 36) || undefined;
      const requestedEntryId = cleanString(req.body?.entryId, 36) || undefined;
      const account = await getCalendarAccount(req, requestedAccountId);
      const accountId = account?.id;

      if (!accountId) {
        return res.status(401).json({ error: 'Sign in to autosave your calendar' });
      }

      const validation = validateCalendarEntryPayload({
        ...req.body,
        category: 'Trooper Daily',
        submissionStatus: 'Draft',
      });
      if (validation.error || !validation.value) {
        return res.status(400).json({ error: validation.error || 'Invalid calendar draft' });
      }

      let targetEntryId = requestedEntryId || null;
      if (targetEntryId) {
        const existingEntry = await CalendarEntryModel.getEntryById(targetEntryId, accountId);
        if (!existingEntry) {
          return res.status(404).json({ error: 'Calendar draft not found' });
        }

        if (existingEntry.submissionStatus !== 'Draft') {
          return res.status(409).json({ error: 'Submitted reports cannot be autosaved as drafts' });
        }
      } else {
        const existingDraft = await CalendarEntryModel.getDraftEntryForDate(accountId, validation.value.date);
        targetEntryId = existingDraft?.id || null;
      }

      const draftPayload = {
        ownerAccountId: accountId,
        ...validation.value,
        category: 'Trooper Daily',
        submissionStatus: 'Draft' as const,
      };

      const entry = targetEntryId
        ? await CalendarEntryModel.updateEntry(targetEntryId, draftPayload)
        : await CalendarEntryModel.createEntry(draftPayload);

      if (!entry) {
        return res.status(404).json({ error: 'Calendar draft not found' });
      }

      broadcastAppEvent({ type: 'calendar-updated', entityId: entry.id });
      res.json(entry);
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { statusCode?: number }).statusCode === 403) {
        return res.status(403).json({ error: 'Calendar account mismatch' });
      }

      console.error('Calendar autosave error:', error);
      res.status(500).json({ error: 'Failed to autosave calendar draft' });
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
