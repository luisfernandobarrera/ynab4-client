import { writable, derived, get } from 'svelte/store';
import type { YnabClient } from 'ynab-library';
import { BudgetLoader, type BudgetInfo as LoaderBudgetInfo } from '$lib/services';

// Types
export interface Account {
  id: string;
  entityId: string;
  name: string;
  type: string;
  onBudget: boolean;
  closed: boolean;
  hidden: boolean;
  balance: number;
}

export interface Transaction {
  id: string;
  entityId: string;
  date: string;
  amount: number;
  payee: string;
  payeeId: string | null;
  category: string;
  categoryId: string | null;
  memo: string;
  cleared: string;
  flag: string | null;
  accountId: string;
  accountName: string;
  transferAccountId: string | null;
}

export interface Category {
  entityId: string;
  name: string;
  masterCategoryId: string;
  masterCategoryName: string;
  budgeted: number;
  activity: number;
  balance: number;
}

export interface MasterCategory {
  entityId: string;
  name: string;
  sortableIndex: number;
  categories: Category[];
}

export interface Payee {
  id: string;
  entityId: string;
  name: string;
}

export interface ScheduledTransaction {
  entityId: string;
  date: string;
  dateNext: string;
  frequency: string;
  amount: number;
  payeeId: string | null;
  categoryId: string | null;
  accountId: string;
  memo: string;
  flag: string | null;
}

export interface BudgetInfo {
  client: YnabClient | null;
  mode: 'local' | 'dropbox' | 'browser' | null;
  canWrite: boolean;
  budgetName: string;
  budgetPath: string | null;
  dataFolderName: string | null;
  io: unknown;
}

// Stores
export const budgetInfo = writable<BudgetInfo>({
  client: null,
  mode: null,
  canWrite: false,
  budgetName: '',
  budgetPath: null,
  dataFolderName: null,
  io: null,
});

export const accounts = writable<Account[]>([]);
export const transactions = writable<Transaction[]>([]);
export const categories = writable<Category[]>([]);
export const masterCategories = writable<MasterCategory[]>([]);
export const payees = writable<Payee[]>([]);
export const scheduledTransactions = writable<ScheduledTransaction[]>([]);

export const isLoading = writable(false);
export const loadError = writable<string | null>(null);
export const currentView = writable<string>('budget');
export const selectedAccountId = writable<string | null>(null);
export const selectedDate = writable<Date>(new Date());
export const selectedMonth = writable<string>(
  new Date().toISOString().substring(0, 7) // YYYY-MM
);

// Derived stores
export const activeAccounts = derived(accounts, ($accounts) =>
  $accounts.filter((a) => !a.closed && !a.hidden)
);

export const onBudgetAccounts = derived(activeAccounts, ($activeAccounts) =>
  $activeAccounts.filter((a) => a.onBudget)
);

export const offBudgetAccounts = derived(activeAccounts, ($activeAccounts) =>
  $activeAccounts.filter((a) => !a.onBudget)
);

export const selectedAccountTransactions = derived(
  [transactions, selectedAccountId],
  ([$transactions, $selectedAccountId]) => {
    if (!$selectedAccountId) return $transactions;
    return $transactions.filter((t) => t.accountId === $selectedAccountId);
  }
);

export const totalBalance = derived(onBudgetAccounts, ($onBudgetAccounts) =>
  $onBudgetAccounts.reduce((sum, a) => sum + a.balance, 0)
);

// Actions
export function resetBudget() {
  budgetInfo.set({
    client: null,
    mode: null,
    canWrite: false,
    budgetName: '',
    budgetPath: null,
    dataFolderName: null,
    io: null,
  });
  accounts.set([]);
  transactions.set([]);
  categories.set([]);
  masterCategories.set([]);
  payees.set([]);
  scheduledTransactions.set([]);
  selectedAccountId.set(null);
  loadError.set(null);
}

/**
 * Load budget from Dropbox
 */
