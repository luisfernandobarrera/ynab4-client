<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Chart,
    LineController,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler,
  } from 'chart.js';
  import { transactions, categories, masterCategories, payees, accounts } from '$lib/stores/budget';
  import { formatCurrency } from '$lib/utils';
  import { Download, TrendingDown, TrendingUp, Minus } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';

  Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

  interface Props {
    startDate?: string;
    endDate?: string;
    selectedAccounts?: string[];
    selectedCategories?: string[];
    selectedPayees?: string[];
    groupBy?: 'month' | 'week' | 'day';
    showAverage?: boolean;
  }

  let {
    startDate,
    endDate,
    selectedAccounts = [],
    selectedCategories = [],
    selectedPayees = [],
    groupBy = 'month',
    showAverage = true,
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart | null = null;

  // Generate date periods
  const periods = $derived(() => {
    const start = new Date(startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const end = new Date(endDate || new Date().toISOString().split('T')[0]);
    const result: { key: string; label: string; start: Date; end: Date }[] = [];

    if (groupBy === 'month') {
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        result.push({
          key: `${current.getFullYear()}-${(current.getMonth() + 1).toString().padStart(2, '0')}`,
          label: `${monthNames[current.getMonth()]} ${current.getFullYear().toString().slice(-2)}`,
          start: new Date(current),
          end: monthEnd,
        });
        current.setMonth(current.getMonth() + 1);
      }
    } else if (groupBy === 'week') {
      const current = new Date(start);
      // Adjust to start of week (Monday)
      const day = current.getDay();
      current.setDate(current.getDate() - (day === 0 ? 6 : day - 1));

      while (current <= end) {
        const weekEnd = new Date(current);
        weekEnd.setDate(weekEnd.getDate() + 6);
        result.push({
          key: current.toISOString().split('T')[0],
          label: `${current.getDate()}/${current.getMonth() + 1}`,
          start: new Date(current),
          end: weekEnd,
        });
        current.setDate(current.getDate() + 7);
      }
    }

    return result;
  });

  // Calculate spending by period
  const trendData = $derived(() => {
    const startStr = startDate || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
    const endStr = endDate || new Date().toISOString().split('T')[0];

    // Filter transactions
    let filteredTx = $transactions.filter(
      (tx) => tx.date >= startStr && tx.date <= endStr && tx.amount < 0
    );

    // Skip transfers
    filteredTx = filteredTx.filter(
      (tx) => !tx.payeeName?.startsWith('Transfer :') && !tx.transferAccountId
    );

    // Apply filters
    if (selectedAccounts.length > 0) {
      filteredTx = filteredTx.filter((tx) => selectedAccounts.includes(tx.accountId));
    }
    if (selectedCategories.length > 0) {
      filteredTx = filteredTx.filter((tx) => tx.categoryId && selectedCategories.includes(tx.categoryId));
    }
    if (selectedPayees.length > 0) {
      filteredTx = filteredTx.filter((tx) => tx.payeeId && selectedPayees.includes(tx.payeeId));
    }

    // Group by period
    const byPeriod = new Map<string, number>();

    for (const period of periods()) {
      byPeriod.set(period.key, 0);
    }

    for (const tx of filteredTx) {
      const txDate = new Date(tx.date);

      for (const period of periods()) {
        if (txDate >= period.start && txDate <= period.end) {
          const current = byPeriod.get(period.key) || 0;
          byPeriod.set(period.key, current + Math.abs(tx.amount));
          break;
        }
      }
    }

    return periods().map((period) => ({
      period: period.key,
      label: period.label,
      amount: byPeriod.get(period.key) || 0,
    }));
  });

  // Statistics
  const stats = $derived(() => {
    const data = trendData();
    const amounts = data.map((d) => d.amount);
    const total = amounts.reduce((sum, a) => sum + a, 0);
    const average = amounts.length > 0 ? total / amounts.length : 0;
    const max = Math.max(...amounts, 0);
    const min = Math.min(...amounts.filter((a) => a > 0), Infinity);

    // Trend calculation (simple linear regression slope)
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (amounts.length >= 2) {
      const firstHalf = amounts.slice(0, Math.floor(amounts.length / 2));
      const secondHalf = amounts.slice(Math.floor(amounts.length / 2));
      const firstAvg = firstHalf.reduce((s, a) => s + a, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, a) => s + a, 0) / secondHalf.length;

      if (secondAvg > firstAvg * 1.1) trend = 'up';
      else if (secondAvg < firstAvg * 0.9) trend = 'down';
    }

    return {
      total,
      average,
      max,
      min: min === Infinity ? 0 : min,
      trend,
      periods: amounts.length,
    };
  });

  // Colors
  const primaryColor = '#3b82f6';
  const averageColor = '#f59e0b';

  onMount(() => {
    updateChart();
    return () => {
      chart?.destroy();
    };
  });

  $effect(() => {
    if (canvas) {
      updateChart();
    }
  });

  function updateChart() {
    if (!canvas) return;

    chart?.destroy();

    const data = trendData();
    if (data.length === 0) return;

    const datasets: any[] = [
      {
        label: 'Gastos',
        data: data.map((d) => d.amount),
        borderColor: primaryColor,
        backgroundColor: `${primaryColor}20`,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ];

    if (showAverage && data.length > 1) {
      const avg = stats().average;
      datasets.push({
        label: 'Promedio',
        data: data.map(() => avg),
        borderColor: averageColor,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      });
    }

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map((d) => d.label),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          legend: {
            display: showAverage,
            position: 'top',
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.raw as number;
                return `${context.dataset.label}: ${formatCurrency(value)}`;
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
  }

  // Export to CSV
  function exportToCSV() {
    const data = trendData();
    const rows = [
      ['Período', 'Monto'],
      ...data.map((d) => [d.label, d.amount.toFixed(2)]),
      ['', ''],
      ['Total', stats().total.toFixed(2)],
      ['Promedio', stats().average.toFixed(2)],
      ['Máximo', stats().max.toFixed(2)],
      ['Mínimo', stats().min.toFixed(2)],
    ];

    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tendencia_gastos_${startDate || 'inicio'}_${endDate || 'fin'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="font-heading font-semibold">Tendencia de Gastos</h3>
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="h-8 w-8" onclick={exportToCSV} title="Exportar CSV">
        <Download class="h-4 w-4" />
      </Button>
    </div>
  </div>

  {#if trendData().length === 0}
    <p class="text-sm text-muted-foreground text-center py-8">No hay datos para este período</p>
  {:else}
    <!-- Chart -->
    <div class="h-64">
      <canvas bind:this={canvas}></canvas>
    </div>

    <!-- Statistics -->
    <div class="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
      <div class="text-center">
        <div class="text-xl font-semibold amount">{formatCurrency(stats().total)}</div>
        <div class="text-xs text-muted-foreground">Total</div>
      </div>
      <div class="text-center">
        <div class="text-xl font-semibold amount">{formatCurrency(stats().average)}</div>
        <div class="text-xs text-muted-foreground">Promedio</div>
      </div>
      <div class="text-center">
        <div class="text-xl font-semibold amount text-red-500">{formatCurrency(stats().max)}</div>
        <div class="text-xs text-muted-foreground">Máximo</div>
      </div>
      <div class="text-center">
        <div class="text-xl font-semibold amount text-green-500">{formatCurrency(stats().min)}</div>
        <div class="text-xs text-muted-foreground">Mínimo</div>
      </div>
      <div class="text-center">
        <div class="flex items-center justify-center gap-1">
          {#if stats().trend === 'up'}
            <TrendingUp class="h-5 w-5 text-red-500" />
            <span class="text-red-500 font-medium">Subiendo</span>
          {:else if stats().trend === 'down'}
            <TrendingDown class="h-5 w-5 text-green-500" />
            <span class="text-green-500 font-medium">Bajando</span>
          {:else}
            <Minus class="h-5 w-5 text-muted-foreground" />
            <span class="text-muted-foreground font-medium">Estable</span>
          {/if}
        </div>
        <div class="text-xs text-muted-foreground">Tendencia</div>
      </div>
    </div>

    <!-- Period breakdown -->
    <div class="pt-4 border-t">
      <h4 class="text-sm font-medium mb-2">Desglose por Período</h4>
      <div class="grid grid-cols-3 md:grid-cols-6 gap-2 text-sm">
        {#each trendData() as item}
          <div class="p-2 rounded bg-muted/30 text-center">
            <div class="text-xs text-muted-foreground">{item.label}</div>
            <div class="font-medium amount">{formatCurrency(item.amount)}</div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
