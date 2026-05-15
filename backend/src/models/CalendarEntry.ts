import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface CalendarEntry {
  id: string;
  ownerAccountId: string;
  category: string;
  date: string;
  dutyHours: string;
  districtWorked: string;
  specialStatus: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CalendarEntryRow extends RowDataPacket {
  id: string;
  ownerAccountId: string;
  category: string;
  entryDate: Date | string;
  dutyHours: number | string;
  districtWorked: string;
  specialStatus: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CalendarEntryInput = Omit<CalendarEntry, 'id' | 'createdAt' | 'updatedAt'>;

function formatDate(value: Date | string): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toCalendarEntry(row: CalendarEntryRow): CalendarEntry {
  return {
    id: row.id,
    ownerAccountId: row.ownerAccountId,
    category: row.category,
    date: formatDate(row.entryDate),
    dutyHours: String(row.dutyHours).replace(/\.?0+$/u, ''),
    districtWorked: row.districtWorked,
    specialStatus: row.specialStatus,
    color: row.color,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class CalendarEntryModel {
  static async listEntries(ownerAccountId: string): Promise<CalendarEntry[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<CalendarEntryRow[]>(
        'SELECT * FROM calendar_entries WHERE `ownerAccountId` = ? ORDER BY `entryDate` DESC, `updatedAt` DESC',
        [ownerAccountId]
      );

      return rows.map(toCalendarEntry);
    } finally {
      conn.release();
    }
  }

  static async createEntry(entry: CalendarEntryInput): Promise<CalendarEntry> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();

      await conn.query<ResultSetHeader>(
        `INSERT INTO calendar_entries (
          \`id\`, \`ownerAccountId\`, \`category\`, \`entryDate\`, \`dutyHours\`, \`districtWorked\`,
          \`specialStatus\`, \`color\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          entry.ownerAccountId,
          entry.category,
          entry.date,
          Number(entry.dutyHours),
          entry.districtWorked,
          entry.specialStatus,
          entry.color,
          now,
          now,
        ]
      );

      return {
        ...entry,
        dutyHours: String(entry.dutyHours),
        id,
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async updateEntry(id: string, entry: CalendarEntryInput): Promise<CalendarEntry | null> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        `UPDATE calendar_entries SET
          \`category\` = ?,
          \`entryDate\` = ?,
          \`dutyHours\` = ?,
          \`districtWorked\` = ?,
          \`specialStatus\` = ?,
          \`color\` = ?,
          \`updatedAt\` = ?
        WHERE \`id\` = ? AND \`ownerAccountId\` = ?`,
        [
          entry.category,
          entry.date,
          Number(entry.dutyHours),
          entry.districtWorked,
          entry.specialStatus,
          entry.color,
          new Date(),
          id,
          entry.ownerAccountId,
        ]
      );

      const [rows] = await conn.query<CalendarEntryRow[]>(
        'SELECT * FROM calendar_entries WHERE `id` = ? AND `ownerAccountId` = ? LIMIT 1',
        [id, entry.ownerAccountId]
      );

      return rows[0] ? toCalendarEntry(rows[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async deleteEntry(id: string, ownerAccountId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM calendar_entries WHERE `id` = ? AND `ownerAccountId` = ?',
        [id, ownerAccountId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
