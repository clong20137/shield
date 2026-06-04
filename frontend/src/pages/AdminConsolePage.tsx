import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertTriangle, Award, Bug, ClipboardList, Images, LockKeyhole, Radio, Settings, UserPlus } from 'lucide-react';
import { AuthAccount, BugReport, BugReportStatus, User } from '../services/api';

const AchievementsPage = lazy(() => import('./AchievementsPage'));
const AuditLogPage = lazy(() => import('./AuditLogPage'));
const BugTrackerPage = lazy(() => import('./BugTrackerPage'));
const CreateUserPage = lazy(() => import('./CreateUserPage'));
const ErrorLogPage = lazy(() => import('./ErrorLogPage'));
const MediaLibraryPage = lazy(() => import('./MediaLibraryPage'));
const PermissionsPage = lazy(() => import('./PermissionsPage'));
const UrgentAlertsPage = lazy(() => import('./UrgentAlertsPage'));

export type AdminConsoleTab = 'general' | 'permissions' | 'achievements' | 'create-user' | 'media' | 'alerts' | 'audit' | 'errors' | 'bugs';

interface AdminConsolePageProps {
  account: AuthAccount;
  initialTab?: AdminConsoleTab;
  onAccountUpdate: (account: AuthAccount) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
  onUserCreated?: (user: User) => void;
  bugReports?: BugReport[];
  onBugStatusChange?: (report: BugReport, status: BugReportStatus, adminNotes: string) => void;
}

const tabs: Array<{ id: AdminConsoleTab; label: string; icon: typeof Settings }> = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'permissions', label: 'Permissions', icon: LockKeyhole },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'create-user', label: 'Create User', icon: UserPlus },
  { id: 'media', label: 'Media', icon: Images },
  { id: 'alerts', label: 'Urgent Alerts', icon: Radio },
  { id: 'bugs', label: 'Bug Tracker', icon: Bug },
  { id: 'audit', label: 'Audit Log', icon: ClipboardList },
  { id: 'errors', label: 'Error Log', icon: AlertTriangle },
];

function hasPermission(account: AuthAccount, permission: string): boolean {
  return account.role === 'administrator' || Boolean(account.permissions?.includes(permission));
}

function getVisibleTabs(account: AuthAccount): Array<{ id: AdminConsoleTab; label: string; icon: typeof Settings }> {
  return tabs.filter((tab) => {
    if (tab.id === 'general') return hasPermission(account, 'admin:general') && hasPermission(account, 'roles:manage');
    if (tab.id === 'permissions') return hasPermission(account, 'admin:permissions') && hasPermission(account, 'roles:manage');
    if (tab.id === 'achievements') return hasPermission(account, 'admin:achievements') && hasPermission(account, 'roles:manage');
    if (tab.id === 'create-user') return hasPermission(account, 'admin:create-user') && hasPermission(account, 'users:create');
    if (tab.id === 'media') return hasPermission(account, 'admin:media') && (hasPermission(account, 'media:view') || hasPermission(account, 'media:upload') || hasPermission(account, 'media:edit') || hasPermission(account, 'media:delete'));
    if (tab.id === 'alerts') return hasPermission(account, 'admin:alerts') && hasPermission(account, 'alerts:send');
    if (tab.id === 'bugs') return hasPermission(account, 'admin:bugs') && hasPermission(account, 'bugs:manage');
    if (tab.id === 'audit') return hasPermission(account, 'admin:audit') && hasPermission(account, 'audit:view');
    if (tab.id === 'errors') return hasPermission(account, 'admin:errors') && hasPermission(account, 'audit:view');
    return account.role === 'administrator';
  });
}

export function AdminConsolePage({
  account,
  initialTab = 'general',
  onAccountUpdate,
  onToast,
  getErrorMessage,
  onUserCreated,
  bugReports = [],
  onBugStatusChange,
}: AdminConsolePageProps) {
  const [activeTab, setActiveTab] = useState<AdminConsoleTab>(initialTab);
  const visibleTabs = getVisibleTabs(account);
  const currentTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : visibleTabs[0]?.id || 'alerts';

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const activeTabConfig = visibleTabs.find((tab) => tab.id === currentTab);
  const ActiveIcon = activeTabConfig?.icon || Settings;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row">
      <aside className="shrink-0 border-b border-gray-200 pb-3 dark:border-gray-800 md:w-56 md:border-r md:border-b-0 md:pr-3 md:pb-0">
        <div className="mb-3 flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
          <ActiveIcon size={17} className="text-primary-500" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Admin Console</p>
            <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{activeTabConfig?.label || 'Admin'}</p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0" aria-label="Admin console navigation">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 rounded px-3 py-2 text-left text-sm font-bold transition md:w-full ${
                  currentTab === tab.id
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <Suspense fallback={<div className="loading">Loading admin tools...</div>}>
          {currentTab === 'general' && (
            <PermissionsPage
              account={account}
              onAccountUpdate={onAccountUpdate}
              onToast={onToast}
              getErrorMessage={getErrorMessage}
              section="settings"
              isModalView
            />
          )}

          {currentTab === 'permissions' && (
            <PermissionsPage
              account={account}
              onAccountUpdate={onAccountUpdate}
              onToast={onToast}
              getErrorMessage={getErrorMessage}
              section="permissions"
              isModalView
            />
          )}

          {currentTab === 'create-user' && (
            <CreateUserPage
              onToast={onToast}
              isModalView
              onCreated={onUserCreated}
            />
          )}

          {currentTab === 'achievements' && (
            <AchievementsPage
              onToast={onToast}
              getErrorMessage={getErrorMessage}
            />
          )}

          {currentTab === 'media' && <MediaLibraryPage account={account} onToast={onToast} getErrorMessage={getErrorMessage} />}

          {currentTab === 'audit' && <AuditLogPage isModalView />}

          {currentTab === 'errors' && <ErrorLogPage />}

          {currentTab === 'alerts' && <UrgentAlertsPage onToast={onToast} />}

          {currentTab === 'bugs' && (
            onBugStatusChange ? (
              <BugTrackerPage reports={bugReports} onStatusChange={onBugStatusChange} />
            ) : (
              <div className="empty-state">Bug tracker is unavailable.</div>
            )
          )}
        </Suspense>
      </div>
    </div>
  );
}

export default AdminConsolePage;
