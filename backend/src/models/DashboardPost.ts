import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database';

export interface DashboardPost {
  id: string;
  title: string;
  body: string;
  category: string;
  imageUrl: string | null;
  allowComments: boolean | number;
  authorId: string | null;
  authorName: string | null;
  reactions: Record<string, number>;
  myReaction?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DashboardPostRow extends RowDataPacket, DashboardPost {}
interface DashboardPostReactionCountRow extends RowDataPacket {
  postId: string;
  reaction: string;
  count: number;
}

interface DashboardPostViewerReactionRow extends RowDataPacket {
  postId: string;
  reaction: string;
}

export interface DashboardPostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string | null;
  authorEmail?: string | null;
  authorRank?: string | null;
  authorDistrict?: string | null;
  authorProfilePictureUrl?: string | null;
  body: string;
  isFlagged: boolean | number;
  flaggedBy: string | null;
  flaggedAt: Date | null;
  flagReason: string | null;
  isPinned: boolean | number;
  pinnedBy: string | null;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DashboardPostCommentRow extends RowDataPacket, DashboardPostComment {}

export interface DashboardPostInput {
  title: string;
  body: string;
  category: string;
  imageUrl?: string | null;
  allowComments?: boolean;
  authorId?: string;
  authorName?: string;
}

export class DashboardPostModel {
  private static async hydrateReactions(posts: DashboardPost[], viewerId?: string): Promise<DashboardPost[]> {
    if (posts.length === 0) {
      return posts;
    }

    const conn = await pool.getConnection();
    try {
      const postIds = posts.map((post) => post.id);
      const placeholders = postIds.map(() => '?').join(', ');
      const [reactionRows] = await conn.query<DashboardPostReactionCountRow[]>(
        `SELECT \`postId\`, \`reaction\`, COUNT(*) as count
         FROM dashboard_post_reactions
         WHERE \`postId\` IN (${placeholders})
         GROUP BY \`postId\`, \`reaction\``,
        postIds,
      );

      const reactionCounts = new Map<string, Record<string, number>>();
      reactionRows.forEach((row) => {
        const counts = reactionCounts.get(row.postId) || {};
        counts[row.reaction] = Number(row.count) || 0;
        reactionCounts.set(row.postId, counts);
      });

      const viewerReactions = new Map<string, string>();
      if (viewerId) {
        const [viewerRows] = await conn.query<DashboardPostViewerReactionRow[]>(
          `SELECT \`postId\`, \`reaction\`
           FROM dashboard_post_reactions
           WHERE \`userId\` = ? AND \`postId\` IN (${placeholders})`,
          [viewerId, ...postIds],
        );
        viewerRows.forEach((row) => viewerReactions.set(row.postId, row.reaction));
      }

      return posts.map((post) => ({
        ...post,
        allowComments: post.allowComments !== false && post.allowComments !== 0,
        reactions: reactionCounts.get(post.id) || {},
        myReaction: viewerReactions.get(post.id) || null,
      }));
    } finally {
      conn.release();
    }
  }

  static async listPosts(limit = 10, viewerId?: string): Promise<DashboardPost[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DashboardPostRow[]>(
        'SELECT * FROM dashboard_posts ORDER BY `createdAt` DESC LIMIT ?',
        [limit],
      );

      return DashboardPostModel.hydrateReactions(
        rows.map((row) => ({ ...row, reactions: {}, myReaction: null })),
        viewerId,
      );
    } finally {
      conn.release();
    }
  }

  static async getPost(id: string, viewerId?: string): Promise<DashboardPost | null> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DashboardPostRow[]>(
        'SELECT * FROM dashboard_posts WHERE `id` = ? LIMIT 1',
        [id],
      );

      if (rows.length === 0) {
        return null;
      }

