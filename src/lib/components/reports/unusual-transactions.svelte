<script lang="ts">
  import { transactions, categories, accounts, payees } from '$lib/stores/budget';
  import { generateReport, REPORT_LABELS } from '$lib/services/report-service';
  import { formatCurrency } from '$lib/utils';
  import { AlertTriangle, TrendingUp, UserX, HelpCircle } from 'lucide-svelte';
  import type { UnusualTransactionsReport, UnusualTransaction } from 'ynab-library';

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
        'unusual-transactions',
        { dateRange: { start: startDate, end: endDate } },
        {
          transactions: txList,
          categories: catList,
          accounts: accList,
          payees: payeeList,
        },
      ) as UnusualTransactionsReport;
    } catch (e) {
      console.error('Error generating unusual transactions report:', e);
      return null;
    }
  });

  const reasonLabels: Record<string, string> = {
    high_amount: 'Monto Alto',
    low_frequency_payee: 'Beneficiario Poco Frecuente',
    unusual_category: 'Categoría Inusual',
    large_deviation: 'Gran Desviación',
  };

  const reasonIcons: Record<string, typeof AlertTriangle> = {
    high_amount: TrendingUp,
    low_frequency_payee: UserX,
    unusual_category: HelpCircle,
    large_deviation: AlertTriangle,
  };

  const reasonColors: Record<string, string> = {
    high_amount: 'text-red-600 dark:text-red-400',
    low_frequency_payee: 'text-yellow-600 dark:text-yellow-400',
    unusual_category: 'text-purple-600 dark:text-purple-400',
    large_deviation: 'text-orange-600 dark:text-orange-400',
  };

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold">{REPORT_LABELS['unusual-transactions']}</h3>
      <p class="text-sm text-muted-foreground">
        Identifica transacciones que se desvían significativamente de tus patrones normales
      </p>
    </div>
  </div>

  {#if !report}
    <div class="text-center py-8 text-muted-foreground">
      <AlertTriangle class="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>No hay datos suficientes para generar el reporte</p>
    </div>
  {:else if report.transactions.length === 0}
    <div class="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
      <div class="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
        <AlertTriangle class="h-5 w-5 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h4 class="font-medium text-green-700 dark:text-green-300">Todo Normal</h4>
        <p class="text-sm text-green-600 dark:text-green-400">
          No se encontraron transacciones inusuales en este período. Tus gastos siguen patrones consistentes.
        </p>
      </div>
    </div>
  {:else}
    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{report.summary.totalUnusual}</div>
        <div class="text-sm text-muted-foreground">Transacciones Inusuales</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{formatCurrency(report.summary.totalAmount)}</div>
        <div class="text-sm text-muted-foreground">Monto Total</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{report.summary.threshold.toFixed(1)}σ</div>
        <div class="text-sm text-muted-foreground">Umbral de Detección</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">
          {Object.keys(report.summary.byReason).length}
        </div>
        <div class="text-sm text-muted-foreground">Tipos de Anomalía</div>
      </div>
    </div>

    <!-- By Reason Summary -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      {#each Object.entries(report.summary.byReason) as [reason, count]}
        {@const Icon = reasonIcons[reason] || AlertTriangle}
        <div class="bg-muted/30 rounded-lg p-3 flex items-center gap-3">
          <div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <Icon class="h-4 w-4 {reasonColors[reason] || 'text-muted-foreground'}" />
          </div>
          <div>
            <div class="font-semibold">{count}</div>
            <div class="text-xs text-muted-foreground">{reasonLabels[reason] || reason}</div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Transactions List -->
    <div class="space-y-3">
      <h4 class="font-medium">Detalle de Transacciones</h4>
      {#each report.transactions as tx}
        {@const Icon = reasonIcons[tx.reason] || AlertTriangle}
        <div class="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Icon class="h-5 w-5 {reasonColors[tx.reason]}" />
              </div>
              <div>
                <div class="font-medium">
                  {tx.payeeName || 'Sin Beneficiario'}
                </div>
                <div class="text-sm text-muted-foreground">
                  {tx.categoryName || 'Sin Categoría'} • {formatDate(tx.date)}
                </div>
                <div class="mt-1">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {reasonColors[tx.reason]} bg-muted">
                    {reasonLabels[tx.reason]}
                  </span>
                  {#if tx.zscore}
                    <span class="ml-2 text-xs text-muted-foreground">
                      Z-score: {tx.zscore.toFixed(2)}
                    </span>
                  {/if}
                  {#if tx.deviationFromAverage}
                    <span class="ml-2 text-xs text-muted-foreground">
                      {tx.deviationFromAverage > 0 ? '+' : ''}{tx.deviationFromAverage.toFixed(0)}% vs promedio
                    </span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-lg font-bold">{formatCurrency(Math.abs(tx.amount))}</div>
              <div class="text-xs text-muted-foreground">
                {tx.amount < 0 ? 'Gasto' : 'Ingreso'}
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Table View -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b">
            <th class="text-left py-2 px-2">Fecha</th>
            <th class="text-left py-2 px-2">Beneficiario</th>
            <th class="text-left py-2 px-2">Categoría</th>
            <th class="text-left py-2 px-2">Razón</th>
            <th class="text-right py-2 px-2">Monto</th>
            <th class="text-right py-2 px-2">Z-Score</th>
          </tr>
        </thead>
        <tbody>
          {#each report.transactions as tx}
            <tr class="border-b hover:bg-muted/50 transition-colors">
              <td class="py-2 px-2">{formatDate(tx.date)}</td>
              <td class="py-2 px-2">{tx.payeeName || '-'}</td>
              <td class="py-2 px-2">{tx.categoryName || '-'}</td>
              <td class="py-2 px-2">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {reasonColors[tx.reason]} bg-muted">
                  {reasonLabels[tx.reason]}
                </span>
              </td>
              <td class="text-right py-2 px-2 font-medium">{formatCurrency(Math.abs(tx.amount))}</td>
              <td class="text-right py-2 px-2">{tx.zscore?.toFixed(2) || '-'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Explanation -->
    <div class="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
      <h4 class="font-medium text-foreground mb-2">Sobre este Reporte</h4>
      <p>
        Este reporte utiliza análisis estadístico (z-score) para identificar transacciones que se desvían
        significativamente de tus patrones normales de gasto. Un z-score mayor a {report.summary.threshold}
        desviaciones estándar indica una transacción inusual.
      </p>
    </div>
  {/if}
</div>
