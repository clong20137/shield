const { app, BrowserWindow, Menu, Tray, clipboard, shell, ipcMain, Notification, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');

const defaultConfig = {
  appUrl: 'https://shield.example.gov',
  allowedOrigins: ['https://shield.example.gov'],
  updateUrl: ''
};

let mainWindow = null;
let desktopConfig = null;
let tray = null;
let isQuitting = false;
let isUpdateDownloaded = false;
let pendingUpdateRestartTimer = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

const desktopPreferencesDefault = {
  startWithWindows: false,
  trayMode: true
};

const clipboardFileSizeLimit = 25 * 1024 * 1024;

const mimeTypesByExtension = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function renderErrorPage({ title, message, detail, appUrl }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Arial, sans-serif;
      }
      body {
        min-height: 100vh;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0f172a;
        color: #e5e7eb;
      }
      main {
        width: min(680px, calc(100vw - 48px));
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(15, 23, 42, 0.92);
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 26px;
      }
      p {
        margin: 0 0 14px;
        color: #cbd5e1;
        line-height: 1.5;
      }
      code {
        display: block;
        margin-top: 10px;
        padding: 12px;
        overflow-wrap: anywhere;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: rgba(2, 6, 23, 0.72);
        color: #f8fafc;
      }
      .hint {
        margin-top: 18px;
        font-size: 13px;
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${detail ? `<code>${escapeHtml(detail)}</code>` : ''}
      ${appUrl ? `<p>Configured app URL:</p><code>${escapeHtml(appUrl)}</code>` : ''}
      <p class="hint">Press Ctrl+Shift+I in this desktop window to open diagnostics.</p>
    </main>
  </body>
</html>`;
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to read desktop config at ${filePath}:`, error);
    return null;
  }
}

function getMimeTypeForFile(filePath) {
  return mimeTypesByExtension[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function readClipboardFilePaths() {
  const formats = clipboard.availableFormats();
  const rawFileNameBuffer = formats.includes('FileNameW') ? clipboard.readBuffer('FileNameW') : null;
  if (!rawFileNameBuffer || rawFileNameBuffer.length === 0) {
    return [];
  }

  return rawFileNameBuffer
    .toString('utf16le')
    .split('\u0000')
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}

function readClipboardPayload() {
  const files = [];

  readClipboardFilePaths().forEach((filePath) => {
    try {
      const stats = fs.statSync(filePath);
      if (!stats.isFile() || stats.size > clipboardFileSizeLimit) {
        return;
      }

      files.push({
        name: path.basename(filePath),
        type: getMimeTypeForFile(filePath),
        size: stats.size,
        base64: fs.readFileSync(filePath).toString('base64')
      });
    } catch (error) {
      console.error(`Failed to read clipboard file at ${filePath}:`, error);
    }
  });

  const clipboardImage = clipboard.readImage();
  if (!clipboardImage.isEmpty() && files.length === 0) {
    const imageBuffer = clipboardImage.toPNG();
    if (imageBuffer.length <= clipboardFileSizeLimit) {
      files.push({
        name: `clipboard-image-${Date.now()}.png`,
        type: 'image/png',
        size: imageBuffer.length,
        base64: imageBuffer.toString('base64')
      });
    }
  }

  return { files };
}

function getDesktopPreferencesPath() {
  return path.join(app.getPath('userData'), 'desktop-preferences.json');
}

function getDesktopPreferences() {
  const preferences = readJsonIfExists(getDesktopPreferencesPath()) || {};
  const loginItemSettings = app.getLoginItemSettings();

  return {
    ...desktopPreferencesDefault,
    ...preferences,
    startWithWindows: Boolean(loginItemSettings.openAtLogin || preferences.startWithWindows)
  };
}

function saveDesktopPreferences(preferences) {
  const nextPreferences = {
    ...getDesktopPreferences(),
    ...preferences
  };

  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getDesktopPreferencesPath(), JSON.stringify(nextPreferences, null, 2));
  return nextPreferences;
}

function setStartWithWindows(startWithWindows) {
  const enabled = Boolean(startWithWindows);
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    path: process.execPath,
    args: ['--hidden']
  });

  return saveDesktopPreferences({ startWithWindows: enabled });
}

function getDesktopConfig() {
  const packagedConfigPath = path.join(process.resourcesPath || __dirname, 'config.json');
  const localConfigPath = path.join(__dirname, 'config.json');
  const userConfigPath = path.join(app.getPath('userData'), 'config.json');
  const fileConfig = readJsonIfExists(userConfigPath) || readJsonIfExists(packagedConfigPath) || readJsonIfExists(localConfigPath) || {};
  const appUrl = process.env.SHIELD_DESKTOP_URL || fileConfig.appUrl || defaultConfig.appUrl;
  const allowedOrigins = Array.isArray(fileConfig.allowedOrigins) && fileConfig.allowedOrigins.length > 0
    ? fileConfig.allowedOrigins
    : [appUrl];
  const updateUrl = process.env.SHIELD_UPDATE_URL || fileConfig.updateUrl || defaultConfig.updateUrl;

  return {
    appUrl,
    allowedOrigins,
    updateUrl
  };
}

function createShieldTrayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="7" fill="#0f172a"/>
    <path d="M16 4.2 25 7.4v6.8c0 5.8-3.7 10.9-9 13.6-5.3-2.7-9-7.8-9-13.6V7.4l9-3.2Z" fill="#2563eb"/>
    <path d="M16 7.1 22.2 9.3v4.6c0 4-2.5 7.6-6.2 9.7-3.7-2.1-6.2-5.7-6.2-9.7V9.3L16 7.1Z" fill="#e5e7eb"/>
    <path d="M16 9.2 20.1 10.7v3.1c0 2.7-1.6 5.1-4.1 6.8-2.5-1.7-4.1-4.1-4.1-6.8v-3.1L16 9.2Z" fill="#dc2626"/>
  </svg>`;

  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function rebuildTrayMenu() {
  if (!tray) {
    return;
  }

  const preferences = getDesktopPreferences();
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open Shield',
      click: showMainWindow
    },
    {
      label: 'Messages',
      click: () => {
        showMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('shield:desktop-notification-click', { appPath: '/messages' });
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: preferences.startWithWindows,
      click: (menuItem) => setStartWithWindows(menuItem.checked)
    },
    {
      label: 'Minimize to tray',
      type: 'checkbox',
      checked: preferences.trayMode,
      click: (menuItem) => {
        saveDesktopPreferences({ trayMode: menuItem.checked });
        rebuildTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'Check for updates',
      click: () => {
        autoUpdater.checkForUpdates().catch((error) => sendUpdaterStatus('error', { message: error.message }));
      }
    },
    {
      label: 'Restart to update',
      enabled: isUpdateDownloaded,
      click: installDownloadedUpdate
    },
    { type: 'separator' },
    {
      label: 'Quit Shield',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
}

function createTray() {
  if (tray) {
    return;
  }

  tray = new Tray(createShieldTrayIcon());
  tray.setToolTip('Shield');
  tray.on('double-click', showMainWindow);
  rebuildTrayMenu();
}

function getOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function getUrlForAppPath(appUrl, appPath) {
  try {
    if (!appPath || typeof appPath !== 'string') {
      return appUrl;
    }

    return new URL(appPath.replace(/^\/+/u, ''), appUrl.endsWith('/') ? appUrl : `${appUrl}/`).toString();
  } catch {
    return appUrl;
  }
}

function createBadgeOverlay(count) {
  if (!count || count <= 0) {
    return null;
  }

  const label = count > 99 ? '99+' : String(count);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="15" fill="#dc2626"/>
    <text x="16" y="21" text-anchor="middle" font-family="Arial, sans-serif" font-size="${label.length > 2 ? 11 : 15}" font-weight="700" fill="#ffffff">${label}</text>
  </svg>`;

  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

function updateUnreadBadge(count) {
  if (!mainWindow) {
    return;
  }

  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  app.setBadgeCount(safeCount);

  if (process.platform === 'win32') {
    const overlay = createBadgeOverlay(safeCount);
    mainWindow.setOverlayIcon(overlay, safeCount > 0 ? `${safeCount} unread item${safeCount === 1 ? '' : 's'}` : '');
  }
}

function showDesktopNotification(payload) {
  if (!Notification.isSupported()) {
    return false;
  }

  const title = typeof payload?.title === 'string' && payload.title.trim() ? payload.title.trim() : 'Shield';
  const body = typeof payload?.body === 'string' ? payload.body : '';
  const appPath = typeof payload?.appPath === 'string' ? payload.appPath : '';
  const notification = new Notification({
    title,
    body,
    silent: Boolean(payload?.silent),
  });

  notification.on('click', () => {
    if (!mainWindow) {
      createMainWindow();
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('shield:desktop-notification-click', { appPath });
    }
  });

  notification.show();
  return true;
}

function sendUpdaterStatus(type, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shield:update-status', { type, ...payload });
  }
}

function installDownloadedUpdate() {
  if (pendingUpdateRestartTimer) {
    clearTimeout(pendingUpdateRestartTimer);
    pendingUpdateRestartTimer = null;
  }

  sendUpdaterStatus('restarting');
  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
}

