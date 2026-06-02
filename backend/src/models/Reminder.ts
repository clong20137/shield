import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface Reminder {
  id: string;
  accountId: string;
  title: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ReminderRow extends RowDataPacket {
  id: string;
  accountId: string;
  title: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    accountId: row.accountId,
    title: row.title,
    completedAt: row.completedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

  static async create(accountId: string, title: string): Promise<Reminder> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO reminders (\`id\`, \`accountId\`, \`title\`, \`completedAt\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, NULL, ?, ?)`,
        [id, accountId, title, now, now]
      );

      return { id, accountId, title, completedAt: null, createdAt: now, updatedAt: now };
    } finally {
      conn.release();
    }
  }

  static async update(id: string, accountId: string, updates: { title?: string; completed?: boolean }): Promise<Reminder | null> {
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
      const nextCompletedAt = typeof updates.completed === 'boolean'
        ? updates.completed ? new Date() : null
        : existingRows[0].completedAt;

      await conn.query<ResultSetHeader>(
        `UPDATE reminders
         SET \`title\` = ?, \`completedAt\` = ?, \`updatedAt\` = ?
         WHERE \`id\` = ? AND \`accountId\` = ?`,
        [nextTitle, nextCompletedAt, new Date(), id, accountId]
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
}
