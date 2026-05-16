import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface AuthInvite {
  id: string;
  email: string;
  invitedBy: string | null;
  invitedByName: string | null;
  tokenHash?: string;
  acceptedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

interface AuthInviteRow extends RowDataPacket {
  id: string;
  email: string;
  invitedBy: string | null;
  invitedByName: string | null;
  tokenHash: string;
  acceptedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toInvite(row: AuthInviteRow): AuthInvite {
  return {
    id: row.id,
    email: row.email,
    invitedBy: row.invitedBy,
    invitedByName: row.invitedByName,
    tokenHash: row.tokenHash,
    acceptedAt: row.acceptedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export class AuthInviteModel {
  static async create(email: string, invitedBy: string | null, invitedByName: string | null): Promise<AuthInvite & { token: string }> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = hashInviteToken(token);
      const now = new Date();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await conn.query<ResultSetHeader>(
        `INSERT INTO auth_invites (
          \`id\`, \`email\`, \`tokenHash\`, \`invitedBy\`, \`invitedByName\`, \`expiresAt\`, \`createdAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, email.trim().toLowerCase(), tokenHash, invitedBy, invitedByName, expiresAt, now]
      );

      return {
        id,
        email: email.trim().toLowerCase(),
        invitedBy,
        invitedByName,
        tokenHash,
        token,
        acceptedAt: null,
        expiresAt,
        createdAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async list(): Promise<AuthInvite[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthInviteRow[]>(
        'SELECT * FROM auth_invites ORDER BY `createdAt` DESC LIMIT 100'
      );
      return rows.map(toInvite);
    } finally {
      conn.release();
    }
  }

  static async getValidInvite(token: string): Promise<AuthInvite | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthInviteRow[]>(
        `SELECT * FROM auth_invites
        WHERE \`tokenHash\` = ?
          AND \`acceptedAt\` IS NULL
          AND \`expiresAt\` > ?
        LIMIT 1`,
        [hashInviteToken(token), new Date()]
      );
      return rows[0] ? toInvite(rows[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async markAccepted(inviteId: string): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        'UPDATE auth_invites SET `acceptedAt` = ? WHERE `id` = ?',
        [new Date(), inviteId]
      );
    } finally {
      conn.release();
    }
  }

  static async cleanupExpiredInvites(): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM auth_invites WHERE `acceptedAt` IS NOT NULL OR `expiresAt` <= ?',
        [new Date()]
      );
      return result.affectedRows;
    } finally {
      conn.release();
    }
  }
}
