import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface AuthAccount {
  id: string;
  email: string;
  displayName: string;
  role: 'administrator' | 'user';
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthAccountRow extends RowDataPacket {
  id: string;
  email: string;
  displayName: string;
  role: 'administrator' | 'user';
  passwordHash: string;
  twoFactorSecret: string | null;
  twoFactorEnabled: boolean | number;
  createdAt: Date;
  updatedAt: Date;
}

const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 64;
const HASH_DIGEST = 'sha512';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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

function generateBase32Secret(length = 32): string {
  const bytes = crypto.randomBytes(length);
  let secret = '';

  for (const byte of bytes) {
    secret += BASE32_ALPHABET[byte % BASE32_ALPHABET.length];
  }

  return secret;
}

function decodeBase32(value: string): Buffer {
  const cleanValue = value.toUpperCase().replace(/=+$/u, '').replace(/\s/gu, '');
  let bits = '';
  const output: number[] = [];

  for (const char of cleanValue) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index === -1) {
      throw new Error('Invalid base32 secret');
    }

    bits += index.toString(2).padStart(5, '0');

    while (bits.length >= 8) {
      output.push(parseInt(bits.slice(0, 8), 2));
      bits = bits.slice(8);
    }
  }

  return Buffer.from(output);
}

function generateTotp(secret: string, timeStep: number): string {
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(timeStep / 0x100000000), 0);
  counter.writeUInt32BE(timeStep & 0xffffffff, 4);

  const hmac = crypto.createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function verifyTotp(secret: string, code: string): boolean {
  const cleanCode = code.replace(/\s/gu, '');

  if (!/^\d{6}$/u.test(cleanCode)) {
    return false;
  }

  const currentStep = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);

  for (const offset of [-1, 0, 1]) {
    if (generateTotp(secret, currentStep + offset) === cleanCode) {
      return true;
    }
  }

  return false;
}

