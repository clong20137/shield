import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export type DistrictFeedPostCategory = 'Announcement' | 'Update' | 'Alert';

export interface DistrictFeedPost {
  id: string;
  district: string;
  category: DistrictFeedPostCategory;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

interface DistrictFeedPostRow extends RowDataPacket, DistrictFeedPost {}

export interface DistrictFeedPostInput {
  district: string;
  category: DistrictFeedPostCategory;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
}

export class DistrictFeedPostModel {
  static async listByDistrict(district: string, limit = 8): Promise<DistrictFeedPost[]> {
    const cleanedDistrict = district.trim();
    if (!cleanedDistrict) {
      return [];
    }

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DistrictFeedPostRow[]>(
        `SELECT *
         FROM district_feed_posts
         WHERE \`district\` = ?
         ORDER BY \`createdAt\` DESC, \`updatedAt\` DESC
         LIMIT ?`,
        [cleanedDistrict, Math.min(Math.max(limit, 1), 20)],
      );

      return rows;
    } finally {
      conn.release();
    }
  }

  static async create(input: DistrictFeedPostInput): Promise<DistrictFeedPost> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO district_feed_posts (
          \`id\`, \`district\`, \`category\`, \`title\`, \`body\`, \`authorId\`, \`authorName\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.district.trim(),
          input.category,
          input.title.trim(),
          input.body.trim(),
          input.authorId,
          input.authorName,
          now,
          now,
        ],
      );

      return {
        id,
        district: input.district.trim(),
        category: input.category,
        title: input.title.trim(),
        body: input.body.trim(),
        authorId: input.authorId,
        authorName: input.authorName,
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      conn.release();
    }
  }
}
