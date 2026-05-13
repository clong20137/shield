import { FormEvent, useEffect, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, LayoutDashboard, LucideIcon, Search, Settings, Shield, UserCircle } from 'lucide-react';
import { BrowserRouter as Router, Navigate, NavLink, Routes, Route, useNavigate } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import ReportsPage from './pages/ReportsPage';
import DashboardPage from './pages/DashboardPage';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { ToastHost, ToastMessage, ToastType } from './components/ToastHost';
import { AuthAccount, authService } from './services/api';

const SESSION_KEY = 'shield_session';

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
    <div className="min-h-screen bg-gray-100 text-gray-900">
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
          <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
            <div className="mb-6">
              <h2 className="mb-2 text-2xl font-bold text-primary-500">
                {mode === 'register' ? 'Create login' : 'Sign in'}
              </h2>
              <p className="text-sm text-gray-600">
                {mode === 'register' ? 'Create an email and password login.' : 'Use your email and password to continue.'}
              </p>
            </div>

            {error && <div className="error">{error}</div>}

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                autoComplete="email"
                autoFocus
              />
            </label>

            {mode === 'register' && (
              <label className="mb-4 block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Display name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  autoComplete="name"
                />
              </label>
            )}

            <label className="mb-6 block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                autoComplete="current-password"
              />
            </label>

            {mode === 'register' && (
              <label className="mb-6 block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                  autoComplete="new-password"
                />
              </label>
            )}

            {requiresTwoFactor && mode === 'login' && (
              <label className="mb-6 block">
                <span className="mb-2 block text-sm font-semibold text-gray-700">2FA code</span>
                <input
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
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
  const navigate = useNavigate();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!query.trim()) {
      navigate('/search');
      return;
    }

    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
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
    <form onSubmit={handleSubmit} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-100" size={18} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Global search"
        className="h-11 w-full rounded border border-white/10 bg-white/10 py-2 pl-10 pr-3 text-sm text-white outline-none placeholder:text-blue-100 focus:border-white/40 focus:bg-white/15"
      />
    </form>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthAccount | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (type: ToastType, message: string) => {
    const id = Date.now();
    setToasts((currentToasts) => [...currentToasts, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, 4500);
  };

  useEffect(() => {
    const storedSession = window.localStorage.getItem(SESSION_KEY);

    if (storedSession) {
      try {
        const account = JSON.parse(storedSession) as AuthAccount;
        setCurrentUser(account);
        setIsAuthenticated(true);
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  const handleLogin = (account: AuthAccount) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setCurrentUser(account);
    setIsAuthenticated(true);
    showToast('success', `Signed in as ${account.email}.`);
  };

  const handleLogout = () => {
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
    showToast('info', 'Signed out.');
  };

  const handleAccountUpdate = (account: AuthAccount) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setCurrentUser(account);
  };

  return (
    <Router>
      <ToastHost toasts={toasts} />
      {!isAuthenticated ? (
        <LoginSplash onLogin={handleLogin} onToast={showToast} />
      ) : (
        <div className="flex min-h-screen bg-gray-50">
          <aside className={`relative flex shrink-0 flex-col bg-primary-500 text-white shadow-xl transition-all duration-200 ${isSidebarCollapsed ? 'w-20' : 'w-72'}`}>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              className="absolute -right-4 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-primary-500 shadow-lg hover:bg-gray-50"
              aria-label={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>

            <div className="flex h-20 items-center border-b border-white/10 px-4">
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
              <div className={`overflow-hidden rounded bg-white/10 ${isSidebarCollapsed ? 'p-2' : 'p-3'}`}>
                <div className={isSidebarCollapsed ? 'flex justify-center' : 'flex items-center gap-3'}>
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white bg-white text-base font-bold text-primary-500 shadow">
                    {currentUser ? getInitials(currentUser.displayName, currentUser.email) : <UserCircle size={32} />}
                  </div>
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
                    {currentUser?.twoFactorEnabled ? '2FA enabled' : '2FA not enabled'}
                  </div>
                )}
              </div>
            </div>

            <nav className="flex flex-1 flex-col gap-2 px-3 py-3">
              <SidebarLink to="/" label="Dashboard" compact={isSidebarCollapsed} icon={LayoutDashboard} />
              <SidebarLink to="/reports" label="Reports" compact={isSidebarCollapsed} icon={BarChart3} />
              <SidebarLink to="/account" label="Account" compact={isSidebarCollapsed} icon={Settings} />
            </nav>

            <div className="border-t border-white/10 p-3">
              {!isSidebarCollapsed && (
                <div className="mb-3 rounded bg-white/10 px-3 py-2">
                  <p className="text-xs uppercase text-blue-100">Session</p>
                  <p className="text-xs text-blue-100">Agency User Search</p>
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-10 w-full items-center justify-center rounded bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/20"
                title={isSidebarCollapsed ? 'Sign out' : undefined}
              >
                {isSidebarCollapsed ? 'Out' : 'Sign out'}
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-20 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Internal System</p>
                <h2 className="text-2xl font-bold text-primary-500">Agency Workspace</h2>
              </div>
            </header>

            <main className="flex-1 overflow-auto px-6 py-8">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                {currentUser && (
                  <Route
                    path="/account"
                    element={
                      <AccountSettingsPage
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
            </main>
          </div>
        </div>
      )}
    </Router>
  );
}

export default App;
