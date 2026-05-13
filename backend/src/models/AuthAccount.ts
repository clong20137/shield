import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface AuthAccount {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthAccountRow extends AuthAccount, RowDataPacket {
  passwordHash: string;
}

const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 64;
const HASH_DIGEST = 'sha512';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const hash = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_DIGEST)
    .toString('hex');

  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedPasswordHash: string): boolean {
  const [salt, storedHash] = storedPasswordHash.split(':');

  if (!salt || !storedHash) {
    return false;
  }

  const attemptedHash = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(attemptedHash, 'hex'));
}

function toPublicAccount(account: AuthAccountRow): AuthAccount {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export class AuthAccountModel {
  static async createAccount(email: string, password: string, displayName: string): Promise<AuthAccount> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      const normalizedEmail = normalizeEmail(email);
      const passwordHash = hashPassword(password);

      await conn.query<ResultSetHeader>(
        `INSERT INTO auth_accounts (
          \`id\`, \`email\`, \`passwordHash\`, \`displayName\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, normalizedEmail, passwordHash, displayName.trim(), now, now]
      );

      return {
        id,
        email: normalizedEmail,
        displayName: displayName.trim(),
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async verifyLogin(email: string, password: string): Promise<AuthAccount | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthAccountRow[]>(
        'SELECT * FROM auth_accounts WHERE `email` = ? LIMIT 1',
        [normalizeEmail(email)]
      );

      const account = rows[0];

      if (!account || !verifyPassword(password, account.passwordHash)) {
        return null;
      }

      return toPublicAccount(account);
    } finally {
      conn.release();
    }
  }
}
