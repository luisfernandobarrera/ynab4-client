<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
  import { transactions, categories, masterCategories } from '$lib/stores/budget';
  import { formatCurrency } from '$lib/utils';

  Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

  interface Props {
    startDate?: string;
    endDate?: string;
  }

  let { startDate, endDate }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart | null = null;

  // Calculate spending by master category
  const spendingData = $derived(() => {
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const filteredTx = $transactions.filter(
      (tx) => tx.date >= start && tx.date <= end && tx.amount < 0
    );

    // Group by master category
    const byMaster = new Map<string, number>();

    for (const tx of filteredTx) {
      if (!tx.categoryId) continue;
      const cat = $categories.find((c) => c.entityId === tx.categoryId);
      if (!cat) continue;

      const masterName = cat.masterCategoryName || 'Uncategorized';
      const current = byMaster.get(masterName) || 0;
      byMaster.set(masterName, current + Math.abs(tx.amount));
    }

    // Sort by amount descending
    return Array.from(byMaster.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  });

  const total = $derived(spendingData().reduce((sum, d) => sum + d.amount, 0));

  // Chart colors
  const colors = [
    '#4a90d9', // blue
    '#85c751', // green
    '#f5a623', // orange
    '#e25850', // red
    '#9b59b6', // purple
    '#f8e71c', // yellow
    '#1abc9c', // teal
    '#e74c3c', // crimson
    '#3498db', // light blue
    '#2ecc71', // emerald
  ];

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

    const data = spendingData();
    if (data.length === 0) return;

    chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.map((d) => d.name),
        datasets: [
          {
            data: data.map((d) => d.amount),
            backgroundColor: colors.slice(0, data.length),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.raw as number;
                const percent = ((value / total) * 100).toFixed(1);
                return `${formatCurrency(value)} (${percent}%)`;
              },
            },
          },
        },
      },
    });
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="font-heading font-semibold">Spending by Category</h3>
    <span class="amount font-semibold">{formatCurrency(total)}</span>
  </div>

  {#if spendingData().length === 0}
    <p class="text-sm text-muted-foreground text-center py-8">No spending data for this period</p>
  {:else}
    <div class="flex flex-col md:flex-row gap-6">
      <!-- Chart -->
      <div class="h-64 w-64 mx-auto md:mx-0">
        <canvas bind:this={canvas}></canvas>
      </div>

      <!-- Legend -->
      <div class="flex-1 space-y-2">
        {#each spendingData() as item, i}
          <div class="flex items-center gap-3">
            <div
              class="h-3 w-3 rounded-full shrink-0"
              style="background-color: {colors[i % colors.length]}"
            ></div>
            <span class="flex-1 truncate">{item.name}</span>
            <span class="amount text-sm">{formatCurrency(item.amount)}</span>
            <span class="text-xs text-muted-foreground w-12 text-right">
              {((item.amount / total) * 100).toFixed(1)}%
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

