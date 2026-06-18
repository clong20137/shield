import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { AuthAccountModel } from '../models/AuthAccount';
import { DistrictFeedPostCategory, DistrictFeedPostModel } from '../models/DistrictFeedPost';
import { UserNotificationModel } from '../models/UserNotification';
import { broadcastAccountEvent, broadcastAppEvent } from '../services/appEvents';
import { cleanMultiline, cleanString, isOneOf } from '../utils/validation';

const districtFeedCategories: DistrictFeedPostCategory[] = ['Announcement', 'Update', 'Alert'];

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

      const title = cleanString(req.body?.title, 140);
      const body = cleanMultiline(req.body?.body, 1600);
      const category = cleanString(req.body?.category, 40) || 'Announcement';

      if (!title || !body) {
        return res.status(400).json({ error: 'Title and message are required' });
      }

      if (!isOneOf(category, districtFeedCategories)) {
        return res.status(400).json({ error: 'Choose a valid district feed category' });
      }

      const post = await DistrictFeedPostModel.create({
        district,
        category,
        title,
        body,
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
            title: `${district} ${category}: ${title}`,
            message: body.length > 140 ? `${body.slice(0, 137)}...` : body,
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
}
