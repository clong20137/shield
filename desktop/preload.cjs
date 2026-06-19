const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('blueLineDesktop', {
  platform: process.platform,
  shell: 'electron'
});
