import { Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { DashboardPostModel } from '../models/DashboardPost';
import { broadcastAppEvent } from '../services/appEvents';

async function isAdministrator(accountId?: string): Promise<boolean> {
  if (!accountId) {
    return false;
  }

  const account = await AuthAccountModel.getAccountById(accountId);
  if (account?.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(accountId);
  return permissions.includes('dashboard:manage');
}

export class DashboardPostController {
  static async listPosts(req: Request, res: Response) {
    try {
      const requestedLimit = Number(req.query.limit) || 10;
      const limit = Math.min(Math.max(requestedLimit, 1), 50);
      const posts = await DashboardPostModel.listPosts(limit);
      res.json(posts);
    } catch (error) {
      console.error('Dashboard posts list error:', error);
      res.status(500).json({ error: 'Failed to load dashboard posts' });
    }
  }

  static async createPost(req: Request, res: Response) {
    try {
      const { requesterId, title, body, category, authorName } = req.body as {
        requesterId?: string;
        title?: string;
        body?: string;
        category?: string;
        authorName?: string;
      };

      if (!(await isAdministrator(requesterId))) {
        return res.status(403).json({ error: 'Administrator permission required' });
      }

      if (!title?.trim() || !body?.trim()) {
        return res.status(400).json({ error: 'Title and body are required' });
      }

      const post = await DashboardPostModel.createPost({
        title,
        body,
        category: category || 'Update',
        authorId: requesterId,
        authorName,
      });

      broadcastAppEvent({ type: 'dashboard-updated', entityId: post.id });
      res.status(201).json(post);
    } catch (error) {
      console.error('Dashboard post create error:', error);
      res.status(500).json({ error: 'Failed to create dashboard post' });
    }
  }

  static async deletePost(req: Request, res: Response) {
    try {
      const requesterId = typeof req.body.requesterId === 'string' ? req.body.requesterId : undefined;

      if (!(await isAdministrator(requesterId))) {
        return res.status(403).json({ error: 'Administrator permission required' });
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
