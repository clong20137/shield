import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface UserNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: Date;
}

interface UserNotificationRow extends RowDataPacket {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean | number;
  createdAt: Date;
}

function toNotification(row: UserNotificationRow): UserNotification {
  return {
    ...row,
    isRead: Boolean(row.isRead),
  };
}

export class UserNotificationModel {
  static async create(input: Omit<UserNotification, 'id' | 'isRead' | 'createdAt'>): Promise<UserNotification> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO user_notifications (
          \`id\`, \`userId\`, \`type\`, \`title\`, \`message\`, \`entityType\`, \`entityId\`, \`isRead\`, \`createdAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [id, input.userId, input.type, input.title, input.message, input.entityType, input.entityId, now]
      );

      return { ...input, id, isRead: false, createdAt: now };
    } finally {
      conn.release();
    }
  }

  static async listForUser(userId: string): Promise<UserNotification[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<UserNotificationRow[]>(
        'SELECT * FROM user_notifications WHERE `userId` = ? ORDER BY `createdAt` DESC LIMIT 50',
        [userId]
      );

      return rows.map(toNotification);
    } finally {
      conn.release();
    }
  }

  static async markRead(id: string, userId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'UPDATE user_notifications SET `isRead` = 1 WHERE `id` = ? AND `userId` = ?',
        [id, userId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async clearForUser(userId: string): Promise<number> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM user_notifications WHERE `userId` = ?',
        [userId]
      );

      return result.affectedRows;
    } finally {
      conn.release();
    }
  }
}
