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
  type: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

interface Window {
  shieldDesktop?: {
    platform: string;
    shell: 'electron';
    notify: (payload: ShieldDesktopNotificationPayload) => Promise<boolean>;
    setUnreadCount: (count: number) => Promise<boolean>;
    flashAttention: () => Promise<boolean>;
    clearAttention: () => Promise<boolean>;
    checkForUpdates: () => Promise<{ ok: boolean; message?: string }>;
    installUpdate: () => Promise<void>;
    navigate: (appPath: string) => Promise<boolean>;
    onNotificationClick: (callback: (payload: { appPath?: string }) => void) => () => void;
    onUpdateStatus: (callback: (payload: ShieldDesktopUpdateStatus) => void) => () => void;
  };
}
