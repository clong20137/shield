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
  details: Record<string, string>;
  submissionStatus: 'Draft' | 'Submitted';
  reviewStatus: 'Pending' | 'Approved' | 'Returned';
  reviewNotes: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
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
  details: string | Record<string, string> | null;
  submissionStatus: 'Draft' | 'Submitted' | null;
  reviewStatus: 'Pending' | 'Approved' | 'Returned' | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MileageTotalRow extends RowDataPacket {
  mileage: number | string | null;
}

export type CalendarEntryInput = Omit<CalendarEntry, 'id' | 'reviewStatus' | 'reviewNotes' | 'reviewedBy' | 'reviewedByName' | 'reviewedAt' | 'createdAt' | 'updatedAt'>;

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
  const details = typeof row.details === 'string' ? JSON.parse(row.details || '{}') : row.details || {};

  return {
    id: row.id,
    ownerAccountId: row.ownerAccountId,
    category: row.category,
    date: formatDate(row.entryDate),
    dutyHours: String(row.dutyHours).replace(/\.?0+$/u, ''),
    districtWorked: row.districtWorked,
    specialStatus: row.specialStatus,
    color: row.color,
    details,
    submissionStatus: row.submissionStatus || 'Submitted',
    reviewStatus: row.reviewStatus || 'Pending',
    reviewNotes: row.reviewNotes || '',
    reviewedBy: row.reviewedBy || null,
    reviewedByName: row.reviewedByName || null,
    reviewedAt: row.reviewedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class CalendarEntryModel {
  static async getMileageTotal(ownerAccountId: string): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<MileageTotalRow[]>(
        `SELECT COALESCE(SUM(CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(\`details\`, '$.regularDutyMiles')), '') AS DECIMAL(10,2))), 0) AS mileage
         FROM calendar_entries
         WHERE \`ownerAccountId\` = ? AND \`category\` = 'Trooper Daily' AND COALESCE(\`submissionStatus\`, 'Submitted') = 'Submitted'`,
        [ownerAccountId]
      );

      return Number(rows[0]?.mileage || 0);
    } finally {
      conn.release();
    }
  }

  static async listEntries(ownerAccountId: string, limit = 1000, offset = 0): Promise<CalendarEntry[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<CalendarEntryRow[]>(
        'SELECT * FROM calendar_entries WHERE `ownerAccountId` = ? ORDER BY `entryDate` DESC, `updatedAt` DESC LIMIT ? OFFSET ?',
        [ownerAccountId, limit, offset]
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
          \`specialStatus\`, \`color\`, \`details\`, \`submissionStatus\`, \`reviewStatus\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          entry.ownerAccountId,
          entry.category,
          entry.date,
          Number(entry.dutyHours),
          entry.districtWorked,
          entry.specialStatus,
          entry.color,
          JSON.stringify(entry.details || {}),
          entry.submissionStatus,
          'Pending',
          now,
          now,
        ]
      );

      return {
        ...entry,
        dutyHours: String(entry.dutyHours),
        id,
        submissionStatus: entry.submissionStatus,
        reviewStatus: 'Pending',
        reviewNotes: '',
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
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
          \`details\` = ?,
          \`submissionStatus\` = ?,
          \`reviewStatus\` = ?,
          \`reviewNotes\` = NULL,
          \`reviewedBy\` = NULL,
          \`reviewedByName\` = NULL,
          \`reviewedAt\` = NULL,
          \`updatedAt\` = ?
        WHERE \`id\` = ? AND \`ownerAccountId\` = ?`,
        [
          entry.category,
          entry.date,
          Number(entry.dutyHours),
          entry.districtWorked,
          entry.specialStatus,
          entry.color,
          JSON.stringify(entry.details || {}),
          entry.submissionStatus,
          'Pending',
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

  static async reviewEntry(id: string, status: 'Approved' | 'Returned', notes: string, reviewer: { id: string; name: string }): Promise<CalendarEntry | null> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE calendar_entries SET
          \`reviewStatus\` = ?,
          \`reviewNotes\` = ?,
          \`reviewedBy\` = ?,
          \`reviewedByName\` = ?,
          \`reviewedAt\` = ?,
          \`updatedAt\` = ?
        WHERE \`id\` = ? AND \`category\` = 'Trooper Daily'`,
        [status, notes.trim(), reviewer.id, reviewer.name, now, now, id]
      );

      if (result.affectedRows === 0) {
        return null;
      }

      const [rows] = await conn.query<CalendarEntryRow[]>(
        'SELECT * FROM calendar_entries WHERE `id` = ? LIMIT 1',
        [id]
      );

      return rows[0] ? toCalendarEntry(rows[0]) : null;
    } finally {
      conn.release();
    }
  }
}
