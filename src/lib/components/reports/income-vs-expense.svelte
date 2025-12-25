<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
  import { transactions } from '$lib/stores/budget';
  import { formatCurrency } from '$lib/utils';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

  interface Props {
    months?: number;
  }

  let { months = 6 }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  // Calculate monthly income/expense
  const monthlyData = $derived(() => {
    const today = new Date();
    const data: Array<{ month: string; income: number; expense: number }> = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthStart = date.toISOString().split('T')[0];
      date.setMonth(date.getMonth() + 1);
      date.setDate(0); // Last day of month
      const monthEnd = date.toISOString().split('T')[0];

      const monthTx = $transactions.filter(
        (tx) => tx.date >= monthStart && tx.date <= monthEnd
      );

      const income = monthTx.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
      const expense = Math.abs(
        monthTx.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0)
      );

      data.push({
        month: new Date(monthStart).toLocaleDateString(undefined, { month: 'short' }),
        income,
        expense,
      });
    }

    return data;
  });

  const totals = $derived(() => {
    const data = monthlyData();
    return {
      income: data.reduce((sum, d) => sum + d.income, 0),
      expense: data.reduce((sum, d) => sum + d.expense, 0),
      net: data.reduce((sum, d) => sum + d.income - d.expense, 0),
    };
  });

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

    const data = monthlyData();
    if (data.length === 0) return;

    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map((d) => d.month),
        datasets: [
          {
            label: 'Income',
            data: data.map((d) => d.income),
            backgroundColor: '#85c751',
            borderRadius: 4,
          },
          {
            label: 'Expense',
            data: data.map((d) => d.expense),
            backgroundColor: '#e25850',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatCurrency(value as number),
            },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                return `${context.dataset.label}: ${formatCurrency(context.raw as number)}`;
              },
            },
          },
        },
      },
    });
  }
</script>

<div class="space-y-4">
  <h3 class="font-heading font-semibold">Income vs Expense</h3>

  <!-- Summary -->
  <div class="grid grid-cols-3 gap-4 text-center">
    <div>
      <p class="text-sm text-muted-foreground">Income</p>
      <p class="amount text-lg font-semibold text-ynab-green">{formatCurrency(totals().income)}</p>
    </div>
    <div>
      <p class="text-sm text-muted-foreground">Expense</p>
      <p class="amount text-lg font-semibold text-ynab-red">{formatCurrency(totals().expense)}</p>
    </div>
    <div>
      <p class="text-sm text-muted-foreground">Net</p>
      <p class="amount text-lg font-semibold {totals().net >= 0 ? 'text-ynab-green' : 'text-ynab-red'}">
        {formatCurrency(totals().net)}
      </p>
    </div>
  </div>

  <!-- Chart -->
  <div class="h-64">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

