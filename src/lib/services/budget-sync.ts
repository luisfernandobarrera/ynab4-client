/**
 * Budget Sync Service
 * Handles syncing pending changes to Dropbox or local filesystem via ydiff files
 * 
 * This service uses the YnabClient's push() method which:
 * 1. Gets dirty entities from EntityManager
 * 2. Creates a ydiff file with the changes
 * 3. Writes it to the device folder
 * 4. Updates device knowledge
 * 5. Updates server knowledge in budget.ymeta
 */

import { get } from 'svelte/store';
import { budgetInfo } from '$lib/stores/budget';
import { clearPendingChanges, addToast, changeCount } from '$lib/stores/ui';

interface SyncResult {
  success: boolean;
  message: string;
  changesApplied: number;
  ydiffPath?: string;
}

/**
 * Sync pending changes to the budget
 * Uses the YnabClient's push() method to write ydiff files
 */
export async function syncPendingChanges(): Promise<SyncResult> {
  const info = get(budgetInfo);
  const pendingChangeCount = get(changeCount);

  if (pendingChangeCount === 0) {
    return {
      success: true,
      message: 'No changes to sync',
      changesApplied: 0
    };
  }

  if (!info.client) {
    return {
      success: false,
      message: 'No budget loaded',
      changesApplied: 0
    };
  }

  if (!info.canWrite) {
    return {
      success: false,
      message: 'Budget is read-only',
      changesApplied: 0
    };
  }

  try {
    console.log(`[Budget Sync] Starting sync of ${pendingChangeCount} changes...`);
    
    // Call the YnabClient's push() method
    // This will:
    // 1. Get dirty entities from EntityManager
    // 2. Generate a ydiff file
    // 3. Write it to the device folder
    // 4. Update device knowledge
    // 5. Update server knowledge in budget.ymeta
    // 6. Clear dirty state in EntityManager
    await info.client.push();
    
    console.log('[Budget Sync] Push completed successfully');
    
    // Clear UI pending changes state
    clearPendingChanges();
    
    addToast({ 
      type: 'success', 
      message: `Synced ${pendingChangeCount} change(s)` 
    });

    return {
      success: true,
      message: `Successfully synced ${pendingChangeCount} changes`,
      changesApplied: pendingChangeCount
    };
  } catch (error) {
    console.error('[Budget Sync] Sync failed:', error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    
    addToast({ 
      type: 'error', 
      message: `Sync failed: ${message}` 
    });

    return {
      success: false,
      message,
      changesApplied: 0
    };
  }
}

/**
 * Check if there are pending changes that can be synced
 */
export function canSync(): boolean {
  const info = get(budgetInfo);
  const pendingChangeCount = get(changeCount);
  
  return pendingChangeCount > 0 && info.client !== null && info.canWrite;
}

/**
 * Get the device info for the current budget
 */
export function getDeviceInfo(): { deviceGUID?: string; shortDeviceId?: string } | null {
  const info = get(budgetInfo);
  if (!info.client) return null;
  
  return {
    deviceGUID: info.client.getDeviceGUID(),
    shortDeviceId: info.client.getDeviceShortId()
  };
}

/**
 * Check if the current budget has a device configured
 */
export function hasDevice(): boolean {
  const deviceInfo = getDeviceInfo();
  return deviceInfo !== null && deviceInfo.deviceGUID !== undefined;
}

