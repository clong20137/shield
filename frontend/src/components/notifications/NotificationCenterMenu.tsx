import { ReactNode, RefObject, useState } from 'react';
import { Bell, Bug } from 'lucide-react';
import type { ToastMessage } from '../ToastHost';
import type { UserNotification } from '../../services/api';

function getPlainNotificationMessage(value: string): string {
  return value.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim();
}

function IconButtonTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="app-icon-tooltip-host">
      {children}
      <span className="app-icon-tooltip" role="tooltip">{label}</span>
    </span>
  );
}

interface NotificationCenterMenuProps {
  menuRef: RefObject<HTMLDivElement>;
  isOpen: boolean;
  isAdministrator: boolean;
  hasItems: boolean;
  totalCount: number;
  unreadCount: number;
  bugCount: number;
  recentCount: number;
  unreadNotifications: UserNotification[];
  recentNotifications: ToastMessage[];
  onToggle: () => void;
  onClearAll: () => void;
  onOpenBugTracker: () => void;
  onOpenNotification: (notification: UserNotification) => void;
}

export function NotificationCenterMenu({
  menuRef,
  isOpen,
  isAdministrator,
  hasItems,
  totalCount,
  unreadCount,
  bugCount,
  recentCount,
  unreadNotifications,
  recentNotifications,
  onToggle,
  onClearAll,
  onOpenBugTracker,
  onOpenNotification,
}: NotificationCenterMenuProps) {
  const [activeTab, setActiveTab] = useState<'unread' | 'bugs' | 'recent'>('unread');
  const totalNotificationCount = totalCount;
  const hasNotificationCenterItems = hasItems;
  const unreadNotificationCount = unreadCount;
  const openBugCount = bugCount;
  const recentNotificationCount = recentCount;
  const unreadUserNotifications = unreadNotifications;
  const notifications = recentNotifications;
  const isNotificationsOpen = isOpen;
  const notificationCenterTab = activeTab;
  const setNotificationCenterTab = setActiveTab;
  const clearAllNotifications = onClearAll;
  const openBugTrackerFromNotification = onOpenBugTracker;
  const openNotification = onOpenNotification;

  return (
                <div ref={menuRef} className="relative">
                  <IconButtonTooltip label="Notifications">
                    <button
                      data-onboarding-control="notifications"
                      type="button"
                      onClick={onToggle}
                      className="header-action-button relative flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                      aria-label="Open notifications"
                    >
                      <Bell size={18} />
                      {totalNotificationCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
                          {totalNotificationCount > 9 ? '9+' : totalNotificationCount}
                        </span>
                      )}
                    </button>
                  </IconButtonTooltip>

                  <div
                    className={`theme-polished-surface absolute right-0 top-12 z-40 w-[calc(100vw-2rem)] max-w-[26rem] origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.2)] transition duration-200 ease-out dark:border-gray-700 dark:bg-gray-900 sm:w-[26rem] ${
                      isNotificationsOpen ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
                    }`}
                    aria-hidden={!isNotificationsOpen}
                  >
                      <div className="border-b border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-700 dark:bg-gray-950">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-base font-bold text-primary-500 dark:text-gray-100">Notification Center</p>
                          </div>
                          {hasNotificationCenterItems && (
                            <button
                              type="button"
                              onClick={clearAllNotifications}
                              className="shrink-0 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 shadow-sm hover:text-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className={`app-segmented mt-3 grid ${isAdministrator ? 'grid-cols-3' : 'grid-cols-2'}`}>
                          {[
                            { id: 'unread' as const, label: 'Unread', count: unreadNotificationCount },
                            ...(isAdministrator ? [{ id: 'bugs' as const, label: 'Bugs', count: openBugCount }] : []),
                            { id: 'recent' as const, label: 'Recent', count: recentNotificationCount },
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setNotificationCenterTab(tab.id)}
                              className={`app-segmented-button rounded px-2 py-2 ${
                                notificationCenterTab === tab.id
                                  ? 'app-segmented-button-active'
                                  : ''
                              }`}
                            >
                              {tab.label} <span className={notificationCenterTab === tab.id ? 'text-white' : 'text-gray-400 dark:text-gray-500'}>{tab.count}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="max-h-[70dvh] overflow-y-auto p-2">
                        {!hasNotificationCenterItems ? (
                          <div className="empty-state px-5 py-10">
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-500 dark:bg-gray-800 dark:text-gray-100">
                              <Bell size={20} />
                            </div>
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">No notifications yet</p>
                            <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">New alerts and activity will show here.</p>
                          </div>
                        ) : (
                          <>
                            {notificationCenterTab === 'bugs' && isAdministrator && openBugCount > 0 && (
                              <button
                                type="button"
                                onClick={openBugTrackerFromNotification}
                                className="mb-2 flex w-full items-center gap-3 rounded border border-danger/20 bg-red-50 px-3 py-3 text-left text-sm shadow-sm hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:hover:bg-red-950"
                              >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white text-danger shadow-sm dark:bg-gray-900">
                                  <Bug size={18} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate font-bold text-danger">{openBugCount} bug report{openBugCount === 1 ? '' : 's'} need review</span>
                                  <span className="mt-0.5 block truncate text-xs font-semibold text-red-700 dark:text-red-200">Open Bug Tracker</span>
                                </span>
                              </button>
                            )}
                            {notificationCenterTab === 'bugs' && (!isAdministrator || openBugCount === 0) && (
                              <div className="empty-state px-5 py-8 text-sm">No bug reports need review.</div>
                            )}
                            {notificationCenterTab === 'unread' && unreadUserNotifications.length === 0 && (
                              <div className="empty-state px-5 py-8 text-sm">No unread notifications.</div>
                            )}
                            {notificationCenterTab === 'unread' && unreadUserNotifications.map((notification) => (
                              <button
                                key={notification.id}
                                type="button"
                                onClick={() => openNotification(notification)}
                                className={`mb-1 flex w-full items-start gap-3 rounded border px-3 py-3 text-left text-sm transition ${
                                  notification.isRead
                                    ? 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                                    : 'border-accent/40 bg-accent/10 shadow-sm ring-1 ring-accent/15 hover:bg-accent/15'
                                }`}
                              >
                                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded ${notification.isRead ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300' : 'bg-primary-500 text-white'}`}>
                                  <Bell size={16} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-start justify-between gap-2">
                                    <span className="truncate font-bold text-gray-800 dark:text-gray-100">{notification.title}</span>
                                    {!notification.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New notification" />}
                                  </span>
                                  <span className="mt-1 block line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{getPlainNotificationMessage(notification.message)}</span>
                                  <span className="mt-2 block text-xs font-bold uppercase tracking-wide text-accent">
                                    {notification.isRead ? 'Seen' : 'New'} - {new Date(notification.createdAt).toLocaleString()}
                                  </span>
                                </span>
                              </button>
                            ))}
                            {notificationCenterTab === 'recent' && notifications.length === 0 && (
                              <div className="empty-state px-5 py-8 text-sm">No recent activity.</div>
                            )}
                            {notificationCenterTab === 'recent' && notifications.map((notification) => {
                              const title = notification.type === 'success' ? 'Done' : notification.type === 'error' ? 'Needs attention' : 'Heads up';
                              const notificationTone = notification.type === 'success'
                                ? 'bg-green-50 text-green-700 ring-green-100 dark:bg-green-950/40 dark:text-green-200 dark:ring-green-900'
                                : notification.type === 'error'
                                  ? 'bg-red-50 text-danger ring-red-100 dark:bg-red-950/40 dark:ring-red-900'
                                  : 'bg-blue-50 text-primary-500 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-900';
                              return (
                              <div key={notification.id} className="mb-1 flex gap-3 rounded border border-gray-200 px-3 py-3 text-sm dark:border-gray-800">
                                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded ring-1 ${notificationTone}`}>
                                  <Bell size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="truncate font-bold text-gray-800 dark:text-gray-100">{title}</p>
                                    {notification.count && notification.count > 1 ? (
                                      <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-black text-accent">x{notification.count}</span>
                                    ) : (
                                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New notification" />
                                    )}
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{getPlainNotificationMessage(notification.message)}</p>
                                  <p className="mt-2 text-xs font-bold uppercase tracking-wide text-accent">Just now</p>
                                </div>
                              </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                  </div>
                </div>
  );
}
