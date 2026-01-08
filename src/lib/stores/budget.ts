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
  isTombstone?: boolean;
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
  subTransactions?: Array<{
    entityId?: string;
    categoryId?: string;
    amount?: number;
    memo?: string;
    payeeId?: string;
    transferAccountId?: string;
  }>;
}

export interface Category {
  entityId: string;
  name: string;
  masterCategoryId: string;
  masterCategoryName: string;
  budgeted: number;
  activity: number;
  balance: number;
  sortableIndex?: number;
  isTombstone?: boolean;
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
  isTombstone?: boolean;
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

export interface MonthlySubCategoryBudget {
  categoryId: string;
  budgeted: number;
  isTombstone?: boolean;
  overspendingHandling?: string | null;
}

export interface MonthlyBudget {
  month: string;
  entityId: string;
  monthlySubCategoryBudgets: MonthlySubCategoryBudget[];
}

export interface RawCategory {
  entityId: string;
  name: string;
  masterCategoryId: string;
  isTombstone?: boolean;
  sortableIndex?: number;
}

export interface RawMasterCategory {
  entityId: string;
  name: string;
  type?: string;
  isTombstone?: boolean;
  sortableIndex?: number;
}

export interface RawTransaction {
  entityId: string;
  date: string;
  amount: number;
  categoryId?: string;
  accountId?: string;
  transferAccountId?: string;
  isTombstone?: boolean;
  subTransactions?: Array<{
    categoryId?: string;
    amount?: number;
    isTombstone?: boolean;
    transferAccountId?: string;
  }>;
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
export const monthlyBudgets = writable<MonthlyBudget[]>([]);
export const rawCategories = writable<RawCategory[]>([]);
export const rawMasterCategories = writable<RawMasterCategory[]>([]);
export const rawTransactions = writable<RawTransaction[]>([]);

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
  monthlyBudgets.set([]);
  rawCategories.set([]);
  rawMasterCategories.set([]);
  rawTransactions.set([]);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountList: any[] = client.getAccounts() || [];
  accounts.set(
    accountList.map((acc) => ({
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payeeList: any[] = client.getPayees() || [];
  payees.set(
    payeeList.map((p) => ({
      id: p.entityId as string,
      entityId: p.entityId as string,
      name: p.name as string,
    }))
  );

  // Load transactions with payee/category names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txList: any[] = client.getTransactions() || [];
  const payeeMap = new Map(payeeList.map((p) => [p.entityId, p.name]));
  const accountMap = new Map(accountList.map((a) => [a.entityId, a.accountName]));

  // Get category names with master category
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categoryList: any[] = client.getCategories() || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const masterCatList: any[] = client.getMasterCategories() || [];
  const masterCatMap = new Map(masterCatList.map((mc) => [mc.entityId, mc.name]));
  const categoryMap = new Map(categoryList.map((c) => {
    // Category uses categoryGroupId to reference master category
    const masterId = c.categoryGroupId || c.masterCategoryId;
    const masterName = masterCatMap.get(masterId);
    const fullName = masterName ? `${masterName}: ${c.name}` : c.name;
    return [c.entityId, fullName];
  }));

  transactions.set(
    txList
      .filter((tx) => !tx.isTombstone)
      .map((tx) => ({
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
        flag: (tx.flagColor || tx.flag) as string | null,
        accountId: tx.accountId as string,
        accountName: (accountMap.get(tx.accountId as string) as string) || '',
        transferAccountId: tx.transferAccountId as string | null,
        subTransactions: tx.subTransactions as Transaction['subTransactions'],
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  );

  // Load categories with budget data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const masterCategoryList: any[] = client.getMasterCategories() || [];
  // Get monthly budgets from the budget object
  const budget = client.getBudget();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monthlyBudgetList: any[] = budget?.monthlyBudgets || [];
  const budgetMap = new Map(
    monthlyBudgetList
      .filter((mb: any) => (mb.month || mb.entityId || '').startsWith(currentMonth))
      .flatMap((mb: any) => (mb.monthlySubCategoryBudgets || []).map((b: any) => [b.categoryId, b]))
  );

  // Store raw data for budget calculations
  rawCategories.set(
    categoryList.map((c) => ({
      entityId: c.entityId as string,
      name: c.name as string,
      // Category uses categoryGroupId to reference master category
      masterCategoryId: (c.categoryGroupId || c.masterCategoryId) as string,
      isTombstone: c.isTombstone as boolean | undefined,
      sortableIndex: c.sortableIndex as number | undefined,
    }))
  );

  rawMasterCategories.set(
    masterCategoryList.map((mc) => ({
      entityId: mc.entityId as string,
      name: mc.name as string,
      type: mc.type as string | undefined,
      isTombstone: mc.isTombstone as boolean | undefined,
      sortableIndex: mc.sortableIndex as number | undefined,
    }))
  );

  rawTransactions.set(
    txList.map((tx) => ({
      entityId: tx.entityId as string,
      date: tx.date as string,
      amount: (tx.amount as number) || 0,
      categoryId: (tx.categoryId as string) || undefined,
      accountId: (tx.accountId as string) || undefined,
      transferAccountId: (tx.transferAccountId as string) || undefined,
      isTombstone: tx.isTombstone as boolean | undefined,
      subTransactions: (tx.subTransactions || tx.splitTransactions) as Array<{
        categoryId?: string;
        amount?: number;
        isTombstone?: boolean;
        transferAccountId?: string;
      }> | undefined,
    }))
  );

  monthlyBudgets.set(
    monthlyBudgetList.map((mb: any) => ({
      month: (mb.month || mb.entityId || '').substring(0, 7) as string,
      entityId: mb.entityId as string,
      monthlySubCategoryBudgets: (mb.monthlySubCategoryBudgets || []).map((b: any) => ({
        categoryId: b.categoryId as string,
        budgeted: (b.budgeted as number) || 0,
        isTombstone: b.isTombstone as boolean | undefined,
        overspendingHandling: b.overspendingHandling as string | null | undefined,
      })),
    }))
  );

  const masters: MasterCategory[] = [];

  for (const mc of masterCategoryList) {
    if (mc.isTombstone || mc.name === 'Hidden Categories') continue;

    const cats = categoryList
      .filter((c) => (c.categoryGroupId || c.masterCategoryId) === mc.entityId && !c.isTombstone)
      .map((c) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const budget = budgetMap.get(c.entityId) as any;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scheduledList: any[] = client.getScheduledTransactions?.() || [];
  scheduledTransactions.set(
    scheduledList
      .filter((st) => !st.isTombstone)
      .map((st) => ({
        entityId: st.entityId as string,
        date: (st.dateFirst || st.dateNext) as string,
        dateNext: st.dateNext as string,
        frequency: st.frequency as string,
        amount: (st.amount as number) || 0,
        payeeId: st.payeeId as string | null,
        categoryId: st.categoryId as string | null,
        accountId: st.accountId as string,
        memo: (st.memo as string) || '',
        flag: (st.flagColor || st.flag) as string | null,
      }))
  );

  console.log('[Budget Store] Budget loaded:', result.budgetName);
}

