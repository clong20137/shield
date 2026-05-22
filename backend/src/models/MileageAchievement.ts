import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface MileageAchievement {
  id: string;
  title: string;
  mileage: number;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MileageAchievementRow extends RowDataPacket {
  id: string;
  title: string;
  mileage: number | string;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
}

function toAchievement(row: MileageAchievementRow): MileageAchievement {
  return {
    id: row.id,
    title: row.title,
    mileage: Number(row.mileage) || 0,
    icon: row.icon || 'gauge',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class MileageAchievementModel {
  static async list(): Promise<MileageAchievement[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<MileageAchievementRow[]>(
        'SELECT * FROM mileage_achievements ORDER BY `mileage` ASC, `title` ASC',
      );
      return rows.map(toAchievement);
    } finally {
      conn.release();
    }
  }

  static async create(input: { title: string; mileage: number; icon: string }): Promise<MileageAchievement> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query(
        `INSERT INTO mileage_achievements (
          \`id\`, \`title\`, \`mileage\`, \`icon\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, input.title, input.mileage, input.icon, now, now],
      );
      const created = await MileageAchievementModel.getById(id);
      if (!created) {
        throw new Error('Failed to create achievement');
      }
      return created;
    } finally {
      conn.release();
    }
  }

  static async update(id: string, input: { title: string; mileage: number; icon: string }): Promise<MileageAchievement | null> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'UPDATE mileage_achievements SET `title` = ?, `mileage` = ?, `icon` = ?, `updatedAt` = ? WHERE `id` = ?',
        [input.title, input.mileage, input.icon, new Date(), id],
      );
      if (result.affectedRows === 0) {
        return null;
      }
      return MileageAchievementModel.getById(id);
    } finally {
      conn.release();
    }
  }

  static async delete(id: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>('DELETE FROM mileage_achievements WHERE `id` = ?', [id]);
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  private static async getById(id: string): Promise<MileageAchievement | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<MileageAchievementRow[]>(
        'SELECT * FROM mileage_achievements WHERE `id` = ? LIMIT 1',
        [id],
      );
      return rows[0] ? toAchievement(rows[0]) : null;
    } finally {
      conn.release();
    }
  }
}
