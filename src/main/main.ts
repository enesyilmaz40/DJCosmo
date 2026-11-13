import { app, BrowserWindow, ipcMain, dialog, powerSaveBlocker, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { AppStore } from './store';

let mainWindow: BrowserWindow | null = null;
let store: AppStore | null = null;
let powerSaveBlockerId: number | null = null;

const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'];
const activeWatchers: Map<string, fs.FSWatcher> = new Map();
let folderWatchDebounce: NodeJS.Timeout | null = null;

function watchFolder(folderPath: string) {
  if (activeWatchers.has(folderPath) || !fs.existsSync(folderPath)) return;
  try {
    const watcher = fs.watch(folderPath, { recursive: true }, (_eventType, filename) => {
      if (filename) {
        const ext = path.extname(filename).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext) || !ext) {
          if (folderWatchDebounce) clearTimeout(folderWatchDebounce);
          folderWatchDebounce = setTimeout(() => {
            const files = scanDirectoryForAudio(folderPath);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('library:folderUpdated', { folderPath, files });
            }
          }, 600);
        }
      }
    });
    activeWatchers.set(folderPath, watcher);
  } catch (err) {
    console.error('Failed to watch folder:', folderPath, err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0b0e',
    titleBarStyle: 'default',
    title: 'DJCOSMO — Autonomous AI DJ',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Keep timers / audio automation running at full rate while the window is hidden or minimized
      backgroundThrottling: false,
      webSecurity: false, // Allows seamless local audio streaming
    },
  });

  // Power save blocker to prevent computer sleeping during sets
  powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');

  const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;

  if (isDev) {
    const devUrl = 'http://localhost:5173';
    mainWindow.loadURL(devUrl).catch(() => {
      // If vite dev server is not active, load built renderer
      mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html'));
    });
    mainWindow.webContents.on('did-fail-load', () => {
      mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }
  });
}

function scanDirectoryForAudio(dirPath: string): string[] {
  let results: string[] = [];
  try {
    const list = fs.readdirSync(dirPath);
    for (const file of list) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(scanDirectoryForAudio(fullPath));
      } else {
        const ext = path.extname(file).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error('Error scanning folder:', err);
  }
  return results;
}

app.whenReady().then(() => {
  store = new AppStore();

  // Register IPC handlers
  ipcMain.handle('dialog:openFiles', async () => {
    if (!mainWindow) return [];
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Audio Tracks',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a'] },
      ],
    });
    if (res.canceled) return [];
    return res.filePaths;
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    if (!mainWindow) return [];
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Music Folder',
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return [];
    const dir = res.filePaths[0];
    watchFolder(dir);
    return scanDirectoryForAudio(dir);
  });

  ipcMain.handle('folders:watch', async (_event, folderPath: string) => {
    if (folderPath && typeof folderPath === 'string') {
      watchFolder(folderPath);
    }
    return true;
  });

  ipcMain.handle('folders:rescan', async () => {
    const results: { folderPath: string; files: string[] }[] = [];
    for (const [dir] of activeWatchers.entries()) {
      results.push({ folderPath: dir, files: scanDirectoryForAudio(dir) });
    }
    return results;
  });

  ipcMain.handle('audio:readFile', async (_event, filePath: string) => {
    try {
      const buffer = await fs.promises.readFile(filePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (err: any) {
      console.error('Failed to read audio file:', filePath, err);
      throw new Error(`Could not read file: ${err.message}`);
    }
  });

  ipcMain.handle('audio:getFileMeta', async (_event, filePath: string) => {
    try {
      const stats = await fs.promises.stat(filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).replace('.', '').toLowerCase();
      const folderPath = path.dirname(filePath);
      const folderName = path.basename(folderPath);
      return {
        filePath,
        fileName,
        fileSize: stats.size,
        format: ext,
        folderPath,
        folderName,
        mtimeMs: stats.mtimeMs,
      };
    } catch (err: any) {
      return null;
    }
  });

  ipcMain.handle('store:getLibrary', async () => {
    return store?.getLibrary() || [];
  });

  ipcMain.handle('store:saveLibrary', async (_event, data: any) => {
    return store?.saveLibrary(data) || false;
  });

  ipcMain.handle('store:getSettings', async () => {
    return store?.getSettings() || {};
  });

  ipcMain.handle('store:saveSettings', async (_event, data: any) => {
    return store?.saveSettings(data) || false;
  });

  ipcMain.handle('system:setSleepBlocker', async (_event, enable: boolean) => {
    if (enable) {
      if (!powerSaveBlockerId || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      }
    } else {
      if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
        powerSaveBlocker.stop(powerSaveBlockerId);
        powerSaveBlockerId = null;
      }
    }
    return powerSaveBlockerId !== null;
  });

  ipcMain.handle('system:getPlatform', () => {
    return process.platform;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

