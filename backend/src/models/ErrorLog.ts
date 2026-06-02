import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { broadcastAppEvent } from '../services/appEvents';

export interface ErrorLog {
  id: string;
  level: string;
  message: string;
  stack: string | null;
  route: string | null;
  method: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

interface ErrorLogRow extends RowDataPacket, ErrorLog {}
interface CountRow extends RowDataPacket {
  total: number;
}

export interface ErrorLogFilters {
  q?: string;
  level?: string;
  from?: string;
  to?: string;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, '\\$&');
}

export class ErrorLogModel {
  static async create(log: Omit<ErrorLog, 'id' | 'createdAt'>): Promise<void> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      await conn.query(
        `INSERT INTO error_logs (
          \`id\`, \`level\`, \`message\`, \`stack\`, \`route\`, \`method\`, \`userId\`, \`ipAddress\`, \`userAgent\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          log.level,
          log.message,
          log.stack,
          log.route,
          log.method,
          log.userId,
          log.ipAddress,
          log.userAgent,
        ]
      );
      broadcastAppEvent({ type: 'error-updated', entityId: id });
    } finally {
      conn.release();
    }
  }

  static async list(filters: ErrorLogFilters = {}, limit = 100, offset = 0): Promise<{ data: ErrorLog[]; total: number }> {
    const conn = await pool.getConnection();
    try {
      const where: string[] = [];
      const params: Array<string | number> = [];

      if (filters.q) {
        const q = `%${escapeLike(filters.q)}%`;
        where.push(`(
          \`message\` LIKE ? ESCAPE '\\'
          OR \`stack\` LIKE ? ESCAPE '\\'
          OR \`route\` LIKE ? ESCAPE '\\'
          OR \`userId\` LIKE ? ESCAPE '\\'
          OR \`ipAddress\` LIKE ? ESCAPE '\\'
        )`);
        params.push(q, q, q, q, q);
      }

      if (filters.level) {
        where.push('`level` = ?');
        params.push(filters.level);
      }

      if (filters.from) {
        where.push('`createdAt` >= ?');
        params.push(filters.from);
      }

      if (filters.to) {
        where.push('`createdAt` <= ?');
        params.push(filters.to);
      }

      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const [rows] = await conn.query<ErrorLogRow[]>(
        `SELECT * FROM error_logs ${whereSql} ORDER BY \`createdAt\` DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      const [countRows] = await conn.query<CountRow[]>(`SELECT COUNT(*) AS total FROM error_logs ${whereSql}`, params);

      return {
        data: rows,
        total: countRows[0]?.total || 0,
      };
    } finally {
      conn.release();
    }
  }
}