function configureAutoUpdates(config) {
  if (!config.updateUrl) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: config.updateUrl
  });

  autoUpdater.on('checking-for-update', () => sendUpdaterStatus('checking'));
  autoUpdater.on('update-available', (info) => sendUpdaterStatus('available', { version: info.version }));
  autoUpdater.on('update-not-available', (info) => sendUpdaterStatus('not-available', { version: info.version }));
  autoUpdater.on('download-progress', (progress) => sendUpdaterStatus('downloading', { percent: Math.round(progress.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => {
    isUpdateDownloaded = true;
    rebuildTrayMenu();
    sendUpdaterStatus('downloaded', { version: info.version });
    showDesktopNotification({
      title: 'Shield update downloaded',
      body: 'Shield will restart automatically to finish installing the desktop update.'
    });
    pendingUpdateRestartTimer = setTimeout(installDownloadedUpdate, 5000);
  });
  autoUpdater.on('error', (error) => sendUpdaterStatus('error', { message: error.message }));

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => sendUpdaterStatus('error', { message: error.message }));
  }, 15000);
}

function createMainWindow() {
  desktopConfig = getDesktopConfig();
  const allowedOrigins = new Set(desktopConfig.allowedOrigins.map(getOrigin).filter(Boolean));
  const appOrigin = getOrigin(desktopConfig.appUrl);
  if (appOrigin) {
    allowedOrigins.add(appOrigin);
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: 'Shield',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (event) => {
    const preferences = getDesktopPreferences();
    if (!isQuitting && preferences.trayMode) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    const failedUrl = validatedUrl || desktopConfig.appUrl;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderErrorPage({
      title: 'Shield could not load',
      message: 'The desktop app opened, but it could not reach the configured Shield web address.',
      detail: `${errorCode}: ${errorDescription}`,
      appUrl: failedUrl
    }))}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderErrorPage({
      title: 'Shield desktop renderer stopped',
      message: 'The desktop window process stopped unexpectedly.',
      detail: details.reason,
      appUrl: desktopConfig.appUrl
    }))}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const origin = getOrigin(url);
    if (allowedOrigins.has(origin)) {
      return { action: 'allow' };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const origin = getOrigin(url);
    if (!allowedOrigins.has(origin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(desktopConfig.appUrl).catch((error) => {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderErrorPage({
      title: 'Shield could not load',
      message: 'The desktop app could not open the configured Shield web address.',
      detail: error.message,
      appUrl: desktopConfig.appUrl
    }))}`);
  });
}

app.setAppUserModelId('com.shield.desktop');

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createTray();
    createMainWindow();
    configureAutoUpdates(desktopConfig);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

ipcMain.handle('shield:desktop-notification', (_event, payload) => showDesktopNotification(payload));
ipcMain.handle('shield:set-unread-count', (_event, count) => {
  updateUnreadBadge(count);
  return true;
});
ipcMain.handle('shield:flash-attention', () => {
  if (mainWindow) {
    mainWindow.flashFrame(true);
  }
  return true;
});
ipcMain.handle('shield:clear-attention', () => {
  if (mainWindow) {
    mainWindow.flashFrame(false);
  }
  return true;
});
ipcMain.handle('shield:check-for-updates', async () => {
  if (!desktopConfig?.updateUrl) {
    return { ok: false, message: 'Desktop update URL is not configured.' };
  }

  await autoUpdater.checkForUpdates();
  return { ok: true };
});
ipcMain.handle('shield:install-update', () => {
  installDownloadedUpdate();
});
ipcMain.handle('shield:get-clipboard-files', () => readClipboardPayload());
ipcMain.handle('shield:get-desktop-preferences', () => ({
  ...getDesktopPreferences(),
  updateDownloaded: isUpdateDownloaded,
  updateConfigured: Boolean(desktopConfig?.updateUrl)
}));
ipcMain.handle('shield:set-start-with-windows', (_event, startWithWindows) => {
  const preferences = setStartWithWindows(startWithWindows);
  rebuildTrayMenu();
  return {
    ...preferences,
    updateDownloaded: isUpdateDownloaded,
    updateConfigured: Boolean(desktopConfig?.updateUrl)
  };
});
ipcMain.handle('shield:set-tray-mode', (_event, trayMode) => {
  const preferences = saveDesktopPreferences({ trayMode: Boolean(trayMode) });
  rebuildTrayMenu();
  return {
    ...preferences,
    updateDownloaded: isUpdateDownloaded,
    updateConfigured: Boolean(desktopConfig?.updateUrl)
  };
});
ipcMain.handle('shield:navigate', (_event, appPath) => {
  if (!mainWindow || !desktopConfig) {
    return false;
  }

  mainWindow.loadURL(getUrlForAppPath(desktopConfig.appUrl, appPath));
  return true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
