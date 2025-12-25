/**
 * Budget Loader Service
 * Loads YNAB4 budgets from Dropbox or local filesystem
 */

import { browser } from '$app/environment';
import type { YnabClient } from 'ynab-library';

// Check if running in Tauri
const isTauri = () => browser && typeof (window as { __TAURI__?: unknown }).__TAURI__ !== 'undefined';

export interface BudgetInfo {
  client: YnabClient;
  mode: 'local' | 'dropbox' | 'browser';
  canWrite: boolean;
  budgetName: string;
  budgetPath: string | null;
  dataFolderName: string | null;
  io: unknown;
}

export interface DropboxBudget {
  name: string;
  rawName: string;
  path: string;
}

export class BudgetLoader {
  /**
   * Check if running in Tauri (desktop mode)
   */
  static isDesktopMode(): boolean {
    return isTauri();
  }

  /**
   * Load budget from local filesystem (Tauri only)
   */
  static async loadFromLocalPath(path: string): Promise<BudgetInfo> {
    console.log('[BudgetLoader] Loading from local path:', path);
    
    if (!isTauri()) {
      throw new Error('Local file access requires desktop app');
    }

    const { YnabClient } = await import('ynab-library');
    const { TauriIO } = await import('./tauri-io');

    // Create TauriIO instance with write capability
    const io = new TauriIO(false); // readOnly = false

    // Load in read-only mode first
    const client = new YnabClient(path, io, true);
    await client.initialize();

    // Extract and clean budget name
    const rawName = path.split('/').pop()?.replace('.ynab4', '') || 'Budget';
    const budgetName = this.getCleanBudgetName(rawName);

    console.log('[BudgetLoader] Local budget loaded:', budgetName);

    return {
      client,
      mode: 'local',
      canWrite: true,
      budgetName,
      budgetPath: path,
      dataFolderName: (client as { getDataFolderName?: () => string | null }).getDataFolderName?.() || null,
      io,
    };
  }

  /**
   * Load budget from Dropbox
   */
  static async loadFromDropbox(accessToken: string, budgetPath = '/YNAB/Budget.ynab4'): Promise<BudgetInfo> {
    console.log('[BudgetLoader] Loading from Dropbox:', budgetPath);

    const { YnabClient, DropboxIO } = await import('ynab-library');

    const io = new DropboxIO(accessToken);
    const client = new YnabClient(budgetPath, io, true); // readOnly = true

    await client.initialize();
    await client.pull(); // Sync from Dropbox

    // Extract and clean budget name
    const rawName = budgetPath.split('/').pop()?.replace('.ynab4', '') || 'Budget';
    const budgetName = this.getCleanBudgetName(rawName);

    console.log('[BudgetLoader] Dropbox budget loaded:', budgetName);

    return {
      client,
      mode: 'dropbox',
      canWrite: true,
      budgetName,
      budgetPath,
      dataFolderName: (client as { getDataFolderName?: () => string | null }).getDataFolderName?.() || null,
      io,
    };
  }

  /**
   * Load budget from browser file picker (.yfull file)
   */
  static async loadFromBrowserFile(file: File): Promise<BudgetInfo> {
    const { YnabClient, BrowserIO } = await import('ynab-library');

    const io = new BrowserIO();
    await io.loadFromFile(file);

    const client = new YnabClient('Budget.ynab4', io, true);
    await client.initialize();

    return {
      client,
      mode: 'browser',
      canWrite: false,
      budgetName: file.name,
      budgetPath: null,
      dataFolderName: null,
      io,
    };
  }

  /**
   * Load budget from folder selection (.ynab4 folder)
   */
  static async loadFromBrowserFolder(files: FileList): Promise<BudgetInfo> {
    const { YnabClient, BrowserIO } = await import('ynab-library');

    const io = new BrowserIO();
    await io.loadFromFolder(files);

    const client = new YnabClient('Budget.ynab4', io, true);
    await client.initialize();

    const rawName = BrowserIO.getBudgetName(files);
    const budgetName = this.getCleanBudgetName(rawName);

    return {
      client,
      mode: 'browser',
      canWrite: false,
      budgetName,
      budgetPath: null,
      dataFolderName: null,
      io,
    };
  }

  /**
   * Save changes back to Dropbox
   */
  static async saveToDropbox(client: YnabClient): Promise<void> {
    if (!client) return;
    await client.save();
    await client.push();
  }

  /**
   * List available budgets in Dropbox
   */
  static async listDropboxBudgets(accessToken: string): Promise<DropboxBudget[]> {
    const { DropboxIO } = await import('ynab-library');
    const io = new DropboxIO(accessToken);

    // Common YNAB budget locations
    const searchPaths = ['/YNAB', '/Apps/YNAB', '/Dropbox/YNAB', ''];

    const allBudgets: DropboxBudget[] = [];
    let lastError: Error | null = null;
    let authError = false;

    for (const basePath of searchPaths) {
      try {
        console.log(`[BudgetLoader] Searching: ${basePath || '/'}`);
        const files = await io.readdir(basePath);

        const budgets = files
          .filter((file: string) => file.endsWith('.ynab4'))
          .map((file: string) => {
            const rawName = file.replace('.ynab4', '');
            return {
              name: this.getCleanBudgetName(rawName),
              rawName,
              path: basePath ? `${basePath}/${file}` : `/${file}`,
            };
          });

        if (budgets.length > 0) {
          console.log(`[BudgetLoader] Found ${budgets.length} budgets in ${basePath || '/'}`);
        }
        allBudgets.push(...budgets);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[BudgetLoader] Error reading ${basePath || '/'}: ${errorMsg}`);

        if (
          errorMsg.includes('401') ||
          errorMsg.includes('invalid_access_token') ||
          errorMsg.includes('expired') ||
          errorMsg.includes('unauthorized')
        ) {
          authError = true;
          lastError = new Error('Dropbox token expired. Please reconnect.');
          break;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (authError && lastError) {
      throw lastError;
    }

    if (allBudgets.length === 0 && lastError) {
      throw lastError;
    }

    // Remove duplicates by path
    const uniqueBudgets = allBudgets.filter(
      (budget, index, self) => index === self.findIndex((b) => b.path === budget.path)
    );

    return uniqueBudgets;
  }

  /**
   * Helper to get clean budget name (removes ~GUID suffix)
   */
  static getCleanBudgetName(rawName: string): string {
    const tildeIndex = rawName.lastIndexOf('~');
    if (tildeIndex > 0) {
      return rawName.substring(0, tildeIndex);
    }
    return rawName;
  }
}