function toPublicAccount(account: AuthAccountRow): AuthAccount {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role || 'user',
    twoFactorEnabled: Boolean(account.twoFactorEnabled),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export interface LoginResult {
  account: AuthAccount | null;
  requiresTwoFactor: boolean;
}

export class AuthAccountModel {
  static async createAccount(email: string, password: string, displayName: string): Promise<AuthAccount> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      const normalizedEmail = normalizeEmail(email);
      const passwordHash = hashPassword(password);
      const [accountCountRows] = await conn.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM auth_accounts');
      const accountCount = Number(accountCountRows[0]?.count) || 0;
      const role: AuthAccount['role'] = accountCount === 0 ? 'administrator' : 'user';

      await conn.query<ResultSetHeader>(
        `INSERT INTO auth_accounts (
          \`id\`, \`email\`, \`passwordHash\`, \`displayName\`, \`role\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, normalizedEmail, passwordHash, displayName.trim(), role, now, now]
      );

      return {
        id,
        email: normalizedEmail,
        displayName: displayName.trim(),
        role,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async verifyLogin(email: string, password: string, twoFactorCode?: string): Promise<LoginResult> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthAccountRow[]>(
        'SELECT * FROM auth_accounts WHERE `email` = ? LIMIT 1',
        [normalizeEmail(email)]
      );

      const account = rows[0];

      if (!account || !verifyPassword(password, account.passwordHash)) {
        return { account: null, requiresTwoFactor: false };
      }

      if (account.twoFactorEnabled && account.twoFactorSecret) {
        if (!twoFactorCode) {
          return { account: null, requiresTwoFactor: true };
        }

        if (!verifyTotp(account.twoFactorSecret, twoFactorCode)) {
          return { account: null, requiresTwoFactor: false };
        }
      }

      return { account: toPublicAccount(account), requiresTwoFactor: false };
    } finally {
      conn.release();
    }
  }

  static async changePassword(accountId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthAccountRow[]>(
        'SELECT * FROM auth_accounts WHERE `id` = ? LIMIT 1',
        [accountId]
      );
      const account = rows[0];

      if (!account || !verifyPassword(currentPassword, account.passwordHash)) {
        return false;
      }

      await conn.query<ResultSetHeader>(
        'UPDATE auth_accounts SET `passwordHash` = ?, `updatedAt` = ? WHERE `id` = ?',
        [hashPassword(newPassword), new Date(), accountId]
      );

      return true;
    } finally {
      conn.release();
    }
  }

  static async createTwoFactorSetup(accountId: string): Promise<{ secret: string; otpauthUrl: string } | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthAccountRow[]>(
        'SELECT * FROM auth_accounts WHERE `id` = ? LIMIT 1',
        [accountId]
      );
      const account = rows[0];

      if (!account) {
        return null;
      }

      const secret = generateBase32Secret();
      await conn.query<ResultSetHeader>(
        'UPDATE auth_accounts SET `twoFactorSecret` = ?, `twoFactorEnabled` = 0, `updatedAt` = ? WHERE `id` = ?',
        [secret, new Date(), accountId]
      );

      const label = encodeURIComponent(`SHIELD:${account.email}`);
      const issuer = encodeURIComponent('SHIELD');

      return {
        secret,
        otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`,
      };
    } finally {
      conn.release();
    }
  }

  static async enableTwoFactor(accountId: string, code: string): Promise<AuthAccount | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthAccountRow[]>(
        'SELECT * FROM auth_accounts WHERE `id` = ? LIMIT 1',
        [accountId]
      );
      const account = rows[0];

      if (!account?.twoFactorSecret || !verifyTotp(account.twoFactorSecret, code)) {
        return null;
      }

      await conn.query<ResultSetHeader>(
        'UPDATE auth_accounts SET `twoFactorEnabled` = 1, `updatedAt` = ? WHERE `id` = ?',
        [new Date(), accountId]
      );

      return {
        ...toPublicAccount(account),
        twoFactorEnabled: true,
      };
    } finally {
      conn.release();
    }
  }

  static async disableTwoFactor(accountId: string, password: string): Promise<AuthAccount | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthAccountRow[]>(
        'SELECT * FROM auth_accounts WHERE `id` = ? LIMIT 1',
        [accountId]
      );
      const account = rows[0];

      if (!account || !verifyPassword(password, account.passwordHash)) {
        return null;
      }

      await conn.query<ResultSetHeader>(
        'UPDATE auth_accounts SET `twoFactorEnabled` = 0, `twoFactorSecret` = NULL, `updatedAt` = ? WHERE `id` = ?',
        [new Date(), accountId]
      );

      return {
        ...toPublicAccount(account),
        twoFactorEnabled: false,
      };
    } finally {
      conn.release();
    }
  }

  static async listAccounts(): Promise<AuthAccount[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthAccountRow[]>(
        'SELECT * FROM auth_accounts ORDER BY `role`, `displayName`, `email`'
      );

      return rows.map(toPublicAccount);
    } finally {
      conn.release();
    }
  }

  static async getAccountById(accountId: string): Promise<AuthAccount | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<AuthAccountRow[]>(
        'SELECT * FROM auth_accounts WHERE `id` = ? LIMIT 1',
        [accountId]
      );
      const account = rows[0];

      return account ? toPublicAccount(account) : null;
    } finally {
      conn.release();
    }
  }

  static async updateRole(accountId: string, role: AuthAccount['role']): Promise<AuthAccount | null> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>(
        'UPDATE auth_accounts SET `role` = ?, `updatedAt` = ? WHERE `id` = ?',
        [role, new Date(), accountId]
      );

      const [rows] = await conn.query<AuthAccountRow[]>(
        'SELECT * FROM auth_accounts WHERE `id` = ? LIMIT 1',
        [accountId]
      );
      const account = rows[0];

      return account ? toPublicAccount(account) : null;
    } finally {
      conn.release();
    }
  }
}
