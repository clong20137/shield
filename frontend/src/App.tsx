import { CSSProperties, FormEvent, ReactNode, lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, Bell, Bug, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, Laptop, LayoutDashboard, LockKeyhole, LogOut, LucideIcon, Mail, Minus, Moon, RefreshCw, Save, Search, Settings, Shield, Sun, UserCircle, X } from 'lucide-react';
import { BrowserRouter as Router, NavLink, useNavigate } from 'react-router-dom';
import type { AdminConsoleTab } from './pages/AdminConsolePage';
import { ToastHost, ToastMessage, ToastType } from './components/ToastHost';
import { NotificationCenterMenu } from './components/notifications/NotificationCenterMenu';
import { ShieldLoading, ConnectionLostOverlay } from './components/app/LoadingShell';
import { AppRoutes } from './components/app/AppRoutes';
import { getQuickLaunchStorageKey, normalizeQuickLaunchSlotCount, QUICK_LAUNCH_DEFAULT_SLOT_COUNT, type QuickLaunchPlacement } from './components/quick-launch/quickLaunchCore';
import { FloatingWindow } from './components/FloatingWindow';
import { FirstLoginGuide, WelcomeSplash } from './components/OnboardingGuide';
import { BugTrackerModal } from './components/BugTrackerModal';
import { AuthAccount, authService, bugReportService, BugReport, BugReportPriority, BugReportStatus, CalendarEntry, CalendarEntryPayload, calendarService, clearAuthToken, CompleteSetupPayload, errorLogService, getApiHealthUrl, getAssetThumbnailUrl, getAssetUrl, handleAssetThumbnailError, messageService, notificationService, notificationSoundService, NotificationSound, reminderService, RegistrationSettings, Reminder, SetupEnvironmentValues, SetupStatus, ThemeSettings, urgentAlertService, UrgentAlert, UserNotification, userService, User } from './services/api';
import { closeRealtimeConnections, subscribeAppRealtime, subscribeMessageRealtime } from './services/realtime';
import { useUnreadCounts } from './hooks/useUnreadCounts';
import { getEffectiveSeasonalTheme, getSeasonalThemeOption, normalizeSeasonalTheme, SEASONAL_THEME_CLASSES, type EffectiveSeasonalTheme, type SeasonalThemePreference } from './theme/seasonalThemes';

const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage').then((module) => ({ default: module.AccountSettingsPage })));
const MessageInboxPage = lazy(() => import('./pages/MessageInboxPage'));
const RecentMessagesDockContainer = lazy(() => import('./components/messages/RecentMessagesDock').then((module) => ({ default: module.RecentMessagesDockContainer })));
const QuickLaunchTray = lazy(() => import('./components/quick-launch/QuickLaunchTray').then((module) => ({ default: module.QuickLaunchTray })));
const GlobalCommandPalette = lazy(() => import('./components/app/GlobalCommandPalette').then((module) => ({ default: module.GlobalCommandPalette })));
const CalculatorModal = lazy(() => import('./components/app/CalculatorModal').then((module) => ({ default: module.CalculatorModal })));
const SeasonalThemeEffects = lazy(() => import('./components/theme/SeasonalThemeEffects').then((module) => ({ default: module.SeasonalThemeEffects })));
const ThanksgivingSidebarAnimation = lazy(() => import('./components/theme/SeasonalThemeEffects').then((module) => ({ default: module.ThanksgivingSidebarAnimation })));

const SESSION_KEY = 'shield_session';
const THEME_KEY = 'shield_theme';
const GLASS_THEME_KEY = 'shield_glass_theme';
const SEASONAL_THEME_KEY = 'shield_seasonal_theme';
const MESSAGE_PREFERENCES_KEY = 'shield_message_preferences';
const MILITARY_TIME_DEFAULT_APPLIED_KEY = 'shield_military_time_default_applied';
const RECENT_CONVERSATIONS_DEFAULT_APPLIED_KEY = 'shield_recent_conversations_default_applied';
const SESSION_TIMEOUT_KEY = 'shield_session_timeout_minutes';
const GLOBAL_CONTEXT_MENU_WIDTH = 256;
const GLOBAL_CONTEXT_MENU_HEIGHT = 172;
const GLOBAL_CONTEXT_MENU_GUTTER = 12;
const AWAY_PRESENCE_IDLE_MS = 5 * 60 * 1000;
const MODAL_CLOSE_MS = 220;
const PASSWORD_REQUIREMENTS_MESSAGE = 'Password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.';
const APP_BASE_PATH = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/u, '');
const ROUTER_BASENAME = APP_BASE_PATH || undefined;
const DEFAULT_APP_NAME = 'Blueline';
const DEFAULT_SITE_NAME = 'Blueline Workspace';
const DEFAULT_PRIMARY_COLOR = '#1a365d';
const DEFAULT_SECONDARY_COLOR = '#9C865C';
const DEFAULT_BRAND_LOGO = '/shield-splash-logo.png';
const PATRIOTIC_BRAND_LOGO = '/theme-assets/america-250-logo.png';
const MAX_SETUP_LOGO_SIZE_BYTES = 240 * 1024;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const LOGIN_TRANSITION_MS = 560;
const DESKTOP_UNREAD_FALLBACK_POLL_MS = 12 * 1000;
type AppTheme = 'light' | 'dark';

