import { lazy, Suspense } from 'react';
import { Search } from 'lucide-react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import type { AdminConsoleTab } from '../../pages/AdminConsolePage';
import type { ToastType } from '../ToastHost';
import type { AuthAccount, BugReport, BugReportStatus } from '../../services/api';

const SearchPage = lazy(() => import('../../pages/SearchPage'));
const ReportsPage = lazy(() => import('../../pages/ReportsPage'));
const DashboardPage = lazy(() => import('../../pages/DashboardPage'));
const DashboardPostPage = lazy(() => import('../../pages/DashboardPostPage'));
const AdminConsolePage = lazy(() => import('../../pages/AdminConsolePage'));
const DeviceManagementPage = lazy(() => import('../../pages/DeviceManagementPage'));
const MessageInboxPage = lazy(() => import('../../pages/MessageInboxPage'));
const CalendarPage = lazy(() => import('../../pages/CalendarPage'));
const PerformanceEvaluationsPage = lazy(() => import('../../pages/PerformanceEvaluationsPage'));
const MemorialPage = lazy(() => import('../../pages/MemorialPage'));

type ShowToast = (type: ToastType, message: string, options?: { saveToNotifications?: boolean }) => void;
type GetErrorMessage = (error: unknown, fallback: string) => string;

interface AppRoutesProps {
  currentUser: AuthAccount | null;
  isAppBackgrounded: boolean;
  canOpenAdminConsole: boolean;
  useMilitaryTime: boolean;
  bugReports: BugReport[];
  hasPermission: (permission: string) => boolean;
  getDefaultAdminConsoleTab: () => AdminConsoleTab;
  onAccountUpdate: (account: AuthAccount) => void;
  onToast: ShowToast;
  getErrorMessage: GetErrorMessage;
  openAppPath: (path: string) => void;
  onBugStatusChange: (report: BugReport, status: BugReportStatus, adminNotes: string) => void;
}

function NotFoundPage() {
  return (
    <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
      <section className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-8 text-center shadow dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Search size={28} />
        </div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent">404</p>
        <h1 className="mt-2 text-3xl font-bold text-primary-500 dark:text-blue-100">Page Not Found</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
          This page does not exist, or it may have moved.
        </p>
        <NavLink to="/" className="btn-primary mt-6 inline-flex">
          Back to Dashboard
        </NavLink>
      </section>
    </div>
  );
}

function PageLoader({ label = 'Loading page...' }: { label?: string }) {
  return (
    <div className="page-loader-enter flex min-h-48 items-center justify-center">
      <div className="loading min-w-56">{label}</div>
    </div>
  );
}

function RouteTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAdminWorkspaceRoute = /^\/(admin|audit|permissions|users\/create)(\/|$)/u.test(location.pathname);

  return (
    // Keep admin subroutes under one transition key so tab-like admin navigation does not replay full page animations.
    <div key={isAdminWorkspaceRoute ? 'admin-workspace' : location.pathname} className={isAdminWorkspaceRoute ? undefined : 'page-route-enter'}>
      {children}
    </div>
  );
}

export function AppRoutes({
  currentUser,
  isAppBackgrounded,
  canOpenAdminConsole,
  useMilitaryTime,
  bugReports,
  hasPermission,
  getDefaultAdminConsoleTab,
  onAccountUpdate,
  onToast,
  getErrorMessage,
  openAppPath,
  onBugStatusChange,
}: AppRoutesProps) {
  const adminConsoleProps = {
    account: currentUser as AuthAccount,
    onAccountUpdate,
    onToast,
    getErrorMessage,
    onUserCreated: () => openAppPath('/admin/permissions'),
    bugReports,
    onBugStatusChange,
  };

  return (
    <Suspense fallback={<PageLoader />}>
      <RouteTransition>
        <Routes>
          <Route path="/" element={<DashboardPage currentUser={currentUser} isAppBackgrounded={isAppBackgrounded} />} />
          {currentUser && <Route path="/updates/new" element={<DashboardPostPage currentUser={currentUser} onToast={onToast} isCreateMode />} />}
          {currentUser && <Route path="/updates/:postId/edit" element={<DashboardPostPage currentUser={currentUser} onToast={onToast} isEditMode />} />}
          {currentUser && <Route path="/updates/:postId" element={<DashboardPostPage currentUser={currentUser} onToast={onToast} />} />}
          {currentUser && (
            <Route
              path="/messages"
              element={<MessageInboxPage currentUser={currentUser} onToast={onToast} isBackgrounded={isAppBackgrounded} />}
            />
          )}
          {currentUser && (
            <Route
              path="/calendar"
              element={<CalendarPage currentUser={currentUser} onAccountUpdate={onAccountUpdate} useMilitaryTime={useMilitaryTime} />}
            />
          )}
          <Route path="/devices" element={<DeviceManagementPage currentUser={currentUser} />} />
          {currentUser && (
            <Route
              path="/evaluations"
              element={<PerformanceEvaluationsPage currentUser={currentUser} onToast={onToast} getErrorMessage={getErrorMessage} />}
            />
          )}
          <Route path="/search" element={<SearchPage currentUser={currentUser} onToast={onToast} />} />
          {currentUser && <Route path="/memorial" element={<MemorialPage currentUser={currentUser} onToast={onToast} />} />}
          {currentUser && canOpenAdminConsole && (
            <Route
              path="/admin"
              element={<AdminConsolePage {...adminConsoleProps} initialTab={getDefaultAdminConsoleTab()} />}
            />
          )}
          {currentUser && canOpenAdminConsole && (
            <Route path="/admin/:tab" element={<AdminConsolePage {...adminConsoleProps} />} />
          )}
          {currentUser && canOpenAdminConsole && hasPermission('admin:create-user') && hasPermission('users:create') && (
            // Top-level admin shortcuts still require both workspace access and the specific action permission.
            <Route
              path="/users/create"
              element={<AdminConsolePage {...adminConsoleProps} initialTab="create-user" />}
            />
          )}
          <Route path="/reports" element={<ReportsPage currentUser={currentUser} onToast={onToast} getErrorMessage={getErrorMessage} />} />
          {currentUser && canOpenAdminConsole && hasPermission('admin:audit') && hasPermission('audit:view') && (
            <Route
              path="/audit"
              element={<AdminConsolePage {...adminConsoleProps} initialTab="audit" />}
            />
          )}
          {currentUser && canOpenAdminConsole && hasPermission('admin:permissions') && hasPermission('roles:manage') && (
            <Route
              path="/permissions"
              element={<AdminConsolePage {...adminConsoleProps} initialTab="permissions" />}
            />
          )}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </RouteTransition>
    </Suspense>
  );
}
