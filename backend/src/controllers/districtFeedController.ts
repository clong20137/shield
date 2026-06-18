import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { AuthAccountModel } from '../models/AuthAccount';
import { DistrictFeedPostCategory, DistrictFeedPostModel } from '../models/DistrictFeedPost';
import { UserNotificationModel } from '../models/UserNotification';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';
import { cleanMultiline, cleanString, isOneOf } from '../utils/validation';

const districtFeedCategories: DistrictFeedPostCategory[] = ['Announcement', 'Update', 'News', 'Alert'];

function cleanDistrictFeedPayload(body: unknown) {
  const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  return {
    title: cleanString(payload.title, 140),
    body: cleanMultiline(payload.body, 1600),
    category: cleanString(payload.category, 40) || 'Announcement',
  };
}

function validateDistrictFeedPayload(payload: ReturnType<typeof cleanDistrictFeedPayload>, res: Response): payload is ReturnType<typeof cleanDistrictFeedPayload> & { category: DistrictFeedPostCategory } {
  if (!payload.title || !payload.body) {
    res.status(400).json({ error: 'Title and message are required' });
    return false;
  }

  if (!isOneOf(payload.category, districtFeedCategories)) {
    res.status(400).json({ error: 'Choose a valid district feed category' });
    return false;
  }

  return true;
}

export class DistrictFeedController {
  static async createPost(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const district = account.district?.trim();
      if (!district) {
        return res.status(400).json({ error: 'Your account needs an assigned district before posting to the district feed' });
      }

      const payload = cleanDistrictFeedPayload(req.body);
      if (!validateDistrictFeedPayload(payload, res)) {
        return;
      }

      const post = await DistrictFeedPostModel.create({
        district,
        category: payload.category,
        title: payload.title,
        body: payload.body,
        authorId: account.id,
        authorName: account.displayName || account.email,
      });

      const accounts = await AuthAccountModel.listAccounts();
      await Promise.all(accounts
        .filter((recipient) => recipient.id !== account.id && recipient.district === district)
        .map(async (recipient) => {
          await UserNotificationModel.create({
            userId: recipient.id,
            type: 'district_feed',
            title: `${district} ${payload.category}: ${payload.title}`,
            message: payload.body.length > 140 ? `${payload.body.slice(0, 137)}...` : payload.body,
            entityType: 'district_feed_post',
            entityId: post.id,
          });
          broadcastAccountEvent(recipient.id, { type: 'notification-created', entityId: post.id });
        }));

      broadcastAppEvent({ type: 'dashboard-updated', entityId: post.id });
      res.status(201).json(post);
    } catch (error) {
      console.error('District feed post create error:', error);
      res.status(500).json({ error: 'Failed to create district feed post' });
    }
  }

  static async updatePost(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const district = account.district?.trim();
      if (!district) {
        return res.status(400).json({ error: 'Your account needs an assigned district before editing the district feed' });
      }

      const existing = await DistrictFeedPostModel.getById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'District feed post not found' });
      }

      if (existing.district !== district) {
        return res.status(403).json({ error: 'You can only edit posts for your assigned district' });
      }

      const payload = cleanDistrictFeedPayload(req.body);
      if (!validateDistrictFeedPayload(payload, res)) {
        return;
      }

      const post = await DistrictFeedPostModel.update(req.params.id, district, {
        category: payload.category,
        title: payload.title,
        body: payload.body,
      });

      if (!post) {
        return res.status(404).json({ error: 'District feed post not found' });
      }

      broadcastAppEvent({ type: 'dashboard-updated', entityId: post.id });
      res.json(post);
    } catch (error) {
      console.error('District feed post update error:', error);
      res.status(500).json({ error: 'Failed to update district feed post' });
    }
  }

  static async deletePost(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const district = account.district?.trim();
      if (!district) {
        return res.status(400).json({ error: 'Your account needs an assigned district before deleting from the district feed' });
      }

      const existing = await DistrictFeedPostModel.getById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'District feed post not found' });
      }

      if (existing.district !== district) {
        return res.status(403).json({ error: 'You can only delete posts for your assigned district' });
      }

      const deleted = await DistrictFeedPostModel.delete(req.params.id, district);
      if (!deleted) {
        return res.status(404).json({ error: 'District feed post not found' });
      }

      broadcastAppEvent({ type: 'dashboard-updated', entityId: req.params.id });
      res.status(204).send();
    } catch (error) {
      console.error('District feed post delete error:', error);
      res.status(500).json({ error: 'Failed to delete district feed post' });
    }
  }
}
