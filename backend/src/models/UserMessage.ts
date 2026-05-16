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
  isArchived: boolean;
  senderDeleted: boolean;
  recipientDeleted: boolean;
  createdAt: Date;
  senderName?: string;
  senderEmail?: string;
  senderRank?: string;
  senderProfilePictureUrl?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientRank?: string;
  recipientProfilePictureUrl?: string;
  senderReceivesMessages?: boolean;
  recipientReceivesMessages?: boolean;
}

interface UserMessageRow extends RowDataPacket {
  id: string;
  senderAccountId: string;
  recipientUserId: string;
  subject: string;
  body: string;
  isRead: boolean | number;
  isArchived: boolean | number;
  senderDeleted: boolean | number;
  recipientDeleted: boolean | number;
  createdAt: Date;
  senderName?: string;
  senderEmail?: string;
  senderRank?: string;
  senderProfilePictureUrl?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientRank?: string;
  recipientProfilePictureUrl?: string;
  senderReceivesMessages?: boolean | number;
  recipientReceivesMessages?: boolean | number;
}

function toUserMessage(row: UserMessageRow): UserMessage {
  return {
    id: row.id,
    senderAccountId: row.senderAccountId,
    recipientUserId: row.recipientUserId,
    subject: row.subject,
    body: row.body,
    isRead: Boolean(row.isRead),
    isArchived: Boolean(row.isArchived),
    senderDeleted: Boolean(row.senderDeleted),
    recipientDeleted: Boolean(row.recipientDeleted),
    createdAt: row.createdAt,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    senderRank: row.senderRank,
    senderProfilePictureUrl: row.senderProfilePictureUrl,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
    recipientRank: row.recipientRank,
    recipientProfilePictureUrl: row.recipientProfilePictureUrl,
    senderReceivesMessages: row.senderReceivesMessages === undefined ? undefined : Boolean(row.senderReceivesMessages),
    recipientReceivesMessages: row.recipientReceivesMessages === undefined ? undefined : Boolean(row.recipientReceivesMessages),
  };
}

export class UserMessageModel {
  static async createMessage(message: Omit<UserMessage, 'id' | 'isRead' | 'isArchived' | 'senderDeleted' | 'recipientDeleted' | 'createdAt'>): Promise<UserMessage> {
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
        isArchived: false,
        senderDeleted: false,
        recipientDeleted: false,
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
          s.rank as senderRank,
          s.profilePictureUrl as senderProfilePictureUrl,
          s.receivesMessages as senderReceivesMessages,
          COALESCE(r.displayName, CONCAT(r.firstName, ' ', r.lastName), r.email) as recipientName,
          r.email as recipientEmail,
          r.rank as recipientRank,
          r.profilePictureUrl as recipientProfilePictureUrl,
          r.receivesMessages as recipientReceivesMessages
        FROM user_messages m
        LEFT JOIN users s ON s.id = m.senderAccountId
        LEFT JOIN users r ON r.id = m.recipientUserId
        WHERE m.recipientUserId = ?
          AND m.recipientDeleted = 0
          AND m.isArchived = 0
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
          s.rank as senderRank,
          s.profilePictureUrl as senderProfilePictureUrl,
          s.receivesMessages as senderReceivesMessages,
          COALESCE(r.displayName, CONCAT(r.firstName, ' ', r.lastName), r.email) as recipientName,
          r.email as recipientEmail,
          r.rank as recipientRank,
          r.profilePictureUrl as recipientProfilePictureUrl,
          r.receivesMessages as recipientReceivesMessages
        FROM user_messages m
        LEFT JOIN users s ON s.id = m.senderAccountId
        LEFT JOIN users r ON r.id = m.recipientUserId
        WHERE m.senderAccountId = ?
          AND m.senderDeleted = 0
        ORDER BY m.createdAt DESC`,
        [accountId]
      );

      return rows.map(toUserMessage);
    } finally {
      conn.release();
    }
  }

  static async getById(messageId: string): Promise<UserMessage | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<UserMessageRow[]>(
        `SELECT m.*,
          COALESCE(s.displayName, CONCAT(s.firstName, ' ', s.lastName), s.email) as senderName,
          s.email as senderEmail,
          s.rank as senderRank,
          s.profilePictureUrl as senderProfilePictureUrl,
          s.receivesMessages as senderReceivesMessages,
          COALESCE(r.displayName, CONCAT(r.firstName, ' ', r.lastName), r.email) as recipientName,
          r.email as recipientEmail,
          r.rank as recipientRank,
          r.profilePictureUrl as recipientProfilePictureUrl,
          r.receivesMessages as recipientReceivesMessages
        FROM user_messages m
        LEFT JOIN users s ON s.id = m.senderAccountId
        LEFT JOIN users r ON r.id = m.recipientUserId
        WHERE m.id = ?
        LIMIT 1`,
        [messageId]
      );

      return rows[0] ? toUserMessage(rows[0]) : null;
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

  static async archiveForRecipient(messageId: string, recipientUserId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'UPDATE user_messages SET `isArchived` = 1 WHERE `id` = ? AND `recipientUserId` = ?',
        [messageId, recipientUserId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async deleteForUser(messageId: string, accountId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE user_messages
        SET
          \`recipientDeleted\` = CASE WHEN \`recipientUserId\` = ? THEN 1 ELSE \`recipientDeleted\` END,
          \`senderDeleted\` = CASE WHEN \`senderAccountId\` = ? THEN 1 ELSE \`senderDeleted\` END
        WHERE \`id\` = ? AND (\`recipientUserId\` = ? OR \`senderAccountId\` = ?)`,
        [accountId, accountId, messageId, accountId, accountId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
