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
  static async searchUsers(
    searchTerm: string,
    filters?: Partial<User>
  ): Promise<User[]> {
    const conn = await pool.getConnection();
    try {
      let query = `
        SELECT * FROM users 
        WHERE firstName LIKE ? 
        OR lastName LIKE ? 
        OR peNumber LIKE ? 
        OR badgeNumber LIKE ? 
        OR publicSafetyId LIKE ?
      `;
      
      const params = [
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
        `%${searchTerm}%`,
      ];

      // Add filter conditions
      if (filters?.rank) {
        query += ` AND rank = ?`;
        params.push(filters.rank);
      }
      if (filters?.district) {
        query += ` AND district = ?`;
        params.push(filters.district);
      }
      if (filters?.isActive !== undefined) {
        query += ` AND isActive = ?`;
        params.push(filters.isActive ? 1 : 0);
      }
      if (filters?.employmentType) {
        query += ` AND employmentType = ?`;
        params.push(filters.employmentType);
      }

      query += ` ORDER BY lastName, firstName LIMIT 100`;

      const [rows] = await conn.query(query, params);
      return rows as User[];
    } finally {
      conn.release();
    }
  }

  static async getUserById(id: string): Promise<User | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT * FROM users WHERE id = ?', [id]);
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
        'SELECT * FROM users ORDER BY lastName, firstName LIMIT ? OFFSET ?',
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
      const id = require('uuid').v4();
      const now = new Date();

      await conn.query(
        `INSERT INTO users (
          id, firstName, lastName, peNumber, carNumber, badgeNumber,
          assignedTo, district, rank, isActive, employmentType, typeDetails,
          status, supervisor, specialtyCertifications, publicSafetyId,
          race, sex, createdAt, updatedAt
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
      const values: any[] = [];

      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'createdAt') {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (fields.length === 0) return true;

      fields.push('updatedAt = ?');
      values.push(now);
      values.push(id);

      const [result] = await conn.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      return (result as any).affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async deleteUser(id: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query('DELETE FROM users WHERE id = ?', [id]);
      return (result as any).affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
