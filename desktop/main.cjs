const { app, BrowserWindow, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const defaultConfig = {
  appUrl: 'https://shield.example.gov',
  allowedOrigins: ['https://shield.example.gov']
};

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

  mainWindow.loadURL(desktopConfig.appUrl);
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
