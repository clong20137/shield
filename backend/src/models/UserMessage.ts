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
  isDeleted: boolean;
  senderDeleted: boolean;
  recipientDeleted: boolean;
  deletedAt?: Date | null;
  deletedByAccountId?: string | null;
  senderReaction?: string | null;
  recipientReaction?: string | null;
  threadId?: string | null;
  threadType?: string | null;
  threadTitle?: string | null;
  threadParticipantIds?: string | null;
  threadParticipantNames?: string | null;
  threadImageUrl?: string | null;
  groupMessageId?: string | null;
  createdAt: Date;
  senderName?: string;
  senderEmail?: string;
  senderRank?: string;
  senderProfilePictureUrl?: string;
  senderLastSeenAt?: Date | null;
  recipientName?: string;
  recipientEmail?: string;
  recipientRank?: string;
  recipientProfilePictureUrl?: string;
  recipientLastSeenAt?: Date | null;
  senderReceivesMessages?: boolean;
  recipientReceivesMessages?: boolean;
}

export interface MessageThreadInfo {
  threadId: string;
  threadType: string;
  threadTitle: string | null;
  threadParticipantIds: string[];
  threadParticipantNames: string[];
  threadImageUrl: string | null;
}

interface UserMessageRow extends RowDataPacket {
  id: string;
  senderAccountId: string;
  recipientUserId: string;
  subject: string;
  body: string;
  isRead: boolean | number;
  isArchived: boolean | number;
  isDeleted?: boolean | number;
  senderDeleted: boolean | number;
  recipientDeleted: boolean | number;
  deletedAt?: Date | null;
  deletedByAccountId?: string | null;
  senderReaction?: string | null;
  recipientReaction?: string | null;
  threadId?: string | null;
  threadType?: string | null;
  threadTitle?: string | null;
  threadParticipantIds?: string | null;
  threadParticipantNames?: string | null;
  threadImageUrl?: string | null;
  groupMessageId?: string | null;
  createdAt: Date;
  senderName?: string;
  senderEmail?: string;
  senderRank?: string;
  senderProfilePictureUrl?: string;
  senderLastSeenAt?: Date | null;
  recipientName?: string;
  recipientEmail?: string;
  recipientRank?: string;
  recipientProfilePictureUrl?: string;
  recipientLastSeenAt?: Date | null;
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
    isDeleted: Boolean(row.isDeleted),
    senderDeleted: Boolean(row.senderDeleted),
    recipientDeleted: Boolean(row.recipientDeleted),
    deletedAt: row.deletedAt || null,
    deletedByAccountId: row.deletedByAccountId || null,
    senderReaction: row.senderReaction || null,
    recipientReaction: row.recipientReaction || null,
    threadId: row.threadId || null,
    threadType: row.threadType || 'direct',
    threadTitle: row.threadTitle || null,
    threadParticipantIds: row.threadParticipantIds || null,
    threadParticipantNames: row.threadParticipantNames || null,
    threadImageUrl: row.threadImageUrl || null,
    groupMessageId: row.groupMessageId || row.id,
    createdAt: row.createdAt,
    senderName: row.senderName,
    senderEmail: row.senderEmail,
    senderRank: row.senderRank,
    senderProfilePictureUrl: row.senderProfilePictureUrl,
    senderLastSeenAt: row.senderLastSeenAt,
    recipientName: row.recipientName,
    recipientEmail: row.recipientEmail,
    recipientRank: row.recipientRank,
    recipientProfilePictureUrl: row.recipientProfilePictureUrl,
    recipientLastSeenAt: row.recipientLastSeenAt,
    senderReceivesMessages: row.senderReceivesMessages === undefined ? undefined : Boolean(row.senderReceivesMessages),
    recipientReceivesMessages: row.recipientReceivesMessages === undefined ? undefined : Boolean(row.recipientReceivesMessages),
  };
}

