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
}

interface UserMessageRow extends RowDataPacket {
  id: string;
  senderAccountId: string;
  recipientUserId: string;
  subject: string;
  body: string;
  isRead: boolean | number;
  createdAt: Date;
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
}
