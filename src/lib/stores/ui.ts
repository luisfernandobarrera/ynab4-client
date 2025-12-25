import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// Breakpoints
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

// UI State
export const sidebarOpen = writable(false);
export const isMobile = writable(false);
export const isTablet = writable(false);
export const isDesktop = writable(false);

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

