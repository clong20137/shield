import { FormEvent, useEffect, useRef, useState } from 'react';
import { BarChart3, Bell, ChevronLeft, ChevronRight, ClipboardList, Laptop, LayoutDashboard, LockKeyhole, LogOut, LucideIcon, Mail, Moon, Plus, Search, Settings, Shield, SlidersHorizontal, Sun, UserCircle, UserPlus, X } from 'lucide-react';
import { BrowserRouter as Router, Navigate, NavLink, Routes, Route, useNavigate } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import ReportsPage from './pages/ReportsPage';
import DashboardPage from './pages/DashboardPage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import DeviceManagementPage from './pages/DeviceManagementPage';
import PermissionsPage from './pages/PermissionsPage';
import MessageInboxPage from './pages/MessageInboxPage';
import CreateUserPage from './pages/CreateUserPage';
import AuditLogPage from './pages/AuditLogPage';
import { ToastHost, ToastMessage, ToastType } from './components/ToastHost';
import { AuthAccount, authService, clearAuthToken, messageService, setAuthToken, userService, User } from './services/api';

const SESSION_KEY = 'shield_session';
const THEME_KEY = 'shield_theme';
const MESSAGE_PREFERENCES_KEY = 'shield_message_preferences';
const QUICK_LAUNCH_KEY = 'shield_quick_launch';
const QUICK_LAUNCH_SLOT_COUNT = 5;

interface MessagePreferences {
  receiveMessages: boolean;
  playMessageSound: boolean;
}

type QuickLaunchAppId = 'dashboard' | 'messages' | 'devices' | 'search' | 'reports' | 'create-user' | 'audit' | 'permissions';

interface QuickLaunchApp {
  id: QuickLaunchAppId;
  label: string;
  path?: string;
  adminOnly?: boolean;
  icon: LucideIcon;
}

const defaultMessagePreferences: MessagePreferences = {
  receiveMessages: true,
  playMessageSound: true,
};

const quickLaunchApps: QuickLaunchApp[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { id: 'messages', label: 'Messages', icon: Mail },
  { id: 'devices', label: 'Devices', path: '/devices', icon: Laptop },
  { id: 'search', label: 'Search Users', path: '/search', icon: Search },
  { id: 'reports', label: 'Reports', path: '/reports', icon: BarChart3 },
  { id: 'create-user', label: 'Create User', path: '/users/create', adminOnly: true, icon: UserPlus },
  { id: 'audit', label: 'Audit Log', path: '/audit', adminOnly: true, icon: ClipboardList },
  { id: 'permissions', label: 'Permissions', path: '/permissions', adminOnly: true, icon: LockKeyhole },
];

function loadMessagePreferences(): MessagePreferences {
  try {
    const storedPreferences = window.localStorage.getItem(MESSAGE_PREFERENCES_KEY);
    return storedPreferences ? { ...defaultMessagePreferences, ...JSON.parse(storedPreferences) } : defaultMessagePreferences;
  } catch {
    return defaultMessagePreferences;
  }
}

function loadQuickLaunchSlots(): Array<QuickLaunchAppId | null> {
  try {
    const storedSlots = window.localStorage.getItem(QUICK_LAUNCH_KEY);
    const parsedSlots = storedSlots ? JSON.parse(storedSlots) : [];
    if (!Array.isArray(parsedSlots)) {
      return Array.from({ length: QUICK_LAUNCH_SLOT_COUNT }, () => null);
    }

    return Array.from({ length: QUICK_LAUNCH_SLOT_COUNT }, (_, index) => {
      const appId = parsedSlots[index];
      return quickLaunchApps.some((app) => app.id === appId) ? appId : null;
    });
  } catch {
    return Array.from({ length: QUICK_LAUNCH_SLOT_COUNT }, () => null);
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
  ) {
    return (error as { response: { data: { error: string } } }).response.data.error;
  }

  return fallback;
}

