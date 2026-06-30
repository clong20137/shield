import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ChevronDown, Download, ExternalLink, EyeOff, Image, KeyRound, Laptop, LogOut, Power, QrCode, RefreshCw, Save, ShieldCheck, Smartphone, UserCircle, Volume2, X } from 'lucide-react';
import { AuthAccount, AuthSession, DeviceRecord, MediaLibraryItem, NotificationSound, TwoFactorSetupResponse, authService, deviceService, getAssetUrl, handleAssetImageError, performanceEvaluationService, userService } from '../services/api';
import { ProfilePictureMediaPicker } from '../components/ProfilePictureMediaPicker';
import { downloadPerformanceEvaluationPdf } from '../utils/performanceEvaluationPdf';

const appBasePath = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/u, '');
const desktopInstallerUrl = `${appBasePath}/downloads/Shield-Setup.exe`;
type AppTheme = 'light' | 'dark';

interface AccountSettingsPageProps {
  account: AuthAccount;
  messagePreferences: {
    receiveMessages: boolean;
    playMessageSound: boolean;
    browserNotifications: boolean;
    messageSound: string;
    reminderAlarmSound: string;
    useMilitaryTime: boolean;
    hideQuickLaunch: boolean;
    hideRecentConversations: boolean;
    quickLaunchPlacement: 'dock' | 'sidebar';
    quickLaunchSlotCount: number;
  };
  appTheme: AppTheme;
  isGlassTheme: boolean;
  isDesktopApp: boolean;
  desktopPreferences: ShieldDesktopPreferences | null;
  desktopUpdateStatus: ShieldDesktopUpdateStatus | null;
  notificationSounds: NotificationSound[];
  onReceiveMessagesChange: (receiveMessages: boolean) => void;
  onBrowserNotificationsChange: (browserNotifications: boolean) => void;
  onMessageSoundChange: (playMessageSound: boolean) => void;
  onMessageSoundSelect: (messageSound: string) => void;
  onPreviewMessageSound: (messageSound: string) => void;
  onReminderAlarmSoundSelect: (reminderAlarmSound: string) => void;
  onMilitaryTimeChange: (useMilitaryTime: boolean) => void;
  onRecentConversationsHiddenChange: (hideRecentConversations: boolean) => void;
  onQuickLaunchHiddenChange: (hideQuickLaunch: boolean) => void;
  onQuickLaunchPlacementChange: (placement: 'dock' | 'sidebar') => void;
  onQuickLaunchSlotCountChange: (slotCount: number) => void;
  onPresenceHiddenChange: (presenceHidden: boolean) => void;
  onCalendarHiddenChange: (calendarHidden: boolean) => void;
  onAppScaleChange: (appScale: AuthAccount['appScale']) => void;
  onDefaultDutyHoursChange: (defaultDutyHours: string) => void;
  onAppThemeChange: (theme: AppTheme) => void;
  onGlassThemeChange: (isGlassTheme: boolean) => void;
  onStartWithWindowsChange: (startWithWindows: boolean) => void;
  onTrayModeChange: (trayMode: boolean) => void;
  onCheckForDesktopUpdates: () => void;
  onInstallDesktopUpdate: () => void;
  onOpenDesktopDiagnostics: () => void;
  onOpenEvaluations?: () => void;
  onReplayGuide?: () => void;
  onAccountUpdate: (account: AuthAccount) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

function getAccountInitials(account: AuthAccount): string {
  const source = account.displayName?.trim() || account.email?.trim() || 'User';
  const parts = source.split(/\s+/u).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

const PASSWORD_REQUIREMENTS_MESSAGE = 'New password must be at least 12 characters and include uppercase, lowercase, a number, and a symbol.';
const PASSWORD_INPUT_CLASS =
  'w-full rounded border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500';

function isSecurePassword(password: string): boolean {
  return password.length >= 12 && /[A-Z]/u.test(password) && /[a-z]/u.test(password) && /\d/u.test(password) && /[^A-Za-z0-9]/u.test(password);
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) {
    return '0 MB';
  }

  return `${Math.round(value / 1024 / 1024)} MB`;
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) {
    return '0m';
  }

  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${minutes}m`;
}

function DiagnosticsRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 text-xs last:border-b-0 dark:border-gray-800">
      <span className="font-bold uppercase tracking-[0.12em] text-gray-400">{label}</span>
      <span className="min-w-0 text-right font-semibold text-gray-700 dark:text-gray-200">{value}</span>
    </div>
  );
}

export function AccountSettingsPage({
  account,
  messagePreferences,
  appTheme,
  isGlassTheme,
  isDesktopApp,
  desktopPreferences,
  desktopUpdateStatus,
  notificationSounds,
  onReceiveMessagesChange,
  onBrowserNotificationsChange,
  onMessageSoundChange,
  onMessageSoundSelect,
  onPreviewMessageSound,
  onReminderAlarmSoundSelect,
  onMilitaryTimeChange,
  onRecentConversationsHiddenChange,
  onQuickLaunchHiddenChange,
  onQuickLaunchPlacementChange,
  onQuickLaunchSlotCountChange,
  onPresenceHiddenChange,
  onCalendarHiddenChange,
  onAppScaleChange,
  onDefaultDutyHoursChange,
  onAppThemeChange,
  onGlassThemeChange,
  onStartWithWindowsChange,
  onTrayModeChange,
  onCheckForDesktopUpdates,
  onInstallDesktopUpdate,
  onOpenDesktopDiagnostics,
  onOpenEvaluations,
  onReplayGuide,
  onAccountUpdate,
  onToast,
  getErrorMessage,
}: AccountSettingsPageProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [isTwoFactorSaving, setIsTwoFactorSaving] = useState(false);
  const [isProfilePictureSaving, setIsProfilePictureSaving] = useState(false);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [assignedDevices, setAssignedDevices] = useState<DeviceRecord[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isAssignedDevicesLoading, setIsAssignedDevicesLoading] = useState(false);
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);
  const [desktopDiagnostics, setDesktopDiagnostics] = useState<ShieldDesktopDiagnostics | null>(null);
  const [isDesktopDiagnosticsLoading, setIsDesktopDiagnosticsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'devices' | 'reports' | 'preferences'>('general');
  const [isProfileMediaPickerOpen, setIsProfileMediaPickerOpen] = useState(false);
  const [evaluationCount, setEvaluationCount] = useState<number | null>(null);
  const [isEvaluationsLoading, setIsEvaluationsLoading] = useState(false);
  const [defaultDutyHoursInput, setDefaultDutyHoursInput] = useState(account.defaultDutyHours || '8');
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);
  const isAssignedDevicesLoadingRef = useRef(false);
  const assignedDevicesRefreshTimerRef = useRef<number | null>(null);
  const onToastRef = useRef(onToast);
  const getErrorMessageRef = useRef(getErrorMessage);
  const hasAccountPermission = (permission: string) => account.role === 'administrator' || Boolean(account.permissions?.includes(permission));
  const canChangeCalendarPreference = account.role === 'administrator' || Boolean(account.permissions?.includes('calendar:manage'));
  const canUseIncognitoMode = account.role === 'administrator' || Boolean(account.permissions?.includes('presence:incognito'));
  const canChangeOwnProfilePicture = hasAccountPermission('account:profile-picture');
  const canChangeReceiveMessages = hasAccountPermission('messages:receive');
  const canChangeStartWithWindows = hasAccountPermission('desktop:start-with-windows');
  const canChangeTrayMode = hasAccountPermission('desktop:minimize-to-tray');

  useEffect(() => {
    onToastRef.current = onToast;
    getErrorMessageRef.current = getErrorMessage;
  }, [getErrorMessage, onToast]);

  useEffect(() => {
    setDefaultDutyHoursInput(account.defaultDutyHours || '8');
  }, [account.defaultDutyHours]);

  useEffect(() => {
    let isMounted = true;

    if (!twoFactorSetup) {
      setQrCodeDataUrl('');
      return;
    }

    import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(twoFactorSetup.otpauthUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 220,
      }))
      .then((dataUrl) => {
        if (isMounted) {
          setQrCodeDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (isMounted) {
          onToast('error', 'Failed to generate MFA QR code.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [onToast, twoFactorSetup]);

  const refreshDesktopDiagnostics = async () => {
    if (typeof window.shieldDesktop?.getDesktopDiagnostics !== 'function') {
      onToast('info', 'Desktop diagnostics are not available in this version.');
      return;
    }

    setIsDesktopDiagnosticsLoading(true);
    try {
      const diagnostics = await window.shieldDesktop.getDesktopDiagnostics();
      setDesktopDiagnostics(diagnostics);
    } catch (error) {
      console.error('Failed to load desktop diagnostics:', error);
      onToast('error', 'Failed to load desktop diagnostics.');
    } finally {
      setIsDesktopDiagnosticsLoading(false);
    }
  };

  const loadSessions = async () => {
    setIsSessionsLoading(true);
    try {
      const response = await authService.getSessions();
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      onToast('error', getErrorMessage(error, 'Failed to load sessions.'));
    } finally {
      setIsSessionsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const loadAssignedDevices = useCallback((showLoading = true) => {
    if (isAssignedDevicesLoadingRef.current) {
      return Promise.resolve();
    }

    isAssignedDevicesLoadingRef.current = true;
    setIsAssignedDevicesLoading(showLoading);
    return deviceService.getAssignedToMe()
      .then((response) => setAssignedDevices(response.data))
      .catch((error) => {
        console.error('Failed to load assigned devices:', error);
        onToastRef.current('error', getErrorMessageRef.current(error, 'Failed to load assigned devices.'));
      })
      .finally(() => {
        isAssignedDevicesLoadingRef.current = false;
        setIsAssignedDevicesLoading(false);
      });
  }, []);

  useEffect(() => {
    void loadAssignedDevices();
  }, [loadAssignedDevices]);

  useEffect(() => {
    const handleDeviceUpdate = () => {
      if (assignedDevicesRefreshTimerRef.current) {
        window.clearTimeout(assignedDevicesRefreshTimerRef.current);
      }

      assignedDevicesRefreshTimerRef.current = window.setTimeout(() => {
        void loadAssignedDevices(false);
      }, 350);
    };

    window.addEventListener('shield:device-updated', handleDeviceUpdate);
    window.addEventListener('shield:user-updated', handleDeviceUpdate);
    return () => {
      window.removeEventListener('shield:device-updated', handleDeviceUpdate);
      window.removeEventListener('shield:user-updated', handleDeviceUpdate);
      if (assignedDevicesRefreshTimerRef.current) {
        window.clearTimeout(assignedDevicesRefreshTimerRef.current);
      }
    };
  }, [account.id, loadAssignedDevices]);

  const revokeSession = async (sessionId: string) => {
    setIsRevokingSessions(true);
    try {
      await authService.revokeSession(sessionId);
      setSessions((items) => items.filter((session) => session.id !== sessionId));
      onToast('success', 'Session revoked.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to revoke session.'));
    } finally {
      setIsRevokingSessions(false);
    }
  };

  const revokeOtherSessions = async () => {
    setIsRevokingSessions(true);
    try {
      const response = await authService.revokeOtherSessions();
      await loadSessions();
      onToast('success', `${response.data.revokedCount} session${response.data.revokedCount === 1 ? '' : 's'} revoked.`);
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to revoke other sessions.'));
    } finally {
      setIsRevokingSessions(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword !== confirmNewPassword) {
      onToast('error', 'New passwords do not match.');
      return;
    }

    if (!isSecurePassword(newPassword)) {
      onToast('error', PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }

    setIsPasswordSaving(true);

    try {
      await authService.changePassword(account.id, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      onToast('success', 'Password updated.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to update password.'));
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const handleSetupTwoFactor = async () => {
    setIsTwoFactorSaving(true);

    try {
      const response = await authService.setupTwoFactor(account.id);
      setTwoFactorSetup(response.data);
      onToast('info', 'Add the secret to your authenticator app, then enter the code.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to start MFA setup.'));
    } finally {
      setIsTwoFactorSaving(false);
    }
  };

  const handleProfilePictureChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!canChangeOwnProfilePicture) {
      onToast('error', 'You do not have permission to change your profile picture.');
      event.target.value = '';
      return;
    }

    setIsProfilePictureSaving(true);

    try {
      const response = await userService.uploadProfilePicture(account.id, file);
      onAccountUpdate({ ...account, profilePictureUrl: response.data.profilePictureUrl });
      onToast('success', 'Profile picture updated.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to update profile picture.'));
    } finally {
      setIsProfilePictureSaving(false);
      event.target.value = '';
    }
  };

  const selectProfilePictureFromMedia = async (item: MediaLibraryItem) => {
    if (!canChangeOwnProfilePicture) {
      onToast('error', 'You do not have permission to change your profile picture.');
      return;
    }

    setIsProfilePictureSaving(true);

    try {
      const response = await userService.setProfilePicture(account.id, item.url);
      onAccountUpdate({ ...account, profilePictureUrl: response.data.profilePictureUrl });
      setIsProfileMediaPickerOpen(false);
      onToast('success', 'Profile picture updated.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to update profile picture.'));
    } finally {
      setIsProfilePictureSaving(false);
    }
  };

  const handleEnableTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsTwoFactorSaving(true);

    try {
      const response = await authService.enableTwoFactor(account.id, twoFactorCode);
      if (response.data.account) {
        onAccountUpdate(response.data.account);
      }
      setTwoFactorSetup(null);
      setTwoFactorCode('');
      setRecoveryCodes(response.data.recoveryCodes || []);
      onToast('success', 'MFA enabled. Save your recovery codes.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Invalid verification code.'));
    } finally {
      setIsTwoFactorSaving(false);
    }
  };

  const handleDisableTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsTwoFactorSaving(true);

    try {
      const response = await authService.disableTwoFactor(account.id, disablePassword);
      if (response.data.account) {
        onAccountUpdate(response.data.account);
      }
      setDisablePassword('');
      setRecoveryCodes([]);
      onToast('success', 'MFA disabled.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to disable MFA.'));
    } finally {
      setIsTwoFactorSaving(false);
    }
  };

  const downloadPerformanceEvaluations = async () => {
    try {
      const response = await performanceEvaluationService.getAll();
      const evaluations = response.data.filter(
        (evaluation) => evaluation.employeeAccountId === account.id || evaluation.supervisorAccountId === account.id,
      );

      if (evaluations.length === 0) {
        setEvaluationCount(0);
        onToast('info', 'No performance evaluations are available to download.');
        return;
      }

      setEvaluationCount(evaluations.length);
      downloadPerformanceEvaluationPdf(evaluations);
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to download performance reports.'));
    }
  };

  useEffect(() => {
    if (activeTab !== 'reports') {
      return;
    }

    let isMounted = true;
    setIsEvaluationsLoading(true);
    performanceEvaluationService.getAll()
      .then((response) => {
        if (!isMounted) {
          return;
        }

        const availableEvaluations = response.data.filter(
          (evaluation) => evaluation.employeeAccountId === account.id || evaluation.supervisorAccountId === account.id,
        );
        setEvaluationCount(availableEvaluations.length);
      })
      .catch(() => {
        if (isMounted) {
          setEvaluationCount(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsEvaluationsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [account.id, activeTab]);

  const messageSoundSelection = notificationSounds.some((sound) => `custom:${sound.id}` === messagePreferences.messageSound)
    ? messagePreferences.messageSound
    : '';
  const reminderAlarmSoundSelection = notificationSounds.some((sound) => `custom:${sound.id}` === messagePreferences.reminderAlarmSound)
    ? messagePreferences.reminderAlarmSound
    : '';
  const desktopUpdateProgress = desktopUpdateStatus?.type === 'downloaded' || desktopUpdateStatus?.type === 'restarting'
    ? 100
    : desktopUpdateStatus?.type === 'downloading'
      ? Math.min(100, Math.max(0, Math.round(desktopUpdateStatus.percent || 0)))
      : 0;
  const showDesktopUpdateProgress = Boolean(desktopUpdateStatus && ['available', 'downloading', 'downloaded', 'restarting'].includes(desktopUpdateStatus.type));
  const desktopUpdateMessage = (() => {
    if (desktopUpdateStatus?.type === 'checking') {
      return 'Checking for desktop updates...';
    }

    if (desktopUpdateStatus?.type === 'available') {
      return desktopUpdateStatus.version
        ? `Desktop update ${desktopUpdateStatus.version} found. Download is starting...`
        : 'Desktop update found. Download is starting...';
    }

    if (desktopUpdateStatus?.type === 'downloading') {
      return 'Downloading desktop update...';
    }

    if (desktopUpdateStatus?.type === 'downloaded' || desktopUpdateStatus?.type === 'restarting') {
      return 'Update downloaded. The desktop app will restart automatically.';
    }

    if (desktopUpdateStatus?.type === 'not-available') {
      return 'Desktop app is up to date.';
    }

    if (desktopUpdateStatus?.type === 'error') {
      return 'Desktop update check failed. Verify the update files are reachable.';
    }

    if (desktopPreferences?.updateDownloaded) {
      return 'A desktop update is ready to install.';
    }

    return desktopPreferences?.updateConfigured
      ? 'The desktop app checks for updates automatically.'
      : 'Check for updates from this app. Newer desktop controls appear after the latest desktop update is installed.';
  })();

  return (
    <div className="space-y-3 pb-1">
      <div className="-mx-3 flex gap-2 overflow-x-auto border-b border-gray-200 px-3 pb-3 dark:border-gray-800 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {[
          ['general', 'General'],
          ['devices', 'Devices'],
          ['reports', 'Reports & Data'],
          ['preferences', 'Preferences'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={`shrink-0 rounded px-3 py-2 text-sm font-bold transition ${
              activeTab === id
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
      <>
      <ProfilePictureMediaPicker
        isOpen={isProfileMediaPickerOpen && canChangeOwnProfilePicture}
        isSaving={isProfilePictureSaving}
        onClose={() => setIsProfileMediaPickerOpen(false)}
        onSelect={selectProfilePictureFromMedia}
        onError={(message) => onToast('error', message)}
        getErrorMessage={getErrorMessage}
      />
      <section className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col items-center gap-3 text-center sm:flex-row sm:gap-4 sm:text-left">
            <button
              type="button"
              onClick={() => setIsProfileMediaPickerOpen(true)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-white text-accent dark:border-gray-700 dark:bg-gray-900 ${canChangeOwnProfilePicture ? 'group' : 'pointer-events-none'}`}
              aria-label={canChangeOwnProfilePicture ? 'Choose profile picture from media library' : 'Profile picture'}
              title={canChangeOwnProfilePicture ? 'Choose from media library' : 'Profile picture'}
              disabled={isProfilePictureSaving || !canChangeOwnProfilePicture}
            >
              {account.profilePictureUrl ? (
                <img
                  src={getAssetUrl(account.profilePictureUrl)}
                  alt={account.displayName}
                  onError={handleAssetImageError}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-base font-bold">
                  {getAccountInitials(account) || <UserCircle size={28} />}
                </span>
              )}
              {canChangeOwnProfilePicture && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                  <Image size={18} />
                </span>
              )}
            </button>
            {canChangeOwnProfilePicture && (
              <input
                ref={profilePictureInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProfilePictureChange}
              />
            )}
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">{account.displayName}</h3>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                {isProfilePictureSaving ? 'Updating profile picture...' : account.email}
              </p>
              {canChangeOwnProfilePicture && (
                <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <button type="button" onClick={() => setIsProfileMediaPickerOpen(true)} className="btn-secondary py-1.5 text-xs" disabled={isProfilePictureSaving} title="Choose from media library">
                    <Image size={14} />
                    Media Library
                  </button>
                  <button type="button" onClick={() => profilePictureInputRef.current?.click()} className="btn-secondary py-1.5 text-xs" disabled={isProfilePictureSaving} title="Upload profile picture">
                    <Camera size={14} />
                    Upload
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
            <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase text-accent">
              {account.role || 'user'}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                account.twoFactorEnabled
                  ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200'
                  : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {account.twoFactorEnabled ? 'MFA enabled' : 'MFA off'}
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
              <KeyRound size={19} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Password</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Update the password used to sign in.</p>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className={PASSWORD_INPUT_CLASS}
                autoComplete="current-password"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={PASSWORD_INPUT_CLASS}
                autoComplete="new-password"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Confirm new password</span>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                className={PASSWORD_INPUT_CLASS}
                autoComplete="new-password"
              />
            </label>

            <button type="submit" className="btn-primary" disabled={isPasswordSaving} aria-label="Update password" title={isPasswordSaving ? 'Saving' : 'Update Password'}>
              <Save size={16} />
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
              <ShieldCheck size={19} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Multi-Factor Authentication</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Use Google Authenticator, Microsoft Authenticator, or another TOTP app.</p>
            </div>
          </div>

          {!account.twoFactorEnabled && !twoFactorSetup && (
            <div className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Add an authenticator app to require a one-time code during sign in.
              </p>
              <button type="button" className="btn-primary" onClick={handleSetupTwoFactor} disabled={isTwoFactorSaving} aria-label="Set up authenticator app" title={isTwoFactorSaving ? 'Starting' : 'Set Up Authenticator App'}>
                <Smartphone size={16} />
              </button>
            </div>
          )}

          {!account.twoFactorEnabled && twoFactorSetup && (
            <form onSubmit={handleEnableTwoFactor} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                <div className="flex items-center justify-center rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:p-4">
                  {qrCodeDataUrl ? (
                    <img src={qrCodeDataUrl} alt="Authenticator setup QR code" className="h-44 w-44 sm:h-56 sm:w-56" />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <QrCode size={18} /> Generating QR code...
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Secret key</p>
                  <code className="block break-all rounded bg-white p-3 text-sm dark:bg-gray-900">{twoFactorSetup.secret}</code>
                </div>
              </div>

              <label className="block max-w-xs">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Verification code</span>
                <input
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>

              <button type="submit" className="btn-primary" disabled={isTwoFactorSaving} aria-label="Enable multi-factor authentication" title={isTwoFactorSaving ? 'Verifying' : 'Enable MFA'}>
                <ShieldCheck size={16} />
              </button>
            </form>
          )}

          {account.twoFactorEnabled && recoveryCodes.length > 0 && (
            <div className="mt-4 rounded border border-accent/30 bg-accent/10 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-primary-500 dark:text-blue-100">Recovery Codes</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Save these one-time codes now. Each code can be used once if your authenticator is unavailable.</p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(recoveryCodes.join('\n'));
                    onToast('success', 'Recovery codes copied.');
                  }}
                >
                  <Download size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {recoveryCodes.map((code) => (
                  <code key={code} className="rounded bg-white px-3 py-2 text-sm font-bold tracking-wide dark:bg-gray-900">{code}</code>
                ))}
              </div>
            </div>
          )}

          {account.twoFactorEnabled && (
            <form onSubmit={handleDisableTwoFactor} className="space-y-4">
              <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
                Authenticator app MFA is currently enabled for this account.
              </div>

              <label className="block max-w-md">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Password</span>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(event) => setDisablePassword(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
                  autoComplete="current-password"
                />
              </label>

              <button type="submit" className="btn-danger" disabled={isTwoFactorSaving} aria-label="Disable multi-factor authentication" title={isTwoFactorSaving ? 'Disabling' : 'Disable MFA'}>
                <X size={16} />
              </button>
            </form>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
              <LogOut size={19} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Active Sessions</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Review sign-ins and revoke sessions you no longer use.</p>
            </div>
          </div>
          <button type="button" onClick={revokeOtherSessions} className="btn-danger" disabled={isRevokingSessions || sessions.filter((session) => !session.isCurrent).length === 0} aria-label="Revoke other sessions" title="Revoke Others">
            <LogOut size={16} />
          </button>
        </div>

        {isSessionsLoading ? (
          <div className="loading">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No active sessions found.</div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="flex flex-col gap-3 rounded border border-gray-200 p-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    {session.isCurrent ? 'Current session' : 'Signed-in session'}
                  </p>
                  <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                    Created {new Date(session.createdAt).toLocaleString()} - Expires {new Date(session.expiresAt).toLocaleString()}
                  </p>
                </div>
                {!session.isCurrent && (
                  <button
                    type="button"
                    onClick={() => revokeSession(session.id)}
                    className="btn-danger h-9 w-9 p-0"
                    aria-label="Revoke session"
                    title="Revoke session"
                    disabled={isRevokingSessions}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      </>
      )}

      {activeTab === 'reports' && (
        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Reports & Data</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Download account-related records for review or offline files.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
              <p className="font-bold text-gray-900 dark:text-gray-100">Performance Evaluations</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Download evaluations you sent or received.</p>
              <div className="mt-3 flex gap-2">
                <Link to="/evaluations" onClick={onOpenEvaluations} className="btn-secondary" aria-label="Open performance evaluations" title="Open Evaluations">
                  <ExternalLink size={16} />
                </Link>
                <button
                  type="button"
                  onClick={downloadPerformanceEvaluations}
                  className="btn-primary"
                  disabled={isEvaluationsLoading || evaluationCount === 0}
                  aria-label="Download performance evaluations PDF"
                  title={isEvaluationsLoading ? 'Checking evaluations' : evaluationCount === 0 ? 'No evaluations available' : 'Download PDF'}
                >
                  <Download size={16} />
                </button>
              </div>
              {evaluationCount === 0 && <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">No evaluations are available for this account.</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'devices' && (
        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
              <Laptop size={19} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Assigned Devices</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Devices currently assigned to your account.</p>
            </div>
          </div>

          {isAssignedDevicesLoading ? (
            <div className="loading">Loading assigned devices...</div>
          ) : assignedDevices.length === 0 ? (
            <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No devices are assigned to you.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {assignedDevices.map((device) => (
                <article key={device.id} className="rounded border border-gray-200 p-3 dark:border-gray-800">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{device.assetTag}</p>
                      <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{device.type} - {device.makeModel}</p>
                    </div>
                    <span className="rounded bg-accent/10 px-2 py-1 text-xs font-bold text-accent">{device.status}</span>
                  </div>
                  <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-bold uppercase text-gray-400">Serial</dt>
                      <dd className="truncate text-gray-700 dark:text-gray-200">{device.serialNumber || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase text-gray-400">Location</dt>
                      <dd className="truncate text-gray-700 dark:text-gray-200">{device.location || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase text-gray-400">Phone</dt>
                      <dd className="truncate text-gray-700 dark:text-gray-200">{device.phoneNumber || 'N/A'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase text-gray-400">Replacement Due</dt>
                      <dd className="truncate text-gray-700 dark:text-gray-200">{device.replacementDueDate || 'N/A'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'preferences' && (
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Preferences</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Tune messaging, workspace layout, privacy, and guide options.</p>
          </div>

          <PreferenceGroup title="Appearance" description="Choose how the workspace looks on this device. Seasonal accents are managed by admins.">
            <div className="rounded border border-gray-200 p-4 dark:border-gray-800">
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Base theme</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Choose the core light or dark workspace for your account on this device.</span>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  ['light', 'Light', 'Clean bright workspace'],
                  ['dark', 'Dark', 'Low-light workspace'],
                ] as const).map(([themeValue, label, description]) => (
                  <button
                    key={themeValue}
                    type="button"
                    onClick={() => onAppThemeChange(themeValue)}
                    className={`rounded border px-3 py-3 text-left transition ${
                      appTheme === themeValue
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-accent dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200'
                    }`}
                  >
                    <span className="block text-sm font-black">{label}</span>
                    <span className="mt-1 block text-xs font-semibold opacity-75">{description}</span>
                  </button>
                ))}
              </div>
            </div>
            <PreferenceToggle
              title="Glass mode"
              description="Use translucent app surfaces with blur and depth in your selected light or dark theme."
              checked={isGlassTheme}
              onChange={onGlassThemeChange}
            />
          </PreferenceGroup>

          <PreferenceGroup title="Messaging" description="Control message availability, alerts, and sounds.">
            <PreferenceToggle
              title="Receive messages"
              description="Show message badges and message notifications."
              checked={messagePreferences.receiveMessages}
              disabled={!canChangeReceiveMessages}
              disabledReason="Permission required to change message receiving."
              onChange={onReceiveMessagesChange}
            />
            <PreferenceToggle
              title="Browser notifications"
              description="Show Windows/browser notifications for new messages and due reminders while the app is open."
              checked={messagePreferences.browserNotifications}
              onChange={onBrowserNotificationsChange}
            />
            <PreferenceToggle
              title="Message ping sound"
              description="Play a short sound when new unread messages arrive."
              checked={messagePreferences.playMessageSound}
              disabled={!messagePreferences.receiveMessages}
              onChange={onMessageSoundChange}
            />
            <PreferenceToggle
              title="Recent conversation bubbles"
              description="Show floating profile bubbles for recent conversations in the bottom-right corner."
              checked={!messagePreferences.hideRecentConversations}
              disabled={!messagePreferences.receiveMessages}
              onChange={(enabled) => onRecentConversationsHiddenChange(!enabled)}
            />
            <label className="block rounded border border-gray-200 p-4 dark:border-gray-800">
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Message sound</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Choose and preview the ping used when new unread messages arrive.</span>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <select
                    value={messageSoundSelection}
                    disabled={!messagePreferences.receiveMessages || !messagePreferences.playMessageSound || notificationSounds.length === 0}
                    onChange={(event) => onMessageSoundSelect(event.target.value)}
                    className="w-full appearance-none rounded border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm dark:border-gray-700 dark:bg-gray-950"
                  >
                    <option value="">{notificationSounds.length > 0 ? 'Choose sound' : 'No sounds uploaded'}</option>
                    {notificationSounds.map((sound) => (
                      <option key={sound.id} value={`custom:${sound.id}`}>{sound.label}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 dark:text-gray-500">
                    <ChevronDown size={16} />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onPreviewMessageSound(messageSoundSelection)}
                  disabled={!messagePreferences.receiveMessages || !messagePreferences.playMessageSound || !messageSoundSelection}
                  className="btn-secondary justify-center"
                  aria-label="Preview message sound"
                  title="Preview Sound"
                >
                  <Volume2 size={16} />
                  <span>Preview</span>
                </button>
              </div>
            </label>
            <label className="block rounded border border-gray-200 p-4 dark:border-gray-800">
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Reminder alarm sound</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Choose the alarm used when a reminder is due.</span>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <select
                    value={reminderAlarmSoundSelection}
                    onChange={(event) => onReminderAlarmSoundSelect(event.target.value)}
                    disabled={notificationSounds.length === 0}
                    className="w-full appearance-none rounded border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm dark:border-gray-700 dark:bg-gray-950"
                  >
                    <option value="">{notificationSounds.length > 0 ? 'Choose sound' : 'No sounds uploaded'}</option>
                    {notificationSounds.map((sound) => (
                      <option key={sound.id} value={`custom:${sound.id}`}>{sound.label}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 dark:text-gray-500">
                    <ChevronDown size={16} />
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onPreviewMessageSound(reminderAlarmSoundSelection)}
                  disabled={!reminderAlarmSoundSelection}
                  className="btn-secondary justify-center"
                  aria-label="Preview reminder alarm sound"
                  title="Preview Sound"
                >
                  <Volume2 size={16} />
                  <span>Preview</span>
                </button>
              </div>
            </label>
          </PreferenceGroup>

          <PreferenceGroup title="Desktop App" description={isDesktopApp ? 'Manage the desktop app on this workstation.' : 'Install the desktop version on this workstation.'}>
            <div className="rounded border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary-500/10 text-primary-500 dark:bg-blue-500/10 dark:text-blue-100">
                    <Laptop size={20} />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Desktop for Windows</h4>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {isDesktopApp ? 'You are using the installed desktop app.' : 'Download the Windows desktop installer for faster access from this device.'}
                    </p>
                    {isDesktopApp && desktopPreferences?.appVersion && (
                      <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
                        Version {desktopPreferences.appVersion}
                      </p>
                    )}
                  </div>
                </div>
                {!isDesktopApp && (
                  <a
                    href={desktopInstallerUrl}
                    download
                    className="btn-secondary justify-center"
                    aria-label="Download desktop app"
                    title="Download Desktop App"
                  >
                    <Download size={16} />
                    <span>Download App</span>
                  </a>
                )}
              </div>
            </div>
            {isDesktopApp && (
              <>
                {desktopPreferences && (
                  <>
                    <PreferenceToggle
                      title="Start with Windows"
                      description="Launch the app automatically when you sign in to this workstation."
                      checked={desktopPreferences.startWithWindows}
                      disabled={!canChangeStartWithWindows}
                      disabledReason="Permission required to change startup behavior."
                      onChange={onStartWithWindowsChange}
                      icon={<Power size={16} />}
                    />
                    <PreferenceToggle
                      title="Minimize to system tray"
                      description="Keep the app running in the tray when the desktop window is closed."
                      checked={desktopPreferences.trayMode}
                      disabled={!canChangeTrayMode}
                      disabledReason="Permission required to change tray behavior."
                      onChange={onTrayModeChange}
                      icon={<Laptop size={16} />}
                    />
                  </>
                )}
                <div className="flex flex-col gap-3 rounded border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Desktop updates</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{desktopUpdateMessage}</span>
                    {showDesktopUpdateProgress && (
                      <span className="mt-3 block">
                        <span className="mb-1 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                          <span>{desktopUpdateStatus?.type === 'restarting' ? 'Restarting' : 'Download'}</span>
                          <span>{desktopUpdateProgress}%</span>
                        </span>
                        <span className="block h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                          <span
                            className="block h-full rounded-full bg-accent transition-all duration-300"
                            style={{ width: `${desktopUpdateProgress}%` }}
                          />
                        </span>
                      </span>
                    )}
                  </span>
                  <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onCheckForDesktopUpdates}
                  className="btn-secondary justify-center"
                  aria-label="Check for desktop updates"
                      title="Check for Updates"
                    >
                      <RefreshCw size={16} />
                      <span>Check</span>
                    </button>
                    <button
                      type="button"
                      onClick={onInstallDesktopUpdate}
                      disabled={!desktopPreferences?.updateDownloaded}
                      className="btn-secondary justify-center disabled:pointer-events-none disabled:opacity-50"
                      aria-label="Restart desktop app to install update"
                      title={desktopPreferences?.updateDownloaded ? 'Restart To Update' : 'No Update Ready'}
                    >
                      <RefreshCw size={16} />
                      <span>Restart to Update</span>
                    </button>
                  </div>
                </div>
                <div className="rounded border border-gray-200 p-4 dark:border-gray-800">
                  <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Desktop diagnostics</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">View runtime health and recent desktop logs.</span>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={refreshDesktopDiagnostics}
                      disabled={isDesktopDiagnosticsLoading}
                      className="btn-secondary justify-center disabled:pointer-events-none disabled:opacity-50"
                      aria-label="Refresh desktop diagnostics"
                      title="Refresh desktop diagnostics"
                    >
                      <RefreshCw size={16} className={isDesktopDiagnosticsLoading ? 'animate-spin' : ''} />
                      <span>Refresh Snapshot</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenDesktopDiagnostics}
                      className="btn-secondary justify-center"
                      aria-label="Open desktop diagnostics log"
                      title="Open desktop diagnostics log"
                    >
                      <Download size={16} />
                      <span>Open Log</span>
                    </button>
                  </div>
                  {desktopDiagnostics && (
                    <div className="mt-4 rounded border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
                      <DiagnosticsRow label="App" value={`${desktopDiagnostics.appVersion} on ${desktopDiagnostics.platform}`} />
                      <DiagnosticsRow label="Uptime" value={formatUptime(desktopDiagnostics.uptimeSeconds)} />
                      <DiagnosticsRow label="Memory" value={`${formatBytes(desktopDiagnostics.memory.mainRssBytes)} main / ${formatBytes(desktopDiagnostics.memory.rendererWorkingSetBytes)} renderer`} />
                      <DiagnosticsRow label="Activity" value={`${desktopDiagnostics.unreadCount} unread, ${desktopDiagnostics.presenceStatus}`} />
                      <DiagnosticsRow label="Window" value={`${desktopDiagnostics.window.visible ? 'Visible' : 'Hidden'}${desktopDiagnostics.window.minimized ? ', minimized' : ''}`} />
                      <DiagnosticsRow label="Updates" value={desktopDiagnostics.update.configured ? desktopDiagnostics.update.status?.type || 'Ready' : 'Not configured'} />
                      <DiagnosticsRow label="Logs" value={`${desktopDiagnostics.logs.recentCount}/${desktopDiagnostics.logs.maxEntries} entries, ${desktopDiagnostics.crashes.pendingCount} crash reports`} />
                    </div>
                  )}
                </div>
              </>
            )}
          </PreferenceGroup>

          <PreferenceGroup title="Workspace" description="Adjust daily-entry inputs and quick launcher layout.">
            <PreferenceToggle
              title="Military time for Trooper Dailies"
              description="Use 24-hour time inputs instead of AM/PM toggles."
              checked={messagePreferences.useMilitaryTime}
              onChange={onMilitaryTimeChange}
            />
            <PreferenceToggle
              title="Hide quick launcher"
              description="Remove the quick launch dock from your workspace."
              checked={messagePreferences.hideQuickLaunch}
              onChange={onQuickLaunchHiddenChange}
            />
            <div className="rounded border border-gray-200 p-4 dark:border-gray-800">
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Quick launcher location</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Place quick launch at the bottom of the workspace or as a grid under the sidebar calendar.</span>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ['dock', 'Bottom dock'],
                  ['sidebar', 'Left panel grid'],
                ].map(([placement, label]) => (
                  <button
                    key={placement}
                    type="button"
                    onClick={() => onQuickLaunchPlacementChange(placement as 'dock' | 'sidebar')}
                    className={`rounded border px-3 py-2 text-sm font-black transition ${
                      messagePreferences.quickLaunchPlacement === placement
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-accent dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="block rounded border border-gray-200 p-4 dark:border-gray-800">
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Quick launcher slots</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Choose how many quick launch positions are available in your dock.</span>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={4}
                  max={10}
                  value={messagePreferences.quickLaunchSlotCount}
                  onChange={(event) => onQuickLaunchSlotCountChange(Number(event.target.value))}
                  className="min-w-0 flex-1"
                />
                <input
                  type="number"
                  min={4}
                  max={10}
                  value={messagePreferences.quickLaunchSlotCount}
                  onChange={(event) => onQuickLaunchSlotCountChange(Number(event.target.value))}
                  className="w-20 rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                  aria-label="Quick launcher slot count"
                />
              </div>
            </label>
            <label className="block rounded border border-gray-200 p-4 dark:border-gray-800">
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Default duty hours</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Used as the default hours for Trooper Daily shortcuts like Vacation Day and Sick Day.</span>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {['8', '8.5', '9.5', '10.5'].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => {
                      setDefaultDutyHoursInput(hours);
                      onDefaultDutyHoursChange(hours);
                    }}
                    className={`rounded border px-3 py-2 text-sm font-black transition ${
                      account.defaultDutyHours === hours
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-accent dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200'
                    }`}
                  >
                    {hours}h
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                max={24}
                step={0.25}
                value={defaultDutyHoursInput}
                onChange={(event) => setDefaultDutyHoursInput(event.target.value)}
                onBlur={() => onDefaultDutyHoursChange(defaultDutyHoursInput)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onDefaultDutyHoursChange(defaultDutyHoursInput);
                  }
                }}
                className="mt-3 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                aria-label="Default duty hours"
              />
            </label>
            <label className="block rounded border border-gray-200 p-4 dark:border-gray-800">
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">App scale</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Adjust the overall size of text, controls, and spacing.</span>
              <select
                value={account.appScale || 'comfortable'}
                onChange={(event) => onAppScaleChange(event.target.value as AuthAccount['appScale'])}
                className="mt-3 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
                <option value="large">Large</option>
              </select>
            </label>
          </PreferenceGroup>

          {(canUseIncognitoMode || canChangeCalendarPreference) && (
            <PreferenceGroup title="Privacy" description="Control what others can see from your profile and presence.">
              {canUseIncognitoMode && (
                <PreferenceToggle
                  title="Incognito mode"
                  description="Hide your online indicator and last-online timestamp from other users."
                  checked={Boolean(account.presenceHidden)}
                  onChange={onPresenceHiddenChange}
                  icon={<EyeOff size={16} />}
                />
              )}
              {canChangeCalendarPreference && (
                <PreferenceToggle
                  title="Hide profile calendar"
                  description="Hide the Calendar tab when others view your user profile."
                  checked={Boolean(account.calendarHidden)}
                  onChange={onCalendarHiddenChange}
                />
              )}
            </PreferenceGroup>
          )}

          {onReplayGuide && (
            <PreferenceGroup title="Guide" description="Replay onboarding when you want a refresher.">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-gray-200 p-4 dark:border-gray-800">
                <span>
                  <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Guided tour</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Replay the spotlight guide for navigation, alerts, messages, settings, and quick launch.</span>
                </span>
                <button type="button" onClick={onReplayGuide} className="btn-primary" aria-label="Replay guided tour" title="Replay Guide">
                  <ShieldCheck size={16} />
                </button>
              </div>
            </PreferenceGroup>
          )}
        </section>
      )}
    </div>
  );
}

function PreferenceGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-3">
        <h4 className="text-sm font-black uppercase tracking-[0.14em] text-accent">{title}</h4>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function PreferenceToggle({
  title,
  description,
  checked,
  disabled = false,
  disabledReason,
  icon,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  disabledReason?: string;
  icon?: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded border border-gray-200 p-4 dark:border-gray-800 ${disabled ? 'opacity-70' : ''}`}>
      <span className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">{icon}</span>}
        <span className="min-w-0">
          <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">{title}</span>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{description}</span>
          {disabled && disabledReason && <span className="mt-1 block text-xs font-bold text-gray-400 dark:text-gray-500">{disabledReason}</span>}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
