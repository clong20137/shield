const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shieldDesktop', {
  platform: process.platform,
  shell: 'electron',
  notify: (payload) => ipcRenderer.invoke('shield:desktop-notification', payload),
  setUnreadCount: (count) => ipcRenderer.invoke('shield:set-unread-count', count),
  flashAttention: () => ipcRenderer.invoke('shield:flash-attention'),
  clearAttention: () => ipcRenderer.invoke('shield:clear-attention'),
  checkForUpdates: () => ipcRenderer.invoke('shield:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('shield:install-update'),
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
  }
});
