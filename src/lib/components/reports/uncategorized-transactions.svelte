<script lang="ts">
  import { transactions, categories, accounts, payees } from '$lib/stores/budget';
  import { generateReport, REPORT_LABELS } from '$lib/services/report-service';
  import { formatCurrency } from '$lib/utils';
  import { HelpCircle, CheckCircle, AlertCircle } from 'lucide-svelte';
  import type { UncategorizedTransactionsReport } from 'ynab-library';

  interface Props {
    startDate: string;
    endDate: string;
  }

  let { startDate, endDate }: Props = $props();

  // Get store values
  const txList = $derived($transactions);
  const catList = $derived($categories);
  const accList = $derived($accounts);
  const payeeList = $derived($payees);

  // Generate report
  const report = $derived.by(() => {
    if (!txList.length) return null;

    try {
      return generateReport(
        'uncategorized-transactions',
        { dateRange: { start: startDate, end: endDate } },
        {
          transactions: txList,
          categories: catList,
          accounts: accList,
          payees: payeeList,
        },
      ) as UncategorizedTransactionsReport;
    } catch (e) {
      console.error('Error generating uncategorized transactions report:', e);
      return null;
    }
  });

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getAccountName(accountId: string): string {
    const account = $accounts.find((a) => a.entityId === accountId);
    return account?.name || 'Cuenta Desconocida';
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold">{REPORT_LABELS['uncategorized-transactions']}</h3>
      <p class="text-sm text-muted-foreground">
        Transacciones que no tienen una categoría asignada
      </p>
    </div>
  </div>

  {#if !report}
    <div class="text-center py-8 text-muted-foreground">
      <HelpCircle class="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>No hay datos suficientes para generar el reporte</p>
    </div>
  {:else if report.transactions.length === 0}
    <div class="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
      <div class="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
        <CheckCircle class="h-5 w-5 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h4 class="font-medium text-green-700 dark:text-green-300">Todo Categorizado</h4>
        <p class="text-sm text-green-600 dark:text-green-400">
          Todas las transacciones en este período tienen una categoría asignada. ¡Excelente trabajo!
        </p>
      </div>
    </div>
  {:else}
    <!-- Warning Alert -->
    <div class="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
      <AlertCircle class="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
      <div>
        <h4 class="font-medium text-yellow-700 dark:text-yellow-300">Transacciones Sin Categorizar</h4>
        <p class="text-sm text-yellow-600 dark:text-yellow-400">
          Tienes {report.summary.totalUncategorized} transacciones sin categoría por un total de {formatCurrency(Math.abs(report.summary.totalAmount))}.
          Esto representa el {report.summary.percentageOfTotal.toFixed(1)}% de tus transacciones.
        </p>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{report.summary.totalUncategorized}</div>
        <div class="text-sm text-muted-foreground">Sin Categorizar</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{formatCurrency(Math.abs(report.summary.totalAmount))}</div>
        <div class="text-sm text-muted-foreground">Monto Total</div>
      </div>
      <div class="bg-red-500/10 rounded-lg p-4">
        <div class="text-2xl font-bold text-red-600 dark:text-red-400">
          {formatCurrency(Math.abs(report.summary.expenseUncategorized))}
        </div>
        <div class="text-sm text-muted-foreground">Gastos</div>
      </div>
      <div class="bg-green-500/10 rounded-lg p-4">
        <div class="text-2xl font-bold text-green-600 dark:text-green-400">
          {formatCurrency(report.summary.incomeUncategorized)}
        </div>
        <div class="text-sm text-muted-foreground">Ingresos</div>
      </div>
    </div>

    <!-- By Payee Summary -->
    {#if report.byPayee && report.byPayee.length > 0}
      <div>
        <h4 class="font-medium mb-3">Por Beneficiario</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {#each report.byPayee.slice(0, 6) as payeeSummary}
            <div class="bg-muted/30 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div class="font-medium truncate">{payeeSummary.payeeName || 'Sin Beneficiario'}</div>
                <div class="text-sm text-muted-foreground">{payeeSummary.count} transacciones</div>
              </div>
              <div class="text-right">
                <div class="font-semibold">{formatCurrency(Math.abs(payeeSummary.totalAmount))}</div>
              </div>
            </div>
          {/each}
        </div>
        {#if report.byPayee.length > 6}
          <p class="text-sm text-muted-foreground mt-2">
            Y {report.byPayee.length - 6} beneficiarios más...
          </p>
        {/if}
      </div>
    {/if}

    <!-- Transactions List -->
    <div class="space-y-3">
      <h4 class="font-medium">Transacciones Sin Categorizar</h4>
      {#each report.transactions.slice(0, 20) as tx}
        <div class="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="h-10 w-10 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
                <HelpCircle class="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <div class="font-medium">
                  {tx.payeeName || 'Sin Beneficiario'}
                </div>
                <div class="text-sm text-muted-foreground">
                  {getAccountName(tx.accountId)} • {formatDate(tx.date)}
                </div>
                {#if tx.memo}
                  <div class="text-sm text-muted-foreground mt-1 italic">
                    "{tx.memo}"
                  </div>
                {/if}
              </div>
            </div>
            <div class="text-right">
              <div
                class="text-lg font-bold"
                class:text-red-600={tx.amount < 0}
                class:dark:text-red-400={tx.amount < 0}
                class:text-green-600={tx.amount > 0}
                class:dark:text-green-400={tx.amount > 0}
              >
                {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
              </div>
              <div class="text-xs text-muted-foreground">
                {tx.amount < 0 ? 'Gasto' : 'Ingreso'}
              </div>
            </div>
          </div>
        </div>
      {/each}
      {#if report.transactions.length > 20}
        <p class="text-center text-sm text-muted-foreground py-2">
          Mostrando 20 de {report.transactions.length} transacciones
        </p>
      {/if}
    </div>

    <!-- Table View -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b">
            <th class="text-left py-2 px-2">Fecha</th>
            <th class="text-left py-2 px-2">Beneficiario</th>
            <th class="text-left py-2 px-2">Cuenta</th>
            <th class="text-left py-2 px-2">Memo</th>
            <th class="text-right py-2 px-2">Monto</th>
          </tr>
        </thead>
        <tbody>
          {#each report.transactions as tx}
            <tr class="border-b hover:bg-muted/50 transition-colors">
              <td class="py-2 px-2">{formatDate(tx.date)}</td>
              <td class="py-2 px-2">{tx.payeeName || '-'}</td>
              <td class="py-2 px-2">{tx.accountName || getAccountName(tx.accountId)}</td>
              <td class="py-2 px-2 max-w-[200px] truncate">{tx.memo || '-'}</td>
              <td
                class="text-right py-2 px-2 font-medium"
                class:text-red-600={tx.amount < 0}
                class:text-green-600={tx.amount > 0}
              >
                {formatCurrency(tx.amount)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Explanation -->
    <div class="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
      <h4 class="font-medium text-foreground mb-2">Sobre este Reporte</h4>
      <p>
        Las transacciones sin categorizar pueden afectar la precisión de tus reportes de gastos.
        Te recomendamos asignar una categoría a cada transacción para obtener una visión más
        clara de tus finanzas.
      </p>
    </div>
  {/if}
</div>
