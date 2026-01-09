<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Chart,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    LineController,
    LineElement,
    PointElement,
  } from 'chart.js';
  import { transactions, categories, accounts, payees } from '$lib/stores/budget';
  import { generateReport, REPORT_LABELS } from '$lib/services/report-service';
  import { formatCurrency } from '$lib/utils';
  import { CalendarDays, TrendingUp, TrendingDown, Minus } from 'lucide-svelte';
  import type { SpendingByTimeOfMonthReport } from 'ynab-library';

  Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    LineController,
    LineElement,
    PointElement,
  );

  interface Props {
    startDate: string;
    endDate: string;
  }

  let { startDate, endDate }: Props = $props();

  let barCanvas = $state<HTMLCanvasElement | null>(null);
  let lineCanvas = $state<HTMLCanvasElement | null>(null);
  let barChart: Chart | null = null;
  let lineChart: Chart | null = null;

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
        'spending-by-time-of-month',
        { dateRange: { start: startDate, end: endDate } },
        {
          transactions: txList,
          categories: catList,
          accounts: accList,
          payees: payeeList,
        },
      ) as SpendingByTimeOfMonthReport;
    } catch (e) {
      console.error('Error generating time of month report:', e);
      return null;
    }
  });

  const periodLabels: Record<string, string> = {
    beginning: 'Inicio del Mes',
    middle: 'Mitad del Mes',
    end: 'Fin del Mes',
  };

  const periodColors = {
    beginning: 'rgba(59, 130, 246, 0.7)',
    middle: 'rgba(16, 185, 129, 0.7)',
    end: 'rgba(245, 158, 11, 0.7)',
  };

  const periodBorderColors = {
    beginning: 'rgb(59, 130, 246)',
    middle: 'rgb(16, 185, 129)',
    end: 'rgb(245, 158, 11)',
  };

  // Update bar chart
  $effect(() => {
    if (!barCanvas || !report) return;

    if (barChart) {
      barChart.destroy();
    }

    const ctx = barCanvas.getContext('2d');
    if (!ctx) return;

    barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: report.periods.map((p) => periodLabels[p.period]),
        datasets: [
          {
            label: 'Gastos',
            data: report.periods.map((p) => p.totalAmount),
            backgroundColor: report.periods.map((p) => periodColors[p.period]),
            borderColor: report.periods.map((p) => periodBorderColors[p.period]),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const period = report.periods[context.dataIndex];
                return [
                  `Total: ${formatCurrency(period.totalAmount)}`,
                  `Días ${period.dayRange}`,
                  `Transacciones: ${period.transactionCount}`,
                  `Promedio diario: ${formatCurrency(period.averageDaily)}`,
                ];
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatCurrency(value as number),
            },
          },
        },
      },
    });
  });

  // Update line chart (by day of month)
  $effect(() => {
    if (!lineCanvas || !report || !report.byDayOfMonth) return;

    if (lineChart) {
      lineChart.destroy();
    }

    const ctx = lineCanvas.getContext('2d');
    if (!ctx) return;

    lineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: report.byDayOfMonth.map((d) => d.day.toString()),
        datasets: [
          {
            label: 'Gastos por Día',
            data: report.byDayOfMonth.map((d) => d.totalAmount),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              title: (items) => `Día ${items[0].label}`,
              label: (context) => {
                const day = report.byDayOfMonth[context.dataIndex];
                return [
                  `Total: ${formatCurrency(day.totalAmount)}`,
                  `Transacciones: ${day.transactionCount}`,
                ];
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Gastos',
            },
            ticks: {
              callback: (value) => formatCurrency(value as number),
            },
          },
          x: {
            title: {
              display: true,
              text: 'Día del Mes',
            },
          },
        },
      },
    });
  });

  onMount(() => {
    return () => {
      if (barChart) barChart.destroy();
      if (lineChart) lineChart.destroy();
    };
  });
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold">{REPORT_LABELS['spending-by-time-of-month']}</h3>
      <p class="text-sm text-muted-foreground">
        Analiza si gastas más al inicio, mitad o fin del mes
      </p>
    </div>
  </div>

  {#if !report}
    <div class="text-center py-8 text-muted-foreground">
      <CalendarDays class="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>No hay datos suficientes para generar el reporte</p>
    </div>
  {:else}
    <!-- Summary -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{formatCurrency(report.summary.totalSpending)}</div>
        <div class="text-sm text-muted-foreground">Total Gastado</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
          {periodLabels[report.summary.highestPeriod]}
        </div>
        <div class="text-sm text-muted-foreground">Mayor Gasto</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold text-green-600 dark:text-green-400">
          {periodLabels[report.summary.lowestPeriod]}
        </div>
        <div class="text-sm text-muted-foreground">Menor Gasto</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4 flex items-center gap-2">
        {#if report.summary.evenlyDistributed}
          <Minus class="h-6 w-6 text-green-600 dark:text-green-400" />
          <div>
            <div class="font-semibold text-green-600 dark:text-green-400">Equilibrado</div>
            <div class="text-xs text-muted-foreground">Distribución uniforme</div>
          </div>
        {:else if report.summary.highestPeriod === 'beginning'}
          <TrendingDown class="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
          <div>
            <div class="font-semibold text-yellow-600 dark:text-yellow-400">Gasto Temprano</div>
            <div class="text-xs text-muted-foreground">Mayor gasto al inicio</div>
          </div>
        {:else}
          <TrendingUp class="h-6 w-6 text-red-600 dark:text-red-400" />
          <div>
            <div class="font-semibold text-red-600 dark:text-red-400">Gasto Tardío</div>
            <div class="text-xs text-muted-foreground">Mayor gasto al final</div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Period Cards -->
    <div class="grid grid-cols-3 gap-4">
      {#each report.periods as period}
        {@const periodClass = period.period === 'beginning'
          ? 'border-blue-500 bg-blue-500/10'
          : period.period === 'middle'
            ? 'border-green-500 bg-green-500/10'
            : 'border-yellow-500 bg-yellow-500/10'}
        <div class="rounded-lg p-4 border-2 {periodClass}">
          <div class="text-sm text-muted-foreground">{periodLabels[period.period]}</div>
          <div class="text-xs text-muted-foreground mb-2">Días {period.dayRange}</div>
          <div class="text-xl font-bold">{formatCurrency(period.totalAmount)}</div>
          <div class="text-sm text-muted-foreground">
            {period.transactionCount} transacciones
          </div>
          <div class="text-sm font-medium mt-2">{period.percentage.toFixed(1)}%</div>
        </div>
      {/each}
    </div>

    <!-- Bar Chart -->
    <div>
      <h4 class="font-medium mb-2">Comparación por Período</h4>
      <div class="h-48">
        <canvas bind:this={barCanvas}></canvas>
      </div>
    </div>

    <!-- Line Chart -->
    {#if report.byDayOfMonth && report.byDayOfMonth.length > 0}
      <div>
        <h4 class="font-medium mb-2">Gastos por Día del Mes</h4>
        <div class="h-48">
          <canvas bind:this={lineCanvas}></canvas>
        </div>
      </div>
    {/if}

    <!-- Details Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b">
            <th class="text-left py-2 px-2">Período</th>
            <th class="text-left py-2 px-2">Días</th>
            <th class="text-right py-2 px-2">Transacciones</th>
            <th class="text-right py-2 px-2">Total</th>
            <th class="text-right py-2 px-2">Promedio Diario</th>
            <th class="text-right py-2 px-2">% del Total</th>
          </tr>
        </thead>
        <tbody>
          {#each report.periods as period}
            <tr class="border-b hover:bg-muted/50 transition-colors">
              <td class="py-2 px-2 font-medium">{periodLabels[period.period]}</td>
              <td class="py-2 px-2">{period.dayRange}</td>
              <td class="text-right py-2 px-2">{period.transactionCount}</td>
              <td class="text-right py-2 px-2">{formatCurrency(period.totalAmount)}</td>
              <td class="text-right py-2 px-2">{formatCurrency(period.averageDaily)}</td>
              <td class="text-right py-2 px-2">{period.percentage.toFixed(1)}%</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
