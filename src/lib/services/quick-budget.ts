/**
 * QuickBudget Service
 *
 * Provides budget fill calculations matching YNAB4's QuickBudget functionality.
 *
 * Fill options:
 * - Budgeted Last Month: Copy previous month's budget
 * - Spent Last Month: Fill with last month's actual spending
 * - Average Spent: Fill with average spending over N months
 * - Average Budgeted: Fill with average budget over N months
 * - Underfunded: Fill to cover negative balance
 * - Goal Amount: Fill to reach category goal (if set)
 * - Zero: Clear budget to 0
 */

import type { YnabClient, Transaction, Category } from 'ynab-library';

export type QuickBudgetOption =
  | 'budgetedLastMonth'
  | 'spentLastMonth'
  | 'averageSpent'
  | 'averageBudgeted'
  | 'underfunded'
  | 'goalAmount'
  | 'zero';

export interface QuickBudgetResult {
  categoryId: string;
  categoryName: string;
  previousValue: number;
  newValue: number;
  option: QuickBudgetOption;
}

export interface QuickBudgetOptions {
  averageMonths?: number; // Default 3
  includeCurrentMonth?: boolean;
}

/**
 * Get the month string in YYYY-MM format
 */
function getMonthString(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

/**
 * Get the previous month date
 */
function getPreviousMonth(date: Date): Date {
  const prev = new Date(date);
  prev.setMonth(prev.getMonth() - 1);
  return prev;
}

/**
 * Get N previous months as YYYY-MM strings
 */
function getPreviousMonths(date: Date, count: number): string[] {
  const months: string[] = [];
  const current = new Date(date);

  for (let i = 0; i < count; i++) {
    current.setMonth(current.getMonth() - 1);
    months.push(getMonthString(current));
  }

  return months;
}

export class QuickBudgetService {
  private client: YnabClient;

  constructor(client: YnabClient) {
    this.client = client;
  }

  /**
   * Calculate the spending for a category in a given month
   */
  private getSpentInMonth(categoryId: string, month: string): number {
    const transactions = this.client.getTransactions();

    return transactions
      .filter((tx: Transaction) => {
        const txMonth = tx.date?.substring(0, 7);
        return txMonth === month &&
               tx.categoryId === categoryId &&
               tx.amount < 0 &&
               !tx.transferAccountId;
      })
      .reduce((sum: number, tx: Transaction) => sum + Math.abs(tx.amount), 0);
  }

  /**
   * Calculate the budgeted amount for a category in a given month
   */
  private getBudgetedInMonth(categoryId: string, month: string): number {
    // Access monthly budget data through the client
    const monthlyBudgets = this.client.getMonthlyBudgets?.() || [];
    const monthBudget = monthlyBudgets.find((mb: any) => {
      const mbMonth = mb.month?.substring(0, 7);
      return mbMonth === month;
    });

    if (!monthBudget) return 0;

    const subCategoryBudget = monthBudget.monthlySubCategoryBudgets?.find(
      (scb: any) => scb.categoryId === categoryId
    );

    return subCategoryBudget?.budgeted || 0;
  }

  /**
   * Get the current balance for a category
   */
  private getCategoryBalance(categoryId: string, month: string): number {
    const category = this.client.getCategoryById(categoryId);
    if (!category) return 0;

    // Calculate balance from transactions and budgeted amounts
    // This is a simplified version - the real calculation is more complex
    const budgeted = this.getBudgetedInMonth(categoryId, month);
    const spent = this.getSpentInMonth(categoryId, month);

    // Balance = budgeted - spent (spent is already absolute)
    return budgeted - spent;
  }

  /**
   * Fill with last month's budgeted amount
   */
  fillBudgetedLastMonth(categoryId: string, currentMonth: Date): number {
    const prevMonth = getMonthString(getPreviousMonth(currentMonth));
    return this.getBudgetedInMonth(categoryId, prevMonth);
  }

  /**
   * Fill with last month's actual spending
   */
  fillSpentLastMonth(categoryId: string, currentMonth: Date): number {
    const prevMonth = getMonthString(getPreviousMonth(currentMonth));
    return this.getSpentInMonth(categoryId, prevMonth);
  }

  /**
   * Fill with average spending over N months
   */
  fillAverageSpent(categoryId: string, currentMonth: Date, months: number = 3): number {
    const prevMonths = getPreviousMonths(currentMonth, months);

    let total = 0;
    let validMonths = 0;

    for (const month of prevMonths) {
      const spent = this.getSpentInMonth(categoryId, month);
      if (spent > 0) {
        total += spent;
        validMonths++;
      }
    }

    return validMonths > 0 ? Math.round(total / validMonths) : 0;
  }

  /**
   * Fill with average budgeted over N months
   */
  fillAverageBudgeted(categoryId: string, currentMonth: Date, months: number = 3): number {
    const prevMonths = getPreviousMonths(currentMonth, months);

    let total = 0;
    let validMonths = 0;

    for (const month of prevMonths) {
      const budgeted = this.getBudgetedInMonth(categoryId, month);
      if (budgeted > 0) {
        total += budgeted;
        validMonths++;
      }
    }

    return validMonths > 0 ? Math.round(total / validMonths) : 0;
  }

  /**
   * Fill to cover negative balance (underfunded)
   */
  fillUnderfunded(categoryId: string, currentMonth: Date): number {
    const month = getMonthString(currentMonth);
    const balance = this.getCategoryBalance(categoryId, month);

    // If balance is negative, return the amount needed to make it zero
    return balance < 0 ? Math.abs(balance) : 0;
  }

  /**
   * Fill to reach goal amount
   * Note: YNAB4 goals are stored in category metadata
   */
  fillGoalAmount(categoryId: string, currentMonth: Date): number {
    const category = this.client.getCategoryById(categoryId);
    if (!category) return 0;

    // Goal types in YNAB4:
    // - Target Category Balance (save X total)
    // - Target Category Balance by Date (save X by date)
    // - Monthly Funding Goal (budget X each month)

    const goalData = (category as any).goalData;
    if (!goalData) return 0;

    const month = getMonthString(currentMonth);
    const currentBalance = this.getCategoryBalance(categoryId, month);

    switch (goalData.type) {
      case 'targetBalance':
        // Need to save enough to reach target
        return Math.max(0, goalData.targetBalance - currentBalance);

      case 'targetBalanceByDate':
        // Calculate monthly contribution to reach target by date
        const targetDate = new Date(goalData.targetDate);
        const monthsRemaining = Math.max(1,
          (targetDate.getFullYear() - currentMonth.getFullYear()) * 12 +
          (targetDate.getMonth() - currentMonth.getMonth())
        );
        const amountNeeded = goalData.targetBalance - currentBalance;
        return Math.max(0, Math.ceil(amountNeeded / monthsRemaining));

      case 'monthlyFunding':
        return goalData.monthlyFunding || 0;

      default:
        return 0;
    }
  }

  /**
   * Apply a quick budget option to a category
   */
  applyQuickBudget(
    categoryId: string,
    option: QuickBudgetOption,
    currentMonth: Date,
    options: QuickBudgetOptions = {}
  ): number {
    const { averageMonths = 3 } = options;

    switch (option) {
      case 'budgetedLastMonth':
        return this.fillBudgetedLastMonth(categoryId, currentMonth);
      case 'spentLastMonth':
        return this.fillSpentLastMonth(categoryId, currentMonth);
      case 'averageSpent':
        return this.fillAverageSpent(categoryId, currentMonth, averageMonths);
      case 'averageBudgeted':
        return this.fillAverageBudgeted(categoryId, currentMonth, averageMonths);
      case 'underfunded':
        return this.fillUnderfunded(categoryId, currentMonth);
      case 'goalAmount':
        return this.fillGoalAmount(categoryId, currentMonth);
      case 'zero':
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Apply quick budget to multiple categories
   */
  applyQuickBudgetBatch(
    categoryIds: string[],
    option: QuickBudgetOption,
    currentMonth: Date,
    options: QuickBudgetOptions = {}
  ): QuickBudgetResult[] {
    const results: QuickBudgetResult[] = [];
    const month = getMonthString(currentMonth);

    for (const categoryId of categoryIds) {
      const category = this.client.getCategoryById(categoryId);
      if (!category) continue;

      const previousValue = this.getBudgetedInMonth(categoryId, month);
      const newValue = this.applyQuickBudget(categoryId, option, currentMonth, options);

      results.push({
        categoryId,
        categoryName: category.name || 'Unknown',
        previousValue,
        newValue,
        option,
      });
    }

    return results;
  }

  /**
   * Fill all underfunded categories in a month
   */
  fillAllUnderfunded(currentMonth: Date): QuickBudgetResult[] {
    const categories = this.client.getCategories();
    const categoryIds = categories
      .filter((c: Category) => !c.isTombstone)
      .map((c: Category) => c.entityId);

    return this.applyQuickBudgetBatch(categoryIds, 'underfunded', currentMonth);
  }

  /**
   * Fill all categories from last month's budget
   */
  fillAllFromLastMonth(currentMonth: Date): QuickBudgetResult[] {
    const categories = this.client.getCategories();
    const categoryIds = categories
      .filter((c: Category) => !c.isTombstone)
      .map((c: Category) => c.entityId);

    return this.applyQuickBudgetBatch(categoryIds, 'budgetedLastMonth', currentMonth);
  }

  /**
   * Get quick budget preview for a category (without applying)
   */
  getQuickBudgetPreview(
    categoryId: string,
    currentMonth: Date,
    options: QuickBudgetOptions = {}
  ): Record<QuickBudgetOption, number> {
    const { averageMonths = 3 } = options;

    return {
      budgetedLastMonth: this.fillBudgetedLastMonth(categoryId, currentMonth),
      spentLastMonth: this.fillSpentLastMonth(categoryId, currentMonth),
      averageSpent: this.fillAverageSpent(categoryId, currentMonth, averageMonths),
      averageBudgeted: this.fillAverageBudgeted(categoryId, currentMonth, averageMonths),
      underfunded: this.fillUnderfunded(categoryId, currentMonth),
      goalAmount: this.fillGoalAmount(categoryId, currentMonth),
      zero: 0,
    };
  }
}

/**
 * Quick budget option labels (Spanish)
 */
export const QUICK_BUDGET_LABELS: Record<QuickBudgetOption, string> = {
  budgetedLastMonth: 'Presupuestado el mes pasado',
  spentLastMonth: 'Gastado el mes pasado',
  averageSpent: 'Promedio gastado (3 meses)',
  averageBudgeted: 'Promedio presupuestado (3 meses)',
  underfunded: 'Cubrir déficit',
  goalAmount: 'Meta del objetivo',
  zero: 'Poner en cero',
};

/**
 * Quick budget option icons (for UI)
 */
export const QUICK_BUDGET_ICONS: Record<QuickBudgetOption, string> = {
  budgetedLastMonth: '📋',
  spentLastMonth: '💸',
  averageSpent: '📊',
  averageBudgeted: '📈',
  underfunded: '🔴',
  goalAmount: '🎯',
  zero: '0️⃣',
};
