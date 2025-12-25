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
 * Uses Rust backend command for efficient filesystem access
 */
export async function findLocalBudgets(): Promise<Array<{ name: string; path: string }>> {
  if (!isTauri()) {
    console.log('[TauriIO] Not running in Tauri, cannot access local files');
    return [];
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const budgets = await invoke<Array<{ name: string; path: string }>>('find_ynab_budgets');
    console.log('[TauriIO] Found budgets:', budgets);
    return budgets;
  } catch (error) {
    console.error('[TauriIO] Error finding budgets:', error);
    return [];
  }
}

/**
 * Get the Dropbox path if it exists
 */
export async function getDropboxPath(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const path = await invoke<string | null>('get_dropbox_path');
    return path;
  } catch (error) {
    console.error('[TauriIO] Error getting Dropbox path:', error);
    return null;
  }
}

/**
 * Check if running in Tauri
 */
export function isTauri(): boolean {
  if (!browser) return false;
  const win = window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return '__TAURI__' in win || '__TAURI_INTERNALS__' in win;
}

/**
 * Open folder picker dialog to select a .ynab4 budget folder
 */
export async function openBudgetFolderDialog(): Promise<string | null> {
  if (!isTauri()) {
    console.warn('[TauriIO] Folder dialog requires Tauri runtime');
    return null;
  }

  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select YNAB4 Budget Folder',
      filters: [{
        name: 'YNAB4 Budget',
        extensions: ['ynab4']
      }]
    });

    if (selected && typeof selected === 'string') {
      // Verify it's a .ynab4 folder
      if (selected.endsWith('.ynab4')) {
        return selected;
      } else {
        console.warn('[TauriIO] Selected folder is not a .ynab4 budget');
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('[TauriIO] Error opening folder dialog:', error);
    return null;
  }
}

