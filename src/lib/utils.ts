import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as currency
 */
export function formatCurrency(amount: number, locale = 'es-MX', currency = 'MXN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
}

/**
 * Format a date in short format (e.g., "15 Ene")
 */
export function formatDate(date: string | Date | null | undefined, locale = 'es-MX'): string {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return String(date);
  }
}

/**
 * Format a date in long format (e.g., "15 Ene 2024")
 */
export function formatDateLong(date: string | Date | null | undefined, locale = 'es-MX'): string {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(date);
  }
}

/**
 * Format a date with full month name (e.g., "15 de Enero de 2024")
 */
export function formatDateFull(date: string | Date | null | undefined, locale = 'es-MX'): string {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return String(date);
  }
}

// ============================================
// Lookup Helpers - Centralized data lookups
// Using generic types to work with both ynab-library types and store types
// ============================================

interface PayeeLike {
  entityId: string;
  name: string;
}

interface CategoryLike {
  entityId: string;
  name: string;
  masterCategoryId?: string;
}

interface MasterCategoryLike {
  entityId: string;
  name: string;
}

interface AccountLike {
  entityId: string;
  name?: string;
  accountName?: string;
  accountType?: string;
  type?: string;
}

/**
 * Get payee name by ID
 */
export function getPayeeName(
  payeeId: string | null | undefined,
  payees: PayeeLike[],
  fallback = 'Sin Beneficiario'
): string {
  if (!payeeId) return fallback;
  const payee = payees.find(p => p.entityId === payeeId);
  return payee?.name || fallback;
}

/**
 * Get account name by ID
 */
export function getAccountName(
  accountId: string | null | undefined,
  accounts: AccountLike[],
  fallback = ''
): string {
  if (!accountId) return fallback;
  const account = accounts.find(a => a.entityId === accountId);
  return account?.accountName || account?.name || fallback;
}

/**
 * Get category name by ID
 */
export function getCategoryName(
  categoryId: string | null | undefined,
  categories: CategoryLike[],
  fallback = ''
): string {
  if (!categoryId) return fallback;
  const category = categories.find(c => c.entityId === categoryId);
  return category?.name || fallback;
}

/**
 * Get full category path (MasterCategory: Category)
 */
export function getCategoryFullName(
  categoryId: string | null | undefined,
  categories: CategoryLike[],
  masterCategories: MasterCategoryLike[],
  fallback = ''
): string {
  if (!categoryId) return fallback;
  const category = categories.find(c => c.entityId === categoryId);
  if (!category) return fallback;

  const masterCatId = category.masterCategoryId;
  if (masterCatId) {
    const master = masterCategories.find(m => m.entityId === masterCatId);
    if (master) {
      return `${master.name}: ${category.name}`;
    }
  }
  return category.name;
}

/**
 * Get account type classification
 */
export function getAccountType(
  accountId: string | null | undefined,
  accounts: AccountLike[]
): 'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'other' {
  if (!accountId) return 'other';
  const account = accounts.find(a => a.entityId === accountId);
  if (!account) return 'other';

  const type = (account.accountType || account.type || '').toLowerCase();

  if (type.includes('checking')) return 'checking';
  if (type.includes('savings')) return 'savings';
  if (type.includes('credit')) return 'credit';
  if (type.includes('cash')) return 'cash';
  if (type.includes('invest')) return 'investment';

  return 'other';
}

/**
 * Get transfer category label based on account type
 */
export function getTransferLabel(
  accountId: string | null | undefined,
  accounts: AccountLike[]
): string {
  const type = getAccountType(accountId, accounts);
  const labels: Record<string, string> = {
    checking: 'Cuenta Cheques',
    savings: 'Cuenta de Ahorro',
    credit: 'Tarjeta de Crédito',
    cash: 'Efectivo',
    investment: 'Inversiones',
    other: 'Transferencia',
  };
  return labels[type] || 'Transferencia';
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

