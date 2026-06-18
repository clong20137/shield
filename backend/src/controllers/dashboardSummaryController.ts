import { Request, Response } from 'express';
import { getSessionAccount } from '../middleware/authSession';
import { AuthAccountModel } from '../models/AuthAccount';
import { CalendarEntryModel } from '../models/CalendarEntry';
import { DistrictFeedPostModel } from '../models/DistrictFeedPost';
import { DashboardPostModel } from '../models/DashboardPost';
import { PinnedProfileModel } from '../models/PinnedProfile';
import { QuickNoteModel } from '../models/QuickNote';
import { ReminderModel } from '../models/Reminder';
import { broadcastAccountEvent } from '../services/appEvents';

async function canViewHiddenUsers(account: { id: string; role: string }): Promise<boolean> {
  if (account.role === 'administrator') {
    return true;
  }

  const permissions = await AuthAccountModel.getPermissionsForAccount(account.id);
  return permissions.includes('users:view-hidden');
}

export class DashboardSummaryController {
  static async getSummary(req: Request, res: Response) {
    try {
      const account = await getSessionAccount(req);
      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      const dueCount = await ReminderModel.createDueNotifications(account.id);
      if (dueCount > 0) {
        broadcastAccountEvent(account.id, { type: 'notification-created' });
        broadcastAccountEvent(account.id, { type: 'reminder-updated' });
      }

      const includeHiddenProfiles = await canViewHiddenUsers(account);
      const [calendarEntries, reminders, pinnedProfiles, posts, quickNote, districtFeed, districtFeedPosts] = await Promise.all([
        CalendarEntryModel.listEntries(account.id, 1000, 0),
        ReminderModel.list(account.id),
        PinnedProfileModel.list(account.id, includeHiddenProfiles),
        DashboardPostModel.listPosts(8, account.id),
        QuickNoteModel.get(account.id),
        CalendarEntryModel.listDistrictFeed(account.district || '', 8),
        DistrictFeedPostModel.listByDistrict(account.district || '', 8),
      ]);

      res.json({
        calendarEntries,
        reminders,
        pinnedProfiles,
        posts,
        quickNote,
        districtFeed,
        districtFeedPosts,
        dueReminderNotificationsCreated: dueCount,
      });
    } catch (error) {
      console.error('Dashboard summary error:', error);
      res.status(500).json({ error: 'Failed to load dashboard summary' });
    }
  }
}
