import { useEffect, useState } from 'react';
import { AlertTriangle, Bug, ClipboardList, LockKeyhole, Settings, UserPlus } from 'lucide-react';
import { AuthAccount, BugReport, BugReportStatus, User } from '../services/api';
import AuditLogPage from './AuditLogPage';
import BugTrackerPage from './BugTrackerPage';
import CreateUserPage from './CreateUserPage';
import ErrorLogPage from './ErrorLogPage';
import PermissionsPage from './PermissionsPage';

export type AdminConsoleTab = 'general' | 'permissions' | 'create-user' | 'audit' | 'errors' | 'bugs';

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
  { id: 'create-user', label: 'Create User', icon: UserPlus },
  { id: 'bugs', label: 'Bug Tracker', icon: Bug },
  { id: 'audit', label: 'Audit Log', icon: ClipboardList },
  { id: 'errors', label: 'Error Log', icon: AlertTriangle },
];

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

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded px-3 py-2 text-sm font-bold transition ${
                activeTab === tab.id
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-4 pr-1">
        {activeTab === 'general' && (
          <PermissionsPage
            account={account}
            onAccountUpdate={onAccountUpdate}
            onToast={onToast}
            getErrorMessage={getErrorMessage}
            section="settings"
            isModalView
          />
        )}

        {activeTab === 'permissions' && (
          <PermissionsPage
            account={account}
            onAccountUpdate={onAccountUpdate}
            onToast={onToast}
            getErrorMessage={getErrorMessage}
            section="permissions"
            isModalView
          />
        )}

        {activeTab === 'create-user' && (
          <CreateUserPage
            onToast={onToast}
            isModalView
            onCreated={onUserCreated}
          />
        )}

        {activeTab === 'audit' && <AuditLogPage isModalView />}

        {activeTab === 'errors' && <ErrorLogPage />}

        {activeTab === 'bugs' && (
          onBugStatusChange ? (
            <BugTrackerPage reports={bugReports} onStatusChange={onBugStatusChange} />
          ) : (
            <div className="empty-state">Bug tracker is unavailable.</div>
          )
        )}
      </div>
    </div>
  );
}

export default AdminConsolePage;
