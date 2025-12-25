<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
  import { accounts } from '$lib/stores/budget';
  import { formatCurrency, cn } from '$lib/utils';

  Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  // Calculate net worth by account type
  const netWorthData = $derived(() => {
    const assets = $accounts
      .filter((a) => !a.closed && !a.hidden && a.balance >= 0 && a.onBudget)
      .reduce((sum, a) => sum + a.balance, 0);

    const liabilities = Math.abs(
      $accounts
        .filter((a) => !a.closed && !a.hidden && a.balance < 0)
        .reduce((sum, a) => sum + a.balance, 0)
    );

    const tracking = $accounts
      .filter((a) => !a.closed && !a.hidden && !a.onBudget)
      .reduce((sum, a) => sum + a.balance, 0);

    return {
      assets,
      liabilities,
      tracking,
      netWorth: assets - liabilities + tracking,
    };
  });

  // Mock historical data (in real app, would come from transaction history)
  const historicalData = $derived(() => {
    const months = 12;
    const data: Array<{ month: string; value: number }> = [];
    const currentNetWorth = netWorthData().netWorth;

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      
      // Simulate growth (in real app, calculate from transactions)
      const factor = 1 - (i * 0.02) + (Math.random() * 0.05);
      
      data.push({
        month: date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        value: currentNetWorth * factor,
      });
    }

    return data;
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

    const data = historicalData();

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map((d) => d.month),
        datasets: [
          {
            label: 'Net Worth',
            data: data.map((d) => d.value),
            borderColor: '#4a90d9',
            backgroundColor: 'rgba(74, 144, 217, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: {
              callback: (value) => formatCurrency(value as number),
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => formatCurrency(context.raw as number),
            },
          },
        },
      },
    });
  }
</script>

<div class="space-y-4">
  <h3 class="font-heading font-semibold">Net Worth</h3>

  <!-- Summary -->
  <div class="rounded-lg bg-muted p-4">
    <p class="text-sm text-muted-foreground">Total Net Worth</p>
    <p class={cn(
      'amount text-3xl font-bold',
      netWorthData().netWorth >= 0 ? 'text-ynab-green' : 'text-ynab-red'
    )}>
      {formatCurrency(netWorthData().netWorth)}
    </p>
  </div>

  <!-- Breakdown -->
  <div class="grid grid-cols-3 gap-4 text-center text-sm">
    <div>
      <p class="text-muted-foreground">Assets</p>
      <p class="amount font-semibold text-ynab-green">{formatCurrency(netWorthData().assets)}</p>
    </div>
    <div>
      <p class="text-muted-foreground">Liabilities</p>
      <p class="amount font-semibold text-ynab-red">{formatCurrency(netWorthData().liabilities)}</p>
    </div>
    <div>
      <p class="text-muted-foreground">Tracking</p>
      <p class="amount font-semibold">{formatCurrency(netWorthData().tracking)}</p>
    </div>
  </div>

  <!-- Chart -->
  <div class="h-48">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

