/**
 * Report Service - Wraps ynab-library's ReportGenerator for use in the client
 */

import { ReportGenerator } from 'ynab-library';
import type { ReportOptions, ReportType } from 'ynab-library';
import {
  Transaction as LibTransaction,
  Category as LibCategory,
  Account as LibAccount,
  MasterCategory as LibMasterCategory,
  MonthlyBudget as LibMonthlyBudget,
} from 'ynab-library';
import type {
  Transaction as StoreTransaction,
  Category as StoreCategory,
  MasterCategory as StoreMasterCategory,
  Account as StoreAccount,
  Payee as StorePayee,
  MonthlyBudget as StoreMonthlyBudget,
} from '$lib/stores/budget';

// Singleton instance
let generatorInstance: ReportGenerator | null = null;

function getGenerator(): ReportGenerator {
  if (!generatorInstance) {
    generatorInstance = new ReportGenerator();
  }
  return generatorInstance;
}

/**
 * Convert store transactions to library Transaction instances
 */
function convertTransactions(storeTxs: StoreTransaction[]): LibTransaction[] {
  return storeTxs.map(
    (tx) =>
      new LibTransaction({
        entityId: tx.entityId,
        date: tx.date,
        amount: tx.amount,
        payeeId: tx.payeeId || undefined,
        categoryId: tx.categoryId || undefined,
        memo: tx.memo,
        cleared: tx.cleared as 'Uncleared' | 'Cleared' | 'Reconciled' | undefined,
        flag: tx.flag || undefined,
        accountId: tx.accountId,
        transferAccountId: tx.transferAccountId || undefined,
        subTransactions: tx.subTransactions?.map((st) => ({
          entityId: st.entityId,
          categoryId: st.categoryId,
          amount: st.amount || 0,
          memo: st.memo,
          payeeId: st.payeeId,
          transferAccountId: st.transferAccountId,
        })),
      }),
  );
}

/**
 * Convert store categories to library Category map
 */
function convertCategories(storeCategories: StoreCategory[]): Map<string, LibCategory> {
  const map = new Map<string, LibCategory>();
  for (const cat of storeCategories) {
    map.set(
      cat.entityId,
      new LibCategory({
        entityId: cat.entityId,
        name: cat.name,
        masterCategoryId: cat.masterCategoryId,
        sortableIndex: cat.sortableIndex,
        isTombstone: cat.isTombstone,
      }),
    );
  }
  return map;
}

/**
 * Convert store accounts to library Account map
 */
function convertAccounts(storeAccounts: StoreAccount[]): Map<string, LibAccount> {
  const map = new Map<string, LibAccount>();
  for (const acc of storeAccounts) {
    map.set(
      acc.entityId,
      new LibAccount({
        entityId: acc.entityId,
        accountName: acc.name,
        accountType: acc.type,
        onBudget: acc.onBudget,
        hidden: acc.hidden,
        isTombstone: acc.isTombstone,
      }),
    );
  }
  return map;
}

/**
 * Convert store payees to library payee map
 */
function convertPayees(storePayees: StorePayee[]): Map<string, { entityId: string; name: string }> {
  const map = new Map<string, { entityId: string; name: string }>();
  for (const payee of storePayees) {
    map.set(payee.entityId, { entityId: payee.entityId, name: payee.name });
  }
  return map;
}

/**
 * Convert store master categories to library MasterCategory map
 */
function convertMasterCategories(
  storeMasterCats: StoreMasterCategory[],
): Map<string, LibMasterCategory> {
  const map = new Map<string, LibMasterCategory>();
  for (const mc of storeMasterCats) {
    map.set(
      mc.entityId,
      new LibMasterCategory({
        entityId: mc.entityId,
        name: mc.name,
        sortableIndex: mc.sortableIndex,
      }),
    );
  }
  return map;
}

/**
 * Convert store monthly budgets to library MonthlyBudget map
 */
function convertMonthlyBudgets(
  storeMonthlyBudgets: StoreMonthlyBudget[],
): Map<string, LibMonthlyBudget> {
  const map = new Map<string, LibMonthlyBudget>();
  for (const mb of storeMonthlyBudgets) {
    const [year, month] = mb.month.split('-').map(Number);
    map.set(
      mb.month,
      new LibMonthlyBudget({
        entityId: mb.entityId,
        month: mb.month,
        year: year,
        categoryBudgets: mb.monthlySubCategoryBudgets.map((scb) => ({
          entityId: `${mb.month}-${scb.categoryId}`,
          entityType: 'monthlyCategoryBudget' as const,
          entityVersion: '1',
          categoryId: scb.categoryId,
          budgeted: scb.budgeted,
          spent: 0,
          available: 0,
          month: mb.month,
          year: year,
        })),
      }),
    );
  }
  return map;
}

export interface ReportServiceParams {
  transactions: StoreTransaction[];
  categories: StoreCategory[];
  accounts: StoreAccount[];
  payees: StorePayee[];
  masterCategories?: StoreMasterCategory[];
  monthlyBudgets?: StoreMonthlyBudget[];
}

/**
 * Generate a report using the library's ReportGenerator
 */
export function generateReport(
  reportType: ReportType,
  options: Omit<ReportOptions, 'type'>,
  data: ReportServiceParams,
) {
  const generator = getGenerator();

  const libTransactions = convertTransactions(data.transactions);
  const libCategories = convertCategories(data.categories);
  const libAccounts = convertAccounts(data.accounts);
  const libPayees = convertPayees(data.payees);

  // Build extended options
  const extendedOptions: ReportOptions = {
    ...options,
    type: reportType,
  };

  // Add master categories if provided
  if (data.masterCategories) {
    (extendedOptions as any).masterCategories = convertMasterCategories(data.masterCategories);
  }

  // Add monthly budgets if provided
  if (data.monthlyBudgets) {
    (extendedOptions as any).monthlyBudgets = convertMonthlyBudgets(data.monthlyBudgets);
  }

  return generator.generate(
    libTransactions,
    libCategories,
    libAccounts,
    extendedOptions,
    libPayees,
  );
}

/**
 * Report type labels in Spanish
 */
export const REPORT_LABELS: Record<string, string> = {
  'spending-by-category': 'Gastos por Categoría',
  'spending-by-payee': 'Gastos por Beneficiario',
  'spending-trends': 'Tendencias de Gastos',
  'net-worth': 'Patrimonio Neto',
  'cash-flow': 'Flujo de Efectivo',
  savings: 'Ahorros',
  'category-comparison': 'Comparación de Categorías',
  'account-balance-history': 'Historial de Saldos',
  'income-by-category': 'Ingresos por Categoría',
  'budget-vs-actual': 'Presupuesto vs Real',
  'spending-calendar': 'Calendario de Gastos',
  'recurring-expenses': 'Gastos Recurrentes',
  'year-over-year': 'Año tras Año',
  'asset-conversion': 'Conversión de Activos',
  'spending-by-day-of-week': 'Gastos por Día de la Semana',
  'spending-by-time-of-month': 'Gastos por Momento del Mes',
  'unusual-transactions': 'Transacciones Inusuales',
  'new-payees': 'Beneficiarios Nuevos',
  'uncategorized-transactions': 'Transacciones Sin Categorizar',
  'debt-payoff': 'Pago de Deudas',
  'benford-distribution': 'Distribución de Benford',
};

/**
 * Day of week names in Spanish
 */
export const DAY_NAMES_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/**
 * Month names in Spanish
 */
export const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
