const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shieldDesktop', {
  platform: process.platform,
  shell: 'electron',
  notify: (payload) => ipcRenderer.invoke('shield:desktop-notification', payload),
  setUnreadCount: (count) => ipcRenderer.invoke('shield:set-unread-count', count),
  flashAttention: () => ipcRenderer.invoke('shield:flash-attention'),
  clearAttention: () => ipcRenderer.invoke('shield:clear-attention'),
  getClipboardFiles: () => ipcRenderer.invoke('shield:get-clipboard-files'),
  getCrashReports: () => ipcRenderer.invoke('shield:get-crash-reports'),
  clearCrashReports: (ids) => ipcRenderer.invoke('shield:clear-crash-reports', ids),
  checkForUpdates: () => ipcRenderer.invoke('shield:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('shield:install-update'),
  getDesktopPreferences: () => ipcRenderer.invoke('shield:get-desktop-preferences'),
  setStartWithWindows: (startWithWindows) => ipcRenderer.invoke('shield:set-start-with-windows', startWithWindows),
  setTrayMode: (trayMode) => ipcRenderer.invoke('shield:set-tray-mode', trayMode),
  navigate: (appPath) => ipcRenderer.invoke('shield:navigate', appPath),
  onNotificationClick: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('shield:desktop-notification-click', handler);
    return () => ipcRenderer.removeListener('shield:desktop-notification-click', handler);
  },
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('shield:update-status', handler);
    return () => ipcRenderer.removeListener('shield:update-status', handler);
  },
  onIdleStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('shield:desktop-idle-status', handler);
    return () => ipcRenderer.removeListener('shield:desktop-idle-status', handler);
  },
  onWebAppUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('shield:web-app-update-status', handler);
    return () => ipcRenderer.removeListener('shield:web-app-update-status', handler);
  },
  getDesktopLogs: () => ipcRenderer.invoke('shield:get-desktop-logs'),
  openDesktopLogs: () => ipcRenderer.invoke('shield:open-desktop-logs')
});
