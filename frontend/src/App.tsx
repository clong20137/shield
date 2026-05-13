import { FormEvent, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, NavLink, Routes, Route } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import ReportsPage from './pages/ReportsPage';
import DashboardPage from './pages/DashboardPage';

const SESSION_KEY = 'shield_session';

function LoginSplash({ onLogin }: { onLogin: (name: string) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!identifier.trim() || !accessCode.trim()) {
      setError('Enter your agency ID and access code.');
      return;
    }

    setError(null);
    onLogin(identifier.trim());
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
              <h2 className="mb-2 text-2xl font-bold text-primary-500">Sign in</h2>
              <p className="text-sm text-gray-600">Use your agency credentials to continue.</p>
            </div>

            {error && <div className="error">{error}</div>}

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Agency ID</span>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                autoComplete="username"
                autoFocus
              />
            </label>

            <label className="mb-6 block">
              <span className="mb-2 block text-sm font-semibold text-gray-700">Access code</span>
              <input
                type="password"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                autoComplete="current-password"
              />
            </label>

            <button type="submit" className="btn-primary w-full py-3">
              Enter SHIELD
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function SidebarLink({ to, label, compact }: { to: string; label: string; compact: boolean }) {
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
      <span className="w-8 text-center text-xs uppercase">{label.slice(0, 2)}</span>
      {!compact && <span>{label}</span>}
    </NavLink>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    const storedSession = window.localStorage.getItem(SESSION_KEY);

    if (storedSession) {
      setCurrentUser(storedSession);
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (name: string) => {
    window.localStorage.setItem(SESSION_KEY, name);
    setCurrentUser(name);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentUser('');
    setIsAuthenticated(false);
  };

  return (
    <Router>
      {!isAuthenticated ? (
        <LoginSplash onLogin={handleLogin} />
      ) : (
        <div className="flex min-h-screen bg-gray-50">
          <aside className={`flex shrink-0 flex-col bg-primary-500 text-white shadow-xl transition-all duration-200 ${isSidebarCollapsed ? 'w-20' : 'w-72'}`}>
            <div className="flex h-20 items-center justify-between border-b border-white/10 px-4">
              {!isSidebarCollapsed && (
                <div>
                  <h1 className="text-2xl font-bold tracking-wider text-white">SHIELD</h1>
                  <p className="text-xs text-blue-100">Agency User Search</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed((value) => !value)}
                className="flex h-10 w-10 items-center justify-center rounded text-lg font-bold text-white hover:bg-white/10"
                aria-label={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              >
                {isSidebarCollapsed ? '>' : '<'}
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-2 px-3 py-5">
              <SidebarLink to="/" label="Dashboard" compact={isSidebarCollapsed} />
              <SidebarLink to="/search" label="Search" compact={isSidebarCollapsed} />
              <SidebarLink to="/reports" label="Reports" compact={isSidebarCollapsed} />
            </nav>

            <div className="border-t border-white/10 p-3">
              {!isSidebarCollapsed && (
                <div className="mb-3 rounded bg-white/10 px-3 py-2">
                  <p className="text-xs uppercase text-blue-100">Signed in</p>
                  <p className="truncate text-sm font-semibold">{currentUser}</p>
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
