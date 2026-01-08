<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js';
  import { transactions, payees, accounts, categories } from '$lib/stores/budget';
  import { formatCurrency } from '$lib/utils';
  import { Download } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';

  Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

  interface Props {
    startDate?: string;
    endDate?: string;
    selectedAccounts?: string[];
    selectedCategories?: string[];
    maxPayees?: number;
  }

  let {
    startDate,
    endDate,
    selectedAccounts = [],
    selectedCategories = [],
    maxPayees = 10,
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart | null = null;

  // Calculate spending by payee
  const spendingData = $derived(() => {
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    // Filter transactions
    let filteredTx = $transactions.filter(
      (tx) => tx.date >= start && tx.date <= end && tx.amount < 0
    );

    // Apply account filter
    if (selectedAccounts.length > 0) {
      filteredTx = filteredTx.filter((tx) => selectedAccounts.includes(tx.accountId));
    }

    // Apply category filter
    if (selectedCategories.length > 0) {
      filteredTx = filteredTx.filter((tx) => tx.categoryId && selectedCategories.includes(tx.categoryId));
    }

    // Group by payee
    const byPayee = new Map<string, { name: string; amount: number; count: number }>();

    for (const tx of filteredTx) {
      // Skip transfers
      if (tx.payeeName?.startsWith('Transfer :') || tx.transferAccountId) continue;

      const payeeName = tx.payeeName || 'Sin Beneficiario';
      const payeeId = tx.payeeId || 'unknown';

      const current = byPayee.get(payeeId) || { name: payeeName, amount: 0, count: 0 };
      current.amount += Math.abs(tx.amount);
      current.count += 1;
      byPayee.set(payeeId, current);
    }

    // Sort by amount descending and take top N
    const sorted = Array.from(byPayee.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.amount - a.amount);

    // If more than maxPayees, group the rest as "Others"
    if (sorted.length > maxPayees) {
      const top = sorted.slice(0, maxPayees - 1);
      const others = sorted.slice(maxPayees - 1);
      const othersTotal = others.reduce((sum, p) => sum + p.amount, 0);
      const othersCount = others.reduce((sum, p) => sum + p.count, 0);

      return [
        ...top,
        { id: 'others', name: `Otros (${others.length})`, amount: othersTotal, count: othersCount },
      ];
    }

    return sorted;
  });

  const total = $derived(spendingData().reduce((sum, d) => sum + d.amount, 0));

  // Chart colors - more variety for payees
  const colors = [
    '#3b82f6', // blue
    '#22c55e', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
    '#6366f1', // indigo
    '#84cc16', // lime
    '#a855f7', // purple
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
                const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                return `${formatCurrency(value)} (${percent}%)`;
              },
            },
          },
        },
      },
    });
  }

  // Export to CSV
  function exportToCSV() {
    const data = spendingData();
    const rows = [
      ['Beneficiario', 'Monto', 'Transacciones', 'Porcentaje'],
      ...data.map((d) => [
        d.name,
        d.amount.toFixed(2),
        d.count.toString(),
        total > 0 ? ((d.amount / total) * 100).toFixed(1) + '%' : '0%',
      ]),
      ['Total', total.toFixed(2), data.reduce((sum, d) => sum + d.count, 0).toString(), '100%'],
    ];

    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gastos_por_beneficiario_${startDate || 'inicio'}_${endDate || 'fin'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="font-heading font-semibold">Gastos por Beneficiario</h3>
    <div class="flex items-center gap-2">
      <span class="amount font-semibold">{formatCurrency(total)}</span>
      <Button variant="ghost" size="icon" class="h-8 w-8" onclick={exportToCSV} title="Exportar CSV">
        <Download class="h-4 w-4" />
      </Button>
    </div>
  </div>

  {#if spendingData().length === 0}
    <p class="text-sm text-muted-foreground text-center py-8">No hay datos de gastos para este período</p>
  {:else}
    <div class="flex flex-col md:flex-row gap-6">
      <!-- Chart -->
      <div class="h-64 w-64 mx-auto md:mx-0 shrink-0">
        <canvas bind:this={canvas}></canvas>
      </div>

      <!-- Legend with details -->
      <div class="flex-1 space-y-2 max-h-64 overflow-y-auto">
        {#each spendingData() as item, i}
          <div class="flex items-center gap-3 p-2 rounded hover:bg-muted/50 transition-colors">
            <div
              class="h-3 w-3 rounded-full shrink-0"
              style="background-color: {colors[i % colors.length]}"
            ></div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium">{item.name}</span>
                <span class="text-xs text-muted-foreground">({item.count} tx)</span>
              </div>
            </div>
            <span class="amount text-sm font-medium">{formatCurrency(item.amount)}</span>
            <span class="text-xs text-muted-foreground w-12 text-right">
              {total > 0 ? ((item.amount / total) * 100).toFixed(1) : '0'}%
            </span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Summary stats -->
    <div class="grid grid-cols-3 gap-4 pt-4 border-t">
      <div class="text-center">
        <div class="text-2xl font-semibold">{spendingData().length}</div>
        <div class="text-xs text-muted-foreground">Beneficiarios</div>
      </div>
      <div class="text-center">
        <div class="text-2xl font-semibold">{spendingData().reduce((sum, d) => sum + d.count, 0)}</div>
        <div class="text-xs text-muted-foreground">Transacciones</div>
      </div>
      <div class="text-center">
        <div class="text-2xl font-semibold amount">
          {formatCurrency(total / Math.max(spendingData().reduce((sum, d) => sum + d.count, 0), 1))}
        </div>
        <div class="text-xs text-muted-foreground">Promedio/Tx</div>
      </div>
    </div>
  {/if}
</div>
