const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusDesktop', {
  platform: process.platform,
  openSteam: () => ipcRenderer.invoke('nexus-open-steam'),
  openExternal: (url) => ipcRenderer.invoke('nexus-open-external', url),
  getLogins: (url) => ipcRenderer.invoke('nexus-passwords-list', url),
  saveLogin: (data) => ipcRenderer.invoke('nexus-passwords-save', data),
  fillLogin: (data) => ipcRenderer.invoke('nexus-passwords-fill', data),
  onNexusUrl: (callback) => ipcRenderer.on('nexus-url', (_event, url) => callback(url))
});
