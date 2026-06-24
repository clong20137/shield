const { app, BrowserWindow, Menu, Tray, clipboard, shell, ipcMain, Notification, nativeImage, powerMonitor } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

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
let desktopUnreadCount = 0;
let desktopIdleCheckTimer = null;
let desktopPresenceStatus = 'active';
let desktopSessionAuthenticated = false;
let desktopSessionLastActivityAt = Date.now();
let desktopSessionTimeoutMinutes = 0;
let desktopSessionTimeoutTimer = null;
let desktopSessionTimedOut = false;
let desktopUpdateCheckTimer = null;
let lastDesktopUpdateStatus = null;
let isDesktopUpdateCheckRunning = false;
let isStartupDesktopUpdateInProgress = false;
let startupDesktopUpdateFallbackTimer = null;
let rendererCrashReloadCount = 0;
let rendererCrashResetTimer = null;
const pendingCrashReports = [];

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

const desktopPreferencesDefault = {
  startWithWindows: true,
  trayMode: true
};

const clipboardFileSizeLimit = 25 * 1024 * 1024;
const webAppUpdateCheckIntervalMs = 30 * 1000;
const webAppReloadCooldownMs = 15 * 1000;
const desktopUpdateCheckIntervalMs = 15 * 60 * 1000;
const desktopStartupUpdateFallbackMs = 2 * 60 * 1000;
const desktopStartupUpdateRestartDelayMs = 1500;
const desktopUpdateRestartDelayMs = 5000;
const maxPendingCrashReports = 10;
const maxRendererCrashReloads = 2;
const rendererCrashStableResetMs = 30 * 1000;
const desktopIdleThresholdSeconds = 5 * 60;
const desktopIdleCheckIntervalMs = 15 * 1000;
const desktopSessionTimeoutCheckIntervalMs = 5 * 1000;
const webAppSignatureRequestTimeoutMs = 10 * 1000;
const webAppLoadRetryBaseMs = 2 * 1000;
const webAppLoadRetryMaxMs = 25 * 1000;

const pngCrcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function pngCrc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = pngCrcTable[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  const crcBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  crcBuffer.writeUInt32BE(pngCrc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function createPngImage(width, height, draw) {
  const pixels = Buffer.alloc(width * height * 4, 0);
  const canvas = {
    width,
    height,
    setPixel(x, y, color) {
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= width || py >= height) {
        return;
      }
      const offset = (py * width + px) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  };

  draw(canvas);

  const rawRows = [];
  for (let y = 0; y < height; y += 1) {
    rawRows.push(Buffer.from([0]));
    rawRows.push(pixels.subarray(y * width * 4, (y + 1) * width * 4));
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return nativeImage.createFromBuffer(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createPngChunk('IHDR', header),
    createPngChunk('IDAT', zlib.deflateSync(Buffer.concat(rawRows))),
    createPngChunk('IEND', Buffer.alloc(0))
  ]));
}

function colorToRgba(hex, alpha = 255) {
  const value = String(hex || '#000000').replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) || 0,
    parseInt(value.slice(2, 4), 16) || 0,
    parseInt(value.slice(4, 6), 16) || 0,
    alpha
  ];
}

function drawCircle(canvas, centerX, centerY, radius, color) {
  const radiusSquared = radius * radius;
  for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y += 1) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radiusSquared) {
        canvas.setPixel(x, y, color);
      }
    }
  }
}

function drawRect(canvas, x, y, width, height, color) {
  for (let py = Math.round(y); py < Math.round(y + height); py += 1) {
    for (let px = Math.round(x); px < Math.round(x + width); px += 1) {
      canvas.setPixel(px, py, color);
    }
  }
}

function drawRoundedRect(canvas, x, y, width, height, radius, color) {
  const right = x + width - 1;
  const bottom = y + height - 1;
  for (let py = Math.round(y); py <= Math.round(bottom); py += 1) {
    for (let px = Math.round(x); px <= Math.round(right); px += 1) {
      const nearLeft = px < x + radius;
      const nearRight = px > right - radius;
      const nearTop = py < y + radius;
      const nearBottom = py > bottom - radius;
      if ((nearLeft && nearTop && (px - (x + radius)) ** 2 + (py - (y + radius)) ** 2 > radius ** 2) ||
        (nearRight && nearTop && (px - (right - radius)) ** 2 + (py - (y + radius)) ** 2 > radius ** 2) ||
        (nearLeft && nearBottom && (px - (x + radius)) ** 2 + (py - (bottom - radius)) ** 2 > radius ** 2) ||
        (nearRight && nearBottom && (px - (right - radius)) ** 2 + (py - (bottom - radius)) ** 2 > radius ** 2)) {
        continue;
      }
      canvas.setPixel(px, py, color);
    }
  }
}

