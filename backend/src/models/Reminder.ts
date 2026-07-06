import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { UserNotificationModel } from './UserNotification';

export interface Reminder {
  id: string;
  accountId: string;
  title: string;
  priority: 'Low' | 'Normal' | 'High' | 'Critical';
  notes: string;
  remindOn: string;
  remindAt: string | null;
  recurrenceRule: ReminderRecurrenceRule;
  notifiedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReminderRecurrenceRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface ReminderRow extends RowDataPacket {
  id: string;
  accountId: string;
  title: string;
  priority: 'Low' | 'Normal' | 'High' | 'Critical' | null;
  notes: string | null;
  remindOn: Date | string | null;
  remindAt: Date | string | null;
  recurrenceRule: ReminderRecurrenceRule | null;
  notifiedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DueReminderNotificationResult {
  accountId: string;
  reminderId: string;
}

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    accountId: row.accountId,
    title: row.title,
    priority: row.priority || 'Normal',
    notes: row.notes || '',
    remindOn: formatDate(row.remindOn || row.createdAt),
    remindAt: row.remindAt ? formatDateTime(row.remindAt) : null,
    recurrenceRule: row.recurrenceRule || 'none',
    notifiedAt: row.notifiedAt || null,
    completedAt: row.completedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function formatDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | string): string {
  if (typeof value === 'string') {
    return value.replace(' ', 'T').slice(0, 16);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toSqlDateTime(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 10)} ${value.slice(11, 16)}:00`;
}

function addRecurrenceDate(dateValue: string, recurrenceRule: ReminderRecurrenceRule): string {
  const [year, month, day] = dateValue.slice(0, 10).split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);

  if (recurrenceRule === 'daily') {
    date.setDate(date.getDate() + 1);
  } else if (recurrenceRule === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (recurrenceRule === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else if (recurrenceRule === 'yearly') {
    date.setFullYear(date.getFullYear() + 1);
  }

  return formatDate(date);
}

function moveDateTimeToDate(dateTimeValue: string | null, dateValue: string): string | null {
  if (!dateTimeValue) {
    return null;
  }

  return `${dateValue}T${dateTimeValue.slice(11, 16)}`;
}

export class ReminderModel {
  static async list(accountId: string): Promise<Reminder[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<ReminderRow[]>(
        `SELECT * FROM reminders
         WHERE \`accountId\` = ?
         ORDER BY CASE WHEN \`completedAt\` IS NULL THEN 0 ELSE 1 END, \`createdAt\` DESC
         LIMIT 50`,
        [accountId]
      );

