import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface CalendarShortcut {
  id: string;
  ownerAccountId: string;
  name: string;
  dutyHours: string;
  districtWorked: string;
  specialStatus: string;
  color: string;
  details: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export type CalendarShortcutInput = Omit<CalendarShortcut, 'id' | 'createdAt' | 'updatedAt'>;

interface CalendarShortcutRow extends RowDataPacket {
  id: string;
  ownerAccountId: string;
  name: string;
  dutyHours: number | string;
  districtWorked: string;
  specialStatus: string;
  color: string;
  details: string | Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
}

function toCalendarShortcut(row: CalendarShortcutRow): CalendarShortcut {
  const details = typeof row.details === 'string' ? JSON.parse(row.details || '{}') : row.details || {};

  return {
    id: row.id,
    ownerAccountId: row.ownerAccountId,
    name: row.name,
    dutyHours: String(row.dutyHours).replace(/\.?0+$/u, ''),
    districtWorked: row.districtWorked,
    specialStatus: row.specialStatus,
    color: row.color,
    details,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class CalendarShortcutModel {
  static async listShortcuts(ownerAccountId: string): Promise<CalendarShortcut[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<CalendarShortcutRow[]>(
        'SELECT * FROM calendar_shortcuts WHERE `ownerAccountId` = ? ORDER BY `name` ASC',
        [ownerAccountId]
      );

      return rows.map(toCalendarShortcut);
    } finally {
      conn.release();
    }
  }

  static async createShortcut(shortcut: CalendarShortcutInput): Promise<CalendarShortcut> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();

      await conn.query<ResultSetHeader>(
        `INSERT INTO calendar_shortcuts (
          \`id\`, \`ownerAccountId\`, \`name\`, \`dutyHours\`, \`districtWorked\`,
          \`specialStatus\`, \`color\`, \`details\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          shortcut.ownerAccountId,
          shortcut.name,
          Number(shortcut.dutyHours),
          shortcut.districtWorked,
          shortcut.specialStatus,
          shortcut.color,
          JSON.stringify(shortcut.details || {}),
          now,
          now,
        ]
      );

      return {
        ...shortcut,
        dutyHours: String(shortcut.dutyHours),
        id,
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async updateShortcut(id: string, shortcut: CalendarShortcutInput): Promise<CalendarShortcut | null> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        `UPDATE calendar_shortcuts SET
          \`name\` = ?,
          \`dutyHours\` = ?,
          \`districtWorked\` = ?,
          \`specialStatus\` = ?,
          \`color\` = ?,
          \`details\` = ?,
          \`updatedAt\` = ?
        WHERE \`id\` = ? AND \`ownerAccountId\` = ?`,
        [
          shortcut.name,
          Number(shortcut.dutyHours),
          shortcut.districtWorked,
          shortcut.specialStatus,
          shortcut.color,
          JSON.stringify(shortcut.details || {}),
          new Date(),
          id,
          shortcut.ownerAccountId,
        ]
      );

      const [rows] = await conn.query<CalendarShortcutRow[]>(
        'SELECT * FROM calendar_shortcuts WHERE `id` = ? AND `ownerAccountId` = ? LIMIT 1',
        [id, shortcut.ownerAccountId]
      );

      return rows[0] ? toCalendarShortcut(rows[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async deleteShortcut(id: string, ownerAccountId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM calendar_shortcuts WHERE `id` = ? AND `ownerAccountId` = ?',
        [id, ownerAccountId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