function withAppBase(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}` || '/';
}

function getBrandLogoSrc(brandLogoDataUrl?: string, activeTheme?: EffectiveSeasonalTheme): string {
  if (brandLogoDataUrl) {
    return brandLogoDataUrl;
  }

  return withAppBase(activeTheme === 'patriotic' ? PATRIOTIC_BRAND_LOGO : DEFAULT_BRAND_LOGO);
}

function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

function getAppRelativePathname(): string {
  if (!APP_BASE_PATH) {
    return window.location.pathname;
  }

  const pathname = window.location.pathname;
  if (pathname === APP_BASE_PATH || pathname.startsWith(`${APP_BASE_PATH}/`)) {
    return pathname.slice(APP_BASE_PATH.length) || '/';
  }

  return pathname;
}

function isSecurePassword(password: string): boolean {
  return password.length >= 12 && /[A-Z]/u.test(password) && /[a-z]/u.test(password) && /\d/u.test(password) && /[^A-Za-z0-9]/u.test(password);
}

type ClosingModal = 'messages' | 'calculator' | 'profile' | 'reportBug' | 'bugTracker';
type FloatingAppId = 'messages' | 'calculator' | 'profile';
type AppScale = AuthAccount['appScale'];
const APP_SCALE_SEQUENCE: AppScale[] = ['compact', 'comfortable', 'large'];
const APP_SCALE_LABELS: Record<AppScale, string> = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  large: 'Large',
};
const APP_SCALE_TRANSITION_MS = 260;

interface MessagePreferences {
  receiveMessages: boolean;
  playMessageSound: boolean;
  browserNotifications: boolean;
  messageSound: MessageSound;
  reminderAlarmSound: ReminderAlarmSound;
  useMilitaryTime: boolean;
  hideQuickLaunch: boolean;
  hideRecentConversations: boolean;
  quickLaunchPlacement: QuickLaunchPlacement;
  quickLaunchSlotCount: number;
}

type ReminderAlarmSound = '' | `custom:${string}`;
type MessageSound = '' | `custom:${string}`;
const defaultMessagePreferences: MessagePreferences = {
  receiveMessages: true,
  playMessageSound: true,
  browserNotifications: false,
  messageSound: '',
  reminderAlarmSound: '',
  useMilitaryTime: true,
  hideQuickLaunch: false,
  hideRecentConversations: false,
  quickLaunchPlacement: 'dock',
  quickLaunchSlotCount: QUICK_LAUNCH_DEFAULT_SLOT_COUNT,
};

function getCustomSoundId(sound: string): string | null {
  return sound.startsWith('custom:') ? sound.slice('custom:'.length) : null;
}

function playCustomSoundEffect(soundUrl: string | undefined) {
  if (!soundUrl) {
    return;
  }

  try {
    const audio = new Audio(getAssetUrl(soundUrl));
    audio.volume = 0.85;
    void audio.play();
  } catch (err) {
    console.error('Failed to play custom sound:', err);
  }
}

function canUseBrowserNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function isShieldDesktopApp(): boolean {
  return typeof window !== 'undefined' && window.shieldDesktop?.shell === 'electron';
}

function hasShieldDesktopFeature<K extends keyof NonNullable<Window['shieldDesktop']>>(feature: K): boolean {
  return isShieldDesktopApp() && typeof window.shieldDesktop?.[feature] === 'function';
}

function showDesktopNotification(title: string, options?: { body?: string; tag?: string; appPath?: string; silent?: boolean }): boolean {
  if (!hasShieldDesktopFeature('notify')) {
    return false;
  }

  window.shieldDesktop?.notify?.({
    title,
    body: options?.body,
    appPath: options?.appPath,
    silent: options?.silent,
  }).catch((error) => {
    console.error('Failed to show desktop notification:', error);
  });

  return true;
}

function showSystemNotification(title: string, options?: NotificationOptions & { appPath?: string }) {
  if (showDesktopNotification(title, {
    body: options?.body,
    tag: options?.tag,
    appPath: options?.appPath,
    silent: Boolean(options?.silent),
  })) {
    return;
  }

  showBrowserNotification(title, options);
}

function showBrowserNotification(title: string, options?: NotificationOptions) {
  if (!canUseBrowserNotifications() || Notification.permission !== 'granted') {
    return;
  }

  try {
    const notification = new Notification(title, {
      badge: withAppBase('/favicon.ico'),
      icon: withAppBase('/favicon.ico'),
      ...options,
    });
    window.setTimeout(() => notification.close(), 9000);
  } catch (error) {
    console.error('Failed to show browser notification:', error);
  }
}



function loadMessagePreferences(): MessagePreferences {
  try {
    const storedPreferences = window.localStorage.getItem(MESSAGE_PREFERENCES_KEY);
    const parsedPreferences = storedPreferences ? JSON.parse(storedPreferences) : {};
    const shouldApplyMilitaryTimeDefault = window.localStorage.getItem(MILITARY_TIME_DEFAULT_APPLIED_KEY) !== 'true';
    const shouldApplyRecentConversationsDefault = window.localStorage.getItem(RECENT_CONVERSATIONS_DEFAULT_APPLIED_KEY) !== 'true';
    if (shouldApplyMilitaryTimeDefault) {
      window.localStorage.setItem(MILITARY_TIME_DEFAULT_APPLIED_KEY, 'true');
    }
    if (shouldApplyRecentConversationsDefault) {
      window.localStorage.setItem(RECENT_CONVERSATIONS_DEFAULT_APPLIED_KEY, 'true');
    }

    return {
      ...defaultMessagePreferences,
      ...parsedPreferences,
      useMilitaryTime: shouldApplyMilitaryTimeDefault ? true : parsedPreferences.useMilitaryTime ?? defaultMessagePreferences.useMilitaryTime,
      hideRecentConversations: shouldApplyRecentConversationsDefault ? false : parsedPreferences.hideRecentConversations ?? defaultMessagePreferences.hideRecentConversations,
      quickLaunchPlacement: parsedPreferences.quickLaunchPlacement === 'sidebar' ? 'sidebar' : 'dock',
      quickLaunchSlotCount: normalizeQuickLaunchSlotCount(parsedPreferences.quickLaunchSlotCount),
    };
  } catch {
    return defaultMessagePreferences;
  }
}



function normalizeAppScale(value?: string | null): AppScale {
  return value === 'compact' || value === 'large' ? value : 'comfortable';
}

function normalizeDefaultDutyHours(value: unknown): string {
  const hours = Number(value);
  if (!Number.isFinite(hours)) {
    return '8';
  }

  return (Math.min(24, Math.max(0, Math.round(hours * 100) / 100))).toString().replace(/\.?0+$/u, '');
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

function isNetworkConnectionError(error: unknown): boolean {
  return Boolean(
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as { isAxiosError?: boolean; response?: unknown }).isAxiosError &&
    !(error as { response?: unknown }).response,
  );
}

function LoginSplash({
  onLogin,
  onToast,
  appName = DEFAULT_APP_NAME,
  siteName = 'Agency Access Portal',
  brandLogoDataUrl = '',
  brandLogoSrc,
  isExiting = false,
}: {
  onLogin: (account: AuthAccount) => void;
  onToast: (type: ToastType, message: string) => void;
  appName?: string;
  siteName?: string;
  brandLogoDataUrl?: string;
  brandLogoSrc?: string;
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
  const [ssoError] = useState(() => new URLSearchParams(window.location.search).get('ssoError') || '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [isLoginWarningOpen, setIsLoginWarningOpen] = useState(false);
  const [hasAcknowledgedLoginWarning, setHasAcknowledgedLoginWarning] = useState(false);
  const loginInputClass = 'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400';
  const loginFormRef = useRef<HTMLFormElement | null>(null);
  const twoFactorInputRef = useRef<HTMLInputElement | null>(null);
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
    }
  }, [onToast, ssoError]);

  useEffect(() => {
    if (requiresTwoFactor && mode === 'login') {
      window.setTimeout(() => {
        twoFactorInputRef.current?.focus();
        twoFactorInputRef.current?.select();
      }, 0);
    }
  }, [mode, requiresTwoFactor]);

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

      if (!isSecurePassword(password)) {
        setError(PASSWORD_REQUIREMENTS_MESSAGE);
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

    if (mode === 'register' && !isSecurePassword(password)) {
      setError(PASSWORD_REQUIREMENTS_MESSAGE);
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
        setTwoFactorCode('');
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

  const canRegister =
    registrationSettings?.mode === 'public' ||
    (registrationSettings?.mode === 'invite-only' && Boolean(inviteToken));

  return (
    <div className={`login-shell relative min-h-screen overflow-hidden bg-gray-950 text-gray-900 dark:text-gray-100 ${isExiting ? 'animate-login-exit pointer-events-none' : 'animate-login-enter'}`}>
      <div className="login-moving-grid" aria-hidden="true" />
      <div className="login-scan-band" aria-hidden="true" />
      <div className="relative z-10 grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(27rem,31rem)]">
        <section className="hidden min-h-screen items-center px-8 py-12 text-white lg:flex lg:px-16">
          <div className="max-w-3xl">
            <div className="mb-8 flex items-center gap-4">
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-2xl backdrop-blur">
                <img src={brandLogoSrc || getBrandLogoSrc(brandLogoDataUrl)} alt="" className="h-16 w-16 object-contain" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-accent">Secure Access</p>
                <p className="mt-1 text-sm font-semibold text-blue-100">{siteName}</p>
              </div>
            </div>
            <h1 className="mb-5 text-6xl font-black leading-none text-white">
              {appName}
            </h1>
            <p className="max-w-2xl text-xl leading-8 text-blue-50">
              A secured workspace for personnel lookup, reporting, messages, calendar workflows, and daily operations.
            </p>
            {mode === 'login' && !isShieldDesktopApp() && (
              <div className="mt-8 inline-block rounded-lg border border-accent/30 bg-accent/10 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Recommended</p>
                <p className="mt-1 max-w-xl text-sm text-blue-50">
                  Install the desktop app for faster access, offline startup, and native notifications.
                </p>
                <a
                  href={withAppBase('/downloads/Shield-Setup.exe')}
                  download
                  className="btn-secondary mt-3 inline-flex items-center gap-2"
                  aria-label="Download desktop application"
                >
                  <Download size={16} />
                  <span>Download App</span>
                </a>
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 lg:bg-white/6 lg:backdrop-blur-xl">
          <form ref={loginFormRef} onSubmit={handleSubmit} className="login-panel w-full max-w-md rounded-xl border border-white/15 bg-white/95 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.35)] ring-1 ring-black/5 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-900/95 sm:p-8">
            <div className="mb-7">
              <div className="mb-5 flex items-center gap-3 lg:hidden">
                <img src={brandLogoSrc || getBrandLogoSrc(brandLogoDataUrl)} alt="" className="h-14 w-14 object-contain drop-shadow-lg" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-accent">Secure Access</p>
                  <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{appName}</p>
                </div>
              </div>
              <h2 className="mb-2 text-3xl font-black text-primary-500 dark:text-blue-100">
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
                      ? `Choose a new password for your ${appName} login.`
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
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-primary-500 shadow-sm transition hover:border-accent hover:text-accent dark:border-gray-700 dark:bg-gray-950 dark:text-blue-100"
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
                  className={loginInputClass}
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
                    className={loginInputClass}
                    autoComplete="given-name"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Last name</span>
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className={loginInputClass}
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
                className={loginInputClass}
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
                  className={loginInputClass}
                  autoComplete="new-password"
                />
              </label>
            )}

            {requiresTwoFactor && mode === 'login' && (
              <label className="mb-6 block">
                <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">MFA code or recovery code</span>
                <input
                  ref={twoFactorInputRef}
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/gu, '').slice(0, 12))}
                  className={loginInputClass}
                  autoComplete="one-time-code"
                  inputMode="text"
                  maxLength={12}
                />
              </label>
            )}

            <button type="submit" className="btn-primary w-full rounded-lg py-3.5 text-base" disabled={isSubmitting || (mode === 'register' && !canRegister)}>
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

function ReminderCreateModal({
  date,
  isSaving,
  alarmSound,
  notificationSounds,
  onClose,
  onSave,
  onAlarmSoundChange,
}: {
  date: string;
  isSaving: boolean;
  alarmSound: ReminderAlarmSound;
  notificationSounds: NotificationSound[];
  onClose: () => void;
  onSave: (reminder: { title: string; remindOn: string; remindAt: string; priority: Reminder['priority']; notes: string; recurrenceRule: Reminder['recurrenceRule'] }) => void;
  onAlarmSoundChange: (sound: ReminderAlarmSound) => void;
}) {
  const now = new Date();
  const [title, setTitle] = useState('');
  const [remindOn, setRemindOn] = useState(date);
  const [remindTime, setRemindTime] = useState(() => `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  const [priority, setPriority] = useState<Reminder['priority']>('Normal');
  const [recurrenceRule, setRecurrenceRule] = useState<Reminder['recurrenceRule']>('none');
  const [notes, setNotes] = useState('');
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      titleInputRef.current?.focus();
      return;
    }

    onSave({
      title: cleanTitle,
      remindOn,
      remindAt: `${remindOn}T${remindTime || '09:00'}`,
      priority,
      notes: notes.trim(),
      recurrenceRule,
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-primary-500 dark:text-blue-100">Reminder</p>
            <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{formatSidebarCalendarDate(remindOn)}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-close-button" aria-label="Close reminder">
            <X size={18} />
          </button>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Reminder text</span>
          <input
            ref={titleInputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            maxLength={120}
          />
        </label>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Date</span>
            <input
              type="date"
              value={remindOn}
              onChange={(event) => setRemindOn(event.target.value || date)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Time</span>
            <input
              type="time"
              value={remindTime}
              onChange={(event) => setRemindTime(event.target.value || '09:00')}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Priority</span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as Reminder['priority'])}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            >
              {(['Low', 'Normal', 'High', 'Critical'] as const).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Alarm Sound</span>
            <select
              value={notificationSounds.some((sound) => `custom:${sound.id}` === alarmSound) ? alarmSound : ''}
              onChange={(event) => onAlarmSoundChange(event.target.value as ReminderAlarmSound)}
              disabled={notificationSounds.length === 0}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            >
              <option value="">{notificationSounds.length > 0 ? 'Choose sound' : 'No sounds uploaded'}</option>
              {notificationSounds.map((sound) => (
                <option key={sound.id} value={`custom:${sound.id}`}>{sound.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Repeat</span>
            <select
              value={recurrenceRule}
              onChange={(event) => setRecurrenceRule(event.target.value as Reminder['recurrenceRule'])}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        </div>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full resize-none rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            maxLength={1000}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSaving || !title.trim()}>
            {isSaving ? 'Adding...' : 'Add Reminder'}
          </button>
        </div>
      </form>
    </div>
  );
}

function getReminderDueAt(reminder: Reminder): number {
  const dateTimeValue = reminder.remindAt || `${reminder.remindOn}T00:00`;
  const dueDate = new Date(dateTimeValue);
  return Number.isFinite(dueDate.getTime()) ? dueDate.getTime() : 0;
}

function formatReminderDueAt(reminder: Reminder): string {
  const dateTimeValue = reminder.remindAt || `${reminder.remindOn}T00:00`;
  const dueDate = new Date(dateTimeValue);
  if (!Number.isFinite(dueDate.getTime())) {
    return formatSidebarCalendarDate(reminder.remindOn);
  }

  return dueDate.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ReminderDuePopup({
  reminders,
  isSaving,
  onComplete,
  onDismiss,
  onSnooze,
}: {
  reminders: Reminder[];
  isSaving: boolean;
  onComplete: (reminder: Reminder) => void;
  onDismiss: () => void;
  onSnooze: (reminder: Reminder, minutes: number) => void;
}) {
  const primaryReminder = reminders[0];
  const [snoozeMinutes, setSnoozeMinutes] = useState(10);
  if (!primaryReminder) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-primary-500 text-white">
            <Bell size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary-500 dark:text-blue-100">Reminder Due</p>
            <h2 className="mt-1 truncate text-xl font-bold text-gray-900 dark:text-gray-100">{primaryReminder.title}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-gray-400">{formatReminderDueAt(primaryReminder)}</p>
          </div>
          <button type="button" onClick={onDismiss} className="icon-close-button" aria-label="Dismiss reminder popup">
            <X size={18} />
          </button>
        </div>
        {primaryReminder.notes && <p className="mb-4 whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">{primaryReminder.notes}</p>}
        {reminders.length > 1 && (
          <p className="mb-4 rounded bg-blue-50 px-3 py-2 text-sm font-semibold text-primary-500 dark:bg-blue-950/40 dark:text-blue-100">
            {reminders.length - 1} more reminder{reminders.length - 1 === 1 ? '' : 's'} due.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
            <span>Snooze</span>
            <select
              value={snoozeMinutes}
              onChange={(event) => setSnoozeMinutes(Number(event.target.value))}
              className="rounded border border-gray-300 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              disabled={isSaving}
            >
              <option value={5}>5 min</option>
              <option value={10}>10 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
            </select>
          </label>
          <button type="button" className="btn-secondary" onClick={onDismiss} disabled={isSaving}>
            Dismiss
          </button>
          <button type="button" className="btn-secondary" onClick={() => onSnooze(primaryReminder, snoozeMinutes)} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Snooze'}
          </button>
          <button type="button" className="btn-primary whitespace-nowrap" onClick={() => onComplete(primaryReminder)} disabled={isSaving}>
            {isSaving ? 'Completing...' : 'Mark Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LockScreen({
  account,
  appName,
  siteName,
  onUnlock,
  onLogout,
}: {
  account: AuthAccount;
  appName: string;
  siteName: string;
  onUnlock: (account: AuthAccount) => void;
  onLogout: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password) {
      setError('Enter your password to unlock.');
      return;
    }

    setIsUnlocking(true);
    setError(null);
    try {
      const response = await authService.verifyPassword(password, account);
      if (response.data.account) {
        onUnlock(response.data.account);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Password was not accepted.'));
      setPassword('');
      window.setTimeout(() => passwordInputRef.current?.focus(), 0);
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex min-h-screen items-center justify-center bg-primary-500 p-6 text-white">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-white/20 bg-white p-6 text-gray-900 shadow-2xl dark:bg-gray-900 dark:text-gray-100">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded bg-primary-500 text-white shadow">
            <LockKeyhole size={28} />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">{siteName}</p>
          <h1 className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{appName} Locked</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{account.displayName || account.email}</p>
        </div>
        {error && <div className="error">{error}</div>}
        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">Password</span>
          <input
            ref={passwordInputRef}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950"
            autoComplete="current-password"
          />
        </label>
        <button type="submit" className="btn-primary w-full py-3" disabled={isUnlocking}>
          {isUnlocking ? 'Unlocking...' : 'Unlock'}
        </button>
        <button type="button" onClick={onLogout} className="mt-4 w-full text-sm font-semibold text-gray-500 hover:text-primary-500 dark:text-gray-400">
          Sign out
        </button>
      </form>
    </div>
  );
}

function ForcePasswordChange({
  account,
  onChanged,
  onLogout,
  onToast,
  appName,
}: {
  account: AuthAccount;
  onChanged: (account: AuthAccount) => void;
  onLogout: () => void;
  onToast: (type: ToastType, message: string) => void;
  appName: string;
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

    if (!isSecurePassword(newPassword)) {
      setError(PASSWORD_REQUIREMENTS_MESSAGE.replace('Password', 'New password'));
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from the temporary password.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await authService.changePassword(account.id, currentPassword, newPassword);
      if (response.data.account) {
        onChanged(response.data.account);
      }
      onToast('success', `Password updated. Welcome to ${appName}.`);
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
  const source = name?.trim() || email?.trim() || 'Blueline User';
  const parts = source.split(/\s+/u).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

async function checkApiHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(getApiHealthUrl(), {
      cache: 'no-store',
      credentials: 'include',
      signal,
    });

    return response.ok;
  } catch {
    return false;
  }
}

function isMobileViewport() {
  return window.innerWidth < 768;
}

function announceFloatingFocus(app: string) {
  window.dispatchEvent(new CustomEvent('shield:floating-focus', { detail: { app } }));
}

function getCenteredFloatingPosition(width: number, topRatio = 0.08) {
  return {
    x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(8, Math.round(window.innerHeight * topRatio)),
  };
}

function getInitialProfileSettingsPosition() {
  return getCenteredFloatingPosition(Math.min(window.innerWidth - 16, 900), 0.07);
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

interface SidebarLinkProps {
  to: string;
  label: string;
  compact: boolean;
  icon: LucideIcon;
}

function SidebarRailTooltip({ label, children }: { label: string; children: ReactNode }) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);

  const showTooltip = () => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltipPosition({
      left: rect.right + 10,
      top: rect.top + rect.height / 2,
    });
  };

  return (
    <span
      ref={hostRef}
      className="sidebar-rail-tooltip-host"
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltipPosition(null)}
      onFocusCapture={showTooltip}
      onBlurCapture={() => setTooltipPosition(null)}
    >
      {children}
      {tooltipPosition && (
        <span
          className="sidebar-rail-tooltip sidebar-rail-tooltip-fixed"
          role="tooltip"
          style={{
            left: tooltipPosition.left,
            top: tooltipPosition.top,
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

function SidebarLink({ to, label, compact, icon: Icon }: SidebarLinkProps) {
  const link = (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'flex h-10 items-center rounded px-3 text-sm font-semibold transition-all duration-300 ease-out',
          compact ? 'justify-center' : 'justify-start',
          isActive ? 'bg-white text-primary-500 shadow' : 'text-blue-50 hover:bg-white/10',
        ].join(' ')
      }
    >
      <Icon className={compact ? '' : 'mr-3'} size={19} />
      {!compact && <span>{label}</span>}
    </NavLink>
  );

  return compact ? <SidebarRailTooltip label={label}>{link}</SidebarRailTooltip> : link;
}

interface MobileNavigationProps {
  isAdministrator: boolean;
  unreadMessages: number;
  showCalendar: boolean;
}

function MobileNavigation({
  isAdministrator,
  unreadMessages,
  showCalendar,
}: MobileNavigationProps) {
  const navItems = [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    isAdministrator
      ? { to: '/devices', label: 'Devices', icon: Laptop }
      : { to: '/search', label: 'Search', icon: Search },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
  ];

  const linkClassName = ({ isActive }: { isActive: boolean }) =>
    [
      'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-black transition active:scale-[0.98]',
      isActive ? 'bg-primary-500 text-white shadow-[0_10px_22px_rgba(37,99,235,0.28)]' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
    ].join(' ');

  return (
    <nav
      data-onboarding-target="navigation"
      className="fixed bottom-0 left-0 right-0 z-[120] border-t border-gray-200 bg-white/90 px-3 pb-[calc(env(safe-area-inset-bottom)+0.55rem)] pt-2.5 shadow-[0_-12px_35px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/90 md:hidden"
      aria-label="Mobile navigation"
    >
      <div data-onboarding-target="quick-launch" className="mx-auto flex max-w-lg items-stretch gap-1.5 rounded-2xl border border-gray-200 bg-white/85 p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)] dark:border-gray-800 dark:bg-gray-900/85">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClassName}>
            <Icon size={20} strokeWidth={2.4} />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
        <NavLink to="/messages" className={linkClassName} aria-label="Open messages">
          <Mail size={20} strokeWidth={2.4} />
          <span className="truncate">Messages</span>
          {unreadMessages > 0 && (
            <span className="absolute right-2 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-black text-white ring-2 ring-white dark:ring-gray-900">
              {unreadMessages > 9 ? '9+' : unreadMessages}
            </span>
          )}
        </NavLink>
        {showCalendar && (
          <NavLink to="/calendar" className={linkClassName} aria-label="Open calendar">
            <CalendarDays size={20} strokeWidth={2.4} />
            <span className="truncate">Calendar</span>
          </NavLink>
        )}
      </div>
    </nav>
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

function getSidebarCalendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const startDate = new Date(firstDay);
  const endDate = new Date(lastDay);
  startDate.setDate(firstDay.getDate() - firstDay.getDay());
  endDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()));
  const dayCount = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

function getViewportMenuPosition(clientX: number, clientY: number, width: number, height: number, gutter = 8) {
  return {
    x: Math.min(Math.max(gutter, clientX), Math.max(gutter, window.innerWidth - width - gutter)),
    y: Math.min(Math.max(gutter, clientY), Math.max(gutter, window.innerHeight - height - gutter)),
  };
}

function createSidebarDailyPayload(entry: CalendarEntry, date: string): CalendarEntryPayload {
  return {
    category: 'Trooper Daily',
    date,
    dutyHours: entry.dutyHours,
    districtWorked: entry.districtWorked,
    specialStatus: entry.specialStatus,
    color: entry.color,
    details: { ...(entry.details || {}) },
    submissionStatus: 'Draft',
    ownerAccountId: entry.ownerAccountId,
  };
}

function SidebarCalendarWidget({
  compact,
  entries,
  reminders,
  onOpenCalendar,
  copiedDaily,
  onCopyDaily,
  onPasteDaily,
  onCopyPreviousDaily,
  onAddReminder,
  onMarkDayOff,
  onDeleteDaily,
}: {
  compact: boolean;
  entries: CalendarEntry[];
  reminders: Reminder[];
  onOpenCalendar: (dateKey?: string) => void;
  copiedDaily: CalendarEntryPayload | null;
  onCopyDaily: (dateKey: string) => void;
  onPasteDaily: (dateKey: string) => void;
  onCopyPreviousDaily: (dateKey: string) => void;
  onAddReminder: (dateKey: string) => void;
  onMarkDayOff: (dateKey: string) => void;
  onDeleteDaily: (dateKey: string) => void;
}) {
  const todayKey = getLocalDateKey();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [hoveredDate, setHoveredDate] = useState<{ x: number; y: number; dateKey: string; entries: CalendarEntry[]; reminders: Reminder[] } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; dateKey: string; entries: CalendarEntry[] } | null>(null);
  const calendarDays = useMemo(() => getSidebarCalendarDays(visibleMonth), [visibleMonth]);
  const entriesByDate = useMemo(() => entries.reduce<Record<string, CalendarEntry[]>>((groups, entry) => {
    const dateKey = getEntryDateKey(entry);
    groups[dateKey] = [...(groups[dateKey] || []), entry];
    return groups;
  }, {}), [entries]);
  const remindersByDate = useMemo(() => reminders.reduce<Record<string, Reminder[]>>((groups, reminder) => {
    if (reminder.completedAt) {
      return groups;
    }
    const dateKey = reminder.remindOn.slice(0, 10);
    groups[dateKey] = [...(groups[dateKey] || []), reminder];
    return groups;
  }, {}), [reminders]);
  const visibleMonthLabel = visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const changeMonth = (offset: number) => {
    setHoveredDate(null);
    setContextMenu(null);
    setVisibleMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  const showDateTooltip = (target: HTMLElement, dateKey: string, dayEntries: CalendarEntry[], dayReminders: Reminder[]) => {
    const rect = target.getBoundingClientRect();
    setHoveredDate({
      x: Math.min(Math.max(rect.left + rect.width / 2, 104), window.innerWidth - 104),
      y: rect.bottom + 8,
      dateKey,
      entries: dayEntries,
      reminders: dayReminders,
    });
  };

  const openContextMenu = (event: React.MouseEvent<HTMLElement>, dateKey: string, dayEntries: CalendarEntry[]) => {
    event.preventDefault();
    setHoveredDate(null);
    const menuPosition = getViewportMenuPosition(event.clientX, event.clientY, 224, dayEntries[0] ? 308 : 268);
    setContextMenu({
      x: menuPosition.x,
      y: menuPosition.y,
      dateKey,
      entries: dayEntries,
    });
  };

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const closeContextMenu = () => setContextMenu(null);
    const handleContextMenuKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu(null);
      };

      if ((event.target instanceof HTMLElement) && Boolean(event.target.closest('input, textarea, select, [contenteditable="true"]'))) {
        if (key === 'escape') {
          consume();
        }
        return;
      }

      if (key === 'enter' || key === 'o') {
        consume();
        onOpenCalendar(contextMenu.dateKey);
        return;
      }

      const isCommandKey = event.ctrlKey || event.metaKey;

      if (isCommandKey && key === 'c' && contextMenu.entries[0]) {
        consume();
        onCopyDaily(contextMenu.dateKey);
        return;
      }

      if (isCommandKey && key === 'v' && copiedDaily) {
        consume();
        onPasteDaily(contextMenu.dateKey);
        return;
      }

      if (key === 'p') {
        consume();
        onCopyPreviousDaily(contextMenu.dateKey);
        return;
      }

      if (key === 'd') {
        consume();
        onMarkDayOff(contextMenu.dateKey);
        return;
      }

      if (key === 'r') {
        consume();
        onAddReminder(contextMenu.dateKey);
        return;
      }

      if ((key === 'delete' || key === 'backspace') && contextMenu.entries[0]) {
        consume();
        onDeleteDaily(contextMenu.dateKey);
      }
    };

    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('keydown', handleContextMenuKeyDown);

    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
      window.removeEventListener('keydown', handleContextMenuKeyDown);
    };
  }, [contextMenu, copiedDaily, onAddReminder, onCopyDaily, onCopyPreviousDaily, onDeleteDaily, onMarkDayOff, onOpenCalendar, onPasteDaily]);

  if (compact) {
    return (
      <SidebarRailTooltip label="Calendar">
        <button
          type="button"
          onClick={() => onOpenCalendar()}
          className="mb-3 flex h-11 w-full items-center justify-center rounded bg-white/10 text-white transition hover:bg-white/15"
          aria-label="Open calendar"
        >
          <CalendarDays size={20} />
        </button>
      </SidebarRailTooltip>
    );
  }

  return (
    <div className="relative mb-2 rounded-lg border border-white/10 bg-white/10 p-2 text-white">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100">Calendar</p>
          <p className="truncate text-sm font-bold leading-tight">{visibleMonthLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => changeMonth(-1)} className="flex h-6 w-6 items-center justify-center rounded bg-black/15 text-blue-100 hover:bg-white/15 hover:text-white" aria-label="Previous month" title="Previous Month">
            <ChevronLeft size={15} />
          </button>
          <button type="button" onClick={() => {
            setHoveredDate(null);
            setVisibleMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
          }} className="flex h-6 w-6 items-center justify-center rounded bg-black/15 text-xs font-black text-blue-100 hover:bg-white/15 hover:text-white" aria-label="Current month" title="Current Month">
            {new Date().toLocaleDateString(undefined, { day: 'numeric' })}
          </button>
          <button type="button" onClick={() => changeMonth(1)} className="flex h-6 w-6 items-center justify-center rounded bg-black/15 text-blue-100 hover:bg-white/15 hover:text-white" aria-label="Next month" title="Next Month">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-black uppercase text-blue-100">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayLabel, index) => (
          <span key={`${dayLabel}-${index}`}>{dayLabel}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5">
        {calendarDays.map((date) => {
          const dateKey = getLocalDateKey(date);
          const dayEntries = entriesByDate[dateKey] || [];
          const dayReminders = remindersByDate[dateKey] || [];
          const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
          const isToday = dateKey === todayKey;
          const primaryEntry = dayEntries[0];

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onOpenCalendar(dateKey)}
              onMouseEnter={(event) => showDateTooltip(event.currentTarget, dateKey, dayEntries, dayReminders)}
              onMouseLeave={() => setHoveredDate(null)}
              onFocus={(event) => showDateTooltip(event.currentTarget, dateKey, dayEntries, dayReminders)}
              onBlur={() => setHoveredDate(null)}
              onContextMenu={(event) => openContextMenu(event, dateKey, dayEntries)}
              className={`relative flex aspect-square min-h-6 items-center justify-center rounded border text-[11px] font-black transition duration-300 hover:-translate-y-0.5 hover:shadow-sm ${
                primaryEntry
                  ? 'trooper-daily-strip-filled border-transparent text-white'
                  : isToday
                    ? 'border-white bg-white text-primary-500 shadow'
                    : isCurrentMonth
                      ? 'border-transparent bg-black/15 text-white hover:border-accent hover:text-accent'
                      : 'border-transparent bg-black/5 text-blue-100/45 hover:bg-white/10'
              }`}
              style={primaryEntry ? { backgroundColor: primaryEntry.color } : undefined}
              aria-label={`Open Trooper Daily for ${date.toLocaleDateString()}`}
              title={dayEntries.length > 0 || dayReminders.length > 0 ? `${dayEntries.length} calendar ${dayEntries.length === 1 ? 'entry' : 'entries'}, ${dayReminders.length} ${dayReminders.length === 1 ? 'reminder' : 'reminders'}` : 'Open Calendar'}
            >
              {date.getDate()}
              {isToday && (
                <span
                  className={`trooper-daily-strip-today-marker ${primaryEntry ? 'trooper-daily-strip-today-marker-on-fill' : ''}`}
                  aria-hidden="true"
                />
              )}
              {dayEntries.length > 0 && (
                <span
                  className={`trooper-daily-strip-filled-icon ${
                    primaryEntry?.submissionStatus === 'Submitted'
                      ? 'trooper-daily-strip-filled-icon-submitted'
                      : 'trooper-daily-strip-filled-icon-draft'
                  }`}
                >
                  {dayEntries.length > 1 && <span className="sr-only">{dayEntries.length} entries</span>}
                </span>
              )}
              {dayReminders.length > 0 && (
                <span className="absolute left-1 top-1 flex h-2 w-2 rounded-full border border-white bg-amber-300 shadow" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {hoveredDate && (
        <div
          className="pointer-events-none fixed z-[100] w-52 -translate-x-1/2 rounded-md bg-black px-3 py-2 text-left text-xs font-bold text-white shadow-2xl ring-1 ring-white/10"
          style={{ left: hoveredDate.x, top: hoveredDate.y }}
        >
          <span className="block text-accent">{hoveredDate.dateKey}</span>
          {hoveredDate.entries.length > 0 ? (
            <>
              <span className="mt-1 block">{hoveredDate.entries[0].submissionStatus} - {hoveredDate.entries[0].dutyHours || 0}h</span>
              <span className="mt-0.5 block text-gray-300">{hoveredDate.entries[0].districtWorked || 'No district'}</span>
              {hoveredDate.entries.length > 1 && (
                <span className="mt-0.5 block text-gray-400">+{hoveredDate.entries.length - 1} more</span>
              )}
            </>
          ) : (
            <span className="mt-1 block text-gray-300">No daily report yet</span>
          )}
          {hoveredDate.reminders.length > 0 && (
            <span className="mt-1.5 block border-t border-white/10 pt-1.5 text-amber-200">
              {hoveredDate.reminders.length} reminder{hoveredDate.reminders.length === 1 ? '' : 's'}
              {hoveredDate.reminders[0]?.title ? ` - ${hoveredDate.reminders[0].title}` : ''}
            </span>
          )}
        </div>
      )}

      {contextMenu && (
        <div
          className="quick-launch-context-menu fixed z-[100] min-w-52 overflow-hidden rounded border border-gray-200 bg-white p-1 text-sm shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onOpenCalendar(contextMenu.dateKey);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <span>{contextMenu.entries[0] ? 'Open Daily' : 'Create Daily'}</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">Enter</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onCopyDaily(contextMenu.dateKey);
              setContextMenu(null);
            }}
            disabled={!contextMenu.entries[0]}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <span>Copy Daily</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">Ctrl+C</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onPasteDaily(contextMenu.dateKey);
              setContextMenu(null);
            }}
            disabled={!copiedDaily}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <span>Paste Daily</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">Ctrl+V</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onCopyPreviousDaily(contextMenu.dateKey);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <span>Copy Previous Daily</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">P</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onMarkDayOff(contextMenu.dateKey);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <span>Mark Day Off</span>
            <span className="ml-auto text-xs font-black text-gray-400 dark:text-gray-500">D</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onAddReminder(contextMenu.dateKey);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left font-semibold text-primary-500 hover:bg-gray-50 dark:border-gray-800 dark:text-blue-100 dark:hover:bg-gray-800"
          >
            <span>Add Reminder</span>
            <span className="ml-auto text-xs font-black text-blue-200">R</span>
          </button>
          {contextMenu.entries[0] && (
            <button
              type="button"
              onClick={() => {
                onDeleteDaily(contextMenu.dateKey);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left font-semibold text-danger hover:bg-red-50 dark:border-gray-800 dark:hover:bg-red-950/40"
            >
              <span>Delete Daily</span>
              <span className="ml-auto text-xs font-black text-red-300">Del</span>
            </button>
          )}
        </div>
      )}
    </div>
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
        className="sidebar-search-static mx-auto flex h-11 w-11 items-center justify-center rounded bg-white/10 text-white hover:bg-white/20"
        title="Search"
      >
        <Search size={20} />
      </button>
    );
  }

  return (
    <form data-onboarding-target="global-search" onSubmit={handleSubmit} className="sidebar-search-static relative flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="sidebar-search-icon pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-100" size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setIsResultsOpen(true);
            }
          }}
          placeholder="Search"
          className="global-search-input sidebar-search-input h-11 w-full rounded border border-white/10 bg-white/10 py-2 text-sm text-white outline-none placeholder:text-blue-100 focus:border-white/40 focus:bg-white/15"
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
        <div className="global-search-results absolute left-0 right-0 top-12 z-50 overflow-hidden rounded border border-gray-200 bg-white text-gray-800 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
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
                    src={getAssetThumbnailUrl(user.profilePictureUrl, 96)}
                    alt={`${user.firstName} ${user.lastName}`}
                    onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)}
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

function IconButtonTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="app-icon-tooltip-host">
      {children}
      <span className="app-icon-tooltip" role="tooltip">{label}</span>
    </span>
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
      className="header-action-button relative flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
      aria-label="Open messages"
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







function GlobalKeyboardShortcuts({
  canOpenAdminConsole,
  canCreateUsers,
  isLocked,
  showCalendar,
  defaultAdminConsoleTab,
  onOpenMessages,
  onOpenCalendar,
  onOpenCalculator,
  onOpenCommandPalette,
  onLock,
}: {
  canOpenAdminConsole: boolean;
  canCreateUsers: boolean;
  isLocked: boolean;
  showCalendar: boolean;
  defaultAdminConsoleTab: AdminConsoleTab;
  onOpenMessages: () => void;
  onOpenCalendar: () => void;
  onOpenCalculator: () => void;
  onOpenCommandPalette: () => void;
  onLock: () => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    const focusUserSearch = () => {
      startTransition(() => navigate('/search'));
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('shield:focus-user-search'));
      }, 80);
    };

    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        onLock();
        return;
      }

      if (isLocked) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenCommandPalette();
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === '/') {
        event.preventDefault();
        focusUserSearch();
        return;
      }

      if (key === 'm') {
        event.preventDefault();
        onOpenMessages();
        return;
      }

      if (key === 'c' && showCalendar) {
        event.preventDefault();
        onOpenCalendar();
        return;
      }

      if (key === 'd') {
        event.preventDefault();
        startTransition(() => navigate('/'));
        return;
      }

      if (key === 'r') {
        event.preventDefault();
        startTransition(() => navigate('/reports'));
        return;
      }

      if (key === 'a' && canOpenAdminConsole) {
        event.preventDefault();
        startTransition(() => navigate(`/admin/${defaultAdminConsoleTab}`));
        return;
      }

      if (key === 'u' && canCreateUsers) {
        event.preventDefault();
        startTransition(() => navigate('/admin/create-user'));
        return;
      }

      if (key === '=') {
        event.preventDefault();
        onOpenCalculator();
      }
    };

    document.addEventListener('keydown', handleShortcut);

    return () => document.removeEventListener('keydown', handleShortcut);
  }, [canCreateUsers, canOpenAdminConsole, defaultAdminConsoleTab, isLocked, navigate, onLock, onOpenCalendar, onOpenCalculator, onOpenCommandPalette, onOpenMessages, showCalendar]);

  return null;
}

function PageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="page-loader-enter flex min-h-48 items-center justify-center">
      <div className="loading min-w-56">{label}</div>
    </div>
  );
}

function getInitialFloatingModalPosition(maxWidth: number, yRatio = 0.08) {
  const width = Math.min(window.innerWidth - 16, maxWidth);
  return {
    x: Math.max(8, (window.innerWidth - width) / 2),
    y: Math.max(8, window.innerHeight * yRatio),
  };
}

function getInitialMessagesModalPosition() {
  return getInitialFloatingModalPosition(900, 0.08);
}

