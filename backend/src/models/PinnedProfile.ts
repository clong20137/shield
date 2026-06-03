import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { User } from './User';

export type PinnedProfile = User & {
  pinnedAt: Date;
};

interface PinnedProfileRow extends RowDataPacket, PinnedProfile {}

export class PinnedProfileModel {
  static async list(accountId: string, includeHidden = false): Promise<PinnedProfile[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<PinnedProfileRow[]>(
        `SELECT u.*, p.\`pinnedAt\`
         FROM pinned_profiles p
         JOIN users u ON u.\`id\` = p.\`profileUserId\`
         WHERE p.\`accountId\` = ? ${includeHidden ? '' : 'AND COALESCE(u.`isHidden`, 0) = 0'}
         ORDER BY p.\`pinnedAt\` DESC`,
        [accountId]
      );

      return rows as PinnedProfile[];
    } finally {
      conn.release();
    }
  }

  static async pin(accountId: string, profileUserId: string): Promise<PinnedProfile | null> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO pinned_profiles (\`accountId\`, \`profileUserId\`, \`pinnedAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE \`pinnedAt\` = VALUES(\`pinnedAt\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
        [accountId, profileUserId, now, now]
      );

      const [rows] = await conn.query<PinnedProfileRow[]>(
        `SELECT u.*, p.\`pinnedAt\`
         FROM pinned_profiles p
         JOIN users u ON u.\`id\` = p.\`profileUserId\`
         WHERE p.\`accountId\` = ? AND p.\`profileUserId\` = ?
         LIMIT 1`,
        [accountId, profileUserId]
      );

      return rows[0] || null;
    } finally {
      conn.release();
    }
  }

  static async unpin(accountId: string, profileUserId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM pinned_profiles WHERE `accountId` = ? AND `profileUserId` = ?',
        [accountId, profileUserId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
