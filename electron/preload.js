// Exposes a small, safe API to the React UI.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  get: (url) => ipcRenderer.invoke('http:get', url),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  version: () => ipcRenderer.invoke('app:version'),
  setTheme: (theme) => ipcRenderer.send('theme:set', theme),
  flash: () => ipcRenderer.send('window:flash'),
  updateNotice: () => ipcRenderer.invoke('update:notice'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  restartToUpdate: () => ipcRenderer.invoke('update:restart'),
});
