const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('shieldDesktop', {
  platform: process.platform,
  shell: 'electron'
});