function drawPolygon(canvas, points, color) {
  const minY = Math.floor(Math.min(...points.map((point) => point[1])));
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let index = 0; index < points.length; index += 1) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        intersections.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let pair = 0; pair < intersections.length; pair += 2) {
      for (let x = Math.ceil(intersections[pair]); x <= Math.floor(intersections[pair + 1]); x += 1) {
        canvas.setPixel(x, y, color);
      }
    }
  }
}

const digitPatterns = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['010', '010', '111', '010', '010']
};

function drawPixelText(canvas, text, x, y, scale, color) {
  let cursorX = x;
  for (const char of String(text)) {
    const pattern = digitPatterns[char];
    if (!pattern) {
      cursorX += 2 * scale;
      continue;
    }
    pattern.forEach((row, rowIndex) => {
      row.split('').forEach((cell, columnIndex) => {
        if (cell === '1') {
          drawRect(canvas, cursorX + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
        }
      });
    });
    cursorX += 4 * scale;
  }
}
const maxWebAppLoadRetries = 8;
const maxDesktopLogEntries = 150;
let webAppUpdateCheckTimer = null;
let webAppSignature = null;
let isWebAppUpdateCheckRunning = false;
let lastWebAppReloadAt = 0;
let webAppLoadRetryTimer = null;
let webAppLoadRetryCount = 0;
const pendingDesktopLogs = [];

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

function normalizeCrashDetail(value) {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack || ''
    };
  }

  if (typeof value === 'object' && value !== null) {
    let fallbackMessage = 'Desktop error object';
    try {
      fallbackMessage = JSON.stringify(value);
    } catch {
      fallbackMessage = Object.prototype.toString.call(value);
    }

    return {
      message: value.message || fallbackMessage,
      stack: value.stack || ''
    };
  }

  return {
    message: String(value || 'Unknown desktop error'),
    stack: ''
  };
}