function getModalBackdropClass(isClosing: boolean, tint = 'bg-black/50') {
  return `${isClosing ? 'modal-backdrop-exit' : 'modal-backdrop'} fixed inset-0 z-50 flex items-end justify-center sm:items-center ${tint}`;
}

function getModalWindowClass(isClosing: boolean, className: string) {
  return `${isClosing ? 'modal-window-exit' : 'modal-window'} ${className}`;
}

function DesktopUpdatePrompt({
  status,
  installedVersion,
  onClose,
  onInstall,
}: {
  status: ShieldDesktopUpdateStatus | null;
  installedVersion?: string;
  onClose: () => void;
  onInstall: () => void;
}) {
  const progress = status?.type === 'downloaded' || status?.type === 'restarting'
    ? 100
    : status?.type === 'downloading'
      ? Math.min(100, Math.max(0, Math.round(status.percent || 0)))
      : 0;
  const isDownloaded = status?.type === 'downloaded';
  const isRestarting = status?.type === 'restarting';
  const targetVersionLabel = status?.version ? `version ${status.version}` : 'the latest release';

  return (
    <div className={getModalBackdropClass(false, 'bg-black/55 backdrop-blur-sm')}>
      <div className={getModalWindowClass(false, 'w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl dark:bg-gray-900 sm:p-6')}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
              <Download size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-accent">Desktop Update</p>
              <h2 className="mt-1 text-xl font-black text-gray-900 dark:text-gray-100">Desktop app needs an update</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                This workstation is running {installedVersion ? `version ${installedVersion}` : 'an older desktop version'}.
                The desktop app is preparing {targetVersionLabel} and will restart automatically when it is ready.
              </p>
            </div>
          </div>
          {!isRestarting && (
            <button type="button" onClick={onClose} className="icon-close-button" aria-label="Close update prompt">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="mt-5 rounded border border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
            <span>{isRestarting ? 'Restarting' : isDownloaded ? 'Ready' : 'Downloading'}</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-accent" />
            <span>{isDownloaded || isRestarting ? 'Save any in-progress work now. The desktop app is ready to finish installing.' : 'You can keep working while the update downloads.'}</span>
          </p>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {!isRestarting && (
            <button type="button" onClick={onClose} className="btn-secondary justify-center">
              <X size={16} />
              <span>{isDownloaded ? 'Wait for Auto Restart' : 'Continue Working'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onInstall}
            disabled={!isDownloaded || isRestarting}
            className="btn-primary justify-center disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCw size={16} />
            <span>{isRestarting ? 'Restarting...' : 'Restart Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
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

function UrgentAlertModal({
  alert,
  onAcknowledge,
  isAcknowledging,
}: {
  alert: UrgentAlert;
  onAcknowledge: () => void;
  isAcknowledging: boolean;
}) {
  const severityClass = alert.severity === 'Critical'
    ? 'bg-red-600 text-white'
    : alert.severity === 'Urgent'
      ? 'bg-red-50 text-danger ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900'
      : alert.severity === 'Important'
        ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-900'
        : 'bg-blue-50 text-primary-500 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-100 dark:ring-blue-900';

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 px-4 py-8 text-gray-900 dark:text-gray-100">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border-2 border-danger bg-white shadow-[0_30px_90px_rgba(127,29,29,0.45)] dark:bg-gray-950">
        <div className="bg-danger px-5 py-4 text-white">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-white/15 ring-1 ring-white/25">
              <AlertTriangle size={26} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-100">Urgent Alert</p>
              <h2 className="mt-1 text-2xl font-bold leading-tight text-white">{alert.title}</h2>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black uppercase text-danger">
              {alert.severity}
            </span>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide">
            <span className={`rounded-full px-3 py-1 ${severityClass}`}>{alert.severity}</span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600 dark:bg-gray-900 dark:text-gray-300">{alert.audienceLabel || 'Targeted alert'}</span>
            {alert.expiresAt && <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600 dark:bg-gray-900 dark:text-gray-300">Expires {new Date(alert.expiresAt).toLocaleString()}</span>}
          </div>

          <p className="whitespace-pre-wrap text-lg font-semibold leading-8 text-gray-800 dark:text-gray-100">
            {alert.message}
          </p>

          <div className="mt-5 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            Sent by <span className="font-bold">{alert.createdByName || DEFAULT_APP_NAME}</span> on {new Date(alert.createdAt).toLocaleString()}.
          </div>
        </div>

        <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
          <button type="button" onClick={onAcknowledge} disabled={isAcknowledging} className="btn-primary bg-danger hover:bg-red-800">
            {isAcknowledging ? 'Acknowledging...' : alert.requireAcknowledgement ? 'Acknowledge Alert' : 'Dismiss Alert'}
          </button>
        </div>
      </div>
    </div>
  );
}

const setupFeatureOptions = [
  { id: 'dashboardWidgets', label: 'Dashboard widgets', description: 'Pinned profiles, sticky notes, My Day, reminders, and updates.' },
  { id: 'messaging', label: 'Messaging', description: 'Internal conversations, unread counts, reactions, and realtime updates.' },
  { id: 'mediaLibrary', label: 'Media library', description: 'Shared image storage for profiles and dashboard posts.' },
  { id: 'calendarReminders', label: 'Calendar and reminders', description: 'Daily entries, reminders, and review workflows.' },
  { id: 'deviceManagement', label: 'Device management', description: 'Track assigned equipment, status, and history.' },
  { id: 'reportsAudit', label: 'Reports and audit', description: 'Reporting views, audit log, and operational exports.' },
  { id: 'urgentAlerts', label: 'Urgent alerts', description: 'Priority alerts with acknowledgement tracking.' },
  { id: 'performanceEvaluations', label: 'Performance evaluations', description: 'CPAR/evaluation creation, delivery, and signatures.' },
];

const setupSteps = ['Database', 'Features', 'Access', 'Settings', 'Admin'];

function getDefaultSetupEnvironment(status: SetupStatus | null): SetupEnvironmentValues {
  const apiUrl = getApiHealthUrl().replace(/\/health$/u, '/api');
  return {
    NODE_ENV: 'development',
    PORT: '5000',
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_USER: 'root',
    DB_PASSWORD: '',
    DB_NAME: status?.database.name || 'shield',
    ALLOWED_ORIGINS: window.location.origin,
    APP_BASE_URL: status?.appBaseUrl || `${window.location.origin}${APP_BASE_PATH}`,
    API_BASE_URL: status?.apiUrl || apiUrl,
    SESSION_COOKIE_SECURE: window.location.protocol === 'https:' ? 'true' : 'false',
    SESSION_COOKIE_SAMESITE: 'lax',
    TRUST_PROXY: 'false',
  };
}

function getDefaultSetupPayload(status: SetupStatus | null): CompleteSetupPayload {
  const inferredApiUrl = getApiHealthUrl().replace(/\/health$/u, '/api');
  return {
    appName: status?.appName || DEFAULT_APP_NAME,
    siteName: status?.siteName || DEFAULT_SITE_NAME,
    brandLogoDataUrl: status?.brandLogoDataUrl || '',
    primaryColor: status?.primaryColor || DEFAULT_PRIMARY_COLOR,
    secondaryColor: status?.secondaryColor || DEFAULT_SECONDARY_COLOR,
    appBaseUrl: status?.appBaseUrl || `${window.location.origin}${APP_BASE_PATH}`,
    apiUrl: status?.apiUrl || inferredApiUrl,
    registrationMode: status?.registrationMode || 'invite-only',
    maintenanceMode: false,
    loginWarningEnabled: true,
    loginWarningMessage: 'This system is for authorized use only and may be monitored.',
    sessionTimeoutMinutes: 0,
    features: status?.features?.length ? status.features : setupFeatureOptions.map((feature) => feature.id),
    admin: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  };
}

function InstalledSetupClosedScreen({ appName, siteName }: { appName: string; siteName: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-950 px-4 py-6 text-gray-100">
      <div className="w-full max-w-xl rounded-lg border border-white/10 bg-white p-6 text-center text-gray-900 shadow-2xl dark:bg-gray-900 dark:text-gray-100">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded bg-success text-white">
          <CheckCircle2 size={30} />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-accent">Installer Closed</p>
        <h1 className="mt-2 text-3xl font-bold text-primary-500 dark:text-blue-100">{appName} is installed</h1>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          The first-run installer is locked after setup is complete. Environment changes should now be handled by an administrator on the server.
        </p>
        <button type="button" onClick={() => window.location.replace(withAppBase('/'))} className="btn-primary mt-6">
          Go to {siteName}
        </button>
      </div>
    </div>
  );
}

function SetupWizard({
  status,
  onComplete,
  onToast,
}: {
  status: SetupStatus | null;
  onComplete: (account: AuthAccount, settings: Pick<CompleteSetupPayload, 'appName' | 'siteName' | 'brandLogoDataUrl' | 'primaryColor' | 'secondaryColor' | 'appBaseUrl' | 'apiUrl' | 'registrationMode' | 'features'>) => void;
  onToast: (type: ToastType, message: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CompleteSetupPayload>(() => getDefaultSetupPayload(status));
  const [environmentForm, setEnvironmentForm] = useState<SetupEnvironmentValues>(() => getDefaultSetupEnvironment(status));
  const [canWriteEnvironment, setCanWriteEnvironment] = useState(false);
  const [isEnvironmentLoading, setIsEnvironmentLoading] = useState(true);
  const [isSavingEnvironment, setIsSavingEnvironment] = useState(false);
  const [isTestingDatabase, setIsTestingDatabase] = useState(false);
  const [databaseTestResult, setDatabaseTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [environmentSavedMessage, setEnvironmentSavedMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(status?.error || null);

  useEffect(() => {
    setForm(getDefaultSetupPayload(status));
    setEnvironmentForm((currentEnvironment) => ({ ...getDefaultSetupEnvironment(status), ...currentEnvironment }));
    setError(status?.error || null);
  }, [status]);

  useEffect(() => {
    const previousPrimary = document.documentElement.style.getPropertyValue('--app-primary');
    const previousSecondary = document.documentElement.style.getPropertyValue('--app-secondary');

    return () => {
      document.documentElement.style.setProperty('--app-primary', previousPrimary || status?.primaryColor || DEFAULT_PRIMARY_COLOR);
      document.documentElement.style.setProperty('--app-secondary', previousSecondary || status?.secondaryColor || DEFAULT_SECONDARY_COLOR);
    };
  }, [status?.primaryColor, status?.secondaryColor]);

  useEffect(() => {
    if (isHexColor(form.primaryColor)) {
      document.documentElement.style.setProperty('--app-primary', form.primaryColor);
    }
    if (isHexColor(form.secondaryColor)) {
      document.documentElement.style.setProperty('--app-secondary', form.secondaryColor);
    }
  }, [form.primaryColor, form.secondaryColor]);

  useEffect(() => {
    let isMounted = true;
    authService.getSetupEnvironment()
      .then((response) => {
        if (!isMounted) {
          return;
        }
        setCanWriteEnvironment(response.data.canWrite);
        setEnvironmentForm(response.data.values);
        setForm((currentForm) => ({
          ...currentForm,
          appBaseUrl: response.data.values.APP_BASE_URL || currentForm.appBaseUrl,
          apiUrl: response.data.values.API_BASE_URL || currentForm.apiUrl,
        }));
      })
      .catch((err) => {
        console.error('Failed to load setup environment:', err);
        if (isMounted) {
          setCanWriteEnvironment(false);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsEnvironmentLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateForm = <Key extends keyof CompleteSetupPayload>(key: Key, value: CompleteSetupPayload[Key]) => {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
  };

  const updateAdmin = (key: keyof CompleteSetupPayload['admin'], value: string) => {
    setForm((currentForm) => ({
      ...currentForm,
      admin: { ...currentForm.admin, [key]: value },
    }));
  };

  const updateEnvironment = (key: keyof SetupEnvironmentValues, value: string) => {
    setEnvironmentForm((currentEnvironment) => ({ ...currentEnvironment, [key]: value }));
    if (key.startsWith('DB_')) {
      setDatabaseTestResult(null);
    }
    if (key === 'APP_BASE_URL') {
      updateForm('appBaseUrl', value);
    }
    if (key === 'API_BASE_URL') {
      updateForm('apiUrl', value);
    }
  };

  const testDatabase = async () => {
    setIsTestingDatabase(true);
    setError(null);
    setDatabaseTestResult(null);
    try {
      const response = await authService.testSetupDatabase(environmentForm);
      setDatabaseTestResult({
        connected: response.data.connected,
        message: response.data.message || 'Database connection verified.',
      });
    } catch (err) {
      setDatabaseTestResult({
        connected: false,
        message: getErrorMessage(err, 'Database connection failed.'),
      });
    } finally {
      setIsTestingDatabase(false);
    }
  };

  const saveEnvironment = async () => {
    setIsSavingEnvironment(true);
    setError(null);
    setEnvironmentSavedMessage(null);
    try {
      const response = await authService.saveSetupEnvironment(environmentForm);
      setCanWriteEnvironment(response.data.canWrite);
      setEnvironmentSavedMessage(response.data.message || 'Environment saved. Restart the backend to apply changes.');
      setForm((currentForm) => ({
        ...currentForm,
        appBaseUrl: environmentForm.APP_BASE_URL || currentForm.appBaseUrl,
        apiUrl: environmentForm.API_BASE_URL || currentForm.apiUrl,
      }));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save environment settings.'));
    } finally {
      setIsSavingEnvironment(false);
    }
  };

  const toggleFeature = (featureId: string) => {
    setForm((currentForm) => ({
      ...currentForm,
      features: currentForm.features.includes(featureId)
        ? currentForm.features.filter((item) => item !== featureId)
        : [...currentForm.features, featureId],
    }));
  };

  const handleLogoFileChange = (file: File | null) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for the app logo.');
      return;
    }

    if (file.size > MAX_SETUP_LOGO_SIZE_BYTES) {
      setError('Logo image must be 240 KB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        setError('Logo image could not be read.');
        return;
      }
      setError(null);
      updateForm('brandLogoDataUrl', result);
    };
    reader.onerror = () => setError('Logo image could not be read.');
    reader.readAsDataURL(file);
  };

  const validateCurrentStep = (): string | null => {
    if (step === 0 && !status?.database.connected) {
      return 'Save the environment settings, restart the backend, and return to this installer once the database connects.';
    }

    if (step === 1 && form.features.length === 0) {
      return 'Select at least one feature area.';
    }

    if (step === 3) {
      if (!form.appName.trim() || !form.siteName.trim()) {
        return 'Application name and site name are required.';
      }
      if (!/^https?:\/\//iu.test(form.appBaseUrl.trim())) {
        return 'Application URL must start with http:// or https://.';
      }
      if (!/^https?:\/\//iu.test(form.apiUrl.trim())) {
        return 'API URL must start with http:// or https://.';
      }
      if (!isHexColor(form.primaryColor) || !isHexColor(form.secondaryColor)) {
        return 'Choose valid primary and secondary colors.';
      }
    }

    if (step === 4) {
      if (!form.admin.firstName.trim() || !form.admin.lastName.trim() || !form.admin.email.trim()) {
        return 'First admin name and email are required.';
      }
      if (form.admin.password !== form.admin.confirmPassword) {
        return 'Admin passwords do not match.';
      }
      if (!isSecurePassword(form.admin.password)) {
        return PASSWORD_REQUIREMENTS_MESSAGE.replace('Password', 'Admin password');
      }
    }

    return null;
  };

  const goNext = () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setStep((currentStep) => Math.min(currentStep + 1, setupSteps.length - 1));
  };

  const goBack = () => {
    setError(null);
    setStep((currentStep) => Math.max(currentStep - 1, 0));
  };

  const submitSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await authService.completeSetup(form);
      if (!response.data.account) {
        setError('Setup completed, but no admin session was returned.');
        return;
      }
      onToast('success', 'Installation complete.');
      onComplete(response.data.account, {
        appName: form.appName,
        siteName: form.siteName,
        brandLogoDataUrl: form.brandLogoDataUrl,
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        appBaseUrl: form.appBaseUrl,
        apiUrl: form.apiUrl,
        registrationMode: form.registrationMode,
        features: form.features,
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to complete installation.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gray-950 px-4 py-6 text-gray-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-6xl flex-col justify-center">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded bg-accent text-white shadow-lg">
            <Shield size={26} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">First Run Installation</p>
            <h1 className="text-3xl font-bold text-white">Configure {form.appName || DEFAULT_APP_NAME}</h1>
          </div>
        </div>

        <div className="grid overflow-hidden rounded-lg border border-white/10 bg-white shadow-2xl dark:bg-gray-900 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="bg-primary-500 p-5 text-white dark:bg-gray-950">
            <div className="space-y-2">
              {setupSteps.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(index)}
                  className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left text-sm font-bold transition ${
                    index === step ? 'bg-white text-primary-500 shadow' : index < step ? 'bg-white/15 text-white' : 'text-blue-100 hover:bg-white/10'
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full ${index < step ? 'bg-success text-white' : index === step ? 'bg-primary-500 text-white' : 'bg-white/15 text-white'}`}>
                    {index < step ? <CheckCircle2 size={16} /> : index + 1}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </aside>

          <form onSubmit={submitSetup} className="min-h-[36rem] p-5 text-gray-900 dark:text-gray-100 sm:p-7">
            {error && <div className="error">{error}</div>}

            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-primary-500 dark:text-blue-100">Environment And Database</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Fill out the backend `.env` values used by this app. Database changes require a backend restart.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                    <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Connection</p>
                    <p className={`mt-2 flex items-center gap-2 text-lg font-bold ${status?.database.connected ? 'text-success' : 'text-danger'}`}>
                      {status?.database.connected ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                      {status?.database.connected ? 'Connected' : 'Not connected'}
                    </p>
                  </div>
                  <div className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                    <p className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400">Database</p>
                    <p className="mt-2 text-lg font-bold text-gray-900 dark:text-white">{status?.database.name || 'Configured database'}</p>
                  </div>
                </div>
                {environmentSavedMessage && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    <span>{environmentSavedMessage}</span>
                    <button type="button" onClick={() => window.location.reload()} className="btn-secondary bg-white text-amber-900 hover:bg-amber-100 dark:bg-gray-950 dark:text-amber-100 dark:hover:bg-gray-900">
                      Refresh After Restart
                    </button>
                  </div>
                )}
                {databaseTestResult && (
                  <div className={`rounded border p-4 text-sm font-semibold ${
                    databaseTestResult.connected
                      ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100'
                      : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
                  }`}>
                    {databaseTestResult.message}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Environment</span>
                    <select
                      value={environmentForm.NODE_ENV}
                      onChange={(event) => updateEnvironment('NODE_ENV', event.target.value)}
                      disabled={!canWriteEnvironment || isEnvironmentLoading}
                      className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60"
                    >
                      <option value="development">Development</option>
                      <option value="production">Production</option>
                      <option value="test">Test</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Backend Port</span>
                    <input value={environmentForm.PORT} onChange={(event) => updateEnvironment('PORT', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">DB Host</span>
                    <input value={environmentForm.DB_HOST} onChange={(event) => updateEnvironment('DB_HOST', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">DB Port</span>
                    <input value={environmentForm.DB_PORT} onChange={(event) => updateEnvironment('DB_PORT', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">DB User</span>
                    <input value={environmentForm.DB_USER} onChange={(event) => updateEnvironment('DB_USER', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">DB Password</span>
                    <input type="password" value={environmentForm.DB_PASSWORD} onChange={(event) => updateEnvironment('DB_PASSWORD', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} placeholder={canWriteEnvironment ? 'Leave blank to keep current password' : 'Hidden after save'} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">DB Name</span>
                    <input value={environmentForm.DB_NAME} onChange={(event) => updateEnvironment('DB_NAME', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Allowed Origins</span>
                    <input value={environmentForm.ALLOWED_ORIGINS} onChange={(event) => updateEnvironment('ALLOWED_ORIGINS', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Application URL</span>
                    <input value={environmentForm.APP_BASE_URL} onChange={(event) => updateEnvironment('APP_BASE_URL', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">API URL</span>
                    <input value={environmentForm.API_BASE_URL} onChange={(event) => updateEnvironment('API_BASE_URL', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60" />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="flex items-center justify-between gap-3 rounded border border-gray-200 p-3 dark:border-gray-800">
                    <span className="text-sm font-semibold">Secure cookies</span>
                    <input type="checkbox" checked={environmentForm.SESSION_COOKIE_SECURE === 'true'} onChange={(event) => updateEnvironment('SESSION_COOKIE_SECURE', event.target.checked ? 'true' : 'false')} disabled={!canWriteEnvironment || isEnvironmentLoading} />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Cookie SameSite</span>
                    <select value={environmentForm.SESSION_COOKIE_SAMESITE} onChange={(event) => updateEnvironment('SESSION_COOKIE_SAMESITE', event.target.value)} disabled={!canWriteEnvironment || isEnvironmentLoading} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-60">
                      <option value="lax">lax</option>
                      <option value="strict">strict</option>
                      <option value="none">none</option>
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded border border-gray-200 p-3 dark:border-gray-800">
                    <span className="text-sm font-semibold">Trust proxy</span>
                    <input type="checkbox" checked={environmentForm.TRUST_PROXY === 'true'} onChange={(event) => updateEnvironment('TRUST_PROXY', event.target.checked ? 'true' : 'false')} disabled={!canWriteEnvironment || isEnvironmentLoading} />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">
                  <span>Test the database settings, save `.env`, restart the backend, then refresh this installer.</span>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void testDatabase()} disabled={!canWriteEnvironment || isTestingDatabase || isEnvironmentLoading} className="btn-secondary disabled:pointer-events-none disabled:opacity-50">
                      {isTestingDatabase ? 'Testing...' : 'Test Database'}
                    </button>
                    <button type="button" onClick={() => void saveEnvironment()} disabled={!canWriteEnvironment || isSavingEnvironment || isEnvironmentLoading} className="btn-primary disabled:pointer-events-none disabled:opacity-50">
                      {isSavingEnvironment ? 'Saving...' : 'Save .env'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-primary-500 dark:text-blue-100">Feature Checklist</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select the areas this installation should track during setup.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {setupFeatureOptions.map((feature) => (
                    <label key={feature.id} className="flex cursor-pointer items-start gap-3 rounded border border-gray-200 bg-gray-50 p-4 transition hover:border-accent dark:border-gray-800 dark:bg-gray-950">
                      <input
                        type="checkbox"
                        checked={form.features.includes(feature.id)}
                        onChange={() => toggleFeature(feature.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-bold text-gray-900 dark:text-white">{feature.label}</span>
                        <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">{feature.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-primary-500 dark:text-blue-100">Permissions And Roles</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">The installer will create the first administrator account and keep the default role definitions ready.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded bg-primary-500/10 text-primary-500 dark:bg-blue-950 dark:text-blue-100">
                      <LockKeyhole size={20} />
                    </div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Administrator</h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Full access to users, roles, dashboard posts, media, devices, reports, alerts, audit, and system settings.</p>
                  </div>
                  <div className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded bg-accent/10 text-accent">
                      <UserCircle size={20} />
                    </div>
                    <h3 className="font-bold text-gray-900 dark:text-white">Standard User</h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Baseline access for user search, calendar tools, and messaging. Admins can tune permissions after setup.</p>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-primary-500 dark:text-blue-100">Application Settings</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Set URLs, security defaults, registration behavior, and site naming.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Application Name</span>
                    <input value={form.appName} onChange={(event) => updateForm('appName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Site Name</span>
                    <input value={form.siteName} onChange={(event) => updateForm('siteName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                  <div className="md:col-span-2">
                    <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-300">App Logo</span>
                    <div className="flex flex-wrap items-center gap-4 rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                      <div className="flex h-20 w-20 items-center justify-center rounded border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700">
                        {form.brandLogoDataUrl ? (
                          <img src={form.brandLogoDataUrl} alt="App logo preview" className="h-full w-full object-contain" />
                        ) : (
                          <img src={withAppBase(DEFAULT_BRAND_LOGO)} alt="Default logo preview" className="h-full w-full object-contain" />
                        )}
                      </div>
                      <div className="min-w-[14rem] flex-1">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                          onChange={(event) => handleLogoFileChange(event.target.files?.[0] || null)}
                          className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">PNG, JPG, WebP, GIF, or SVG. Max 240 KB.</p>
                      </div>
                      {form.brandLogoDataUrl && (
                        <button type="button" onClick={() => updateForm('brandLogoDataUrl', '')} className="btn-secondary">
                          Use Default
                        </button>
                      )}
                    </div>
                  </div>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Primary Color</span>
                    <div className="flex items-center gap-3">
                      <input type="color" value={isHexColor(form.primaryColor) ? form.primaryColor : DEFAULT_PRIMARY_COLOR} onChange={(event) => updateForm('primaryColor', event.target.value)} className="h-11 w-14 rounded border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-950" />
                      <input value={form.primaryColor} onChange={(event) => updateForm('primaryColor', event.target.value)} className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                    </div>
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Secondary Color</span>
                    <div className="flex items-center gap-3">
                      <input type="color" value={isHexColor(form.secondaryColor) ? form.secondaryColor : DEFAULT_SECONDARY_COLOR} onChange={(event) => updateForm('secondaryColor', event.target.value)} className="h-11 w-14 rounded border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-950" />
                      <input value={form.secondaryColor} onChange={(event) => updateForm('secondaryColor', event.target.value)} className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                    </div>
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Application URL</span>
                    <input value={form.appBaseUrl} onChange={(event) => updateForm('appBaseUrl', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">API URL</span>
                    <input value={form.apiUrl} onChange={(event) => updateForm('apiUrl', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Registration</span>
                    <select value={form.registrationMode} onChange={(event) => updateForm('registrationMode', event.target.value as RegistrationSettings['mode'])} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950">
                      <option value="invite-only">Invite only</option>
                      <option value="disabled">Disabled</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Session Timeout Minutes</span>
                    <input type="number" min={0} max={1440} value={form.sessionTimeoutMinutes} onChange={(event) => updateForm('sessionTimeoutMinutes', Math.max(0, Number(event.target.value) || 0))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-3 dark:border-gray-800">
                    <span className="font-semibold">Maintenance mode</span>
                    <input type="checkbox" checked={form.maintenanceMode} onChange={(event) => updateForm('maintenanceMode', event.target.checked)} />
                  </label>
                  <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-3 dark:border-gray-800">
                    <span className="font-semibold">Login warning</span>
                    <input type="checkbox" checked={form.loginWarningEnabled} onChange={(event) => updateForm('loginWarningEnabled', event.target.checked)} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Login Warning Message</span>
                  <textarea value={form.loginWarningMessage} onChange={(event) => updateForm('loginWarningMessage', event.target.value)} disabled={!form.loginWarningEnabled} rows={4} className="w-full resize-none rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950 disabled:opacity-50" />
                </label>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-primary-500 dark:text-blue-100">First Admin Account</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This account will be created as the first administrator and signed in when installation finishes.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">First Name</span>
                    <input value={form.admin.firstName} onChange={(event) => updateAdmin('firstName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Last Name</span>
                    <input value={form.admin.lastName} onChange={(event) => updateAdmin('lastName', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                  <label className="md:col-span-2">
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Email</span>
                    <input type="email" value={form.admin.email} onChange={(event) => updateAdmin('email', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Password</span>
                    <input type="password" value={form.admin.password} onChange={(event) => updateAdmin('password', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Confirm Password</span>
                    <input type="password" value={form.admin.confirmPassword} onChange={(event) => updateAdmin('confirmPassword', event.target.value)} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                  </label>
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-between gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
              <button type="button" onClick={goBack} disabled={step === 0 || isSubmitting} className="btn-secondary disabled:pointer-events-none disabled:opacity-40">
                <ChevronLeft size={16} />
              </button>
              {step < setupSteps.length - 1 ? (
                <button type="button" onClick={goNext} className="btn-primary">
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting ? 'Installing...' : <Save size={16} />}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
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
  const [theme, setTheme] = useState<AppTheme>('light');
  const [isGlassTheme, setIsGlassTheme] = useState(false);
  const [seasonalTheme, setSeasonalTheme] = useState<SeasonalThemePreference>(() => {
    try {
      return normalizeSeasonalTheme(window.localStorage.getItem(SEASONAL_THEME_KEY));
    } catch {
      return 'auto';
    }
  });
  const [globalContextMenu, setGlobalContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [notifications, setNotifications] = useState<ToastMessage[]>([]);
  const [desktopPreferences, setDesktopPreferences] = useState<ShieldDesktopPreferences | null>(null);
  const [desktopUpdateStatus, setDesktopUpdateStatus] = useState<ShieldDesktopUpdateStatus | null>(null);
  const [isDesktopUpdatePromptOpen, setIsDesktopUpdatePromptOpen] = useState(false);
  const [isDesktopStartupUpdateBlocking, setIsDesktopStartupUpdateBlocking] = useState(false);
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
  const appScaleTransitionTimerRef = useRef<number | null>(null);
  const sessionTimeoutNotificationShownRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const desktopSessionActivityReportRef = useRef<number>(0);
  const desktopQuitSignOutStartedRef = useRef(false);
  const handleLogoutRef = useRef<() => Promise<void>>(async () => undefined);
  const [userNotifications, setUserNotifications] = useState<UserNotification[]>([]);
  const [urgentAlerts, setUrgentAlerts] = useState<UrgentAlert[]>([]);
  const [acknowledgingUrgentAlertId, setAcknowledgingUrgentAlertId] = useState<string | null>(null);
  const lastUrgentAlertIdsRef = useRef<Set<string>>(new Set());
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isSetupLoading, setIsSetupLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const appName = setupStatus?.appName || DEFAULT_APP_NAME;
  const siteName = setupStatus?.siteName || DEFAULT_SITE_NAME;
  const brandLogoDataUrl = setupStatus?.brandLogoDataUrl || '';
  const primaryColor = setupStatus?.primaryColor || DEFAULT_PRIMARY_COLOR;
  const secondaryColor = setupStatus?.secondaryColor || DEFAULT_SECONDARY_COLOR;
  const activeSeasonalTheme = useMemo(() => getEffectiveSeasonalTheme(seasonalTheme), [seasonalTheme]);
  const activeSeasonalThemeOption = useMemo(() => getSeasonalThemeOption(activeSeasonalTheme), [activeSeasonalTheme]);
  const resolvedBrandLogoSrc = useMemo(() => getBrandLogoSrc(brandLogoDataUrl, activeSeasonalTheme), [activeSeasonalTheme, brandLogoDataUrl]);
  const [isApiConnectionLost, setIsApiConnectionLost] = useState(false);
  const [lastApiConnectedAt, setLastApiConnectedAt] = useState<number | null>(Date.now());
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isMessagesModalOpen, setIsMessagesModalOpen] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [isAppBackgrounded, setIsAppBackgrounded] = useState(() => document.hidden);
  const isAppBackgroundedRef = useRef(isAppBackgrounded);
  const [reminderModalDate, setReminderModalDate] = useState<string | null>(null);
  const [isReminderSaving, setIsReminderSaving] = useState(false);
  const [dueReminderPopup, setDueReminderPopup] = useState<Reminder[]>([]);
  const [isCompletingDueReminder, setIsCompletingDueReminder] = useState(false);
  const [activeFloatingApp, setActiveFloatingApp] = useState<FloatingAppId>('messages');
  const [messageTargetUser, setMessageTargetUser] = useState<User | null>(null);
  const [messageTargetThreadId, setMessageTargetThreadId] = useState<string | null>(null);
  const [messageComposeRequestKey] = useState(0);
  const [isReportBugOpen, setIsReportBugOpen] = useState(false);
  const [isBugTrackerOpen, setIsBugTrackerOpen] = useState(false);
  const [isFirstLoginGuideOpen, setIsFirstLoginGuideOpen] = useState(false);
  const [isWelcomeSplashOpen, setIsWelcomeSplashOpen] = useState(false);
  const [shouldLaunchGuideAfterWelcome, setShouldLaunchGuideAfterWelcome] = useState(false);
  const [closingModal, setClosingModal] = useState<ClosingModal | null>(null);
  useEffect(() => {
    const updateDocumentVisibility = () => {
      setIsAppBackgrounded(document.hidden);
    };
    const removeDesktopVisibilityListener = hasShieldDesktopFeature('onWindowVisibility')
      ? window.shieldDesktop?.onWindowVisibility?.((payload) => {
        setIsAppBackgrounded(payload.backgrounded);
      })
      : undefined;

    updateDocumentVisibility();
    document.addEventListener('visibilitychange', updateDocumentVisibility);

    return () => {
      document.removeEventListener('visibilitychange', updateDocumentVisibility);
      removeDesktopVisibilityListener?.();
    };
  }, []);

  useEffect(() => {
    isAppBackgroundedRef.current = isAppBackgrounded;
    document.documentElement.classList.toggle('shield-app-backgrounded', isAppBackgrounded);
  }, [isAppBackgrounded]);

  useEffect(() => {
    const collapseSidebarOnMobile = () => {
      if (isMobileViewport()) {
        setIsSidebarCollapsed(true);
      }
    };

    collapseSidebarOnMobile();
    window.addEventListener('resize', collapseSidebarOnMobile);

    return () => window.removeEventListener('resize', collapseSidebarOnMobile);
  }, []);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [sidebarCalendarEntries, setSidebarCalendarEntries] = useState<CalendarEntry[]>([]);
  const [sidebarReminders, setSidebarReminders] = useState<Reminder[]>([]);
  const [copiedSidebarDaily, setCopiedSidebarDaily] = useState<CalendarEntryPayload | null>(null);
  const previousMessageUnreadCount = useRef<number | null>(null);
  const notificationsMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const rateLimitToastRef = useRef(0);
  const desktopUpdateCheckIsManualRef = useRef(false);
  const desktopUpdateCheckedAccountRef = useRef<string | null>(null);
  const initialLoadingRef = useRef(true);
  const desktopCrashReportSubmittedRef = useRef<Set<string>>(new Set());
  const shownDueReminderIdsRef = useRef<Set<string>>(new Set());
  const notificationRequestRef = useRef(0);
  const apiConnectionWasLostRef = useRef(false);
  const scheduledReminderTimeoutsRef = useRef<Map<string, number>>(new Map());
  const awayPresenceTimerRef = useRef<number | null>(null);
  const awayPresenceStateRef = useRef<'active' | 'away' | 'busy'>('active');
  const awayPresenceRequestRef = useRef(0);
  const lastPresencePostRef = useRef<Record<'active' | 'away' | 'busy', number>>({ active: 0, away: 0, busy: 0 });
  const sidebarCalendarRefreshTimerRef = useRef<number | null>(null);
  const messageUnreadRefreshTimerRef = useRef<number | null>(null);
  const [messagePreferences, setMessagePreferences] = useState<MessagePreferences>(() => loadMessagePreferences());
  const [notificationSounds, setNotificationSounds] = useState<NotificationSound[]>([]);

  useEffect(() => {
    let isMounted = true;
    let retryTimer: number | null = null;

    const loadSetupStatus = async () => {
      const isHealthy = await checkApiHealth();
      if (!isMounted) {
        return;
      }

      if (!isHealthy) {
        setIsApiConnectionLost(true);
        retryTimer = window.setTimeout(loadSetupStatus, 3500);
        return;
      }

      setLastApiConnectedAt(Date.now());
      setIsApiConnectionLost(false);

      try {
        const response = await authService.getSetupStatus();
        if (isMounted) {
          setSetupStatus(response.data);
          setIsSetupLoading(false);
        }
      } catch (error) {
        console.error('Failed to load setup status:', error);
        if (!isMounted) {
          return;
        }

        if (isNetworkConnectionError(error)) {
          setIsApiConnectionLost(true);
          retryTimer = window.setTimeout(loadSetupStatus, 3500);
          return;
        }

        setIsSetupLoading(false);
        setSetupStatus({
          setupRequired: false,
          setupCompleted: false,
          accountCount: 0,
          database: { connected: false, initialized: false },
          error: 'Failed to load setup status.',
        });
      }
    };

    void loadSetupStatus();

    return () => {
      isMounted = false;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, []);

  const loadNotificationSounds = useCallback(() => {
    notificationSoundService.getAll()
      .then((response) => setNotificationSounds(response.data.sounds))
      .catch((error) => console.error('Failed to load notification sounds:', error));
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setNotificationSounds([]);
      return undefined;
    }

    loadNotificationSounds();
    window.addEventListener('shield:notification-sounds-updated', loadNotificationSounds);
    return () => window.removeEventListener('shield:notification-sounds-updated', loadNotificationSounds);
  }, [currentUser, loadNotificationSounds]);

  const getCustomNotificationSoundUrl = useCallback((sound: string) => {
    const customSoundId = getCustomSoundId(sound);
    return customSoundId ? notificationSounds.find((item) => item.id === customSoundId)?.url : undefined;
  }, [notificationSounds]);

  useEffect(() => {
    document.title = `${appName} - ${siteName}`;
  }, [appName, siteName]);

  useEffect(() => {
    const handleSetupSettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<SetupStatus>>).detail;
      setSetupStatus((currentStatus) => currentStatus ? { ...currentStatus, ...detail } : currentStatus);
    };

    window.addEventListener('shield:setup-settings-updated', handleSetupSettingsUpdated as EventListener);
    return () => window.removeEventListener('shield:setup-settings-updated', handleSetupSettingsUpdated as EventListener);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-primary', activeSeasonalThemeOption.primary || primaryColor);
    document.documentElement.style.setProperty('--app-secondary', activeSeasonalThemeOption.secondary || secondaryColor);
  }, [activeSeasonalThemeOption.primary, activeSeasonalThemeOption.secondary, primaryColor, secondaryColor]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.presenceHidden) {
      if (awayPresenceTimerRef.current) {
        window.clearTimeout(awayPresenceTimerRef.current);
        awayPresenceTimerRef.current = null;
      }
      awayPresenceStateRef.current = 'active';
      if (hasShieldDesktopFeature('setPresenceStatus')) {
        window.shieldDesktop?.setPresenceStatus?.('active').catch((error) => {
          console.error('Failed to update desktop presence status:', error);
        });
      }
      return undefined;
    }

    const setPresenceStatus = (status: 'active' | 'away' | 'busy', force = false) => {
      if (!force && awayPresenceStateRef.current === status) {
        return;
      }

      awayPresenceStateRef.current = status;
      if (hasShieldDesktopFeature('setPresenceStatus')) {
        window.shieldDesktop?.setPresenceStatus?.(status).catch((error) => {
          console.error('Failed to update desktop presence status:', error);
        });
      }
      const now = Date.now();
      const minimumInterval = status === 'active' ? 45 * 1000 : 10 * 1000;
      if (!force && now - lastPresencePostRef.current[status] < minimumInterval) {
        return;
      }
      lastPresencePostRef.current[status] = now;
      const requestId = awayPresenceRequestRef.current + 1;
      awayPresenceRequestRef.current = requestId;
      messageService.updatePresence(status).catch((error) => {
        if (awayPresenceRequestRef.current === requestId) {
          console.error('Failed to update presence status:', error);
        }
      });
    };

    const scheduleAway = () => {
      if (awayPresenceTimerRef.current) {
        window.clearTimeout(awayPresenceTimerRef.current);
      }

      awayPresenceTimerRef.current = window.setTimeout(() => {
        setPresenceStatus('away');
      }, AWAY_PRESENCE_IDLE_MS);
    };

    const markBusy = (forceOrEvent: boolean | Event = false) => {
      if (awayPresenceTimerRef.current) {
        window.clearTimeout(awayPresenceTimerRef.current);
        awayPresenceTimerRef.current = null;
      }
      setPresenceStatus('busy', forceOrEvent === true);
    };

    const markAway = () => {
      if (awayPresenceTimerRef.current) {
        window.clearTimeout(awayPresenceTimerRef.current);
        awayPresenceTimerRef.current = null;
      }
      setPresenceStatus('away');
    };

    const markActive = (forceOrEvent: boolean | Event = false) => {
      setPresenceStatus('active', forceOrEvent === true);
      scheduleAway();
    };

    const handleVisibilityChange = () => {
      if (document.hidden || isAppBackgrounded) {
        markAway();
        return;
      }

      markActive(true);
    };

    const removeDesktopIdleStatusListener = hasShieldDesktopFeature('onIdleStatus')
      ? window.shieldDesktop?.onIdleStatus?.((payload) => {
        if (payload.status === 'away') {
          markAway();
          return;
        }

        if (payload.status === 'busy') {
          markBusy();
          return;
        }

        markActive(true);
      })
      : undefined;

    if (isAppBackgrounded) {
      markAway();
    } else {
      markActive(true);
    }

    const activeHeartbeat = window.setInterval(() => {
      if (!isAppBackgrounded && awayPresenceStateRef.current === 'active') {
        messageService.updatePresence('active').catch((error) => {
          console.error('Failed to refresh active presence:', error);
        });
      }
    }, 60 * 1000);
    window.addEventListener('keydown', markActive);
    window.addEventListener('pointerdown', markActive);
    window.addEventListener('mousemove', markActive);
    window.addEventListener('scroll', markActive, true);
    window.addEventListener('touchstart', markActive);
    window.addEventListener('focus', markActive);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (awayPresenceTimerRef.current) {
        window.clearTimeout(awayPresenceTimerRef.current);
        awayPresenceTimerRef.current = null;
      }
      window.clearInterval(activeHeartbeat);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('mousemove', markActive);
      window.removeEventListener('scroll', markActive, true);
      window.removeEventListener('touchstart', markActive);
      window.removeEventListener('focus', markActive);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      removeDesktopIdleStatusListener?.();
    };
  }, [currentUser, isAppBackgrounded, isAuthenticated]);

  useEffect(() => {
    if (isSetupLoading || !setupStatus) {
      return;
    }

    const appPathname = getAppRelativePathname();

    if (setupStatus.setupRequired && appPathname !== '/install') {
      window.history.replaceState({}, document.title, withAppBase('/install'));
      return;
    }

    if (!setupStatus.setupRequired && !setupStatus.installed && appPathname === '/install') {
      window.history.replaceState({}, document.title, withAppBase('/'));
    }
  }, [isSetupLoading, setupStatus]);

  useEffect(() => {
    const dispatchReconnectRefresh = () => {
      [
        'audit-updated',
        'bug-updated',
        'calendar-updated',
        'dashboard-updated',
        'device-updated',
        'error-updated',
        'media-updated',
        'messages-updated',
        'mileage-updated',
        'notification-updated',
        'performance-evaluation-updated',
        'permission-updated',
        'quick-launch-updated',
        'reminder-updated',
        'urgent-alert-updated',
        'api-reconnected',
        'user-updated',
      ].forEach((eventName) => window.dispatchEvent(new CustomEvent(`shield:${eventName}`, { detail: { source: 'api-reconnect' } })));
    };
    const markConnectionLost = () => {
      apiConnectionWasLostRef.current = true;
      setIsApiConnectionLost(true);
    };
    const markConnectionRestored = () => {
      setLastApiConnectedAt(Date.now());
      setIsApiConnectionLost(false);
      if (apiConnectionWasLostRef.current) {
        apiConnectionWasLostRef.current = false;
        dispatchReconnectRefresh();
      }
    };
    const handleBrowserOffline = () => markConnectionLost();
    const handleBrowserOnline = async () => {
      if (await checkApiHealth()) {
        markConnectionRestored();
      }
    };
    const handleOnline = () => {
      void handleBrowserOnline();
    };

    window.addEventListener('shield:api-connection-lost', markConnectionLost);
    window.addEventListener('shield:api-connection-restored', markConnectionRestored);
    window.addEventListener('offline', handleBrowserOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('shield:api-connection-lost', markConnectionLost);
      window.removeEventListener('shield:api-connection-restored', markConnectionRestored);
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!isApiConnectionLost) {
      return undefined;
    }

    let isCancelled = false;
    const controller = new AbortController();
    const checkConnection = async () => {
      const isHealthy = await checkApiHealth(controller.signal);
      if (!isCancelled && isHealthy) {
        window.dispatchEvent(new CustomEvent('shield:api-connection-restored'));
      }
    };

    void checkConnection();
    const intervalId = window.setInterval(() => {
      void checkConnection();
    }, isAppBackgrounded ? 15000 : 3500);

    return () => {
      isCancelled = true;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [isApiConnectionLost, isAppBackgrounded]);

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
    initialLoadingRef.current = isSetupLoading || isSessionLoading;
  }, [isSessionLoading, isSetupLoading]);

  useEffect(() => {
    if (!hasShieldDesktopFeature('getDesktopPreferences')) {
      setDesktopPreferences(null);
      return;
    }

    window.shieldDesktop?.getDesktopPreferences?.()
      .then((preferences) => {
        setDesktopPreferences(preferences);
        if (preferences.updateStatus) {
          setDesktopUpdateStatus(preferences.updateStatus);
        }
        setIsDesktopStartupUpdateBlocking(Boolean(preferences.startupUpdateInProgress));
      })
      .catch((error) => console.error('Failed to load desktop preferences:', error));
  }, []);

  useEffect(() => {
    if (!hasShieldDesktopFeature('onUpdateStatus')) {
      return;
    }

    return window.shieldDesktop?.onUpdateStatus?.((status) => {
      setDesktopUpdateStatus(status);

      if (['checking', 'available', 'downloading', 'downloaded', 'restarting'].includes(status.type)) {
        setIsDesktopStartupUpdateBlocking((isBlocking) => isBlocking || initialLoadingRef.current);
      }

      if (status.type === 'not-available' || status.type === 'error') {
        setIsDesktopStartupUpdateBlocking(false);
      }

      if (status.type === 'available') {
        setDesktopPreferences((preferences) => preferences ? { ...preferences, updateDownloaded: false } : preferences);
        setIsDesktopUpdatePromptOpen(true);
        showToast('info', status.version ? `${appName} desktop update ${status.version} is downloading.` : `A ${appName} desktop update is downloading.`, { saveToNotifications: false });
        desktopUpdateCheckIsManualRef.current = false;
      }

      if (status.type === 'downloaded') {
        setDesktopPreferences((preferences) => preferences ? { ...preferences, updateDownloaded: true } : preferences);
        setIsDesktopUpdatePromptOpen(true);
        showToast('success', `${appName} desktop update downloaded. ${appName} will restart automatically.`, { saveToNotifications: false });
        desktopUpdateCheckIsManualRef.current = false;
      }

      if (status.type === 'restarting') {
        setIsDesktopStartupUpdateBlocking(true);
        setIsDesktopUpdatePromptOpen(true);
        showToast('info', `Restarting ${appName} to install the desktop update...`, { saveToNotifications: false });
      }

      if (status.type === 'not-available') {
        if (desktopUpdateCheckIsManualRef.current) {
          showToast('success', `${appName} desktop is up to date.`, { saveToNotifications: false });
        }
      }

      if (status.type === 'error') {
        console.error('Desktop update error:', status.message);
        if (desktopUpdateCheckIsManualRef.current) {
          showToast('error', `Failed to check for ${appName} desktop updates.`, { saveToNotifications: false });
        }
      }

      if (status.type === 'not-available' || status.type === 'error') {
        desktopUpdateCheckIsManualRef.current = false;
      }
    });
  }, []);

  useEffect(() => {
    if (!hasShieldDesktopFeature('onWebAppUpdateStatus')) {
      return;
    }

    return window.shieldDesktop?.onWebAppUpdateStatus?.((status) => {
      if (status.type === 'reloading') {
        showToast('info', `${appName} web updates were found. Refreshing desktop view...`, { saveToNotifications: false });
      }
    });
  }, []);

  useEffect(() => {
    if (!hasShieldDesktopFeature('checkWebAppUpdate')) {
      return undefined;
    }

    let lastCheckAt = 0;
    const requestWebUpdateCheck = () => {
      const now = Date.now();
      if (now - lastCheckAt < 2500) {
        return;
      }
      lastCheckAt = now;
      window.shieldDesktop?.checkWebAppUpdate?.().catch((error) => {
        console.error('Failed to check for web app updates:', error);
      });
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        requestWebUpdateCheck();
      }
    };

    window.addEventListener('focus', requestWebUpdateCheck);
    window.addEventListener('online', requestWebUpdateCheck);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    requestWebUpdateCheck();

    return () => {
      window.removeEventListener('focus', requestWebUpdateCheck);
      window.removeEventListener('online', requestWebUpdateCheck);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleStartWithWindowsChange = async (startWithWindows: boolean) => {
    if (!hasPermission('desktop:start-with-windows')) {
      showToast('error', 'You do not have permission to change startup behavior.', { saveToNotifications: false });
      return;
    }

    if (!hasShieldDesktopFeature('setStartWithWindows')) {
      return;
    }

    try {
      const preferences = await window.shieldDesktop?.setStartWithWindows?.(startWithWindows);
      if (preferences) {
        setDesktopPreferences(preferences);
      }
      showToast('success', startWithWindows ? `${appName} will start with Windows.` : `${appName} will not start with Windows.`, { saveToNotifications: false });
    } catch (error) {
      console.error('Failed to update startup preference:', error);
      showToast('error', 'Failed to update startup preference.', { saveToNotifications: false });
    }
  };

  const handleTrayModeChange = async (trayMode: boolean) => {
    if (!hasPermission('desktop:minimize-to-tray')) {
      showToast('error', 'You do not have permission to change tray behavior.', { saveToNotifications: false });
      return;
    }

    if (!hasShieldDesktopFeature('setTrayMode')) {
      return;
    }

    try {
      const preferences = await window.shieldDesktop?.setTrayMode?.(trayMode);
      if (preferences) {
        setDesktopPreferences(preferences);
      }
      showToast('success', trayMode ? `${appName} will minimize to the system tray.` : `${appName} will close normally.`, { saveToNotifications: false });
    } catch (error) {
      console.error('Failed to update tray preference:', error);
      showToast('error', 'Failed to update tray preference.', { saveToNotifications: false });
    }
  };

  const handleInstallDesktopUpdate = async () => {
    if (!hasShieldDesktopFeature('installUpdate')) {
      return;
    }

    try {
      await window.shieldDesktop?.installUpdate?.();
    } catch (error) {
      console.error('Failed to restart and install update:', error);
      showToast('error', 'Failed to restart and install the desktop update.', { saveToNotifications: false });
    }
  };

  const handleThemeChange = (nextTheme: AppTheme) => {
    setTheme(nextTheme);
  };

  const handleGlassThemeChange = (nextGlassTheme: boolean) => {
    setIsGlassTheme(nextGlassTheme);
  };

  const handleOpenDesktopDiagnostics = async () => {
    if (!hasShieldDesktopFeature('openDesktopLogs')) {
      showToast('info', `Install the latest ${appName} desktop app to access diagnostics logs.`, { saveToNotifications: false });
      return;
    }

    try {
      const openResult = await window.shieldDesktop?.openDesktopLogs?.();
      if (!openResult || !openResult.ok) {
        showToast('error', openResult?.message || 'Unable to open desktop diagnostics log.', { saveToNotifications: false });
        return;
      }

      const logs = await window.shieldDesktop?.getDesktopLogs?.();
      if (!logs) {
        showToast('success', 'Desktop diagnostics log opened.', { saveToNotifications: false });
        return;
      }

      showToast('success', `Diagnostics log opened: ${logs.entries.length} recent entries saved in ${logs.path}.`, { saveToNotifications: false });
    } catch (error) {
      console.error('Failed to open desktop diagnostics log:', error);
      showToast('error', 'Failed to open desktop diagnostics log.', { saveToNotifications: false });
    }
  };

  const handleCheckForDesktopUpdates = async () => {
    if (!hasShieldDesktopFeature('checkForUpdates')) {
      showToast('info', `Install the latest ${appName} desktop app to use in-app update checks.`, { saveToNotifications: false });
      return;
    }

    try {
      desktopUpdateCheckIsManualRef.current = true;
      const result = await window.shieldDesktop?.checkForUpdates?.();
      if (result && !result.ok) {
        desktopUpdateCheckIsManualRef.current = false;
        showToast('error', result.message || 'Desktop update check is not available.', { saveToNotifications: false });
        return;
      }
      showToast('info', `Checking for ${appName} desktop updates...`, { saveToNotifications: false });
    } catch (error) {
      desktopUpdateCheckIsManualRef.current = false;
      console.error('Failed to check for desktop updates:', error);
      showToast('error', 'Failed to check for desktop updates.', { saveToNotifications: false });
    }
  };

  useEffect(() => {
    if (!isAuthenticated || !currentUser || !hasShieldDesktopFeature('checkForUpdates')) {
      return;
    }

    if (desktopUpdateCheckedAccountRef.current === currentUser.id) {
      return;
    }

    desktopUpdateCheckedAccountRef.current = currentUser.id;
    desktopUpdateCheckIsManualRef.current = false;
    window.shieldDesktop?.checkForUpdates?.().catch((error) => {
      desktopUpdateCheckIsManualRef.current = false;
      console.error('Failed to run login desktop update check:', error);
    });
  }, [currentUser, isAuthenticated]);

  const copySidebarDaily = (dateKey: string) => {
    const entry = sidebarCalendarEntries.find((item) => getEntryDateKey(item) === dateKey);
    if (!entry) {
      showToast('error', 'There is no Trooper Daily content to copy for that date.', { saveToNotifications: false });
      return;
    }

    setCopiedSidebarDaily(createSidebarDailyPayload(entry, dateKey));
    showToast('success', `Copied daily for ${formatSidebarCalendarDate(dateKey)}.`, { saveToNotifications: false });
  };

  const pasteSidebarDaily = async (dateKey: string) => {
    if (!currentUser || !copiedSidebarDaily) {
      showToast('error', 'Copy a Trooper Daily before pasting.', { saveToNotifications: false });
      return;
    }

    await saveSidebarDailyPayload(dateKey, copiedSidebarDaily, 'Pasted daily');
  };

  const saveSidebarDailyPayload = async (dateKey: string, daily: CalendarEntryPayload, successLabel: string) => {
    if (!currentUser) {
      return;
    }

    const existingEntry = sidebarCalendarEntries.find((entry) => getEntryDateKey(entry) === dateKey);
    const payload = {
      ...daily,
      date: dateKey,
      submissionStatus: 'Draft' as const,
      details: { ...(daily.details || {}) },
      accountId: currentUser.id,
      actorId: currentUser.id,
      actorName: currentUser.displayName || currentUser.email,
    };

    try {
      const response = existingEntry
        ? await calendarService.update(existingEntry.id, payload)
        : await calendarService.create(payload);
      setSidebarCalendarEntries((currentEntries) => {
        const withoutExisting = currentEntries
          .filter((entry) => entry.id !== response.data.id)
          .filter((entry) => !(entry.id === existingEntry?.id && getEntryDateKey(entry) === dateKey));
        return [...withoutExisting, response.data];
      });
      window.dispatchEvent(new Event('shield:calendar-updated'));
      showToast('success', `${successLabel} to ${formatSidebarCalendarDate(dateKey)}.`, { saveToNotifications: false });
      openCalendarModal(dateKey);
    } catch (error) {
      console.error('Failed to paste daily:', error);
      showToast('error', getErrorMessage(error, 'Failed to save Trooper Daily.'), { saveToNotifications: false });
    }
  };

  const copyPreviousSidebarDaily = async (dateKey: string) => {
    const previousEntry = sidebarCalendarEntries
      .filter((entry) => getEntryDateKey(entry) < dateKey)
      .sort((firstEntry, secondEntry) => getEntryDateKey(secondEntry).localeCompare(getEntryDateKey(firstEntry)))[0];

    if (!previousEntry) {
      showToast('error', 'No previous Trooper Daily entry found to copy.', { saveToNotifications: false });
      return;
    }

    await saveSidebarDailyPayload(dateKey, createSidebarDailyPayload(previousEntry, dateKey), 'Copied previous daily');
  };

  const markSidebarDailyDayOff = async (dateKey: string) => {
    if (!currentUser) {
      return;
    }

    const existingEntry = sidebarCalendarEntries.find((entry) => getEntryDateKey(entry) === dateKey);
    const dayOffPayload: CalendarEntryPayload = {
      category: 'Trooper Daily',
      date: dateKey,
      dutyHours: '0',
      districtWorked: existingEntry?.districtWorked || currentUser.district || 'Indianapolis',
      specialStatus: 'Day Off',
      color: '#64748B',
      details: {
        ...(existingEntry?.details || {}),
        regularDaysOff: '1',
      },
      submissionStatus: 'Draft',
      ownerAccountId: existingEntry?.ownerAccountId,
    };

    await saveSidebarDailyPayload(dateKey, dayOffPayload, 'Marked day off');
  };

  const deleteSidebarDaily = async (dateKey: string) => {
    if (!currentUser) {
      return;
    }

    const existingEntry = sidebarCalendarEntries.find((entry) => getEntryDateKey(entry) === dateKey);
    if (!existingEntry) {
      showToast('error', 'There is no Trooper Daily report to delete for that date.', { saveToNotifications: false });
      return;
    }

    try {
      await calendarService.delete(existingEntry.id, {
        accountId: currentUser.id,
        actorId: currentUser.id,
        actorName: currentUser.displayName || currentUser.email,
      });
      setSidebarCalendarEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== existingEntry.id));
      window.dispatchEvent(new Event('shield:calendar-updated'));
      showToast('success', `Deleted daily for ${formatSidebarCalendarDate(dateKey)}.`, { saveToNotifications: false });
    } catch (error) {
      console.error('Failed to delete daily:', error);
      showToast('error', getErrorMessage(error, 'Failed to delete Trooper Daily.'), { saveToNotifications: false });
    }
  };

  const addSidebarReminder = (dateKey: string) => {
    if (!currentUser) {
      return;
    }

    setReminderModalDate(dateKey);
  };

  const clearScheduledReminder = useCallback((reminderId: string) => {
    const timeoutId = scheduledReminderTimeoutsRef.current.get(reminderId);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      scheduledReminderTimeoutsRef.current.delete(reminderId);
    }
  }, []);

  const clearScheduledReminders = useCallback(() => {
    scheduledReminderTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    scheduledReminderTimeoutsRef.current.clear();
  }, []);

  const playReminderAlarmSound = useCallback(() => {
    if (!messagePreferences.reminderAlarmSound) {
      return;
    }

    const customSoundUrl = getCustomNotificationSoundUrl(messagePreferences.reminderAlarmSound);
    if (customSoundUrl) {
      playCustomSoundEffect(customSoundUrl);
    }
  }, [getCustomNotificationSoundUrl, messagePreferences.reminderAlarmSound]);

  const showDueReminders = useCallback((reminders: Reminder[]) => {
    const dueReminders = reminders
      .filter((reminder) => !reminder.completedAt && !shownDueReminderIdsRef.current.has(reminder.id))
      .sort((firstReminder, secondReminder) => getReminderDueAt(firstReminder) - getReminderDueAt(secondReminder));

    if (dueReminders.length === 0) {
      return;
    }

    dueReminders.forEach((reminder) => {
      shownDueReminderIdsRef.current.add(reminder.id);
      clearScheduledReminder(reminder.id);
    });
    setDueReminderPopup((currentReminders) => {
      const currentIds = new Set(currentReminders.map((reminder) => reminder.id));
      return [...currentReminders, ...dueReminders.filter((reminder) => !currentIds.has(reminder.id))];
    });
    playReminderAlarmSound();
    if (messagePreferences.browserNotifications) {
      showSystemNotification(dueReminders.length === 1 ? `Reminder: ${dueReminders[0].title}` : `${dueReminders.length} reminders due`, {
        body: dueReminders.length === 1 ? formatReminderDueAt(dueReminders[0]) : `Open ${appName} to review your due reminders.`,
        tag: dueReminders.length === 1 ? `shield-reminder-${dueReminders[0].id}` : 'shield-reminders-due',
        appPath: '/',
      });
    }
    showToast('info', dueReminders.length === 1 ? `Reminder due: ${dueReminders[0].title}` : `${dueReminders.length} reminders due`, { saveToNotifications: false });
    window.dispatchEvent(new Event('shield:notification-updated'));
  }, [clearScheduledReminder, messagePreferences.browserNotifications, playReminderAlarmSound]);

  const scheduleReminder = useCallback((reminder: Reminder) => {
    clearScheduledReminder(reminder.id);

    if (reminder.completedAt) {
      return;
    }

    const dueAt = getReminderDueAt(reminder);
    const delay = dueAt - Date.now();
    if (delay <= 0) {
      showDueReminders([reminder]);
      return;
    }

    const timeoutId = window.setTimeout(() => showDueReminders([reminder]), Math.min(delay, 2147483647));
    scheduledReminderTimeoutsRef.current.set(reminder.id, timeoutId);
  }, [clearScheduledReminder, showDueReminders]);

  const saveSidebarReminder = async (reminder: { title: string; remindOn: string; remindAt: string; priority: Reminder['priority']; notes: string; recurrenceRule: Reminder['recurrenceRule'] }) => {
    if (!currentUser || !reminderModalDate) {
      return;
    }

    setIsReminderSaving(true);
    try {
      const response = await reminderService.create(reminder.title, reminder.remindOn, reminder.priority, reminder.notes, reminder.remindAt, reminder.recurrenceRule);
      shownDueReminderIdsRef.current.delete(response.data.id);
      setSidebarReminders((currentReminders) => [response.data, ...currentReminders.filter((item) => item.id !== response.data.id)]);
      scheduleReminder(response.data);
      window.dispatchEvent(new Event('shield:reminder-updated'));
      showToast('success', `Reminder added for ${formatSidebarCalendarDate(reminder.remindOn)}.`, { saveToNotifications: false });
      setReminderModalDate(null);
    } catch (error) {
      console.error('Failed to add reminder:', error);
      showToast('error', getErrorMessage(error, 'Failed to add reminder.'), { saveToNotifications: false });
    } finally {
      setIsReminderSaving(false);
    }
  };

  const checkDueReminders = useCallback(async () => {
    if (!currentUser || isAppLocked || isAppBackgrounded) {
      return;
    }

    try {
      const response = await reminderService.getAll();
      setSidebarReminders(response.data);
      const activeReminders = response.data.filter((reminder) => !reminder.completedAt);
      const activeReminderIds = new Set(activeReminders.map((reminder) => reminder.id));
      scheduledReminderTimeoutsRef.current.forEach((timeoutId, reminderId) => {
        if (!activeReminderIds.has(reminderId)) {
          window.clearTimeout(timeoutId);
          scheduledReminderTimeoutsRef.current.delete(reminderId);
        }
      });
      activeReminders.forEach(scheduleReminder);
      const now = Date.now();
      const dueReminders = activeReminders
        .filter((reminder) => getReminderDueAt(reminder) <= now)
        .sort((firstReminder, secondReminder) => getReminderDueAt(firstReminder) - getReminderDueAt(secondReminder));
      showDueReminders(dueReminders);
    } catch (error) {
      console.error('Failed to check due reminders:', error);
    }
  }, [currentUser, isAppBackgrounded, isAppLocked, scheduleReminder, showDueReminders]);

  useEffect(() => {
    if (!currentUser) {
      setDueReminderPopup([]);
      setSidebarReminders([]);
      clearScheduledReminders();
      return undefined;
    }

    if (!isAppBackgrounded) {
      void checkDueReminders();
    }
    const handleReminderUpdate = () => {
      if (!isAppBackgrounded) {
        void checkDueReminders();
      }
    };
    window.addEventListener('shield:reminder-updated', handleReminderUpdate);
    const intervalId = isAppBackgrounded
      ? null
      : window.setInterval(() => {
        void checkDueReminders();
      }, 30 * 1000);

    return () => {
      window.removeEventListener('shield:reminder-updated', handleReminderUpdate);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [checkDueReminders, currentUser, isAppBackgrounded]);

  useEffect(() => {
    if (!currentUser || !isAppLocked) {
      return;
    }

    setDueReminderPopup([]);
  }, [currentUser, isAppLocked]);

  const completeDueReminder = async (reminder: Reminder) => {
    setIsCompletingDueReminder(true);
    try {
      const response = await reminderService.update(reminder.id, { completed: true });
      clearScheduledReminder(reminder.id);
      shownDueReminderIdsRef.current.delete(reminder.id);
      setSidebarReminders((currentReminders) => [response.data, ...currentReminders.filter((item) => item.id !== response.data.id)]);
      setDueReminderPopup((currentReminders) => currentReminders.filter((item) => item.id !== reminder.id));
      if (!response.data.completedAt) {
        scheduleReminder(response.data);
      }
      window.dispatchEvent(new Event('shield:reminder-updated'));
      showToast('success', response.data.recurrenceRule === 'none' ? 'Reminder completed.' : 'Reminder advanced to the next repeat.', { saveToNotifications: false });
    } catch (error) {
      console.error('Failed to complete reminder:', error);
      showToast('error', getErrorMessage(error, 'Failed to complete reminder.'), { saveToNotifications: false });
    } finally {
      setIsCompletingDueReminder(false);
    }
  };

  const snoozeDueReminder = async (reminder: Reminder, minutes: number) => {
    const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);
    const remindOn = getLocalDateKey(snoozeUntil);
    const remindTime = `${String(snoozeUntil.getHours()).padStart(2, '0')}:${String(snoozeUntil.getMinutes()).padStart(2, '0')}`;

    setIsCompletingDueReminder(true);
    try {
      const response = await reminderService.update(reminder.id, {
        remindOn,
        remindAt: `${remindOn}T${remindTime}`,
      });
      shownDueReminderIdsRef.current.delete(reminder.id);
      setSidebarReminders((currentReminders) => [response.data, ...currentReminders.filter((item) => item.id !== response.data.id)]);
      setDueReminderPopup((currentReminders) => currentReminders.filter((item) => item.id !== reminder.id));
      scheduleReminder(response.data);
      window.dispatchEvent(new Event('shield:reminder-updated'));
      showToast('success', `Reminder snoozed for ${minutes} minute${minutes === 1 ? '' : 's'}.`, { saveToNotifications: false });
    } catch (error) {
      console.error('Failed to snooze reminder:', error);
      showToast('error', getErrorMessage(error, 'Failed to snooze reminder.'), { saveToNotifications: false });
    } finally {
      setIsCompletingDueReminder(false);
    }
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

  const notifySessionTimeoutSignOut = () => {
    if (sessionTimeoutNotificationShownRef.current) {
      return;
    }

    sessionTimeoutNotificationShownRef.current = true;
    showDesktopNotification(`${appName} signed you out`, {
      body: 'You were automatically signed out after inactivity. Open the app to sign back in.',
      appPath: '/',
    });
  };

  const startInactivityTimer = () => {
    clearInactivityTimer();

    if (!sessionTimeoutMinutes || sessionTimeoutMinutes <= 0) return;

    const ms = sessionTimeoutMinutes * 60 * 1000;
    inactivityTimerRef.current = window.setTimeout(() => {
      notifySessionTimeoutSignOut();
      handleLogout();
    }, ms);
  };

  const resetInactivityTimer = () => {
    lastActivityRef.current = Date.now();
    if (hasShieldDesktopFeature('reportSessionActivity')) {
      const now = Date.now();
      if (now - desktopSessionActivityReportRef.current > 5000) {
        desktopSessionActivityReportRef.current = now;
        window.shieldDesktop?.reportSessionActivity?.().catch((error) => {
          console.error('Failed to report desktop session activity:', error);
        });
      }
    }
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
    const storedGlassTheme = window.localStorage.getItem(GLASS_THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (storedTheme === 'glass') {
      setTheme('dark');
      setIsGlassTheme(true);
      window.localStorage.setItem(THEME_KEY, 'dark');
      window.localStorage.setItem(GLASS_THEME_KEY, 'true');
      return;
    }

    if (storedTheme === 'dark' || storedTheme === 'light') {
      setTheme(storedTheme);
      setIsGlassTheme(storedGlassTheme === 'true');
      return;
    }

    setTheme(prefersDark ? 'dark' : 'light');
    setIsGlassTheme(storedGlassTheme === 'true');
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
    document.documentElement.classList.toggle('glass', isGlassTheme);
    window.localStorage.setItem(THEME_KEY, theme);
    window.localStorage.setItem(GLASS_THEME_KEY, String(isGlassTheme));
  }, [isGlassTheme, theme]);

  useEffect(() => {
    document.documentElement.classList.remove(...SEASONAL_THEME_CLASSES);
    if (activeSeasonalTheme !== 'default') {
      document.documentElement.classList.add(`seasonal-theme-${activeSeasonalTheme}`);
    }
    window.localStorage.setItem(SEASONAL_THEME_KEY, seasonalTheme);
  }, [activeSeasonalTheme, seasonalTheme]);

  useEffect(() => {
    const appScale = normalizeAppScale(currentUser?.appScale);
    document.documentElement.classList.remove('app-scale-compact', 'app-scale-comfortable', 'app-scale-large');
    document.documentElement.classList.add(`app-scale-${appScale}`);
  }, [currentUser?.appScale]);

  useEffect(() => () => {
    if (appScaleTransitionTimerRef.current) {
      window.clearTimeout(appScaleTransitionTimerRef.current);
    }
    document.documentElement.classList.remove('app-scale-transitioning');
  }, []);

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

  const syncSetupStatus = useCallback(async () => {
    try {
      const response = await authService.getSetupStatus();
      setSetupStatus(response.data);
    } catch (err) {
      console.error('Failed to sync setup status:', err);
    }
  }, []);

  const applyThemeSettings = useCallback((settings: Partial<ThemeSettings>) => {
    setSeasonalTheme(normalizeSeasonalTheme(settings.seasonalTheme));
  }, []);

  const syncThemeSettings = useCallback(async () => {
    try {
      const response = await authService.getThemeSettings();
      applyThemeSettings(response.data);
    } catch (err) {
      console.error('Failed to sync theme settings:', err);
    }
  }, [applyThemeSettings]);

  useEffect(() => {
    void syncThemeSettings();
  }, [syncThemeSettings]);

  useEffect(() => {
    const handleThemeSettingsUpdated = (event: Event) => {
      applyThemeSettings((event as CustomEvent<Partial<ThemeSettings>>).detail || {});
    };

    window.addEventListener('shield:theme-settings-updated', handleThemeSettingsUpdated as EventListener);
    return () => window.removeEventListener('shield:theme-settings-updated', handleThemeSettingsUpdated as EventListener);
  }, [applyThemeSettings]);

  useEffect(() => {
    if (isSetupLoading) {
      return undefined;
    }

    let isMounted = true;
    authService.getSession()
      .then((response) => {
        if (response.data.account) {
          setCurrentUser(response.data.account);
          setIsAuthenticated(true);
          clearAuthToken();
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
      .catch((error) => {
        if (isNetworkConnectionError(error)) {
          try {
            const cachedSession = window.localStorage.getItem(SESSION_KEY);
            if (cachedSession) {
              const cachedAccount = JSON.parse(cachedSession) as AuthAccount;
              setCurrentUser(cachedAccount);
              setIsAuthenticated(true);
            }
          } catch {
            window.localStorage.removeItem(SESSION_KEY);
          }
          return;
        }

        clearAuthToken();
        window.localStorage.removeItem(SESSION_KEY);
      })
      .finally(() => {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isSetupLoading, syncSessionTimeoutFromSettings]);

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
    if (!isAccountMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!currentUser || isAppBackgrounded) {
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
    if (isAppBackgrounded) {
      return;
    }

    void loadUserNotifications();
  }, [isAppBackgrounded, loadUserNotifications]);

  const playUrgentAlertSound = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1.25);
      gain.connect(audioContext.destination);

      [740, 988, 740].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + index * 0.24);
        oscillator.connect(gain);
        oscillator.start(audioContext.currentTime + index * 0.24);
        oscillator.stop(audioContext.currentTime + index * 0.24 + 0.16);
      });

      window.setTimeout(() => void audioContext.close().catch(() => undefined), 1500);
    } catch (error) {
      console.error('Failed to play urgent alert sound:', error);
    }
  }, []);

  const loadUrgentAlerts = useCallback(async (playSoundForNew = false) => {
    if (!currentUser) {
      setUrgentAlerts([]);
      lastUrgentAlertIdsRef.current = new Set();
      return;
    }

    try {
      const response = await urgentAlertService.getPending();
      const nextAlerts = response.data;
      const nextIds = new Set(nextAlerts.map((alert) => alert.id));
      const hasNewAlert = nextAlerts.some((alert) => !lastUrgentAlertIdsRef.current.has(alert.id));
      setUrgentAlerts(nextAlerts);
      if (playSoundForNew && hasNewAlert && nextAlerts.length > 0) {
        playUrgentAlertSound();
      }
      lastUrgentAlertIdsRef.current = nextIds;
    } catch (error) {
      console.error('Failed to load urgent alerts:', error);
    }
  }, [currentUser, playUrgentAlertSound]);

  useEffect(() => {
    if (isAppBackgrounded) {
      return;
    }

    void loadUrgentAlerts(true);
  }, [isAppBackgrounded, loadUrgentAlerts]);

  const acknowledgeUrgentAlert = async (alert: UrgentAlert) => {
    setAcknowledgingUrgentAlertId(alert.id);
    try {
      await urgentAlertService.acknowledge(alert.id);
      setUrgentAlerts((alerts) => alerts.filter((item) => item.id !== alert.id));
      lastUrgentAlertIdsRef.current.delete(alert.id);
    } catch (error) {
      showToast('error', getErrorMessage(error, 'Failed to acknowledge alert.'));
    } finally {
      setAcknowledgingUrgentAlertId(null);
    }
  };

  const loadSidebarCalendarEntries = useCallback(async () => {
    if (!currentUser) {
      setSidebarCalendarEntries([]);
      return;
    }

    if (isAppBackgrounded) {
      return;
    }

    try {
      const response = await calendarService.getAll(currentUser.id);
      setSidebarCalendarEntries(response.data);
    } catch (err) {
      console.error('Failed to load sidebar calendar entries:', err);
    }
  }, [currentUser, isAppBackgrounded]);

  useEffect(() => {
    if (!isAppBackgrounded) {
      void loadSidebarCalendarEntries();
    }

    const handleCalendarUpdate = () => {
      if (isAppBackgrounded) {
        return;
      }

      if (sidebarCalendarRefreshTimerRef.current) {
        window.clearTimeout(sidebarCalendarRefreshTimerRef.current);
      }

      sidebarCalendarRefreshTimerRef.current = window.setTimeout(() => {
        sidebarCalendarRefreshTimerRef.current = null;
        void loadSidebarCalendarEntries();
      }, 350);
    };

    window.addEventListener('shield:calendar-updated', handleCalendarUpdate);
    return () => {
      window.removeEventListener('shield:calendar-updated', handleCalendarUpdate);
      if (sidebarCalendarRefreshTimerRef.current) {
        window.clearTimeout(sidebarCalendarRefreshTimerRef.current);
        sidebarCalendarRefreshTimerRef.current = null;
      }
    };
  }, [isAppBackgrounded, loadSidebarCalendarEntries]);

  useEffect(() => {
    if (currentUser && !currentUser.hasCompletedOnboarding && !isWelcomeSplashOpen && shouldLaunchGuideAfterWelcome) {
      setIsFirstLoginGuideOpen(true);
    }
  }, [currentUser?.id, currentUser?.hasCompletedOnboarding, isWelcomeSplashOpen, shouldLaunchGuideAfterWelcome]);

  const playMessagePing = () => {
    if (!messagePreferences.receiveMessages || !messagePreferences.playMessageSound) {
      return;
    }

    const customSoundUrl = getCustomNotificationSoundUrl(messagePreferences.messageSound);
    if (customSoundUrl) {
      playCustomSoundEffect(customSoundUrl);
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
        const response = await messageService.getUnreadCount(currentUser.id);
        if (!isMounted) return;

        const nextUnreadCount = response.data.unreadCount;
        if (previousMessageUnreadCount.current !== null && nextUnreadCount > previousMessageUnreadCount.current) {
          playMessagePing();
          if (messagePreferences.browserNotifications) {
            showSystemNotification('New message', {
              body: `Open ${appName} to view your message.`,
              tag: 'shield-new-message',
              appPath: '/messages',
            });
            if (hasShieldDesktopFeature('flashAttention')) {
              window.shieldDesktop?.flashAttention?.().catch((error) => console.error('Failed to flash desktop window:', error));
            }
          }
        }
        previousMessageUnreadCount.current = nextUnreadCount;
        setMessageUnreadCount(nextUnreadCount);
      } catch (err) {
        console.error('Failed to load unread messages:', err);
      }
    };

    const queueUnreadCountLoad = () => {
      if (messageUnreadRefreshTimerRef.current) {
        window.clearTimeout(messageUnreadRefreshTimerRef.current);
      }

      messageUnreadRefreshTimerRef.current = window.setTimeout(() => {
        messageUnreadRefreshTimerRef.current = null;
        void loadUnreadCount();
      }, isAppBackgroundedRef.current ? 1250 : 250);
    };

    loadUnreadCount();
    window.addEventListener('shield:messages-updated', queueUnreadCountLoad);
    const desktopUnreadFallbackInterval = isShieldDesktopApp()
      ? window.setInterval(() => void loadUnreadCount(), DESKTOP_UNREAD_FALLBACK_POLL_MS)
      : null;

    const handleRealtimeMessageUpdate = () => queueUnreadCountLoad();
    const unsubscribeRealtime = [
      subscribeMessageRealtime('message-created', handleRealtimeMessageUpdate),
      subscribeMessageRealtime('message-read', handleRealtimeMessageUpdate),
      subscribeMessageRealtime('message-archived', handleRealtimeMessageUpdate),
      subscribeMessageRealtime('message-deleted', handleRealtimeMessageUpdate),
      subscribeMessageRealtime('error', (event) => {
        console.error('Message realtime connection error:', event);
      }),
    ];

    return () => {
      isMounted = false;
      window.removeEventListener('shield:messages-updated', queueUnreadCountLoad);
      if (messageUnreadRefreshTimerRef.current) {
        window.clearTimeout(messageUnreadRefreshTimerRef.current);
        messageUnreadRefreshTimerRef.current = null;
      }
      if (desktopUnreadFallbackInterval) {
        window.clearInterval(desktopUnreadFallbackInterval);
      }
      unsubscribeRealtime.forEach((unsubscribe) => unsubscribe());
    };
  }, [appName, currentUser, getCustomNotificationSoundUrl, messagePreferences.receiveMessages, messagePreferences.playMessageSound, messagePreferences.messageSound, messagePreferences.browserNotifications]);

  useEffect(() => {
    if (!hasShieldDesktopFeature('onNotificationClick')) {
      return;
    }

    return window.shieldDesktop?.onNotificationClick?.((payload) => {
      if (payload.appPath) {
        window.location.assign(withAppBase(payload.appPath));
      }
    });
  }, []);

  const handleLogin = (account: AuthAccount) => {
    clearAuthToken();
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    sessionTimeoutNotificationShownRef.current = false;
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
    }, LOGIN_TRANSITION_MS);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch {
      // Local sign out should still complete if the server is unreachable.
    }
    closeRealtimeConnections();
    clearLoginTransitionTimer();
    clearAuthToken();
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setIsAuthenticated(false);
    setIsLoginTransitioning(false);
    setIsWelcomeSplashOpen(false);
    setShouldLaunchGuideAfterWelcome(false);
    setIsFirstLoginGuideOpen(false);
    setIsAppLocked(false);
    setReminderModalDate(null);
    setIsReminderSaving(false);
    setDueReminderPopup([]);
    shownDueReminderIdsRef.current = new Set();
    clearScheduledReminders();
    setNotifications([]);
    setUserNotifications([]);
    notificationRequestRef.current += 1;
    setMessageUnreadCount(0);
    previousMessageUnreadCount.current = null;
    clearInactivityTimer();
    if (hasShieldDesktopFeature('setSessionTimeout')) {
      window.shieldDesktop?.setSessionTimeout?.({ authenticated: false, minutes: 0 }).catch((error) => {
        console.error('Failed to clear desktop session timeout:', error);
      });
    }
  };

  useEffect(() => {
    handleLogoutRef.current = handleLogout;
  });

  useEffect(() => {
    if (!hasShieldDesktopFeature('onBeforeQuit')) {
      return undefined;
    }

    return window.shieldDesktop?.onBeforeQuit?.(() => {
      if (desktopQuitSignOutStartedRef.current) {
        return;
      }

      desktopQuitSignOutStartedRef.current = true;
      void (async () => {
        try {
          await handleLogoutRef.current();
        } finally {
          await window.shieldDesktop?.notifyQuitSignOutComplete?.().catch((error) => {
            console.error('Failed to notify desktop quit sign-out completion:', error);
          });
        }
      })();
    });
  }, []);

  useEffect(() => {
    if (!hasShieldDesktopFeature('setSessionTimeout')) {
      return;
    }

    window.shieldDesktop?.setSessionTimeout?.({
      authenticated: isAuthenticated && Boolean(currentUser),
      minutes: sessionTimeoutMinutes,
    }).catch((error) => {
      console.error('Failed to update desktop session timeout:', error);
    });
  }, [currentUser, isAuthenticated, sessionTimeoutMinutes]);

  useEffect(() => {
    if (!hasShieldDesktopFeature('onSessionTimeout')) {
      return undefined;
    }

    return window.shieldDesktop?.onSessionTimeout?.(() => {
      notifySessionTimeoutSignOut();
      showToast('info', 'Signed out after inactivity.', { saveToNotifications: false });
      void handleLogout();
    });
  }, []);

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
    setIsAppLocked(false);
    setReminderModalDate(null);
    setIsReminderSaving(false);
    setDueReminderPopup([]);
    shownDueReminderIdsRef.current = new Set();
    clearScheduledReminders();
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
    window.history.pushState({}, document.title, withAppBase('/'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.setTimeout(() => setIsFirstLoginGuideOpen(true), MODAL_CLOSE_MS + 40);
  };

  const handleAccountUpdate = (account: AuthAccount) => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setCurrentUser(account);
  };

  const lockApp = () => {
    if (!currentUser || isAppLocked) {
      return;
    }

    setIsCommandPaletteOpen(false);
    setIsNotificationsOpen(false);
    setIsAccountMenuOpen(false);
    setReminderModalDate(null);
    setIsAppLocked(true);
  };

  const unlockApp = (account: AuthAccount) => {
    handleAccountUpdate(account);
    setIsAuthenticated(true);
    setIsAppLocked(false);
    resetInactivityTimer();
  };

  const isAdministrator = currentUser?.role === 'administrator';
  function hasPermission(permission: string) {
    return Boolean(isAdministrator || currentUser?.permissions?.includes(permission));
  }

  const showCalendar = Boolean(currentUser);
  const canOpenAdminConsole = Boolean(currentUser && (
    isAdministrator ||
    hasPermission('admin:access')
  ));
  const getDefaultAdminConsoleTab = (): AdminConsoleTab => {
    if (hasPermission('admin:general') && hasPermission('roles:manage')) return 'general';
    if (hasPermission('admin:permissions') && hasPermission('roles:manage')) return 'permissions';
    if (hasPermission('admin:achievements') && hasPermission('roles:manage')) return 'achievements';
    if (hasPermission('admin:create-user') && hasPermission('users:create')) return 'create-user';
    if (hasPermission('admin:media') && (hasPermission('media:view') || hasPermission('media:upload') || hasPermission('media:edit') || hasPermission('media:delete'))) return 'media';
    if (hasPermission('admin:alerts') && hasPermission('alerts:send')) return 'alerts';
    if (hasPermission('admin:general')) return 'sounds';
    if (hasPermission('admin:bugs') && hasPermission('bugs:manage')) return 'bugs';
    if (hasPermission('admin:audit') && hasPermission('audit:view')) return 'audit';
    if (hasPermission('admin:errors') && hasPermission('audit:view')) return 'errors';
    return 'general';
  };
  const openBugCount = bugReports.filter((report) => report.status === 'New' || report.status === 'Pending').length;
  const {
    unreadNotificationCount,
    unreadUserNotifications,
    recentNotificationCount,
    totalNotificationCount,
    hasNotificationCenterItems,
  } = useUnreadCounts({
    messageUnreadCount,
    userNotifications,
    recentNotifications: notifications,
    openBugCount,
    isAdministrator,
  });
  const shouldShowRecentConversations = Boolean(
    currentUser &&
    isAuthenticated &&
    !isAppLocked &&
    messagePreferences.receiveMessages &&
    !messagePreferences.hideRecentConversations &&
    !getAppRelativePathname().startsWith('/messages'),
  );
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
    if (!isAuthenticated || !currentUser || !hasShieldDesktopFeature('getCrashReports')) {
      return;
    }

    let isCancelled = false;

    const submitPendingCrashReports = async () => {
      try {
        const payload = await window.shieldDesktop?.getCrashReports?.();
        const reports = payload?.reports || [];
        if (reports.length === 0 || isCancelled) {
          return;
        }

        const submittedIds: string[] = [];
        for (const report of reports) {
          if (isCancelled || desktopCrashReportSubmittedRef.current.has(report.id)) {
            continue;
          }

          desktopCrashReportSubmittedRef.current.add(report.id);
          const description = [
            `Source: ${report.source}`,
            `Message: ${report.message}`,
            `Version: ${report.appVersion || 'Unknown'}`,
            `Platform: ${report.platform || 'Unknown'}`,
            `Captured: ${report.createdAt}`,
            report.stack ? `Stack:\n${report.stack}` : '',
            report.extra ? `Details:\n${JSON.stringify(report.extra, null, 2)}` : '',
          ].filter(Boolean).join('\n\n');

          await bugReportService.create({
            title: `Desktop crash: ${report.source}`,
            description,
            location: 'Electron desktop app',
            priority: report.source.includes('renderer') ? 'High' : 'Critical',
          });
          submittedIds.push(report.id);
        }

        if (submittedIds.length > 0 && !isCancelled) {
          await window.shieldDesktop?.clearCrashReports?.(submittedIds);
          window.dispatchEvent(new CustomEvent('shield:bug-updated'));
          if (isAdministrator) {
            void loadBugReports();
          }
          showToast('info', `${submittedIds.length} desktop crash report${submittedIds.length === 1 ? '' : 's'} sent to Bug Tracker.`, { saveToNotifications: false });
        }
      } catch (error) {
        console.error('Failed to submit desktop crash reports:', error);
      }
    };

    void submitPendingCrashReports();

    return () => {
      isCancelled = true;
    };
  }, [currentUser, isAdministrator, isAuthenticated, loadBugReports]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const dispatchAppUpdate = (name: string, detail?: Record<string, unknown>) => {
      window.dispatchEvent(new CustomEvent(`shield:${name}`, { detail }));
    };
    const handleNotificationUpdate = () => {
      void loadUserNotifications();
      dispatchAppUpdate('notification-updated');
    };
    const handleUrgentAlertUpdate = () => {
      void loadUrgentAlerts(true);
      dispatchAppUpdate('urgent-alert-updated');
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

    const handleRealtimeAppUpdate = (name: string) => (event: Event) => {
      try {
        dispatchAppUpdate(name, JSON.parse((event as MessageEvent).data || '{}') as Record<string, unknown>);
      } catch {
        dispatchAppUpdate(name);
      }
    };

    const auditUpdatedHandler = handleRealtimeAppUpdate('audit-updated');
    const calendarUpdatedHandler = handleRealtimeAppUpdate('calendar-updated');
    const dashboardUpdatedHandler = handleRealtimeAppUpdate('dashboard-updated');
    const deviceUpdatedHandler = handleRealtimeAppUpdate('device-updated');
    const errorUpdatedHandler = handleRealtimeAppUpdate('error-updated');
    const mediaUpdatedHandler = handleRealtimeAppUpdate('media-updated');
    const mileageUpdatedHandler = handleRealtimeAppUpdate('mileage-updated');
    const performanceEvaluationUpdatedHandler = handleRealtimeAppUpdate('performance-evaluation-updated');
    const quickLaunchUpdatedHandler = handleRealtimeAppUpdate('quick-launch-updated');
    const reminderUpdatedHandler = handleRealtimeAppUpdate('reminder-updated');
    const settingsUpdatedHandler = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}') as Partial<ThemeSettings>;
        if (payload.seasonalTheme) {
          applyThemeSettings(payload);
        } else {
          void syncThemeSettings();
        }
      } catch {
        void syncThemeSettings();
      }
      void loadNotificationSounds();
      void syncSetupStatus();
      handleRealtimeAppUpdate('settings-updated')(event);
    };
    const permissionUpdatedHandler = (event: Event) => {
      void syncSessionTimeoutFromSettings();
      void syncCurrentAccount();
      handleRealtimeAppUpdate('permission-updated')(event);
    };
    const sessionRevokedHandler = () => handleForcedLogout('Your account has been deactivated. Please contact an administrator.');
    const userUpdatedHandler = (event: Event) => {
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
    };
    const openHandler = () => {
      window.dispatchEvent(new CustomEvent('shield:api-connection-restored'));
    };
    const errorHandler = async (event: Event) => {
      console.error('Application realtime connection error:', event);
      if (!(await checkApiHealth())) {
        window.dispatchEvent(new CustomEvent('shield:api-connection-lost'));
      }
    };

    const unsubscribeRealtime = [
      subscribeAppRealtime('notification-created', handleNotificationUpdate),
      subscribeAppRealtime('notification-updated', handleNotificationUpdate),
      subscribeAppRealtime('urgent-alert-created', handleUrgentAlertUpdate),
      subscribeAppRealtime('urgent-alert-updated', handleUrgentAlertUpdate),
      subscribeAppRealtime('audit-updated', auditUpdatedHandler),
      subscribeAppRealtime('bug-updated', handleBugUpdate),
      subscribeAppRealtime('calendar-updated', calendarUpdatedHandler),
      subscribeAppRealtime('dashboard-updated', dashboardUpdatedHandler),
      subscribeAppRealtime('device-updated', deviceUpdatedHandler),
      subscribeAppRealtime('error-updated', errorUpdatedHandler),
      subscribeAppRealtime('media-updated', mediaUpdatedHandler),
      subscribeAppRealtime('mileage-updated', mileageUpdatedHandler),
      subscribeAppRealtime('performance-evaluation-updated', performanceEvaluationUpdatedHandler),
      subscribeAppRealtime('settings-updated', settingsUpdatedHandler),
      subscribeAppRealtime('permission-updated', permissionUpdatedHandler),
      subscribeAppRealtime('quick-launch-updated', quickLaunchUpdatedHandler),
      subscribeAppRealtime('reminder-updated', reminderUpdatedHandler),
      subscribeAppRealtime('session-revoked', sessionRevokedHandler),
      subscribeAppRealtime('user-updated', userUpdatedHandler),
      subscribeAppRealtime('open', openHandler),
      subscribeAppRealtime('error', errorHandler),
    ];

    return () => {
      unsubscribeRealtime.forEach((unsubscribe) => unsubscribe());
    };
  }, [applyThemeSettings, currentUser, handleForcedLogout, loadBugReports, loadNotificationSounds, loadUrgentAlerts, loadUserNotifications, syncSessionTimeoutFromSettings, syncSetupStatus, syncThemeSettings]);

  const closeModal = (modal: ClosingModal) => {
    setClosingModal(modal);
    window.setTimeout(() => {
      if (modal === 'messages') setIsMessagesModalOpen(false);
      if (modal === 'calculator') setIsCalculatorOpen(false);
      if (modal === 'profile') setIsProfileModalOpen(false);
      if (modal === 'reportBug') setIsReportBugOpen(false);
      if (modal === 'bugTracker') setIsBugTrackerOpen(false);
      setClosingModal(null);
    }, MODAL_CLOSE_MS);
  };

  const openMessagesModal = () => {
    announceFloatingFocus('messages');
    setActiveFloatingApp('messages');
    setIsMessagesModalOpen(true);
  };

  useEffect(() => {
    const openMessageThread = (event: Event) => {
      const user = (event as CustomEvent<User>).detail;
      if (!user?.id) {
        return;
      }

      if (user.id === currentUser?.id) {
        showToast('error', 'You cannot message yourself.', { saveToNotifications: false });
        return;
      }

      void messageService.resolveRecipient(user.id)
        .then((response) => {
          setMessageTargetUser({
            ...user,
            email: response.data.account.email || user.email,
            firstName: response.data.account.firstName || user.firstName,
            lastName: response.data.account.lastName || user.lastName,
            profilePictureUrl: response.data.account.profilePictureUrl || user.profilePictureUrl,
            district: response.data.account.district || user.district,
            receivesMessages: response.data.account.receivesMessages,
          });
          setMessageTargetThreadId(null);
          openMessagesModal();
        })
        .catch((error) => {
          console.error('Failed to open message recipient:', error);
          errorLogService.createClientLog({
            level: 'error',
            message: 'Open message recipient failed',
            route: window.location.pathname,
            context: JSON.stringify({
              area: 'messages',
              action: 'open-recipient',
              currentUserId: currentUser?.id || null,
              targetUser: {
                id: user.id,
                email: user.email,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                receivesMessages: user.receivesMessages,
              },
              error: getErrorMessage(error, 'This user cannot receive messages.'),
            }, null, 2),
          }).catch((logError) => console.error('Failed to write message open diagnostic:', logError));
          showToast('error', getErrorMessage(error, 'This user cannot receive messages.'), { saveToNotifications: false });
        });
    };

    window.addEventListener('shield:open-message-thread', openMessageThread);

    return () => window.removeEventListener('shield:open-message-thread', openMessageThread);
  }, [currentUser?.id, isMessagesModalOpen, showToast]);

  const toggleMessagesModal = () => {
    if (isMessagesModalOpen) {
      closeModal('messages');
      return;
    }

    openMessagesModal();
  };

  const openCalendarModal = (targetDate?: unknown) => {
    if (!showCalendar) {
      return;
    }

    const requestedDate = typeof targetDate === 'string' ? targetDate : null;
    const dateQuery = requestedDate ? `?date=${encodeURIComponent(requestedDate)}` : '';
    const targetPath = `/calendar${dateQuery}`;
    if (`${getAppRelativePathname()}${window.location.search}` !== targetPath) {
      startTransition(() => {
        window.history.pushState({}, document.title, withAppBase(targetPath));
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    }
  };

  const toggleCalendarModal = () => {
    openCalendarModal();
  };

  const openCalculator = () => {
    announceFloatingFocus('calculator');
    setActiveFloatingApp('calculator');
    setIsCalculatorOpen(true);
  };

  const toggleCalculator = () => {
    if (isCalculatorOpen) {
      closeModal('calculator');
      return;
    }

    openCalculator();
  };

  const openProfileSettings = () => {
    announceFloatingFocus('profile');
    setActiveFloatingApp('profile');
    setIsProfileModalOpen(true);
  };

  const openAppPath = (path: string) => {
    startTransition(() => {
      window.history.pushState({}, document.title, withAppBase(path));
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  };

  useEffect(() => {
    const handleInternalLink = (event: Event) => {
      const target = ((event as CustomEvent<{ target?: string }>).detail?.target || '').toLowerCase();
      if (!target) {
        return;
      }

      if (target === 'account-preferences') {
        openProfileSettings();
        return;
      }

      if (target === 'calendar') {
        openCalendarModal();
        return;
      }

      if (target === 'messages') {
        openMessagesModal();
        return;
      }

      const routeByTarget: Record<string, string> = {
        dashboard: '/',
        devices: '/devices',
        reports: '/reports',
        search: '/search',
        evaluations: '/evaluations',
      };
      const route = routeByTarget[target];
      if (route) {
        openAppPath(route);
      }
    };

    window.addEventListener('shield:internal-link', handleInternalLink);
    return () => window.removeEventListener('shield:internal-link', handleInternalLink);
  }, [showCalendar, isMessagesModalOpen]);

  const closeActiveFloatingApp = () => {
    if (activeFloatingApp === 'calculator' && isCalculatorOpen) {
      closeModal('calculator');
      return true;
    }

    if (activeFloatingApp === 'messages' && isMessagesModalOpen) {
      closeModal('messages');
      return true;
    }

    if (activeFloatingApp === 'profile' && isProfileModalOpen) {
      closeModal('profile');
      return true;
    }

    if (isCalculatorOpen) {
      closeModal('calculator');
      return true;
    }

    if (isMessagesModalOpen) {
      closeModal('messages');
      return true;
    }

    if (isProfileModalOpen) {
      closeModal('profile');
      return true;
    }

    return false;
  };

  const toggleCreateUserModal = () => {
    if (!canOpenAdminConsole || !hasPermission('admin:create-user') || !hasPermission('users:create')) {
      return;
    }

    openAppPath('/admin/create-user');
  };

  const openAdminConsole = (tab: AdminConsoleTab = 'general') => {
    if (!canOpenAdminConsole) {
      return;
    }

    setIsAccountMenuOpen(false);
    openAppPath(`/admin/${tab}`);
  };

  const handleReceiveMessagesChange = async (receiveMessages: boolean) => {
    if (!hasPermission('messages:receive')) {
      showToast('error', 'You do not have permission to change message receiving.', { saveToNotifications: false });
      return;
    }

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
    } catch (err) {
      console.error(err);
      setMessagePreferences(previousPreferences);
      showToast('error', 'Failed to update message preferences.');
    }
  };

  const handleBrowserNotificationsChange = async (browserNotifications: boolean) => {
    if (!browserNotifications) {
      setMessagePreferences((preferences) => ({ ...preferences, browserNotifications: false }));
      return;
    }

    if (isShieldDesktopApp()) {
      setMessagePreferences((preferences) => ({ ...preferences, browserNotifications: true }));
      showSystemNotification(`${appName} notifications enabled`, {
        body: `You will receive Windows notifications for new messages and due reminders while ${appName} is open.`,
        tag: 'shield-desktop-notifications-enabled',
      });
      return;
    }

    if (!canUseBrowserNotifications()) {
      showToast('error', 'Browser notifications are not supported in this browser.', { saveToNotifications: false });
      return;
    }

    if (Notification.permission === 'denied') {
      showToast('error', 'Browser notifications are blocked. Enable them in your browser site settings first.', { saveToNotifications: false });
      return;
    }

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

    if (permission !== 'granted') {
      setMessagePreferences((preferences) => ({ ...preferences, browserNotifications: false }));
      showToast('info', 'Browser notifications were not enabled.', { saveToNotifications: false });
      return;
    }

    setMessagePreferences((preferences) => ({ ...preferences, browserNotifications: true }));
    showSystemNotification(`${appName} notifications enabled`, {
      body: isShieldDesktopApp()
        ? `You will receive Windows notifications for new messages and due reminders while ${appName} is open.`
        : `You will receive browser notifications for new messages and due reminders while ${appName} is open.`,
      tag: 'shield-browser-notifications-enabled',
    });
  };

  const handlePresenceHiddenChange = async (presenceHidden: boolean) => {
    if (!currentUser) {
      return;
    }

    const previousUser = currentUser;
    handleAccountUpdate({ ...currentUser, presenceHidden });

    try {
      const response = await authService.updatePresencePreference(currentUser.id, presenceHidden);
      if (response.data.account) {
        handleAccountUpdate(response.data.account);
      }
    } catch (err) {
      console.error(err);
      handleAccountUpdate(previousUser);
      showToast('error', getErrorMessage(err, 'Failed to update incognito mode.'));
    }
  };

  const handleCalendarHiddenChange = async (calendarHidden: boolean) => {
    if (!currentUser) {
      return;
    }

    const previousUser = currentUser;
    handleAccountUpdate({ ...currentUser, calendarHidden });

    try {
      const response = await authService.updateCalendarPreferences(currentUser.id, calendarHidden);
      if (response.data.account) {
        handleAccountUpdate(response.data.account);
      }
    } catch (err) {
      console.error(err);
      handleAccountUpdate(previousUser);
      showToast('error', 'Failed to update calendar preference.');
    }
  };

  const beginAppScaleTransition = () => {
    document.documentElement.classList.add('app-scale-transitioning');
    if (appScaleTransitionTimerRef.current) {
      window.clearTimeout(appScaleTransitionTimerRef.current);
    }
    appScaleTransitionTimerRef.current = window.setTimeout(() => {
      document.documentElement.classList.remove('app-scale-transitioning');
      appScaleTransitionTimerRef.current = null;
    }, APP_SCALE_TRANSITION_MS);
  };

  const handleAppScaleChange = async (appScale: AppScale) => {
    if (!currentUser) {
      return;
    }

    if (normalizeAppScale(currentUser.appScale) === appScale) {
      return;
    }

    beginAppScaleTransition();
    const previousUser = currentUser;
    handleAccountUpdate({ ...currentUser, appScale });

    try {
      const response = await authService.updateAppScalePreference(currentUser.id, appScale);
      if (response.data.account) {
        handleAccountUpdate(response.data.account);
      }
    } catch (err) {
      console.error(err);
      handleAccountUpdate(previousUser);
      showToast('error', 'Failed to update app scale preference.');
    }
  };

  const handleDefaultDutyHoursChange = async (value: string) => {
    if (!currentUser) {
      return;
    }

    const defaultDutyHours = normalizeDefaultDutyHours(value);
    const previousUser = currentUser;
    handleAccountUpdate({ ...currentUser, defaultDutyHours });

    try {
      const response = await authService.updateDefaultDutyHoursPreference(currentUser.id, defaultDutyHours);
      if (response.data.account) {
        handleAccountUpdate(response.data.account);
      }
    } catch (err) {
      console.error(err);
      handleAccountUpdate(previousUser);
      showToast('error', getErrorMessage(err, 'Failed to update default duty hours.'));
    }
  };

  const handleQuickLaunchSlotCountChange = (slotCount: number) => {
    const quickLaunchSlotCount = normalizeQuickLaunchSlotCount(slotCount);
    setMessagePreferences((preferences) => ({
      ...preferences,
      quickLaunchSlotCount,
    }));
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
      window.location.assign(withAppBase(`/updates/${encodeURIComponent(notification.entityId)}`));
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
      window.location.assign(withAppBase('/evaluations'));
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
      showToast('success', `Welcome to ${appName}\nFor completing the guide walkthrough.`);
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

      const consumeEscape = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      if (isCommandPaletteOpen) {
        consumeEscape();
        setIsCommandPaletteOpen(false);
        return;
      }

      if (isFirstLoginGuideOpen) {
        consumeEscape();
        setIsFirstLoginGuideOpen(false);
        return;
      }

      if (isNotificationsOpen) {
        consumeEscape();
        setIsNotificationsOpen(false);
        return;
      }

      if (isAccountMenuOpen) {
        consumeEscape();
        setIsAccountMenuOpen(false);
        return;
      }

      if (closeActiveFloatingApp()) {
        consumeEscape();
        return;
      }

      if (isBugTrackerOpen) {
        consumeEscape();
        closeModal('bugTracker');
        return;
      }

      if (isReportBugOpen) {
        consumeEscape();
        closeModal('reportBug');
        return;
      }

      if (isProfileModalOpen) {
        consumeEscape();
        closeModal('profile');
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [activeFloatingApp, isAccountMenuOpen, isBugTrackerOpen, isCalculatorOpen, isCommandPaletteOpen, isFirstLoginGuideOpen, isMessagesModalOpen, isNotificationsOpen, isProfileModalOpen, isReportBugOpen]);

  const shouldShowGlobalContextMenu = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) {
      return false;
    }

    if (target.closest('.quick-launch-context-menu, .quick-launch-picker, .recent-message-preview-pop, .recent-message-preview, .context-menu, .floating-window, .modal, .dialog')) {
      return false;
    }

    if (target.closest(
      'input, textarea, select, option, [role=\"textbox\"], [contenteditable=\"true\"], [data-native-context-menu=\"true\"]',
    )) {
      return false;
    }

    return true;
  }, []);

  useEffect(() => {
    const openGlobalContextMenu = (event: MouseEvent) => {
      if (!isAuthenticated || !currentUser || isAppLocked || event.defaultPrevented) {
        return;
      }

      const composedPath = typeof event.composedPath === 'function' ? event.composedPath() : [];
      const contextTarget = event.target instanceof Element
        ? event.target
        : (composedPath.find((node): node is Element => node instanceof Element) ?? null);

      if (event.ctrlKey || !shouldShowGlobalContextMenu(contextTarget)) {
        return;
      }

      event.preventDefault();

      const menuWidth = GLOBAL_CONTEXT_MENU_WIDTH;
      const menuHeight = GLOBAL_CONTEXT_MENU_HEIGHT;

      setGlobalContextMenu({
        x: Math.min(
          window.innerWidth - menuWidth - GLOBAL_CONTEXT_MENU_GUTTER,
          Math.max(GLOBAL_CONTEXT_MENU_GUTTER, event.clientX),
        ),
        y: Math.min(
          window.innerHeight - menuHeight - GLOBAL_CONTEXT_MENU_GUTTER,
          Math.max(GLOBAL_CONTEXT_MENU_GUTTER, event.clientY),
        ),
      });
    };

    document.addEventListener('contextmenu', openGlobalContextMenu);
    return () => document.removeEventListener('contextmenu', openGlobalContextMenu);
  }, [currentUser, isAuthenticated, isAppLocked, shouldShowGlobalContextMenu]);

  useEffect(() => {
    if (!globalContextMenu) {
      return undefined;
    }

    const closeContextMenu = () => {
      setGlobalContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      closeContextMenu();
      event.preventDefault();
    };

    document.addEventListener('click', closeContextMenu);
    document.addEventListener('scroll', closeContextMenu, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', closeContextMenu);
      document.removeEventListener('scroll', closeContextMenu, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [globalContextMenu]);

  const currentAppScale = normalizeAppScale(currentUser?.appScale);
  const canDecreaseAppScale = currentAppScale !== 'compact';
  const canIncreaseAppScale = currentAppScale !== 'large';

  const decreaseAppScale = () => {
    const currentIndex = APP_SCALE_SEQUENCE.indexOf(currentAppScale);
    const nextScale = APP_SCALE_SEQUENCE[currentIndex - 1];
    if (nextScale) {
      void handleAppScaleChange(nextScale);
    }
  };

  const increaseAppScale = () => {
    const currentIndex = APP_SCALE_SEQUENCE.indexOf(currentAppScale);
    const nextScale = APP_SCALE_SEQUENCE[currentIndex + 1];
    if (nextScale) {
      void handleAppScaleChange(nextScale);
    }
  };

  const loadingDetail = (() => {
    if (isDesktopStartupUpdateBlocking) {
      if (desktopUpdateStatus?.type === 'available') {
        return desktopUpdateStatus.version
          ? `Desktop update ${desktopUpdateStatus.version} found. Starting download...`
          : 'Desktop update found. Starting download...';
      }

      if (desktopUpdateStatus?.type === 'downloading') {
        return typeof desktopUpdateStatus.percent === 'number'
          ? `Downloading desktop update... ${desktopUpdateStatus.percent}%`
          : 'Downloading desktop update...';
      }

      if (desktopUpdateStatus?.type === 'downloaded') {
        return `Desktop update downloaded. Restarting ${appName}...`;
      }

      if (desktopUpdateStatus?.type === 'restarting') {
        return `Restarting ${appName} to install the update...`;
      }

      return 'Checking for desktop updates...';
    }

    if (isSessionLoading && !isSetupLoading) {
      return 'Loading account session...';
    }

    return 'Connecting to API...';
  })();

  const loadingSteps = (() => {
    const steps: Array<{ label: string; status: 'active' | 'complete' | 'warning' | 'waiting'; detail?: string }> = [];

    if (isShieldDesktopApp()) {
      const updateStatus = desktopUpdateStatus?.type;
      steps.push({
        label: 'Desktop update',
        status: updateStatus === 'error'
          ? 'warning'
          : updateStatus === 'not-available'
            ? 'complete'
            : isDesktopStartupUpdateBlocking
              ? 'active'
              : 'waiting',
        detail: desktopUpdateStatus?.type === 'downloading' && typeof desktopUpdateStatus.percent === 'number'
          ? `${desktopUpdateStatus.percent}% downloaded`
          : desktopUpdateStatus?.type === 'available'
            ? desktopUpdateStatus.version ? `Version ${desktopUpdateStatus.version} found` : 'Update found'
            : desktopUpdateStatus?.type === 'downloaded'
              ? 'Downloaded, restart pending'
              : desktopUpdateStatus?.type === 'restarting'
                ? 'Restarting installer'
                : desktopUpdateStatus?.type === 'not-available'
                  ? 'Up to date'
                  : desktopUpdateStatus?.type === 'error'
                    ? desktopUpdateStatus.message || 'Update check failed'
                    : desktopPreferences?.updateConfigured
                      ? 'Checking on launch'
                      : 'Not configured',
      });
    }

    steps.push({
      label: 'API connection',
      status: isSetupLoading ? isApiConnectionLost ? 'warning' : 'active' : 'complete',
      detail: isSetupLoading ? isApiConnectionLost ? 'Waiting for API response' : 'Connecting to API' : 'Connected',
    });

    steps.push({
      label: 'Account session',
      status: isSessionLoading ? 'active' : 'complete',
      detail: isSessionLoading ? 'Loading saved session' : 'Session ready',
    });

    return steps;
  })();
  const shouldRenderSeasonalEffects = activeSeasonalTheme === 'christmas' || activeSeasonalTheme === 'winter' || activeSeasonalTheme === 'fall';

  return (
    <Router basename={ROUTER_BASENAME} future={{ v7_startTransition: true }}>
      <ToastHost toasts={toasts} />
      {showConfetti && <ConfettiOverlay />}
      {shouldRenderSeasonalEffects && (
        <Suspense fallback={null}>
          <SeasonalThemeEffects activeTheme={activeSeasonalTheme} />
        </Suspense>
      )}
      {isDesktopUpdatePromptOpen && (
        <DesktopUpdatePrompt
          status={desktopUpdateStatus}
          installedVersion={desktopPreferences?.appVersion}
          onClose={() => setIsDesktopUpdatePromptOpen(false)}
          onInstall={handleInstallDesktopUpdate}
        />
      )}
      {isDesktopStartupUpdateBlocking || isSetupLoading || isSessionLoading ? (
        <ShieldLoading
          title={`Loading ${appName}`}
          detail={loadingDetail}
          steps={loadingSteps}
          brandLogoSrc={resolvedBrandLogoSrc}
          appName={appName}
        />
      ) : setupStatus?.setupRequired ? (
        <SetupWizard
          status={setupStatus}
          onToast={showToast}
          onComplete={(account, settings) => {
            setSetupStatus((currentStatus) => currentStatus ? {
              ...currentStatus,
              setupRequired: false,
              setupCompleted: true,
              accountCount: Math.max(1, currentStatus.accountCount),
              appName: settings.appName,
              siteName: settings.siteName,
              brandLogoDataUrl: settings.brandLogoDataUrl,
              primaryColor: settings.primaryColor,
              secondaryColor: settings.secondaryColor,
              appBaseUrl: settings.appBaseUrl,
              apiUrl: settings.apiUrl,
              registrationMode: settings.registrationMode,
              features: settings.features,
            } : currentStatus);
            window.history.replaceState({}, document.title, withAppBase('/'));
            handleLogin(account);
          }}
        />
      ) : setupStatus?.installed && getAppRelativePathname() === '/install' ? (
        <InstalledSetupClosedScreen appName={appName} siteName={siteName} />
      ) : !isAuthenticated ? (
        <LoginSplash onLogin={handleLogin} onToast={showToast} appName={appName} siteName={siteName} brandLogoDataUrl={brandLogoDataUrl} brandLogoSrc={resolvedBrandLogoSrc} isExiting={isLoginTransitioning} />
      ) : (
        <div className="animate-app-enter flex h-[100dvh] overflow-hidden bg-gray-50 dark:bg-gray-950">
          {globalContextMenu && (
            <div
              className="fixed z-[999] w-64 overflow-hidden rounded-xl border border-white/25 bg-white/95 p-1 shadow-[0_20px_55px_rgba(15,23,42,0.28)] ring-1 ring-black/5 backdrop-blur dark:border-gray-700 dark:bg-gray-900 dark:ring-white/10"
              style={{ left: globalContextMenu.x, top: globalContextMenu.y }}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setGlobalContextMenu(null);
                  openAppPath('/search');
                }}
                className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-black/5 dark:text-gray-100 dark:hover:bg-white/10"
              >
                <Search size={15} />
                <span>Search Users</span>
              </button>
              <div className="mx-2 my-1 border-t border-gray-200 dark:border-gray-700" />
              <button
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleGlassThemeChange(!isGlassTheme);
                }}
                className="group flex w-full items-center justify-between rounded-lg px-2.5 py-2.5 text-sm transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                <span className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-100">
                  {isGlassTheme ? <Sun size={15} /> : <Moon size={15} />}
                  <span>Glass Mode</span>
                </span>
                <span className={`flex h-5 w-10 items-center rounded-full p-0.5 transition ${isGlassTheme ? 'justify-end bg-accent' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
                </span>
              </button>
              <div className="mx-2 my-1 border-t border-gray-200 dark:border-gray-700" />
              <div className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2.5">
                <span className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-100">
                  <Settings size={15} />
                  <span>App Scale</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      decreaseAppScale();
                    }}
                    disabled={!canDecreaseAppScale}
                    className={`rounded-md border border-gray-300 p-1 transition ${canDecreaseAppScale ? 'hover:bg-black/5 dark:border-gray-600 dark:hover:bg-white/10' : 'cursor-not-allowed opacity-40'}`}
                    aria-label="Decrease app scale"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="w-20 text-center text-xs font-black text-primary-500 dark:text-blue-100">
                    {APP_SCALE_LABELS[currentAppScale]}
                  </span>
                  <button
                    type="button"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      increaseAppScale();
                    }}
                    disabled={!canIncreaseAppScale}
                    className={`rounded-md border border-gray-300 p-1 transition ${canIncreaseAppScale ? 'hover:bg-black/5 dark:border-gray-600 dark:hover:bg-white/10' : 'cursor-not-allowed opacity-40'}`}
                    aria-label="Increase app scale"
                  >
                    <span className="inline-block h-[12px] w-[12px] select-none text-sm leading-[12px] font-black">+</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          <aside className={`shield-left-panel shield-sidebar-shell relative z-50 hidden h-[100dvh] shrink-0 overflow-visible bg-primary-500 text-white shadow-xl md:block ${isSidebarCollapsed ? 'shield-sidebar-collapsed w-20' : 'w-72'}`}>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              className="sidebar-collapse-button absolute -right-5 top-1/2 z-30 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-primary-500 shadow-lg hover:bg-gray-50 md:flex"
              aria-label={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
              <span className="sidebar-collapse-tooltip" role="tooltip">
                {isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              </span>
            </button>

            <div className="shield-sidebar flex h-[100dvh] flex-col overflow-y-auto overflow-x-visible">
            <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-4">
              {!isSidebarCollapsed && (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center">
                    <img src={resolvedBrandLogoSrc} alt="" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-wider text-white">{appName}</h1>
                    <p className="text-xs text-blue-100">{siteName}</p>
                  </div>
                </div>
              )}
              {isSidebarCollapsed && (
                <div className="mx-auto flex h-10 w-10 items-center justify-center">
                  <img src={resolvedBrandLogoSrc} alt={appName} className="h-full w-full object-contain" />
                </div>
              )}
            </div>

            <div className={`shield-sidebar-section ${isSidebarCollapsed ? 'px-3 pb-2 pt-3' : 'px-4 pb-2 pt-3'}`}>
              <GlobalSearch compact={isSidebarCollapsed} />
            </div>

            <div className={`shield-sidebar-section ${isSidebarCollapsed ? 'px-3 py-2' : 'px-4 py-2'}`}>
              <button
                data-onboarding-target="profile-card"
                type="button"
                onClick={openProfileSettings}
                className={`w-full overflow-hidden rounded bg-white/10 text-left transition hover:bg-white/15 ${isSidebarCollapsed ? 'p-1.5' : 'p-2.5'}`}
                title="Open profile"
              >
                <div className={isSidebarCollapsed ? 'flex justify-center' : 'flex items-center gap-3'}>
                  {currentUser?.profilePictureUrl ? (
                    <img
                      src={getAssetThumbnailUrl(currentUser.profilePictureUrl, 96)}
                      alt={currentUser.displayName}
                      onError={(event) => handleAssetThumbnailError(event, currentUser.profilePictureUrl)}
                      className={`${isSidebarCollapsed ? 'h-10 w-10' : 'h-12 w-12'} shrink-0 rounded-full border border-white bg-white object-cover shadow`}
                    />
                  ) : (
                    <div className={`${isSidebarCollapsed ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-base'} flex shrink-0 items-center justify-center rounded-full border border-white bg-white font-bold text-primary-500 shadow`}>
                      {currentUser ? getInitials(currentUser.displayName, currentUser.email) : <UserCircle size={32} />}
                    </div>
                  )}
                  {!isSidebarCollapsed && (
                    <div className="min-w-0 text-white">
                      <p className="truncate text-sm font-bold">{currentUser?.displayName}</p>
                      <p className="truncate text-xs capitalize text-blue-100">{currentUser?.role || 'User'}</p>
                    </div>
                  )}
                </div>
              </button>
            </div>

            <nav data-onboarding-target="navigation" className="flex shrink-0 flex-col gap-1.5 px-3 py-2">
              <SidebarLink to="/" label="Dashboard" compact={isSidebarCollapsed} icon={LayoutDashboard} />
              {isAdministrator && <SidebarLink to="/devices" label="Devices" compact={isSidebarCollapsed} icon={Laptop} />}
              <SidebarLink to="/reports" label="Reports" compact={isSidebarCollapsed} icon={BarChart3} />
            </nav>

            <div className={`shrink-0 border-t border-white/10 pt-2 ${isSidebarCollapsed ? 'px-3' : 'px-4'}`}>
              {showCalendar && (
                <div data-onboarding-target="sidebar-calendar">
                  <SidebarCalendarWidget
                    compact={isSidebarCollapsed}
                    entries={sidebarCalendarEntries}
                    reminders={sidebarReminders}
                    onOpenCalendar={openCalendarModal}
                    copiedDaily={copiedSidebarDaily}
                    onCopyDaily={copySidebarDaily}
                    onPasteDaily={(dateKey) => void pasteSidebarDaily(dateKey)}
                    onCopyPreviousDaily={copyPreviousSidebarDaily}
                    onAddReminder={(dateKey) => void addSidebarReminder(dateKey)}
                    onMarkDayOff={(dateKey) => void markSidebarDailyDayOff(dateKey)}
                    onDeleteDaily={(dateKey) => void deleteSidebarDaily(dateKey)}
                  />
                </div>
              )}
              {!messagePreferences.hideQuickLaunch && messagePreferences.quickLaunchPlacement === 'sidebar' && (
                <div className={showCalendar ? 'mt-3' : ''}>
                  {!isSidebarCollapsed && (
                    <div className="mb-2 flex items-center justify-between gap-2 text-blue-100">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em]">Quick Launch</span>
                      <span className="text-[10px] font-black">{messagePreferences.quickLaunchSlotCount}</span>
                    </div>
                  )}
                  <Suspense fallback={null}>
                    <QuickLaunchTray
                      isAdministrator={isAdministrator}
                      permissions={currentUser?.permissions || []}
                      isSidebarCollapsed={isSidebarCollapsed}
                      badgeCounts={{ messages: messageUnreadCount }}
                      activeModalApps={[
                        ...(isMessagesModalOpen ? (['messages'] as const) : []),
                        ...(isCalculatorOpen ? (['calculator'] as const) : []),
                      ]}
                      storageKey={getQuickLaunchStorageKey(currentUser?.id || 'anonymous')}
                      accountId={currentUser?.id}
                      showCalendar={showCalendar}
                      slotCount={messagePreferences.quickLaunchSlotCount}
                      placement={messagePreferences.quickLaunchPlacement}
                      onOpenMessages={toggleMessagesModal}
                      onOpenCalendar={toggleCalendarModal}
                      onOpenCalculator={toggleCalculator}
                      onOpenCreateUser={toggleCreateUserModal}
                      onQuickLaunchHiddenChange={(hideQuickLaunch) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          hideQuickLaunch,
                        }))
                      }
                      onQuickLaunchPlacementChange={(quickLaunchPlacement) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          quickLaunchPlacement,
                        }))
                      }
                      onQuickLaunchSlotCountChange={handleQuickLaunchSlotCountChange}
                    />
                  </Suspense>
                </div>
              )}
            </div>
            {activeSeasonalTheme === 'thanksgiving' && !isSidebarCollapsed && (
              <div className="mt-auto shrink-0 px-4 pb-4 pt-3">
                <Suspense fallback={null}>
                  <ThanksgivingSidebarAnimation />
                </Suspense>
              </div>
            )}
            </div>
          </aside>

          <div className="relative flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
              <div data-onboarding-target="header-actions" className="pointer-events-auto fixed right-3 top-3 z-40 flex select-none items-center gap-1.5 rounded-2xl border border-gray-200 bg-white/90 p-2 shadow-[0_16px_45px_rgba(15,23,42,0.18)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/85 sm:right-5 sm:top-4 sm:gap-2">
                <NotificationCenterMenu
                  menuRef={notificationsMenuRef}
                  isOpen={isNotificationsOpen}
                  isAdministrator={isAdministrator}
                  hasItems={hasNotificationCenterItems}
                  totalCount={totalNotificationCount}
                  unreadCount={unreadNotificationCount}
                  bugCount={openBugCount}
                  recentCount={recentNotificationCount}
                  unreadNotifications={unreadUserNotifications}
                  recentNotifications={notifications}
                  onToggle={() => setIsNotificationsOpen((value) => !value)}
                  onClearAll={clearAllNotifications}
                  onOpenBugTracker={openBugTrackerFromNotification}
                  onOpenNotification={(notification) => void openNotification(notification)}
                />
                <IconButtonTooltip label="Messages">
                  <HeaderMessagesButton
                    unreadCount={messageUnreadCount}
                    onOpenMessages={toggleMessagesModal}
                  />
                </IconButtonTooltip>
                <IconButtonTooltip label={theme === 'light' ? 'Dark Mode' : 'Light Mode'}>
                  <button
                    data-onboarding-control="theme"
                    type="button"
                    onClick={() => handleThemeChange(theme === 'light' ? 'dark' : 'light')}
                    className="header-action-button flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                    aria-label="Change theme"
                  >
                    {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                  </button>
                </IconButtonTooltip>
                <div ref={accountMenuRef} className="relative">
                <IconButtonTooltip label="Settings">
                  <button
                    data-onboarding-control="settings"
                    type="button"
                    onClick={() => setIsAccountMenuOpen((value) => !value)}
                    className="header-action-button flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-primary-500 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-100 dark:hover:bg-gray-700"
                    aria-label="Open account menu"
                  >
                    <Settings size={18} />
                  </button>
                </IconButtonTooltip>
                <div
                  className={`absolute right-0 top-12 z-40 w-[calc(100vw-6.5rem)] max-w-64 origin-top-right rounded border border-gray-200 bg-white shadow-xl transition duration-200 ease-out dark:border-gray-700 dark:bg-gray-900 sm:w-64 ${
                    isAccountMenuOpen ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
                  }`}
                  aria-hidden={!isAccountMenuOpen}
                >
                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                      <p className="truncate text-sm font-bold text-gray-800 dark:text-gray-100">{currentUser?.displayName}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{currentUser?.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        openProfileSettings();
                        setIsAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <UserCircle size={16} /> Account Settings
                    </button>
                    {canOpenAdminConsole && (
                      <button
                        type="button"
                        onClick={() => openAdminConsole(getDefaultAdminConsoleTab())}
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
                </div>
              </div>

            <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-28 pt-4 dark:bg-gray-950 sm:px-6 sm:pb-48 sm:pt-5 md:pb-48">
              <div data-onboarding-target="workspace" className="min-h-[calc(100dvh-12rem)] min-w-0">
                <AppRoutes
                  currentUser={currentUser}
                  isAppBackgrounded={isAppBackgrounded}
                  canOpenAdminConsole={canOpenAdminConsole}
                  useMilitaryTime={messagePreferences.useMilitaryTime}
                  bugReports={bugReports}
                  hasPermission={hasPermission}
                  getDefaultAdminConsoleTab={getDefaultAdminConsoleTab}
                  onAccountUpdate={handleAccountUpdate}
                  onToast={showToast}
                  getErrorMessage={getErrorMessage}
                  openAppPath={openAppPath}
                  onBugStatusChange={updateBugStatus}
                />
              </div>
              {!messagePreferences.hideQuickLaunch && messagePreferences.quickLaunchPlacement === 'dock' && (
                <Suspense fallback={null}>
                  <QuickLaunchTray
                    isAdministrator={isAdministrator}
                    permissions={currentUser?.permissions || []}
                    isSidebarCollapsed={isSidebarCollapsed}
                    badgeCounts={{ messages: messageUnreadCount }}
                    activeModalApps={[
                      ...(isMessagesModalOpen ? (['messages'] as const) : []),
                      ...(isCalculatorOpen ? (['calculator'] as const) : []),
                    ]}
                    storageKey={getQuickLaunchStorageKey(currentUser?.id || 'anonymous')}
                    accountId={currentUser?.id}
                    showCalendar={showCalendar}
                    slotCount={messagePreferences.quickLaunchSlotCount}
                    placement={messagePreferences.quickLaunchPlacement}
                    onOpenMessages={toggleMessagesModal}
                    onOpenCalendar={toggleCalendarModal}
                    onOpenCalculator={toggleCalculator}
                    onOpenCreateUser={toggleCreateUserModal}
                    onQuickLaunchHiddenChange={(hideQuickLaunch) =>
                      setMessagePreferences((preferences) => ({
                        ...preferences,
                        hideQuickLaunch,
                      }))
                    }
                    onQuickLaunchPlacementChange={(quickLaunchPlacement) =>
                      setMessagePreferences((preferences) => ({
                        ...preferences,
                        quickLaunchPlacement,
                      }))
                    }
                    onQuickLaunchSlotCountChange={handleQuickLaunchSlotCountChange}
                  />
                </Suspense>
              )}
            </main>
          </div>
          <MobileNavigation
            isAdministrator={isAdministrator}
            unreadMessages={messageUnreadCount}
            showCalendar={showCalendar}
          />
          <GlobalKeyboardShortcuts
            canOpenAdminConsole={canOpenAdminConsole}
            canCreateUsers={canOpenAdminConsole && hasPermission('admin:create-user') && hasPermission('users:create')}
            isLocked={isAppLocked}
            showCalendar={showCalendar}
            defaultAdminConsoleTab={getDefaultAdminConsoleTab()}
            onOpenMessages={openMessagesModal}
            onOpenCalendar={openCalendarModal}
            onOpenCalculator={openCalculator}
            onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
            onLock={lockApp}
          />
          <Suspense fallback={null}>
            <GlobalCommandPalette
              isOpen={isCommandPaletteOpen}
              isAdministrator={isAdministrator}
              canOpenAdminConsole={canOpenAdminConsole}
              showCalendar={showCalendar}
              defaultAdminConsoleTab={getDefaultAdminConsoleTab()}
              permissions={currentUser?.permissions || []}
              onOpenChange={setIsCommandPaletteOpen}
              onOpenMessages={openMessagesModal}
              onOpenCalendar={openCalendarModal}
              onOpenCalculator={openCalculator}
              onOpenProfile={() => {
                openProfileSettings();
                setIsAccountMenuOpen(false);
              }}
              onReportBug={() => {
                setIsReportBugOpen(true);
                setIsAccountMenuOpen(false);
              }}
            />
          </Suspense>
          {shouldShowRecentConversations && (
            <Suspense fallback={null}>
              <RecentMessagesDockContainer
                currentUser={currentUser}
                isVisible={shouldShowRecentConversations}
                isAppBackgrounded={isAppBackgrounded}
                onOpenConversation={(threadId) => {
                  setMessageTargetUser(null);
                  setMessageTargetThreadId(threadId);
                  openMessagesModal();
                }}
                onUnreadCountDelta={(delta) => setMessageUnreadCount((count) => Math.max(0, count + delta))}
                onToast={showToast}
              />
            </Suspense>
          )}
          {isMessagesModalOpen && currentUser && (
            <FloatingWindow
              className="glass-workspace-window pointer-events-auto fixed inset-x-0 top-0 bottom-[calc(env(safe-area-inset-bottom)+5.4rem)] flex min-h-0 w-full min-w-0 max-w-none resize-none flex-col overflow-hidden rounded-none bg-white p-3 shadow-2xl dark:bg-gray-900 md:inset-auto md:h-[72dvh] md:max-h-[calc(100dvh-1rem)] md:min-h-[min(420px,calc(100dvh-1rem))] md:w-[min(900px,calc(100vw-1rem))] md:min-w-[min(360px,calc(100vw-1rem))] md:max-w-[calc(100vw-1rem)] md:resize md:rounded-lg md:p-4"
              fallbackSize={{ width: Math.min(window.innerWidth - 16, 900), height: Math.min(window.innerHeight - 16, 680) }}
              initialPosition={getInitialMessagesModalPosition}
              isClosing={closingModal === 'messages'}
              onFocus={() => {
                announceFloatingFocus('messages');
                setActiveFloatingApp('messages');
              }}
              zIndex={activeFloatingApp === 'messages' ? 95 : 55}
            >
              {({ dragHandleProps, isDragging }) => (
              <>
                <div
                  {...dragHandleProps}
                  className={`mb-3 flex select-none items-start justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-800 md:touch-none md:cursor-grab ${isDragging ? 'md:cursor-grabbing' : ''}`}
                >
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Messages</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 md:hidden">Chats and conversations.</p>
                    <p className="mt-0.5 hidden text-xs text-gray-500 dark:text-gray-400 md:block">Drag to move. Resize from the corner.</p>
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
                    <MessageInboxPage currentUser={currentUser} onToast={showToast} isModalView targetRecipient={messageTargetUser} targetThreadId={messageTargetThreadId} composeRequestKey={messageComposeRequestKey} isBackgrounded={false} />
                  </Suspense>
                </div>
              </>
              )}
            </FloatingWindow>
          )}
          {isProfileModalOpen && currentUser && (
            <FloatingWindow
              className="glass-workspace-window pointer-events-auto fixed inset-0 flex h-[100dvh] max-h-[100dvh] min-h-0 w-full min-w-0 max-w-none resize-none flex-col overflow-hidden rounded-none bg-white p-3 shadow-2xl dark:bg-gray-900 md:inset-auto md:h-[min(88dvh,760px)] md:max-h-[calc(100dvh-1rem)] md:min-h-[min(460px,calc(100dvh-1rem))] md:w-[min(900px,calc(100vw-1rem))] md:min-w-[min(380px,calc(100vw-1rem))] md:max-w-[calc(100vw-1rem)] md:resize md:rounded-lg md:p-4"
              fallbackSize={{ width: Math.min(window.innerWidth - 16, 900), height: Math.min(window.innerHeight - 16, 760) }}
              initialPosition={getInitialProfileSettingsPosition}
              isClosing={closingModal === 'profile'}
              onFocus={() => {
                announceFloatingFocus('profile');
                setActiveFloatingApp('profile');
              }}
              zIndex={activeFloatingApp === 'profile' ? 95 : 55}
            >
              {({ dragHandleProps, isDragging }) => (
              <>
                <div
                  {...dragHandleProps}
                  className={`mb-3 flex shrink-0 select-none items-start justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-800 md:cursor-grab ${isDragging ? 'md:cursor-grabbing' : ''}`}
                >
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
                      appTheme={theme}
                      isGlassTheme={isGlassTheme}
                      isDesktopApp={isShieldDesktopApp()}
                      desktopPreferences={desktopPreferences}
                      desktopUpdateStatus={desktopUpdateStatus}
                      notificationSounds={notificationSounds}
                      onReceiveMessagesChange={handleReceiveMessagesChange}
                      onBrowserNotificationsChange={handleBrowserNotificationsChange}
                      onMessageSoundChange={(playMessageSound) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          playMessageSound,
                        }))
                      }
                      onMessageSoundSelect={(messageSound) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          messageSound: messageSound as MessageSound,
                        }))
                      }
                      onPreviewMessageSound={(messageSound) => {
                        const customSoundUrl = getCustomNotificationSoundUrl(messageSound);
                        if (customSoundUrl) {
                          playCustomSoundEffect(customSoundUrl);
                        }
                      }}
                      onReminderAlarmSoundSelect={(reminderAlarmSound) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          reminderAlarmSound: reminderAlarmSound as ReminderAlarmSound,
                        }))
                      }
                      onMilitaryTimeChange={(useMilitaryTime) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          useMilitaryTime,
                        }))
                      }
                      onRecentConversationsHiddenChange={(hideRecentConversations) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          hideRecentConversations,
                        }))
                      }
                      onQuickLaunchHiddenChange={(hideQuickLaunch) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          hideQuickLaunch,
                        }))
                      }
                      onQuickLaunchPlacementChange={(quickLaunchPlacement) =>
                        setMessagePreferences((preferences) => ({
                          ...preferences,
                          quickLaunchPlacement,
                        }))
                      }
                      onQuickLaunchSlotCountChange={handleQuickLaunchSlotCountChange}
                      onPresenceHiddenChange={handlePresenceHiddenChange}
                      onCalendarHiddenChange={handleCalendarHiddenChange}
                      onAppScaleChange={handleAppScaleChange}
                      onDefaultDutyHoursChange={handleDefaultDutyHoursChange}
                      onAppThemeChange={handleThemeChange}
                      onGlassThemeChange={handleGlassThemeChange}
                      onStartWithWindowsChange={handleStartWithWindowsChange}
                      onTrayModeChange={handleTrayModeChange}
                      onCheckForDesktopUpdates={handleCheckForDesktopUpdates}
                      onInstallDesktopUpdate={handleInstallDesktopUpdate}
                      onOpenDesktopDiagnostics={handleOpenDesktopDiagnostics}
                      onReplayGuide={replayGuide}
                      onOpenEvaluations={() => closeModal('profile')}
                      onAccountUpdate={handleAccountUpdate}
                      onToast={showToast}
                      getErrorMessage={getErrorMessage}
                    />
                  </Suspense>
                </div>
              </>
              )}
            </FloatingWindow>
          )}
          {isCalculatorOpen && (
            <Suspense fallback={null}>
              <CalculatorModal
                isClosing={closingModal === 'calculator'}
                onClose={() => closeModal('calculator')}
                onFocus={() => {
                  announceFloatingFocus('calculator');
                  setActiveFloatingApp('calculator');
                }}
                zIndex={activeFloatingApp === 'calculator' ? 95 : 55}
              />
            </Suspense>
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
          {urgentAlerts[0] && (
            <UrgentAlertModal
              alert={urgentAlerts[0]}
              onAcknowledge={() => void acknowledgeUrgentAlert(urgentAlerts[0])}
              isAcknowledging={acknowledgingUrgentAlertId === urgentAlerts[0].id}
            />
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
              onAppScaleChange={handleAppScaleChange}
              onDefaultDutyHoursChange={handleDefaultDutyHoursChange}
              onFinish={finishFirstLoginGuide}
              onLater={() => setIsFirstLoginGuideOpen(false)}
            />
          )}
          {reminderModalDate && (
            <ReminderCreateModal
              date={reminderModalDate}
              isSaving={isReminderSaving}
              alarmSound={messagePreferences.reminderAlarmSound}
              notificationSounds={notificationSounds}
              onClose={() => {
                if (!isReminderSaving) {
                  setReminderModalDate(null);
                }
              }}
              onSave={(title) => void saveSidebarReminder(title)}
              onAlarmSoundChange={(reminderAlarmSound) =>
                setMessagePreferences((preferences) => ({
                  ...preferences,
                  reminderAlarmSound,
                }))
              }
            />
          )}
          {dueReminderPopup.length > 0 && !isAppLocked && (
            <ReminderDuePopup
              reminders={dueReminderPopup}
              isSaving={isCompletingDueReminder}
              onComplete={(reminder) => void completeDueReminder(reminder)}
              onDismiss={() => setDueReminderPopup([])}
              onSnooze={(reminder, minutes) => void snoozeDueReminder(reminder, minutes)}
            />
          )}
          {shouldShowForcedPasswordModal && currentUser && (
            <ForcePasswordChange account={currentUser} onChanged={handleAccountUpdate} onLogout={handleLogout} onToast={showToast} appName={appName} />
          )}
          {isApiConnectionLost && <ConnectionLostOverlay lastConnectedAt={lastApiConnectedAt} appName={appName} brandLogoSrc={resolvedBrandLogoSrc} />}
          {isAppLocked && currentUser && (
            <LockScreen
              account={currentUser}
              appName={appName}
              siteName={siteName}
              onUnlock={unlockApp}
              onLogout={handleLogout}
            />
          )}
        </div>
      )}
    </Router>
  );
}

export default App;
