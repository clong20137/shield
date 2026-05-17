import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { DashboardPostModel } from '../models/DashboardPost';
import { broadcastAppEvent } from '../services/appEvents';
import { cleanMultiline, cleanString, isOneOf } from '../utils/validation';

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
        authorId: account.id,
        authorName: account.displayName || account.email,
      });

      broadcastAppEvent({ type: 'dashboard-updated', entityId: post.id });
      res.status(201).json(post);
    } catch (error) {
      console.error('Dashboard post create error:', error);
      res.status(500).json({ error: 'Failed to create dashboard post' });
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
