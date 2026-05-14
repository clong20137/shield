import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface DashboardPost {
  id: string;
  title: string;
  body: string;
  category: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DashboardPostRow extends RowDataPacket, DashboardPost {}

export interface DashboardPostInput {
  title: string;
  body: string;
  category: string;
  authorId?: string;
  authorName?: string;
}

export class DashboardPostModel {
  static async listPosts(limit = 10): Promise<DashboardPost[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DashboardPostRow[]>(
        'SELECT * FROM dashboard_posts ORDER BY `createdAt` DESC LIMIT ?',
        [limit],
      );

      return rows;
    } finally {
      conn.release();
    }
  }

  static async createPost(input: DashboardPostInput): Promise<DashboardPost> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();

      await conn.query<ResultSetHeader>(
        `INSERT INTO dashboard_posts (
          \`id\`, \`title\`, \`body\`, \`category\`, \`authorId\`, \`authorName\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.title.trim(),
          input.body.trim(),
          input.category || 'Update',
          input.authorId || null,
          input.authorName || null,
          now,
          now,
        ],
      );

      return {
        id,
        title: input.title.trim(),
        body: input.body.trim(),
        category: input.category || 'Update',
        authorId: input.authorId || null,
        authorName: input.authorName || null,
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async deletePost(id: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>('DELETE FROM dashboard_posts WHERE `id` = ?', [id]);
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
