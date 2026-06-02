import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';

export interface QuickNote {
  accountId: string;
  content: string;
  updatedAt: Date;
}

interface QuickNoteRow extends RowDataPacket, QuickNote {}

export class QuickNoteModel {
  static async get(accountId: string): Promise<QuickNote> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<QuickNoteRow[]>(
        'SELECT * FROM quick_notes WHERE `accountId` = ? LIMIT 1',
        [accountId]
      );

      return rows[0] || { accountId, content: '', updatedAt: new Date() };
    } finally {
      conn.release();
    }
  }

  static async save(accountId: string, content: string): Promise<QuickNote> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO quick_notes (\`accountId\`, \`content\`, \`updatedAt\`)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE \`content\` = VALUES(\`content\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
        [accountId, content, now]
      );

      return { accountId, content, updatedAt: now };
    } finally {
      conn.release();
    }
  }
}
