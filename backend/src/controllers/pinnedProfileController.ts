import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { PinnedProfileModel } from '../models/PinnedProfile';
import { UserModel } from '../models/User';

export class PinnedProfileController {
  static async list(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const profiles = await PinnedProfileModel.list(account.id);
      res.json(profiles);
    } catch (error) {
      console.error('List pinned profiles error:', error);
      res.status(500).json({ error: 'Failed to load pinned profiles' });
    }
  }

  static async pin(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const profileUserId = String(req.params.userId || '').trim();
      const user = profileUserId ? await UserModel.getUserById(profileUserId) : null;
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const profile = await PinnedProfileModel.pin(account.id, profileUserId);
      res.status(201).json(profile);
    } catch (error) {
      console.error('Pin profile error:', error);
      res.status(500).json({ error: 'Failed to pin profile' });
    }
  }

  static async unpin(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      await PinnedProfileModel.unpin(account.id, String(req.params.userId || '').trim());
      res.json({ message: 'Profile unpinned' });
    } catch (error) {
      console.error('Unpin profile error:', error);
      res.status(500).json({ error: 'Failed to unpin profile' });
    }
  }
}