function LoginSplash({
  onLogin,
  onToast,
}: {
  onLogin: (account: AuthAccount) => void;
  onToast: (type: ToastType, message: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password.');
      return;
    }

    if (mode === 'register' && !displayName.trim()) {
      setError('Enter your display name.');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (requiresTwoFactor && !twoFactorCode.trim()) {
      setError('Enter your 2FA code.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response =
        mode === 'register'
          ? await authService.register(email, password, displayName)
          : await authService.login(email, password, requiresTwoFactor ? twoFactorCode : undefined);

      if (response.data.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        return;
      }

      if (response.data.account) {
        if (response.data.token) {
          setAuthToken(response.data.token);
        }
        onLogin(response.data.account);
      }
    } catch (err) {
      const message = getErrorMessage(err, mode === 'register' ? 'Failed to create account.' : 'Failed to sign in.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_480px]">
        <section className="flex items-center bg-primary-500 px-8 py-12 text-white lg:px-16">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-blue-100">
              Agency Access Portal
            </p>
            <h1 className="mb-5 text-5xl font-bold leading-tight text-white">
              SHIELD
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-blue-50">
              Search personnel records, review operational reporting, and monitor agency activity from one secured workspace.
            </p>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10">
          <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-6">
              <h2 className="mb-2 text-2xl font-bold text-primary-500">
                {mode === 'register' ? 'Create login' : 'Sign in'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {mode === 'register' ? 'Create an email and password login.' : 'Use your email and password to continue.'}
              </p>
            </div>

            {error && <div className="error">{error}</div>}

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
                autoComplete="email"
                autoFocus
              />
            </label>

            {mode === 'register' && (
              <label className="mb-4 block">
                <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Display name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
                  autoComplete="name"
                />
              </label>
            )}

            <label className="mb-6 block">
              <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
                autoComplete="current-password"
              />
            </label>

            {mode === 'register' && (
              <label className="mb-6 block">
                <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
                  autoComplete="new-password"
                />
              </label>
            )}

            {requiresTwoFactor && mode === 'login' && (
              <label className="mb-6 block">
                <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">2FA code</span>
                <input
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                />
              </label>
            )}

            <button type="submit" className="btn-primary w-full py-3" disabled={isSubmitting}>
              {isSubmitting ? 'Working...' : mode === 'register' ? 'Create login' : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode((value) => (value === 'login' ? 'register' : 'login'));
                setConfirmPassword('');
                setTwoFactorCode('');
                setRequiresTwoFactor(false);
                setError(null);
              }}
              className="mt-4 w-full text-sm font-semibold text-primary-500 hover:text-primary-700"
            >
              {mode === 'register' ? 'Already have a login? Sign in' : 'Need a login? Create one'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function getInitials(name?: string, email?: string): string {
  const source = name?.trim() || email?.trim() || 'SHIELD User';
  const parts = source.split(/\s+/u).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function ShieldLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <div className="shield-loader mx-auto mb-4">
          <Shield size={76} />
        </div>
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-accent">Loading SHIELD</p>
      </div>
    </div>
  );
}

interface SidebarLinkProps {
  to: string;
  label: string;
  compact: boolean;
  icon: LucideIcon;
}

function SidebarLink({ to, label, compact, icon: Icon }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'flex h-11 items-center rounded px-3 text-sm font-semibold transition',
          compact ? 'justify-center' : 'justify-start',
          isActive ? 'bg-white text-primary-500 shadow' : 'text-blue-50 hover:bg-white/10',
        ].join(' ')
      }
      title={compact ? label : undefined}
    >
      <Icon className={compact ? '' : 'mr-3'} size={19} />
      {!compact && <span>{label}</span>}
    </NavLink>
  );
}

function GlobalSearch({ compact }: { compact: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (compact || trimmedQuery.length < 2) {
      setResults([]);
      setIsResultsOpen(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const searchTimer = window.setTimeout(async () => {
      try {
        const response = await userService.search(trimmedQuery);
        setResults(Array.isArray(response.data) ? response.data.slice(0, 6) : []);
        setIsResultsOpen(true);
      } catch (err) {
        setResults([]);
        setIsResultsOpen(true);
        console.error('Failed to load live search results:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(searchTimer);
  }, [compact, query]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsResultsOpen(false);

    if (!query.trim()) {
      navigate('/search');
      return;
    }

    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const openSearchResult = (user: User) => {
    const displayName = `${user.firstName} ${user.lastName}`.trim();
    setQuery(displayName);
    setIsResultsOpen(false);
    navigate(`/search?userId=${encodeURIComponent(user.id)}&q=${encodeURIComponent(displayName || user.badgeNumber || user.id)}`);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => navigate('/search')}
        className="mx-auto flex h-11 w-11 items-center justify-center rounded bg-white/10 text-white hover:bg-white/20"
        title="Global search"
      >
        <Search size={20} />
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-100" size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setIsResultsOpen(true);
            }
          }}
          placeholder="Global search"
          className="h-11 w-full rounded border border-white/10 bg-white/10 py-2 pl-10 pr-3 text-sm text-white outline-none placeholder:text-blue-100 focus:border-white/40 focus:bg-white/15"
        />
      </div>
      <button
        type="submit"
        className="flex h-11 w-11 items-center justify-center rounded bg-accent text-white hover:bg-accent/90"
        aria-label="Search users"
      >
        <Search size={18} />
      </button>

      {isResultsOpen && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded border border-gray-200 bg-white text-gray-800 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
          {isSearching ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Searching...</div>
          ) : results.length > 0 ? (
            <div className="max-h-80 overflow-y-auto py-1">
              {results.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => openSearchResult(user)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {user.firstName} {user.lastName}
                    </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {user.email || `PE ${user.peNumber || 'N/A'}`} - {user.district || 'No district'}
                      </p>
                  </div>
                  <span className="shrink-0 rounded bg-accent/10 px-2 py-1 text-xs font-bold text-accent">
                    {user.rank || 'User'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No matching users found.</div>
          )}
          <button
            type="submit"
            className="w-full border-t border-gray-200 px-4 py-3 text-left text-sm font-semibold text-primary-500 hover:bg-gray-50 dark:border-gray-700 dark:text-blue-100 dark:hover:bg-gray-800"
          >
            View full search results
          </button>
        </div>
      )}
    </form>
  );
}

function HeaderMessagesButton({
  currentUser,
  preferences,
  onUnreadIncrease,
  onOpenMessages,
}: {
  currentUser: AuthAccount | null;
  preferences: MessagePreferences;
  onUnreadIncrease: () => void;
  onOpenMessages: () => void;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const previousUnreadCount = useRef<number | null>(null);

  useEffect(() => {
    if (!currentUser || !preferences.receiveMessages) {
      setUnreadCount(0);
      previousUnreadCount.current = null;
      return;
    }

    let isMounted = true;

    const loadUnreadCount = async () => {
      try {
        const response = await messageService.getInbox(currentUser.id);
        if (isMounted) {
          const nextUnreadCount = response.data.filter((message) => !message.isRead).length;
          if (previousUnreadCount.current !== null && nextUnreadCount > previousUnreadCount.current) {
            onUnreadIncrease();
          }
          previousUnreadCount.current = nextUnreadCount;
          setUnreadCount(nextUnreadCount);
        }
      } catch (err) {
        console.error('Failed to load unread messages:', err);
      }
    };

    loadUnreadCount();
    const interval = window.setInterval(loadUnreadCount, 30000);
    window.addEventListener('shield:messages-updated', loadUnreadCount);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      window.removeEventListener('shield:messages-updated', loadUnreadCount);
    };
  }, [currentUser, onUnreadIncrease, preferences.receiveMessages]);

  return (
    <button
      type="button"
      onClick={onOpenMessages}
      className="relative flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
      aria-label="Open messages"
      title="Messages"
    >
      <Mail size={18} />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}

function QuickLaunchTray({
  isAdministrator,
  isSidebarCollapsed,
  onOpenMessages,
}: {
  isAdministrator: boolean;
  isSidebarCollapsed: boolean;
  onOpenMessages: () => void;
}) {
  const navigate = useNavigate();
  const [slots, setSlots] = useState<Array<QuickLaunchAppId | null>>(() => loadQuickLaunchSlots());
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const availableApps = quickLaunchApps.filter((app) => !app.adminOnly || isAdministrator);

  useEffect(() => {
    window.localStorage.setItem(QUICK_LAUNCH_KEY, JSON.stringify(slots));
  }, [slots]);

  const openApp = (app: QuickLaunchApp) => {
    if (app.id === 'messages') {
      onOpenMessages();
      return;
    }

    if (app.path) {
      navigate(app.path);
    }
  };

  const assignSlot = (appId: QuickLaunchAppId | null) => {
    if (editingSlot === null) return;
    setSlots((currentSlots) => currentSlots.map((slot, index) => (index === editingSlot ? appId : slot)));
    setEditingSlot(null);
  };

  return (
    <section className={`pointer-events-none fixed bottom-5 right-6 z-30 transition-all duration-200 ${isSidebarCollapsed ? 'left-24' : 'left-[19.5rem]'}`}>
      <div className="pointer-events-auto mx-auto w-fit max-w-full rounded-2xl border border-gray-200 bg-white/85 p-3 shadow-[0_16px_45px_rgba(15,23,42,0.18)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
        <div className="flex max-w-full items-center gap-2 overflow-x-auto">
        {slots.map((appId, index) => {
          const app = availableApps.find((item) => item.id === appId) || null;
          const Icon = app?.icon;

          return (
            <div key={`quick-launch-${index}`} className="relative">
              <button
                type="button"
                onClick={() => (app ? openApp(app) : setEditingSlot(index))}
                className={`flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-[10px] font-bold transition ${
                  app
                    ? 'border-gray-200 bg-white text-primary-500 shadow-sm hover:border-accent hover:text-accent dark:border-gray-800 dark:bg-gray-900 dark:text-blue-100'
                    : 'border-gray-300 bg-white/60 text-gray-400 hover:border-accent hover:text-accent dark:border-gray-800 dark:bg-gray-900/60'
                }`}
                title={app?.label || 'Add App'}
              >
                {Icon ? <Icon size={20} /> : <Plus size={22} />}
                <span className="max-w-14 truncate">{app?.label || 'Add'}</span>
              </button>

              {app && (
                <button
                  type="button"
                  onClick={() => setEditingSlot(index)}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-500 shadow-sm hover:bg-gray-200 hover:text-primary-500 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  aria-label={`Change ${app.label} shortcut`}
                  title="Change shortcut"
                >
                  <Plus size={11} />
                </button>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {editingSlot !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Choose App</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select what this quick-launch box should open.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSlot(null)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-gray-200 text-primary-500 hover:bg-gray-50 dark:border-gray-700 dark:text-blue-100 dark:hover:bg-gray-800"
                aria-label="Close quick launch picker"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {availableApps.map((app) => {
                const Icon = app.icon;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => assignSlot(app.id)}
                    className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3 text-left text-sm font-bold text-gray-800 hover:border-accent hover:text-accent dark:border-gray-800 dark:text-gray-100 dark:hover:border-accent"
                  >
                    <Icon size={18} />
                    {app.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => assignSlot(null)}
              className="mt-4 text-sm font-semibold text-gray-500 hover:text-danger dark:text-gray-400"
            >
              Clear this box
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function MessagesRouteRedirect({ onOpenMessages }: { onOpenMessages: () => void }) {
  useEffect(() => {
    onOpenMessages();
  }, [onOpenMessages]);

  return <Navigate to="/" replace />;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthAccount | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [notifications, setNotifications] = useState<ToastMessage[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isMessagesModalOpen, setIsMessagesModalOpen] = useState(false);
  const [messagePreferences, setMessagePreferences] = useState<MessagePreferences>(() => loadMessagePreferences());

  const showToast = (type: ToastType, message: string) => {
    const id = Date.now();
    const toast = { id, type, message };
    setToasts((currentToasts) => [...currentToasts, toast]);
    setNotifications((currentNotifications) => [toast, ...currentNotifications].slice(0, 20));
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, 4500);
  };

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(storedTheme === 'dark' || (!storedTheme && prefersDark) ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(MESSAGE_PREFERENCES_KEY, JSON.stringify(messagePreferences));
  }, [messagePreferences]);

  const playMessagePing = () => {
    if (!messagePreferences.receiveMessages || !messagePreferences.playMessageSound) {
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const firstTone = audioContext.createOscillator();
      const secondTone = audioContext.createOscillator();
      const gain = audioContext.createGain();
      firstTone.type = 'triangle';
      secondTone.type = 'sine';
      firstTone.frequency.value = 659.25;
      secondTone.frequency.value = 987.77;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.1, audioContext.currentTime + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.36);
      firstTone.connect(gain);
      secondTone.connect(gain);
      gain.connect(audioContext.destination);
      firstTone.start(audioContext.currentTime);
      firstTone.stop(audioContext.currentTime + 0.14);
      secondTone.start(audioContext.currentTime + 0.16);
      secondTone.stop(audioContext.currentTime + 0.36);
    } catch (err) {
      console.error('Failed to play message ping:', err);
    }
  };

  useEffect(() => {
    authService.getSession()
      .then((response) => {
        if (response.data.account) {
          setCurrentUser(response.data.account);
          setIsAuthenticated(true);
          window.localStorage.setItem(SESSION_KEY, JSON.stringify(response.data.account));
        }
      })
      .catch(() => {
        clearAuthToken();
        window.localStorage.removeItem(SESSION_KEY);
      })
      .finally(() => setIsSessionLoading(false));
  }, []);

  const handleLogin = (account: AuthAccount) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setCurrentUser(account);
    setIsAuthenticated(true);
    showToast('success', `Signed in as ${account.email}.`);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // Local sign out should still complete if the server is unreachable.
    }
    clearAuthToken();
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
    showToast('info', 'Signed out.');
  };

  const handleAccountUpdate = (account: AuthAccount) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setCurrentUser(account);
  };

  const isAdministrator = currentUser?.role === 'administrator';

  return (
    <Router>
      <ToastHost toasts={toasts} />
      {isSessionLoading ? (
        <ShieldLoading />
      ) : !isAuthenticated ? (
        <LoginSplash onLogin={handleLogin} onToast={showToast} />
      ) : (
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
          <aside className={`shield-sidebar relative flex h-screen shrink-0 flex-col overflow-y-auto bg-primary-500 text-white shadow-xl transition-all duration-200 dark:bg-gray-900 ${isSidebarCollapsed ? 'w-20' : 'w-72'}`}>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              className="absolute -right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-primary-500 shadow-lg hover:bg-gray-50"
              aria-label={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>

            <div className="flex h-20 shrink-0 items-center border-b border-white/10 px-4 dark:border-gray-800">
              {!isSidebarCollapsed && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-white text-primary-500">
                    <Shield size={22} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-wider text-white">SHIELD</h1>
                    <p className="text-xs text-blue-100">Agency User Search</p>
                  </div>
                </div>
              )}
              {isSidebarCollapsed && (
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded bg-white text-primary-500">
                  <Shield size={22} />
                </div>
              )}
            </div>

            <div className={isSidebarCollapsed ? 'px-3 pb-3 pt-5' : 'px-4 pb-3 pt-5'}>
              <GlobalSearch compact={isSidebarCollapsed} />
            </div>

            <div className={isSidebarCollapsed ? 'px-3 py-3' : 'px-4 py-3'}>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className={`w-full overflow-hidden rounded bg-white/10 text-left transition hover:bg-white/15 ${isSidebarCollapsed ? 'p-1.5' : 'p-3'}`}
                title="Open profile"
              >
                <div className={isSidebarCollapsed ? 'flex justify-center' : 'flex items-center gap-3'}>
                  {currentUser?.profilePictureUrl ? (
                    <img
                      src={currentUser.profilePictureUrl}
                      alt={currentUser.displayName}
                      className={`${isSidebarCollapsed ? 'h-10 w-10' : 'h-14 w-14'} shrink-0 rounded-full border border-white bg-white object-cover shadow`}
                    />
                  ) : (
                    <div className={`${isSidebarCollapsed ? 'h-10 w-10 text-sm' : 'h-14 w-14 text-base'} flex shrink-0 items-center justify-center rounded-full border border-white bg-white font-bold text-primary-500 shadow`}>
                      {currentUser ? getInitials(currentUser.displayName, currentUser.email) : <UserCircle size={32} />}
                    </div>
                  )}
                  {!isSidebarCollapsed && (
                    <div className="min-w-0 text-white">
                      <p className="mb-1 text-xs uppercase tracking-[0.14em] text-blue-100">Profile</p>
                    <p className="truncate text-sm font-bold">{currentUser?.displayName}</p>
                      <p className="truncate text-xs text-blue-100">{currentUser?.email}</p>
                    </div>
                  )}
                </div>
                {!isSidebarCollapsed && (
                  <div className="mt-3 rounded bg-black/15 px-3 py-2 text-xs font-semibold text-white">
                    {currentUser?.role || 'user'} - {currentUser?.twoFactorEnabled ? '2FA enabled' : '2FA not enabled'}
                  </div>
                )}
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-2 px-3 py-3">
              <SidebarLink to="/" label="Dashboard" compact={isSidebarCollapsed} icon={LayoutDashboard} />
              <SidebarLink to="/devices" label="Devices" compact={isSidebarCollapsed} icon={Laptop} />
              <SidebarLink to="/reports" label="Reports" compact={isSidebarCollapsed} icon={BarChart3} />
              {isAdministrator && (
                <>
                  <SidebarLink to="/users/create" label="Create User" compact={isSidebarCollapsed} icon={UserPlus} />
                  <SidebarLink to="/audit" label="Audit Log" compact={isSidebarCollapsed} icon={ClipboardList} />
                  <SidebarLink to="/permissions" label="Permissions" compact={isSidebarCollapsed} icon={LockKeyhole} />
                </>
              )}
            </nav>

            <div className="shrink-0 border-t border-white/10 p-3" />
          </aside>

          <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-20 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Internal System</p>
                <h2 className="text-2xl font-bold text-primary-500">Agency Workspace</h2>
              </div>
              <div className="relative flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((value) => !value)}
                  className="relative flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                  aria-label="Open notifications"
                >
                  <Bell size={18} />
                  {notifications.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
                      {notifications.length > 9 ? '9+' : notifications.length}
                    </span>
                  )}
                </button>
                <HeaderMessagesButton
                  currentUser={currentUser}
                  preferences={messagePreferences}
                  onUnreadIncrease={playMessagePing}
                  onOpenMessages={() => setIsMessagesModalOpen(true)}
                />
                <button
                  type="button"
                  onClick={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
                  className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                  aria-label="Toggle light and dark mode"
                >
                  {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAccountMenuOpen((value) => !value)}
                  className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                  aria-label="Open account menu"
                  title="Account"
                >
                  <Settings size={18} />
                </button>

                {isNotificationsOpen && (
                  <div className="absolute right-0 top-12 z-40 w-80 rounded border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                      <h3 className="text-base font-bold text-primary-500 dark:text-blue-100">Notifications</h3>
                      <button
                        type="button"
                        onClick={() => setNotifications([])}
                        className="text-xs font-semibold text-gray-500 hover:text-primary-500 dark:text-gray-400"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto p-2">
                      {notifications.length === 0 ? (
                        <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                          No notifications yet
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <div key={notification.id} className="rounded px-3 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                            <p className="font-semibold text-gray-800 dark:text-gray-100">{notification.message}</p>
                            <p className="mt-1 text-xs uppercase text-gray-400">{notification.type}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                {isAccountMenuOpen && (
                  <div className="absolute right-0 top-12 z-40 w-64 rounded border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                      <p className="truncate text-sm font-bold text-gray-800 dark:text-gray-100">{currentUser?.displayName}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{currentUser?.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileModalOpen(true);
                        setIsAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <UserCircle size={16} /> Account Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPreferencesOpen(true);
                        setIsAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 border-t border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <SlidersHorizontal size={16} /> Preferences
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        handleLogout();
                      }}
                      className="flex w-full items-center gap-2 border-t border-gray-200 px-4 py-3 text-left text-sm font-semibold text-danger hover:bg-red-50 dark:border-gray-700 dark:hover:bg-red-950"
                    >
                      <LogOut size={16} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </header>

            <main className="flex-1 overflow-y-auto px-6 pb-48 pt-8 dark:bg-gray-950">
              <div className="min-h-[calc(100vh-12rem)]">
                <Routes>
                  <Route path="/" element={<DashboardPage currentUser={currentUser} />} />
                  {currentUser && <Route path="/messages" element={<MessagesRouteRedirect onOpenMessages={() => setIsMessagesModalOpen(true)} />} />}
                  <Route path="/devices" element={<DeviceManagementPage currentUser={currentUser} />} />
                  <Route path="/search" element={<SearchPage currentUser={currentUser} onToast={showToast} />} />
                  {currentUser && isAdministrator && (
                    <Route path="/users/create" element={<CreateUserPage onToast={showToast} />} />
                  )}
                  {currentUser && isAdministrator && (
                    <Route path="/audit" element={<AuditLogPage />} />
                  )}
                  <Route path="/reports" element={<ReportsPage />} />
                  {currentUser && isAdministrator && (
                    <Route
                      path="/permissions"
                      element={
                        <PermissionsPage
                          account={currentUser}
                          onAccountUpdate={handleAccountUpdate}
                          onToast={showToast}
                          getErrorMessage={getErrorMessage}
                        />
                      }
                    />
                  )}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
              <QuickLaunchTray
                isAdministrator={isAdministrator}
                isSidebarCollapsed={isSidebarCollapsed}
                onOpenMessages={() => setIsMessagesModalOpen(true)}
              />
            </main>
          </div>
          {isMessagesModalOpen && currentUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="flex h-[94vh] w-full max-w-7xl flex-col rounded-lg bg-white p-4 shadow-2xl dark:bg-gray-900">
                <div className="mb-3 flex items-start justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-800">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Messages</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Conversations update automatically.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMessagesModalOpen(false)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-gray-200 text-primary-500 hover:bg-gray-50 dark:border-gray-700 dark:text-blue-100 dark:hover:bg-gray-800"
                    aria-label="Close messages"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <MessageInboxPage currentUser={currentUser} onToast={showToast} isModalView />
                </div>
              </div>
            </div>
          )}
          {isProfileModalOpen && currentUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
                <div className="mb-6 flex items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Account Settings</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your profile security and sign-in options.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsProfileModalOpen(false)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-gray-200 text-primary-500 hover:bg-gray-50 dark:border-gray-700 dark:text-blue-100 dark:hover:bg-gray-800"
                    aria-label="Close profile settings"
                  >
                    <X size={20} />
                  </button>
                </div>
                <AccountSettingsPage
                  account={currentUser}
                  onAccountUpdate={handleAccountUpdate}
                  onToast={showToast}
                  getErrorMessage={getErrorMessage}
                />
              </div>
            </div>
          )}
          {isPreferencesOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
                <div className="mb-5 flex items-center justify-between">
                  <h2>Preferences</h2>
                  <button
                    type="button"
                    onClick={() => setIsPreferencesOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 text-primary-500 hover:bg-gray-50 dark:border-gray-700 dark:text-blue-100 dark:hover:bg-gray-800"
                    aria-label="Close preferences"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-4 dark:border-gray-800">
                    <span>
                      <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Receive messages</span>
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Show message badges and message notifications.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={messagePreferences.receiveMessages}
                      onChange={(event) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          receiveMessages: event.target.checked,
                        }))
                      }
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-4 dark:border-gray-800">
                    <span>
                      <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Message ping sound</span>
                      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Play a short sound when new unread messages arrive.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={messagePreferences.playMessageSound}
                      disabled={!messagePreferences.receiveMessages}
                      onChange={(event) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          playMessageSound: event.target.checked,
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Router>
  );
}

export default App;
