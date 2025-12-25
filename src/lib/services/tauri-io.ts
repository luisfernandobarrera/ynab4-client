/**
 * TauriIO - Filesystem adapter for Tauri apps
 * Implements the BaseIO interface from ynab-library
 */

import { browser } from '$app/environment';

// Tauri API imports will be dynamic
type TauriFS = {
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, contents: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  readDir: (path: string) => Promise<Array<{ name: string; isDirectory: boolean }>>;
  createDir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  removeFile: (path: string) => Promise<void>;
};

let tauriFS: TauriFS | null = null;

async function getTauriFS(): Promise<TauriFS> {
  if (tauriFS) return tauriFS;

  if (!browser || typeof (window as { __TAURI__?: unknown }).__TAURI__ === 'undefined') {
    throw new Error('TauriIO requires Tauri runtime');
  }

  const { readTextFile, writeTextFile, exists, readDir, mkdir, remove } = await import(
    '@tauri-apps/plugin-fs'
  );

  tauriFS = {
    readTextFile,
    writeTextFile,
    exists,
    readDir: async (path: string) => {
      const entries = await readDir(path);
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
    },
    createDir: async (path: string, options?: { recursive?: boolean }) => {
      await mkdir(path, { recursive: options?.recursive ?? false });
    },
    removeFile: remove,
  };

  return tauriFS;
}

export class TauriIO {
  private readOnly: boolean;

  constructor(readOnly = false) {
    this.readOnly = readOnly;
  }

  async readFile(filepath: string): Promise<string> {
    const fs = await getTauriFS();
    return fs.readTextFile(filepath);
  }

  async writeFile(filepath: string, data: string): Promise<void> {
    if (this.readOnly) {
      throw new Error('TauriIO is in read-only mode');
    }
    const fs = await getTauriFS();
    await fs.writeTextFile(filepath, data);
  }

  async exists(filepath: string): Promise<boolean> {
    const fs = await getTauriFS();
    return fs.exists(filepath);
  }

  async readdir(dirpath: string): Promise<string[]> {
    const fs = await getTauriFS();
    const entries = await fs.readDir(dirpath);
    return entries.map((e) => e.name);
  }

  async ensureDirExists(dirpath: string): Promise<void> {
    if (this.readOnly) {
      throw new Error('TauriIO is in read-only mode');
    }
    const fs = await getTauriFS();
    const dirExists = await fs.exists(dirpath);
    if (!dirExists) {
      await fs.createDir(dirpath, { recursive: true });
    }
  }

  async deleteFile(filepath: string): Promise<void> {
    if (this.readOnly) {
      throw new Error('TauriIO is in read-only mode');
    }
    const fs = await getTauriFS();
    await fs.removeFile(filepath);
  }

  isReadOnly(): boolean {
    return this.readOnly;
  }

  setReadOnly(value: boolean): void {
    this.readOnly = value;
  }
}

/**
 * Find local YNAB budgets in common locations
 */
export async function findLocalBudgets(): Promise<Array<{ name: string; path: string }>> {
  if (!browser || typeof (window as { __TAURI__?: unknown }).__TAURI__ === 'undefined') {
    return [];
  }

  const fs = await getTauriFS();
  const { homeDir } = await import('@tauri-apps/api/path');

  const home = await homeDir();
  const searchPaths = [
    `${home}/Dropbox/YNAB`,
    `${home}/Dropbox/Apps/YNAB`,
    `${home}/Documents/YNAB`,
  ];

  const budgets: Array<{ name: string; path: string }> = [];

  for (const searchPath of searchPaths) {
    try {
      const pathExists = await fs.exists(searchPath);
      if (!pathExists) continue;

      const entries = await fs.readDir(searchPath);
      for (const entry of entries) {
        if (entry.name.endsWith('.ynab4') && entry.isDirectory) {
          const rawName = entry.name.replace('.ynab4', '');
          const tildeIndex = rawName.lastIndexOf('~');
          const name = tildeIndex > 0 ? rawName.substring(0, tildeIndex) : rawName;

          budgets.push({
            name,
            path: `${searchPath}/${entry.name}`,
          });
        }
      }
    } catch (error) {
      console.warn(`[TauriIO] Error searching ${searchPath}:`, error);
    }
  }

  return budgets;
}

