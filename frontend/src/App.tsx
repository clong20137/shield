import { CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BarChart3, Bell, Bug, Calculator, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Command, Delete, Download, ExternalLink, Laptop, LayoutDashboard, Link, LockKeyhole, LogOut, LucideIcon, Mail, Minus, Moon, Pencil, Plus, RefreshCw, Save, Search, Send, Settings, Shield, Sun, Trash2, UserCircle, UserPlus, Users, X } from 'lucide-react';
import { BrowserRouter as Router, NavLink, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import type { AdminConsoleTab } from './pages/AdminConsolePage';
import { ToastHost, ToastMessage, ToastType } from './components/ToastHost';
import { FloatingWindow } from './components/FloatingWindow';
import { MentionTextarea } from './components/MentionTextarea';
import { FirstLoginGuide, WelcomeSplash } from './components/OnboardingGuide';
import { BugTrackerModal } from './components/BugTrackerModal';
import { AuthAccount, authService, bugReportService, BugReport, BugReportPriority, BugReportStatus, CalendarEntry, CalendarEntryPayload, calendarService, clearAuthToken, CompleteSetupPayload, errorLogService, getApiHealthUrl, getAppEventsUrl, getAssetThumbnailUrl, getAssetUrl, getMessageEventsUrl, handleAssetThumbnailError, messageService, notificationService, notificationSoundService, NotificationSound, quickLaunchService, reminderService, RegistrationSettings, Reminder, SetupEnvironmentValues, SetupStatus, urgentAlertService, UrgentAlert, UserMessage, UserNotification, userService, User, type QuickLaunchExternalSlot as ApiQuickLaunchExternalSlot, type QuickLaunchSlot as ApiQuickLaunchSlot } from './services/api';

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
const GLASS_THEME_KEY = 'shield_glass_theme';
const MESSAGE_PREFERENCES_KEY = 'shield_message_preferences';
const MILITARY_TIME_DEFAULT_APPLIED_KEY = 'shield_military_time_default_applied';
const RECENT_CONVERSATIONS_DEFAULT_APPLIED_KEY = 'shield_recent_conversations_default_applied';
const SESSION_TIMEOUT_KEY = 'shield_session_timeout_minutes';
const QUICK_LAUNCH_KEY = 'shield_quick_launch';
const QUICK_LAUNCH_MIN_SLOT_COUNT = 4;
const QUICK_LAUNCH_MAX_SLOT_COUNT = 10;
const QUICK_LAUNCH_DEFAULT_SLOT_COUNT = 8;
const QUICK_LAUNCH_PICKER_WIDTH = 320;
const QUICK_LAUNCH_PICKER_GUTTER = 12;
const QUICK_LAUNCH_PICKER_CLOSE_MS = 500;
const QUICK_LAUNCH_CONTEXT_MENU_WIDTH = 256;
const QUICK_LAUNCH_CONTEXT_MENU_HEIGHT = 300;
const QUICK_LAUNCH_CONTEXT_MENU_GUTTER = 12;
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
const MAX_SETUP_LOGO_SIZE_BYTES = 240 * 1024;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const LOGIN_TRANSITION_MS = 560;
const DESKTOP_UNREAD_FALLBACK_POLL_MS = 12 * 1000;
type AppTheme = 'light' | 'dark';

function withAppBase(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}` || '/';
}

function getBrandLogoSrc(brandLogoDataUrl?: string): string {
  return brandLogoDataUrl || withAppBase(DEFAULT_BRAND_LOGO);
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

type ClosingModal = 'messages' | 'calendar' | 'calculator' | 'profile' | 'reportBug' | 'bugTracker';
type FloatingAppId = 'messages' | 'calendar' | 'calculator' | 'profile';
type AppScale = AuthAccount['appScale'];
const APP_SCALE_SEQUENCE: AppScale[] = ['compact', 'comfortable', 'large'];
const APP_SCALE_LABELS: Record<AppScale, string> = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  large: 'Large',
};

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

interface RecentConversation {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  threadType: string;
  directParticipantId: string;
  directLastSeenAt: string | null;
  threadParticipantIds: string[];
  latestMessage?: UserMessage;
  unreadPreview: string;
  unreadCount: number;
  unreadMessageIds: string[];
}

type RecentPresenceStatus = 'active' | 'away' | 'busy';
interface RecentPresenceState {
  online: boolean;
  away: boolean;
  status: RecentPresenceStatus;
  lastSeenAt: string | null;
}

interface RecentTypingState {
  name: string;
  expiresAt: number;
}

type ReminderAlarmSound = '' | `custom:${string}`;
type MessageSound = '' | `custom:${string}`;
type QuickLaunchPlacement = 'dock' | 'sidebar';

type QuickLaunchAppId = 'dashboard' | 'messages' | 'calendar' | 'devices' | 'calculator' | 'search' | 'reports' | 'create-user' | 'audit' | 'permissions';
type QuickLaunchExternalSlot = ApiQuickLaunchExternalSlot;
type QuickLaunchSlot = QuickLaunchAppId | QuickLaunchExternalSlot | null;

interface QuickLaunchApp {
  id: QuickLaunchAppId;
  label: string;
  path?: string;
  adminOnly?: boolean;
  requiredPermission?: string;
  icon: LucideIcon;
}

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

const quickLaunchApps: QuickLaunchApp[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { id: 'messages', label: 'Messages', icon: Mail },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'devices', label: 'Devices', path: '/devices', requiredPermission: 'devices:manage', icon: Laptop },
  { id: 'calculator', label: 'Calculator', icon: Calculator },
  { id: 'search', label: 'Search Users', path: '/search', icon: Search },
  { id: 'reports', label: 'Reports', path: '/reports', icon: BarChart3 },
  { id: 'create-user', label: 'Create User', path: '/users/create', requiredPermission: 'admin:create-user', icon: UserPlus },
  { id: 'audit', label: 'Audit Log', path: '/audit', requiredPermission: 'admin:audit', icon: ClipboardList },
  { id: 'permissions', label: 'Permissions', path: '/permissions', requiredPermission: 'admin:permissions', icon: LockKeyhole },
];

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

function isExternalQuickLaunchSlot(slot: QuickLaunchSlot): slot is QuickLaunchExternalSlot {
  return typeof slot === 'object' && slot !== null && slot.type === 'external';
}

function getQuickLaunchSlotRenderKey(slot: QuickLaunchSlot, index: number): string {
  if (typeof slot === 'string') {
    return `app-${slot}`;
  }

  if (isExternalQuickLaunchSlot(slot)) {
    return `external-${slot.label}-${slot.url}`;
  }

  return `empty-${index}`;
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

function normalizeQuickLaunchSlotCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(count)) {
    return QUICK_LAUNCH_DEFAULT_SLOT_COUNT;
  }

  return Math.min(QUICK_LAUNCH_MAX_SLOT_COUNT, Math.max(QUICK_LAUNCH_MIN_SLOT_COUNT, Math.round(count)));
}

function getQuickLaunchStorageKey(accountId: string): string {
  return `${QUICK_LAUNCH_KEY}_${accountId}`;
}

function getEmptyQuickLaunchSlots(slotCount = QUICK_LAUNCH_DEFAULT_SLOT_COUNT): QuickLaunchSlot[] {
  return Array.from({ length: normalizeQuickLaunchSlotCount(slotCount) }, () => null);
}

function normalizeQuickLaunchSlots(rawSlots: unknown, slotCount = QUICK_LAUNCH_DEFAULT_SLOT_COUNT): QuickLaunchSlot[] {
  const parsedSlots = Array.isArray(rawSlots) ? rawSlots : [];
  const normalizedSlotCount = normalizeQuickLaunchSlotCount(slotCount);

  return Array.from({ length: normalizedSlotCount }, (_, index) => {
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

function loadLegacyQuickLaunchSlots(storageKey: string, slotCount = QUICK_LAUNCH_DEFAULT_SLOT_COUNT): QuickLaunchSlot[] {
  try {
    const storedSlots = window.localStorage.getItem(storageKey);
    return normalizeQuickLaunchSlots(storedSlots ? JSON.parse(storedSlots) : [], slotCount);
  } catch {
    return getEmptyQuickLaunchSlots(slotCount);
  }
}

function saveLegacyQuickLaunchSlots(storageKey: string, slots: QuickLaunchSlot[], slotCount = QUICK_LAUNCH_DEFAULT_SLOT_COUNT) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeQuickLaunchSlots(slots, slotCount)));
  } catch {
    // Local storage is only a fallback for quick launch preferences.
  }
}

function normalizeExternalAppUrl(value: string): string {
  const trimmedValue = value.trim();

  return /^https?:\/\//iu.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
}

function getExternalAppWindowName(label: string): string {
  const normalizedLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');

  return `shield_app_${normalizedLabel || 'external'}`;
}

function openExternalAppPopup(slot: QuickLaunchExternalSlot): boolean {
  const url = normalizeExternalAppUrl(slot.url);
  const width = Math.min(1280, Math.max(960, Math.round(window.screen.availWidth * 0.82)));
  const height = Math.min(900, Math.max(700, Math.round(window.screen.availHeight * 0.82)));
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
  const windowFeatures = [
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(',');
  const popup = window.open(url, getExternalAppWindowName(slot.label), windowFeatures);

  if (popup) {
    popup.opener = null;
    popup.focus();
    return true;
  }

  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'));
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

function getPlainNotificationMessage(value: string): string {
  if (!/<\/?[a-z][\s\S]*>/iu.test(value)) {
    return value;
  }

  const container = document.createElement('div');
  container.innerHTML = value;
  return (container.textContent || value).trim();
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
  isExiting = false,
}: {
  onLogin: (account: AuthAccount) => void;
  onToast: (type: ToastType, message: string) => void;
  appName?: string;
  siteName?: string;
  brandLogoDataUrl?: string;
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
                <img src={getBrandLogoSrc(brandLogoDataUrl)} alt="" className="h-16 w-16 object-contain" />
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
                <img src={getBrandLogoSrc(brandLogoDataUrl)} alt="" className="h-14 w-14 object-contain drop-shadow-lg" />
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

function parseRecentConversationList(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function normalizeRecentConversationSubject(value?: string | null): string {
  const subject = value?.trim();
  return subject && subject.toLowerCase() !== 'message' ? subject : '';
}

function getRecentConversationId(message: UserMessage, currentUserId: string): string {
  if (message.threadType && message.threadType !== 'direct' && message.threadId) {
    return message.threadId;
  }

  return message.senderAccountId === currentUserId ? message.recipientUserId : message.senderAccountId;
}

function getRecentConversationTitle(message: UserMessage, currentUserId: string): string {
  if (message.threadType && message.threadType !== 'direct') {
    const participantNames = parseRecentConversationList(message.threadParticipantNames).filter((name) => name !== 'You');
    return message.threadTitle || participantNames.join(', ') || (message.threadType === 'district' ? 'District Message' : 'Group Message');
  }

  if (message.senderAccountId === currentUserId) {
    return message.recipientName || message.recipientEmail || 'Recipient';
  }

  return message.senderName || message.senderEmail || 'Sender';
}

function getRecentConversationImage(message: UserMessage, currentUserId: string): string {
  if (message.threadType && message.threadType !== 'direct') {
    return message.threadImageUrl || '';
  }

  return message.senderAccountId === currentUserId
    ? message.recipientProfilePictureUrl || ''
    : message.senderProfilePictureUrl || '';
}

function getRecentConversationDirectParticipantId(message: UserMessage, currentUserId: string): string {
  if (message.threadType && message.threadType !== 'direct') {
    return '';
  }

  return message.senderAccountId === currentUserId ? message.recipientUserId : message.senderAccountId;
}

function getRecentConversationParticipantIds(message: UserMessage, currentUserId: string): string[] {
  const ids = parseRecentConversationList(message.threadParticipantIds)
    .filter((id) => id && id !== currentUserId);

  if (ids.length > 0) {
    return Array.from(new Set(ids));
  }

  return [getRecentConversationDirectParticipantId(message, currentUserId)].filter(Boolean);
}

function getRecentConversationDirectLastSeenAt(message: UserMessage, currentUserId: string): string | null {
  if (message.threadType && message.threadType !== 'direct') {
    return null;
  }

  return message.senderAccountId === currentUserId
    ? message.recipientLastSeenAt || null
    : message.senderLastSeenAt || null;
}

function getRecentConversationSubtitle(message: UserMessage, currentUserId: string): string {
  const prefix = message.senderAccountId === currentUserId ? 'You: ' : '';
  const deletedText = message.isDeleted ? 'Message deleted' : '';
  const bodyText = deletedText || message.body || normalizeRecentConversationSubject(message.subject) || 'No preview';
  return `${prefix}${bodyText}`.replace(/\s+/gu, ' ').trim();
}

function buildRecentConversations(messages: UserMessage[], currentUserId: string): RecentConversation[] {
  const threadMap = new Map<string, RecentConversation>();
  const sortedMessages = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  sortedMessages.forEach((message) => {
    const id = getRecentConversationId(message, currentUserId);
    if (!id) {
      return;
    }

    const existingConversation = threadMap.get(id);
    const unreadIncrement = message.recipientUserId === currentUserId && !message.isRead ? 1 : 0;
    const subtitle = getRecentConversationSubtitle(message, currentUserId);
    const unreadMessageIds = unreadIncrement > 0
      ? [...(existingConversation?.unreadMessageIds || []), message.id]
      : existingConversation?.unreadMessageIds || [];
    const nextConversation: RecentConversation = {
      id,
      title: getRecentConversationTitle(message, currentUserId),
      subtitle,
      imageUrl: getRecentConversationImage(message, currentUserId),
      threadType: message.threadType || 'direct',
      directParticipantId: getRecentConversationDirectParticipantId(message, currentUserId),
      directLastSeenAt: getRecentConversationDirectLastSeenAt(message, currentUserId),
      threadParticipantIds: getRecentConversationParticipantIds(message, currentUserId),
      latestMessage: message,
      unreadPreview: unreadIncrement > 0 ? subtitle : existingConversation?.unreadPreview || '',
      unreadCount: (existingConversation?.unreadCount || 0) + unreadIncrement,
      unreadMessageIds,
    };
    threadMap.set(id, nextConversation);
  });

  return Array.from(threadMap.values())
    .sort((a, b) => {
      if (a.unreadCount !== b.unreadCount) {
        return b.unreadCount - a.unreadCount;
      }

      return new Date(b.latestMessage?.createdAt || 0).getTime() - new Date(a.latestMessage?.createdAt || 0).getTime();
    })
    .slice(0, 5);
}

function isRecentConversationOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) {
    return false;
  }

  const value = new Date(lastSeenAt).getTime();
  return !Number.isNaN(value) && Date.now() - value < 2 * 60 * 1000;
}

function isRecentConversationAway(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) {
    return false;
  }

  const value = new Date(lastSeenAt).getTime();
  if (Number.isNaN(value)) {
    return false;
  }

  const diff = Date.now() - value;
  return diff >= 2 * 60 * 1000 && diff < 5 * 60 * 1000;
}

function getRecentConversationPresence(
  conversation: RecentConversation,
  presenceByAccount: Record<string, RecentPresenceState>,
) {
  const realtime = conversation.directParticipantId ? presenceByAccount[conversation.directParticipantId] : null;
  const online = realtime ? realtime.online : isRecentConversationOnline(conversation.directLastSeenAt);
  const away = realtime ? realtime.away : !online && isRecentConversationAway(conversation.directLastSeenAt);
  const status = realtime?.status || (away ? 'away' : online ? 'active' : 'active');

  if (realtime && status === 'busy') {
    return {
      label: 'Busy',
      dotClass: 'bg-red-500',
      ringClass: 'ring-red-300/70 shadow-[0_0_0_1px_rgba(239,68,68,0.18)]',
      pulseClass: 'border-red-300/50',
      showPulse: true,
    };
  }

  if ((realtime && status === 'away') || away) {
    return {
      label: 'Away',
      dotClass: 'bg-amber-400',
      ringClass: 'ring-amber-300/80 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]',
      pulseClass: 'border-amber-300/70',
      showPulse: true,
    };
  }

  if (online) {
    return {
      label: 'Active',
      dotClass: 'bg-green-500',
      ringClass: 'ring-green-400/60 shadow-[0_0_0_1px_rgba(34,197,94,0.12)]',
      pulseClass: 'border-green-400/45',
      showPulse: true,
    };
  }

  return {
    label: 'Offline',
    dotClass: 'bg-gray-400',
    ringClass: 'ring-gray-300/60 dark:ring-gray-600/60',
    pulseClass: '',
    showPulse: false,
  };
}

function getRelativeActivityText(lastSeenAt: string | null): string {
  if (!lastSeenAt) {
    return 'Not seen recently';
  }

  const seenAt = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seenAt)) {
    return 'Not seen recently';
  }

  const diffMs = Date.now() - seenAt;
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) {
    return 'Just now';
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(lastSeenAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function getRecentConversationActivityText(
  conversation: RecentConversation,
  presence: {
    label: string;
    dotClass: string;
  } | null,
) {
  if (!conversation.directParticipantId || !presence) {
    return conversation.threadType === 'direct' ? 'Direct message' : 'Group conversation';
  }

  if (presence.label === 'Active' || presence.label === 'Busy') {
    return presence.label;
  }

  if (presence.label === 'Away' && conversation.directLastSeenAt) {
    return `Away - ${getRelativeActivityText(conversation.directLastSeenAt)}`;
  }

  return conversation.directLastSeenAt
    ? `${presence.label} - ${getRelativeActivityText(conversation.directLastSeenAt)}`
    : presence.label;
}

function RecentConversationsDock({
  conversations,
  isCollapsed,
  currentUser,
  quickReplyConversationId,
  presenceByAccount,
  typingByConversation,
  onOpenConversation,
  onMarkRead,
  onReply,
  onQuickReplyClose,
  onQuickReplySent,
  onCompose,
  onToggleCollapsed,
  onToast,
}: {
  conversations: RecentConversation[];
  isCollapsed: boolean;
  currentUser: AuthAccount | null;
  quickReplyConversationId: string | null;
  presenceByAccount: Record<string, RecentPresenceState>;
  typingByConversation: Record<string, RecentTypingState>;
  onOpenConversation: (conversation: RecentConversation) => void;
  onMarkRead: (conversation: RecentConversation) => void;
  onReply: (conversation: RecentConversation) => void;
  onQuickReplyClose: () => void;
  onQuickReplySent: (conversation: RecentConversation) => void;
  onCompose: () => void;
  onToggleCollapsed: () => void;
  onToast: (type: ToastType, message: string, options?: { saveToNotifications?: boolean }) => void;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversation: RecentConversation } | null>(null);
  const [conversationImageLoadFailed, setConversationImageLoadFailed] = useState<Record<string, boolean>>({});

  const openContextMenu = (event: ReactMouseEvent, conversation: RecentConversation) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 180),
      conversation,
    });
  };

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [contextMenu]);

  return (
    <aside
      className="pointer-events-none fixed bottom-5 right-5 z-40 hidden flex-col items-end gap-2 md:flex"
      aria-label={isCollapsed ? 'Recent conversations collapsed' : 'Recent conversations'}
    >
      <div
        data-no-global-context-menu="true"
        className={`pointer-events-auto theme-polished-surface flex flex-col items-center overflow-visible rounded-full border border-white/25 bg-white/70 shadow-2xl shadow-black/10 backdrop-blur-xl transition-all duration-300 ease-out dark:border-white/10 dark:bg-slate-900/70 ${
          isCollapsed ? 'max-h-[3.25rem] gap-0 p-1.5' : 'max-h-[28rem] gap-2 p-2'
        }`}
      >
        <button
          type="button"
          onClick={onCompose}
          tabIndex={isCollapsed ? -1 : 0}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-sm transition-all duration-300 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
            isCollapsed ? 'pointer-events-none -mb-11 translate-y-6 scale-75 opacity-0' : 'mb-0 translate-y-0 scale-100 opacity-100'
          }`}
          aria-label="Start new message"
          title="New Message"
          aria-hidden={isCollapsed}
        >
          <Plus size={22} />
        </button>
        {conversations.map((conversation) => {
          const typing = typingByConversation[conversation.id];
          const previewText = conversation.unreadPreview || conversation.subtitle || 'New message';
          const isQuickReplyOpen = quickReplyConversationId === conversation.id;
          const shouldShowPreview = conversation.unreadCount > 0 && !isQuickReplyOpen;
          const presence = conversation.threadType === 'direct'
            ? getRecentConversationPresence(conversation, presenceByAccount)
            : null;
          const activityText = getRecentConversationActivityText(conversation, presence);
          return (
            <div
              key={conversation.id}
              className={`group/recent relative flex items-center transition-all duration-300 ease-out ${
                isCollapsed ? 'pointer-events-none -mb-12 translate-y-8 scale-75 opacity-0' : 'mb-0 translate-y-0 scale-100 opacity-100'
              }`}
              aria-hidden={isCollapsed}
              onContextMenu={(event) => openContextMenu(event, conversation)}
            >
              {shouldShowPreview && (
                <button
                  type="button"
                  onClick={() => onReply(conversation)}
                  tabIndex={isCollapsed ? -1 : 0}
                  className="recent-message-preview-pop recent-message-preview-pop--arrow recent-message-preview-pop--modern absolute right-14 z-20 w-64 rounded-2xl px-4 py-2 text-left backdrop-blur-xl transition duration-200 hover:scale-[1.03] hover:-translate-x-1 hover:shadow-[0_22px_55px_rgba(15,23,42,0.3)]"
                  aria-label={`Reply to latest message from ${conversation.title}`}
                >
                  <span className="block truncate text-xs font-black text-primary-500 dark:text-blue-100">{conversation.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    <span className="truncate">{previewText}</span>
                  </span>
                  {presence && (
                    <span className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                      <span className={`h-1.5 w-1.5 rounded-full ${presence.dotClass}`} />
                      <span className="truncate">{activityText}</span>
                    </span>
                  )}
                  {!presence && activityText && (
                    <span className="mt-1 block truncate text-[10px] font-semibold text-gray-500 dark:text-gray-400">{activityText}</span>
                  )}
                  <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-accent">Quick reply</span>
                </button>
              )}
              {isQuickReplyOpen && currentUser && (
                <RecentMessageReplyPopover
                  key={conversation.id}
                  currentUser={currentUser}
                  conversation={conversation}
                  onClose={onQuickReplyClose}
                  onSent={() => onQuickReplySent(conversation)}
                  onToast={onToast}
                />
              )}
              {conversation.unreadCount === 0 && !typing && (
                <span className="pointer-events-none absolute right-14 max-w-56 translate-x-2 rounded-md border border-gray-200 bg-white/95 px-3 py-1.5 text-xs text-primary-500 opacity-0 shadow-xl transition duration-200 group-hover/recent:translate-x-0 group-hover/recent:opacity-100 dark:border-gray-800 dark:bg-gray-900 dark:text-blue-100">
                  <span className="block truncate font-black">{conversation.title}</span>
                  {activityText && (
                    <span className="mt-0.5 block truncate text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                      {activityText}
                    </span>
                  )}
                </span>
              )}
              {(() => {
                  const conversationAvatarErrorKey = `${conversation.id}:${conversation.imageUrl || ''}`;

                return (
                  <button
                    type="button"
                    onClick={() => onOpenConversation(conversation)}
                    onContextMenu={(event) => openContextMenu(event, conversation)}
                    tabIndex={isCollapsed ? -1 : 0}
                    className={`group relative flex h-12 w-12 items-center justify-center rounded-full bg-primary-500 text-sm font-black text-white shadow-sm ring-2 transition hover:-translate-x-1 hover:scale-105 hover:ring-accent ${typing ? 'ring-accent shadow-[0_0_0_4px_rgba(37,99,235,0.12)]' : presence?.ringClass || 'ring-white dark:ring-gray-900'}`}
                    aria-label={`Open conversation with ${conversation.title}${typing ? ', typing' : presence ? `, ${presence.label}` : ''}`}
                    title={`${conversation.title}${typing ? ' - typing' : presence ? ` - ${presence.label}` : ''}${conversation.subtitle ? ` - ${conversation.subtitle}` : ''}`}
                  >
                    {conversation.imageUrl && !conversationImageLoadFailed[conversationAvatarErrorKey] ? (
                      <img
                        src={getAssetThumbnailUrl(conversation.imageUrl, 96)}
                        alt=""
                        onError={(event) => {
                          const image = event.currentTarget;
                          const fallbackUrl = getAssetUrl(conversation.imageUrl);

                          if (fallbackUrl && image.src !== fallbackUrl) {
                            image.src = fallbackUrl;
                            return;
                          }

                          setConversationImageLoadFailed((previous) => {
                            if (previous[conversationAvatarErrorKey]) {
                              return previous;
                            }

                            return {
                              ...previous,
                              [conversationAvatarErrorKey]: true,
                            };
                          });
                        }}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : conversation.threadType !== 'direct' ? (
                      <Users size={19} />
                    ) : (
                      getInitials(conversation.title)
                    )}
                    {presence && !typing && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-white dark:border-gray-900 dark:bg-gray-900">
                        {presence.showPulse && <span className={`absolute inset-[-0.2rem] rounded-full border shield-online-pulse ${presence.pulseClass}`} />}
                        <span className={`relative h-2.5 w-2.5 rounded-full ${presence.dotClass}`} />
                      </span>
                    )}
                    {typing && (
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-accent p-0.5 text-white dark:border-gray-900">
                        <span className="flex gap-0.5">
                          <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                          <span className="h-1 w-1 rounded-full bg-white animate-pulse [animation-delay:120ms]" />
                          <span className="h-1 w-1 rounded-full bg-white animate-pulse [animation-delay:240ms]" />
                        </span>
                      </span>
                    )}
                    {conversation.unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-danger px-1 text-[10px] font-black text-white dark:border-gray-900">
                        {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })()}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 transition duration-300 hover:border-accent hover:text-accent dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          aria-label={isCollapsed ? 'Show recent conversations' : 'Collapse recent conversations'}
          title={isCollapsed ? 'Show Recent Conversations' : 'Collapse Recent Conversations'}
        >
          <ChevronDown className={`transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} size={16} />
        </button>
      </div>
      {contextMenu && (
        <div
          className="quick-launch-context-menu pointer-events-auto fixed z-[90] w-52 overflow-hidden rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
            onClick={() => {
              onOpenConversation(contextMenu.conversation);
              setContextMenu(null);
            }}
          >
            Open conversation
          </button>
          <button
            type="button"
            disabled={contextMenu.conversation.unreadCount === 0}
            className="quick-launch-context-menu-item text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200"
            onClick={() => {
              onMarkRead(contextMenu.conversation);
              setContextMenu(null);
            }}
          >
            Mark read
          </button>
          <button
            type="button"
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
            onClick={() => {
              onReply(contextMenu.conversation);
              setContextMenu(null);
            }}
          >
            Quick reply
          </button>
          <button
            type="button"
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
            onClick={() => {
              onCompose();
              setContextMenu(null);
            }}
          >
            New message
          </button>
          <button
            type="button"
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
            onClick={() => {
              onToggleCollapsed();
              setContextMenu(null);
            }}
          >
            {isCollapsed ? 'Expand dock' : 'Collapse dock'}
          </button>
        </div>
      )}
    </aside>
  );
}

function RecentMessageComposerPopup({
  currentUser,
  onClose,
  onSent,
  onToast,
}: {
  currentUser: AuthAccount;
  onClose: () => void;
  onSent: () => void;
  onToast: (type: ToastType, message: string, options?: { saveToNotifications?: boolean }) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<User | null>(null);
  const [body, setBody] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let isMounted = true;
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      userService.search(term)
        .then((response) => {
          if (!isMounted) return;
          setResults(response.data.filter((user: User) => user.id !== currentUser.id).slice(0, 8));
        })
        .catch((error) => {
          console.error('Recent message recipient search failed:', error);
          if (isMounted) setResults([]);
        })
        .finally(() => {
          if (isMounted) setIsSearching(false);
        });
    }, 220);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [currentUser.id, query]);

  const sendQuickMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRecipient) {
      onToast('error', 'Choose a recipient first.', { saveToNotifications: false });
      return;
    }

    const text = body.trim();
    if (!text) {
      onToast('error', 'Enter a message.', { saveToNotifications: false });
      return;
    }

    setIsSending(true);
    try {
      await messageService.resolveRecipient(selectedRecipient.id);
      await messageService.send({
        senderAccountId: currentUser.id,
        recipientUserId: selectedRecipient.id,
        subject: 'Message',
        body: text,
      });
      onSent();
      onToast('success', `Message sent to ${`${selectedRecipient.firstName || ''} ${selectedRecipient.lastName || ''}`.trim() || selectedRecipient.email}.`, { saveToNotifications: false });
      onClose();
    } catch (error) {
      console.error('Recent message send failed:', error);
      errorLogService.createClientLog({
        level: 'error',
        message: 'Recent message popup send failed',
        route: window.location.pathname,
        context: JSON.stringify({
          area: 'messages',
          action: 'recent-compose-send',
          currentUserId: currentUser.id,
          recipientId: selectedRecipient.id,
          recipientEmail: selectedRecipient.email,
          bodyLength: text.length,
          error: getErrorMessage(error, 'Failed to send message.'),
        }, null, 2),
      }).catch((logError) => console.error('Failed to write recent message diagnostic:', logError));
      onToast('error', getErrorMessage(error, 'Failed to send message.'), { saveToNotifications: false });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="fixed bottom-5 right-[5.4rem] z-50 hidden w-[min(20rem,calc(100vw-2rem))] md:block" aria-label="Quick new message">
      <form onSubmit={sendQuickMessage} className="quick-launch-context-menu overflow-hidden rounded-lg border border-gray-200 bg-white p-2.5 shadow-2xl ring-1 ring-black/5 dark:border-gray-800 dark:bg-gray-950 dark:ring-white/10">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-black uppercase text-primary-500 dark:text-blue-100">New Message</span>
            <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900" aria-label="Close quick message" title="Close">
              <X size={15} />
            </button>
          </div>

          {selectedRecipient ? (
            <div className="flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/10 p-2">
              {selectedRecipient.profilePictureUrl ? (
                <img
                  src={getAssetThumbnailUrl(selectedRecipient.profilePictureUrl, 96)}
                  alt=""
                  onError={(event) => handleAssetThumbnailError(event, selectedRecipient.profilePictureUrl)}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[11px] font-black text-accent dark:bg-gray-950">
                  {getInitials(`${selectedRecipient.firstName || ''} ${selectedRecipient.lastName || ''}`, selectedRecipient.email)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-gray-900 dark:text-gray-100">{`${selectedRecipient.firstName || ''} ${selectedRecipient.lastName || ''}`.trim() || selectedRecipient.email}</p>
                <p className="truncate text-[11px] font-semibold text-gray-500 dark:text-gray-400">{selectedRecipient.email || selectedRecipient.peNumber}</p>
              </div>
              <button type="button" onClick={() => setSelectedRecipient(null)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-white/70 dark:hover:bg-gray-900" aria-label="Change recipient" title="Change">
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search recipient"
                  className="global-search-input w-full rounded-lg border border-gray-300 bg-white py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                  autoFocus
                />
              </div>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
                {isSearching ? (
                  <div className="px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Searching...</div>
                ) : results.length === 0 ? (
                  <div className="px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">{query.trim().length < 2 ? 'Type at least 2 characters.' : 'No people found.'}</div>
                ) : (
                  results.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedRecipient(user);
                        setQuery('');
                        setResults([]);
                      }}
                      className="flex w-full items-center gap-2 border-b border-gray-100 px-2.5 py-2 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
                    >
                      {user.profilePictureUrl ? (
                        <img src={getAssetThumbnailUrl(user.profilePictureUrl, 96)} alt="" onError={(event) => handleAssetThumbnailError(event, user.profilePictureUrl)} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-[11px] font-black text-accent">{getInitials(`${user.firstName || ''} ${user.lastName || ''}`, user.email)}</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-gray-800 dark:text-gray-100">{`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}</span>
                        <span className="block truncate text-[11px] font-semibold text-gray-500">{user.email || user.peNumber}</span>
                      </span>
                      {user.receivesMessages === false && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black text-danger dark:bg-red-950">OFF</span>}
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Message"
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-[16px] leading-5 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-gray-700 dark:bg-gray-900 sm:text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-semibold text-gray-400">{isSending ? 'Sending...' : selectedRecipient ? selectedRecipient.email || 'Ready' : 'Choose recipient'}</span>
            <button
              type="submit"
              disabled={isSending || !selectedRecipient || !body.trim()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-55"
              aria-label="Send message"
              title="Send"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}

function RecentMessageReplyPopover({
  currentUser,
  conversation,
  onClose,
  onSent,
  onToast,
}: {
  currentUser: AuthAccount;
  conversation: RecentConversation;
  onClose: () => void;
  onSent: () => void;
  onToast: (type: ToastType, message: string, options?: { saveToNotifications?: boolean }) => void;
}) {
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendState, setSendState] = useState<'composing' | 'sent' | 'closing'>('composing');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const previewText = conversation.unreadPreview || conversation.subtitle || 'No preview available';

  useEffect(() => {
    if (sendState !== 'composing') {
      return undefined;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [conversation.id, sendState]);

  useEffect(() => {
    if (sendState !== 'sent') {
      return undefined;
    }

    const closeStartTimer = window.setTimeout(() => setSendState('closing'), 1600);
    const closeTimer = window.setTimeout(onClose, 2100);
    return () => {
      window.clearTimeout(closeStartTimer);
      window.clearTimeout(closeTimer);
    };
  }, [onClose, sendState]);

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = body.trim();

    if (!text) {
      onToast('error', 'Enter a reply.', { saveToNotifications: false });
      return;
    }

    setIsSending(true);
    try {
      if (conversation.threadType !== 'direct') {
        const recipientUserIds = conversation.threadParticipantIds.filter((id) => id && id !== currentUser.id);
        if (recipientUserIds.length === 0) {
          throw new Error('No recipients found for this thread.');
        }

        await messageService.sendGroup({
          senderAccountId: currentUser.id,
          recipientUserIds,
          subject: conversation.latestMessage?.subject || conversation.title || 'Message',
          body: text,
          audienceType: conversation.threadType === 'district' ? 'district' : 'group',
          threadId: conversation.id,
          threadTitle: conversation.latestMessage?.threadTitle || conversation.title,
        });
      } else {
        await messageService.resolveRecipient(conversation.directParticipantId);
        await messageService.send({
          senderAccountId: currentUser.id,
          recipientUserId: conversation.directParticipantId,
          subject: conversation.latestMessage?.subject || 'Message',
          body: text,
        });
      }

      const unreadMessageIds = conversation.unreadMessageIds.filter(Boolean);
      if (unreadMessageIds.length > 0) {
        await Promise.all(unreadMessageIds.map((messageId) => messageService.markRead(messageId, currentUser.id)));
      }

      onSent();
      setBody('');
      setSendState('sent');
    } catch (error) {
      console.error('Recent message reply failed:', error);
      errorLogService.createClientLog({
        level: 'error',
        message: 'Recent message quick reply failed',
        route: window.location.pathname,
        context: JSON.stringify({
          area: 'messages',
          action: 'recent-quick-reply',
          currentUserId: currentUser.id,
          conversationId: conversation.id,
          threadType: conversation.threadType,
          bodyLength: text.length,
          error: getErrorMessage(error, 'Failed to send reply.'),
        }, null, 2),
      }).catch((logError) => console.error('Failed to write quick reply diagnostic:', logError));
      onToast('error', getErrorMessage(error, 'Failed to send reply.'), { saveToNotifications: false });
    } finally {
      setIsSending(false);
    }
  };

  const sendOnEnter = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (!isSending && body.trim()) {
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form
      onSubmit={sendReply}
      className={`recent-message-preview-pop recent-message-preview-pop--arrow recent-message-preview-pop--modern absolute right-14 z-30 w-80 rounded-2xl text-left shadow-[0_22px_55px_rgba(15,23,42,0.28)] backdrop-blur-xl transition duration-500 ${sendState === 'closing' ? 'translate-x-2 scale-95 opacity-0' : 'translate-x-0 scale-100 opacity-100'} ${sendState === 'composing' ? 'p-3' : 'px-3 py-2'}`}
      aria-label="Quick reply"
    >
      {sendState !== 'composing' ? (
        <div className="flex items-center justify-center gap-2 text-center">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500 text-white shadow-md shadow-green-900/20">
            <CheckCircle2 size={18} />
          </span>
          <span>
            <span className="block text-sm font-black text-gray-900 dark:text-gray-100">Message Sent</span>
            <span className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400">{conversation.title}</span>
          </span>
        </div>
      ) : (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-black text-primary-500 dark:text-blue-100">{conversation.title}</span>
            <span className="mt-0.5 block line-clamp-2 text-xs font-semibold text-gray-600 dark:text-gray-300">{previewText}</span>
          </div>
          <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-gray-900/70" aria-label="Close quick reply" title="Close">
            <X size={15} />
          </button>
        </div>

        <div className="flex items-end gap-2">
          <MentionTextarea
            ref={inputRef}
            value={body}
            onChange={(value) => setBody(value.slice(0, 1200))}
            wrapperClassName="min-w-0 flex-1"
            onKeyDown={sendOnEnter}
            placeholder="Reply..."
            rows={2}
            maxLength={1200}
            className="min-h-14 resize-none rounded-xl border border-gray-300 bg-white/90 px-3 py-2 text-[16px] leading-5 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 dark:border-gray-700 dark:bg-gray-900/90 sm:text-sm"
          />
          <button
            type="submit"
            disabled={isSending || !body.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-55"
            aria-label="Send reply"
            title="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      )}
    </form>
  );
}

function formatConnectionTime(value: number | null): string {
  return value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Unknown';
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

function ShieldLoading({
  title = `Loading ${DEFAULT_APP_NAME}`,
  detail,
  steps = [],
  lastConnectedAt,
  brandLogoDataUrl = '',
  appName = DEFAULT_APP_NAME,
}: {
  title?: string;
  detail?: string;
  steps?: Array<{ label: string; status: 'active' | 'complete' | 'warning' | 'waiting'; detail?: string }>;
  lastConnectedAt?: number | null;
  brandLogoDataUrl?: string;
  appName?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center">
        <div className="shield-app-icon-loader mx-auto mb-4">
          <img src={getBrandLogoSrc(brandLogoDataUrl)} alt={appName} />
        </div>
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-accent">{title}</p>
        <div className="shield-loading-bar mx-auto mt-4" aria-hidden="true">
          <span />
        </div>
        {detail && <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-gray-400">{detail}</p>}
        {steps.length > 0 && (
          <div className="mx-auto mt-5 w-80 max-w-[82vw] rounded-lg border border-gray-200 bg-white/80 p-3 text-left shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
            {steps.map((step) => (
              <div key={step.label} className="flex items-start gap-3 py-1.5">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    step.status === 'complete'
                      ? 'bg-green-500'
                      : step.status === 'warning'
                        ? 'bg-amber-500'
                        : step.status === 'active'
                          ? 'animate-pulse bg-accent'
                          : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-black uppercase tracking-[0.12em] text-gray-600 dark:text-gray-300">{step.label}</span>
                  {step.detail && <span className="mt-0.5 block wrap-anywhere text-xs text-gray-500 dark:text-gray-400">{step.detail}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        {lastConnectedAt && (
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
            Last connected {formatConnectionTime(lastConnectedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function ConnectionLostOverlay({ lastConnectedAt, appName }: { lastConnectedAt: number | null; appName: string }) {
  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-gray-950/72 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white p-6 text-center shadow-[0_28px_80px_rgba(15,23,42,0.45)] dark:bg-gray-950">
        <div className="shield-loader mx-auto mb-4">
          <Shield size={70} />
        </div>
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-danger">Connection Lost</p>
        <h2 className="mt-2 text-2xl font-bold text-primary-500 dark:text-blue-100">Reconnecting...</h2>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
          {appName} cannot reach the API right now. Your session is being kept open while we try again.
        </p>
        <p className="mt-4 rounded bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:bg-gray-900 dark:text-gray-400">
          Last connected {formatConnectionTime(lastConnectedAt)}
        </p>
      </div>
    </div>
  );
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
          'flex h-10 items-center rounded px-3 text-sm font-semibold transition',
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
        className="mx-auto flex h-11 w-11 items-center justify-center rounded bg-white/10 text-white hover:bg-white/20"
        title="Search"
      >
        <Search size={20} />
      </button>
    );
  }

  return (
    <form data-onboarding-target="global-search" onSubmit={handleSubmit} className="relative flex gap-2">
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

function getInitialCalculatorPosition() {
  return { x: Math.max(12, window.innerWidth - 400), y: 112 };
}

function CalculatorModal({ isClosing, onClose, onFocus, zIndex }: { isClosing: boolean; onClose: () => void; onFocus: () => void; zIndex: number }) {
  const [display, setDisplay] = useState('0');
  const calculatorRef = useRef<HTMLDivElement | null>(null);
  const buttons = ['C', '(', ')', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'DEL', '='];
  const visibleDisplay = display.replace(/\*/gu, 'x');
  const expressionPreview = display === 'Error' ? 'Check expression' : visibleDisplay;

  const appendValue = useCallback((value: string) => {
    if (value === 'C') {
      setDisplay('0');
      return;
    }

    if (value === 'DEL') {
      setDisplay((current) => current.slice(0, -1) || '0');
      return;
    }

    if (value === '=') {
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
    <FloatingWindow
      animationVariant="mac"
      className="pointer-events-auto fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-white p-3 shadow-2xl outline-none ring-1 ring-gray-200 transition-shadow focus:ring-2 focus:ring-accent dark:bg-gray-900 dark:ring-gray-800 md:inset-auto md:block md:h-auto md:w-[calc(100vw-1.5rem)] md:max-w-[23rem] md:rounded-lg md:p-4"
      fallbackSize={{ width: 368, height: 500 }}
      initialPosition={getInitialCalculatorPosition}
      isClosing={isClosing}
      onFocus={() => {
        onFocus();
        calculatorRef.current?.focus();
      }}
      windowAttributes={{ tabIndex: 0, onKeyDown: handleKeyDown }}
      windowRef={calculatorRef}
      zIndex={zIndex}
    >
      {({ dragHandleProps, isDragging }) => (
      <>
        <div
          {...dragHandleProps}
          className={`mb-3 flex select-none items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800 md:touch-none md:cursor-grab ${isDragging ? 'md:cursor-grabbing' : ''}`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-accent/25 bg-accent/10 text-accent shadow-sm">
              <Calculator size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">Calculator</h2>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">Keyboard input supported</p>
            </div>
          </div>
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} className="icon-close-button" aria-label="Close calculator" title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-950 px-4 py-4 text-right shadow-inner dark:border-gray-800">
          <div className="min-h-5 truncate text-xs font-bold uppercase text-gray-400">
            {expressionPreview}
          </div>
          <div className="mt-2 min-h-12 overflow-hidden text-ellipsis whitespace-nowrap text-4xl font-black tabular-nums text-white">
            {visibleDisplay}
          </div>
        </div>

        <div className="grid flex-1 content-end grid-cols-4 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-950 md:flex-none md:content-normal">
          {buttons.map((button) => (
            <button
              key={button}
              type="button"
              onClick={() => {
                if (button === '=') {
                  calculate();
                  return;
                }
                appendValue(button);
              }}
              className={`flex h-14 items-center justify-center rounded-lg border text-lg font-black shadow-sm transition active:translate-y-px ${
                ['/', '*', '-', '+', '='].includes(button)
                  ? 'border-primary-500 bg-primary-500 text-white hover:bg-primary-600'
                  : button === 'C'
                    ? 'border-red-200 bg-red-50 text-danger hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                    : ['(', ')', 'DEL'].includes(button)
                      ? 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                      : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800'
              }`}
              aria-label={button === 'DEL' ? 'Delete last digit' : button === '=' ? 'Calculate result' : `Calculator ${button}`}
              title={button === 'DEL' ? 'Delete' : button === '=' ? 'Calculate' : button}
            >
              {button === '*' ? 'x' : button === 'DEL' ? <Delete size={20} /> : button}
            </button>
          ))}
        </div>
      </>
      )}
    </FloatingWindow>
  );
}

function QuickLaunchTray({
  isAdministrator,
  permissions,
  isSidebarCollapsed,
  badgeCounts,
  activeModalApps,
  storageKey,
  accountId,
  showCalendar,
  slotCount,
  placement,
  onOpenMessages,
  onOpenCalendar,
  onOpenCalculator,
  onOpenCreateUser,
  onQuickLaunchHiddenChange,
  onQuickLaunchPlacementChange,
  onQuickLaunchSlotCountChange,
}: {
  isAdministrator: boolean;
  permissions: string[];
  isSidebarCollapsed: boolean;
  badgeCounts: Partial<Record<QuickLaunchAppId, number>>;
  activeModalApps: QuickLaunchAppId[];
  storageKey: string;
  accountId?: string;
  showCalendar: boolean;
  slotCount: number;
  placement: QuickLaunchPlacement;
  onOpenMessages: () => void;
  onOpenCalendar: () => void;
  onOpenCalculator: () => void;
  onOpenCreateUser: () => void;
  onQuickLaunchHiddenChange: (hideQuickLaunch: boolean) => void;
  onQuickLaunchPlacementChange: (placement: QuickLaunchPlacement) => void;
  onQuickLaunchSlotCountChange: (slotCount: number) => void;
}) {
  const normalizedSlotCount = normalizeQuickLaunchSlotCount(slotCount);
  const isSidebarPlacement = placement === 'sidebar';
  const navigate = useNavigate();
  const location = useLocation();
  const [slots, setSlots] = useState<QuickLaunchSlot[]>(() => getEmptyQuickLaunchSlots(normalizedSlotCount));
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [launchingSlot, setLaunchingSlot] = useState<number | null>(null);
  const [failedLaunchSlot, setFailedLaunchSlot] = useState<number | null>(null);
  const [isPickerClosing, setIsPickerClosing] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<Array<{ key: string; left: number; top: number }>>([]);
  const [sidebarTooltip, setSidebarTooltip] = useState<{ label: string; left: number; top: number } | null>(null);
  const didDragSlotRef = useRef(false);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const slotAnimationRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previousSlotRectsRef = useRef<Record<string, DOMRect> | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const pickerCloseTimerRef = useRef<number | null>(null);
  const indicatorRemeasureTimersRef = useRef<number[]>([]);
  const [pickerPosition, setPickerPosition] = useState<{ left: number; top: number; arrowLeft: number } | null>(null);
  const [externalLabel, setExternalLabel] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const canUseQuickLaunchApp = (app: QuickLaunchApp) => {
    if (app.id === 'calendar' && !showCalendar) {
      return false;
    }

    if (app.requiredPermission && !isAdministrator && !permissionSet.has(app.requiredPermission)) {
      return false;
    }

    if (app.id === 'create-user' && !isAdministrator && (!permissionSet.has('admin:access') || !permissionSet.has('users:create'))) {
      return false;
    }

    if (app.id === 'audit' && !isAdministrator && (!permissionSet.has('admin:access') || !permissionSet.has('audit:view'))) {
      return false;
    }

    if (app.id === 'permissions' && !isAdministrator && (!permissionSet.has('admin:access') || !permissionSet.has('roles:manage'))) {
      return false;
    }

    return !app.adminOnly || isAdministrator;
  };
  const availableApps = useMemo(() => quickLaunchApps.filter(canUseQuickLaunchApp), [isAdministrator, permissionSet, showCalendar]);
  const usedAppIds = new Set(
    slots
      .map((slot, index) => (index === editingSlot ? null : slot))
      .filter((slot): slot is QuickLaunchAppId => typeof slot === 'string'),
  );
  const editingExternalSlot = editingSlot !== null && isExternalQuickLaunchSlot(slots[editingSlot]) ? slots[editingSlot] : null;
  const activeModalAppSet = useMemo(() => new Set(activeModalApps), [activeModalApps]);

  useEffect(() => {
    if (editingExternalSlot) {
      setExternalLabel(editingExternalSlot.label);
      setExternalUrl(editingExternalSlot.url);
      return;
    }

    setExternalLabel('');
    setExternalUrl('');
  }, [editingExternalSlot]);

  useEffect(() => {
    if (editingSlot !== null && editingSlot >= normalizedSlotCount) {
      setEditingSlot(null);
      setIsPickerClosing(false);
      setExternalLabel('');
      setExternalUrl('');
    }

    if (contextMenu && contextMenu.index >= normalizedSlotCount) {
      setContextMenu(null);
    }

    if (draggingSlot !== null && draggingSlot >= normalizedSlotCount) {
      setDraggingSlot(null);
    }

    if (dragOverSlot !== null && dragOverSlot >= normalizedSlotCount) {
      setDragOverSlot(null);
    }

    if (launchingSlot !== null && launchingSlot >= normalizedSlotCount) {
      setLaunchingSlot(null);
    }

    if (failedLaunchSlot !== null && failedLaunchSlot >= normalizedSlotCount) {
      setFailedLaunchSlot(null);
    }
  }, [contextMenu, dragOverSlot, draggingSlot, editingSlot, failedLaunchSlot, launchingSlot, normalizedSlotCount]);

  const isAppActive = (app: QuickLaunchApp) => {
    if (activeModalAppSet.has(app.id)) {
      return true;
    }

    return Boolean(app.path && location.pathname === app.path);
  };

  const openQuickLaunchPicker = (index: number) => {
    if (pickerCloseTimerRef.current !== null) {
      window.clearTimeout(pickerCloseTimerRef.current);
      pickerCloseTimerRef.current = null;
    }

    setIsPickerClosing(false);
    setEditingSlot(index);
  };

  const closeQuickLaunchPicker = useCallback(() => {
    if (editingSlot === null || isPickerClosing) return;

    setIsPickerClosing(true);
    if (pickerCloseTimerRef.current !== null) {
      window.clearTimeout(pickerCloseTimerRef.current);
    }

    pickerCloseTimerRef.current = window.setTimeout(() => {
      setEditingSlot(null);
      setIsPickerClosing(false);
      setExternalLabel('');
      setExternalUrl('');
      pickerCloseTimerRef.current = null;
    }, QUICK_LAUNCH_PICKER_CLOSE_MS);
  }, [editingSlot, isPickerClosing]);

  useEffect(() => () => {
    if (pickerCloseTimerRef.current !== null) {
      window.clearTimeout(pickerCloseTimerRef.current);
    }
    indicatorRemeasureTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
  }, []);

  const saveQuickLaunchSlots = useCallback(async (nextSlots: QuickLaunchSlot[]) => {
    const normalizedSlots = normalizeQuickLaunchSlots(nextSlots, normalizedSlotCount);
    setSlots(normalizedSlots);
    saveLegacyQuickLaunchSlots(storageKey, normalizedSlots, normalizedSlotCount);

    try {
      const response = await quickLaunchService.save(normalizedSlots as ApiQuickLaunchSlot[]);
      const savedSlots = normalizeQuickLaunchSlots(response.data.slots, normalizedSlotCount);
      setSlots(savedSlots);
      saveLegacyQuickLaunchSlots(storageKey, savedSlots, normalizedSlotCount);
    } catch (err) {
      console.error('Failed to save quick launch:', err);
    }
  }, [normalizedSlotCount, storageKey]);

  const loadQuickLaunchFromDatabase = useCallback(async () => {
    if (!accountId) {
      setSlots(getEmptyQuickLaunchSlots(normalizedSlotCount));
      return;
    }

    try {
      const response = await quickLaunchService.get();
      const databaseSlots = normalizeQuickLaunchSlots(response.data.slots, normalizedSlotCount);
      const hasDatabaseSlots = databaseSlots.some(Boolean);

      if (!hasDatabaseSlots) {
        const legacySlots = loadLegacyQuickLaunchSlots(storageKey, normalizedSlotCount);
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
      saveLegacyQuickLaunchSlots(storageKey, databaseSlots, normalizedSlotCount);
    } catch (err) {
      console.error('Failed to load quick launch:', err);
      setSlots(loadLegacyQuickLaunchSlots(storageKey, normalizedSlotCount));
    }
  }, [accountId, normalizedSlotCount, storageKey]);

  useEffect(() => {
    loadQuickLaunchFromDatabase();
  }, [loadQuickLaunchFromDatabase]);

  useEffect(() => {
    window.addEventListener('shield:quick-launch-updated', loadQuickLaunchFromDatabase);
    return () => window.removeEventListener('shield:quick-launch-updated', loadQuickLaunchFromDatabase);
  }, [loadQuickLaunchFromDatabase]);

  useLayoutEffect(() => {
    if (editingSlot === null) {
      setPickerPosition(null);
      return undefined;
    }

    const updatePickerPosition = () => {
      const slot = slotRefs.current[editingSlot];
      if (!slot) return;

      const rect = slot.getBoundingClientRect();
      const slotCenter = rect.left + rect.width / 2;
      const left = Math.min(
        Math.max(QUICK_LAUNCH_PICKER_GUTTER, slotCenter - QUICK_LAUNCH_PICKER_WIDTH / 2),
        Math.max(QUICK_LAUNCH_PICKER_GUTTER, window.innerWidth - QUICK_LAUNCH_PICKER_WIDTH - QUICK_LAUNCH_PICKER_GUTTER),
      );

      setPickerPosition({
        left,
        top: rect.top - 12,
        arrowLeft: slotCenter - left,
      });
    };

    updatePickerPosition();
    window.addEventListener('resize', updatePickerPosition);
    window.addEventListener('scroll', updatePickerPosition, true);

    return () => {
      window.removeEventListener('resize', updatePickerPosition);
      window.removeEventListener('scroll', updatePickerPosition, true);
    };
  }, [editingSlot]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && editingSlot !== null) {
        event.stopImmediatePropagation();
        closeQuickLaunchPicker();
      }
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [closeQuickLaunchPicker, editingSlot]);

  useEffect(() => {
    if (editingSlot === null) {
      return undefined;
    }

    const closePicker = (event: MouseEvent) => {
      if (pickerRef.current?.contains(event.target as Node)) {
        return;
      }

      const activeSlot = slotRefs.current[editingSlot];
      if (activeSlot?.contains(event.target as Node)) {
        return;
      }

      closeQuickLaunchPicker();
    };

    window.addEventListener('mousedown', closePicker);
    return () => window.removeEventListener('mousedown', closePicker);
  }, [closeQuickLaunchPicker, editingSlot]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);

    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [contextMenu]);

  const openSlot = (index: number, slot: NonNullable<QuickLaunchSlot>) => {
    setLaunchingSlot(index);
    setFailedLaunchSlot(null);
    window.setTimeout(() => setLaunchingSlot((currentSlot) => (currentSlot === index ? null : currentSlot)), 650);

    if (isExternalQuickLaunchSlot(slot)) {
      try {
        if (!openExternalAppPopup(slot)) {
          setFailedLaunchSlot(index);
          window.setTimeout(() => setFailedLaunchSlot((currentSlot) => (currentSlot === index ? null : currentSlot)), 2200);
        }
      } catch {
        setFailedLaunchSlot(index);
        window.setTimeout(() => setFailedLaunchSlot((currentSlot) => (currentSlot === index ? null : currentSlot)), 2200);
      }
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
    closeQuickLaunchPicker();
  };

  const removeSlot = (index: number) => {
    const nextSlots = slots.map((currentSlot, slotIndex) => (slotIndex === index ? null : currentSlot));
    void saveQuickLaunchSlots(nextSlots);
    setContextMenu(null);
  };

  const removeAllSlots = () => {
    void saveQuickLaunchSlots(getEmptyQuickLaunchSlots(normalizedSlotCount));
    setContextMenu(null);
    closeQuickLaunchPicker();
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

    previousSlotRectsRef.current = Object.fromEntries(
      Object.entries(slotAnimationRefs.current).flatMap(([key, element]) => {
        if (!element) return [];
        return [[key, element.getBoundingClientRect()]];
      }),
    );

    const nextSlots = [...slots];
    const [movedSlot] = nextSlots.splice(fromIndex, 1);
    nextSlots.splice(toIndex, 0, movedSlot);
    void saveQuickLaunchSlots(nextSlots);
  };

  useLayoutEffect(() => {
    const previousRects = previousSlotRectsRef.current;
    if (!previousRects) return;

    previousSlotRectsRef.current = null;

    Object.entries(previousRects).forEach(([key, previousRect]) => {
      const element = slotAnimationRefs.current[key];
      if (!element) return;

      const nextRect = element.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 500,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        },
      );
    });
  }, [slots]);

  const editContextMenuSlot = () => {
    if (!contextMenu) return;

    openQuickLaunchPicker(contextMenu.index);
    setContextMenu(null);
  };

  const activeQuickLaunchTargets = useMemo(() => {
    const activeTargets = slots.reduce<Array<{ key: string; index: number }>>((targets, slot, index) => {
      if (typeof slot !== 'string') {
        return targets;
      }

      const app = availableApps.find((item) => item.id === slot);
      if (app && isAppActive(app)) {
        targets.push({ key: getQuickLaunchSlotRenderKey(slot, index), index });
      }

      return targets;
    }, []);

    if (launchingSlot !== null && !activeTargets.some((target) => target.index === launchingSlot)) {
      activeTargets.push({
        key: getQuickLaunchSlotRenderKey(slots[launchingSlot], launchingSlot),
        index: launchingSlot,
      });
    }

    return activeTargets.sort((left, right) => left.index - right.index);
  }, [activeModalAppSet, availableApps, launchingSlot, location.pathname, slots]);

  const showSidebarSlotTooltip = (target: HTMLElement, label: string) => {
    if (!isSidebarPlacement || !isSidebarCollapsed) {
      return;
    }

    const rect = target.getBoundingClientRect();
    setSidebarTooltip({
      label,
      left: rect.right + 10,
      top: rect.top + rect.height / 2,
    });
  };

  useLayoutEffect(() => {
    if (activeQuickLaunchTargets.length === 0) {
      setActiveIndicators([]);
      return undefined;
    }

    const updateActiveIndicators = () => {
      const tray = trayRef.current;

      if (!tray) {
        setActiveIndicators([]);
        return;
      }

      const trayRect = tray.getBoundingClientRect();
      const nextIndicators = activeQuickLaunchTargets.flatMap((target) => {
        const slot = slotAnimationRefs.current[target.key] || slotRefs.current[target.index];
        if (!slot) return [];

        const slotRect = slot.getBoundingClientRect();
        return [{
          key: target.key,
          left: slotRect.left - trayRect.left + slotRect.width / 2,
          top: slotRect.bottom - trayRect.top + 6,
        }];
      });

      setActiveIndicators(nextIndicators);
    };

    const scheduleActiveIndicatorRemeasure = () => {
      indicatorRemeasureTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      indicatorRemeasureTimersRef.current = [80, 180, 320, 520].map((delay) => window.setTimeout(updateActiveIndicators, delay));
    };

    updateActiveIndicators();
    const animationFrame = window.requestAnimationFrame(updateActiveIndicators);
    scheduleActiveIndicatorRemeasure();
    window.addEventListener('resize', updateActiveIndicators);
    window.addEventListener('scroll', updateActiveIndicators, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      indicatorRemeasureTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      indicatorRemeasureTimersRef.current = [];
      window.removeEventListener('resize', updateActiveIndicators);
      window.removeEventListener('scroll', updateActiveIndicators, true);
    };
  }, [activeQuickLaunchTargets, isSidebarCollapsed]);

  return (
    <section
      data-no-global-context-menu="true"
      className={isSidebarPlacement
      ? `quick-launch-sidebar-placement pointer-events-none relative hidden select-none md:block ${isSidebarCollapsed ? 'quick-launch-sidebar-collapsed' : ''}`
      : `pointer-events-none fixed bottom-3 left-3 right-3 z-30 hidden select-none transition-all duration-200 sm:bottom-5 sm:right-6 md:block ${isSidebarCollapsed ? 'sm:left-24' : 'sm:left-[19.5rem]'}`
    }>
      <div
        ref={trayRef}
        data-onboarding-target="quick-launch"
        className={`quick-launch-gold-frame quick-launch-tray-enter pointer-events-auto relative max-w-full border border-transparent bg-white/85 p-2 shadow-[0_16px_45px_rgba(15,23,42,0.18)] backdrop-blur dark:bg-gray-950/80 ${
          isSidebarPlacement
            ? 'quick-launch-sidebar-frame w-full rounded-lg'
            : 'mx-auto w-fit rounded-2xl sm:p-3'
        }`}
      >
        <div className={isSidebarPlacement
          ? `quick-launch-sidebar-grid grid max-w-full ${isSidebarCollapsed ? 'grid-cols-1 justify-items-center' : 'grid-cols-4'}`
          : 'flex max-w-full flex-wrap items-center justify-center gap-1.5 sm:gap-2'
        }>
        {slots.map((slot, index) => {
          const slotRenderKey = getQuickLaunchSlotRenderKey(slot, index);
          const app = typeof slot === 'string' ? availableApps.find((item) => item.id === slot) || null : null;
          const isExternal = isExternalQuickLaunchSlot(slot);
          const visibleSlot = app || isExternal ? slot : null;
          const Icon = app?.icon || (isExternal ? ExternalLink : null);
          const label = app?.label || (isExternal ? slot.label : 'Add');
          const badgeCount = app ? badgeCounts[app.id] || 0 : 0;
          const isActive = app ? isAppActive(app) : false;
          const isEditing = editingSlot === index;
          const isLaunching = launchingSlot === index;
          const hasFailedLaunch = failedLaunchSlot === index;
          const previewLabel = visibleSlot ? `Open ${label}` : 'Add app';
          const slotStateClass = visibleSlot
            ? [
                'quick-launch-slot-configured',
                draggingSlot === index ? 'quick-launch-slot-dragging' : '',
                dragOverSlot === index ? 'quick-launch-slot-drop-target' : '',
                isActive ? 'quick-launch-slot-active' : '',
                isEditing ? 'quick-launch-slot-editing' : '',
                isLaunching ? 'quick-launch-slot-launching' : '',
                hasFailedLaunch ? 'quick-launch-slot-failed' : '',
              ].filter(Boolean).join(' ')
            : isEditing
              ? `quick-launch-slot-empty quick-launch-slot-editing ${dragOverSlot === index ? 'quick-launch-slot-drop-target' : ''}`
              : `quick-launch-slot-empty ${dragOverSlot === index ? 'quick-launch-slot-drop-target' : ''}`;

          return (
            <div
              key={slotRenderKey}
              className="quick-launch-slot-shell relative"
              ref={(element) => {
                slotRefs.current[index] = element;
                slotAnimationRefs.current[slotRenderKey] = element;
              }}
              draggable={Boolean(visibleSlot)}
              onDragStart={(event) => {
                if (!visibleSlot) {
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
                setDragOverSlot(index);
              }}
              onDragLeave={() => {
                setDragOverSlot((currentSlot) => (currentSlot === index ? null : currentSlot));
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
                if (!Number.isNaN(sourceIndex)) {
                  moveSlot(sourceIndex, index);
                }
                setDraggingSlot(null);
                setDragOverSlot(null);
              }}
              onDragEnd={() => {
                setDraggingSlot(null);
                setDragOverSlot(null);
                window.setTimeout(() => {
                  didDragSlotRef.current = false;
                }, 0);
              }}
              onMouseEnter={(event) => showSidebarSlotTooltip(event.currentTarget, hasFailedLaunch ? 'Blocked' : isLaunching ? 'Opening' : label)}
              onMouseLeave={() => setSidebarTooltip(null)}
              onFocusCapture={(event) => showSidebarSlotTooltip(event.currentTarget, hasFailedLaunch ? 'Blocked' : isLaunching ? 'Opening' : label)}
              onBlurCapture={() => setSidebarTooltip(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ index, x: event.clientX, y: event.clientY });
              }}
            >
              <button
                type="button"
                draggable={Boolean(visibleSlot)}
                onClick={() => {
                  if (didDragSlotRef.current) {
                    return;
                  }
                  if (visibleSlot) {
                    openSlot(index, visibleSlot);
                    return;
                  }
                  openQuickLaunchPicker(index);
                }}
                onDragStart={(event) => {
                  if (!visibleSlot) {
                    event.preventDefault();
                    return;
                  }

                  didDragSlotRef.current = true;
                  setDraggingSlot(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                className={`quick-launch-slot group ${slotStateClass}`}
                aria-label={visibleSlot ? `Open ${label}` : 'Add quick launch app'}
                aria-pressed={isActive}
              >
                <span className="quick-launch-slot-shine" />
                <span className="quick-launch-slot-icon" aria-hidden="true">
                  {hasFailedLaunch ? <AlertTriangle size={20} /> : Icon ? <Icon size={20} /> : <Plus size={22} />}
                </span>
                <span className="quick-launch-slot-label">{hasFailedLaunch ? 'Blocked' : isLaunching ? 'Opening' : label}</span>
              </button>
              <span className="quick-launch-hover-preview" role="presentation">{previewLabel}</span>

              {badgeCount > 0 && (
                <span key={`quick-launch-badge-${index}-${badgeCount}`} className="quick-launch-badge">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}

              {slot && (
                <button
                  type="button"
                  onClick={() => openQuickLaunchPicker(index)}
                  className={`quick-launch-edit-button ${isEditing ? 'quick-launch-edit-button-active' : ''}`}
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
        {activeIndicators.map((indicator) => (
          <span
            key={`quick-launch-active-indicator-${indicator.key}`}
            className="quick-launch-active-indicator quick-launch-active-indicator-visible"
            style={{
              left: indicator.left,
              top: indicator.top,
            }}
          />
        ))}
      </div>

      {sidebarTooltip && typeof document !== 'undefined' && createPortal(
        <span
          className="sidebar-rail-tooltip sidebar-rail-tooltip-fixed"
          role="tooltip"
          style={{
            left: sidebarTooltip.left,
            top: sidebarTooltip.top,
          }}
        >
          {sidebarTooltip.label}
        </span>,
        document.body,
      )}

      {contextMenu && (
        <div
          className="quick-launch-context-menu pointer-events-auto fixed z-[70] w-64 overflow-hidden rounded border border-gray-200 bg-white p-1 text-sm shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{
            left: Math.max(
              QUICK_LAUNCH_CONTEXT_MENU_GUTTER,
              Math.min(contextMenu.x, window.innerWidth - QUICK_LAUNCH_CONTEXT_MENU_WIDTH - QUICK_LAUNCH_CONTEXT_MENU_GUTTER),
            ),
            top: Math.max(
              QUICK_LAUNCH_CONTEXT_MENU_GUTTER,
              Math.min(contextMenu.y, window.innerHeight - QUICK_LAUNCH_CONTEXT_MENU_HEIGHT - QUICK_LAUNCH_CONTEXT_MENU_GUTTER),
            ),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={editContextMenuSlot}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <Pencil size={15} /> Edit shortcut
          </button>
          <button
            type="button"
            onClick={() => removeSlot(contextMenu.index)}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <Trash2 size={15} /> Remove
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          <div className="px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <span>Slots</span>
              <span>{normalizedSlotCount}</span>
            </div>
            <input
              type="range"
              min={QUICK_LAUNCH_MIN_SLOT_COUNT}
              max={QUICK_LAUNCH_MAX_SLOT_COUNT}
              value={normalizedSlotCount}
              onChange={(event) => onQuickLaunchSlotCountChange(Number(event.target.value))}
              className="w-full"
              aria-label="Quick launcher slot count"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onQuickLaunchPlacementChange(placement === 'sidebar' ? 'dock' : 'sidebar');
              setContextMenu(null);
            }}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <LayoutDashboard size={15} /> {placement === 'sidebar' ? 'Move to screen' : 'Move to left grid'}
          </button>
          <button
            type="button"
            onClick={() => {
              onQuickLaunchHiddenChange(true);
              setContextMenu(null);
            }}
            className="quick-launch-context-menu-item text-gray-700 dark:text-gray-200"
          >
            <X size={15} /> Hide launcher
          </button>
          <button
            type="button"
            onClick={removeAllSlots}
            className="quick-launch-context-menu-item quick-launch-context-menu-danger text-danger"
          >
            <X size={15} /> Remove All
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
        </div>
      )}

      {editingSlot !== null && (
        <div
          ref={pickerRef}
          className={`quick-launch-picker-enter ${isPickerClosing ? 'quick-launch-picker-exit' : ''} pointer-events-auto fixed z-[75] max-h-[min(34rem,calc(100dvh-2rem))] overflow-y-auto rounded-lg border border-accent/30 bg-white p-3 text-gray-900 shadow-[0_24px_70px_rgba(15,23,42,0.28)] ring-1 ring-accent/10 dark:border-accent/40 dark:bg-gray-900 dark:text-gray-100`}
          style={{
            left: pickerPosition?.left ?? QUICK_LAUNCH_PICKER_GUTTER,
            top: pickerPosition?.top ?? window.innerHeight - 120,
            width: QUICK_LAUNCH_PICKER_WIDTH,
            transform: 'translateY(-100%)',
            transformOrigin: `${pickerPosition?.arrowLeft ?? QUICK_LAUNCH_PICKER_WIDTH / 2}px bottom`,
          }}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <span
            className="absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-accent/30 bg-white dark:border-accent/40 dark:bg-gray-900"
            style={{ left: pickerPosition?.arrowLeft ?? QUICK_LAUNCH_PICKER_WIDTH / 2 }}
          />
          <div className="relative">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Choose App</h2>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Slot {(editingSlot ?? 0) + 1}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeQuickLaunchPicker();
                }}
                className="icon-close-button"
                aria-label="Close quick launch picker"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid max-h-60 grid-cols-1 gap-1 overflow-y-auto pr-1">
              {availableApps.map((app, appIndex) => {
                const Icon = app.icon;
                const isAlreadyUsed = usedAppIds.has(app.id);
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => assignSlot(app.id)}
                    disabled={isAlreadyUsed}
                    className="quick-launch-picker-option"
                    style={{ '--quick-launch-stagger-delay': `${Math.min(appIndex, 9) * 32}ms` } as CSSProperties}
                    title={isAlreadyUsed ? 'Already in your dock' : app.label}
                  >
                    <span className="quick-launch-picker-icon">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">{app.label}</span>
                    {isAlreadyUsed && <span className="text-xs font-semibold text-gray-400">Added</span>}
                  </button>
                );
              })}
            </div>

            <form onSubmit={assignExternalSlot} className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <Link size={15} />
                External Site
              </div>
              <div className="grid gap-2">
                <input
                  value={externalLabel}
                  onChange={(event) => setExternalLabel(event.target.value)}
                  placeholder="Name"
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-gray-700 dark:bg-gray-950"
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={externalUrl}
                    onChange={(event) => setExternalUrl(event.target.value)}
                    placeholder="https://example.com"
                    className="min-w-0 rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-gray-700 dark:bg-gray-950"
                  />
                  <button type="submit" className="btn-primary h-10 w-10 justify-center p-0" aria-label="Add external site" disabled={!externalLabel.trim() || !externalUrl.trim()}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </form>

            <div className="mt-3 grid gap-2 border-t border-gray-100 pt-2 dark:border-gray-800">
              {editingExternalSlot && (
                <p className="break-all rounded bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">{editingExternalSlot.label} - {editingExternalSlot.url}</p>
              )}
              <button
                type="button"
                onClick={() => assignSlot(null)}
                className="flex items-center gap-3 rounded px-2.5 py-2 text-left text-sm font-bold text-danger transition hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 size={16} />
                Clear this box
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface CommandPaletteItem {
  id: string;
  label: string;
  detail: string;
  keywords: string[];
  icon: LucideIcon;
  action: () => void;
}

function GlobalCommandPalette({
  isOpen,
  isAdministrator,
  canOpenAdminConsole,
  showCalendar,
  defaultAdminConsoleTab,
  permissions,
  onOpenChange,
  onOpenMessages,
  onOpenCalendar,
  onOpenCalculator,
  onOpenProfile,
  onReportBug,
}: {
  isOpen: boolean;
  isAdministrator: boolean;
  canOpenAdminConsole: boolean;
  showCalendar: boolean;
  defaultAdminConsoleTab: AdminConsoleTab;
  permissions: string[];
  onOpenChange: (isOpen: boolean) => void;
  onOpenMessages: () => void;
  onOpenCalendar: () => void;
  onOpenCalculator: () => void;
  onOpenProfile: () => void;
  onReportBug: () => void;
}) {
  const navigate = useNavigate();
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const canUsePermission = (permission: string) => isAdministrator || permissionSet.has(permission);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const closePalette = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const runAndClose = useCallback((action: () => void) => {
    action();
    closePalette();
  }, [closePalette]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(true);
      }
    };

    document.addEventListener('keydown', handleShortcut);

    return () => document.removeEventListener('keydown', handleShortcut);
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  const baseItems = useMemo<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        detail: 'Open the main workspace.',
        keywords: ['home', 'start', 'workspace'],
        icon: LayoutDashboard,
        action: () => navigate('/'),
      },
      {
        id: 'messages',
        label: 'Messages',
        detail: 'Open instant messaging.',
        keywords: ['chat', 'inbox', 'conversation'],
        icon: Mail,
        action: onOpenMessages,
      },
      ...(showCalendar ? [{
        id: 'calendar',
        label: 'Calendar',
        detail: 'Open calendar, entries, and reminders.',
        keywords: ['schedule', 'reminder', 'daily'],
        icon: CalendarDays,
        action: onOpenCalendar,
      }] : []),
      {
        id: 'calculator',
        label: 'Calculator',
        detail: 'Open the floating calculator.',
        keywords: ['math', 'numbers'],
        icon: Calculator,
        action: onOpenCalculator,
      },
      {
        id: 'search-users',
        label: 'Search Users',
        detail: 'Find personnel profiles.',
        keywords: ['people', 'profile', 'personnel', 'employee'],
        icon: Search,
        action: () => navigate('/search'),
      },
      {
        id: 'reports',
        label: 'Reports',
        detail: 'Open operational reporting.',
        keywords: ['charts', 'analytics', 'metrics'],
        icon: BarChart3,
        action: () => navigate('/reports'),
      },
      {
        id: 'evaluations',
        label: 'Evaluations',
        detail: 'Open performance evaluations.',
        keywords: ['pe', 'review', 'performance'],
        icon: ClipboardList,
        action: () => navigate('/evaluations'),
      },
      {
        id: 'profile',
        label: 'Account Settings',
        detail: 'Manage profile, MFA, and preferences.',
        keywords: ['profile', 'settings', 'mfa', 'password'],
        icon: UserCircle,
        action: onOpenProfile,
      },
      {
        id: 'report-bug',
        label: 'Report a Bug',
        detail: 'Send an issue to administrators.',
        keywords: ['issue', 'help', 'support'],
        icon: Bug,
        action: onReportBug,
      },
    ];

    if (canOpenAdminConsole) {
      items.push(
        {
          id: 'admin',
          label: 'Admin Console',
          detail: 'Open administration.',
          keywords: ['settings', 'manage', 'administrator'],
          icon: Shield,
          action: () => navigate(`/admin/${defaultAdminConsoleTab}`),
        },
      );
    }

    if (canOpenAdminConsole && canUsePermission('admin:create-user') && canUsePermission('users:create')) {
      items.push({
          id: 'create-user',
          label: 'Create User',
          detail: 'Add a new account.',
          keywords: ['account', 'new', 'person'],
          icon: UserPlus,
          action: () => navigate('/admin/create-user'),
        });
    }

    if (canUsePermission('devices:manage')) {
      items.push(
        {
          id: 'devices',
          label: 'Devices',
          detail: 'Manage issued devices.',
          keywords: ['equipment', 'radio', 'phone', 'asset'],
          icon: Laptop,
          action: () => navigate('/devices'),
        },
      );
    }

    if (canOpenAdminConsole && canUsePermission('admin:audit') && canUsePermission('audit:view')) {
      items.push(
        {
          id: 'audit-log',
          label: 'Audit Log',
          detail: 'Review system activity.',
          keywords: ['activity', 'history', 'xlsx', 'export'],
          icon: ClipboardList,
          action: () => navigate('/admin/audit'),
        },
      );
    }

    if (canOpenAdminConsole && canUsePermission('admin:permissions') && canUsePermission('roles:manage')) {
      items.push(
        {
          id: 'permissions',
          label: 'Permissions',
          detail: 'Manage roles and access.',
          keywords: ['roles', 'access', 'security'],
          icon: LockKeyhole,
          action: () => navigate('/admin/permissions'),
        },
      );
    }

    return items;
  }, [canOpenAdminConsole, canUsePermission, defaultAdminConsoleTab, navigate, onOpenCalendar, onOpenCalculator, onOpenMessages, onOpenProfile, onReportBug, showCalendar]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = normalizedQuery
      ? baseItems.filter((item) => {
          const haystack = [item.label, item.detail, ...item.keywords].join(' ').toLowerCase();
          return normalizedQuery.split(/\s+/u).every((term) => haystack.includes(term));
        })
      : baseItems;

    if (normalizedQuery) {
      return [
        {
          id: `search-${normalizedQuery}`,
          label: `Search users for "${query.trim()}"`,
          detail: 'Open personnel search with this term.',
          keywords: ['people', 'profile', 'personnel'],
          icon: Search,
          action: () => navigate(`/search?q=${encodeURIComponent(query.trim())}`),
        },
        ...matches,
      ];
    }

    return matches;
  }, [baseItems, navigate, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePalette();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((index) => (filteredItems.length ? (index + 1) % filteredItems.length : 0));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((index) => (filteredItems.length ? (index - 1 + filteredItems.length) % filteredItems.length : 0));
      return;
    }

    if (event.key === 'Enter' && filteredItems[selectedIndex]) {
      event.preventDefault();
      runAndClose(filteredItems[selectedIndex].action);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/35 px-3 pt-[9vh] sm:px-6" onMouseDown={closePalette}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.36)] dark:border-gray-800 dark:bg-gray-950"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <Command className="shrink-0 text-primary-500 dark:text-blue-100" size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands, people, apps..."
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
          />
          <button type="button" onClick={closePalette} className="icon-close-button" aria-label="Close command palette">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[min(28rem,62dvh)] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm font-semibold text-gray-500 dark:text-gray-400">No matching commands</div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => runAndClose(item.action)}
                  className={`flex w-full items-center gap-3 rounded px-3 py-3 text-left transition ${
                    isSelected
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-900'
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? 'border-white/25 bg-white/15 text-white'
                      : 'border-gray-200 bg-white text-primary-500 dark:border-gray-800 dark:bg-gray-900 dark:text-blue-100'
                  }`}>
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.label}</span>
                    <span className={`mt-0.5 block truncate text-xs font-semibold ${isSelected ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>{item.detail}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
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
      navigate('/search');
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
        navigate('/');
        return;
      }

      if (key === 'r') {
        event.preventDefault();
        navigate('/reports');
        return;
      }

      if (key === 'a' && canOpenAdminConsole) {
        event.preventDefault();
        navigate(`/admin/${defaultAdminConsoleTab}`);
        return;
      }

      if (key === 'u' && canCreateUsers) {
        event.preventDefault();
        navigate('/admin/create-user');
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

function PageLoader({ label = 'Loading...' }: { label?: string }) {
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
    <div key={isAdminWorkspaceRoute ? 'admin-workspace' : location.pathname} className={isAdminWorkspaceRoute ? undefined : 'page-route-enter'}>
      {children}
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

function getInitialCalendarModalPosition() {
  return getInitialFloatingModalPosition(1120, 0.03);
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
  const [notificationCenterTab, setNotificationCenterTab] = useState<'unread' | 'bugs' | 'recent'>('unread');
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isSetupLoading, setIsSetupLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const appName = setupStatus?.appName || DEFAULT_APP_NAME;
  const siteName = setupStatus?.siteName || DEFAULT_SITE_NAME;
  const brandLogoDataUrl = setupStatus?.brandLogoDataUrl || '';
  const primaryColor = setupStatus?.primaryColor || DEFAULT_PRIMARY_COLOR;
  const secondaryColor = setupStatus?.secondaryColor || DEFAULT_SECONDARY_COLOR;
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
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [messageTargetUser, setMessageTargetUser] = useState<User | null>(null);
  const [messageTargetThreadId, setMessageTargetThreadId] = useState<string | null>(null);
  const [messageComposeRequestKey] = useState(0);
  const [isRecentMessageComposerOpen, setIsRecentMessageComposerOpen] = useState(false);
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
  const [recentConversations, setRecentConversations] = useState<RecentConversation[]>([]);
  const [recentConversationPresenceByAccount, setRecentConversationPresenceByAccount] = useState<Record<string, RecentPresenceState>>({});
  const [recentConversationTypingById, setRecentConversationTypingById] = useState<Record<string, RecentTypingState>>({});
  const [areRecentConversationsCollapsed, setAreRecentConversationsCollapsed] = useState(false);
  const [quickReplyConversation, setQuickReplyConversation] = useState<RecentConversation | null>(null);
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
    document.documentElement.style.setProperty('--app-primary', primaryColor);
    document.documentElement.style.setProperty('--app-secondary', secondaryColor);
  }, [primaryColor, secondaryColor]);

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

  const getThemeToggleLabel = () => {
    return theme === 'light' ? 'Dark Mode' : 'Light Mode';
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
    const appScale = normalizeAppScale(currentUser?.appScale);
    document.documentElement.classList.remove('app-scale-compact', 'app-scale-comfortable', 'app-scale-large');
    document.documentElement.classList.add(`app-scale-${appScale}`);
  }, [currentUser?.appScale]);

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

    const eventsUrl = getMessageEventsUrl();
    const eventSource = new EventSource(eventsUrl, { withCredentials: true });
    const handleRealtimeMessageUpdate = () => queueUnreadCountLoad();
    eventSource?.addEventListener('message-created', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-read', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-archived', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('message-deleted', handleRealtimeMessageUpdate);
    eventSource?.addEventListener('error', (event) => {
      console.error('Message realtime connection error:', event);
    });

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
      eventSource?.close();
    };
  }, [appName, currentUser, getCustomNotificationSoundUrl, messagePreferences.receiveMessages, messagePreferences.playMessageSound, messagePreferences.messageSound, messagePreferences.browserNotifications]);

  useEffect(() => {
    if (!currentUser || !messagePreferences.receiveMessages) {
      setRecentConversations([]);
      return;
    }

    let isMounted = true;
    let refreshTimer: number | null = null;

    const loadRecentConversations = async () => {
      try {
        const [inboxResult, sentResult] = await Promise.allSettled([
          messageService.getInbox(currentUser.id),
          messageService.getSent(currentUser.id),
        ]);
        if (!isMounted) {
          return;
        }

        const inboxMessages = inboxResult.status === 'fulfilled' ? inboxResult.value.data : [];
        const sentMessages = sentResult.status === 'fulfilled' ? sentResult.value.data : [];
        if (inboxResult.status === 'rejected' && sentResult.status === 'rejected') {
          throw inboxResult.reason;
        }

        setRecentConversations(buildRecentConversations([...inboxMessages, ...sentMessages], currentUser.id));
      } catch (error) {
        console.error('Failed to load recent conversations:', error);
      }
    };

    const queueRecentConversationLoad = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadRecentConversations();
      }, isAppBackgroundedRef.current ? 1200 : 250);
    };

    void loadRecentConversations();
    window.addEventListener('shield:messages-updated', queueRecentConversationLoad);

    const eventsUrl = getMessageEventsUrl();
    const eventSource = new EventSource(eventsUrl, { withCredentials: true });
    const handlePresenceUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data || '{}') as {
          actorAccountId?: string;
          actorOnline?: boolean;
          actorAway?: boolean;
          actorStatus?: RecentPresenceStatus;
          actorLastSeenAt?: string | null;
        };

        if (!payload.actorAccountId) {
          return;
        }

        setRecentConversationPresenceByAccount((current) => ({
          ...current,
          [payload.actorAccountId as string]: {
            online: payload.actorOnline === true,
            away: payload.actorAway === true,
            status: payload.actorStatus || 'active',
            lastSeenAt: payload.actorLastSeenAt || null,
          },
        }));
      } catch (error) {
        console.error('Failed to parse recent conversation presence update:', error);
      }
    };
    const handleTypingUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data || '{}') as {
          actorAccountId?: string;
          typingThreadId?: string;
          typingName?: string;
          typingIsActive?: boolean;
        };
        const conversationId = payload.typingThreadId || payload.actorAccountId;
        if (!conversationId || payload.actorAccountId === currentUser.id) {
          return;
        }

        setRecentConversationTypingById((current) => {
          const next = { ...current };
          if (payload.typingIsActive === false) {
            delete next[conversationId];
          } else {
            next[conversationId] = {
              name: payload.typingName || 'Someone',
              expiresAt: Date.now() + 3500,
            };
          }
          return next;
        });
      } catch (error) {
        console.error('Failed to parse recent conversation typing update:', error);
      }
    };
    eventSource.addEventListener('message-created', queueRecentConversationLoad);
    eventSource.addEventListener('message-read', queueRecentConversationLoad);
    eventSource.addEventListener('message-archived', queueRecentConversationLoad);
    eventSource.addEventListener('message-deleted', queueRecentConversationLoad);
    eventSource.addEventListener('message-typing', handleTypingUpdate);
    eventSource.addEventListener('presence-updated', handlePresenceUpdate);
    eventSource.addEventListener('error', (event) => {
      console.error('Recent conversations realtime connection error:', event);
    });

    return () => {
      isMounted = false;
      window.removeEventListener('shield:messages-updated', queueRecentConversationLoad);
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      eventSource.removeEventListener('message-typing', handleTypingUpdate);
      eventSource.removeEventListener('presence-updated', handlePresenceUpdate);
      eventSource.close();
    };
  }, [currentUser, messagePreferences.receiveMessages]);

  useEffect(() => {
    if (!currentUser || !messagePreferences.receiveMessages) {
      setRecentConversationPresenceByAccount({});
      setRecentConversationTypingById({});
    }
  }, [currentUser, messagePreferences.receiveMessages]);

  useEffect(() => {
    if (!currentUser || !messagePreferences.receiveMessages) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const now = Date.now();
      setRecentConversationTypingById((current) => {
        const activeEntries = Object.entries(current).filter(([, typing]) => typing.expiresAt > now);
        if (activeEntries.length === Object.keys(current).length) {
          return current;
        }
        return Object.fromEntries(activeEntries);
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [currentUser, messagePreferences.receiveMessages]);

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
  const hasPermission = (permission: string) => Boolean(isAdministrator || currentUser?.permissions?.includes(permission));
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
  const unreadNotificationCount = userNotifications.filter((notification) => !notification.isRead).length;
  const unreadUserNotifications = userNotifications.filter((notification) => !notification.isRead);
  const recentNotificationCount = notifications.length;
  const totalNotificationCount = recentNotificationCount + unreadNotificationCount + (isAdministrator ? openBugCount : 0);
  const desktopBadgeCount = messageUnreadCount + unreadNotificationCount + (isAdministrator ? openBugCount : 0);
  const hasNotificationCenterItems = totalNotificationCount > 0 || userNotifications.length > 0;
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

  useEffect(() => {
    if (!hasShieldDesktopFeature('setUnreadCount')) {
      return;
    }

    window.shieldDesktop?.setUnreadCount?.(desktopBadgeCount).catch((error) => {
      console.error('Failed to update desktop badge:', error);
    });

    if (desktopBadgeCount === 0 && hasShieldDesktopFeature('clearAttention')) {
      window.shieldDesktop?.clearAttention?.().catch((error) => {
        console.error('Failed to clear desktop attention state:', error);
      });
    }
  }, [desktopBadgeCount]);

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
      if (notificationCenterTab === 'bugs') {
        setNotificationCenterTab('unread');
      }
      return;
    }

    void loadBugReports();
  }, [isAdministrator, loadBugReports, notificationCenterTab]);

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

    const eventsUrl = getAppEventsUrl();
    const eventSource = new EventSource(eventsUrl, { withCredentials: true });

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

    eventSource.addEventListener('notification-created', handleNotificationUpdate);
    eventSource.addEventListener('notification-updated', handleNotificationUpdate);
    eventSource.addEventListener('urgent-alert-created', handleUrgentAlertUpdate);
    eventSource.addEventListener('urgent-alert-updated', handleUrgentAlertUpdate);
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
    eventSource.addEventListener('error-updated', handleRealtimeAppUpdate('error-updated'));
    eventSource.addEventListener('media-updated', handleRealtimeAppUpdate('media-updated'));
    eventSource.addEventListener('mileage-updated', handleRealtimeAppUpdate('mileage-updated'));
    eventSource.addEventListener('performance-evaluation-updated', handleRealtimeAppUpdate('performance-evaluation-updated'));
    eventSource.addEventListener('settings-updated', (event) => {
      void loadNotificationSounds();
      void syncSetupStatus();
      handleRealtimeAppUpdate('settings-updated')(event);
    });
    eventSource.addEventListener('permission-updated', (event) => {
      void syncSessionTimeoutFromSettings();
      void syncCurrentAccount();
      handleRealtimeAppUpdate('permission-updated')(event);
    });
    eventSource.addEventListener('quick-launch-updated', handleRealtimeAppUpdate('quick-launch-updated'));
    eventSource.addEventListener('reminder-updated', handleRealtimeAppUpdate('reminder-updated'));
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
    eventSource.addEventListener('open', () => {
      window.dispatchEvent(new CustomEvent('shield:api-connection-restored'));
    });
    eventSource.addEventListener('error', async (event) => {
      console.error('Application realtime connection error:', event);
      if (!(await checkApiHealth())) {
        window.dispatchEvent(new CustomEvent('shield:api-connection-lost'));
      }
    });

    return () => eventSource.close();
  }, [currentUser, handleForcedLogout, isAppBackgrounded, loadBugReports, loadNotificationSounds, loadUrgentAlerts, loadUserNotifications, syncSessionTimeoutFromSettings, syncSetupStatus]);

  const closeModal = (modal: ClosingModal) => {
    setClosingModal(modal);
    window.setTimeout(() => {
      if (modal === 'messages') setIsMessagesModalOpen(false);
      if (modal === 'calendar') setIsCalendarModalOpen(false);
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

  const openRecentConversation = (conversation: RecentConversation) => {
    setIsRecentMessageComposerOpen(false);
    setQuickReplyConversation(null);
    setMessageTargetUser(null);
    setMessageTargetThreadId(conversation.id);
    openMessagesModal();
  };

  const markRecentConversationRead = async (conversation: RecentConversation) => {
    const unreadMessageIds = conversation.unreadMessageIds.filter(Boolean);
    if (unreadMessageIds.length === 0 || !currentUser) {
      return;
    }

    try {
      await Promise.all(unreadMessageIds.map((messageId) => messageService.markRead(messageId, currentUser.id)));
      window.dispatchEvent(new CustomEvent('shield:messages-updated'));
    } catch (error) {
      console.error('Failed to mark recent conversation read:', error);
      showToast('error', getErrorMessage(error, 'Failed to mark conversation read.'), { saveToNotifications: false });
    }
  };

  const openNewMessageComposer = () => {
    setQuickReplyConversation(null);
    setIsRecentMessageComposerOpen((isOpen) => !isOpen);
  };

  const openRecentQuickReply = (conversation: RecentConversation) => {
    setIsRecentMessageComposerOpen(false);
    setQuickReplyConversation(conversation);
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

    const dateQuery = typeof targetDate === 'string' ? `?date=${encodeURIComponent(targetDate)}` : '';
    const targetPath = `/calendar${dateQuery}`;
    if (`${getAppRelativePathname()}${window.location.search}` !== targetPath) {
      window.history.pushState({}, document.title, withAppBase(targetPath));
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const toggleCalendarModal = () => {
    if (isCalendarModalOpen) {
      closeModal('calendar');
      return;
    }

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
    window.history.pushState({}, document.title, withAppBase(path));
    window.dispatchEvent(new PopStateEvent('popstate'));
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

    if (activeFloatingApp === 'calendar' && isCalendarModalOpen) {
      closeModal('calendar');
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

    if (isCalendarModalOpen) {
      closeModal('calendar');
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

  const handleAppScaleChange = async (appScale: AppScale) => {
    if (!currentUser) {
      return;
    }

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
  }, [activeFloatingApp, isAccountMenuOpen, isBugTrackerOpen, isCalculatorOpen, isCalendarModalOpen, isCommandPaletteOpen, isFirstLoginGuideOpen, isMessagesModalOpen, isNotificationsOpen, isProfileModalOpen, isReportBugOpen]);

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

  return (
    <Router basename={ROUTER_BASENAME}>
      <ToastHost toasts={toasts} />
      {showConfetti && <ConfettiOverlay />}
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
          brandLogoDataUrl={brandLogoDataUrl}
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
        <LoginSplash onLogin={handleLogin} onToast={showToast} appName={appName} siteName={siteName} brandLogoDataUrl={brandLogoDataUrl} isExiting={isLoginTransitioning} />
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
                onClick={() => setIsGlassTheme((value) => !value)}
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
          <aside className={`shield-left-panel relative z-50 hidden h-[100dvh] shrink-0 overflow-visible bg-primary-500 text-white shadow-xl transition-all duration-200 md:block ${isSidebarCollapsed ? 'w-20' : 'w-72'}`}>
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
                    <img src={getBrandLogoSrc(brandLogoDataUrl)} alt="" className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-wider text-white">{appName}</h1>
                    <p className="text-xs text-blue-100">{siteName}</p>
                  </div>
                </div>
              )}
              {isSidebarCollapsed && (
                <div className="mx-auto flex h-10 w-10 items-center justify-center">
                  <img src={getBrandLogoSrc(brandLogoDataUrl)} alt={appName} className="h-full w-full object-contain" />
                </div>
              )}
            </div>

            <div className={isSidebarCollapsed ? 'px-3 pb-2 pt-3' : 'px-4 pb-2 pt-3'}>
              <GlobalSearch compact={isSidebarCollapsed} />
            </div>

            <div className={isSidebarCollapsed ? 'px-3 py-2' : 'px-4 py-2'}>
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
                  <QuickLaunchTray
                    isAdministrator={isAdministrator}
                    permissions={currentUser?.permissions || []}
                    isSidebarCollapsed={isSidebarCollapsed}
                    badgeCounts={{ messages: messageUnreadCount }}
                    activeModalApps={[
                      ...(isMessagesModalOpen ? (['messages'] as const) : []),
                      ...(isCalendarModalOpen ? (['calendar'] as const) : []),
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
                </div>
              )}
            </div>
            </div>
          </aside>

          <div className="relative flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden">
              <div data-onboarding-target="header-actions" className="pointer-events-auto fixed right-3 top-3 z-40 flex select-none items-center gap-1.5 rounded-2xl border border-gray-200 bg-white/90 p-2 shadow-[0_16px_45px_rgba(15,23,42,0.18)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/85 sm:right-5 sm:top-4 sm:gap-2">
                <div ref={notificationsMenuRef} className="relative">
                  <IconButtonTooltip label="Notifications">
                    <button
                      data-onboarding-control="notifications"
                      type="button"
                      onClick={() => setIsNotificationsOpen((value) => !value)}
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
                        <div className={`mt-3 grid gap-1 rounded border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900 ${isAdministrator ? 'grid-cols-3' : 'grid-cols-2'}`}>
                          {[
                            { id: 'unread' as const, label: 'Unread', count: unreadNotificationCount },
                            ...(isAdministrator ? [{ id: 'bugs' as const, label: 'Bugs', count: openBugCount }] : []),
                            { id: 'recent' as const, label: 'Recent', count: recentNotificationCount },
                          ].map((tab) => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setNotificationCenterTab(tab.id)}
                              className={`rounded px-2 py-2 text-xs font-bold transition ${
                                notificationCenterTab === tab.id
                                  ? 'bg-primary-500 text-white shadow-sm'
                                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              {tab.label} <span className={notificationCenterTab === tab.id ? 'text-white' : 'text-gray-400 dark:text-gray-500'}>{tab.count}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="max-h-[70dvh] overflow-y-auto p-2">
                        {!hasNotificationCenterItems ? (
                          <div className="px-5 py-10 text-center">
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
                              <div className="px-5 py-8 text-center text-sm font-semibold text-gray-500 dark:text-gray-400">No bug reports need review.</div>
                            )}
                            {notificationCenterTab === 'unread' && unreadUserNotifications.length === 0 && (
                              <div className="px-5 py-8 text-center text-sm font-semibold text-gray-500 dark:text-gray-400">No unread notifications.</div>
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
                              <div className="px-5 py-8 text-center text-sm font-semibold text-gray-500 dark:text-gray-400">No recent activity.</div>
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
                                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New notification" />
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
                <IconButtonTooltip label="Messages">
                  <HeaderMessagesButton
                    unreadCount={messageUnreadCount}
                    onOpenMessages={toggleMessagesModal}
                  />
                </IconButtonTooltip>
                <IconButtonTooltip label={getThemeToggleLabel()}>
                  <button
                    data-onboarding-control="theme"
                    type="button"
                    onClick={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
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
                <Suspense fallback={<PageLoader label="Loading page..." />}>
                  <RouteTransition>
                    <Routes>
                      <Route
                        path="/"
                        element={(
                          <DashboardPage
                            currentUser={currentUser}
                            isAppBackgrounded={isAppBackgrounded}
                          />
                        )}
                      />
                      {currentUser && (
                        <Route path="/updates/new" element={<DashboardPostPage currentUser={currentUser} onToast={showToast} isCreateMode />} />
                      )}
                      {currentUser && (
                        <Route path="/updates/:postId/edit" element={<DashboardPostPage currentUser={currentUser} onToast={showToast} isEditMode />} />
                      )}
                      {currentUser && <Route path="/updates/:postId" element={<DashboardPostPage currentUser={currentUser} onToast={showToast} />} />}
                      {currentUser && (
                        <Route
                          path="/messages"
                          element={<MessageInboxPage currentUser={currentUser} onToast={showToast} isBackgrounded={isAppBackgrounded} />}
                        />
                      )}
                      {currentUser && (
                        <Route
                          path="/calendar"
                          element={<CalendarPage currentUser={currentUser} onAccountUpdate={handleAccountUpdate} useMilitaryTime={messagePreferences.useMilitaryTime} />}
                        />
                      )}
                      <Route path="/devices" element={<DeviceManagementPage currentUser={currentUser} />} />
                      {currentUser && (
                        <Route
                          path="/evaluations"
                          element={<PerformanceEvaluationsPage currentUser={currentUser} onToast={showToast} getErrorMessage={getErrorMessage} />}
                        />
                      )}
                      <Route path="/search" element={<SearchPage currentUser={currentUser} onToast={showToast} />} />
                      {currentUser && canOpenAdminConsole && (
                        <Route
                          path="/admin"
                          element={
                            <AdminConsolePage
                              account={currentUser}
                              initialTab={getDefaultAdminConsoleTab()}
                              onAccountUpdate={handleAccountUpdate}
                              onToast={showToast}
                              getErrorMessage={getErrorMessage}
                              onUserCreated={() => openAppPath('/admin/permissions')}
                              bugReports={bugReports}
                              onBugStatusChange={updateBugStatus}
                            />
                          }
                        />
                      )}
                      {currentUser && canOpenAdminConsole && (
                        <Route
                          path="/admin/:tab"
                          element={
                            <AdminConsolePage
                              account={currentUser}
                              onAccountUpdate={handleAccountUpdate}
                              onToast={showToast}
                              getErrorMessage={getErrorMessage}
                              onUserCreated={() => openAppPath('/admin/permissions')}
                              bugReports={bugReports}
                              onBugStatusChange={updateBugStatus}
                            />
                          }
                        />
                      )}
                      {currentUser && canOpenAdminConsole && hasPermission('admin:create-user') && hasPermission('users:create') && (
                        <Route
                          path="/users/create"
                          element={
                            <AdminConsolePage
                              account={currentUser}
                              initialTab="create-user"
                              onAccountUpdate={handleAccountUpdate}
                              onToast={showToast}
                              getErrorMessage={getErrorMessage}
                              onUserCreated={() => openAppPath('/admin/permissions')}
                              bugReports={bugReports}
                              onBugStatusChange={updateBugStatus}
                            />
                          }
                        />
                      )}
                      <Route path="/reports" element={<ReportsPage currentUser={currentUser} onToast={showToast} getErrorMessage={getErrorMessage} />} />
                      {currentUser && canOpenAdminConsole && hasPermission('admin:audit') && hasPermission('audit:view') && (
                        <Route
                          path="/audit"
                          element={
                            <AdminConsolePage
                              account={currentUser}
                              initialTab="audit"
                              onAccountUpdate={handleAccountUpdate}
                              onToast={showToast}
                              getErrorMessage={getErrorMessage}
                              onUserCreated={() => openAppPath('/admin/permissions')}
                              bugReports={bugReports}
                              onBugStatusChange={updateBugStatus}
                            />
                          }
                        />
                      )}
                      {currentUser && canOpenAdminConsole && hasPermission('admin:permissions') && hasPermission('roles:manage') && (
                        <Route
                          path="/permissions"
                          element={
                            <AdminConsolePage
                              account={currentUser}
                              initialTab="permissions"
                              onAccountUpdate={handleAccountUpdate}
                              onToast={showToast}
                              getErrorMessage={getErrorMessage}
                              onUserCreated={() => openAppPath('/admin/permissions')}
                              bugReports={bugReports}
                              onBugStatusChange={updateBugStatus}
                            />
                          }
                        />
                      )}
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </RouteTransition>
                </Suspense>
              </div>
              {!messagePreferences.hideQuickLaunch && messagePreferences.quickLaunchPlacement === 'dock' && (
                <QuickLaunchTray
                  isAdministrator={isAdministrator}
                  permissions={currentUser?.permissions || []}
                  isSidebarCollapsed={isSidebarCollapsed}
                  badgeCounts={{ messages: messageUnreadCount }}
                  activeModalApps={[
                    ...(isMessagesModalOpen ? (['messages'] as const) : []),
                    ...(isCalendarModalOpen ? (['calendar'] as const) : []),
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
          {shouldShowRecentConversations && (
            <RecentConversationsDock
              conversations={recentConversations}
              isCollapsed={areRecentConversationsCollapsed}
              currentUser={currentUser}
              quickReplyConversationId={quickReplyConversation?.id || null}
              presenceByAccount={recentConversationPresenceByAccount}
              typingByConversation={recentConversationTypingById}
              onOpenConversation={openRecentConversation}
              onMarkRead={markRecentConversationRead}
              onReply={openRecentQuickReply}
              onQuickReplyClose={() => setQuickReplyConversation(null)}
              onQuickReplySent={(conversation) => {
                setRecentConversations((previousConversations) =>
                  previousConversations.map((recentConversation) =>
                    recentConversation.id === conversation.id
                      ? {
                          ...recentConversation,
                          unreadCount: 0,
                          unreadPreview: '',
                          unreadMessageIds: [],
                        }
                      : recentConversation,
                  ),
                );
                setMessageUnreadCount((count) => Math.max(0, count - conversation.unreadCount));
                window.dispatchEvent(new CustomEvent('shield:messages-updated'));
              }}
              onCompose={openNewMessageComposer}
              onToggleCollapsed={() => setAreRecentConversationsCollapsed((collapsed) => !collapsed)}
              onToast={showToast}
            />
          )}
          {shouldShowRecentConversations && isRecentMessageComposerOpen && currentUser && (
            <RecentMessageComposerPopup
              currentUser={currentUser}
              onClose={() => setIsRecentMessageComposerOpen(false)}
              onSent={() => window.dispatchEvent(new CustomEvent('shield:messages-updated'))}
              onToast={showToast}
            />
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
          {isCalendarModalOpen && currentUser && showCalendar && (
            <FloatingWindow
              className="glass-workspace-window pointer-events-auto fixed inset-x-0 top-0 bottom-[calc(env(safe-area-inset-bottom)+5.4rem)] flex min-h-0 w-full min-w-0 max-w-none resize-none flex-col overflow-hidden rounded-none bg-white p-3 shadow-2xl dark:bg-gray-900 md:inset-auto md:h-[82dvh] md:max-h-[calc(100dvh-1rem)] md:min-h-[min(480px,calc(100dvh-1rem))] md:w-[min(1120px,calc(100vw-1rem))] md:min-w-[min(420px,calc(100vw-1rem))] md:max-w-[calc(100vw-1rem)] md:resize md:rounded-lg md:p-4"
              fallbackSize={{ width: Math.min(window.innerWidth - 16, 1120), height: Math.min(window.innerHeight - 16, 780) }}
              initialPosition={getInitialCalendarModalPosition}
              isClosing={closingModal === 'calendar'}
              onFocus={() => {
                announceFloatingFocus('calendar');
                setActiveFloatingApp('calendar');
              }}
              zIndex={activeFloatingApp === 'calendar' ? 95 : 55}
            >
              {({ dragHandleProps, isDragging }) => (
              <>
                <div
                  {...dragHandleProps}
                  className={`mb-3 flex select-none items-start justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-800 md:touch-none md:cursor-grab ${isDragging ? 'md:cursor-grabbing' : ''}`}
                >
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Calendar</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 md:hidden">Schedule, daily entries, and reminders.</p>
                    <p className="mt-0.5 hidden text-xs text-gray-500 dark:text-gray-400 md:block">Drag to move. Resize from the corner.</p>
                  </div>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => closeModal('calendar')}
                    className="icon-close-button"
                    aria-label="Close calendar"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <Suspense fallback={<PageLoader label="Loading calendar..." />}>
                    <CalendarPage currentUser={currentUser} onAccountUpdate={handleAccountUpdate} useMilitaryTime={messagePreferences.useMilitaryTime} isFloatingApp />
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
                      onAppThemeChange={setTheme}
                      onGlassThemeChange={setIsGlassTheme}
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
            <CalculatorModal
              isClosing={closingModal === 'calculator'}
              onClose={() => closeModal('calculator')}
              onFocus={() => {
                announceFloatingFocus('calculator');
                setActiveFloatingApp('calculator');
              }}
              zIndex={activeFloatingApp === 'calculator' ? 95 : 55}
            />
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
          {isApiConnectionLost && <ConnectionLostOverlay lastConnectedAt={lastApiConnectedAt} appName={appName} />}
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
