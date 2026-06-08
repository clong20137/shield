import { Request, Response } from 'express';
import { CalendarEntryModel } from '../models/CalendarEntry';
import { AuthAccountModel } from '../models/AuthAccount';
import { MileageAchievementModel } from '../models/MileageAchievement';
import { SystemSettingModel } from '../models/SystemSetting';
import { getSessionAccount } from '../middleware/authSession';
import { broadcastAppEvent } from '../services/appEvents';
import { cleanString } from '../utils/validation';

const MILEAGE_SETTING = 'mileageMilestone';
const achievementTypes = new Set(['mileage', 'training', 'service', 'certification', 'custom']);

function cleanAchievementPayload(body: Record<string, unknown>) {
  const title = cleanString(body?.title, 120);
  const icon = cleanString(body?.icon, 50) || 'award';
  const requestedType = cleanString(body?.achievementType, 50) || 'mileage';
  const achievementType = achievementTypes.has(requestedType) ? requestedType : 'custom';
  const rawTarget = body?.targetValue ?? body?.mileage;
  const targetValue = Number(rawTarget);
  const mileage = achievementType === 'mileage' ? targetValue : Number(body?.mileage) || targetValue;
  const targetLabel = cleanString(body?.targetLabel, 80) || (achievementType === 'mileage' ? 'miles' : '');
  const description = cleanString(body?.description, 500);

  return { title, icon, achievementType, targetValue, mileage, targetLabel, description };
}

export class MileageController {
  static async getSummaryForAccount(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const accountId = cleanString(req.params.accountId || account.id, 36);
      const canViewOthers = account.role === 'administrator' || (await AuthAccountModel.getPermissionsForAccount(account.id)).includes('users:view');
      if (accountId !== account.id && !canViewOthers) {
        return res.status(403).json({ error: 'User profile permission required' });
      }

      const mileage = await CalendarEntryModel.getMileageTotal(accountId);
      const achievements = await MileageAchievementModel.list();
      const fallbackMilestone = await SystemSettingModel.getNumber(MILEAGE_SETTING, 1000);
      const nextAchievement = achievements.find((achievement) => achievement.mileage >= mileage) || achievements[achievements.length - 1] || null;
      const milestone = nextAchievement?.mileage || fallbackMilestone;

      res.json({ mileage, milestone, achievements, nextAchievement });
    } catch (error) {
      console.error('Mileage summary error:', error);
      res.status(500).json({ error: 'Failed to load mileage summary' });
    }
  }

  static async getSummary(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      req.params.accountId = account.id;
      return MileageController.getSummaryForAccount(req, res);
    } catch (error) {
      console.error('Mileage summary error:', error);
      res.status(500).json({ error: 'Failed to load mileage summary' });
    }
  }

  static async updateMilestone(req: Request, res: Response) {
    try {
      const { milestone } = req.body as { milestone?: number };
      const value = Number(milestone);

      if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ error: 'Mileage milestone must be greater than zero' });
      }

      const saved = await SystemSettingModel.setNumber(MILEAGE_SETTING, value);
      broadcastAppEvent({ type: 'mileage-updated' });
      res.json({ milestone: saved });
    } catch (error) {
      console.error('Mileage milestone error:', error);
      res.status(500).json({ error: 'Failed to save mileage milestone' });
    }
  }

  static async listAchievements(req: Request, res: Response) {
    try {
      res.json(await MileageAchievementModel.list());
    } catch (error) {
      console.error('Mileage achievements list error:', error);
      res.status(500).json({ error: 'Failed to load achievements' });
    }
  }

  static async createAchievement(req: Request, res: Response) {
    try {
      const payload = cleanAchievementPayload(req.body);

      if (!payload.title) {
        return res.status(400).json({ error: 'Achievement title is required' });
      }

      if (!Number.isFinite(payload.targetValue) || payload.targetValue <= 0) {
        return res.status(400).json({ error: 'Achievement target must be greater than zero' });
      }

      const achievement = await MileageAchievementModel.create(payload);
      broadcastAppEvent({ type: 'mileage-updated' });
      res.status(201).json(achievement);
    } catch (error) {
      console.error('Mileage achievement create error:', error);
      res.status(500).json({ error: 'Failed to create achievement' });
    }
  }

  static async updateAchievement(req: Request, res: Response) {
    try {
      const payload = cleanAchievementPayload(req.body);

      if (!payload.title) {
        return res.status(400).json({ error: 'Achievement title is required' });
      }

      if (!Number.isFinite(payload.targetValue) || payload.targetValue <= 0) {
        return res.status(400).json({ error: 'Achievement target must be greater than zero' });
      }

      const achievement = await MileageAchievementModel.update(req.params.id, payload);
      if (!achievement) {
        return res.status(404).json({ error: 'Achievement not found' });
      }

      broadcastAppEvent({ type: 'mileage-updated' });
      res.json(achievement);
    } catch (error) {
      console.error('Mileage achievement update error:', error);
      res.status(500).json({ error: 'Failed to update achievement' });
    }
  }

  static async deleteAchievement(req: Request, res: Response) {
    try {
      const deleted = await MileageAchievementModel.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Achievement not found' });
      }

      broadcastAppEvent({ type: 'mileage-updated' });
      res.json({ message: 'Achievement deleted' });
    } catch (error) {
      console.error('Mileage achievement delete error:', error);
      res.status(500).json({ error: 'Failed to delete achievement' });
    }
  }
}
