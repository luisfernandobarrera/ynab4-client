<script lang="ts">
  import { PieChart, BarChart3, TrendingUp, Calendar, Table2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
  import SpendingByCategory from './spending-by-category.svelte';
  import IncomeVsExpense from './income-vs-expense.svelte';
  import NetWorth from './net-worth.svelte';
  import HierarchicalSpending from './hierarchical-spending.svelte';

  type ReportType = 'spending' | 'income-expense' | 'net-worth' | 'hierarchical';

  let activeReport = $state<ReportType>('hierarchical');

  // Date range state
  let dateRange = $state<'month' | 'quarter' | 'year' | 'custom'>('month');
  
  const dateRanges = $derived(() => {
    const today = new Date();
    const ranges = {
      month: {
        start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      },
      quarter: {
        start: new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      },
      year: {
        start: new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      },
      custom: {
        start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      },
    };
    return ranges[dateRange];
  });

  const reportTypes = [
    { id: 'hierarchical' as const, label: 'Gastos e Ingresos', icon: Table2 },
    { id: 'spending' as const, label: 'Spending', icon: PieChart },
    { id: 'income-expense' as const, label: 'Income vs Expense', icon: BarChart3 },
    { id: 'net-worth' as const, label: 'Net Worth', icon: TrendingUp },
  ];
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="sticky top-0 z-10 bg-background border-b p-4 space-y-4">
    <h2 class="text-xl font-heading font-semibold">Reports</h2>

    <!-- Report type tabs -->
    <div class="flex gap-2 overflow-x-auto pb-2">
      {#each reportTypes as report}
        <Button
          variant={activeReport === report.id ? 'default' : 'outline'}
          size="sm"
          onclick={() => (activeReport = report.id)}
        >
          <report.icon class="mr-2 h-4 w-4" />
          {report.label}
        </Button>
      {/each}
    </div>

    <!-- Date range selector -->
    <div class="flex items-center gap-2">
      <Calendar class="h-4 w-4 text-muted-foreground" />
      <div class="flex gap-1">
        {#each ['month', 'quarter', 'year'] as range}
          <Button
            variant={dateRange === range ? 'secondary' : 'ghost'}
            size="sm"
            onclick={() => (dateRange = range as typeof dateRange)}
          >
            {range === 'month' ? 'This Month' : range === 'quarter' ? 'Quarter' : 'Year'}
          </Button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Report content -->
  <div class="flex-1 overflow-y-auto p-4">
    <Card>
      <CardContent class="p-6">
        {#if activeReport === 'hierarchical'}
          <HierarchicalSpending
            startDate={dateRanges().start}
            endDate={dateRanges().end}
          />
        {:else if activeReport === 'spending'}
          <SpendingByCategory
            startDate={dateRanges().start}
            endDate={dateRanges().end}
          />
        {:else if activeReport === 'income-expense'}
          <IncomeVsExpense months={dateRange === 'month' ? 1 : dateRange === 'quarter' ? 3 : 12} />
        {:else if activeReport === 'net-worth'}
          <NetWorth />
        {/if}
      </CardContent>
    </Card>
  </div>
</div>