function recordDesktopCrash(source, error, extra = {}) {
  const detail = normalizeCrashDetail(error);
  pendingCrashReports.unshift({
    id: crypto.randomUUID(),
    source,
    message: detail.message,
    stack: detail.stack,
    extra,
    appVersion: app.getVersion(),
    platform: process.platform,
    createdAt: new Date().toISOString()
  });

  if (pendingCrashReports.length > maxPendingCrashReports) {
    pendingCrashReports.length = maxPendingCrashReports;
  }

  appendDesktopLog('desktop-crash', {
    source,
    message: detail.message,
    stack: detail.stack,
    ...extra
  });
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

function getDesktopLogPath() {
  const logsDir = app.getPath('logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return path.join(logsDir, 'shield-desktop.log');
}

function appendDesktopLog(eventName, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event: eventName,
    platform: process.platform,
    version: app.getVersion(),
    details: typeof details === 'string' ? { message: details } : details
  };

  pendingDesktopLogs.unshift(entry);
  if (pendingDesktopLogs.length > maxDesktopLogEntries) {
    pendingDesktopLogs.length = maxDesktopLogEntries;
  }

  try {
    fs.appendFileSync(
      getDesktopLogPath(),
      `${JSON.stringify(entry)}\n`,
      'utf8',
    );
  } catch (error) {
    console.error('Failed to write Shield desktop log:', error);
  }

  return entry;
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

function ensureDefaultDesktopPreferences() {
  const preferences = readJsonIfExists(getDesktopPreferencesPath()) || {};
  if (!Object.prototype.hasOwnProperty.call(preferences, 'startWithWindows')) {
    setStartWithWindows(desktopPreferencesDefault.startWithWindows);
  }

  if (!Object.prototype.hasOwnProperty.call(preferences, 'trayMode')) {
    saveDesktopPreferences({ trayMode: desktopPreferencesDefault.trayMode });
  }
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
  const updateUrl = process.env.SHIELD_UPDATE_URL || fileConfig.updateUrl || defaultConfig.updateUrl || getDefaultUpdateUrl(appUrl);

  return {
    appUrl,
    allowedOrigins,
    updateUrl
  };
}

function getDefaultUpdateUrl(appUrl) {
  try {
    return new URL('/downloads/', appUrl).toString();
  } catch {
    return '';
  }
}

function createShieldTrayIcon(count = desktopUnreadCount, status = desktopPresenceStatus) {
  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  const presenceColor = colorToRgba(getPresenceDotColor(status || 'active'));

  return createPngImage(32, 32, (canvas) => {
    drawRoundedRect(canvas, 1, 1, 30, 30, 7, colorToRgba('#0f172a'));
    drawPolygon(canvas, [[16, 4], [25, 7.5], [25, 15], [22, 23], [16, 28], [10, 23], [7, 15], [7, 7.5]], colorToRgba('#2563eb'));
    drawPolygon(canvas, [[16, 7], [22, 9.5], [22, 14.5], [20, 20.5], [16, 24], [12, 20.5], [10, 14.5], [10, 9.5]], colorToRgba('#e5e7eb'));
    drawPolygon(canvas, [[16, 10], [20, 12], [20, 15], [18.5, 19], [16, 21], [13.5, 19], [12, 15], [12, 12]], colorToRgba('#dc2626'));
    if (safeCount > 0) {
      const label = safeCount > 99 ? '99+' : String(safeCount);
      drawRoundedRect(canvas, 1, 2, label.length > 2 ? 20 : 16, 11, 5, colorToRgba('#dc2626'));
      drawPixelText(canvas, label, label.length > 2 ? 3 : 4, 4, 1, colorToRgba('#ffffff'));
    }
    drawCircle(canvas, 25, 25, 6.7, colorToRgba('#ffffff'));
    drawCircle(canvas, 25, 25, 4.9, presenceColor);
  });
}

function createBaseAppIcon() {
  const iconPath = getShieldIconPath();
  if (iconPath) {
    return nativeImage.createFromPath(iconPath);
  }

  return createShieldTrayIcon(0, 'active');
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
  const activityLabel = desktopUnreadCount > 0 ? `Activity: ${desktopUnreadCount > 99 ? '99+' : desktopUnreadCount}` : 'Activity: Clear';
  const statusLabel = getPresenceStatusLabel(desktopPresenceStatus);
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open Shield',
      click: showMainWindow
    },
    {
      label: `Status: ${statusLabel}`,
      enabled: false
    },
    {
      label: activityLabel,
      enabled: false
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

function updateTrayBadge(count) {
  if (!tray) {
    return;
  }

  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  const statusLabel = getPresenceStatusLabel(desktopPresenceStatus);
  tray.setImage(createShieldTrayIcon(safeCount, desktopPresenceStatus));
  tray.setToolTip(safeCount > 0 ? `Shield - ${statusLabel} - ${safeCount} unread item${safeCount === 1 ? '' : 's'}` : `Shield - ${statusLabel}`);
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

function getWebAppUpdateCheckUrl(appUrl) {
  const url = new URL(appUrl);
  url.searchParams.set('shieldDesktopUpdateCheck', String(Date.now()));
  return url.toString();
}

async function fetchWebAppSignature(appUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, webAppSignatureRequestTimeoutMs);

  try {
    const response = await fetch(getWebAppUpdateCheckUrl(appUrl), {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,*/*',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`Web app update check failed with HTTP ${response.status}`);
    }

    const body = await response.text();
    return crypto
      .createHash('sha256')
      .update(body)
      .digest('hex');
  } finally {
    clearTimeout(timeout);
  }
}

async function checkForWebAppUpdate({ initial = false } = {}) {
  if (!desktopConfig?.appUrl || !/^https?:\/\//iu.test(desktopConfig.appUrl) || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (isWebAppUpdateCheckRunning) {
    return;
  }

  isWebAppUpdateCheckRunning = true;

  try {
    appendDesktopLog('web-app-update-check-started');
    const nextSignature = await fetchWebAppSignature(desktopConfig.appUrl);
    if (initial || !webAppSignature) {
      webAppSignature = nextSignature;
      return;
    }

    if (nextSignature !== webAppSignature && Date.now() - lastWebAppReloadAt > webAppReloadCooldownMs) {
      webAppSignature = nextSignature;
      lastWebAppReloadAt = Date.now();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shield:web-app-update-status', { type: 'reloading' });
      }
      appendDesktopLog('web-app-update-detected', { action: 'reloadIgnoringCache' });
      mainWindow.webContents.reloadIgnoringCache();
    }
  } catch (error) {
    appendDesktopLog('web-app-update-check-failed', {
      message: error instanceof Error ? error.message : String(error)
    });
    console.error('Failed to check hosted Shield web app version:', error);
  } finally {
    isWebAppUpdateCheckRunning = false;
  }
}

function clearWebAppLoadRetryTimer() {
  if (webAppLoadRetryTimer) {
    clearTimeout(webAppLoadRetryTimer);
    webAppLoadRetryTimer = null;
  }
}

function getWebAppLoadRetryDelay() {
  const attempt = webAppLoadRetryCount + 1;
  const delay = Math.min(webAppLoadRetryMaxMs, webAppLoadRetryBaseMs * (2 ** (attempt - 1)));
  return { attempt, delay };
}

function scheduleWebAppLoadRetry(failedUrl) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (webAppLoadRetryCount >= maxWebAppLoadRetries) {
    appendDesktopLog('web-app-load-retry-limit-reached', { failedUrl });
    return;
  }

  const { attempt, delay } = getWebAppLoadRetryDelay();
  webAppLoadRetryCount = attempt;
  appendDesktopLog('web-app-load-retry-scheduled', { attempt, delay, failedUrl });

  clearWebAppLoadRetryTimer();
  webAppLoadRetryTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const targetUrl = failedUrl || desktopConfig?.appUrl;
    mainWindow.webContents.loadURL(targetUrl, { extraHeaders: 'Cache-Control: no-cache' }).catch((error) => {
      appendDesktopLog('web-app-load-retry-load-failed', {
        attempt,
        error: error?.message || String(error),
      });
    });
  }, delay);
}

function handleWebAppLoadFailure(errorCode, errorDescription, failedUrl) {
  appendDesktopLog('web-app-load-failed', {
    code: errorCode,
    message: errorDescription,
    failedUrl
  });

  if (!failedUrl || failedUrl.startsWith('data:')) {
    return;
  }

  scheduleWebAppLoadRetry(failedUrl);
}

function setWebAppLoadSuccess() {
  webAppLoadRetryCount = 0;
  clearWebAppLoadRetryTimer();
}

function stopDesktopSessionTimeoutChecks() {
  if (desktopSessionTimeoutTimer) {
    clearInterval(desktopSessionTimeoutTimer);
    desktopSessionTimeoutTimer = null;
  }
}

function getNormalizedSessionTimeoutMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) ? Math.max(0, Math.min(1440, minutes)) : 0;
}

function checkDesktopSessionTimeout({ force = false } = {}) {
  if (!desktopSessionAuthenticated || desktopSessionTimeoutMinutes <= 0 || desktopSessionTimedOut) {
    return;
  }

  const timeoutMs = desktopSessionTimeoutMinutes * 60 * 1000;
  const elapsedMs = Date.now() - desktopSessionLastActivityAt;
  const systemIdleMs = powerMonitor.getSystemIdleTime() * 1000;
  const inactiveMs = Math.max(elapsedMs, systemIdleMs);

  if (!force && inactiveMs < timeoutMs) {
    return;
  }

  if (inactiveMs >= timeoutMs && mainWindow && !mainWindow.isDestroyed()) {
    desktopSessionTimedOut = true;
    appendDesktopLog('desktop-session-timeout', {
      timeoutMinutes: desktopSessionTimeoutMinutes,
      inactiveSeconds: Math.floor(inactiveMs / 1000)
    });
    mainWindow.webContents.send('shield:session-timeout', {
      timeoutMinutes: desktopSessionTimeoutMinutes,
      inactiveSeconds: Math.floor(inactiveMs / 1000)
    });
  }
}

function startDesktopSessionTimeoutChecks() {
  stopDesktopSessionTimeoutChecks();

  if (!desktopSessionAuthenticated || desktopSessionTimeoutMinutes <= 0) {
    return;
  }

  desktopSessionTimeoutTimer = setInterval(() => checkDesktopSessionTimeout(), desktopSessionTimeoutCheckIntervalMs);
  checkDesktopSessionTimeout();
}

function configureDesktopSessionTimeout(options = {}) {
  desktopSessionAuthenticated = Boolean(options.authenticated);
  desktopSessionTimeoutMinutes = getNormalizedSessionTimeoutMinutes(options.minutes);
  desktopSessionLastActivityAt = Date.now();
  desktopSessionTimedOut = false;

  if (!desktopSessionAuthenticated || desktopSessionTimeoutMinutes <= 0) {
    stopDesktopSessionTimeoutChecks();
    return {
      authenticated: desktopSessionAuthenticated,
      minutes: desktopSessionTimeoutMinutes,
      enabled: false
    };
  }

  startDesktopSessionTimeoutChecks();
  return {
    authenticated: desktopSessionAuthenticated,
    minutes: desktopSessionTimeoutMinutes,
    enabled: true
  };
}

function reportDesktopSessionActivity() {
  if (!desktopSessionAuthenticated || desktopSessionTimedOut) {
    return false;
  }

  desktopSessionLastActivityAt = Date.now();
  return true;
}

function sendDesktopIdleStatus(status, idleSeconds) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shield:desktop-idle-status', { status, idleSeconds });
  }
}

function setDesktopPresenceStatus(status, options = {}) {
  if (!['active', 'away', 'busy'].includes(status)) {
    return desktopPresenceStatus;
  }

  if (!options.force && status === desktopPresenceStatus) {
    return desktopPresenceStatus;
  }

  desktopPresenceStatus = status;
  updateUnreadBadge(desktopUnreadCount);
  return desktopPresenceStatus;
}

function checkDesktopIdleStatus({ force = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const idleState = powerMonitor.getSystemIdleState(desktopIdleThresholdSeconds);
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const isWindowActive = mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused();
  const nextStatus = isWindowActive ? (idleState === 'active' ? 'active' : 'away') : 'busy';

  if (force || nextStatus !== desktopPresenceStatus) {
    sendDesktopIdleStatus(nextStatus, idleSeconds);
    setDesktopPresenceStatus(nextStatus, { force });
  }
}

function startDesktopIdleChecks() {
  if (desktopIdleCheckTimer) {
    clearInterval(desktopIdleCheckTimer);
  }

  checkDesktopIdleStatus({ force: true });
  desktopIdleCheckTimer = setInterval(() => checkDesktopIdleStatus(), desktopIdleCheckIntervalMs);
}

function stopDesktopIdleChecks() {
  if (desktopIdleCheckTimer) {
    clearInterval(desktopIdleCheckTimer);
    desktopIdleCheckTimer = null;
  }
}

function registerPowerMonitorEvents() {
  powerMonitor.on('resume', () => checkDesktopIdleStatus({ force: true }));
  powerMonitor.on('unlock-screen', () => checkDesktopIdleStatus({ force: true }));
  powerMonitor.on('lock-screen', () => {
    sendDesktopIdleStatus('busy', powerMonitor.getSystemIdleTime());
    setDesktopPresenceStatus('busy', { force: true });
  });
}

function getPresenceDotColor(status) {
  switch (status) {
    case 'active':
      return '#22c55e';
    case 'away':
      return '#facc15';
    case 'busy':
      return '#ef4444';
    default:
      return '#22c55e';
  }
}

function getPresenceStatusLabel(status) {
  switch (status) {
    case 'active':
      return 'Active';
    case 'away':
      return 'Away';
    case 'busy':
      return 'Busy';
    default:
      return 'Active';
  }
}

function startWebAppUpdateChecks() {
  if (webAppUpdateCheckTimer) {
    clearInterval(webAppUpdateCheckTimer);
    webAppUpdateCheckTimer = null;
  }

  webAppSignature = null;
  void checkForWebAppUpdate({ initial: true });
  webAppUpdateCheckTimer = setInterval(() => {
    void checkForWebAppUpdate();
  }, webAppUpdateCheckIntervalMs);
}

function stopWebAppUpdateChecks() {
  if (webAppUpdateCheckTimer) {
    clearInterval(webAppUpdateCheckTimer);
    webAppUpdateCheckTimer = null;
  }
}

function createBadgeOverlay(count, status) {
  const presenceColor = colorToRgba(getPresenceDotColor(status || 'active'));
  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;

  return createPngImage(64, 64, (canvas) => {
    if (safeCount > 0) {
      const label = safeCount > 99 ? '99+' : String(safeCount);
      drawRoundedRect(canvas, 2, 9, label.length > 2 ? 44 : 36, 29, 14, colorToRgba('#dc2626'));
      drawPixelText(canvas, label, label.length > 2 ? 9 : 12, 15, label.length > 2 ? 3 : 4, colorToRgba('#ffffff'));
      drawCircle(canvas, 48, 48, 15, colorToRgba('#ffffff'));
      drawCircle(canvas, 48, 48, 11, presenceColor);
      return;
    }

    drawCircle(canvas, 42, 42, 18, colorToRgba('#ffffff'));
    drawCircle(canvas, 42, 42, 13, presenceColor);
  });
}

function getShieldIconPath() {
  const iconCandidates = process.platform === 'win32'
    ? ['icon.ico', 'icon.png']
    : ['icon.png', 'icon.ico'];

  const buildPath = path.join(__dirname, 'build');
  for (const iconName of iconCandidates) {
    const iconPath = path.join(buildPath, iconName);
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }

  return null;
}

function updateUnreadBadge(count) {
  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  desktopUnreadCount = safeCount;
  app.setBadgeCount(safeCount);
  updateTrayBadge(safeCount);

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (process.platform === 'win32') {
    const overlay = createBadgeOverlay(safeCount, desktopPresenceStatus);
    const statusLabel = getPresenceStatusLabel(desktopPresenceStatus);
    const overlayToolTip = safeCount > 0
      ? `${safeCount} unread item${safeCount === 1 ? '' : 's'} (${statusLabel})`
      : `${statusLabel}`;
    mainWindow.setOverlayIcon(overlay, overlayToolTip);
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
  lastDesktopUpdateStatus = { type, ...payload };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shield:update-status', lastDesktopUpdateStatus);
  }
}

function finishStartupDesktopUpdateCheck() {
  if (startupDesktopUpdateFallbackTimer) {
    clearTimeout(startupDesktopUpdateFallbackTimer);
    startupDesktopUpdateFallbackTimer = null;
  }
  isStartupDesktopUpdateInProgress = false;
}

function installDownloadedUpdate() {
  if (pendingUpdateRestartTimer) {
    clearTimeout(pendingUpdateRestartTimer);
    pendingUpdateRestartTimer = null;
  }

  sendUpdaterStatus('restarting');
  isQuitting = true;
  autoUpdater.quitAndInstall(true, true);
}

function checkForDesktopUpdates({ startup = false, reason = 'manual' } = {}) {
  if (!desktopConfig?.updateUrl || isUpdateDownloaded || isDesktopUpdateCheckRunning) {
    return Promise.resolve(false);
  }

  if (startup) {
    isStartupDesktopUpdateInProgress = true;
    appendDesktopLog('desktop-update-startup-check', {
      reason,
      installedVersion: app.getVersion(),
      updateUrl: desktopConfig.updateUrl
    });
    if (startupDesktopUpdateFallbackTimer) {
      clearTimeout(startupDesktopUpdateFallbackTimer);
    }
    startupDesktopUpdateFallbackTimer = setTimeout(() => {
      if (isStartupDesktopUpdateInProgress && lastDesktopUpdateStatus?.type === 'checking') {
        finishStartupDesktopUpdateCheck();
        sendUpdaterStatus('error', { message: 'Desktop update check timed out. Continuing startup.' });
      }
    }, desktopStartupUpdateFallbackMs);
  }

  isDesktopUpdateCheckRunning = true;
  appendDesktopLog('desktop-update-check-started', {
    reason,
    startup,
    installedVersion: app.getVersion()
  });
  return autoUpdater.checkForUpdates()
    .then(() => true)
    .catch((error) => {
      appendDesktopLog('desktop-update-check-failed', { message: error.message });
      sendUpdaterStatus('error', { message: error.message });
      return false;
    })
    .finally(() => {
      isDesktopUpdateCheckRunning = false;
    });
}

function configureAutoUpdates(config) {
  if (!config.updateUrl) {
    appendDesktopLog('desktop-updates-disabled', {
      reason: 'updateUrl-not-configured'
    });
    return;
  }

  appendDesktopLog('desktop-updates-enabled', { updateUrl: config.updateUrl });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: config.updateUrl
  });

  autoUpdater.on('checking-for-update', () => sendUpdaterStatus('checking'));
  autoUpdater.on('update-available', (info) => {
    appendDesktopLog('desktop-update-available', {
      version: info.version,
      installedVersion: app.getVersion(),
      startup: isStartupDesktopUpdateInProgress,
      action: 'auto-download'
    });
    sendUpdaterStatus('available', { version: info.version, message: 'Desktop update found. Downloading automatically.' });
  });
  autoUpdater.on('update-not-available', (info) => {
    appendDesktopLog('desktop-update-not-available', { version: info.version });
    finishStartupDesktopUpdateCheck();
    sendUpdaterStatus('not-available', { version: info.version });
  });
  autoUpdater.on('download-progress', (progress) => {
    sendUpdaterStatus('downloading', { percent: Math.round(progress.percent || 0) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    appendDesktopLog('desktop-update-downloaded', { version: info.version });
    isUpdateDownloaded = true;
    rebuildTrayMenu();
    sendUpdaterStatus('downloaded', { version: info.version });
    showDesktopNotification({
      title: 'Shield update downloaded',
      body: 'Shield will restart automatically to finish installing the desktop update.'
    });
    pendingUpdateRestartTimer = setTimeout(
      installDownloadedUpdate,
      isStartupDesktopUpdateInProgress ? desktopStartupUpdateRestartDelayMs : desktopUpdateRestartDelayMs
    );
  });
  autoUpdater.on('error', (error) => {
    appendDesktopLog('desktop-update-error', { message: error.message });
    finishStartupDesktopUpdateCheck();
    sendUpdaterStatus('error', { message: error.message });
  });

  void checkForDesktopUpdates({ startup: true, reason: 'app-launch' });
  if (desktopUpdateCheckTimer) {
    clearInterval(desktopUpdateCheckTimer);
  }
  desktopUpdateCheckTimer = setInterval(() => {
    void checkForDesktopUpdates();
  }, desktopUpdateCheckIntervalMs);
}

function createMainWindow() {
  desktopConfig = desktopConfig || getDesktopConfig();
  const allowedOrigins = new Set(desktopConfig.allowedOrigins.map(getOrigin).filter(Boolean));
  const appOrigin = getOrigin(desktopConfig.appUrl);
  if (appOrigin) {
    allowedOrigins.add(appOrigin);
  }

  const iconPath = getShieldIconPath();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: 'Shield',
    backgroundColor: '#0f172a',
    icon: iconPath,
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
    if (iconPath) {
      mainWindow.setIcon(iconPath);
    }

    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    setWebAppLoadSuccess();
    appendDesktopLog('web-app-load-success', {
      url: mainWindow ? mainWindow.webContents.getURL() : desktopConfig?.appUrl
    });
    if (rendererCrashResetTimer) {
      clearTimeout(rendererCrashResetTimer);
    }
    rendererCrashResetTimer = setTimeout(() => {
      rendererCrashReloadCount = 0;
      rendererCrashResetTimer = null;
    }, rendererCrashStableResetMs);
    checkDesktopIdleStatus({ force: true });
  });

  mainWindow.on('close', (event) => {
    const preferences = getDesktopPreferences();
    if (!isQuitting && preferences.trayMode) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('focus', () => {
    checkDesktopIdleStatus({ force: true });
  });

  mainWindow.on('blur', () => {
    checkDesktopIdleStatus({ force: true });
  });

  mainWindow.on('show', () => {
    checkDesktopIdleStatus({ force: true });
  });

  mainWindow.on('hide', () => {
    checkDesktopIdleStatus({ force: true });
  });

  mainWindow.on('minimize', () => {
    checkDesktopIdleStatus({ force: true });
  });

  mainWindow.on('restore', () => {
    checkDesktopIdleStatus({ force: true });
  });

  mainWindow.on('closed', () => {
    clearWebAppLoadRetryTimer();
    webAppLoadRetryCount = 0;
    stopWebAppUpdateChecks();
    stopDesktopIdleChecks();
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
    handleWebAppLoadFailure(errorCode, errorDescription, failedUrl);
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderErrorPage({
      title: 'Shield could not load',
      message: 'The desktop app opened, but it could not reach the configured Shield web address.',
      detail: `${errorCode}: ${errorDescription}`,
      appUrl: failedUrl
    }))}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (rendererCrashResetTimer) {
      clearTimeout(rendererCrashResetTimer);
      rendererCrashResetTimer = null;
    }
    recordDesktopCrash('renderer-process-gone', details.reason || 'Renderer process stopped', details);
    rendererCrashReloadCount += 1;

    if (rendererCrashReloadCount <= maxRendererCrashReloads) {
      appendDesktopLog('renderer-reload-attempt', {
        source: 'render-process-gone',
        attempt: rendererCrashReloadCount
      });
      mainWindow.loadURL(desktopConfig.appUrl, { extraHeaders: 'Cache-Control: no-cache' }).catch((error) => {
        recordDesktopCrash('renderer-reload-failed', error);
      });
      return;
    }

    appendDesktopLog('renderer-stop-failed', { reason: details.reason });
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderErrorPage({
      title: 'Shield desktop renderer stopped',
      message: 'The desktop window process stopped unexpectedly.',
      detail: details.reason,
      appUrl: desktopConfig.appUrl
    }))}`);
  });

  mainWindow.webContents.on('did-frame-finish-load', () => {
    if (mainWindow) {
      appendDesktopLog('web-frame-finish-load', {
        url: mainWindow.webContents.getURL()
      });
    }
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

  appendDesktopLog('web-app-load-attempt', { url: desktopConfig.appUrl });
  webAppLoadRetryCount = 0;
  clearWebAppLoadRetryTimer();
  mainWindow.loadURL(desktopConfig.appUrl, { extraHeaders: 'Cache-Control: no-cache' }).catch((error) => {
    appendDesktopLog('web-app-load-initial-failed', { message: error.message });
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderErrorPage({
      title: 'Shield could not load',
      message: 'The desktop app could not open the configured Shield web address.',
      detail: error.message,
      appUrl: desktopConfig.appUrl
    }))}`);
  });
  startWebAppUpdateChecks();
  startDesktopIdleChecks();
}

app.setAppUserModelId('com.shield.desktop');

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    appendDesktopLog('desktop-ready');
    Menu.setApplicationMenu(null);
    ensureDefaultDesktopPreferences();
    desktopConfig = getDesktopConfig();
    appendDesktopLog('desktop-config-loaded', {
      appUrl: desktopConfig?.appUrl,
      updateUrl: desktopConfig?.updateUrl
    });
    configureAutoUpdates(desktopConfig);
    registerPowerMonitorEvents();
    createTray();
    createMainWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  stopWebAppUpdateChecks();
  stopDesktopIdleChecks();
  if (desktopUpdateCheckTimer) {
    clearInterval(desktopUpdateCheckTimer);
    desktopUpdateCheckTimer = null;
  }
  stopDesktopSessionTimeoutChecks();
  clearWebAppLoadRetryTimer();
  app.setBadgeCount(0);
  if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
    mainWindow.setOverlayIcon(null, '');
  }
});

process.on('uncaughtException', (error) => {
  recordDesktopCrash('main-uncaught-exception', error);
  console.error('Unhandled Shield desktop exception:', error);
});

process.on('unhandledRejection', (reason) => {
  recordDesktopCrash('main-unhandled-rejection', reason);
  console.error('Unhandled Shield desktop rejection:', reason);
});

ipcMain.handle('shield:desktop-notification', (_event, payload) => showDesktopNotification(payload));
ipcMain.handle('shield:set-unread-count', (_event, count) => {
  updateUnreadBadge(count);
  return true;
});
ipcMain.handle('shield:set-presence-status', (_event, status) => {
  const nextStatus = setDesktopPresenceStatus(status);
  return { status: nextStatus };
});
ipcMain.handle('shield:set-session-timeout', (_event, options) => configureDesktopSessionTimeout(options));
ipcMain.handle('shield:report-session-activity', () => ({
  ok: reportDesktopSessionActivity()
}));
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

  await checkForDesktopUpdates();
  return { ok: true };
});
ipcMain.handle('shield:install-update', () => {
  installDownloadedUpdate();
});
ipcMain.handle('shield:get-clipboard-files', () => readClipboardPayload());
ipcMain.handle('shield:get-crash-reports', () => ({ reports: [...pendingCrashReports] }));
ipcMain.handle('shield:clear-crash-reports', (_event, ids) => {
  const idSet = new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  if (idSet.size === 0) {
    return { cleared: 0 };
  }

  let cleared = 0;
  for (let index = pendingCrashReports.length - 1; index >= 0; index -= 1) {
    if (idSet.has(pendingCrashReports[index].id)) {
      pendingCrashReports.splice(index, 1);
      cleared += 1;
    }
  }

  return { cleared };
});
ipcMain.handle('shield:get-desktop-preferences', () => ({
  ...getDesktopPreferences(),
  appVersion: app.getVersion(),
  updateDownloaded: isUpdateDownloaded,
  updateConfigured: Boolean(desktopConfig?.updateUrl),
  updateStatus: lastDesktopUpdateStatus,
  startupUpdateInProgress: isStartupDesktopUpdateInProgress
}));
ipcMain.handle('shield:set-start-with-windows', (_event, startWithWindows) => {
  const preferences = setStartWithWindows(startWithWindows);
  rebuildTrayMenu();
  return {
    ...preferences,
    appVersion: app.getVersion(),
    updateDownloaded: isUpdateDownloaded,
    updateConfigured: Boolean(desktopConfig?.updateUrl),
    updateStatus: lastDesktopUpdateStatus,
    startupUpdateInProgress: isStartupDesktopUpdateInProgress
  };
});
ipcMain.handle('shield:set-tray-mode', (_event, trayMode) => {
  const preferences = saveDesktopPreferences({ trayMode: Boolean(trayMode) });
  rebuildTrayMenu();
  return {
    ...preferences,
    appVersion: app.getVersion(),
    updateDownloaded: isUpdateDownloaded,
    updateConfigured: Boolean(desktopConfig?.updateUrl),
    updateStatus: lastDesktopUpdateStatus,
    startupUpdateInProgress: isStartupDesktopUpdateInProgress
  };
});

ipcMain.handle('shield:get-desktop-logs', () => ({
  path: getDesktopLogPath(),
  entries: [...pendingDesktopLogs],
  maxEntries: maxDesktopLogEntries
}));

ipcMain.handle('shield:open-desktop-logs', async () => {
  try {
    const result = await shell.openPath(getDesktopLogPath());
    if (result) {
      throw new Error(result);
    }

    return { ok: true };
  } catch (error) {
    appendDesktopLog('desktop-log-open-failed', {
      message: error instanceof Error ? error.message : String(error)
    });
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to open the desktop log file.'
    };
  }
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
