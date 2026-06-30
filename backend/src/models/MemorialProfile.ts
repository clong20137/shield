import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface MemorialProfile {
  id: string;
  linkedUserId?: string | null;
  firstName: string;
  lastName: string;
  rank?: string | null;
  district?: string | null;
  appointedDate?: string | null;
  deceasedDate?: string | null;
  photoUrl?: string | null;
  serviceYears?: string | null;
  memorialSummary?: string | null;
  memorialExternalUrl?: string | null;
  linkedProfilePictureUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemorialProfileInput {
  linkedUserId?: string | null;
  firstName: string;
  lastName: string;
  rank?: string;
  district?: string;
  appointedDate?: string;
  deceasedDate?: string;
  photoUrl?: string;
  serviceYears?: string;
  memorialSummary?: string;
  memorialExternalUrl?: string;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanDate(value: unknown): string | null {
  const text = cleanString(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/u.test(text) ? text : null;
}

function toProfile(row: MemorialProfile): MemorialProfile {
  return {
    ...row,
    photoUrl: row.photoUrl || row.linkedProfilePictureUrl || '',
  };
}

export class MemorialProfileModel {
  static cleanInput(input: Partial<MemorialProfileInput>): MemorialProfileInput {
    return {
      linkedUserId: cleanString(input.linkedUserId, 80) || null,
      firstName: cleanString(input.firstName, 100),
      lastName: cleanString(input.lastName, 100),
      rank: cleanString(input.rank, 100),
      district: cleanString(input.district, 100),
      appointedDate: cleanDate(input.appointedDate) || '',
      deceasedDate: cleanDate(input.deceasedDate) || '',
      photoUrl: cleanString(input.photoUrl, 1000),
      serviceYears: cleanString(input.serviceYears, 80),
      memorialSummary: cleanString(input.memorialSummary, 4000),
      memorialExternalUrl: cleanString(input.memorialExternalUrl, 500),
    };
  }

  static async list(searchTerm = '', limit = 24, offset = 0): Promise<MemorialProfile[]> {
    const conn = await pool.getConnection();
    try {
      const params: Array<string | number> = [];
      let whereSql = '';
      const trimmedSearch = searchTerm.trim().toLowerCase();
      if (trimmedSearch) {
        const likeTerm = `%${trimmedSearch.replace(/[%_]/gu, '\\$&')}%`;
        whereSql = `
          WHERE LOWER(CONCAT_WS(' ', m.\`firstName\`, m.\`lastName\`)) LIKE ?
            OR LOWER(COALESCE(m.\`rank\`, '')) LIKE ?
            OR LOWER(COALESCE(m.\`district\`, '')) LIKE ?
        `;
        params.push(likeTerm, likeTerm, likeTerm);
      }

      const [rows] = await conn.query(
        `
          SELECT m.*, u.\`profilePictureUrl\` AS linkedProfilePictureUrl
          FROM memorial_profiles m
          LEFT JOIN users u ON u.\`id\` = m.\`linkedUserId\`
          ${whereSql}
          ORDER BY COALESCE(m.\`deceasedDate\`, m.\`updatedAt\`) DESC, m.\`lastName\`, m.\`firstName\`
          LIMIT ? OFFSET ?
        `,
        [...params, limit, offset],
      );
      return (rows as MemorialProfile[]).map(toProfile);
    } finally {
      conn.release();
    }
  }

  static async getById(id: string): Promise<MemorialProfile | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `
          SELECT m.*, u.\`profilePictureUrl\` AS linkedProfilePictureUrl
          FROM memorial_profiles m
          LEFT JOIN users u ON u.\`id\` = m.\`linkedUserId\`
          WHERE m.\`id\` = ?
          LIMIT 1
        `,
        [id],
      );
      const profiles = rows as MemorialProfile[];
      return profiles.length > 0 ? toProfile(profiles[0]) : null;
    } finally {
      conn.release();
    }
  }

  static async create(input: MemorialProfileInput): Promise<MemorialProfile> {
    const id = input.linkedUserId ? `mem-user-${input.linkedUserId}` : uuidv4();
    await pool.query(
      `
        INSERT INTO memorial_profiles (
          \`id\`, \`linkedUserId\`, \`firstName\`, \`lastName\`, \`rank\`, \`district\`, \`appointedDate\`, \`deceasedDate\`,
          \`photoUrl\`, \`serviceYears\`, \`memorialSummary\`, \`memorialExternalUrl\`
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`firstName\` = VALUES(\`firstName\`),
          \`lastName\` = VALUES(\`lastName\`),
          \`rank\` = VALUES(\`rank\`),
          \`district\` = VALUES(\`district\`),
          \`appointedDate\` = VALUES(\`appointedDate\`),
          \`deceasedDate\` = VALUES(\`deceasedDate\`),
          \`photoUrl\` = VALUES(\`photoUrl\`),
          \`serviceYears\` = VALUES(\`serviceYears\`),
          \`memorialSummary\` = VALUES(\`memorialSummary\`),
          \`memorialExternalUrl\` = VALUES(\`memorialExternalUrl\`)
      `,
      [
        id,
        input.linkedUserId || null,
        input.firstName,
        input.lastName,
        input.rank || null,
        input.district || null,
        input.appointedDate || null,
        input.deceasedDate || null,
        input.photoUrl || null,
        input.serviceYears || null,
        input.memorialSummary || null,
        input.memorialExternalUrl || null,
      ],
    );

    if (input.linkedUserId) {
      await pool.query(
        `
          UPDATE users
          SET \`isMemorial\` = 1,
            \`endOfWatchDate\` = ?,
            \`serviceYears\` = ?,
            \`memorialSummary\` = ?,
            \`memorialExternalUrl\` = ?
          WHERE \`id\` = ?
        `,
        [input.deceasedDate || null, input.serviceYears || '', input.memorialSummary || '', input.memorialExternalUrl || '', input.linkedUserId],
      );
    }

    return (await MemorialProfileModel.getById(id)) as MemorialProfile;
  }

  static async update(id: string, input: MemorialProfileInput): Promise<MemorialProfile | null> {
    const existing = await MemorialProfileModel.getById(id);
    if (!existing) {
      return null;
    }

    await pool.query(
      `
        UPDATE memorial_profiles
        SET \`firstName\` = ?, \`lastName\` = ?, \`rank\` = ?, \`district\` = ?, \`appointedDate\` = ?, \`deceasedDate\` = ?,
          \`photoUrl\` = ?, \`serviceYears\` = ?, \`memorialSummary\` = ?, \`memorialExternalUrl\` = ?
        WHERE \`id\` = ?
      `,
      [
        input.firstName,
        input.lastName,
        input.rank || null,
        input.district || null,
        input.appointedDate || null,
        input.deceasedDate || null,
        input.photoUrl || null,
        input.serviceYears || null,
        input.memorialSummary || null,
        input.memorialExternalUrl || null,
        id,
      ],
    );

    if (existing.linkedUserId) {
      await pool.query(
        `
          UPDATE users
          SET \`isMemorial\` = 1,
            \`endOfWatchDate\` = ?,
            \`serviceYears\` = ?,
            \`memorialSummary\` = ?,
            \`memorialExternalUrl\` = ?
          WHERE \`id\` = ?
        `,
        [input.deceasedDate || null, input.serviceYears || '', input.memorialSummary || '', input.memorialExternalUrl || '', existing.linkedUserId],
      );
    }

    return MemorialProfileModel.getById(id);
  }

  static async delete(id: string): Promise<boolean> {
    const existing = await MemorialProfileModel.getById(id);
    if (!existing) {
      return false;
    }

    const [result] = await pool.query('DELETE FROM memorial_profiles WHERE `id` = ?', [id]);
    if (existing.linkedUserId) {
      await pool.query(
        `
          UPDATE users
          SET \`isMemorial\` = 0,
            \`endOfWatchDate\` = NULL,
            \`serviceYears\` = '',
            \`memorialSummary\` = '',
            \`memorialExternalUrl\` = ''
          WHERE \`id\` = ?
        `,
        [existing.linkedUserId],
      );
    }

    return (result as { affectedRows?: number }).affectedRows === 1;
  }
}
