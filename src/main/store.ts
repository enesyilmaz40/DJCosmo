import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';

export class AppStore {
  private userDataDir: string;
  private libraryPath: string;
  private settingsPath: string;

  constructor() {
    this.userDataDir = app.getPath('userData');
    this.libraryPath = path.join(this.userDataDir, 'djai_library.json');
    this.settingsPath = path.join(this.userDataDir, 'djai_settings.json');
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }
  }

  public getLibrary(): any[] {
    try {
      if (fs.existsSync(this.libraryPath)) {
        const raw = fs.readFileSync(this.libraryPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Error reading library:', e);
    }
    return [];
  }

  public saveLibrary(library: any[]): boolean {
    try {
      fs.writeFileSync(this.libraryPath, JSON.stringify(library, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('Error saving library:', e);
      return false;
    }
  }

  public getSettings(): Record<string, any> {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf-8');
        const settings = JSON.parse(raw);
        if (settings.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
          try {
            const buffer = Buffer.from(settings.encryptedApiKey, 'base64');
            settings.geminiApiKey = safeStorage.decryptString(buffer);
          } catch (err) {
            console.warn('Failed to decrypt API key:', err);
          }
        }
        return settings;
      }
    } catch (e) {
      console.error('Error reading settings:', e);
    }
    return {
      geminiApiKey: '',
      masterVolume: 1.0,
      selectedPersonality: 'UNDERGROUND',
      autoDjEnabled: false,
      bpmSyncRange: 8,
      preventSystemSleep: true,
    };
  }

  public saveSettings(settings: Record<string, any>): boolean {
    try {
      const copy = { ...settings };
      if (copy.geminiApiKey && safeStorage.isEncryptionAvailable()) {
        try {
          const encrypted = safeStorage.encryptString(copy.geminiApiKey);
          copy.encryptedApiKey = encrypted.toString('base64');
          delete copy.geminiApiKey; // Do not store plaintext
        } catch (err) {
          console.warn('Encryption failed, saving fallback:', err);
        }
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(copy, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('Error saving settings:', e);
      return false;
    }
  }
}

