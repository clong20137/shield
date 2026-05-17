import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface AuthPasswordReset {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  usedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

interface AuthPasswordResetRow extends RowDataPacket {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  usedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toPasswordReset(row: AuthPasswordResetRow): AuthPasswordReset {
  return {
    id: row.id,
    userId: row.userId,
    email: row.email,
    tokenHash: row.tokenHash,
    usedAt: row.usedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export class AuthPasswordResetModel {
  static async create(userId: string, email: string): Promise<AuthPasswordReset & { token: string }> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const token = crypto.randomBytes(40).toString('base64url');
      const tokenHash = hashResetToken(token);
      const now = new Date();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await conn.query<ResultSetHeader>(
        'UPDATE auth_password_resets SET `usedAt` = ? WHERE `userId` = ? AND `usedAt` IS NULL',
        [now, userId]
      );

      await conn.query<ResultSetHeader>(
        `INSERT INTO auth_password_resets (
          \`id\`, \`userId\`, \`email\`, \`tokenHash\`, \`expiresAt\`, \`createdAt\`
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, userId, email.trim().toLowerCase(), tokenHash, expiresAt, now]
      );

      return {
        id,
        userId,
        email: email.trim().toLowerCase(),
        tokenHash,
        token,
        usedAt: null,
        expiresAt,
        createdAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async getValidReset(token: string): Promise<AuthPasswordReset | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthPasswordResetRow[]>(
        `SELECT * FROM auth_password_resets
        WHERE \`tokenHash\` = ?
          AND \`usedAt\` IS NULL
          AND \`expiresAt\` > ?
        LIMIT 1`,
        [hashResetToken(token), new Date()]
      );

      return rows[0] ? toPasswordReset(rows[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async markUsed(resetId: string): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        'UPDATE auth_password_resets SET `usedAt` = ? WHERE `id` = ?',
        [new Date(), resetId]
      );
    } finally {
      conn.release();
    }
  }

  static async cleanupExpiredResets(): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM auth_password_resets WHERE `usedAt` IS NOT NULL OR `expiresAt` <= ?',
        [new Date()]
      );
      return result.affectedRows;
    } finally {
      conn.release();
    }
  }
}
