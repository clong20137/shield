/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ShieldDesktopNotificationPayload {
  title: string;
  body?: string;
  appPath?: string;
  silent?: boolean;
}

interface ShieldDesktopUpdateStatus {
  type: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'restarting' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

interface ShieldDesktopPreferences {
  startWithWindows: boolean;
  trayMode: boolean;
  appVersion?: string;
  updateDownloaded: boolean;
  updateConfigured: boolean;
  updateStatus?: ShieldDesktopUpdateStatus | null;
  startupUpdateInProgress?: boolean;
}

interface ShieldDesktopIdleStatus {
  status: 'active' | 'away' | 'busy';
  idleSeconds?: number;
}

interface ShieldDesktopWebAppUpdateStatus {
  type: 'reloading';
}

interface ShieldDesktopClipboardFile {
  name: string;
  type: string;
  size: number;
  base64: string;
}

interface ShieldDesktopCrashReport {
  id: string;
  source: string;
  message: string;
  stack?: string;
  extra?: Record<string, unknown>;
  appVersion?: string;
  platform?: string;
  createdAt: string;
}

interface ShieldDesktopLog {
  timestamp: string;
  event: string;
  platform?: string;
  version?: string;
  details?: Record<string, unknown>;
}

interface Window {
  shieldDesktop?: {
    platform: string;
    shell: 'electron';
    notify?: (payload: ShieldDesktopNotificationPayload) => Promise<boolean>;
    setUnreadCount?: (count: number) => Promise<boolean>;
    flashAttention?: () => Promise<boolean>;
    clearAttention?: () => Promise<boolean>;
    getClipboardFiles?: () => Promise<{ files: ShieldDesktopClipboardFile[] }>;
    getCrashReports?: () => Promise<{ reports: ShieldDesktopCrashReport[] }>;
    clearCrashReports?: (ids: string[]) => Promise<{ cleared: number }>;
    checkForUpdates?: () => Promise<{ ok: boolean; message?: string }>;
    installUpdate?: () => Promise<void>;
    getDesktopPreferences?: () => Promise<ShieldDesktopPreferences>;
    setStartWithWindows?: (startWithWindows: boolean) => Promise<ShieldDesktopPreferences>;
    setTrayMode?: (trayMode: boolean) => Promise<ShieldDesktopPreferences>;
    navigate?: (appPath: string) => Promise<boolean>;
    onNotificationClick?: (callback: (payload: { appPath?: string }) => void) => () => void;
    onUpdateStatus?: (callback: (payload: ShieldDesktopUpdateStatus) => void) => () => void;
    onIdleStatus?: (callback: (payload: ShieldDesktopIdleStatus) => void) => () => void;
    onWebAppUpdateStatus?: (callback: (payload: ShieldDesktopWebAppUpdateStatus) => void) => () => void;
    getDesktopLogs?: () => Promise<{
      path: string;
      entries: ShieldDesktopLog[];
      maxEntries: number;
    }>;
    openDesktopLogs?: () => Promise<{ ok: boolean; message?: string }>;
  };
}
