// Collapse Factor - Electron main process
// Copyright (C) 2026 Shawn Rapaz. Licensed under the GNU GPL v3.0.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 560,
    title: 'Collapse Factor',
    backgroundColor: '#0d1b2a',
    icon: path.join(__dirname, 'src', 'img', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // open external links (website / email) in the system browser / mail client
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); }
  });
}

ipcMain.on('cf:quit', () => app.quit());
ipcMain.on('cf:fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
ipcMain.on('cf:open', (_e, url) => { if (/^(https?:|mailto:)/.test(url)) shell.openExternal(url); });

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
