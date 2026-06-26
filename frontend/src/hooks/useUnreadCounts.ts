import { useEffect, useMemo } from 'react';
import type { ToastMessage } from '../components/ToastHost';
import type { UserNotification } from '../services/api';

function hasDesktopFeature<K extends keyof NonNullable<Window['shieldDesktop']>>(feature: K): boolean {
  return typeof window !== 'undefined' &&
    window.shieldDesktop?.shell === 'electron' &&
    typeof window.shieldDesktop?.[feature] === 'function';
}

export function useUnreadCounts({
  messageUnreadCount,
  userNotifications,
  recentNotifications,
  openBugCount,
  isAdministrator,
}: {
  messageUnreadCount: number;
  userNotifications: UserNotification[];
  recentNotifications: ToastMessage[];
  openBugCount: number;
  isAdministrator: boolean;
}) {
  const counts = useMemo(() => {
    const unreadUserNotifications = userNotifications.filter((notification) => !notification.isRead);
    const unreadNotificationCount = unreadUserNotifications.length;
    const recentNotificationCount = recentNotifications.length;
    const totalNotificationCount = recentNotificationCount + unreadNotificationCount + (isAdministrator ? openBugCount : 0);
    const desktopBadgeCount = messageUnreadCount + unreadNotificationCount + (isAdministrator ? openBugCount : 0);
    const hasNotificationCenterItems = totalNotificationCount > 0 || userNotifications.length > 0;

    return {
      unreadNotificationCount,
      unreadUserNotifications,
      recentNotificationCount,
      totalNotificationCount,
      desktopBadgeCount,
      hasNotificationCenterItems,
    };
  }, [isAdministrator, messageUnreadCount, openBugCount, recentNotifications.length, userNotifications]);

  useEffect(() => {
    if (!hasDesktopFeature('setUnreadCount')) {
      return;
    }

    window.shieldDesktop?.setUnreadCount?.(counts.desktopBadgeCount).catch((error) => {
      console.error('Failed to update desktop badge:', error);
    });

    if (counts.desktopBadgeCount === 0 && hasDesktopFeature('clearAttention')) {
      window.shieldDesktop?.clearAttention?.().catch((error) => {
        console.error('Failed to clear desktop attention state:', error);
      });
    }
  }, [counts.desktopBadgeCount]);

  return counts;
}
