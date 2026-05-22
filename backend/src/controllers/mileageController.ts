import { Request, Response } from 'express';
import { CalendarEntryModel } from '../models/CalendarEntry';
import { AuthAccountModel } from '../models/AuthAccount';
import { SystemSettingModel } from '../models/SystemSetting';
import { getSessionAccount } from '../middleware/authSession';
import { broadcastAppEvent } from '../services/appEvents';
import { cleanString } from '../utils/validation';

const MILEAGE_SETTING = 'mileageMilestone';

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
      const milestone = await SystemSettingModel.getNumber(MILEAGE_SETTING, 1000);

      res.json({ mileage, milestone });
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
}