      const [post] = await DashboardPostModel.hydrateReactions(
        [{ ...rows[0], reactions: {}, myReaction: null }],
        viewerId,
      );
      return post;
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
          \`id\`, \`title\`, \`body\`, \`category\`, \`imageUrl\`, \`allowComments\`, \`authorId\`, \`authorName\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.title.trim(),
          input.body.trim(),
          input.category || 'Update',
          input.imageUrl || null,
          input.allowComments === false ? 0 : 1,
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
        imageUrl: input.imageUrl || null,
        allowComments: input.allowComments !== false,
        authorId: input.authorId || null,
        authorName: input.authorName || null,
        reactions: {},
        myReaction: null,
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async updatePost(id: string, input: DashboardPostInput, viewerId?: string): Promise<DashboardPost | null> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE dashboard_posts
         SET \`title\` = ?, \`body\` = ?, \`category\` = ?, \`imageUrl\` = ?, \`allowComments\` = ?, \`updatedAt\` = ?
         WHERE \`id\` = ?`,
        [
          input.title.trim(),
          input.body.trim(),
          input.category || 'Update',
          input.imageUrl || null,
          input.allowComments === false ? 0 : 1,
          now,
          id,
        ],
      );

      if (result.affectedRows === 0) {
        return null;
      }

      return DashboardPostModel.getPost(id, viewerId);
    } finally {
      conn.release();
    }
  }

  static async deletePost(id: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      await conn.query<ResultSetHeader>('DELETE FROM dashboard_post_reactions WHERE `postId` = ?', [id]);
      await conn.query<ResultSetHeader>('DELETE FROM dashboard_post_comments WHERE `postId` = ?', [id]);
      const [result] = await conn.query<ResultSetHeader>('DELETE FROM dashboard_posts WHERE `id` = ?', [id]);
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async setReaction(postId: string, userId: string, reaction: string | null): Promise<DashboardPost | null> {
    const conn = await pool.getConnection();
    try {
      const [postRows] = await conn.query<RowDataPacket[]>(
        'SELECT `id` FROM dashboard_posts WHERE `id` = ? LIMIT 1',
        [postId],
      );

      if (postRows.length === 0) {
        return null;
      }

      if (!reaction) {
        await conn.query<ResultSetHeader>(
          'DELETE FROM dashboard_post_reactions WHERE `postId` = ? AND `userId` = ?',
          [postId, userId],
        );
      } else {
        const now = new Date();
        await conn.query<ResultSetHeader>(
          `INSERT INTO dashboard_post_reactions (
            \`id\`, \`postId\`, \`userId\`, \`reaction\`, \`createdAt\`, \`updatedAt\`
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE \`reaction\` = VALUES(\`reaction\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
          [uuidv4(), postId, userId, reaction, now, now],
        );
      }

      return DashboardPostModel.getPost(postId, userId);
    } finally {
      conn.release();
    }
  }

  static async listComments(postId: string, limit = 200, offset = 0): Promise<DashboardPostComment[]> {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query<DashboardPostCommentRow[]>(
        `SELECT c.*,
          u.\`email\` as authorEmail,
          u.\`rank\` as authorRank,
          u.\`district\` as authorDistrict,
          u.\`profilePictureUrl\` as authorProfilePictureUrl
        FROM dashboard_post_comments c
        LEFT JOIN users u ON u.\`id\` = c.\`authorId\`
        WHERE c.\`postId\` = ?
        ORDER BY c.\`isPinned\` DESC, c.\`pinnedAt\` DESC, c.\`createdAt\` ASC
        LIMIT ? OFFSET ?`,
        [postId, limit, offset],
      );

      return rows.map((row) => ({
        ...row,
        isFlagged: row.isFlagged !== false && row.isFlagged !== 0,
        isPinned: row.isPinned !== false && row.isPinned !== 0,
      }));
    } finally {
      conn.release();
    }
  }

  static async createComment(postId: string, authorId: string, authorName: string, body: string): Promise<DashboardPostComment | null> {
    const conn = await pool.getConnection();
    try {
      const [postRows] = await conn.query<RowDataPacket[]>(
        'SELECT `id`, `allowComments` FROM dashboard_posts WHERE `id` = ? LIMIT 1',
        [postId],
      );

      if (postRows.length === 0 || postRows[0].allowComments === false || postRows[0].allowComments === 0) {
        return null;
      }

      const id = uuidv4();
      const now = new Date();
      await conn.query<ResultSetHeader>(
        `INSERT INTO dashboard_post_comments (
          \`id\`, \`postId\`, \`authorId\`, \`authorName\`, \`body\`, \`createdAt\`, \`updatedAt\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, postId, authorId, authorName, body.trim(), now, now],
      );

      return {
        id,
        postId,
        authorId,
        authorName,
        authorEmail: null,
        authorRank: null,
        authorDistrict: null,
        authorProfilePictureUrl: null,
        body: body.trim(),
        isFlagged: false,
        flaggedBy: null,
        flaggedAt: null,
        flagReason: null,
        isPinned: false,
        pinnedBy: null,
        pinnedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    } finally {
      conn.release();
    }
  }

  static async deleteComment(postId: string, commentId: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(
        'DELETE FROM dashboard_post_comments WHERE `id` = ? AND `postId` = ?',
        [commentId, postId],
      );
      return result.affectedRows > 0;
    } finally {
      conn.release();
    }
  }

  static async flagComment(postId: string, commentId: string, flaggedBy: string, reason: string): Promise<DashboardPostComment | null> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE dashboard_post_comments
         SET \`isFlagged\` = 1, \`flaggedBy\` = ?, \`flaggedAt\` = ?, \`flagReason\` = ?, \`updatedAt\` = ?
         WHERE \`id\` = ? AND \`postId\` = ?`,
        [flaggedBy, now, reason.trim() || null, now, commentId, postId],
      );

      if (result.affectedRows === 0) {
        return null;
      }
    } finally {
      conn.release();
    }

    const comments = await DashboardPostModel.listComments(postId);
    return comments.find((comment) => comment.id === commentId) || null;
  }

  static async unflagComment(postId: string, commentId: string): Promise<DashboardPostComment | null> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      const [result] = await conn.query<ResultSetHeader>(
        `UPDATE dashboard_post_comments
         SET \`isFlagged\` = 0, \`flaggedBy\` = NULL, \`flaggedAt\` = NULL, \`flagReason\` = NULL, \`updatedAt\` = ?
         WHERE \`id\` = ? AND \`postId\` = ?`,
        [now, commentId, postId],
      );

      if (result.affectedRows === 0) {
        return null;
      }
    } finally {
      conn.release();
    }

    const comments = await DashboardPostModel.listComments(postId);
    return comments.find((comment) => comment.id === commentId) || null;
  }

  static async setCommentPinned(postId: string, commentId: string, pinnedBy: string, isPinned: boolean): Promise<DashboardPostComment | null> {
    const conn = await pool.getConnection();
    try {
      const now = new Date();
      await conn.beginTransaction();

      const [commentRows] = await conn.query<RowDataPacket[]>(
        'SELECT `id` FROM dashboard_post_comments WHERE `id` = ? AND `postId` = ? LIMIT 1',
        [commentId, postId],
      );

      if (commentRows.length === 0) {
        await conn.rollback();
        return null;
      }

      if (isPinned) {
        await conn.query<ResultSetHeader>(
          `UPDATE dashboard_post_comments
           SET \`isPinned\` = 0, \`pinnedBy\` = NULL, \`pinnedAt\` = NULL, \`updatedAt\` = ?
           WHERE \`postId\` = ?`,
          [now, postId],
        );
      }

      await conn.query<ResultSetHeader>(
        `UPDATE dashboard_post_comments
         SET \`isPinned\` = ?, \`pinnedBy\` = ?, \`pinnedAt\` = ?, \`updatedAt\` = ?
         WHERE \`id\` = ? AND \`postId\` = ?`,
        [isPinned ? 1 : 0, isPinned ? pinnedBy : null, isPinned ? now : null, now, commentId, postId],
      );

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }

    const comments = await DashboardPostModel.listComments(postId);
    return comments.find((comment) => comment.id === commentId) || null;
  }
}
