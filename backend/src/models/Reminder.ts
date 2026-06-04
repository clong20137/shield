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
  notifiedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ReminderRow extends RowDataPacket {
  id: string;
  accountId: string;
  title: string;
  priority: 'Low' | 'Normal' | 'High' | 'Critical' | null;
  notes: string | null;
  remindOn: Date | string | null;
  notifiedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    accountId: row.accountId,
    title: row.title,
    priority: row.priority || 'Normal',
    notes: row.notes || '',
    remindOn: formatDate(row.remindOn || row.createdAt),
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

  static async create(accountId: string, title: string, remindOn: string, priority: Reminder['priority'] = 'Normal', notes = ''): Promise<Reminder> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO reminders (\`id\`, \`accountId\`, \`title\`, \`priority\`, \`notes\`, \`remindOn\`, \`notifiedAt\`, \`completedAt\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        [id, accountId, title, priority, notes, remindOn, now, now]
      );

      return { id, accountId, title, priority, notes, remindOn, notifiedAt: null, completedAt: null, createdAt: now, updatedAt: now };
    } finally {
      conn.release();
    }
  }

  static async update(id: string, accountId: string, updates: { title?: string; priority?: Reminder['priority']; notes?: string; remindOn?: string; completed?: boolean }): Promise<Reminder | null> {
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
      const shouldResetNotification = updates.remindOn !== undefined && updates.remindOn !== existingRemindOn;
      const nextCompletedAt = typeof updates.completed === 'boolean'
        ? updates.completed ? new Date() : null
        : existingRows[0].completedAt;
      const nextNotifiedAt = shouldResetNotification ? null : existingRows[0].notifiedAt;

      await conn.query<ResultSetHeader>(
        `UPDATE reminders
         SET \`title\` = ?, \`priority\` = ?, \`notes\` = ?, \`remindOn\` = ?, \`notifiedAt\` = ?, \`completedAt\` = ?, \`updatedAt\` = ?
         WHERE \`id\` = ? AND \`accountId\` = ?`,
        [nextTitle, nextPriority, nextNotes, nextRemindOn, nextNotifiedAt, nextCompletedAt, new Date(), id, accountId]
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
           AND \`remindOn\` <= CURDATE()
         ORDER BY \`remindOn\` ASC, \`createdAt\` ASC
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
}
