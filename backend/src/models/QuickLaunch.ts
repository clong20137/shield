import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';

export type QuickLaunchSlot =
  | string
  | {
      type: 'external';
      label: string;
      url: string;
    }
  | null;

interface QuickLaunchRow extends RowDataPacket {
  slots: string | null;
}

export class QuickLaunchModel {
  static async getSlots(accountId: string): Promise<QuickLaunchSlot[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<QuickLaunchRow[]>(
        'SELECT `slots` FROM quick_launch_slots WHERE `accountId` = ? LIMIT 1',
        [accountId]
      );
      const rawSlots = rows[0]?.slots;
      if (!rawSlots) return [];

      try {
        const parsed = JSON.parse(rawSlots);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    } finally {
      conn.release();
    }
  }

  static async saveSlots(accountId: string, slots: QuickLaunchSlot[]): Promise<QuickLaunchSlot[]> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        `INSERT INTO quick_launch_slots (\`accountId\`, \`slots\`, \`updatedAt\`)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE \`slots\` = VALUES(\`slots\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
        [accountId, JSON.stringify(slots), new Date()]
      );
      return slots;
    } finally {
      conn.release();
    }
  }
}
