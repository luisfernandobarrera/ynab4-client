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
  } from 'chart.js';
  import { transactions, categories, accounts, payees } from '$lib/stores/budget';
  import { generateReport, REPORT_LABELS, DAY_NAMES_ES } from '$lib/services/report-service';
  import { formatCurrency } from '$lib/utils';
  import { Calendar } from 'lucide-svelte';
  import type { SpendingByDayOfWeekReport } from 'ynab-library';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

  interface Props {
    startDate: string;
    endDate: string;
  }

  let { startDate, endDate }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart | null = null;

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
        'spending-by-day-of-week',
        { dateRange: { start: startDate, end: endDate } },
        {
          transactions: txList,
          categories: catList,
          accounts: accList,
          payees: payeeList,
        },
      ) as SpendingByDayOfWeekReport;
    } catch (e) {
      console.error('Error generating day of week report:', e);
      return null;
    }
  });

  // Chart colors for each day
  const dayColors = [
    'rgba(239, 68, 68, 0.7)',   // Sunday - red (weekend)
    'rgba(59, 130, 246, 0.7)',  // Monday - blue
    'rgba(59, 130, 246, 0.7)',  // Tuesday - blue
    'rgba(59, 130, 246, 0.7)',  // Wednesday - blue
    'rgba(59, 130, 246, 0.7)',  // Thursday - blue
    'rgba(59, 130, 246, 0.7)',  // Friday - blue
    'rgba(239, 68, 68, 0.7)',   // Saturday - red (weekend)
  ];

  const dayBorderColors = [
    'rgb(239, 68, 68)',
    'rgb(59, 130, 246)',
    'rgb(59, 130, 246)',
    'rgb(59, 130, 246)',
    'rgb(59, 130, 246)',
    'rgb(59, 130, 246)',
    'rgb(239, 68, 68)',
  ];

  // Update chart
  $effect(() => {
    if (!canvas || !report) return;

    if (chart) {
      chart.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: report.days.map((d) => DAY_NAMES_ES[d.dayOfWeek]),
        datasets: [
          {
            label: 'Gastos',
            data: report.days.map((d) => d.totalAmount),
            backgroundColor: dayColors,
            borderColor: dayBorderColors,
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
                const day = report.days[context.dataIndex];
                return [
                  `Total: ${formatCurrency(day.totalAmount)}`,
                  `Transacciones: ${day.transactionCount}`,
                  `Promedio: ${formatCurrency(day.averageAmount)}`,
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
              text: 'Día de la Semana',
            },
          },
        },
      },
    });
  });

  onMount(() => {
    return () => {
      if (chart) {
        chart.destroy();
      }
    };
  });
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold">{REPORT_LABELS['spending-by-day-of-week']}</h3>
      <p class="text-sm text-muted-foreground">
        Analiza tus patrones de gasto por día de la semana
      </p>
    </div>
  </div>

  {#if !report}
    <div class="text-center py-8 text-muted-foreground">
      <Calendar class="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>No hay datos suficientes para generar el reporte</p>
    </div>
  {:else}
    <!-- Summary Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{formatCurrency(report.summary.totalSpending)}</div>
        <div class="text-sm text-muted-foreground">Total Gastado</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
          {report.summary.busiestDayName}
        </div>
        <div class="text-sm text-muted-foreground">Día más Activo</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold text-green-600 dark:text-green-400">
          {report.summary.quietestDayName}
        </div>
        <div class="text-sm text-muted-foreground">Día más Tranquilo</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{report.summary.weekendPercentage.toFixed(1)}%</div>
        <div class="text-sm text-muted-foreground">Gastos en Fin de Semana</div>
      </div>
    </div>

    <!-- Weekday vs Weekend Comparison -->
    <div class="grid grid-cols-2 gap-4">
      <div class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <div class="text-lg font-semibold text-blue-600 dark:text-blue-400">
          {formatCurrency(report.summary.weekdayTotal)}
        </div>
        <div class="text-sm text-blue-600/70 dark:text-blue-400/70">
          Lunes a Viernes ({(100 - report.summary.weekendPercentage).toFixed(1)}%)
        </div>
      </div>
      <div class="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <div class="text-lg font-semibold text-red-600 dark:text-red-400">
          {formatCurrency(report.summary.weekendTotal)}
        </div>
        <div class="text-sm text-red-600/70 dark:text-red-400/70">
          Fin de Semana ({report.summary.weekendPercentage.toFixed(1)}%)
        </div>
      </div>
    </div>

    <!-- Chart -->
    <div class="h-64">
      <canvas bind:this={canvas}></canvas>
    </div>

    <!-- Details Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b">
            <th class="text-left py-2 px-2">Día</th>
            <th class="text-right py-2 px-2">Transacciones</th>
            <th class="text-right py-2 px-2">Total</th>
            <th class="text-right py-2 px-2">Promedio</th>
            <th class="text-right py-2 px-2">% del Total</th>
          </tr>
        </thead>
        <tbody>
          {#each report.days as day}
            {@const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6}
            <tr
              class="border-b hover:bg-muted/50 transition-colors {isWeekend ? 'bg-red-100 dark:bg-red-900/20' : ''}"
            >
              <td class="py-2 px-2 font-medium">{DAY_NAMES_ES[day.dayOfWeek]}</td>
              <td class="text-right py-2 px-2">{day.transactionCount}</td>
              <td class="text-right py-2 px-2">{formatCurrency(day.totalAmount)}</td>
              <td class="text-right py-2 px-2">{formatCurrency(day.averageAmount)}</td>
              <td class="text-right py-2 px-2">{day.percentage.toFixed(1)}%</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
