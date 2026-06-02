import { CSSProperties, FormEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Bell, Bug, Calculator, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Laptop, LayoutDashboard, Link, LockKeyhole, LogOut, LucideIcon, Mail, Moon, Pencil, Plus, Save, Search, Settings, Shield, Sun, Trash2, UserCircle, UserPlus, X } from 'lucide-react';
import { BrowserRouter as Router, Navigate, NavLink, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import type { AdminConsoleTab } from './pages/AdminConsolePage';
import { ToastHost, ToastMessage, ToastType } from './components/ToastHost';
import { AuthAccount, authService, bugReportService, BugReport, BugReportPriority, BugReportStatus, CalendarEntry, calendarService, clearAuthToken, getAppEventsUrl, getAssetUrl, getMessageEventsUrl, handleAssetImageError, messageService, notificationService, quickLaunchService, RegistrationSettings, setAuthToken, UserNotification, userService, User, type QuickLaunchExternalSlot as ApiQuickLaunchExternalSlot, type QuickLaunchSlot as ApiQuickLaunchSlot } from './services/api';

const SearchPage = lazy(() => import('./pages/SearchPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DashboardPostPage = lazy(() => import('./pages/DashboardPostPage'));
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage').then((module) => ({ default: module.AccountSettingsPage })));
const AdminConsolePage = lazy(() => import('./pages/AdminConsolePage'));
const DeviceManagementPage = lazy(() => import('./pages/DeviceManagementPage'));
const MessageInboxPage = lazy(() => import('./pages/MessageInboxPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const PerformanceEvaluationsPage = lazy(() => import('./pages/PerformanceEvaluationsPage'));

const SESSION_KEY = 'shield_session';
const THEME_KEY = 'shield_theme';
const MESSAGE_PREFERENCES_KEY = 'shield_message_preferences';
const SESSION_TIMEOUT_KEY = 'shield_session_timeout_minutes';
const QUICK_LAUNCH_KEY = 'shield_quick_launch';
const QUICK_LAUNCH_SLOT_COUNT = 8;
const MODAL_CLOSE_MS = 220;

interface MessagePreferences {
  receiveMessages: boolean;
  playMessageSound: boolean;
  messageSound: 'classic' | 'soft' | 'chime';
  useMilitaryTime: boolean;
}

type QuickLaunchAppId = 'dashboard' | 'messages' | 'calendar' | 'devices' | 'calculator' | 'search' | 'reports' | 'create-user' | 'audit' | 'permissions';
type QuickLaunchExternalSlot = ApiQuickLaunchExternalSlot;
type QuickLaunchSlot = QuickLaunchAppId | QuickLaunchExternalSlot | null;

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
  messageSound: 'classic',
  useMilitaryTime: false,
};

const quickLaunchApps: QuickLaunchApp[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { id: 'messages', label: 'Messages', icon: Mail },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'devices', label: 'Devices', path: '/devices', adminOnly: true, icon: Laptop },
  { id: 'calculator', label: 'Calculator', icon: Calculator },
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

function isExternalQuickLaunchSlot(slot: QuickLaunchSlot): slot is QuickLaunchExternalSlot {
  return typeof slot === 'object' && slot !== null && slot.type === 'external';
}

function getQuickLaunchStorageKey(accountId: string): string {
  return `${QUICK_LAUNCH_KEY}_${accountId}`;
}

function getEmptyQuickLaunchSlots(): QuickLaunchSlot[] {
  return Array.from({ length: QUICK_LAUNCH_SLOT_COUNT }, () => null);
}

function normalizeQuickLaunchSlots(rawSlots: unknown): QuickLaunchSlot[] {
  const parsedSlots = Array.isArray(rawSlots) ? rawSlots : [];

  return Array.from({ length: QUICK_LAUNCH_SLOT_COUNT }, (_, index) => {
    const slot = parsedSlots[index];

    if (quickLaunchApps.some((app) => app.id === slot)) {
      return slot as QuickLaunchAppId;
    }

    if (
      typeof slot === 'object' &&
      slot !== null &&
      (slot as { type?: unknown }).type === 'external' &&
      typeof (slot as { label?: unknown }).label === 'string' &&
      typeof (slot as { url?: unknown }).url === 'string'
    ) {
      return {
        type: 'external',
        label: (slot as { label: string }).label,
        url: (slot as { url: string }).url,
      };
    }

    return null;
  });
}

function loadLegacyQuickLaunchSlots(storageKey: string): QuickLaunchSlot[] {
  try {
    const storedSlots = window.localStorage.getItem(storageKey);
    return normalizeQuickLaunchSlots(storedSlots ? JSON.parse(storedSlots) : []);
  } catch {
    return getEmptyQuickLaunchSlots();
  }
}

function saveLegacyQuickLaunchSlots(storageKey: string, slots: QuickLaunchSlot[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeQuickLaunchSlots(slots)));
  } catch {
    // Local storage is only a fallback for quick launch preferences.
  }
}

const WELCOME_SPLASH_KEY_PREFIX = 'shield_welcome_splash_seen';

function getWelcomeSplashStorageKey(accountId: string): string {
  return `${WELCOME_SPLASH_KEY_PREFIX}_${accountId}`;
}

function hasSeenWelcomeSplash(accountId: string): boolean {
  try {
    return window.localStorage.getItem(getWelcomeSplashStorageKey(accountId)) === '1';
  } catch {
    return false;
  }
}

function markWelcomeSplashSeen(accountId: string) {
  try {
    window.localStorage.setItem(getWelcomeSplashStorageKey(accountId), '1');
  } catch {
    // ignore local storage failures
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
  isExiting = false,
}: {
  onLogin: (account: AuthAccount) => void;
  onToast: (type: ToastType, message: string) => void;
  isExiting?: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [registrationSettings, setRegistrationSettings] = useState<RegistrationSettings | null>(null);
  const [isMicrosoftSsoEnabled, setIsMicrosoftSsoEnabled] = useState(false);
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite') || '');
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('reset') || '');
  const [ssoToken] = useState(() => new URLSearchParams(window.location.search).get('ssoToken') || '');
  const [ssoError] = useState(() => new URLSearchParams(window.location.search).get('ssoError') || '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [isLoginWarningOpen, setIsLoginWarningOpen] = useState(false);
  const [hasAcknowledgedLoginWarning, setHasAcknowledgedLoginWarning] = useState(false);
  const loginFormRef = useRef<HTMLFormElement | null>(null);
  const lastAutoSubmittedTwoFactorCodeRef = useRef('');

  useEffect(() => {
    authService.getRegistrationSettings()
      .then((response) => {
        setRegistrationSettings(response.data);
        if (inviteToken && response.data.mode !== 'disabled') {
          setMode('register');
        }
        if (resetToken) {
          setMode('reset');
        }
      })
      .catch((err) => {
        console.error('Failed to load registration settings:', err);
      });
  }, [inviteToken, resetToken]);

  useEffect(() => {
    authService.getMicrosoftSsoStatus()
      .then((response) => setIsMicrosoftSsoEnabled(response.data.enabled))
      .catch((err) => {
        console.error('Failed to load Microsoft SSO status:', err);
        setIsMicrosoftSsoEnabled(false);
      });
  }, []);

  useEffect(() => {
    if (ssoError) {
      setError(ssoError);
      onToast('error', ssoError);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (!ssoToken) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setAuthToken(ssoToken);
    authService.getSession()
      .then((response) => {
        if (response.data.account) {
          onLogin(response.data.account);
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      })
      .catch((err) => {
        clearAuthToken();
        const message = getErrorMessage(err, 'Microsoft sign in failed.');
        setError(message);
        onToast('error', message);
      })
      .finally(() => setIsSubmitting(false));
  }, [onLogin, onToast, ssoError, ssoToken]);

  useEffect(() => {
    const cleanCode = twoFactorCode.replace(/[^A-Z0-9]/giu, '');
    const isNumericCode = /^\d+$/u.test(cleanCode);

    if (!requiresTwoFactor || mode !== 'login' || cleanCode.length !== 6 || !isNumericCode || isSubmitting) {
      if (cleanCode.length !== 6 || !isNumericCode) {
        lastAutoSubmittedTwoFactorCodeRef.current = '';
      }
      return;
    }

    if (lastAutoSubmittedTwoFactorCodeRef.current === cleanCode) {
      return;
    }

    lastAutoSubmittedTwoFactorCodeRef.current = cleanCode;
    loginFormRef.current?.requestSubmit();
  }, [isSubmitting, mode, requiresTwoFactor, twoFactorCode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === 'forgot') {
      if (!email.trim()) {
        setError('Enter your email address.');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const response = await authService.requestPasswordReset(email);
        onToast('success', response.data.message);
        setMode('login');
      } catch (err) {
        const message = getErrorMessage(err, 'Failed to request password reset.');
        setError(message);
        onToast('error', message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === 'reset') {
      if (!password.trim() || password !== confirmPassword) {
        setError(password.trim() ? 'Passwords do not match.' : 'Enter a new password.');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const response = await authService.resetPassword(resetToken, password);
        onToast('success', response.data.message);
        setPassword('');
        setConfirmPassword('');
        setMode('login');
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (err) {
        const message = getErrorMessage(err, 'Failed to reset password.');
        setError(message);
        onToast('error', message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError('Enter your email and password.');
      return;
    }

    if (mode === 'register' && (!firstName.trim() || !lastName.trim())) {
      setError('Enter your first and last name.');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (requiresTwoFactor && !twoFactorCode.trim()) {
      setError('Enter your MFA code.');
      return;
    }

    if (mode === 'login' && registrationSettings?.loginWarningEnabled && !hasAcknowledgedLoginWarning) {
      setIsLoginWarningOpen(true);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response =
        mode === 'register'
          ? await authService.register(email, password, firstName, lastName, inviteToken || undefined)
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

  const canRegister =
    registrationSettings?.mode === 'public' ||
    (registrationSettings?.mode === 'invite-only' && Boolean(inviteToken));

  return (
    <div className={`min-h-screen bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100 ${isExiting ? 'animate-login-exit pointer-events-none' : ''}`}>
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
          <form ref={loginFormRef} onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-6">
              <h2 className="mb-2 text-2xl font-bold text-primary-500">
                {mode === 'register' ? 'Create login' : mode === 'forgot' ? 'Reset password' : mode === 'reset' ? 'Set new password' : 'Sign in'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {mode === 'register'
                  ? inviteToken
                    ? 'Create your login from this secure invite.'
                    : 'Create an email and password login.'
                  : mode === 'forgot'
                    ? 'Enter your email and we will send a secure reset link.'
                    : mode === 'reset'
                      ? 'Choose a new password for your SHIELD login.'
                      : 'Use your email and password to continue.'}
              </p>
            </div>

            {error && <div className="error">{error}</div>}
            {mode === 'register' && registrationSettings?.mode === 'invite-only' && !inviteToken && (
              <div className="error">Registration is invite-only. Use your secure invite link to create an account.</div>
            )}
            {mode === 'register' && registrationSettings?.mode === 'disabled' && (
              <div className="error">Public registration is currently disabled.</div>
            )}
            {registrationSettings?.maintenanceMode && mode === 'login' && (
              <div className="mb-4 rounded border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">
                Maintenance mode is active. Only administrators can sign in.
              </div>
            )}

            {mode === 'login' && isMicrosoftSsoEnabled && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => {
                    window.location.assign(authService.getMicrosoftSsoStartUrl(`${window.location.pathname}${window.location.search}` || '/'));
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-primary-500 shadow-sm transition hover:border-accent hover:text-accent dark:border-gray-700 dark:bg-gray-950 dark:text-blue-100"
                  disabled={isSubmitting}
                >
                  <Shield size={17} />
                  Sign in with Microsoft
                </button>
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Backup Login</span>
                  <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                </div>
              </div>
            )}

            {mode !== 'reset' && (
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
            )}

            {mode === 'register' && (
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">First name</span>
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
                    autoComplete="given-name"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Last name</span>
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
                    autoComplete="family-name"
                  />
                </label>
              </div>
            )}

            {mode !== 'forgot' && (
            <label className="mb-6 block">
              <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
                autoComplete={mode === 'reset' || mode === 'register' ? 'new-password' : 'current-password'}
              />
            </label>
            )}

            {(mode === 'register' || mode === 'reset') && (
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
                <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">MFA code or recovery code</span>
                <input
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/gu, '').slice(0, 12))}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
                  autoComplete="one-time-code"
                  inputMode="text"
                  maxLength={12}
                />
              </label>
            )}

            <button type="submit" className="btn-primary w-full py-3" disabled={isSubmitting || (mode === 'register' && !canRegister)}>
              {isSubmitting ? 'Working...' : mode === 'register' ? 'Create login' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Set password' : 'Sign in'}
            </button>

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setPassword('');
                  setConfirmPassword('');
                  setTwoFactorCode('');
                  setRequiresTwoFactor(false);
                  setError(null);
                }}
                className="mt-4 w-full text-sm font-semibold text-gray-500 hover:text-primary-500 dark:text-gray-400"
              >
                Forgot password?
              </button>
            )}

            {(mode === 'register' || mode === 'forgot' || mode === 'reset' || registrationSettings?.mode === 'public' || inviteToken) && (
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
                {mode === 'register' || mode === 'forgot' || mode === 'reset' ? 'Back to sign in' : 'Need a login? Create one'}
              </button>
            )}
          </form>
        </section>
      </div>
      {isLoginWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Official Use Warning</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
              {registrationSettings?.loginWarningMessage}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setIsLoginWarningOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setHasAcknowledgedLoginWarning(true);
                  setIsLoginWarningOpen(false);
                  window.setTimeout(() => loginFormRef.current?.requestSubmit(), 0);
                }}
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ForcePasswordChange({
  account,
  onChanged,
  onLogout,
  onToast,
}: {
  account: AuthAccount;
  onChanged: (account: AuthAccount) => void;
  onLogout: () => void;
  onToast: (type: ToastType, message: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Enter your current password and new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from the temporary password.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await authService.changePassword(account.id, currentPassword, newPassword);
      const response = await authService.getSession();
      if (response.data.account) {
        onChanged(response.data.account);
      }
      onToast('success', 'Password updated. Welcome to SHIELD.');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to update password.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/65 px-4 py-10 text-gray-900 backdrop-blur-sm dark:text-gray-100">
      <form onSubmit={handleSubmit} className="modal-window w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-primary-500 text-white">
            <LockKeyhole size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Password Required</p>
            <h1 className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">Change temporary password</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Your account was created by an administrator. Set your own password before continuing.
            </p>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            autoComplete="current-password"
            autoFocus
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            autoComplete="new-password"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Confirm new password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            autoComplete="new-password"
          />
        </label>

        <button type="submit" className="btn-primary w-full py-3" disabled={isSaving}>
          {isSaving ? 'Updating...' : 'Update Password'}
        </button>
        <button type="button" onClick={onLogout} className="mt-4 w-full text-sm font-semibold text-gray-500 hover:text-primary-500 dark:text-gray-400">
          Sign out
        </button>
      </form>
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

function getEntryDateKey(entry: CalendarEntry): string {
  return entry.date.slice(0, 10);
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSidebarCalendarDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function SidebarCalendarWidget({
  compact,
  entries,
  isLoading,
  onOpenCalendar,
}: {
  compact: boolean;
  entries: CalendarEntry[];
  isLoading: boolean;
  onOpenCalendar: () => void;
}) {
  const todayKey = getLocalDateKey();
  const upcomingEntries = entries
    .filter((entry) => getEntryDateKey(entry) >= todayKey)
    .sort((a, b) => getEntryDateKey(a).localeCompare(getEntryDateKey(b)))
    .slice(0, 3);
  const todayEntryCount = entries.filter((entry) => getEntryDateKey(entry) === todayKey).length;
  const currentDay = new Date().toLocaleDateString(undefined, { day: '2-digit' });
  const currentMonth = new Date().toLocaleDateString(undefined, { month: 'short' });

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpenCalendar}
        className="mx-3 mb-3 flex h-12 items-center justify-center rounded bg-white/10 text-white transition hover:bg-white/15"
        aria-label="Open calendar"
        title="Open calendar"
      >
        <CalendarDays size={20} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenCalendar}
      className="mx-3 mb-3 rounded-lg border border-white/10 bg-white/10 p-3 text-left text-white transition hover:bg-white/15"
      aria-label="Open calendar"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="w-12 shrink-0 overflow-hidden rounded bg-white text-center text-primary-500 shadow">
          <div className="bg-danger px-1 py-0.5 text-[10px] font-bold uppercase text-white">{currentMonth}</div>
          <div className="py-1 text-lg font-black leading-none">{currentDay}</div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">Calendar</p>
          <p className="truncate text-sm font-bold">
            {isLoading ? 'Loading entries' : todayEntryCount > 0 ? `${todayEntryCount} today` : 'No entries today'}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        {upcomingEntries.length > 0 ? (
          upcomingEntries.map((entry) => (
            <div key={entry.id} className="min-w-0 rounded bg-black/15 px-2 py-1.5">
              <p className="truncate text-xs font-bold text-white">{formatSidebarCalendarDate(entry.date)} - {entry.category}</p>
              <p className="truncate text-[11px] font-semibold text-blue-100">{entry.dutyHours || entry.specialStatus || entry.districtWorked || 'Calendar entry'}</p>
            </div>
          ))
        ) : (
          <p className="rounded bg-black/15 px-2 py-2 text-xs font-semibold text-blue-100">
            {isLoading ? 'Checking calendar...' : 'No upcoming entries'}
          </p>
        )}
      </div>
    </button>
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
        data-onboarding-target="global-search"
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
    <form data-onboarding-target="global-search" onSubmit={handleSubmit} className="relative flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-100" size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setIsResultsOpen(true);
            }
          }}
          placeholder="Global search"
          className="global-search-input h-11 w-full rounded border border-white/10 bg-white/10 py-2 text-sm text-white outline-none placeholder:text-blue-100 focus:border-white/40 focus:bg-white/15"
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
                  className="flex w-full min-w-0 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <img
                    src={getAssetUrl(user.profilePictureUrl)}
                    alt={`${user.firstName} ${user.lastName}`}
                    onError={handleAssetImageError}
                    className="mr-3 h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {user.email || `PE ${user.peNumber || 'N/A'}`} - {user.district || 'No district'}
                    </p>
                  </div>
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
  unreadCount,
  onOpenMessages,
}: {
  unreadCount: number;
  onOpenMessages: () => void;
}) {
  return (
    <button
      data-onboarding-control="messages"
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

function CalculatorModal({ onClose, onFocus, zIndex }: { onClose: () => void; onFocus: () => void; zIndex: number }) {
  const [display, setDisplay] = useState('0');
  const [position, setPosition] = useState({ x: Math.max(12, window.innerWidth - 400), y: 112 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const calculatorRef = useRef<HTMLDivElement | null>(null);
  const buttons = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', '+'];

  const appendValue = useCallback((value: string) => {
    if (value === 'C') {
      setDisplay('0');
      return;
    }

    setDisplay((current) => (current === '0' ? value : `${current}${value}`));
  }, []);

  const deleteLast = useCallback(() => {
    setDisplay((current) => current.slice(0, -1) || '0');
  }, []);

  const calculate = useCallback(() => {
    if (!/^[\d+\-*/. ()]+$/u.test(display)) {
      setDisplay('Error');
      return;
    }

    try {
      const result = Function(`"use strict"; return (${display})`)();
      setDisplay(Number.isFinite(result) ? String(Number(result.toFixed(8))) : 'Error');
    } catch {
      setDisplay('Error');
    }
  }, [display]);

  useEffect(() => {
    calculatorRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isDragging) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const width = calculatorRef.current?.offsetWidth || 360;
      const height = calculatorRef.current?.offsetHeight || 420;
      const maxX = Math.max(12, window.innerWidth - width - 12);
      const maxY = Math.max(12, window.innerHeight - height - 12);
      const nextX = Math.min(Math.max(12, event.clientX - dragOffsetRef.current.x), maxX);
      const nextY = Math.min(Math.max(12, event.clientY - dragOffsetRef.current.y), maxY);
      setPosition({ x: nextX, y: nextY });
    };

    const stopDragging = () => setIsDragging(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [isDragging]);

  useEffect(() => {
    const keepInView = () => {
      const width = calculatorRef.current?.offsetWidth || 360;
      const height = calculatorRef.current?.offsetHeight || 420;
      const maxX = Math.max(12, window.innerWidth - width - 12);
      const maxY = Math.max(12, window.innerHeight - height - 12);
      setPosition((current) => ({
        x: Math.min(Math.max(12, current.x), maxX),
        y: Math.min(Math.max(12, current.y), maxY),
      }));
    };

    window.addEventListener('resize', keepInView);

    return () => window.removeEventListener('resize', keepInView);
  }, []);

  const startDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    onFocus();

    const rect = calculatorRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDragging(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();

    if (/^\d$/u.test(key) || ['+', '-', '/', '.', '(', ')'].includes(key)) {
      event.preventDefault();
      appendValue(key);
      return;
    }

    if (key === '*' || key === 'x') {
      event.preventDefault();
      appendValue('*');
      return;
    }

    if (key === 'enter' || key === '=') {
      event.preventDefault();
      calculate();
      return;
    }

    if (key === 'backspace') {
      event.preventDefault();
      deleteLast();
      return;
    }

    if (key === 'c') {
      event.preventDefault();
      appendValue('C');
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0" style={{ zIndex }}>
      <div
        ref={calculatorRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseDown={() => {
          onFocus();
          calculatorRef.current?.focus();
        }}
        className="pointer-events-auto fixed w-[calc(100vw-1.5rem)] max-w-sm rounded-lg bg-white p-4 shadow-2xl outline-none ring-1 ring-gray-200 transition-shadow focus:ring-2 focus:ring-accent dark:bg-gray-900 dark:ring-gray-800"
        style={{ left: position.x, top: position.y }}
      >
        <div
          onPointerDown={startDragging}
          className={`mb-4 flex touch-none cursor-grab select-none items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800 ${isDragging ? 'cursor-grabbing' : ''}`}
        >
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Calculator</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Drag to move. Type numbers or operators.</p>
          </div>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} className="icon-close-button" aria-label="Close calculator" title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="mb-3 min-h-16 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-right text-3xl font-bold text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100">
          {display}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {buttons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => appendValue(button)}
              className={`flex h-12 items-center justify-center rounded border text-lg font-bold transition ${
                ['/', '*', '-', '+'].includes(button)
                  ? 'border-accent bg-accent/10 text-accent hover:bg-accent/15'
                  : button === 'C'
                    ? 'border-red-200 bg-red-50 text-danger hover:bg-red-100 dark:border-red-900 dark:bg-red-950'
                    : 'border-gray-200 bg-white text-primary-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-blue-100'
              }`}
            >
              {button === '*' ? 'x' : button}
            </button>
          ))}
          <button type="button" onClick={deleteLast} className="flex h-12 items-center justify-center rounded border border-gray-200 bg-white text-lg font-bold text-primary-500 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-blue-100">
            DEL
          </button>
          <button type="button" onClick={calculate} className="col-span-3 flex h-12 items-center justify-center rounded bg-primary-500 text-lg font-bold text-white hover:bg-primary-600">
            =
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickLaunchTray({
  isAdministrator,
  isSidebarCollapsed,
  badgeCounts,
  activeModalApps,
  storageKey,
  accountId,
  onOpenMessages,
  onOpenCalendar,
  onOpenCalculator,
  onOpenCreateUser,
}: {
  isAdministrator: boolean;
  isSidebarCollapsed: boolean;
  badgeCounts: Partial<Record<QuickLaunchAppId, number>>;
  activeModalApps: QuickLaunchAppId[];
  storageKey: string;
  accountId?: string;
  onOpenMessages: () => void;
  onOpenCalendar: () => void;
  onOpenCalculator: () => void;
  onOpenCreateUser: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [slots, setSlots] = useState<QuickLaunchSlot[]>(getEmptyQuickLaunchSlots);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const didDragSlotRef = useRef(false);
  const [externalLabel, setExternalLabel] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const availableApps = quickLaunchApps.filter((app) => !app.adminOnly || isAdministrator);
  const usedAppIds = new Set(
    slots
      .map((slot, index) => (index === editingSlot ? null : slot))
      .filter((slot): slot is QuickLaunchAppId => typeof slot === 'string'),
  );
  const editingExternalSlot = editingSlot !== null && isExternalQuickLaunchSlot(slots[editingSlot]) ? slots[editingSlot] : null;
  const activeModalAppSet = useMemo(() => new Set(activeModalApps), [activeModalApps]);

  const isAppActive = (app: QuickLaunchApp) => {
    if (activeModalAppSet.has(app.id)) {
      return true;
    }

    return Boolean(app.path && location.pathname === app.path);
  };

  const saveQuickLaunchSlots = useCallback(async (nextSlots: QuickLaunchSlot[]) => {
    const normalizedSlots = normalizeQuickLaunchSlots(nextSlots);
    setSlots(normalizedSlots);
    saveLegacyQuickLaunchSlots(storageKey, normalizedSlots);

    try {
      const response = await quickLaunchService.save(normalizedSlots as ApiQuickLaunchSlot[]);
      const savedSlots = normalizeQuickLaunchSlots(response.data.slots);
      setSlots(savedSlots);
      saveLegacyQuickLaunchSlots(storageKey, savedSlots);
    } catch (err) {
      console.error('Failed to save quick launch:', err);
    }
  }, [storageKey]);

  const loadQuickLaunchFromDatabase = useCallback(async () => {
    if (!accountId) {
      setSlots(getEmptyQuickLaunchSlots());
      return;
    }

    try {
      const response = await quickLaunchService.get();
      const databaseSlots = normalizeQuickLaunchSlots(response.data.slots);
      const hasDatabaseSlots = databaseSlots.some(Boolean);

      if (!hasDatabaseSlots) {
        const legacySlots = loadLegacyQuickLaunchSlots(storageKey);
        if (legacySlots.some(Boolean)) {
          setSlots(legacySlots);
          try {
            await quickLaunchService.save(legacySlots as ApiQuickLaunchSlot[]);
          } catch (saveError) {
            console.error('Failed to migrate quick launch slots:', saveError);
          }
          return;
        }
      }

      setSlots(databaseSlots);
      saveLegacyQuickLaunchSlots(storageKey, databaseSlots);
    } catch (err) {
      console.error('Failed to load quick launch:', err);
      setSlots(loadLegacyQuickLaunchSlots(storageKey));
    }
  }, [accountId, storageKey]);

  useEffect(() => {
    loadQuickLaunchFromDatabase();
  }, [loadQuickLaunchFromDatabase]);

  useEffect(() => {
    window.addEventListener('shield:quick-launch-updated', loadQuickLaunchFromDatabase);
    return () => window.removeEventListener('shield:quick-launch-updated', loadQuickLaunchFromDatabase);
  }, [loadQuickLaunchFromDatabase]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && editingSlot !== null) {
        event.stopImmediatePropagation();
        setEditingSlot(null);
        setExternalLabel('');
        setExternalUrl('');
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [editingSlot]);

  const openSlot = (slot: NonNullable<QuickLaunchSlot>) => {
    if (isExternalQuickLaunchSlot(slot)) {
      const url = /^https?:\/\//iu.test(slot.url) ? slot.url : `https://${slot.url}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    const app = availableApps.find((item) => item.id === slot);
    if (!app) return;

    if (app.id === 'messages') {
      onOpenMessages();
      return;
    }

    if (app.id === 'calendar') {
      onOpenCalendar();
      return;
    }

    if (app.id === 'calculator') {
      onOpenCalculator();
      return;
    }

    if (app.id === 'create-user') {
      onOpenCreateUser();
      return;
    }

    if (app.path) {
      navigate(location.pathname === app.path ? '/' : app.path);
    }
  };

  const assignSlot = (slot: QuickLaunchSlot) => {
    if (editingSlot === null) return;
    const nextSlots = slots.map((currentSlot, index) => (index === editingSlot ? slot : currentSlot));
    void saveQuickLaunchSlots(nextSlots);
    setEditingSlot(null);
    setExternalLabel('');
    setExternalUrl('');
  };

  const assignExternalSlot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!externalLabel.trim() || !externalUrl.trim()) return;

    assignSlot({
      type: 'external',
      label: externalLabel.trim(),
      url: externalUrl.trim(),
    });
  };

  const moveSlot = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const nextSlots = [...slots];
    const [movedSlot] = nextSlots.splice(fromIndex, 1);
    nextSlots.splice(toIndex, 0, movedSlot);
    void saveQuickLaunchSlots(nextSlots);
  };

  return (
    <section className={`fixed bottom-3 left-3 right-3 z-30 transition-all duration-200 sm:bottom-5 sm:right-6 ${isSidebarCollapsed ? 'sm:left-24' : 'sm:left-[19.5rem]'}`}>
      <div data-onboarding-target="quick-launch" className="mx-auto w-fit max-w-full rounded-2xl border border-gray-200 bg-white/85 p-2 shadow-[0_16px_45px_rgba(15,23,42,0.18)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/80 sm:p-3">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 sm:gap-2">
        {slots.map((slot, index) => {
          const app = typeof slot === 'string' ? availableApps.find((item) => item.id === slot) || null : null;
          const isExternal = isExternalQuickLaunchSlot(slot);
          const Icon = app?.icon || (isExternal ? ExternalLink : null);
          const label = app?.label || (isExternal ? slot.label : 'Add');
          const badgeCount = app ? badgeCounts[app.id] || 0 : 0;
          const isActive = app ? isAppActive(app) : false;

          return (
            <div
              key={`quick-launch-${index}`}
              className="relative"
              draggable={Boolean(slot)}
              onDragStart={(event) => {
                if (!slot) {
                  event.preventDefault();
                  return;
                }

                didDragSlotRef.current = true;
                setDraggingSlot(index);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(event) => {
                if (draggingSlot === null || draggingSlot === index) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
                if (!Number.isNaN(sourceIndex)) {
                  moveSlot(sourceIndex, index);
                }
                setDraggingSlot(null);
              }}
              onDragEnd={() => {
                setDraggingSlot(null);
                window.setTimeout(() => {
                  didDragSlotRef.current = false;
                }, 0);
              }}
            >
              <button
                type="button"
                draggable={Boolean(slot)}
                onClick={() => {
                  if (didDragSlotRef.current) {
                    return;
                  }
                  if (slot) {
                    openSlot(slot);
                    return;
                  }
                  setEditingSlot(index);
                }}
                onDragStart={(event) => {
                  if (!slot) {
                    event.preventDefault();
                    return;
                  }

                  didDragSlotRef.current = true;
                  setDraggingSlot(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                className={`flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-[10px] font-bold transition sm:h-16 sm:w-16 ${
                  slot
                    ? `${draggingSlot === index ? 'scale-95 opacity-50' : ''} ${isActive ? 'translate-y-[-3px] border-accent bg-accent/10 text-accent shadow-md' : 'border-gray-200 bg-white text-primary-500 shadow-sm'} cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:border-accent hover:text-accent dark:border-gray-800 dark:bg-gray-900 dark:text-blue-100`
                    : 'border-gray-300 bg-white/60 text-gray-400 hover:border-accent hover:text-accent dark:border-gray-800 dark:bg-gray-900/60'
                }`}
                title={label || 'Add App'}
              >
                {Icon ? <Icon size={20} /> : <Plus size={22} />}
                <span className="hidden max-w-14 truncate sm:block">{label}</span>
              </button>

              {isActive && (
                <span className="absolute -bottom-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-accent shadow" />
              )}

              {badgeCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white shadow">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}

              {slot && (
                <button
                  type="button"
                  onClick={() => setEditingSlot(index)}
                  className="absolute -bottom-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 shadow-sm hover:bg-gray-200 hover:text-primary-500 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  aria-label={`Change ${label} shortcut`}
                  title="Change shortcut"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {editingSlot !== null && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="modal-window w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-2xl dark:bg-gray-900 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Choose App</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select what this quick-launch box should open.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingSlot(null);
                  setExternalLabel('');
                  setExternalUrl('');
                }}
                className="icon-close-button"
                aria-label="Close quick launch picker"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {availableApps.map((app) => {
                const Icon = app.icon;
                const isAlreadyUsed = usedAppIds.has(app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => assignSlot(app.id)}
                    disabled={isAlreadyUsed}
                    className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3 text-left text-sm font-bold text-gray-800 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-800 dark:text-gray-100 dark:hover:border-accent dark:disabled:bg-gray-950 dark:disabled:text-gray-600"
                    title={isAlreadyUsed ? 'Already in your dock' : app.label}
                  >
                    <Icon size={18} />
                    <span className="min-w-0 flex-1">{app.label}</span>
                    {isAlreadyUsed && <span className="text-xs font-semibold text-gray-400">Added</span>}
                  </button>
                );
              })}
              {editingExternalSlot && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-danger dark:border-red-900 dark:bg-red-950/40 sm:col-span-2">
                  <p className="font-bold">External site in this box</p>
                  <p className="mt-1 break-all">{editingExternalSlot.label} - {editingExternalSlot.url}</p>
                  <button
                    type="button"
                    onClick={() => assignSlot(null)}
                    className="mt-3 flex w-full items-center gap-3 rounded border border-danger bg-white px-4 py-3 text-left text-sm font-bold text-danger hover:bg-red-50 dark:bg-gray-950 dark:hover:bg-red-950"
                  >
                    <Trash2 size={18} />
                    Remove external site from this box
                  </button>
                </div>
              )}
              <form onSubmit={assignExternalSlot} className="rounded border border-gray-200 p-3 dark:border-gray-800 sm:col-span-2">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
                  <Link size={18} />
                  External Site
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                  <input
                    value={externalLabel}
                    onChange={(event) => setExternalLabel(event.target.value)}
                    placeholder="Name"
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                  <input
                    value={externalUrl}
                    onChange={(event) => setExternalUrl(event.target.value)}
                    placeholder="https://example.com"
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  />
                  <button type="submit" className="btn-primary" aria-label="Add external site">
                    <Plus size={16} />
                  </button>
                </div>
              </form>
              <button
                type="button"
                onClick={() => assignSlot(null)}
                className="flex items-center gap-3 rounded border border-danger px-4 py-3 text-left text-sm font-bold text-danger hover:bg-red-50 dark:hover:bg-red-950 sm:col-span-2"
              >
                <Trash2 size={18} />
                Clear this box
              </button>
            </div>
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

function CalendarRouteRedirect({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  useEffect(() => {
    onOpenCalendar();
  }, [onOpenCalendar]);

  return <Navigate to="/" replace />;
}

function CreateUserRouteRedirect({ onOpenCreateUser }: { onOpenCreateUser: () => void }) {
  useEffect(() => {
    onOpenCreateUser();
  }, [onOpenCreateUser]);

  return <Navigate to="/" replace />;
}

function AdminRouteRedirect({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  useEffect(() => {
    onOpenAdmin();
  }, [onOpenAdmin]);

  return <Navigate to="/" replace />;
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
          This page does not exist in SHIELD, or it may have moved.
        </p>
        <NavLink to="/" className="btn-primary mt-6 inline-flex">
          Back to Dashboard
        </NavLink>
      </section>
    </div>
  );
}

function PageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center">
      <div className="loading">{label}</div>
    </div>
  );
}

function getInitialMessagesModalPosition() {
  const width = Math.min(window.innerWidth - 16, 900);
  return {
    x: Math.max(8, (window.innerWidth - width) / 2),
    y: Math.max(8, window.innerHeight * 0.08),
  };
}

function getModalBackdropClass(isClosing: boolean, tint = 'bg-black/50') {
  return `${isClosing ? 'modal-backdrop-exit' : 'modal-backdrop'} fixed inset-0 z-50 flex items-end justify-center sm:items-center ${tint}`;
}

function getModalWindowClass(isClosing: boolean, className: string) {
  return `${isClosing ? 'modal-window-exit' : 'modal-window'} ${className}`;
}

function ReportBugModal({
  onClose,
  onToast,
  onSubmitted,
}: {
  onClose: () => void;
  onToast: (type: ToastType, message: string) => void;
  onSubmitted: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState<BugReportPriority>('Normal');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitBug = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !description.trim()) {
      onToast('error', 'Bug title and description are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await bugReportService.create({ title, description, location, priority });
      onToast('success', 'Bug report submitted.');
      onSubmitted();
      onClose();
    } catch (err) {
      console.error(err);
      onToast('error', getErrorMessage(err, 'Failed to submit bug report.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={submitBug} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Title</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Where did it happen?</span>
        <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Messages, Calendar, Devices, etc." className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Priority</span>
        <select value={priority} onChange={(event) => setPriority(event.target.value as BugReportPriority)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
          {['Low', 'Normal', 'High', 'Critical'].map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">What happened?</span>
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-36 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary" aria-label="Cancel bug report" title="Cancel"><X size={16} /></button>
        <button type="submit" className="btn-primary" disabled={isSubmitting} aria-label="Submit bug report" title={isSubmitting ? 'Submitting' : 'Submit Bug'}><Bug size={16} /></button>
      </div>
    </form>
  );
}

function BugTrackerModal({
  reports,
  onStatusChange,
}: {
  reports: BugReport[];
  onStatusChange: (report: BugReport, status: BugReportStatus, adminNotes: string) => void;
}) {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(reports[0]?.id || null);
  const selectedReport = reports.find((report) => report.id === selectedReportId) || reports[0] || null;
  const [status, setStatus] = useState<BugReportStatus>(selectedReport?.status || 'New');
  const [adminNotes, setAdminNotes] = useState(selectedReport?.adminNotes || '');

  useEffect(() => {
    if (!selectedReport) return;
    setStatus(selectedReport.status);
    setAdminNotes(selectedReport.adminNotes || '');
  }, [selectedReport?.id]);

  return (
    <div className="grid min-h-[520px] grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="min-h-0 overflow-y-auto rounded border border-gray-200 dark:border-gray-800">
        {reports.length === 0 ? (
          <div className="empty-state">No bug reports found.</div>
        ) : (
          reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => setSelectedReportId(report.id)}
              className={`block w-full border-b border-gray-200 px-4 py-3 text-left last:border-b-0 dark:border-gray-800 ${selectedReport?.id === report.id ? 'bg-accent/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-1 font-bold text-gray-900 dark:text-gray-100">{report.title}</p>
                <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{report.status}</span>
              </div>
              <p className="mt-1 line-clamp-1 text-sm text-gray-500 dark:text-gray-400">{report.location || 'No location'} - {report.priority}</p>
              <p className="mt-1 text-xs text-gray-400">{new Date(report.createdAt).toLocaleString()}</p>
            </button>
          ))
        )}
      </section>
      <section className="rounded border border-gray-200 p-4 dark:border-gray-800">
        {!selectedReport ? (
          <div className="empty-state">Select a bug report.</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedReport.title}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Reported by {selectedReport.reporterName || selectedReport.reporterEmail || 'Unknown'} on {new Date(selectedReport.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded bg-accent/10 px-3 py-1 text-sm font-bold text-accent">{selectedReport.priority}</span>
              </div>
              <p className="mt-3 rounded bg-gray-50 p-3 text-sm leading-6 text-gray-700 dark:bg-gray-950 dark:text-gray-300">{selectedReport.description}</p>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as BugReportStatus)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                {['New', 'Pending', 'Fixed', 'Closed'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Admin notes</span>
              <textarea value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} className="min-h-32 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
            </label>
            <button type="button" onClick={() => onStatusChange(selectedReport, status, adminNotes)} className="btn-primary" aria-label="Save bug status" title="Save Bug Status">
              <Save size={16} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

interface OnboardingStep {
  target: string;
  eyebrow: string;
  title: string;
  body: string;
  placement?: 'right' | 'below';
}

const onboardingSteps: OnboardingStep[] = [
  {
    target: 'workspace',
    eyebrow: 'Start Here',
    title: 'Your daily workspace',
    body: 'The dashboard is the first stop for live user totals, updates, news, and the main work happening across SHIELD.',
  },
  {
    target: 'global-search',
    eyebrow: 'Search',
    title: 'Find users quickly',
    body: 'Search by name, email, PE number, badge, district, or other user details. Results appear live while you type.',
  },
  {
    target: 'profile-card',
    eyebrow: 'Profile',
    title: 'Open your profile',
    body: 'Click your profile picture to update your photo, review your account, change your password, or set up authenticator app MFA.',
  },
  {
    target: 'navigation',
    eyebrow: 'Navigation',
    title: 'Move through the system',
    body: 'Use the left navigation for dashboard, calendar, devices, reports, and admin tools based on your permissions.',
  },
  {
    target: 'notifications',
    eyebrow: 'Alerts',
    title: 'Check notifications',
    body: 'Open notifications for system alerts, bug updates, flagged comments, and other activity that needs attention.',
    placement: 'below',
  },
  {
    target: 'messages',
    eyebrow: 'Messages',
    title: 'Open conversations',
    body: 'Use messages for real-time chats, unread message badges, group conversations, emojis, and attachments.',
    placement: 'below',
  },
  {
    target: 'theme',
    eyebrow: 'Theme',
    title: 'Switch light or dark mode',
    body: 'Toggle the application theme whenever you want a lighter or darker workspace.',
    placement: 'below',
  },
  {
    target: 'settings',
    eyebrow: 'Settings',
    title: 'Account and preferences',
    body: 'Open account settings, preferences, admin tools, and sign out from the account menu.',
    placement: 'below',
  },
  {
    target: 'quick-launch',
    eyebrow: 'Quick Launch',
    title: 'Customize your dock',
    body: 'Click an empty box or the small plus on an app to choose what it opens. Drag apps left or right to reorder the dock, and watch badges for items like unread messages.',
    placement: 'right',
  },
];

const findOnboardingElement = (target: string) =>
  document.querySelector<HTMLElement>(`[data-onboarding-target="${target}"], [data-onboarding-control="${target}"]`);

function FirstLoginGuide({
  account,
  onFinish,
  onLater,
}: {
  account: AuthAccount;
  onFinish: () => void;
  onLater: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const step = onboardingSteps[stepIndex];

  const goToStep = (nextIndex: number) => {
    setAnimationKey((key) => key + 1);
    setStepIndex(nextIndex);
  };

  useEffect(() => {
    let frame = 0;

    const measureTarget = () => {
      const target = findOnboardingElement(step.target);
      if (!target) {
        setTargetRect(null);
        return;
      }

      setTargetRect(target.getBoundingClientRect());
    };

    const scrollToTarget = () => {
      const target = findOnboardingElement(step.target);
      target?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      window.setTimeout(measureTarget, 220);
    };

    frame = window.requestAnimationFrame(scrollToTarget);
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [step.target]);

  const padding = 10;
  const safeRect = targetRect
    ? {
        top: Math.max(8, targetRect.top - padding),
        left: Math.max(8, targetRect.left - padding),
        width: Math.min(window.innerWidth - Math.max(8, targetRect.left - padding) - 8, targetRect.width + padding * 2),
        height: Math.min(window.innerHeight - Math.max(8, targetRect.top - padding) - 8, targetRect.height + padding * 2),
      }
    : null;
  const tooltipWidth = Math.min(360, window.innerWidth - 32);
  const tooltipHeightEstimate = 280;
  const shouldPlaceTooltipBelow = step.placement === 'below';
  const shouldPlaceQuickLaunchTooltipAbove = step.target === 'quick-launch';
  const tooltipLeft = safeRect
    ? shouldPlaceTooltipBelow || shouldPlaceQuickLaunchTooltipAbove
      ? Math.min(Math.max(16, safeRect.left + safeRect.width / 2 - tooltipWidth / 2), window.innerWidth - tooltipWidth - 16)
      : Math.min(Math.max(16, safeRect.left + safeRect.width + 18), window.innerWidth - tooltipWidth - 16)
    : Math.max(16, (window.innerWidth - tooltipWidth) / 2);
  const tooltipTop = safeRect
    ? shouldPlaceQuickLaunchTooltipAbove
      ? Math.max(16, safeRect.top - tooltipHeightEstimate - 64)
      : shouldPlaceTooltipBelow
      ? Math.min(Math.max(16, safeRect.top + safeRect.height + 18), window.innerHeight - tooltipHeightEstimate - 16)
      : Math.min(Math.max(16, safeRect.top), window.innerHeight - tooltipHeightEstimate - 16)
    : Math.max(16, (window.innerHeight - tooltipHeightEstimate) / 2);

  const isLastStep = stepIndex === onboardingSteps.length - 1;

  return (
    <div className="fixed inset-0 z-[90] pointer-events-auto">
      {safeRect ? (
        <>
          <div className="absolute left-0 right-0 top-0 bg-black/55 backdrop-blur-sm transition-all duration-300 ease-out" style={{ height: safeRect.top }} />
          <div className="absolute left-0 bg-black/55 backdrop-blur-sm transition-all duration-300 ease-out" style={{ top: safeRect.top, width: safeRect.left, height: safeRect.height }} />
          <div className="absolute bg-black/55 backdrop-blur-sm transition-all duration-300 ease-out" style={{ left: safeRect.left + safeRect.width, right: 0, top: safeRect.top, height: safeRect.height }} />
          <div className="absolute bottom-0 left-0 right-0 bg-black/55 backdrop-blur-sm transition-all duration-300 ease-out" style={{ top: safeRect.top + safeRect.height }} />
          <div
            className="onboarding-spotlight absolute rounded-xl border-2 border-accent transition-all duration-300 ease-out"
            style={{ top: safeRect.top, left: safeRect.left, width: safeRect.width, height: safeRect.height }}
          />
          {step.target === 'quick-launch' && (
            <>
              <div
                className="onboarding-control-label pointer-events-none fixed rounded-full border border-accent/40 bg-white px-3 py-1.5 text-xs font-bold text-accent shadow-lg dark:bg-gray-900"
                style={{
                  left: Math.max(16, safeRect.left + 12),
                  top: Math.max(16, safeRect.top - 44),
                }}
              >
                Click a blank spot to add an app
              </div>
              <div
                className="onboarding-control-label pointer-events-none fixed rounded-full border border-accent/40 bg-white px-3 py-1.5 text-xs font-bold text-accent shadow-lg dark:bg-gray-900"
                style={{
                  left: Math.min(Math.max(16, safeRect.left + safeRect.width - 190), window.innerWidth - 206),
                  top: Math.max(16, safeRect.top - 44),
                }}
              >
                Drag icons to reorder
              </div>
            </>
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      )}

      <div
        key={`tip-${animationKey}`}
        className="pointer-events-auto fixed w-[calc(100vw-2rem)] max-w-[360px] rounded-lg border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        style={{ left: tooltipLeft, top: tooltipTop, maxWidth: tooltipWidth }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{step.eyebrow}</p>
            <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{step.title}</h2>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary-500 text-white">
            <Shield size={20} />
          </div>
        </div>
        <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">{step.body}</p>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-500">
          Signed in as {account.displayName || account.email}
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
            {stepIndex + 1} / {onboardingSteps.length}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onLater} className="rounded px-3 py-2 text-sm font-bold text-gray-500 hover:text-primary-500 dark:text-gray-400">
              Later
            </button>
            {stepIndex > 0 && (
              <button type="button" onClick={() => goToStep(stepIndex - 1)} className="btn-secondary px-3 py-2">
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLastStep ? onFinish() : goToStep(stepIndex + 1))}
              className="btn-primary px-4 py-2"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeSplash({
  account,
  onStart,
  onLater,
}: {
  account: AuthAccount;
  onStart: () => void;
  onLater: () => void;
}) {
  const welcomeName = account.displayName || account.email;
  const tourHighlights = [
    { label: 'Find people', detail: 'Search profiles, districts, and contact details.', Icon: Search },
    { label: 'Work faster', detail: 'Open messages, calendar, and dock tools quickly.', Icon: CalendarDays },
    { label: 'Report issues', detail: 'Send bugs and feedback during the beta.', Icon: Bug },
  ];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center overflow-hidden bg-primary-500 px-4 py-8 text-white">
      <div className="pointer-events-none absolute inset-0 welcome-grid opacity-55" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(156,134,92,0.34),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.15),transparent_24%),linear-gradient(135deg,rgba(16,38,70,0.96),rgba(10,19,32,0.98))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/10 to-transparent" />
      <div className="pointer-events-none absolute inset-0 welcome-scanline" />

      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute -left-16 top-16 h-72 w-72 rounded-full bg-accent/25 blur-3xl animate-welcome-glow" />
        <div className="absolute right-[-4rem] top-24 h-60 w-60 rounded-full bg-blue-300/15 blur-3xl animate-welcome-glow" />
        <div className="absolute bottom-[-6rem] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-white/[0.97] text-gray-900 shadow-[0_35px_120px_rgba(0,0,0,0.38)] ring-1 ring-white/20 backdrop-blur-xl dark:bg-gray-950/[0.96] dark:text-gray-100 animate-welcome-pop">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-white to-accent" />
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="relative overflow-hidden bg-primary-500 p-7 text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(156,134,92,0.36),transparent_34%),linear-gradient(160deg,rgba(255,255,255,0.08),transparent_44%)]" />
            <div className="relative flex min-h-full flex-col justify-between gap-8">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-100">First Login</p>
                <div className="mt-8 flex justify-center">
                  <div className="relative flex h-32 w-32 items-center justify-center rounded-3xl bg-white text-primary-500 shadow-[0_28px_90px_rgba(0,0,0,0.26)] welcome-shield-float">
                    <div className="absolute -inset-4 rounded-[2rem] border border-accent/45 animate-welcome-ring" />
                    <div className="absolute -inset-8 rounded-[2.5rem] border border-white/15" />
                    <Shield size={58} className="relative z-10" />
                  </div>
                </div>
              </div>
              <div className="relative rounded-lg border border-white/15 bg-white/10 p-4 backdrop-blur">
                <p className="text-sm font-bold">SHIELD is ready</p>
                <p className="mt-2 text-sm leading-6 text-blue-100">
                  Your secure workspace is set up. The guide will walk you through the areas that matter first.
                </p>
              </div>
            </div>
          </div>

          <div className="p-7 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Welcome to SHIELD</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-normal text-gray-950 dark:text-white sm:text-5xl">
              Welcome, {welcomeName}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600 dark:text-gray-300">
              Before you start working, take a quick guided tour of the dashboard, navigation, notifications, messages, settings, and quick launch dock.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              SHIELD is in beta. If something feels off, use Report a Bug so admins can review and track it.
            </p>

            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {tourHighlights.map(({ label, detail, Icon }, index) => (
                <div
                  key={label}
                  className="welcome-feature-card rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900"
                  style={{ animationDelay: `${130 + index * 90}ms` }}
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded bg-accent/15 text-accent">
                    <Icon size={18} />
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={onLater}
                className="btn-secondary w-full sm:w-auto"
              >
                Maybe later
              </button>
              <button
                type="button"
                onClick={onStart}
                className="btn-primary w-full shadow-lg shadow-primary-500/20 sm:w-auto"
              >
                Start the guide
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfettiOverlay() {
  const fireworkColors = ['#9C865C', '#60a5fa', '#f8fafc', '#facc15', '#38bdf8', '#fb7185'];
  const bursts = [
    { left: '20%', top: '30%' },
    { left: '48%', top: '20%' },
    { left: '76%', top: '34%' },
    { left: '36%', top: '56%' },
    { left: '66%', top: '58%' },
  ];
  const particles = Array.from({ length: 16 }, (_, index) => index);

  return (
    <div className="pointer-events-none fixed inset-0 z-[108] overflow-hidden">
      {bursts.map((burst, burstIndex) => (
        <span
          key={`${burst.left}-${burst.top}`}
          className="firework-burst"
          style={{
            left: burst.left,
            top: burst.top,
            animationDelay: `${burstIndex * 160}ms`,
          }}
        >
          {particles.map((particle) => {
            const angle = ((Math.PI * 2) / particles.length) * particle;
            const distance = 48 + ((particle + burstIndex) % 5) * 10;
            return (
              <span
                key={particle}
                className="firework-particle"
                style={{
                  '--x': `${Math.cos(angle) * distance}px`,
                  '--y': `${Math.sin(angle) * distance}px`,
                  '--color': fireworkColors[(particle + burstIndex) % fireworkColors.length],
                  animationDelay: `${burstIndex * 160}ms`,
                } as CSSProperties}
              />
            );
          })}
        </span>
      ))}
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoginTransitioning, setIsLoginTransitioning] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthAccount | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [notifications, setNotifications] = useState<ToastMessage[]>([]);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(SESSION_TIMEOUT_KEY);
      return raw ? parseInt(raw, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const inactivityTimerRef = useRef<number | null>(null);
  const loginTransitionTimerRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isMessagesModalOpen, setIsMessagesModalOpen] = useState(false);
  const [activeFloatingApp, setActiveFloatingApp] = useState<'messages' | 'calculator'>('messages');
  const [messagesModalPosition, setMessagesModalPosition] = useState(getInitialMessagesModalPosition);
  const [isDraggingMessagesModal, setIsDraggingMessagesModal] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isAdminConsoleOpen, setIsAdminConsoleOpen] = useState(false);
  const [adminConsoleTab, setAdminConsoleTab] = useState<AdminConsoleTab>('general');
  const [isReportBugOpen, setIsReportBugOpen] = useState(false);
  const [isBugTrackerOpen, setIsBugTrackerOpen] = useState(false);
  const [isFirstLoginGuideOpen, setIsFirstLoginGuideOpen] = useState(false);
  const [isWelcomeSplashOpen, setIsWelcomeSplashOpen] = useState(false);
  const [shouldLaunchGuideAfterWelcome, setShouldLaunchGuideAfterWelcome] = useState(false);
  const [closingModal, setClosingModal] = useState<'messages' | 'calendar' | 'profile' | 'adminConsole' | 'reportBug' | 'bugTracker' | null>(null);

  useEffect(() => {
    const collapseSidebarOnMobile = () => {
      if (window.innerWidth < 768) {
        setIsSidebarCollapsed(true);
      }
    };

    collapseSidebarOnMobile();
    window.addEventListener('resize', collapseSidebarOnMobile);

    return () => window.removeEventListener('resize', collapseSidebarOnMobile);
  }, []);

  useEffect(() => {
    if (!isDraggingMessagesModal) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const width = messagesModalRef.current?.offsetWidth || Math.min(window.innerWidth - 16, 900);
      const height = messagesModalRef.current?.offsetHeight || Math.min(window.innerHeight - 16, 680);
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      const nextX = Math.min(Math.max(8, event.clientX - messagesModalDragOffsetRef.current.x), maxX);
      const nextY = Math.min(Math.max(8, event.clientY - messagesModalDragOffsetRef.current.y), maxY);
      setMessagesModalPosition({ x: nextX, y: nextY });
    };

    const stopDragging = () => setIsDraggingMessagesModal(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [isDraggingMessagesModal]);

  useEffect(() => {
    const keepMessagesModalInView = () => {
      const width = messagesModalRef.current?.offsetWidth || Math.min(window.innerWidth - 16, 900);
      const height = messagesModalRef.current?.offsetHeight || Math.min(window.innerHeight - 16, 680);
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - height - 8);
      setMessagesModalPosition((currentPosition) => ({
        x: Math.min(Math.max(8, currentPosition.x), maxX),
        y: Math.min(Math.max(8, currentPosition.y), maxY),
      }));
    };

    window.addEventListener('resize', keepMessagesModalInView);

    return () => window.removeEventListener('resize', keepMessagesModalInView);
  }, []);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [sidebarCalendarEntries, setSidebarCalendarEntries] = useState<CalendarEntry[]>([]);
  const [isSidebarCalendarLoading, setIsSidebarCalendarLoading] = useState(false);
  const previousMessageUnreadCount = useRef<number | null>(null);
  const notificationsMenuRef = useRef<HTMLDivElement | null>(null);
  const rateLimitToastRef = useRef(0);
  const notificationRequestRef = useRef(0);
  const [messagePreferences, setMessagePreferences] = useState<MessagePreferences>(() => loadMessagePreferences());
  const messagesModalRef = useRef<HTMLDivElement | null>(null);
  const messagesModalDragOffsetRef = useRef({ x: 0, y: 0 });

  const showToast = (type: ToastType, message: string, options: { saveToNotifications?: boolean } = {}) => {
    if (/too many|rate limit/iu.test(message)) {
      const now = Date.now();
      if (now - rateLimitToastRef.current < 10000) {
        return;
      }
      rateLimitToastRef.current = now;
    }

    const id = Date.now();
    const toast = { id, type, message };
    setToasts((currentToasts) => [...currentToasts, toast]);
    if (options.saveToNotifications !== false) {
      setNotifications((currentNotifications) => [toast, ...currentNotifications].slice(0, 20));
    }
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
    }, 4500);
  };

  useEffect(() => {
    if (!showConfetti) {
      return;
    }

    const timer = window.setTimeout(() => setShowConfetti(false), 2400);
    return () => window.clearTimeout(timer);
  }, [showConfetti]);

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current as unknown as number);
      inactivityTimerRef.current = null;
    }
  };

  const clearLoginTransitionTimer = () => {
    if (loginTransitionTimerRef.current) {
      window.clearTimeout(loginTransitionTimerRef.current);
      loginTransitionTimerRef.current = null;
    }
  };

  const startInactivityTimer = () => {
    clearInactivityTimer();

    if (!sessionTimeoutMinutes || sessionTimeoutMinutes <= 0) return;

    const ms = sessionTimeoutMinutes * 60 * 1000;
    inactivityTimerRef.current = window.setTimeout(() => {
      // Auto logout on inactivity
      handleLogout();
    }, ms);
  };

  const resetInactivityTimer = () => {
    lastActivityRef.current = Date.now();
    if (sessionTimeoutMinutes && sessionTimeoutMinutes > 0) {
      startInactivityTimer();
    }
  };

  useEffect(() => {
    let cleanup = () => {};

    const activityHandler = () => resetInactivityTimer();

    if (isAuthenticated && sessionTimeoutMinutes && sessionTimeoutMinutes > 0) {
      ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach((ev) => window.addEventListener(ev, activityHandler));
      startInactivityTimer();

      cleanup = () => {
        ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach((ev) => window.removeEventListener(ev, activityHandler));
        clearInactivityTimer();
      };
    }

    return cleanup;
  }, [isAuthenticated, sessionTimeoutMinutes]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(storedTheme === 'dark' || (!storedTheme && prefersDark) ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      try {
        // @ts-ignore
        const minutes = (e as CustomEvent).detail?.minutes;
        if (typeof minutes === 'number') {
          setSessionTimeoutMinutes(minutes);
          try {
            window.localStorage.setItem(SESSION_TIMEOUT_KEY, String(minutes));
          } catch {}
        }
      } catch {}
    };

    window.addEventListener('shield:session-timeout-updated', handler as EventListener);
    return () => window.removeEventListener('shield:session-timeout-updated', handler as EventListener);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(MESSAGE_PREFERENCES_KEY, JSON.stringify(messagePreferences));
  }, [messagePreferences]);

  const syncSessionTimeoutFromSettings = useCallback(async () => {
    try {
      const response = await authService.getRegistrationSettings();
      const minutes = Number(response.data.sessionTimeoutMinutes) || 0;
      setSessionTimeoutMinutes(minutes);
      window.localStorage.setItem(SESSION_TIMEOUT_KEY, String(minutes));
    } catch (err) {
      console.error('Failed to sync session timeout setting:', err);
    }
  }, []);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (!notificationsMenuRef.current?.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isNotificationsOpen]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    setMessagePreferences((preferences) => ({
      ...preferences,
      receiveMessages: currentUser.receivesMessages !== false,
    }));
  }, [currentUser?.id, currentUser?.receivesMessages]);

  const loadUserNotifications = useCallback(async () => {
    const requestId = notificationRequestRef.current + 1;
    notificationRequestRef.current = requestId;
    if (!currentUser) {
      setUserNotifications([]);
      return;
    }

    try {
      const response = await notificationService.getAll();
      if (requestId !== notificationRequestRef.current) {
        return;
      }
      setUserNotifications(response.data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadUserNotifications();
  }, [loadUserNotifications]);

  const loadSidebarCalendarEntries = useCallback(async (showLoading = false) => {
    if (!currentUser) {
      setSidebarCalendarEntries([]);
      setIsSidebarCalendarLoading(false);
      return;
    }

    if (showLoading) {
      setIsSidebarCalendarLoading(true);
    }

    try {
      const response = await calendarService.getAll(currentUser.id);
      setSidebarCalendarEntries(response.data);
    } catch (err) {
      console.error('Failed to load sidebar calendar entries:', err);
    } finally {
      setIsSidebarCalendarLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadSidebarCalendarEntries(true);

    const handleCalendarUpdate = () => {
      void loadSidebarCalendarEntries(false);
    };

    window.addEventListener('shield:calendar-updated', handleCalendarUpdate);
    return () => window.removeEventListener('shield:calendar-updated', handleCalendarUpdate);
  }, [loadSidebarCalendarEntries]);

  useEffect(() => {
    if (currentUser && !currentUser.hasCompletedOnboarding && !isWelcomeSplashOpen && shouldLaunchGuideAfterWelcome) {
      setIsFirstLoginGuideOpen(true);
    }
  }, [currentUser?.id, currentUser?.hasCompletedOnboarding, isWelcomeSplashOpen, shouldLaunchGuideAfterWelcome]);

  const playMessagePing = () => {
    if (!messagePreferences.receiveMessages || !messagePreferences.playMessageSound) {
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const gain = audioContext.createGain();
      const tones = {
        classic: [
          { type: 'triangle' as OscillatorType, frequency: 659.25, start: 0, duration: 0.14, volume: 0.12 },
          { type: 'sine' as OscillatorType, frequency: 987.77, start: 0.16, duration: 0.2, volume: 0.1 },
        ],
        soft: [
          { type: 'sine' as OscillatorType, frequency: 523.25, start: 0, duration: 0.18, volume: 0.08 },
          { type: 'sine' as OscillatorType, frequency: 659.25, start: 0.14, duration: 0.22, volume: 0.07 },
        ],
        chime: [
          { type: 'triangle' as OscillatorType, frequency: 784, start: 0, duration: 0.12, volume: 0.1 },
          { type: 'triangle' as OscillatorType, frequency: 1046.5, start: 0.11, duration: 0.16, volume: 0.09 },
          { type: 'sine' as OscillatorType, frequency: 1318.51, start: 0.24, duration: 0.18, volume: 0.07 },
        ],
      }[messagePreferences.messageSound || 'classic'];

      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.connect(audioContext.destination);

      tones.forEach((tone) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = tone.type;
        oscillator.frequency.value = tone.frequency;
        oscillator.connect(gain);
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime + tone.start);
        gain.gain.exponentialRampToValueAtTime(tone.volume, audioContext.currentTime + tone.start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + tone.start + tone.duration);
        oscillator.start(audioContext.currentTime + tone.start);
        oscillator.stop(audioContext.currentTime + tone.start + tone.duration);
      });
    } catch (err) {
      console.error('Failed to play message ping:', err);
    }
  };

  useEffect(() => {
    if (!currentUser || !messagePreferences.receiveMessages) {
      setMessageUnreadCount(0);
      previousMessageUnreadCount.current = null;
      return;
    }

    let isMounted = true;

    const loadUnreadCount = async () => {
      try {
        const response = await messageService.getInbox(currentUser.id);
        if (!isMounted) return;

        const nextUnreadCount = response.data.filter((message) => !message.isRead).length;
        if (previousMessageUnreadCount.current !== null && nextUnreadCount > previousMessageUnreadCount.current) {
          playMessagePing();
        }
        previousMessageUnreadCount.current = nextUnreadCount;
        setMessageUnreadCount(nextUnreadCount);
      } catch (err) {
        console.error('Failed to load unread messages:', err);
      }
    };

    loadUnreadCount();
    window.addEventListener('shield:messages-updated', loadUnreadCount);

    const eventsUrl = getMessageEventsUrl();
    const eventSource = eventsUrl ? new EventSource(eventsUrl) : null;
    const handleRealtimeMessageUpdate = () => loadUnreadCount();
    eventSource?.addEventListener('message-created', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-read', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-archived', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-deleted', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('error', (event) => {
      console.error('Message realtime connection error:', event);
    });

    return () => {
      isMounted = false;
      window.removeEventListener('shield:messages-updated', loadUnreadCount);
      eventSource?.close();
    };
  }, [currentUser, messagePreferences.receiveMessages, messagePreferences.playMessageSound, messagePreferences.messageSound]);

  useEffect(() => {
    authService.getSession()
      .then((response) => {
        if (response.data.account) {
          setCurrentUser(response.data.account);
          setIsAuthenticated(true);
          window.localStorage.setItem(SESSION_KEY, JSON.stringify(response.data.account));
          void syncSessionTimeoutFromSettings();

          if (!response.data.account.hasCompletedOnboarding) {
            if (!hasSeenWelcomeSplash(response.data.account.id)) {
              setIsWelcomeSplashOpen(true);
            }
            setShouldLaunchGuideAfterWelcome(true);
          }
        }
      })
      .catch(() => {
        clearAuthToken();
        window.localStorage.removeItem(SESSION_KEY);
      })
      .finally(() => setIsSessionLoading(false));
  }, [syncSessionTimeoutFromSettings]);

  const handleLogin = (account: AuthAccount) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setCurrentUser(account);
    setNotifications([]);
    setUserNotifications([]);
    notificationRequestRef.current += 1;
    setIsLoginTransitioning(true);
    void syncSessionTimeoutFromSettings();

    if (!account.hasCompletedOnboarding) {
      if (!hasSeenWelcomeSplash(account.id)) {
        setIsWelcomeSplashOpen(true);
      }
      setShouldLaunchGuideAfterWelcome(true);
    }

    clearLoginTransitionTimer();
    loginTransitionTimerRef.current = window.setTimeout(() => {
      setIsAuthenticated(true);
      setIsLoginTransitioning(false);
      loginTransitionTimerRef.current = null;
    }, 380);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // Local sign out should still complete if the server is unreachable.
    }
    clearLoginTransitionTimer();
    clearAuthToken();
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
    setIsLoginTransitioning(false);
    setIsWelcomeSplashOpen(false);
    setShouldLaunchGuideAfterWelcome(false);
    setIsFirstLoginGuideOpen(false);
    setNotifications([]);
    setUserNotifications([]);
    notificationRequestRef.current += 1;
    setMessageUnreadCount(0);
    previousMessageUnreadCount.current = null;
    clearInactivityTimer();
  };

  const handleForcedLogout = useCallback((message: string) => {
    clearLoginTransitionTimer();
    clearAuthToken();
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
    setIsLoginTransitioning(false);
    setIsWelcomeSplashOpen(false);
    setShouldLaunchGuideAfterWelcome(false);
    setIsFirstLoginGuideOpen(false);
    setNotifications([]);
    setUserNotifications([]);
    notificationRequestRef.current += 1;
    setMessageUnreadCount(0);
    previousMessageUnreadCount.current = null;
    showToast('error', message);
  }, []);

  const handleWelcomeStart = () => {
    if (!currentUser) {
      setIsWelcomeSplashOpen(false);
      setShouldLaunchGuideAfterWelcome(false);
      return;
    }

    markWelcomeSplashSeen(currentUser.id);
    setIsWelcomeSplashOpen(false);
    setShouldLaunchGuideAfterWelcome(true);
    window.setTimeout(() => setIsFirstLoginGuideOpen(true), 80);
  };

  const handleWelcomeLater = () => {
    if (currentUser) {
      markWelcomeSplashSeen(currentUser.id);
    }

    setIsWelcomeSplashOpen(false);
    setShouldLaunchGuideAfterWelcome(false);
  };

  const replayGuide = () => {
    setIsAccountMenuOpen(false);
    setIsWelcomeSplashOpen(false);
    setShouldLaunchGuideAfterWelcome(false);
    closeModal('profile');
    window.setTimeout(() => setIsFirstLoginGuideOpen(true), MODAL_CLOSE_MS + 40);
  };

  const handleAccountUpdate = (account: AuthAccount) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setCurrentUser(account);
  };

  const isAdministrator = currentUser?.role === 'administrator';
  const openBugCount = bugReports.filter((report) => report.status === 'New' || report.status === 'Pending').length;
  const unreadNotificationCount = userNotifications.filter((notification) => !notification.isRead).length;
  const shouldShowForcedPasswordModal = Boolean(
    currentUser?.mustChangePassword && !isWelcomeSplashOpen && !isFirstLoginGuideOpen,
  );

  const loadBugReports = useCallback(async () => {
    if (!isAdministrator) return;
    try {
      const response = await bugReportService.getAll();
      setBugReports(response.data);
    } catch (err) {
      console.error('Failed to load bug reports:', err);
    }
  }, [isAdministrator]);

  useEffect(() => {
    if (!isAdministrator) {
      setBugReports([]);
      return;
    }

    void loadBugReports();
  }, [isAdministrator, loadBugReports]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const eventsUrl = getAppEventsUrl();
    const eventSource = eventsUrl ? new EventSource(eventsUrl) : null;
    if (!eventSource) {
      return;
    }

    const dispatchAppUpdate = (name: string, detail?: Record<string, unknown>) => {
      window.dispatchEvent(new CustomEvent(`shield:${name}`, { detail }));
    };
    const handleNotificationUpdate = () => {
      void loadUserNotifications();
      dispatchAppUpdate('notification-updated');
    };
    const handleBugUpdate = () => {
      void loadBugReports();
      dispatchAppUpdate('bug-updated');
    };
    const syncCurrentAccount = async () => {
      try {
        const response = await authService.getSession();
        if (response.data.account) {
          handleAccountUpdate(response.data.account);
        }
      } catch (err) {
        console.error('Failed to refresh current account:', err);
      }
    };

    eventSource.addEventListener('notification-created', handleNotificationUpdate);
    eventSource.addEventListener('notification-updated', handleNotificationUpdate);
    const handleRealtimeAppUpdate = (name: string) => (event: Event) => {
      try {
        dispatchAppUpdate(name, JSON.parse((event as MessageEvent).data || '{}') as Record<string, unknown>);
      } catch {
        dispatchAppUpdate(name);
      }
    };

    eventSource.addEventListener('audit-updated', handleRealtimeAppUpdate('audit-updated'));
    eventSource.addEventListener('bug-updated', handleBugUpdate);
    eventSource.addEventListener('calendar-updated', handleRealtimeAppUpdate('calendar-updated'));
    eventSource.addEventListener('dashboard-updated', handleRealtimeAppUpdate('dashboard-updated'));
    eventSource.addEventListener('device-updated', handleRealtimeAppUpdate('device-updated'));
    eventSource.addEventListener('mileage-updated', handleRealtimeAppUpdate('mileage-updated'));
    eventSource.addEventListener('performance-evaluation-updated', handleRealtimeAppUpdate('performance-evaluation-updated'));
    eventSource.addEventListener('permission-updated', (event) => {
      void syncSessionTimeoutFromSettings();
      handleRealtimeAppUpdate('permission-updated')(event);
    });
    eventSource.addEventListener('quick-launch-updated', handleRealtimeAppUpdate('quick-launch-updated'));
    eventSource.addEventListener('session-revoked', () => handleForcedLogout('Your account has been deactivated. Please contact an administrator.'));
    eventSource.addEventListener('user-updated', (event) => {
      let payload: { entityId?: string } = {};
      try {
        payload = JSON.parse((event as MessageEvent).data || '{}') as { entityId?: string };
      } catch {
        payload = {};
      }

      if (!payload.entityId || payload.entityId === currentUser.id) {
        void syncCurrentAccount();
      }
      dispatchAppUpdate('user-updated', payload);
    });
    eventSource.addEventListener('error', (event) => {
      console.error('Application realtime connection error:', event);
    });

    return () => eventSource.close();
  }, [currentUser, handleForcedLogout, loadBugReports, loadUserNotifications, syncSessionTimeoutFromSettings]);

  const closeModal = (modal: 'messages' | 'calendar' | 'profile' | 'adminConsole' | 'reportBug' | 'bugTracker') => {
    setClosingModal(modal);
    window.setTimeout(() => {
      if (modal === 'messages') setIsMessagesModalOpen(false);
      if (modal === 'calendar') setIsCalendarModalOpen(false);
      if (modal === 'profile') setIsProfileModalOpen(false);
      if (modal === 'adminConsole') setIsAdminConsoleOpen(false);
      if (modal === 'reportBug') setIsReportBugOpen(false);
      if (modal === 'bugTracker') setIsBugTrackerOpen(false);
      setClosingModal(null);
    }, MODAL_CLOSE_MS);
  };

  const toggleMessagesModal = () => {
    if (isMessagesModalOpen) {
      closeModal('messages');
      return;
    }

    setMessagesModalPosition(getInitialMessagesModalPosition());
    setActiveFloatingApp('messages');
    setIsMessagesModalOpen(true);
  };

  const startDraggingMessagesModal = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    setActiveFloatingApp('messages');

    const rect = messagesModalRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    messagesModalDragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    setIsDraggingMessagesModal(true);
  };

  const toggleCalendarModal = () => {
    if (isCalendarModalOpen) {
      closeModal('calendar');
      return;
    }

    setIsCalendarModalOpen(true);
  };

  const openCalculator = () => {
    setActiveFloatingApp('calculator');
    setIsCalculatorOpen(true);
  };

  const toggleCreateUserModal = () => {
    if (isAdminConsoleOpen && adminConsoleTab === 'create-user') {
      closeModal('adminConsole');
      return;
    }

    setAdminConsoleTab('create-user');
    setIsAdminConsoleOpen(true);
  };

  const openAdminConsole = (tab: AdminConsoleTab = 'general') => {
    setAdminConsoleTab(tab);
    setIsAccountMenuOpen(false);
    setIsAdminConsoleOpen(true);
  };

  const handleReceiveMessagesChange = async (receiveMessages: boolean) => {
    const previousPreferences = messagePreferences;
    setMessagePreferences((preferences) => ({
      ...preferences,
      receiveMessages,
      playMessageSound: receiveMessages ? preferences.playMessageSound : false,
    }));

    if (!currentUser) {
      return;
    }

    try {
      const response = await authService.updateMessagePreferences(currentUser.id, receiveMessages);
      if (response.data.account) {
        handleAccountUpdate(response.data.account);
      }
      showToast('success', receiveMessages ? 'Messages enabled.' : 'Messages disabled.');
    } catch (err) {
      console.error(err);
      setMessagePreferences(previousPreferences);
      showToast('error', 'Failed to update message preferences.');
    }
  };

  const openBugTrackerFromNotification = () => {
    setIsNotificationsOpen(false);
    openAdminConsole('bugs');
  };

  const markNotificationRead = async (notification: UserNotification) => {
    setUserNotifications((items) => items.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)));
    try {
      await notificationService.markRead(notification.id);
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const clearAllNotifications = async () => {
    setNotifications([]);
    setUserNotifications([]);
    try {
      await notificationService.clearAll();
      window.dispatchEvent(new CustomEvent('shield:notification-updated'));
    } catch (err) {
      console.error('Failed to clear notifications:', err);
      showToast('error', 'Failed to clear notifications.');
      void loadUserNotifications();
    }
  };

  const openNotification = async (notification: UserNotification) => {
    await markNotificationRead(notification);
    setIsNotificationsOpen(false);

    if (notification.entityType === 'dashboard_post' && notification.entityId) {
      window.location.assign(`/updates/${encodeURIComponent(notification.entityId)}`);
      return;
    }

    if (notification.entityType === 'user_message') {
      setIsMessagesModalOpen(true);
      return;
    }

    if (notification.entityType === 'bug_report') {
      openAdminConsole('bugs');
      return;
    }

    if (notification.entityType === 'performance_evaluation') {
      window.location.assign('/evaluations');
    }
  };

  const updateBugStatus = async (report: BugReport, status: BugReportStatus, adminNotes: string) => {
    try {
      const response = await bugReportService.updateStatus(report.id, status, adminNotes);
      setBugReports((reports) => reports.map((item) => (item.id === report.id ? response.data : item)));
      showToast('success', 'Bug report updated.');
    } catch (err) {
      console.error(err);
      showToast('error', getErrorMessage(err, 'Failed to update bug report.'));
    }
  };

  const finishFirstLoginGuide = async () => {
    if (!currentUser) {
      setIsFirstLoginGuideOpen(false);
      return;
    }

    setIsFirstLoginGuideOpen(false);

    try {
      const response = await authService.completeOnboarding(currentUser.id);
      if (response.data.account) {
        handleAccountUpdate(response.data.account);
      }
      window.dispatchEvent(new CustomEvent('shield:dashboard-updated'));
      showToast('success', 'Welcome to Shield\nFor completing the Shield guide walkthrough.');
      setShowConfetti(true);
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to save guide completion.');
    }
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isFirstLoginGuideOpen) {
        setIsFirstLoginGuideOpen(false);
        return;
      }

      if (isNotificationsOpen) {
        setIsNotificationsOpen(false);
        return;
      }

      if (isAccountMenuOpen) {
        setIsAccountMenuOpen(false);
        return;
      }

      if (isCalculatorOpen) {
        setIsCalculatorOpen(false);
        return;
      }

      if (isBugTrackerOpen) {
        closeModal('bugTracker');
        return;
      }

      if (isReportBugOpen) {
        closeModal('reportBug');
        return;
      }

      if (isAdminConsoleOpen) {
        closeModal('adminConsole');
        return;
      }

      if (isCalendarModalOpen) {
        closeModal('calendar');
        return;
      }

      if (isProfileModalOpen) {
        closeModal('profile');
        return;
      }

      if (isMessagesModalOpen) {
        closeModal('messages');
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isAccountMenuOpen, isAdminConsoleOpen, isBugTrackerOpen, isCalculatorOpen, isCalendarModalOpen, isFirstLoginGuideOpen, isMessagesModalOpen, isNotificationsOpen, isProfileModalOpen, isReportBugOpen]);

  return (
    <Router>
      <ToastHost toasts={toasts} />
      {showConfetti && <ConfettiOverlay />}
      {isSessionLoading ? (
        <ShieldLoading />
      ) : !isAuthenticated ? (
        <LoginSplash onLogin={handleLogin} onToast={showToast} isExiting={isLoginTransitioning} />
      ) : (
        <div className="animate-app-enter flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
          <aside className={`relative h-screen shrink-0 overflow-visible bg-primary-500 text-white shadow-xl transition-all duration-200 dark:bg-gray-900 ${isSidebarCollapsed ? 'w-20' : 'w-72'}`}>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              className="absolute -right-5 top-1/2 z-30 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-primary-500 shadow-lg hover:bg-gray-50 md:flex"
              aria-label={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>

            <div className="shield-sidebar flex h-screen flex-col overflow-y-auto overflow-x-hidden">
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
                data-onboarding-target="profile-card"
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className={`w-full overflow-hidden rounded bg-white/10 text-left transition hover:bg-white/15 ${isSidebarCollapsed ? 'p-1.5' : 'p-3'}`}
                title="Open profile"
              >
                <div className={isSidebarCollapsed ? 'flex justify-center' : 'flex items-center gap-3'}>
                  {currentUser?.profilePictureUrl ? (
                    <img
                      src={getAssetUrl(currentUser.profilePictureUrl)}
                      alt={currentUser.displayName}
                      onError={handleAssetImageError}
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
                    {currentUser?.role || 'user'} - {currentUser?.twoFactorEnabled ? 'MFA enabled' : 'MFA not enabled'}
                  </div>
                )}
              </button>
            </div>

            <nav data-onboarding-target="navigation" className="flex flex-1 flex-col gap-2 px-3 py-3">
              <SidebarLink to="/" label="Dashboard" compact={isSidebarCollapsed} icon={LayoutDashboard} />
              <SidebarLink to="/calendar" label="Calendar" compact={isSidebarCollapsed} icon={CalendarDays} />
              {isAdministrator && <SidebarLink to="/devices" label="Devices" compact={isSidebarCollapsed} icon={Laptop} />}
              <SidebarLink to="/reports" label="Reports" compact={isSidebarCollapsed} icon={BarChart3} />
              {isAdministrator && <SidebarLink to="/admin" label="Admin" compact={isSidebarCollapsed} icon={Shield} />}
            </nav>

            <div className="shrink-0 border-t border-white/10 pt-3">
              <SidebarCalendarWidget
                compact={isSidebarCollapsed}
                entries={sidebarCalendarEntries}
                isLoading={isSidebarCalendarLoading}
                onOpenCalendar={toggleCalendarModal}
              />
            </div>
            </div>
          </aside>

          <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex min-h-20 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:px-6">
              <div>
                <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400 sm:block">Internal System</p>
                <h2 className="text-xl font-bold text-primary-500 sm:text-2xl">Agency Workspace</h2>
              </div>
              <div data-onboarding-target="header-actions" className="relative flex items-center gap-2 sm:gap-3">
                <div ref={notificationsMenuRef} className="relative">
                  <button
                    data-onboarding-control="notifications"
                    type="button"
                    onClick={() => setIsNotificationsOpen((value) => !value)}
                    className="relative flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                    aria-label="Open notifications"
                  >
                    <Bell size={18} />
                    {(notifications.length + unreadNotificationCount + (isAdministrator ? openBugCount : 0)) > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white">
                        {notifications.length + unreadNotificationCount + (isAdministrator ? openBugCount : 0) > 9 ? '9+' : notifications.length + unreadNotificationCount + (isAdministrator ? openBugCount : 0)}
                      </span>
                    )}
                  </button>

                  {isNotificationsOpen && (
                    <div className="absolute right-0 top-12 z-40 w-[calc(100vw-6.5rem)] max-w-80 rounded border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 sm:w-80">
                      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                        <h3 className="text-base font-bold text-primary-500 dark:text-blue-100">Notifications</h3>
                        <button
                          type="button"
                          onClick={clearAllNotifications}
                          className="text-xs font-semibold text-gray-500 hover:text-primary-500 dark:text-gray-400"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-96 overflow-y-auto p-2">
                        {notifications.length === 0 && userNotifications.length === 0 && !(isAdministrator && openBugCount > 0) ? (
                          <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            No notifications yet
                          </div>
                        ) : (
                          <>
                            {isAdministrator && openBugCount > 0 && (
                              <button
                                type="button"
                                onClick={openBugTrackerFromNotification}
                                className="mb-2 block w-full rounded border border-accent/30 bg-accent/10 px-3 py-3 text-left text-sm hover:bg-accent/15"
                              >
                                <p className="font-bold text-primary-500 dark:text-blue-100">{openBugCount} bug report{openBugCount === 1 ? '' : 's'} need review</p>
                                <p className="mt-1 text-xs uppercase text-accent">Open Bug Tracker</p>
                              </button>
                            )}
                            {userNotifications.map((notification) => (
                              <button
                                key={notification.id}
                                type="button"
                                onClick={() => openNotification(notification)}
                                className={`mb-1 block w-full rounded border px-3 py-3 text-left text-sm transition ${
                                  notification.isRead
                                    ? 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                                    : 'border-accent/40 bg-accent/10 shadow-sm ring-1 ring-accent/15 hover:bg-accent/15'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-bold text-gray-800 dark:text-gray-100">{notification.title}</p>
                                  {!notification.isRead && <span className="mt-1 h-2 w-2 rounded-full bg-accent" aria-label="New notification" />}
                                </div>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{notification.message}</p>
                                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-accent">
                                  {notification.isRead ? 'Seen' : 'New'} - {new Date(notification.createdAt).toLocaleString()}
                                </p>
                              </button>
                            ))}
                            {notifications.map((notification) => {
                              const title = notification.type === 'success' ? 'Done' : notification.type === 'error' ? 'Needs attention' : 'Heads up';
                              return (
                              <div key={notification.id} className="mb-1 rounded border border-accent/20 bg-accent/5 px-3 py-3 text-sm hover:bg-accent/10">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-bold text-gray-800 dark:text-gray-100">{title}</p>
                                  <span className="mt-1 h-2 w-2 rounded-full bg-accent" aria-label="New notification" />
                                </div>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{notification.message}</p>
                                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-accent">Just now</p>
                              </div>
                              );
                            })}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <HeaderMessagesButton
                  unreadCount={messageUnreadCount}
                  onOpenMessages={toggleMessagesModal}
                />
                <button
                  data-onboarding-control="theme"
                  type="button"
                  onClick={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
                  className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                  aria-label="Toggle light and dark mode"
                >
                  {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
                <button
                  data-onboarding-control="settings"
                  type="button"
                  onClick={() => setIsAccountMenuOpen((value) => !value)}
                  className="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                  aria-label="Open account menu"
                  title="Account"
                >
                  <Settings size={18} />
                </button>
                {isAccountMenuOpen && (
                  <div className="absolute right-0 top-12 z-40 w-[calc(100vw-6.5rem)] max-w-64 rounded border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 sm:w-64">
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
                    {isAdministrator && (
                      <button
                        type="button"
                        onClick={() => openAdminConsole('general')}
                        className="flex w-full items-center gap-2 border-t border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <Shield size={16} /> Admin Console
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsReportBugOpen(true);
                        setIsAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 border-t border-gray-200 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Bug size={16} /> Report a Bug
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

            <main className="flex-1 overflow-y-auto px-3 pb-36 pt-5 dark:bg-gray-950 sm:px-6 sm:pb-48 sm:pt-8">
              <div data-onboarding-target="workspace" className="min-h-[calc(100vh-12rem)]">
                <Suspense fallback={<PageLoader label="Loading page..." />}>
                  <Routes>
                    <Route path="/" element={<DashboardPage currentUser={currentUser} />} />
                    {currentUser && <Route path="/updates/:postId" element={<DashboardPostPage currentUser={currentUser} />} />}
                    {currentUser && <Route path="/messages" element={<MessagesRouteRedirect onOpenMessages={() => setIsMessagesModalOpen(true)} />} />}
                    {currentUser && <Route path="/calendar" element={<CalendarRouteRedirect onOpenCalendar={() => setIsCalendarModalOpen(true)} />} />}
                    <Route path="/devices" element={<DeviceManagementPage currentUser={currentUser} />} />
                    {currentUser && (
                      <Route
                        path="/evaluations"
                        element={<PerformanceEvaluationsPage currentUser={currentUser} onToast={showToast} getErrorMessage={getErrorMessage} />}
                      />
                    )}
                    <Route path="/search" element={<SearchPage currentUser={currentUser} onToast={showToast} />} />
                    {currentUser && isAdministrator && (
                      <Route path="/admin" element={<AdminRouteRedirect onOpenAdmin={() => openAdminConsole('general')} />} />
                    )}
                    {currentUser && isAdministrator && (
                      <Route path="/users/create" element={<CreateUserRouteRedirect onOpenCreateUser={() => openAdminConsole('create-user')} />} />
                    )}
                    <Route path="/reports" element={<ReportsPage currentUser={currentUser} onToast={showToast} getErrorMessage={getErrorMessage} />} />
                    {currentUser && isAdministrator && (
                      <Route path="/audit" element={<AdminRouteRedirect onOpenAdmin={() => openAdminConsole('audit')} />} />
                    )}
                    {currentUser && isAdministrator && (
                      <Route path="/permissions" element={<AdminRouteRedirect onOpenAdmin={() => openAdminConsole('permissions')} />} />
                    )}
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </div>
              <QuickLaunchTray
                isAdministrator={isAdministrator}
                isSidebarCollapsed={isSidebarCollapsed}
                badgeCounts={{ messages: messageUnreadCount }}
                activeModalApps={[
                  ...(isMessagesModalOpen ? (['messages'] as const) : []),
                  ...(isCalendarModalOpen ? (['calendar'] as const) : []),
                  ...(isCalculatorOpen ? (['calculator'] as const) : []),
                  ...(isAdminConsoleOpen && adminConsoleTab === 'create-user' ? (['create-user'] as const) : []),
                ]}
                storageKey={getQuickLaunchStorageKey(currentUser?.id || 'anonymous')}
                accountId={currentUser?.id}
                onOpenMessages={toggleMessagesModal}
                onOpenCalendar={toggleCalendarModal}
                onOpenCalculator={openCalculator}
                onOpenCreateUser={toggleCreateUserModal}
              />
            </main>
          </div>
          {isMessagesModalOpen && currentUser && (
            <div className="pointer-events-none fixed inset-0" style={{ zIndex: activeFloatingApp === 'messages' ? 70 : 55 }}>
              <div
                ref={messagesModalRef}
                className={getModalWindowClass(closingModal === 'messages', `pointer-events-auto fixed flex h-[72dvh] max-h-[calc(100dvh-1rem)] min-h-[420px] w-[min(900px,calc(100vw-1rem))] min-w-[min(360px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] resize flex-col overflow-hidden rounded-lg bg-white p-3 shadow-2xl dark:bg-gray-900 sm:p-4 ${isDraggingMessagesModal ? 'cursor-grabbing' : ''}`)}
                style={{ left: messagesModalPosition.x, top: messagesModalPosition.y }}
                onMouseDownCapture={() => setActiveFloatingApp('messages')}
              >
                <div
                  onPointerDown={startDraggingMessagesModal}
                  className={`mb-3 flex touch-none cursor-grab select-none items-start justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-800 ${isDraggingMessagesModal ? 'cursor-grabbing' : ''}`}
                >
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Messages</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Drag to move. Resize from the corner.</p>
                  </div>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => closeModal('messages')}
                    className="icon-close-button"
                    aria-label="Close messages"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <Suspense fallback={<PageLoader label="Loading messages..." />}>
                    <MessageInboxPage currentUser={currentUser} onToast={showToast} isModalView />
                  </Suspense>
                </div>
              </div>
            </div>
          )}
          {isCalendarModalOpen && currentUser && (
            <div className={getModalBackdropClass(closingModal === 'calendar', 'bg-black/60')}>
              <div className={getModalWindowClass(closingModal === 'calendar', 'flex h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white p-3 shadow-2xl dark:bg-gray-900 sm:h-[94vh] sm:p-4')}>
                <div className="mb-3 flex items-start justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-800">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Calendar</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Personal calendar entries are separated by account.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => closeModal('calendar')}
                    className="icon-close-button"
                    aria-label="Close calendar"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <Suspense fallback={<PageLoader label="Loading calendar..." />}>
                    <CalendarPage currentUser={currentUser} onOpenCalculator={openCalculator} onAccountUpdate={handleAccountUpdate} useMilitaryTime={messagePreferences.useMilitaryTime} />
                  </Suspense>
                </div>
              </div>
            </div>
          )}
          {isProfileModalOpen && currentUser && (
            <div className={getModalBackdropClass(closingModal === 'profile')}>
              <div className={getModalWindowClass(closingModal === 'profile', 'flex h-[96dvh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white p-3 shadow-2xl dark:bg-gray-900 sm:h-auto sm:max-h-[88vh] sm:p-4')}>
                <div className="mb-3 flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-800">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">Account Settings</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your profile security and sign-in options.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => closeModal('profile')}
                    className="icon-close-button"
                    aria-label="Close profile settings"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <Suspense fallback={<PageLoader label="Loading account settings..." />}>
                    <AccountSettingsPage
                      account={currentUser}
                      messagePreferences={messagePreferences}
                      onReceiveMessagesChange={handleReceiveMessagesChange}
                      onMessageSoundChange={(playMessageSound) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          playMessageSound,
                        }))
                      }
                      onMessageSoundSelect={(messageSound) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          messageSound,
                        }))
                      }
                      onMilitaryTimeChange={(useMilitaryTime) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          useMilitaryTime,
                        }))
                      }
                      onReplayGuide={replayGuide}
                      onOpenEvaluations={() => closeModal('profile')}
                      onAccountUpdate={handleAccountUpdate}
                      onToast={showToast}
                      getErrorMessage={getErrorMessage}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          )}
          {isAdminConsoleOpen && currentUser && isAdministrator && (
            <div className={getModalBackdropClass(closingModal === 'adminConsole', 'bg-black/60')}>
              <div className={getModalWindowClass(closingModal === 'adminConsole', 'flex h-[96dvh] w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-white p-3 shadow-2xl dark:bg-gray-900 sm:h-[94vh] sm:p-5')}>
                <div className="mb-3 flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-800">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">Admin Console</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage settings, permissions, users, bug reports, and audit history from one place.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => closeModal('adminConsole')}
                    className="icon-close-button"
                    aria-label="Close admin console"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <Suspense fallback={<PageLoader label="Loading admin console..." />}>
                    <AdminConsolePage
                      account={currentUser}
                      initialTab={adminConsoleTab}
                      onAccountUpdate={handleAccountUpdate}
                      onToast={showToast}
                      getErrorMessage={getErrorMessage}
                      onUserCreated={() => {
                        setAdminConsoleTab('permissions');
                      }}
                      bugReports={bugReports}
                      onBugStatusChange={updateBugStatus}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          )}
          {isCalculatorOpen && (
            <CalculatorModal onClose={() => setIsCalculatorOpen(false)} onFocus={() => setActiveFloatingApp('calculator')} zIndex={activeFloatingApp === 'calculator' ? 70 : 55} />
          )}
          {isReportBugOpen && (
            <div className={getModalBackdropClass(closingModal === 'reportBug')}>
              <div className={getModalWindowClass(closingModal === 'reportBug', 'max-h-[96dvh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-2xl dark:bg-gray-900 sm:p-6')}>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Report a Bug</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Tell admins what broke and where it happened.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => closeModal('reportBug')}
                    className="icon-close-button"
                    aria-label="Close report bug"
                  >
                    <X size={20} />
                  </button>
                </div>
                <ReportBugModal
                  onClose={() => closeModal('reportBug')}
                  onToast={showToast}
                  onSubmitted={loadBugReports}
                />
              </div>
            </div>
          )}
          {isBugTrackerOpen && isAdministrator && (
            <div className={getModalBackdropClass(closingModal === 'bugTracker', 'bg-black/60')}>
              <div className={getModalWindowClass(closingModal === 'bugTracker', 'flex h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white p-4 shadow-2xl dark:bg-gray-900 sm:h-auto sm:max-h-[92vh] sm:p-5')}>
                <div className="mb-5 flex items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bug Tracker</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Review submitted bugs and update their status.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => closeModal('bugTracker')}
                    className="icon-close-button"
                    aria-label="Close bug tracker"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <BugTrackerModal reports={bugReports} onStatusChange={updateBugStatus} />
                </div>
              </div>
            </div>
          )}
          {isWelcomeSplashOpen && currentUser && (
            <WelcomeSplash
              account={currentUser}
              onStart={handleWelcomeStart}
              onLater={handleWelcomeLater}
            />
          )}
          {isFirstLoginGuideOpen && currentUser && (
            <FirstLoginGuide
              account={currentUser}
              onFinish={finishFirstLoginGuide}
              onLater={() => setIsFirstLoginGuideOpen(false)}
            />
          )}
          {shouldShowForcedPasswordModal && currentUser && (
            <ForcePasswordChange account={currentUser} onChanged={handleAccountUpdate} onLogout={handleLogout} onToast={showToast} />
          )}
        </div>
      )}
    </Router>
  );
}

export default App;
