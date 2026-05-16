import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { AuthAccount, AuthAccountModel } from './AuthAccount';

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  isCurrent?: boolean;
}

interface SessionRow extends RowDataPacket {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

const SESSION_DAYS = 7;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export class AuthSessionModel {
  static async createSession(userId: string): Promise<string> {
    const conn = await pool.getConnection();
    try {
      const token = crypto.randomBytes(48).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

      await conn.query<ResultSetHeader>(
        `INSERT INTO user_sessions (
          \`id\`, \`userId\`, \`tokenHash\`, \`expiresAt\`
        ) VALUES (?, ?, ?, ?)`,
        [uuidv4(), userId, hashToken(token), expiresAt]
      );

      return token;
    } finally {
      conn.release();
    }
  }

  static async getAccountForToken(token: string): Promise<AuthAccount | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<SessionRow[]>(
        `SELECT \`userId\`
        FROM user_sessions
        WHERE \`tokenHash\` = ?
          AND \`revokedAt\` IS NULL
          AND \`expiresAt\` > NOW()
        LIMIT 1`,
        [hashToken(token)]
      );
      const session = rows[0];

      if (!session) {
        return null;
      }

      return AuthAccountModel.getAccountById(session.userId);
    } finally {
      conn.release();
    }
  }

  static async listActiveSessions(userId: string, currentToken?: string): Promise<AuthSession[]> {
    const conn = await pool.getConnection();
    try {
      const currentTokenHash = currentToken ? hashToken(currentToken) : '';
      const [rows] = await conn.query<SessionRow[]>(
        `SELECT \`id\`, \`userId\`, \`expiresAt\`, \`createdAt\`, \`revokedAt\`,
          CASE WHEN \`tokenHash\` = ? THEN 1 ELSE 0 END as isCurrent
        FROM user_sessions
        WHERE \`userId\` = ?
          AND \`revokedAt\` IS NULL
          AND \`expiresAt\` > NOW()
        ORDER BY \`createdAt\` DESC`,
        [currentTokenHash, userId]
      );

      return rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt,
        isCurrent: Boolean((row as unknown as { isCurrent?: boolean | number }).isCurrent),
      }));
    } finally {
      conn.release();
    }
  }

  static async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'UPDATE user_sessions SET `revokedAt` = ? WHERE `id` = ? AND `userId` = ? AND `revokedAt` IS NULL',
        [new Date(), sessionId, userId]
      );
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async revokeOtherSessions(userId: string, currentToken: string): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE user_sessions
        SET \`revokedAt\` = ?
        WHERE \`userId\` = ?
          AND \`tokenHash\` <> ?
          AND \`revokedAt\` IS NULL`,
        [new Date(), userId, hashToken(currentToken)]
      );
      return result.affectedRows;
    } finally {
      conn.release();
    }
  }

  static async revokeToken(token: string): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        'UPDATE user_sessions SET `revokedAt` = ? WHERE `tokenHash` = ?',
        [new Date(), hashToken(token)]
      );
    } finally {
      conn.release();
    }
  }

  static async cleanupExpiredSessions(): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM user_sessions WHERE `expiresAt` <= ? OR (`revokedAt` IS NOT NULL AND `revokedAt` <= ?)',
        [new Date(), new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)]
      );
      return result.affectedRows;
    } finally {
      conn.release();
    }
  }
}