      return rows.map(toReminder);
    } finally {
      conn.release();
    }
  }

  static async create(accountId: string, title: string, remindOn: string, priority: Reminder['priority'] = 'Normal', notes = '', remindAt?: string | null, recurrenceRule: ReminderRecurrenceRule = 'none'): Promise<Reminder> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO reminders (\`id\`, \`accountId\`, \`title\`, \`priority\`, \`notes\`, \`remindOn\`, \`remindAt\`, \`recurrenceRule\`, \`notifiedAt\`, \`completedAt\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        [id, accountId, title, priority, notes, remindOn, toSqlDateTime(remindAt), recurrenceRule, now, now]
      );

      return { id, accountId, title, priority, notes, remindOn, remindAt: remindAt || null, recurrenceRule, notifiedAt: null, completedAt: null, createdAt: now, updatedAt: now };
    } finally {
      conn.release();
    }
  }

  static async createLinked(
    accountId: string,
    title: string,
    remindOn: string,
    remindAt: string | null,
    notes: string,
    sourceType: string,
    sourceId: string,
    reminderKind: string,
  ): Promise<Reminder> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO reminders (
          \`id\`, \`accountId\`, \`title\`, \`priority\`, \`notes\`, \`remindOn\`, \`remindAt\`,
          \`recurrenceRule\`, \`notifiedAt\`, \`completedAt\`, \`sourceType\`, \`sourceId\`, \`reminderKind\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, 'High', ?, ?, ?, 'none', NULL, NULL, ?, ?, ?, ?, ?)`,
        [id, accountId, title, notes, remindOn, toSqlDateTime(remindAt), sourceType, sourceId, reminderKind, now, now],
      );

      return { id, accountId, title, priority: 'High', notes, remindOn, remindAt, recurrenceRule: 'none', notifiedAt: null, completedAt: null, createdAt: now, updatedAt: now };
    } finally {
      conn.release();
    }
  }

  static async upsertLinked(
    accountId: string,
    title: string,
    remindOn: string,
    remindAt: string | null,
    notes: string,
    sourceType: string,
    sourceId: string,
    reminderKind: string,
  ): Promise<Reminder> {
    const conn = await pool.getConnection();
    try {
      const [existingRows] = await conn.query<ReminderRow[]>(
        `SELECT * FROM reminders
         WHERE \`accountId\` = ?
           AND \`sourceType\` = ?
           AND \`sourceId\` = ?
           AND \`reminderKind\` = ?
         ORDER BY \`updatedAt\` DESC
         LIMIT 1`,
        [accountId, sourceType, sourceId, reminderKind],
      );

      if (!existingRows[0]) {
        return ReminderModel.createLinked(accountId, title, remindOn, remindAt, notes, sourceType, sourceId, reminderKind);
      }

      const id = existingRows[0].id;
      await conn.query<ResultSetHeader>(
        `UPDATE reminders
         SET \`title\` = ?,
             \`priority\` = 'High',
             \`notes\` = ?,
             \`remindOn\` = ?,
             \`remindAt\` = ?,
             \`recurrenceRule\` = 'none',
             \`notifiedAt\` = NULL,
             \`completedAt\` = NULL,
             \`updatedAt\` = ?
         WHERE \`id\` = ? AND \`accountId\` = ?`,
        [title, notes, remindOn, toSqlDateTime(remindAt), new Date(), id, accountId],
      );

      const [rows] = await conn.query<ReminderRow[]>(
        'SELECT * FROM reminders WHERE `id` = ? AND `accountId` = ? LIMIT 1',
        [id, accountId],
      );

      return rows[0] ? toReminder(rows[0]) : ReminderModel.createLinked(accountId, title, remindOn, remindAt, notes, sourceType, sourceId, reminderKind);
    } finally {
      conn.release();
    }
  }

  static async deleteLinked(accountId: string, sourceType: string, sourceId: string): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM reminders WHERE `accountId` = ? AND `sourceType` = ? AND `sourceId` = ?',
        [accountId, sourceType, sourceId],
      );

      return result.affectedRows;
    } finally {
      conn.release();
    }
  }

  static async update(id: string, accountId: string, updates: { title?: string; priority?: Reminder['priority']; notes?: string; remindOn?: string; remindAt?: string | null; recurrenceRule?: ReminderRecurrenceRule; completed?: boolean }): Promise<Reminder | null> {
    const conn = await pool.getConnection();
    try {
      const [existingRows] = await conn.query<ReminderRow[]>(
        'SELECT * FROM reminders WHERE `id` = ? AND `accountId` = ? LIMIT 1',
        [id, accountId]
      );

      if (!existingRows[0]) {
        return null;
      }

      const nextTitle = updates.title ?? existingRows[0].title;
      const nextPriority = updates.priority ?? existingRows[0].priority ?? 'Normal';
      const nextNotes = updates.notes ?? existingRows[0].notes ?? '';
      const existingRemindOn = formatDate(existingRows[0].remindOn || existingRows[0].createdAt);
      const nextRemindOn = updates.remindOn ?? existingRemindOn;
      const existingRemindAt = existingRows[0].remindAt ? formatDateTime(existingRows[0].remindAt) : null;
      let nextRemindAt = updates.remindAt === undefined ? existingRemindAt : updates.remindAt;
      const nextRecurrenceRule = updates.recurrenceRule ?? existingRows[0].recurrenceRule ?? 'none';
      let nextCompletedAt = typeof updates.completed === 'boolean'
        ? updates.completed ? new Date() : null
        : existingRows[0].completedAt;
      let finalRemindOn = nextRemindOn;
      if (updates.completed === true && nextRecurrenceRule !== 'none') {
        finalRemindOn = addRecurrenceDate(nextRemindOn, nextRecurrenceRule);
        nextRemindAt = moveDateTimeToDate(nextRemindAt, finalRemindOn);
        nextCompletedAt = null;
      }
      const shouldResetNotification =
        finalRemindOn !== existingRemindOn ||
        (updates.remindAt !== undefined && updates.remindAt !== existingRemindAt) ||
        updates.completed === true ||
        updates.recurrenceRule !== undefined;
      const nextNotifiedAt = shouldResetNotification ? null : existingRows[0].notifiedAt;

      await conn.query<ResultSetHeader>(
        `UPDATE reminders
         SET \`title\` = ?, \`priority\` = ?, \`notes\` = ?, \`remindOn\` = ?, \`remindAt\` = ?, \`recurrenceRule\` = ?, \`notifiedAt\` = ?, \`completedAt\` = ?, \`updatedAt\` = ?
         WHERE \`id\` = ? AND \`accountId\` = ?`,
        [nextTitle, nextPriority, nextNotes, finalRemindOn, toSqlDateTime(nextRemindAt), nextRecurrenceRule, nextNotifiedAt, nextCompletedAt, new Date(), id, accountId]
      );

      const [rows] = await conn.query<ReminderRow[]>(
        'SELECT * FROM reminders WHERE `id` = ? AND `accountId` = ? LIMIT 1',
        [id, accountId]
      );

      return rows[0] ? toReminder(rows[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async delete(id: string, accountId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM reminders WHERE `id` = ? AND `accountId` = ?',
        [id, accountId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async createDueNotifications(accountId: string): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<ReminderRow[]>(
        `SELECT * FROM reminders
         WHERE \`accountId\` = ?
           AND \`completedAt\` IS NULL
           AND \`notifiedAt\` IS NULL
           AND COALESCE(\`remindAt\`, TIMESTAMP(\`remindOn\`, '00:00:00')) <= NOW()
         ORDER BY COALESCE(\`remindAt\`, TIMESTAMP(\`remindOn\`, '00:00:00')) ASC, \`createdAt\` ASC
         LIMIT 25`,
        [accountId]
      );

      for (const reminder of rows) {
        await UserNotificationModel.create({
          userId: accountId,
          type: 'reminder',
          title: 'Reminder',
          message: reminder.notes ? `${reminder.title}: ${reminder.notes}` : reminder.title,
          entityType: 'reminder',
          entityId: reminder.id,
        });
        await conn.query<ResultSetHeader>(
          'UPDATE reminders SET `notifiedAt` = ?, `updatedAt` = ? WHERE `id` = ? AND `accountId` = ?',
          [new Date(), new Date(), reminder.id, accountId]
        );
      }

      return rows.length;
    } finally {
      conn.release();
    }
  }

  static async createDueNotificationsForAll(): Promise<DueReminderNotificationResult[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<ReminderRow[]>(
        `SELECT * FROM reminders
         WHERE \`completedAt\` IS NULL
           AND \`notifiedAt\` IS NULL
           AND COALESCE(\`remindAt\`, TIMESTAMP(\`remindOn\`, '00:00:00')) <= NOW()
         ORDER BY COALESCE(\`remindAt\`, TIMESTAMP(\`remindOn\`, '00:00:00')) ASC, \`createdAt\` ASC
         LIMIT 100`,
      );

      const results: DueReminderNotificationResult[] = [];
      for (const reminder of rows) {
        await UserNotificationModel.create({
          userId: reminder.accountId,
          type: 'reminder',
          title: 'Reminder',
          message: reminder.notes ? `${reminder.title}: ${reminder.notes}` : reminder.title,
          entityType: 'reminder',
          entityId: reminder.id,
        });
        await conn.query<ResultSetHeader>(
          'UPDATE reminders SET `notifiedAt` = ?, `updatedAt` = ? WHERE `id` = ? AND `accountId` = ?',
          [new Date(), new Date(), reminder.id, reminder.accountId],
        );
        results.push({ accountId: reminder.accountId, reminderId: reminder.id });
      }

      return results;
    } finally {
      conn.release();
    }
  }
}
