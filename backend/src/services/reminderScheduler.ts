import { ReminderModel } from '../models/Reminder';
import { broadcastAccountEvent } from './appEvents';

let reminderScheduler: NodeJS.Timeout | null = null;
let isCheckingReminders = false;

export function startReminderNotificationScheduler() {
  if (reminderScheduler) {
    return;
  }

  const checkDueReminders = async () => {
    if (isCheckingReminders) {
      return;
    }

    isCheckingReminders = true;
    try {
      const notifications = await ReminderModel.createDueNotificationsForAll();
      for (const notification of notifications) {
        broadcastAccountEvent(notification.accountId, { type: 'notification-created', entityId: notification.reminderId });
        broadcastAccountEvent(notification.accountId, { type: 'reminder-updated', entityId: notification.reminderId });
      }
    } catch (error) {
      console.error('Reminder scheduler error:', error);
    } finally {
      isCheckingReminders = false;
    }
  };

  void checkDueReminders();
  reminderScheduler = setInterval(checkDueReminders, 60 * 1000);
}
