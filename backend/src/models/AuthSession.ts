import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { AuthAccount, AuthAccountModel } from './AuthAccount';

interface SessionRow extends RowDataPacket {
  userId: string;
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
}
