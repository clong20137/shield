import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Award, Bug, ClipboardList, Images, LockKeyhole, ListChecks, Music, Radio, Settings, UserPlus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthAccount, BugReport, BugReportStatus, User } from '../services/api';

const AchievementsPage = lazy(() => import('./AchievementsPage'));
const AuditLogPage = lazy(() => import('./AuditLogPage'));
const BugTrackerPage = lazy(() => import('./BugTrackerPage'));
const CreateUserPage = lazy(() => import('./CreateUserPage'));
const ErrorLogPage = lazy(() => import('./ErrorLogPage'));
const MediaLibraryPage = lazy(() => import('./MediaLibraryPage'));
const NotificationSoundsPage = lazy(() => import('./NotificationSoundsPage'));
const PermissionsPage = lazy(() => import('./PermissionsPage'));
const TCodeOptionsPage = lazy(() => import('./TCodeOptionsPage'));
const UrgentAlertsPage = lazy(() => import('./UrgentAlertsPage'));

export type AdminConsoleTab = 'general' | 'permissions' | 'achievements' | 'create-user' | 'media' | 'alerts' | 'sounds' | 't-codes' | 'audit' | 'errors' | 'bugs';

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
  { id: 'sounds', label: 'Sounds', icon: Music },
  { id: 't-codes', label: 'T-Codes', icon: ListChecks },
  { id: 'bugs', label: 'Bug Tracker', icon: Bug },
  { id: 'audit', label: 'Audit Log', icon: ClipboardList },
  { id: 'errors', label: 'Error Log', icon: AlertTriangle },
];

function hasPermission(account: AuthAccount, permission: string): boolean {
  return account.role === 'administrator' || Boolean(account.permissions?.includes(permission));
}

function getVisibleTabs(account: AuthAccount): Array<{ id: AdminConsoleTab; label: string; icon: typeof Settings }> {
  if (!hasPermission(account, 'admin:access')) {
    return [];
  }

  return tabs.filter((tab) => {
    if (tab.id === 'general') return hasPermission(account, 'admin:general') && hasPermission(account, 'roles:manage');
    if (tab.id === 'permissions') return hasPermission(account, 'admin:permissions') && hasPermission(account, 'roles:manage');
    if (tab.id === 'achievements') return hasPermission(account, 'admin:achievements') && hasPermission(account, 'roles:manage');
    if (tab.id === 'create-user') return hasPermission(account, 'admin:create-user') && hasPermission(account, 'users:create');
    if (tab.id === 'media') return hasPermission(account, 'admin:media') && (hasPermission(account, 'media:view') || hasPermission(account, 'media:upload') || hasPermission(account, 'media:edit') || hasPermission(account, 'media:delete'));
    if (tab.id === 'alerts') return hasPermission(account, 'admin:alerts') && hasPermission(account, 'alerts:send');
    if (tab.id === 'sounds') return hasPermission(account, 'admin:general');
    if (tab.id === 't-codes') return hasPermission(account, 'admin:general') && hasPermission(account, 'calendar:manage');
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
  const navigate = useNavigate();
  const params = useParams<{ tab?: string }>();
  const routeTab = tabs.some((tab) => tab.id === params.tab) ? params.tab as AdminConsoleTab : undefined;
  const [activeTab, setActiveTab] = useState<AdminConsoleTab>(routeTab || initialTab);
  const visibleTabs = useMemo(() => getVisibleTabs(account), [account]);
  const currentTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : visibleTabs[0]?.id || 'alerts';

  useEffect(() => {
    setActiveTab(routeTab || initialTab);
  }, [initialTab, routeTab]);

  useEffect(() => {
    if (visibleTabs.length === 0) {
      return;
    }

    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      const fallbackTab = visibleTabs[0].id;
      setActiveTab(fallbackTab);
      navigate(`/admin/${fallbackTab}`, { replace: true });
    }
  }, [activeTab, navigate, visibleTabs]);

  const activeTabConfig = visibleTabs.find((tab) => tab.id === currentTab);
  const ActiveIcon = activeTabConfig?.icon || Settings;
  const openTab = (tab: AdminConsoleTab) => {
    setActiveTab(tab);
    navigate(`/admin/${tab}`);
  };

  return (
    <div className="min-h-[calc(100dvh-12rem)]">
      {visibleTabs.length === 0 ? (
        <div className="empty-state">You do not have access to any Admin Console tools.</div>
      ) : (
      <>
      <div className="app-page-header">
        <div>
          <p className="app-page-kicker">Administration</p>
          <h1>Admin Console</h1>
          <p className="app-page-subtitle">Manage settings, permissions, users, media, alerts, audit history, and system health.</p>
        </div>
        <div className="app-summary-item flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200">
          <ActiveIcon size={17} className="text-accent" />
          {activeTabConfig?.label || 'Admin'}
        </div>
      </div>

      <div className="grid min-h-[calc(100dvh-18rem)] gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="app-surface p-3">
          <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1" aria-label="Admin console navigation">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => openTab(tab.id)}
                  className={`grid min-h-11 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2 rounded px-3 py-2 text-left text-sm font-bold transition ${
                    currentTab === tab.id
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon size={16} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="app-surface min-w-0 p-4 sm:p-5">
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

            {currentTab === 'sounds' && (
              <NotificationSoundsPage
                onToast={onToast}
                getErrorMessage={getErrorMessage}
              />
            )}

            {currentTab === 't-codes' && (
              <TCodeOptionsPage
                onToast={onToast}
                getErrorMessage={getErrorMessage}
              />
            )}

            {currentTab === 'bugs' && (
              onBugStatusChange ? (
                <BugTrackerPage reports={bugReports} onStatusChange={onBugStatusChange} />
              ) : (
                <div className="empty-state">Bug tracker is unavailable.</div>
              )
            )}
          </Suspense>
        </section>
      </div>
      </>
      )}
    </div>
  );
}

export default AdminConsolePage;
