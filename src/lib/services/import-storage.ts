/**
 * Import File Storage Service
 * Handles persistence of import files within the budget
 */

import type { ImportTransaction, ImportFile } from './import-service';

// Storage key for import files in localStorage (web) or budget folder (Tauri)
const IMPORT_FILES_KEY = 'ynab-import-files';

export interface StoredImportFile {
  id: string;
  name: string;
  sourceFile: string;
  createdAt: string;
  updatedAt: string;
  transactionCount: number;
  readyCount: number;
  pendingCount: number;
  netAmount: number;
  accountGroups: string[];
}

export interface ImportFileWithTransactions extends StoredImportFile {
  transactions: ImportTransaction[];
}

/**
 * Get list of all stored import files (metadata only)
 */
export function getImportFileList(budgetId: string): StoredImportFile[] {
  try {
    const key = `${IMPORT_FILES_KEY}-${budgetId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    
    const files: ImportFileWithTransactions[] = JSON.parse(stored);
    
    // Return metadata only (no transactions)
    return files.map(f => ({
      id: f.id,
      name: f.name,
      sourceFile: f.sourceFile,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      transactionCount: f.transactions?.length || 0,
      readyCount: f.transactions?.filter(t => t.status === 'ready').length || 0,
      pendingCount: f.transactions?.filter(t => t.status === 'pending').length || 0,
      netAmount: f.transactions?.reduce((sum, t) => t.status !== 'skipped' ? sum + t.amount : sum, 0) || 0,
      accountGroups: [...new Set(f.transactions?.map(t => t.accountName || 'Sin cuenta') || [])]
    }));
  } catch (e) {
    console.error('Error loading import file list:', e);
    return [];
  }
}

/**
 * Get a specific import file with all transactions
 */
export function getImportFile(budgetId: string, fileId: string): ImportFileWithTransactions | null {
  try {
    const key = `${IMPORT_FILES_KEY}-${budgetId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    
    const files: ImportFileWithTransactions[] = JSON.parse(stored);
    return files.find(f => f.id === fileId) || null;
  } catch (e) {
    console.error('Error loading import file:', e);
    return null;
  }
}

/**
 * Save or update an import file
 */
export function saveImportFile(budgetId: string, file: ImportFileWithTransactions): void {
  try {
    const key = `${IMPORT_FILES_KEY}-${budgetId}`;
    const stored = localStorage.getItem(key);
    let files: ImportFileWithTransactions[] = stored ? JSON.parse(stored) : [];
    
    // Update timestamp
    file.updatedAt = new Date().toISOString();
    
    // Find and update or add
    const index = files.findIndex(f => f.id === file.id);
    if (index >= 0) {
      files[index] = file;
    } else {
      files.push(file);
    }
    
    localStorage.setItem(key, JSON.stringify(files));
  } catch (e) {
    console.error('Error saving import file:', e);
    throw e;
  }
}

/**
 * Delete an import file
 */
export function deleteImportFile(budgetId: string, fileId: string): void {
  try {
    const key = `${IMPORT_FILES_KEY}-${budgetId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return;
    
    let files: ImportFileWithTransactions[] = JSON.parse(stored);
    files = files.filter(f => f.id !== fileId);
    
    localStorage.setItem(key, JSON.stringify(files));
  } catch (e) {
    console.error('Error deleting import file:', e);
    throw e;
  }
}

/**
 * Create a new import file from transactions
 */
export function createImportFile(
  name: string,
  sourceFile: string,
  transactions: ImportTransaction[]
): ImportFileWithTransactions {
  const now = new Date().toISOString();
  const accountGroups = [...new Set(transactions.map(t => t.accountName || 'Sin cuenta'))];
  
  return {
    id: crypto.randomUUID(),
    name,
    sourceFile,
    createdAt: now,
    updatedAt: now,
    transactionCount: transactions.length,
    readyCount: transactions.filter(t => t.status === 'ready').length,
    pendingCount: transactions.filter(t => t.status === 'pending').length,
    netAmount: transactions.reduce((sum, t) => t.status !== 'skipped' ? sum + t.amount : sum, 0),
    accountGroups,
    transactions
  };
}

/**
 * Export import file as JSON for download
 */
export function exportImportFile(file: ImportFileWithTransactions): string {
  return JSON.stringify(file, null, 2);
}

/**
 * Import file from JSON
 */
export function importFromJson(json: string): ImportFileWithTransactions {
  const file = JSON.parse(json);
  
  // Validate structure
  if (!file.id || !file.transactions || !Array.isArray(file.transactions)) {
    throw new Error('Invalid import file format');
  }
  
  // Generate new ID to avoid conflicts
  file.id = crypto.randomUUID();
  file.createdAt = new Date().toISOString();
  file.updatedAt = new Date().toISOString();
  
  return file;
}

