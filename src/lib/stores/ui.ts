import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

// Breakpoints
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

// UI State
export const sidebarOpen = writable(false);
export const isMobile = writable(false);
export const isTablet = writable(false);
export const isDesktop = writable(false);

// ============================================
// Edit Mode System
// ============================================

export interface PendingChange {
  id: string;
  type: 'transaction' | 'category' | 'account' | 'payee' | 'budget';
  action: 'create' | 'update' | 'delete';
  entityId: string;
  entityName?: string;
  data: unknown;
  timestamp: number;
}

// Core edit mode state
export const isEditMode = writable(false);
export const pendingChanges = writable<PendingChange[]>([]);
export const showEditModeWarning = writable(false);

// Derived states
export const isDirty = derived(pendingChanges, ($changes) => $changes.length > 0);
export const changeCount = derived(pendingChanges, ($changes) => $changes.length);

// Edit mode actions
export function enableEditMode() {
  isEditMode.set(true);
  showEditModeWarning.set(false);
}

export function disableEditMode() {
  const changes = get(pendingChanges);
  if (changes.length > 0) {
    // There are unsaved changes, warn user
    return false;
  }
  isEditMode.set(false);
  return true;
}

export function forceDisableEditMode() {
  pendingChanges.set([]);
  isEditMode.set(false);
}

export function requestEditMode() {
  showEditModeWarning.set(true);
}

export function cancelEditModeRequest() {
  showEditModeWarning.set(false);
}

// Pending changes management
export function addPendingChange(change: Omit<PendingChange, 'id' | 'timestamp'>) {
  const newChange: PendingChange = {
    ...change,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  
  pendingChanges.update((changes) => {
    // Check if there's already a change for this entity
    const existingIndex = changes.findIndex(
      (c) => c.entityId === change.entityId && c.type === change.type
    );
    
    if (existingIndex !== -1) {
      // Update existing change
      const updated = [...changes];
      
      // If original action was 'create' and new action is 'update', keep it as 'create'
      // If original action was 'create' and new action is 'delete', remove it entirely
      const existing = updated[existingIndex];
      
      if (existing.action === 'create' && change.action === 'delete') {
        // Remove the pending creation
        updated.splice(existingIndex, 1);
        return updated;
      }
      
      if (existing.action === 'create' && change.action === 'update') {
        // Keep as create but with new data
        updated[existingIndex] = { ...newChange, action: 'create' };
        return updated;
      }
      
      // Otherwise just update
      updated[existingIndex] = newChange;
      return updated;
    }
    
    return [...changes, newChange];
  });
  
  return newChange.id;
}

export function removePendingChange(id: string) {
  pendingChanges.update((changes) => changes.filter((c) => c.id !== id));
}

export function clearPendingChanges() {
  pendingChanges.set([]);
}

export function getPendingChangesByType(type: PendingChange['type']): PendingChange[] {
  return get(pendingChanges).filter((c) => c.type === type);
}

// Initialize responsive state
if (browser) {
  const updateBreakpoints = () => {
    const width = window.innerWidth;
    isMobile.set(width < MOBILE_BREAKPOINT);
    isTablet.set(width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT);
    isDesktop.set(width >= TABLET_BREAKPOINT);
    
    // Auto-close sidebar on mobile
    if (width < MOBILE_BREAKPOINT) {
      sidebarOpen.set(false);
    }
  };
  
  updateBreakpoints();
  window.addEventListener('resize', updateBreakpoints);
}

// Theme
export type Theme = 'light' | 'dark' | 'system';
export const theme = writable<Theme>('dark');

// Modal state
export const activeModal = writable<string | null>(null);
export const modalData = writable<unknown>(null);

export function openModal(name: string, data?: unknown) {
  activeModal.set(name);
  modalData.set(data);
}

export function closeModal() {
  activeModal.set(null);
  modalData.set(null);
}

// Toast notifications
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export const toasts = writable<Toast[]>([]);

export function addToast(toast: Omit<Toast, 'id'>) {
  const id = crypto.randomUUID();
  const newToast = { ...toast, id };
  
  toasts.update((t) => [...t, newToast]);
  
  // Auto-remove after duration
  const duration = toast.duration ?? 5000;
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
  
  return id;
}

export function removeToast(id: string) {
  toasts.update((t) => t.filter((toast) => toast.id !== id));
}

// Selection state for multi-select
export const selectedTransactionIds = writable<Set<string>>(new Set());

export function toggleTransactionSelection(id: string) {
  selectedTransactionIds.update((ids) => {
    const newIds = new Set(ids);
    if (newIds.has(id)) {
      newIds.delete(id);
    } else {
      newIds.add(id);
    }
    return newIds;
  });
}

export function selectAllTransactions(ids: string[]) {
  selectedTransactionIds.set(new Set(ids));
}

export function clearTransactionSelection() {
  selectedTransactionIds.set(new Set());
}

