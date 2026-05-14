import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface UserMessage {
  id: string;
  senderAccountId: string;
  recipientUserId: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  senderName?: string;
  senderEmail?: string;
  recipientName?: string;
  recipientEmail?: string;
}

interface UserMessageRow extends RowDataPacket {
  id: string;
  senderAccountId: string;
  recipientUserId: string;
  subject: string;
  body: string;
  isRead: boolean | number;
  createdAt: Date;
  senderName?: string;
  senderEmail?: string;
  recipientName?: string;
  recipientEmail?: string;
}

function toUserMessage(row: UserMessageRow): UserMessage {
  return {
    id: row.id,
    senderAccountId: row.senderAccountId,
    recipientUserId: row.recipientUserId,
    subject: row.subject,
    body: row.body,
    isRead: Boolean(row.isRead),
    createdAt: row.createdAt,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
  };
}

export class UserMessageModel {
  static async createMessage(message: Omit<UserMessage, 'id' | 'isRead' | 'createdAt'>): Promise<UserMessage> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();

      await conn.query<ResultSetHeader>(
        `INSERT INTO user_messages (
          \`id\`, \`senderAccountId\`, \`recipientUserId\`, \`subject\`, \`body\`, \`isRead\`, \`createdAt\`
        ) VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [id, message.senderAccountId, message.recipientUserId, message.subject, message.body, now]
      );

      return {
        ...message,
        id,
        isRead: false,
        createdAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async listMessagesForUser(recipientUserId: string): Promise<UserMessage[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<UserMessageRow[]>(
        'SELECT * FROM user_messages WHERE `recipientUserId` = ? ORDER BY `createdAt` DESC',
        [recipientUserId]
      );

      return rows.map(toUserMessage);
    } finally {
      conn.release();
    }
  }

  static async listInbox(accountId: string): Promise<UserMessage[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<UserMessageRow[]>(
        `SELECT m.*,
          COALESCE(s.displayName, CONCAT(s.firstName, ' ', s.lastName), s.email) as senderName,
          s.email as senderEmail,
          COALESCE(r.displayName, CONCAT(r.firstName, ' ', r.lastName), r.email) as recipientName,
          r.email as recipientEmail
        FROM user_messages m
        LEFT JOIN users s ON s.id = m.senderAccountId
        LEFT JOIN users r ON r.id = m.recipientUserId
        WHERE m.recipientUserId = ?
        ORDER BY m.createdAt DESC`,
        [accountId]
      );

      return rows.map(toUserMessage);
    } finally {
      conn.release();
    }
  }

  static async listSent(accountId: string): Promise<UserMessage[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<UserMessageRow[]>(
        `SELECT m.*,
          COALESCE(s.displayName, CONCAT(s.firstName, ' ', s.lastName), s.email) as senderName,
          s.email as senderEmail,
          COALESCE(r.displayName, CONCAT(r.firstName, ' ', r.lastName), r.email) as recipientName,
          r.email as recipientEmail
        FROM user_messages m
        LEFT JOIN users s ON s.id = m.senderAccountId
        LEFT JOIN users r ON r.id = m.recipientUserId
        WHERE m.senderAccountId = ?
        ORDER BY m.createdAt DESC`,
        [accountId]
      );

      return rows.map(toUserMessage);
    } finally {
      conn.release();
    }
  }

  static async markRead(messageId: string, recipientUserId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'UPDATE user_messages SET `isRead` = 1 WHERE `id` = ? AND `recipientUserId` = ?',
        [messageId, recipientUserId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
