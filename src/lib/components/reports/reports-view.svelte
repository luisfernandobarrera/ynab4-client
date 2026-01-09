<script lang="ts">
  import { PieChart, BarChart3, TrendingUp, Calendar, Table2, Users, Hash, CalendarDays, AlertTriangle, UserPlus, HelpCircle, ArrowLeftRight } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import DateRangePicker from '$lib/components/ui/date-range-picker.svelte';
  import SpendingByCategory from './spending-by-category.svelte';
  import SpendingByPayee from './spending-by-payee.svelte';
  import SpendingTrends from './spending-trends.svelte';
  import IncomeVsExpense from './income-vs-expense.svelte';
  import NetWorth from './net-worth.svelte';
  import HierarchicalSpending from './hierarchical-spending.svelte';
  import ReportFilters from './report-filters.svelte';
  import BenfordDistribution from './benford-distribution.svelte';
  import SpendingByDayOfWeek from './spending-by-day-of-week.svelte';
  import SpendingByTimeOfMonth from './spending-by-time-of-month.svelte';
  import UnusualTransactions from './unusual-transactions.svelte';
  import NewPayees from './new-payees.svelte';
  import UncategorizedTransactions from './uncategorized-transactions.svelte';

  type ReportType = 'hierarchical' | 'spending-category' | 'spending-payee' | 'trends' | 'income-expense' | 'net-worth' | 'benford' | 'day-of-week' | 'time-of-month' | 'unusual' | 'new-payees' | 'uncategorized';

  type DatePreset =
    | 'today'
    | 'yesterday'
    | 'thisWeek'
    | 'lastWeek'
    | 'thisMonth'
    | 'lastMonth'
    | 'last7Days'
    | 'last30Days'
    | 'last90Days'
    | 'last6Months'
    | 'last12Months'
    | 'thisQuarter'
    | 'lastQuarter'
    | 'thisYear'
    | 'lastYear'
    | 'yearToDate'
    | 'allTime'
    | 'custom';

  type ComparisonType =
    | 'none'
    | 'previousPeriod'
    | 'previousMonth'
    | 'previousYear'
    | 'sameMonthLastYear';

  let activeReport = $state<ReportType>('hierarchical');

  // Date range state
  let startDate = $state<string>();
  let endDate = $state<string>();
  let datePreset = $state<DatePreset>('thisMonth');
  let comparisonType = $state<ComparisonType>('none');
  let comparisonStart = $state<string>();
  let comparisonEnd = $state<string>();

  // Initialize dates on mount (only once)
  let initialized = false;
  $effect(() => {
    if (!initialized) {
      initialized = true;
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      startDate = firstDay.toISOString().split('T')[0];
      endDate = lastDay.toISOString().split('T')[0];
    }
  });

  // Filter state
  let selectedAccounts = $state<string[]>([]);
  let selectedCategories = $state<string[]>([]);
  let selectedPayees = $state<string[]>([]);

  // Handle date range change
  function handleRangeChange(range: { start: string; end: string }, preset: DatePreset) {
    startDate = range.start;
    endDate = range.end;
    datePreset = preset;
  }

  // Handle comparison change
  function handleComparisonChange(comparison: ComparisonType, range?: { start: string; end: string }) {
    comparisonType = comparison;
    if (range) {
      comparisonStart = range.start;
      comparisonEnd = range.end;
    } else {
      comparisonStart = undefined;
      comparisonEnd = undefined;
    }
  }

  // Determine group by for trends based on date range length
  const trendsGroupBy = $derived(() => {
    if (!startDate || !endDate) return 'month';
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff <= 31) return 'week';
    if (daysDiff <= 90) return 'week';
    return 'month';
  });

  // Determine months for income vs expense based on date range
  const incomeExpenseMonths = $derived(() => {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
  });

  // Report types with their configurations
  const reportTypes = [
    { id: 'hierarchical' as const, label: 'Gastos e Ingresos', icon: Table2, showFilters: false, showComparison: false },
    { id: 'spending-category' as const, label: 'Por Categoría', icon: PieChart, showFilters: true, showComparison: true },
    { id: 'spending-payee' as const, label: 'Por Beneficiario', icon: Users, showFilters: true, showComparison: true },
    { id: 'trends' as const, label: 'Tendencias', icon: TrendingUp, showFilters: true, showComparison: false },
    { id: 'income-expense' as const, label: 'Ingresos vs Gastos', icon: BarChart3, showFilters: false, showComparison: true },
    { id: 'net-worth' as const, label: 'Patrimonio', icon: TrendingUp, showFilters: false, showComparison: false },
    { id: 'day-of-week' as const, label: 'Por Día', icon: Calendar, showFilters: false, showComparison: true },
    { id: 'time-of-month' as const, label: 'Momento del Mes', icon: CalendarDays, showFilters: false, showComparison: true },
    { id: 'unusual' as const, label: 'Inusuales', icon: AlertTriangle, showFilters: false, showComparison: false },
    { id: 'new-payees' as const, label: 'Nuevos', icon: UserPlus, showFilters: false, showComparison: true },
    { id: 'uncategorized' as const, label: 'Sin Categoría', icon: HelpCircle, showFilters: false, showComparison: false },
    { id: 'benford' as const, label: 'Benford', icon: Hash, showFilters: false, showComparison: false },
  ];

  const currentReportConfig = $derived(() => reportTypes.find(r => r.id === activeReport) || reportTypes[0]);

  // Check if current report supports comparison
  const showComparisonOption = $derived(() => currentReportConfig().showComparison);
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="sticky top-0 z-10 bg-background border-b p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-heading font-semibold">Reportes</h2>

      <!-- Date Range Picker -->
      <div class="flex items-center gap-3">
        <DateRangePicker
          bind:startDate
          bind:endDate
          bind:preset={datePreset}
          bind:comparison={comparisonType}
          bind:comparisonStart
          bind:comparisonEnd
          showComparison={showComparisonOption()}
          onRangeChange={handleRangeChange}
          onComparisonChange={handleComparisonChange}
        />

        {#if comparisonType !== 'none' && comparisonStart && comparisonEnd}
          <div class="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-md text-xs text-muted-foreground">
            <ArrowLeftRight class="h-3 w-3" />
            <span>Comparando</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Report type tabs -->
    <div class="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
      {#each reportTypes as report}
        <Button
          variant={activeReport === report.id ? 'default' : 'outline'}
          size="sm"
          onclick={() => (activeReport = report.id)}
          class="shrink-0"
        >
          <report.icon class="mr-2 h-4 w-4" />
          {report.label}
        </Button>
      {/each}
    </div>

    <!-- Filters (shown for reports that support them) -->
    {#if currentReportConfig().showFilters}
      <ReportFilters
        bind:selectedAccounts
        bind:selectedCategories
        bind:selectedPayees
        showAccounts={true}
        showCategories={activeReport !== 'spending-payee'}
        showPayees={activeReport !== 'spending-category'}
        showDatePresets={false}
      />
    {/if}
  </div>

  <!-- Report content -->
  <div class="flex-1 overflow-y-auto p-4">
    <Card>
      <CardContent class="p-6">
        {#if startDate && endDate}
          {#if activeReport === 'hierarchical'}
            <HierarchicalSpending
              startDate={startDate}
              endDate={endDate}
            />
          {:else if activeReport === 'spending-category'}
            <SpendingByCategory
              startDate={startDate}
              endDate={endDate}
            />
          {:else if activeReport === 'spending-payee'}
            <SpendingByPayee
              startDate={startDate}
              endDate={endDate}
              selectedAccounts={selectedAccounts}
              selectedCategories={selectedCategories}
            />
          {:else if activeReport === 'trends'}
            <SpendingTrends
              startDate={startDate}
              endDate={endDate}
              selectedAccounts={selectedAccounts}
              selectedCategories={selectedCategories}
              selectedPayees={selectedPayees}
              groupBy={trendsGroupBy()}
            />
          {:else if activeReport === 'income-expense'}
            <IncomeVsExpense months={incomeExpenseMonths()} />
          {:else if activeReport === 'net-worth'}
            <NetWorth />
          {:else if activeReport === 'day-of-week'}
            <SpendingByDayOfWeek
              startDate={startDate}
              endDate={endDate}
            />
          {:else if activeReport === 'time-of-month'}
            <SpendingByTimeOfMonth
              startDate={startDate}
              endDate={endDate}
            />
          {:else if activeReport === 'unusual'}
            <UnusualTransactions
              startDate={startDate}
              endDate={endDate}
            />
          {:else if activeReport === 'new-payees'}
            <NewPayees
              startDate={startDate}
              endDate={endDate}
            />
          {:else if activeReport === 'uncategorized'}
            <UncategorizedTransactions
              startDate={startDate}
              endDate={endDate}
            />
          {:else if activeReport === 'benford'}
            <BenfordDistribution
              startDate={startDate}
              endDate={endDate}
            />
          {/if}
        {:else}
          <div class="text-center py-12 text-muted-foreground">
            <Calendar class="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Selecciona un rango de fechas para ver el reporte</p>
          </div>
        {/if}
      </CardContent>
    </Card>

    <!-- Comparison Card (when enabled) -->
    {#if comparisonType !== 'none' && comparisonStart && comparisonEnd && currentReportConfig().showComparison}
      <Card class="mt-4">
        <CardContent class="p-6">
          <div class="flex items-center gap-2 mb-4 text-muted-foreground">
            <ArrowLeftRight class="h-4 w-4" />
            <span class="text-sm font-medium">Período de comparación</span>
          </div>

          {#if activeReport === 'spending-category'}
            <SpendingByCategory
              startDate={comparisonStart}
              endDate={comparisonEnd}
            />
          {:else if activeReport === 'spending-payee'}
            <SpendingByPayee
              startDate={comparisonStart}
              endDate={comparisonEnd}
              selectedAccounts={selectedAccounts}
              selectedCategories={selectedCategories}
            />
          {:else if activeReport === 'income-expense'}
            <IncomeVsExpense months={incomeExpenseMonths()} />
          {:else if activeReport === 'day-of-week'}
            <SpendingByDayOfWeek
              startDate={comparisonStart}
              endDate={comparisonEnd}
            />
          {:else if activeReport === 'time-of-month'}
            <SpendingByTimeOfMonth
              startDate={comparisonStart}
              endDate={comparisonEnd}
            />
          {:else if activeReport === 'new-payees'}
            <NewPayees
              startDate={comparisonStart}
              endDate={comparisonEnd}
            />
          {/if}
        </CardContent>
      </Card>
    {/if}
  </div>
</div>
