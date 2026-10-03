const { app, BrowserWindow, shell, session, ipcMain, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');

let mainWindow;

const vaultPath = path.join(app.getPath('userData'), 'nexus-passwords.json');
function readVault() { try { return JSON.parse(fs.readFileSync(vaultPath, 'utf8')); } catch { return {}; } }
function writeVault(v) { fs.writeFileSync(vaultPath, JSON.stringify(v)); }
function hostFor(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } }
function isWebUrl(url) { try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
function protect(value) { return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(value).toString('base64') : Buffer.from(value, 'utf8').toString('base64'); }
function unprotect(value) { try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, 'base64')) : Buffer.from(value, 'base64').toString('utf8'); } catch { return ''; } }

ipcMain.handle('nexus-open-steam', async () => {
  return shell.openExternal('steam://open/main');
});
ipcMain.handle('nexus-open-external', async (_event, url) => {
  if (!isWebUrl(url)) return false;
  await shell.openExternal(url);
  return true;
});


ipcMain.handle('nexus-browser-clear-data', async () => {
  try {
    const s = session.fromPartition('persist:nexus-browser');
    await s.clearStorageData();
    await s.clearCache();
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('nexus-open-downloads', async () => {
  const dir = path.join(app.getPath('downloads'), 'Nexus Browser');
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
});

ipcMain.handle('nexus-generate-password', () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  const bytes = Buffer.alloc(24);
  require('crypto').randomFillSync(bytes);
  let result = '';
  for (const byte of bytes) result += chars[byte % chars.length];
  return result;
});

ipcMain.handle('nexus-passwords-list', (_event, url) => {
  const host = hostFor(url); const vault = readVault();
  return (vault[host] || []).map(x => ({ id:x.id, host, username:x.username }));
});
ipcMain.handle('nexus-passwords-save', (_event, data) => {
  const host = hostFor(data.url); if (!host || !data.username || data.password == null) return false;
  const vault = readVault(); vault[host] = vault[host] || [];
  const existing = vault[host].find(x => x.username === data.username);
  const record = { id: existing?.id || Date.now().toString(36), username: data.username, password: protect(data.password) };
  if (existing) Object.assign(existing, record); else vault[host].push(record);
  writeVault(vault); return true;
});
ipcMain.handle('nexus-passwords-fill', (_event, data) => {
  const host = hostFor(data.url); const vault = readVault(); const record = (vault[host] || []).find(x => x.id === data.id);
  if (!record) return null;
  return { username: record.username, password: unprotect(record.password), host };
});



app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    const allowedPreload = path.join(__dirname, 'guest-preload.js');
    const requestedPreload = params.preload || '';
    const normalized = requestedPreload.startsWith('file://') ? new URL(requestedPreload).pathname : requestedPreload;
    const expected = allowedPreload.replace(/\\/g, '/');
    if (requestedPreload && !normalized.endsWith('guest-preload.js') && normalized !== expected) {
      event.preventDefault();
      return;
    }
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
  });
});



let updateCheckInProgress = false;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowDowngrade = false;

autoUpdater.on('checking-for-update', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('nexus-update', { type: 'checking' });
});
autoUpdater.on('update-available', info => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('nexus-update', {
    type: 'available', version: info.version, releaseName: info.releaseName || '', releaseDate: info.releaseDate || ''
  });
});
autoUpdater.on('update-not-available', info => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('nexus-update', { type: 'not-available', version: info?.version || app.getVersion() });
});
autoUpdater.on('download-progress', p => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('nexus-update', {
    type: 'progress', percent: Number(p.percent || 0), transferred: p.transferred || 0, total: p.total || 0, bytesPerSecond: p.bytesPerSecond || 0
  });
});
autoUpdater.on('update-downloaded', info => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('nexus-update', {
    type: 'downloaded', version: info.version
  });
});
autoUpdater.on('error', error => {
  updateCheckInProgress = false;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('nexus-update', {
    type: 'error', message: error?.message || 'Unknown updater error'
  });
});

ipcMain.handle('nexus-update-check', async () => {
  if (!app.isPackaged) return { ok: false, error: 'Updates are available only in the installed/package build.' };
  if (updateCheckInProgress) return { ok: true, checking: true };
  updateCheckInProgress = true;
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result?.updateInfo?.version || null };
  } catch (error) {
    updateCheckInProgress = false;
    return { ok: false, error: error?.message || 'Update check failed.' };
  } finally {
    updateCheckInProgress = false;
  }
});

ipcMain.handle('nexus-update-download', async () => {
  if (!app.isPackaged) return { ok: false, error: 'Updates are available only in the installed/package build.' };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Update download failed.' };
  }
});

ipcMain.handle('nexus-update-install', () => {
  if (!app.isPackaged) return false;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
});

function scheduleUpdateCheck() {
  if (!app.isPackaged || !mainWindow) return;
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 650,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Nexus OS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));


  const browserSession = session.fromPartition('persist:nexus-browser');
  browserSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = new Set(['fullscreen', 'clipboard-read', 'clipboard-write', 'media']);
    callback(allowed.has(permission));
  });
  browserSession.on('will-download', (_event, item) => {
    try {
      const downloadDir = path.join(app.getPath('downloads'), 'Nexus Browser');
      fs.mkdirSync(downloadDir, { recursive: true });
      const filename = item.getFilename() || 'download';
      item.setSavePath(path.join(downloadDir, filename));
      item.once('done', (_e, state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('nexus-browser-download', {
            filename,
            state,
            path: item.getSavePath()
          });
        }
      });
    } catch (err) {
      console.warn('Nexus Browser download setup failed:', err);
    }
  });

  // Keep normal links inside Nexus where possible; external popup links use the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('steam://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    if (isWebUrl(url)) return { action: 'allow' };
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // The OS itself stays local. Navigation initiated by the page to a normal
    // website is allowed only when it is part of the app's browser/runner UI.
    if (url.startsWith('file://')) return;
  });

  // Steam protocol links can be launched from the packaged app.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const safe = new Set(['fullscreen', 'clipboard-read', 'clipboard-write']);
    callback(safe.has(permission));
  });
}

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient('nexus');
  createWindow();
  scheduleUpdateCheck();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow && url.startsWith('nexus://')) {
    mainWindow.webContents.send('nexus-url', url);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
