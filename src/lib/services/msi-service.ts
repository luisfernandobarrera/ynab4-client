/**
 * MSI (Meses Sin Intereses) Service
 * Handles splitting a purchase into a counter-transaction and N scheduled payments
 */

import type { Transaction, ScheduledTransaction } from '$lib/stores/budget';

export interface MSIConfig {
  originalTransaction: {
    date: string;
    payeeId: string | null;
    payeeName: string;
    categoryId: string | null;
    categoryName: string;
    accountId: string;
    amount: number; // Original purchase amount (negative)
    memo: string;
  };
  months: number; // Number of installments (3, 6, 9, 12, 18, 24)
  startDate: string; // First payment date
  counterCategoryId?: string; // Category for the counter-transaction
}

export interface MSIResult {
  /**
   * Counter-transaction to offset the original purchase
   * This is a positive inflow equal to the original amount
   */
  counterTransaction: Omit<Transaction, 'id' | 'entityId'>;

  /**
   * The scheduled transaction for recurring payments
   * Will generate N payments over N months
   */
  scheduledTransaction: Omit<ScheduledTransaction, 'entityId'>;

  /**
   * Monthly payment amount
   */
  monthlyAmount: number;

  /**
   * Total amount to be paid
   */
  totalAmount: number;
}

/**
 * Calculate MSI split from a purchase
 * 
 * @example
 * // Original purchase: -$12,000 on credit card for a TV
 * // Split into 12 months:
 * // - Counter: +$12,000 (offsets the purchase in the category)
 * // - Scheduled: -$1,000/month for 12 months
 */
export function calculateMSI(config: MSIConfig): MSIResult {
  const { originalTransaction, months, startDate, counterCategoryId } = config;
  
  // Original amount should be negative (outflow)
  const absAmount = Math.abs(originalTransaction.amount);
  
  // Calculate monthly payment (round to avoid floating point issues)
  const monthlyAmount = Math.round((absAmount / months) * 100) / 100;
  
  // Total (may differ slightly due to rounding)
  const totalAmount = monthlyAmount * months;
  
  // Adjustment for rounding (add to first payment)
  const roundingDiff = absAmount - totalAmount;

  // Counter-transaction: positive amount to offset original purchase
  const counterTransaction: Omit<Transaction, 'id' | 'entityId'> = {
    date: originalTransaction.date,
    amount: absAmount, // Positive (inflow)
    payee: `MSI: ${originalTransaction.payeeName}`,
    payeeId: null,
    category: counterCategoryId ? '' : originalTransaction.categoryName, // Use original category or specified one
    categoryId: counterCategoryId || originalTransaction.categoryId,
    memo: `MSI ${months} meses - Contrapartida de ${originalTransaction.payeeName}`,
    cleared: 'Uncleared',
    flag: 'Orange', // Mark MSI with orange flag
    accountId: originalTransaction.accountId,
    accountName: '', // Will be filled by caller
    transferAccountId: null,
  };

  // Scheduled transaction for monthly payments
  const scheduledTransaction: Omit<ScheduledTransaction, 'entityId'> = {
    date: startDate,
    dateNext: startDate,
    frequency: 'Monthly',
    amount: -(monthlyAmount + (roundingDiff > 0 ? roundingDiff : 0)), // First payment includes rounding adjustment
    payeeId: originalTransaction.payeeId,
    categoryId: originalTransaction.categoryId,
    accountId: originalTransaction.accountId,
    memo: `MSI ${months} meses - Pago ${1}/${months}`,
    flag: 'Orange',
  };

  return {
    counterTransaction,
    scheduledTransaction,
    monthlyAmount,
    totalAmount: absAmount,
  };
}

/**
 * Generate all MSI transactions at once (alternative to scheduled)
 * Creates N individual transactions instead of a scheduled transaction
 */
export function generateAllMSITransactions(config: MSIConfig): Array<Omit<Transaction, 'id' | 'entityId'>> {
  const { originalTransaction, months, startDate } = config;
  
  const absAmount = Math.abs(originalTransaction.amount);
  const monthlyAmount = Math.round((absAmount / months) * 100) / 100;
  const roundingDiff = absAmount - (monthlyAmount * months);
  
  const transactions: Array<Omit<Transaction, 'id' | 'entityId'>> = [];
  
  // Generate payment for each month
  for (let i = 0; i < months; i++) {
    const paymentDate = new Date(startDate);
    paymentDate.setMonth(paymentDate.getMonth() + i);
    
    // First payment includes rounding adjustment
    const amount = i === 0 
      ? -(monthlyAmount + roundingDiff)
      : -monthlyAmount;
    
    transactions.push({
      date: paymentDate.toISOString().split('T')[0],
      amount,
      payee: originalTransaction.payeeName,
      payeeId: originalTransaction.payeeId,
      category: originalTransaction.categoryName,
      categoryId: originalTransaction.categoryId,
      memo: `MSI ${months} meses - Pago ${i + 1}/${months}`,
      cleared: 'Uncleared',
      flag: 'Orange',
      accountId: originalTransaction.accountId,
      accountName: '',
      transferAccountId: null,
    });
  }
  
  return transactions;
}

/**
 * Validate MSI configuration
 */
export function validateMSIConfig(config: MSIConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.originalTransaction.amount >= 0) {
    errors.push('MSI only applies to outflows (purchases)');
  }
  
  if (![3, 6, 9, 12, 18, 24].includes(config.months)) {
    errors.push('MSI months must be 3, 6, 9, 12, 18, or 24');
  }
  
  if (!config.startDate) {
    errors.push('Start date is required');
  }
  
  const absAmount = Math.abs(config.originalTransaction.amount);
  if (absAmount < config.months) {
    errors.push('Amount is too small to split into monthly payments');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Common MSI month options
 */
export const MSI_MONTH_OPTIONS = [
  { value: 3, label: '3 meses' },
  { value: 6, label: '6 meses' },
  { value: 9, label: '9 meses' },
  { value: 12, label: '12 meses' },
  { value: 18, label: '18 meses' },
  { value: 24, label: '24 meses' },
] as const;