export async function loadFromDropbox(accessToken: string, budgetPath: string): Promise<void> {
  isLoading.set(true);
  loadError.set(null);

  try {
    const result = await BudgetLoader.loadFromDropbox(accessToken, budgetPath);
    await populateBudgetData(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load budget';
    loadError.set(message);
    console.error('[Budget Store] Load error:', error);
    throw error;
  } finally {
    isLoading.set(false);
  }
}

/**
 * Load budget from local filesystem
 */
export async function loadFromLocal(path: string): Promise<void> {
  isLoading.set(true);
  loadError.set(null);

  try {
    const result = await BudgetLoader.loadFromLocalPath(path);
    await populateBudgetData(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load budget';
    loadError.set(message);
    console.error('[Budget Store] Load error:', error);
    throw error;
  } finally {
    isLoading.set(false);
  }
}

/**
 * Populate stores from loaded budget
 */
async function populateBudgetData(result: LoaderBudgetInfo): Promise<void> {
  const { client } = result;

  // Set budget info
  budgetInfo.set({
    client,
    mode: result.mode,
    canWrite: result.canWrite,
    budgetName: result.budgetName,
    budgetPath: result.budgetPath,
    dataFolderName: result.dataFolderName,
    io: result.io,
  });

  // Get current month for budget data
  const currentMonth = get(selectedMonth);

  // Load accounts
  const accountList = client.getAccounts() || [];
  accounts.set(
    accountList.map((acc: Record<string, unknown>) => ({
      id: acc.entityId as string,
      entityId: acc.entityId as string,
      name: acc.accountName as string,
      type: acc.accountType as string,
      onBudget: acc.onBudget as boolean,
      closed: acc.isTombstone as boolean || false,
      hidden: acc.hidden as boolean || false,
      balance: (acc.balance as number) || 0,
    }))
  );

  // Load payees
  const payeeList = client.getPayees() || [];
  payees.set(
    payeeList.map((p: Record<string, unknown>) => ({
      id: p.entityId as string,
      entityId: p.entityId as string,
      name: p.name as string,
    }))
  );

  // Load transactions with payee/category names
  const txList = client.getTransactions() || [];
  const payeeMap = new Map(payeeList.map((p: Record<string, unknown>) => [p.entityId, p.name]));
  const accountMap = new Map(accountList.map((a: Record<string, unknown>) => [a.entityId, a.accountName]));

  // Get category names
  const categoryList = client.getCategories() || [];
  const categoryMap = new Map(categoryList.map((c: Record<string, unknown>) => [c.entityId, c.name]));

  transactions.set(
    txList
      .filter((tx: Record<string, unknown>) => !tx.isTombstone)
      .map((tx: Record<string, unknown>) => ({
        id: tx.entityId as string,
        entityId: tx.entityId as string,
        date: tx.date as string,
        amount: (tx.amount as number) || 0,
        payee: (payeeMap.get(tx.payeeId as string) as string) || '',
        payeeId: tx.payeeId as string | null,
        category: (categoryMap.get(tx.categoryId as string) as string) || '',
        categoryId: tx.categoryId as string | null,
        memo: (tx.memo as string) || '',
        cleared: tx.cleared as string,
        flag: tx.flag as string | null,
        accountId: tx.accountId as string,
        accountName: (accountMap.get(tx.accountId as string) as string) || '',
        transferAccountId: tx.transferAccountId as string | null,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  );

  // Load categories with budget data
  const masterCategoryList = client.getMasterCategories() || [];
  const monthlyBudgets = client.getMonthlyBudgets?.(currentMonth) || [];
  const budgetMap = new Map(
    monthlyBudgets.map((b: Record<string, unknown>) => [b.categoryId, b])
  );

  const masters: MasterCategory[] = [];

  for (const mc of masterCategoryList) {
    if (mc.isTombstone || mc.name === 'Hidden Categories') continue;

    const cats = categoryList
      .filter((c: Record<string, unknown>) => c.masterCategoryId === mc.entityId && !c.isTombstone)
      .map((c: Record<string, unknown>) => {
        const budget = budgetMap.get(c.entityId) as Record<string, unknown> | undefined;
        return {
          entityId: c.entityId as string,
          name: c.name as string,
          masterCategoryId: mc.entityId as string,
          masterCategoryName: mc.name as string,
          budgeted: (budget?.budgeted as number) || 0,
          activity: 0, // Will be calculated
          balance: 0, // Will be calculated
        };
      });

    if (cats.length > 0) {
      masters.push({
        entityId: mc.entityId as string,
        name: mc.name as string,
        sortableIndex: mc.sortableIndex as number || 0,
        categories: cats,
      });
    }
  }

  masterCategories.set(masters.sort((a, b) => a.sortableIndex - b.sortableIndex));
  categories.set(masters.flatMap((m) => m.categories));

  // Load scheduled transactions
  const scheduledList = client.getScheduledTransactions?.() || [];
  scheduledTransactions.set(
    scheduledList
      .filter((st: Record<string, unknown>) => !st.isTombstone)
      .map((st: Record<string, unknown>) => ({
        entityId: st.entityId as string,
        date: st.date as string,
        dateNext: st.date as string,
        frequency: st.frequency as string,
        amount: (st.amount as number) || 0,
        payeeId: st.payeeId as string | null,
        categoryId: st.categoryId as string | null,
        accountId: st.accountId as string,
        memo: (st.memo as string) || '',
        flag: st.flag as string | null,
      }))
  );

  console.log('[Budget Store] Budget loaded:', result.budgetName);
}

