import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { AuthAccountModel } from '../models/AuthAccount';
import { DashboardPostModel } from '../models/DashboardPost';
import { UserNotificationModel } from '../models/UserNotification';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';
import { notifyMentions } from '../services/mentionService';
import { cleanMultiline, cleanString, isOneOf } from '../utils/validation';
import { parsePagination } from '../utils/pagination';

const dashboardCategories = ['Update', 'News', 'Alert'] as const;
const dashboardReactions = ['like', 'celebrate', 'important', 'thanks'] as const;

export class DashboardPostController {
  static async listPosts(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const requestedLimit = Number(req.query.limit) || 10;
      const limit = Math.min(Math.max(requestedLimit, 1), 50);
      const posts = await DashboardPostModel.listPosts(limit, account?.id);
      res.json(posts);
    } catch (error) {
      console.error('Dashboard posts list error:', error);
      res.status(500).json({ error: 'Failed to load dashboard posts' });
    }
  }

  static async createPost(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const title = cleanString(req.body?.title, 160);
      const body = cleanMultiline(req.body?.body, 5000);
      const category = cleanString(req.body?.category, 40) || 'Update';
      const allowComments = req.body?.allowComments !== false;

      if (!title || !body) {
        return res.status(400).json({ error: 'Title and body are required' });
      }

      if (!isOneOf(category, dashboardCategories)) {
        return res.status(400).json({ error: 'Choose a valid post category' });
      }

      const post = await DashboardPostModel.createPost({
        title,
        body,
        category,
        allowComments,
        authorId: account.id,
        authorName: account.displayName || account.email,
      });

      const accounts = await AuthAccountModel.listAccounts();
      await Promise.all(accounts.filter((item) => item.id !== account.id).map(async (recipient) => {
        await UserNotificationModel.create({
          userId: recipient.id,
          type: 'dashboard_post',
          title: `${category}: ${title}`,
          message: body.length > 140 ? `${body.slice(0, 137)}...` : body,
          entityType: 'dashboard_post',
          entityId: post.id,
        });
        broadcastAccountEvent(recipient.id, { type: 'notification-created', entityId: post.id });
      }));

      broadcastAppEvent({ type: 'dashboard-updated', entityId: post.id });
      res.status(201).json(post);
    } catch (error) {
      console.error('Dashboard post create error:', error);
      res.status(500).json({ error: 'Failed to create dashboard post' });
    }
  }

  static async getPost(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      const post = await DashboardPostModel.getPost(req.params.id, account?.id);

      if (!post) {
        return res.status(404).json({ error: 'Dashboard post not found' });
      }

      res.json(post);
    } catch (error) {
      console.error('Dashboard post get error:', error);
      res.status(500).json({ error: 'Failed to load dashboard post' });
    }
  }

  static async updatePost(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const title = cleanString(req.body?.title, 160);
      const body = cleanMultiline(req.body?.body, 5000);
      const category = cleanString(req.body?.category, 40) || 'Update';
      const allowComments = req.body?.allowComments !== false;

      if (!title || !body) {
        return res.status(400).json({ error: 'Title and body are required' });
      }

      if (!isOneOf(category, dashboardCategories)) {
        return res.status(400).json({ error: 'Choose a valid post category' });
      }

      const post = await DashboardPostModel.updatePost(req.params.id, {
        title,
        body,
        category,
        allowComments,
      }, account.id);

      if (!post) {
        return res.status(404).json({ error: 'Dashboard post not found' });
      }

      broadcastAppEvent({ type: 'dashboard-updated', entityId: post.id });
      res.json(post);
    } catch (error) {
      console.error('Dashboard post update error:', error);
      res.status(500).json({ error: 'Failed to update dashboard post' });
    }
  }

  static async listComments(req: Request, res: Response) {
    try {
      const pagination = parsePagination(req.query, { defaultPageSize: 200, maxPageSize: 500 });
      const comments = await DashboardPostModel.listComments(req.params.id, pagination.pageSize, pagination.offset);
      res.json(comments);
    } catch (error) {
      console.error('Dashboard post comments list error:', error);
      res.status(500).json({ error: 'Failed to load comments' });
    }
  }

  static async createComment(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const body = cleanMultiline(req.body?.body, 1200);
      if (!body) {
        return res.status(400).json({ error: 'Comment is required' });
      }

      const comment = await DashboardPostModel.createComment(
        req.params.id,
        account.id,
        account.displayName || account.email,
        body,
      );

      if (!comment) {
        return res.status(404).json({ error: 'Post not found or comments are disabled' });
      }

      const post = await DashboardPostModel.getPost(req.params.id, account.id);
      await notifyMentions(body, {
        actorId: account.id,
        actorName: account.displayName || account.email,
        entityType: 'dashboard_post',
        entityId: req.params.id,
        title: 'You were mentioned in a comment',
        message: `${account.displayName || account.email} mentioned you on "${post?.title || 'an update'}".`,
      });

      broadcastAppEvent({ type: 'dashboard-updated', entityId: req.params.id });
      res.status(201).json(comment);
    } catch (error) {
      console.error('Dashboard post comment create error:', error);
      res.status(500).json({ error: 'Failed to add comment' });
    }
  }

  static async deleteComment(req: Request, res: Response) {
    try {
      const deleted = await DashboardPostModel.deleteComment(req.params.id, req.params.commentId);
      if (!deleted) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      broadcastAppEvent({ type: 'dashboard-updated', entityId: req.params.id });
      res.json({ message: 'Comment deleted' });
    } catch (error) {
      console.error('Dashboard post comment delete error:', error);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  }

  static async flagComment(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const reason = cleanMultiline(req.body?.reason, 800);
      const comment = await DashboardPostModel.flagComment(req.params.id, req.params.commentId, account.id, reason);
      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      const post = await DashboardPostModel.getPost(req.params.id, account.id);
      const admins = (await AuthAccountModel.listAccounts()).filter((item) => item.role === 'administrator');
      await Promise.all(admins.map(async (admin) => {
        await UserNotificationModel.create({
          userId: admin.id,
          type: 'comment_flag',
          title: 'Comment flagged',
          message: `${account.displayName || account.email} flagged a comment on "${post?.title || 'an update'}".`,
          entityType: 'dashboard_post',
          entityId: req.params.id,
        });
        broadcastAccountEvent(admin.id, { type: 'notification-created', entityId: comment.id });
      }));

      broadcastAppEvent({ type: 'dashboard-updated', entityId: req.params.id });
      res.json(comment);
    } catch (error) {
      console.error('Dashboard post comment flag error:', error);
      res.status(500).json({ error: 'Failed to flag comment' });
    }
  }

  static async unflagComment(req: Request, res: Response) {
    try {
      const comment = await DashboardPostModel.unflagComment(req.params.id, req.params.commentId);
      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      broadcastAppEvent({ type: 'dashboard-updated', entityId: req.params.id });
      res.json(comment);
    } catch (error) {
      console.error('Dashboard post comment unflag error:', error);
      res.status(500).json({ error: 'Failed to unflag comment' });
    }
  }

  static async setCommentPinned(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const isPinned = req.body?.isPinned !== false;
      const comment = await DashboardPostModel.setCommentPinned(req.params.id, req.params.commentId, account.id, isPinned);
      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      broadcastAppEvent({ type: 'dashboard-updated', entityId: req.params.id });
      res.json(comment);
    } catch (error) {
      console.error('Dashboard post comment pin error:', error);
      res.status(500).json({ error: 'Failed to update pinned comment' });
    }
  }

  static async setReaction(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const reaction = req.body?.reaction === null
        ? null
        : cleanString(req.body?.reaction, 30);

      if (reaction && !isOneOf(reaction, dashboardReactions)) {
        return res.status(400).json({ error: 'Choose a valid reaction' });
      }

      const post = await DashboardPostModel.setReaction(req.params.id, account.id, reaction || null);

      if (!post) {
        return res.status(404).json({ error: 'Dashboard post not found' });
      }

      broadcastAppEvent({ type: 'dashboard-updated', entityId: post.id });
      res.json(post);
    } catch (error) {
      console.error('Dashboard post reaction error:', error);
      res.status(500).json({ error: 'Failed to update reaction' });
    }
  }

  static async deletePost(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const deleted = await DashboardPostModel.deletePost(req.params.id);

      if (!deleted) {
        return res.status(404).json({ error: 'Dashboard post not found' });
      }

      broadcastAppEvent({ type: 'dashboard-updated', entityId: req.params.id });
      res.json({ message: 'Dashboard post deleted' });
    } catch (error) {
      console.error('Dashboard post delete error:', error);
      res.status(500).json({ error: 'Failed to delete dashboard post' });
    }
  }
}
