const { app, BrowserWindow, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const defaultConfig = {
  appUrl: 'https://shield.example.gov',
  allowedOrigins: ['https://shield.example.gov']
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

function getDesktopConfig() {
  const packagedConfigPath = path.join(process.resourcesPath || __dirname, 'config.json');
  const localConfigPath = path.join(__dirname, 'config.json');
  const userConfigPath = path.join(app.getPath('userData'), 'config.json');
  const fileConfig = readJsonIfExists(userConfigPath) || readJsonIfExists(packagedConfigPath) || readJsonIfExists(localConfigPath) || {};
  const appUrl = process.env.SHIELD_DESKTOP_URL || fileConfig.appUrl || defaultConfig.appUrl;
  const allowedOrigins = Array.isArray(fileConfig.allowedOrigins) && fileConfig.allowedOrigins.length > 0
    ? fileConfig.allowedOrigins
    : [appUrl];

  return {
    appUrl,
    allowedOrigins
  };
}

function getOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function createMainWindow() {
  const desktopConfig = getDesktopConfig();
  const allowedOrigins = new Set(desktopConfig.allowedOrigins.map(getOrigin).filter(Boolean));
  const appOrigin = getOrigin(desktopConfig.appUrl);
  if (appOrigin) {
    allowedOrigins.add(appOrigin);
  }

  const mainWindow = new BrowserWindow({
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
    mainWindow.show();
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
