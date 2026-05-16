import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export type BugReportStatus = 'New' | 'Pending' | 'Fixed' | 'Closed';
export type BugReportPriority = 'Low' | 'Normal' | 'High' | 'Critical';

export interface BugReport {
  id: string;
  reporterId: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  title: string;
  description: string;
  location: string;
  priority: BugReportPriority;
  status: BugReportStatus;
  adminNotes: string;
  createdAt: Date;
  updatedAt: Date;
}

interface BugReportRow extends RowDataPacket, BugReport {}

export interface BugReportInput {
  reporterId?: string | null;
  reporterName?: string | null;
  reporterEmail?: string | null;
  title: string;
  description: string;
  location?: string;
  priority?: BugReportPriority;
}

export class BugReportModel {
  static async create(input: BugReportInput): Promise<BugReport> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO bug_reports (
          \`id\`, \`reporterId\`, \`reporterName\`, \`reporterEmail\`, \`title\`, \`description\`,
          \`location\`, \`priority\`, \`status\`, \`adminNotes\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'New', '', ?, ?)`,
        [
          id,
          input.reporterId || null,
          input.reporterName || null,
          input.reporterEmail || null,
          input.title.trim(),
          input.description.trim(),
          input.location?.trim() || '',
          input.priority || 'Normal',
          now,
          now,
        ]
      );

      return {
        id,
        reporterId: input.reporterId || null,
        reporterName: input.reporterName || null,
        reporterEmail: input.reporterEmail || null,
        title: input.title.trim(),
        description: input.description.trim(),
        location: input.location?.trim() || '',
        priority: input.priority || 'Normal',
        status: 'New',
        adminNotes: '',
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async list(): Promise<BugReport[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<BugReportRow[]>(
        'SELECT * FROM bug_reports ORDER BY FIELD(`status`, "New", "Pending", "Fixed", "Closed"), `createdAt` DESC'
      );

      return rows;
    } finally {
      conn.release();
    }
  }

  static async updateStatus(id: string, status: BugReportStatus, adminNotes: string): Promise<BugReport | null> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        'UPDATE bug_reports SET `status` = ?, `adminNotes` = ?, `updatedAt` = ? WHERE `id` = ?',
        [status, adminNotes, new Date(), id]
      );

      const [rows] = await conn.query<BugReportRow[]>('SELECT * FROM bug_reports WHERE `id` = ? LIMIT 1', [id]);
      return rows[0] || null;
    } finally {
      conn.release();
    }
  }
}
