// Collapse Factor - preload bridge (exposes a tiny, safe API to the game)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cfNative', {
  quit: () => ipcRenderer.send('cf:quit'),
  toggleFullscreen: () => ipcRenderer.send('cf:fullscreen'),
  openExternal: (url) => ipcRenderer.send('cf:open', url),
  isElectron: true
});
