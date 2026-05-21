import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';
import { createPasswordHash } from './AuthAccount';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl: string;
  peNumber: string;
  peopleSoftId: string;
  carNumber: string;
  badgeNumber: string;
  radioNumber: string;
  personalPhoneNumber: string;
  departmentPhoneNumber: string;
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
  maritalStatus: string;
  residentialAddress: string;
  mailingAddress: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  role: string;
  receivesMessages: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt'> & {
  password?: string;
};

export class UserModel {
  private static readonly editableFields = [
    'firstName',
    'lastName',
    'email',
    'profilePictureUrl',
    'peNumber',
    'peopleSoftId',
    'carNumber',
    'badgeNumber',
    'radioNumber',
    'personalPhoneNumber',
    'departmentPhoneNumber',
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
    'maritalStatus',
    'residentialAddress',
    'mailingAddress',
    'emergencyContactName',
    'emergencyContactRelationship',
    'emergencyContactPhone',
    'receivesMessages',
  ] as const;

  private static readonly columnNames: Record<typeof UserModel.editableFields[number], string> = {
    firstName: '`firstName`',
    lastName: '`lastName`',
    email: '`email`',
    profilePictureUrl: '`profilePictureUrl`',
    peNumber: '`peNumber`',
    peopleSoftId: '`peopleSoftId`',
    carNumber: '`carNumber`',
    badgeNumber: '`badgeNumber`',
    radioNumber: '`radioNumber`',
    personalPhoneNumber: '`personalPhoneNumber`',
    departmentPhoneNumber: '`departmentPhoneNumber`',
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
    maritalStatus: '`maritalStatus`',
    residentialAddress: '`residentialAddress`',
    mailingAddress: '`mailingAddress`',
    emergencyContactName: '`emergencyContactName`',
    emergencyContactRelationship: '`emergencyContactRelationship`',
    emergencyContactPhone: '`emergencyContactPhone`',
    receivesMessages: '`receivesMessages`',
  };

  private static blankToNull(value: string): string | null {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : null;
  }

  private static normalizeUpdateValue(key: string, value: unknown): string | boolean | Date | null {
    if (['email', 'peNumber', 'badgeNumber', 'publicSafetyId'].includes(key)) {
      return typeof value === 'string' ? UserModel.blankToNull(value) : null;
    }

    if (key === 'isActive' || key === 'receivesMessages') {
      return value === false ? false : true;
    }

    return value as string | boolean | Date | null;
  }

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
          `(
            LOWER(COALESCE(\`firstName\`, '')) LIKE ? OR LOWER(COALESCE(\`lastName\`, '')) LIKE ? OR LOWER(CONCAT_WS(' ', \`firstName\`, \`lastName\`)) LIKE ?
            OR LOWER(COALESCE(\`email\`, '')) LIKE ? OR LOWER(COALESCE(\`peNumber\`, '')) LIKE ? OR LOWER(COALESCE(\`peopleSoftId\`, '')) LIKE ?
            OR LOWER(COALESCE(\`badgeNumber\`, '')) LIKE ? OR LOWER(COALESCE(\`radioNumber\`, '')) LIKE ? OR LOWER(COALESCE(\`publicSafetyId\`, '')) LIKE ?
            OR LOWER(COALESCE(\`district\`, '')) LIKE ? OR LOWER(COALESCE(\`employmentType\`, '')) LIKE ? OR LOWER(COALESCE(\`status\`, '')) LIKE ?
            OR LOWER(COALESCE(\`supervisor\`, '')) LIKE ? OR LOWER(COALESCE(\`personalPhoneNumber\`, '')) LIKE ? OR LOWER(COALESCE(\`departmentPhoneNumber\`, '')) LIKE ?
          )`
        );

        const likeTerm = `%${trimmedSearchTerm.toLowerCase()}%`;
        params.push(
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm,
          likeTerm
        );
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
      if (filters?.status) {
        conditions.push('`status` = ?');
        params.push(filters.status);
      }
      if (filters?.sex) {
        conditions.push('`sex` = ?');
        params.push(filters.sex);
      }
      if (filters?.supervisor) {
        conditions.push('`supervisor` LIKE ?');
        params.push(`%${filters.supervisor}%`);
      }
      if (filters?.badgeNumber) {
        conditions.push('`badgeNumber` LIKE ?');
        params.push(`%${filters.badgeNumber}%`);
      }
      if (filters?.radioNumber) {
        conditions.push('`radioNumber` LIKE ?');
        params.push(`%${filters.radioNumber}%`);
      }
      if (filters?.peNumber) {
        conditions.push('`peNumber` LIKE ?');
        params.push(`%${filters.peNumber}%`);
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

  static async createUser(user: CreateUserInput): Promise<User> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();

      await conn.query(
        `INSERT INTO users (
          \`id\`, \`firstName\`, \`lastName\`, \`email\`, \`profilePictureUrl\`, \`displayName\`, \`passwordHash\`, \`role\`, \`peNumber\`, \`peopleSoftId\`, \`carNumber\`, \`badgeNumber\`,
          \`radioNumber\`, \`personalPhoneNumber\`, \`departmentPhoneNumber\`, \`assignedTo\`, \`district\`, \`rank\`,
          \`isActive\`, \`employmentType\`, \`typeDetails\`, \`status\`, \`supervisor\`, \`specialtyCertifications\`,
          \`publicSafetyId\`, \`race\`, \`sex\`, \`maritalStatus\`, \`residentialAddress\`, \`mailingAddress\`,
          \`emergencyContactName\`, \`emergencyContactRelationship\`, \`emergencyContactPhone\`,
          \`receivesMessages\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          user.firstName,
          user.lastName,
          UserModel.blankToNull(user.email),
          user.profilePictureUrl,
          `${user.firstName} ${user.lastName}`.trim(),
          user.password ? createPasswordHash(user.password) : null,
          user.role || 'user',
          UserModel.blankToNull(user.peNumber),
          user.peopleSoftId,
          user.carNumber,
          UserModel.blankToNull(user.badgeNumber),
          user.radioNumber,
          user.personalPhoneNumber,
          user.departmentPhoneNumber,
          user.assignedTo,
          user.district,
          user.rank,
          user.isActive ? 1 : 0,
          user.employmentType,
          user.typeDetails,
          user.status,
          user.supervisor,
          user.specialtyCertifications,
          UserModel.blankToNull(user.publicSafetyId),
          user.race,
          user.sex,
          user.maritalStatus,
          user.residentialAddress,
          user.mailingAddress,
          user.emergencyContactName,
          user.emergencyContactRelationship,
          user.emergencyContactPhone,
          user.receivesMessages === false ? 0 : 1,
          now,
          now,
        ]
      );

      return { ...user, role: user.role || 'user', id, createdAt: now, updatedAt: now };
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
          values.push(UserModel.normalizeUpdateValue(key, value));
        }
      });

      if (typeof updates.firstName === 'string' || typeof updates.lastName === 'string') {
        const [rows] = await conn.query<Array<RowDataPacket & { firstName: string; lastName: string }>>(
          'SELECT `firstName`, `lastName` FROM users WHERE `id` = ? LIMIT 1',
          [id]
        );
        const currentUser = rows[0];
        if (currentUser) {
          const firstName = typeof updates.firstName === 'string' ? updates.firstName : currentUser.firstName;
          const lastName = typeof updates.lastName === 'string' ? updates.lastName : currentUser.lastName;
          fields.push('`displayName` = ?');
          values.push(`${firstName} ${lastName}`.trim());
        }
      }

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
