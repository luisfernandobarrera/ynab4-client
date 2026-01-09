<script lang="ts">
  import { transactions, categories, accounts, payees } from '$lib/stores/budget';
  import { generateReport, REPORT_LABELS } from '$lib/services/report-service';
  import { formatCurrency } from '$lib/utils';
  import { UserPlus, Store } from 'lucide-svelte';
  import type { NewPayeesReport } from 'ynab-library';

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
        'new-payees',
        { dateRange: { start: startDate, end: endDate } },
        {
          transactions: txList,
          categories: catList,
          accounts: accList,
          payees: payeeList,
        },
      ) as NewPayeesReport;
    } catch (e) {
      console.error('Error generating new payees report:', e);
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
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold">{REPORT_LABELS['new-payees']}</h3>
      <p class="text-sm text-muted-foreground">
        Beneficiarios que aparecieron por primera vez en este período
      </p>
    </div>
  </div>

  {#if !report}
    <div class="text-center py-8 text-muted-foreground">
      <UserPlus class="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>No hay datos suficientes para generar el reporte</p>
    </div>
  {:else if report.payees.length === 0}
    <div class="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
      <div class="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
        <Store class="h-5 w-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div>
        <h4 class="font-medium text-blue-700 dark:text-blue-300">Sin Beneficiarios Nuevos</h4>
        <p class="text-sm text-blue-600 dark:text-blue-400">
          No se encontraron beneficiarios nuevos en este período. Todas las transacciones fueron con beneficiarios existentes.
        </p>
      </div>
    </div>
  {:else}
    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{report.summary.newPayeeCount}</div>
        <div class="text-sm text-muted-foreground">Beneficiarios Nuevos</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{formatCurrency(report.summary.totalSpentOnNewPayees)}</div>
        <div class="text-sm text-muted-foreground">Gastado en Nuevos</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{report.summary.percentageOfTotalSpending.toFixed(1)}%</div>
        <div class="text-sm text-muted-foreground">Del Gasto Total</div>
      </div>
    </div>

    <!-- Payees List -->
    <div class="space-y-3">
      <h4 class="font-medium">Nuevos Beneficiarios</h4>
      {#each report.payees as payee}
        <div class="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                {payee.payeeName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div class="font-medium">{payee.payeeName}</div>
                <div class="text-sm text-muted-foreground">
                  Primera transacción: {formatDate(payee.firstTransactionDate)}
                </div>
                {#if payee.categories.length > 0}
                  <div class="flex flex-wrap gap-1 mt-2">
                    {#each payee.categories.slice(0, 3) as category}
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted">
                        {category}
                      </span>
                    {/each}
                    {#if payee.categories.length > 3}
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        +{payee.categories.length - 3} más
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
            <div class="text-right">
              <div class="text-lg font-bold">{formatCurrency(Math.abs(payee.totalAmount))}</div>
              <div class="text-sm text-muted-foreground">
                {payee.transactionCount} {payee.transactionCount === 1 ? 'transacción' : 'transacciones'}
              </div>
              <div class="text-xs text-muted-foreground">
                Promedio: {formatCurrency(Math.abs(payee.averageAmount))}
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
            <th class="text-left py-2 px-2">Beneficiario</th>
            <th class="text-left py-2 px-2">Primera Transacción</th>
            <th class="text-right py-2 px-2">Transacciones</th>
            <th class="text-right py-2 px-2">Total</th>
            <th class="text-right py-2 px-2">Promedio</th>
          </tr>
        </thead>
        <tbody>
          {#each report.payees as payee}
            <tr class="border-b hover:bg-muted/50 transition-colors">
              <td class="py-2 px-2 font-medium">{payee.payeeName}</td>
              <td class="py-2 px-2">{formatDate(payee.firstTransactionDate)}</td>
              <td class="text-right py-2 px-2">{payee.transactionCount}</td>
              <td class="text-right py-2 px-2">{formatCurrency(Math.abs(payee.totalAmount))}</td>
              <td class="text-right py-2 px-2">{formatCurrency(Math.abs(payee.averageAmount))}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Explanation -->
    <div class="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
      <h4 class="font-medium text-foreground mb-2">Sobre este Reporte</h4>
      <p>
        Este reporte identifica beneficiarios (comercios, personas, servicios) con los que realizaste
        transacciones por primera vez durante el período seleccionado. Es útil para identificar
        nuevos hábitos de gasto o descubrir servicios que comenzaste a utilizar.
      </p>
    </div>
  {/if}
</div>
