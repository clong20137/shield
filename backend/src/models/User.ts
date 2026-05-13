import { ResultSetHeader } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  peNumber: string;
  carNumber: string;
  badgeNumber: string;
  assignedTo: string;
  district: string;
  rank: string;
  isActive: boolean;
  employmentType: string;
  typeDetails: string;
  status: string;
  supervisor: string;
  specialtyCertifications: string;
  publicSafetyId: string;
  race: string;
  sex: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UserModel {
  private static readonly editableFields = [
    'firstName',
    'lastName',
    'peNumber',
    'carNumber',
    'badgeNumber',
    'assignedTo',
    'district',
    'rank',
    'isActive',
    'employmentType',
    'typeDetails',
    'status',
    'supervisor',
    'specialtyCertifications',
    'publicSafetyId',
    'race',
    'sex',
  ] as const;

  private static readonly columnNames: Record<typeof UserModel.editableFields[number], string> = {
    firstName: '`firstName`',
    lastName: '`lastName`',
    peNumber: '`peNumber`',
    carNumber: '`carNumber`',
    badgeNumber: '`badgeNumber`',
    assignedTo: '`assignedTo`',
    district: '`district`',
    rank: '`rank`',
    isActive: '`isActive`',
    employmentType: '`employmentType`',
    typeDetails: '`typeDetails`',
    status: '`status`',
    supervisor: '`supervisor`',
    specialtyCertifications: '`specialtyCertifications`',
    publicSafetyId: '`publicSafetyId`',
    race: '`race`',
    sex: '`sex`',
  };

  static async searchUsers(
    searchTerm: string,
    filters?: Partial<User>
  ): Promise<User[]> {
    const conn = await pool.getConnection();
    try {
      let query = 'SELECT * FROM users';
      const conditions: string[] = [];
      const params: Array<string | number> = [];
      const trimmedSearchTerm = searchTerm.trim();

      if (trimmedSearchTerm) {
        conditions.push(
          '(`firstName` LIKE ? OR `lastName` LIKE ? OR `peNumber` LIKE ? OR `badgeNumber` LIKE ? OR `publicSafetyId` LIKE ?)'
        );

        const likeTerm = `%${trimmedSearchTerm}%`;
        params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
      }

      if (filters?.rank) {
        conditions.push('`rank` = ?');
        params.push(filters.rank);
      }
      if (filters?.district) {
        conditions.push('`district` = ?');
        params.push(filters.district);
      }
      if (filters?.isActive !== undefined) {
        conditions.push('`isActive` = ?');
        params.push(filters.isActive ? 1 : 0);
      }
      if (filters?.employmentType) {
        conditions.push('`employmentType` = ?');
        params.push(filters.employmentType);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY `lastName`, `firstName` LIMIT 100';

      const [rows] = await conn.query(query, params);
      return rows as User[];
    } finally {
      conn.release();
    }
  }

  static async getUserById(id: string): Promise<User | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT * FROM users WHERE `id` = ?', [id]);
      const users = rows as User[];
      return users.length > 0 ? users[0] : null;
    } finally {
      conn.release();
    }
  }

  static async getAllUsers(limit: number = 100, offset: number = 0): Promise<User[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT * FROM users ORDER BY `lastName`, `firstName` LIMIT ? OFFSET ?',
        [limit, offset]
      );
      return rows as User[];
    } finally {
      conn.release();
    }
  }

  static async createUser(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();

      await conn.query(
        `INSERT INTO users (
          \`id\`, \`firstName\`, \`lastName\`, \`peNumber\`, \`carNumber\`, \`badgeNumber\`,
          \`assignedTo\`, \`district\`, \`rank\`, \`isActive\`, \`employmentType\`, \`typeDetails\`,
          \`status\`, \`supervisor\`, \`specialtyCertifications\`, \`publicSafetyId\`,
          \`race\`, \`sex\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          user.firstName,
          user.lastName,
          user.peNumber,
          user.carNumber,
          user.badgeNumber,
          user.assignedTo,
          user.district,
          user.rank,
          user.isActive ? 1 : 0,
          user.employmentType,
          user.typeDetails,
          user.status,
          user.supervisor,
          user.specialtyCertifications,
          user.publicSafetyId,
          user.race,
          user.sex,
          now,
          now,
        ]
      );

      return { ...user, id, createdAt: now, updatedAt: now };
    } finally {
      conn.release();
    }
  }

  static async updateUser(id: string, updates: Partial<User>): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      const fields: string[] = [];
      const values: Array<string | boolean | Date | null> = [];

      Object.entries(updates).forEach(([key, value]) => {
        if (UserModel.editableFields.includes(key as typeof UserModel.editableFields[number])) {
          fields.push(`${UserModel.columnNames[key as typeof UserModel.editableFields[number]]} = ?`);
          values.push(value as string | boolean | null);
        }
      });

      if (fields.length === 0) return true;

      fields.push('`updatedAt` = ?');
      values.push(now);
      values.push(id);

      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE users SET ${fields.join(', ')} WHERE \`id\` = ?`,
        values
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async deleteUser(id: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>('DELETE FROM users WHERE `id` = ?', [id]);
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
