import { writable, derived } from 'svelte/store';
import type { YnabClient } from 'ynab-library';

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
  mode: 'local' | 'dropbox' | null;
  canWrite: boolean;
  budgetName: string;
  budgetPath: string | null;
}

// Stores
export const budgetInfo = writable<BudgetInfo>({
  client: null,
  mode: null,
  canWrite: false,
  budgetName: '',
  budgetPath: null,
});

export const accounts = writable<Account[]>([]);
export const transactions = writable<Transaction[]>([]);
export const categories = writable<Category[]>([]);
export const payees = writable<Payee[]>([]);
export const scheduledTransactions = writable<ScheduledTransaction[]>([]);

export const isLoading = writable(false);
export const currentView = writable<string>('transactions');
export const selectedAccountId = writable<string | null>(null);
export const selectedDate = writable<Date>(new Date());

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
  });
  accounts.set([]);
  transactions.set([]);
  categories.set([]);
  payees.set([]);
  scheduledTransactions.set([]);
  selectedAccountId.set(null);
}

