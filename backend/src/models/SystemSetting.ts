import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';

interface SettingRow extends RowDataPacket {
  settingValue: string | null;
}

export class SystemSettingModel {
  static async getNumber(key: string, fallback: number): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<SettingRow[]>(
        'SELECT `settingValue` FROM system_settings WHERE `settingKey` = ? LIMIT 1',
        [key]
      );
      const value = Number(rows[0]?.settingValue);
      return Number.isFinite(value) ? value : fallback;
    } finally {
      conn.release();
    }
  }

  static async setNumber(key: string, value: number): Promise<number> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        `INSERT INTO system_settings (\`settingKey\`, \`settingValue\`, \`updatedAt\`)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE \`settingValue\` = VALUES(\`settingValue\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
        [key, String(value), new Date()]
      );
      return value;
    } finally {
      conn.release();
    }
  }
}
