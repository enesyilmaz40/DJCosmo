import { contextBridge, ipcRenderer } from 'electron';

export interface DJAI_API {
  openFiles: () => Promise<string[]>;
  openDirectory: () => Promise<string[]>;
  readAudioFile: (filePath: string) => Promise<ArrayBuffer>;
  getFileMeta: (filePath: string) => Promise<{ filePath: string; fileName: string; fileSize: number; format: string; folderPath?: string; folderName?: string; mtimeMs?: number } | null>;
  getLibrary: () => Promise<any[]>;
  saveLibrary: (library: any[]) => Promise<boolean>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<boolean>;
  setSleepBlocker: (enable: boolean) => Promise<boolean>;
  getPlatform: () => Promise<string>;
  watchFolder: (folderPath: string) => Promise<boolean>;
  rescanFolders: () => Promise<{ folderPath: string; files: string[] }[]>;
  onFolderUpdated: (callback: (data: { folderPath: string; files: string[] }) => void) => () => void;
}

const api: DJAI_API = {
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  readAudioFile: (filePath: string) => ipcRenderer.invoke('audio:readFile', filePath),
  getFileMeta: (filePath: string) => ipcRenderer.invoke('audio:getFileMeta', filePath),
  getLibrary: () => ipcRenderer.invoke('store:getLibrary'),
  saveLibrary: (library: any[]) => ipcRenderer.invoke('store:saveLibrary', library),
  getSettings: () => ipcRenderer.invoke('store:getSettings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('store:saveSettings', settings),
  setSleepBlocker: (enable: boolean) => ipcRenderer.invoke('system:setSleepBlocker', enable),
  getPlatform: () => ipcRenderer.invoke('system:getPlatform'),
  watchFolder: (folderPath: string) => ipcRenderer.invoke('folders:watch', folderPath),
  rescanFolders: () => ipcRenderer.invoke('folders:rescan'),
  onFolderUpdated: (callback: (data: { folderPath: string; files: string[] }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('library:folderUpdated', subscription);
    return () => ipcRenderer.removeListener('library:folderUpdated', subscription);
  },
};

contextBridge.exposeInMainWorld('djaiAPI', api);

// Declare global type for TypeScript
declare global {
  interface Window {
    djaiAPI: DJAI_API;
  }
}