export class UserMessageModel {
  static async createMessage(message: Omit<UserMessage, 'id' | 'isRead' | 'isArchived' | 'isDeleted' | 'senderDeleted' | 'recipientDeleted' | 'deletedAt' | 'deletedByAccountId' | 'createdAt'>): Promise<UserMessage> {
    const conn = await pool.getConnection();
    try {
      const id = uuidv4();
      const now = new Date();

      await conn.query<ResultSetHeader>(
        `INSERT INTO user_messages (
          \`id\`, \`senderAccountId\`, \`recipientUserId\`, \`subject\`, \`body\`, \`isRead\`, \`threadId\`, \`threadType\`, \`threadTitle\`, \`threadParticipantIds\`, \`threadParticipantNames\`, \`threadImageUrl\`, \`groupMessageId\`, \`createdAt\`
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          message.senderAccountId,
          message.recipientUserId,
          message.subject,
          message.body,
          message.threadId || null,
          message.threadType || 'direct',
          message.threadTitle || null,
          message.threadParticipantIds || null,
          message.threadParticipantNames || null,
          message.threadImageUrl || null,
          message.groupMessageId || id,
          now,
        ]
      );

      return {
        ...message,
        id,
        isRead: false,
        isArchived: false,
        isDeleted: false,
        senderDeleted: false,
        recipientDeleted: false,
        deletedAt: null,
        deletedByAccountId: null,
        threadId: message.threadId || null,
        threadType: message.threadType || 'direct',
        threadTitle: message.threadTitle || null,
        threadParticipantIds: message.threadParticipantIds || null,
        threadParticipantNames: message.threadParticipantNames || null,
        threadImageUrl: message.threadImageUrl || null,
        groupMessageId: message.groupMessageId || id,
        createdAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async listMessagesForUser(recipientUserId: string, limit = 250, offset = 0): Promise<UserMessage[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<UserMessageRow[]>(
        'SELECT * FROM user_messages WHERE `recipientUserId` = ? ORDER BY `createdAt` DESC LIMIT ? OFFSET ?',
        [recipientUserId, limit, offset]
      );

      return rows.map(toUserMessage);
    } finally {
      conn.release();
    }
  }

  static async listInbox(accountId: string, limit = 250, offset = 0): Promise<UserMessage[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<UserMessageRow[]>(
        `SELECT m.*,
          COALESCE(s.displayName, CONCAT(s.firstName, ' ', s.lastName), s.email) as senderName,
          s.email as senderEmail,
          s.rank as senderRank,
          s.profilePictureUrl as senderProfilePictureUrl,
          CASE WHEN COALESCE(s.presenceHidden, 0) = 1 THEN NULL ELSE s.lastSeenAt END as senderLastSeenAt,
          s.receivesMessages as senderReceivesMessages,
          COALESCE(r.displayName, CONCAT(r.firstName, ' ', r.lastName), r.email) as recipientName,
          r.email as recipientEmail,
          r.rank as recipientRank,
          r.profilePictureUrl as recipientProfilePictureUrl,
          CASE WHEN COALESCE(r.presenceHidden, 0) = 1 THEN NULL ELSE r.lastSeenAt END as recipientLastSeenAt,
          r.receivesMessages as recipientReceivesMessages
        FROM user_messages m
        LEFT JOIN users s ON s.id = m.senderAccountId
        LEFT JOIN users r ON r.id = m.recipientUserId
        WHERE m.recipientUserId = ?
          AND m.recipientDeleted = 0
          AND m.isArchived = 0
        ORDER BY m.createdAt DESC
        LIMIT ? OFFSET ?`,
        [accountId, limit, offset]
      );

      return rows.map(toUserMessage);
    } finally {
      conn.release();
    }
  }

  static async listSent(accountId: string, limit = 250, offset = 0): Promise<UserMessage[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<UserMessageRow[]>(
        `SELECT m.*,
          COALESCE(s.displayName, CONCAT(s.firstName, ' ', s.lastName), s.email) as senderName,
          s.email as senderEmail,
          s.rank as senderRank,
          s.profilePictureUrl as senderProfilePictureUrl,
          CASE WHEN COALESCE(s.presenceHidden, 0) = 1 THEN NULL ELSE s.lastSeenAt END as senderLastSeenAt,
          s.receivesMessages as senderReceivesMessages,
          COALESCE(r.displayName, CONCAT(r.firstName, ' ', r.lastName), r.email) as recipientName,
          r.email as recipientEmail,
          r.rank as recipientRank,
          r.profilePictureUrl as recipientProfilePictureUrl,
          CASE WHEN COALESCE(r.presenceHidden, 0) = 1 THEN NULL ELSE r.lastSeenAt END as recipientLastSeenAt,
          r.receivesMessages as recipientReceivesMessages
        FROM user_messages m
        LEFT JOIN users s ON s.id = m.senderAccountId
        LEFT JOIN users r ON r.id = m.recipientUserId
        WHERE m.senderAccountId = ?
          AND m.senderDeleted = 0
        ORDER BY m.createdAt DESC
        LIMIT ? OFFSET ?`,
        [accountId, limit, offset]
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
          CASE WHEN COALESCE(s.presenceHidden, 0) = 1 THEN NULL ELSE s.lastSeenAt END as senderLastSeenAt,
          s.receivesMessages as senderReceivesMessages,
          COALESCE(r.displayName, CONCAT(r.firstName, ' ', r.lastName), r.email) as recipientName,
          r.email as recipientEmail,
          r.rank as recipientRank,
          r.profilePictureUrl as recipientProfilePictureUrl,
          CASE WHEN COALESCE(r.presenceHidden, 0) = 1 THEN NULL ELSE r.lastSeenAt END as recipientLastSeenAt,
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

  static async setReaction(messageId: string, accountId: string, reaction: string | null): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE user_messages
        SET
          \`senderReaction\` = CASE WHEN \`senderAccountId\` = ? THEN ? ELSE \`senderReaction\` END,
          \`recipientReaction\` = CASE WHEN \`recipientUserId\` = ? THEN ? ELSE \`recipientReaction\` END
        WHERE \`id\` = ? AND (\`senderAccountId\` = ? OR \`recipientUserId\` = ?)`,
        [accountId, reaction, accountId, reaction, messageId, accountId, accountId]
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
        SET \`isDeleted\` = 1,
          \`isRead\` = 1,
          \`deletedAt\` = COALESCE(\`deletedAt\`, ?),
          \`deletedByAccountId\` = COALESCE(\`deletedByAccountId\`, ?)
        WHERE \`id\` = ? AND (\`recipientUserId\` = ? OR \`senderAccountId\` = ?)`,
        [new Date(), accountId, messageId, accountId, accountId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async deleteThreadForUser(threadId: string, accountId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE user_messages
        SET
          \`recipientDeleted\` = CASE WHEN \`recipientUserId\` = ? THEN 1 ELSE \`recipientDeleted\` END,
          \`senderDeleted\` = CASE WHEN \`senderAccountId\` = ? THEN 1 ELSE \`senderDeleted\` END
        WHERE (
          (\`threadId\` = ? AND (\`recipientUserId\` = ? OR \`senderAccountId\` = ?))
          OR (
            COALESCE(\`threadType\`, 'direct') = 'direct'
            AND (
              (\`senderAccountId\` = ? AND \`recipientUserId\` = ?)
              OR (\`senderAccountId\` = ? AND \`recipientUserId\` = ?)
            )
          )
        )`,
        [accountId, accountId, threadId, accountId, accountId, accountId, threadId, threadId, accountId]
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async isThreadParticipant(threadId: string, accountId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<Array<RowDataPacket & { count: number }>>(
        `SELECT COUNT(*) as count
        FROM user_messages
        WHERE \`threadId\` = ?
          AND (\`senderAccountId\` = ? OR \`recipientUserId\` = ?)
        LIMIT 1`,
        [threadId, accountId, accountId],
      );

      return Number(rows[0]?.count || 0) > 0;
    } finally {
      conn.release();
    }
  }

  static async updateThreadImage(threadId: string, accountId: string, threadImageUrl: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE user_messages
        SET \`threadImageUrl\` = ?
        WHERE \`threadId\` = ?
          AND \`threadType\` IN ('group', 'district')
          AND EXISTS (
            SELECT 1 FROM (
              SELECT \`id\`
              FROM user_messages
              WHERE \`threadId\` = ?
                AND (\`senderAccountId\` = ? OR \`recipientUserId\` = ?)
              LIMIT 1
            ) participant
          )`,
        [threadImageUrl, threadId, threadId, accountId, accountId],
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async getThreadInfo(threadId: string, accountId: string): Promise<MessageThreadInfo | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<Array<RowDataPacket & {
        threadId: string;
        threadType: string;
        threadTitle: string | null;
        threadParticipantIds: string | null;
        threadParticipantNames: string | null;
        threadImageUrl: string | null;
      }>>(
        `SELECT \`threadId\`, \`threadType\`, \`threadTitle\`, \`threadParticipantIds\`, \`threadParticipantNames\`, \`threadImageUrl\`
        FROM user_messages
        WHERE \`threadId\` = ?
          AND \`threadType\` IN ('group', 'district')
          AND EXISTS (
            SELECT 1 FROM (
              SELECT \`id\`
              FROM user_messages
              WHERE \`threadId\` = ?
                AND (\`senderAccountId\` = ? OR \`recipientUserId\` = ?)
              LIMIT 1
            ) participant
          )
        ORDER BY \`createdAt\` DESC
        LIMIT 1`,
        [threadId, threadId, accountId, accountId],
      );

      const row = rows[0];
      if (!row) {
        return null;
      }

      const parseList = (value: string | null): string[] => {
        if (!value) {
          return [];
        }

        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
        } catch {
          return [];
        }
      };

      return {
        threadId: row.threadId,
        threadType: row.threadType || 'group',
        threadTitle: row.threadTitle || null,
        threadParticipantIds: parseList(row.threadParticipantIds),
        threadParticipantNames: parseList(row.threadParticipantNames),
        threadImageUrl: row.threadImageUrl || null,
      };
    } finally {
      conn.release();
    }
  }

  static async updateThreadTitle(threadId: string, accountId: string, threadTitle: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE user_messages
        SET \`threadTitle\` = ?
        WHERE \`threadId\` = ?
          AND \`threadType\` IN ('group', 'district')
          AND EXISTS (
            SELECT 1 FROM (
              SELECT \`id\`
              FROM user_messages
              WHERE \`threadId\` = ?
                AND (\`senderAccountId\` = ? OR \`recipientUserId\` = ?)
              LIMIT 1
            ) participant
          )`,
        [threadTitle, threadId, threadId, accountId, accountId],
      );

      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }
}
