<script lang="ts">
  import { PieChart, BarChart3, TrendingUp, Calendar, Table2, Users, Hash, CalendarDays, AlertTriangle, UserPlus, HelpCircle, ArrowLeftRight, ChevronDown, ChevronUp, Wallet, Clock, Search, LayoutGrid } from 'lucide-svelte';
  import { browser } from '$app/environment';
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

  // Report panel state - persisted
  let showReportPanel = $state(browser ? localStorage.getItem('showReportPanel') !== 'false' : true);

  $effect(() => {
    if (browser) {
      localStorage.setItem('showReportPanel', String(showReportPanel));
    }
  });

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

  // Report categories for organized access
  type ReportConfig = {
    id: ReportType;
    label: string;
    icon: typeof Table2;
    showFilters: boolean;
    showComparison: boolean;
    description: string;
  };

  type ReportCategory = {
    name: string;
    icon: typeof Wallet;
    reports: ReportConfig[];
  };

  const reportCategories: ReportCategory[] = [
    {
      name: 'Gastos',
      icon: Wallet,
      reports: [
        { id: 'hierarchical', label: 'Gastos e Ingresos', icon: Table2, showFilters: false, showComparison: false, description: 'Vista jerárquica de gastos por categoría' },
        { id: 'spending-category', label: 'Por Categoría', icon: PieChart, showFilters: true, showComparison: true, description: 'Distribución de gastos por categoría' },
        { id: 'spending-payee', label: 'Por Beneficiario', icon: Users, showFilters: true, showComparison: true, description: 'Gastos agrupados por beneficiario' },
        { id: 'trends', label: 'Tendencias', icon: TrendingUp, showFilters: true, showComparison: false, description: 'Evolución de gastos en el tiempo' },
      ],
    },
    {
      name: 'Finanzas',
      icon: BarChart3,
      reports: [
        { id: 'income-expense', label: 'Ingresos vs Gastos', icon: BarChart3, showFilters: false, showComparison: true, description: 'Comparación de ingresos y gastos' },
        { id: 'net-worth', label: 'Patrimonio', icon: TrendingUp, showFilters: false, showComparison: false, description: 'Evolución de tu patrimonio neto' },
      ],
    },
    {
      name: 'Patrones',
      icon: Clock,
      reports: [
        { id: 'day-of-week', label: 'Por Día de Semana', icon: Calendar, showFilters: false, showComparison: true, description: 'Patrones de gasto por día' },
        { id: 'time-of-month', label: 'Momento del Mes', icon: CalendarDays, showFilters: false, showComparison: true, description: 'Distribución de gastos en el mes' },
      ],
    },
    {
      name: 'Análisis',
      icon: Search,
      reports: [
        { id: 'unusual', label: 'Transacciones Inusuales', icon: AlertTriangle, showFilters: false, showComparison: false, description: 'Detecta gastos fuera de lo común' },
        { id: 'new-payees', label: 'Beneficiarios Nuevos', icon: UserPlus, showFilters: false, showComparison: true, description: 'Nuevos comercios o personas' },
        { id: 'uncategorized', label: 'Sin Categoría', icon: HelpCircle, showFilters: false, showComparison: false, description: 'Transacciones sin categorizar' },
        { id: 'benford', label: 'Ley de Benford', icon: Hash, showFilters: false, showComparison: false, description: 'Análisis estadístico de dígitos' },
      ],
    },
  ];

  // Flat list for lookup
  const allReports = $derived(reportCategories.flatMap(c => c.reports));
  const currentReportConfig = $derived(() => allReports.find(r => r.id === activeReport) || allReports[0]);

  // Check if current report supports comparison
  const showComparisonOption = $derived(() => currentReportConfig().showComparison);

  // Select a report
  function selectReport(id: ReportType) {
    activeReport = id;
  }
</script>

<div class="flex flex-col h-full">
  <!-- Report Panel (Collapsible) -->
  <div class="report-panel" class:collapsed={!showReportPanel}>
    <button class="panel-header" onclick={() => showReportPanel = !showReportPanel}>
      <div class="panel-header-left">
        <LayoutGrid class="h-4 w-4" />
        <span class="panel-title">Reportes</span>
        {@const config = currentReportConfig()}
        <span class="current-report-badge">
          {@const Icon = config.icon}
          <Icon class="h-3 w-3" />
          {config.label}
        </span>
      </div>
      <div class="panel-header-right">
        {#if showReportPanel}
          <ChevronUp class="h-4 w-4" />
        {:else}
          <ChevronDown class="h-4 w-4" />
        {/if}
      </div>
    </button>

    {#if showReportPanel}
      <div class="panel-content">
        <div class="report-grid">
          {#each reportCategories as category}
            <div class="report-category-section">
              {@const CategoryIcon = category.icon}
              <div class="category-label">
                <CategoryIcon class="h-3.5 w-3.5" />
                <span>{category.name}</span>
              </div>
              <div class="report-tiles">
                {#each category.reports as report}
                  {@const ReportIcon = report.icon}
                  <button
                    class="report-tile"
                    class:active={activeReport === report.id}
                    onclick={() => selectReport(report.id)}
                    title={report.description}
                  >
                    <ReportIcon class="tile-icon" />
                    <span class="tile-label">{report.label}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Header with Date Controls -->
  <div class="sticky top-0 z-10 bg-background border-b p-3">
    <div class="flex items-center justify-between gap-3">
      <!-- Current Report Info -->
      <div class="current-report-info">
        {@const config = currentReportConfig()}
        {@const Icon = config.icon}
        <Icon class="h-5 w-5 text-primary" />
        <div>
          <h2 class="report-title">{config.label}</h2>
          <p class="report-desc">{config.description}</p>
        </div>
      </div>

      <!-- Date Range Picker -->
      <div class="flex items-center gap-2">
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
          <div class="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md text-xs text-muted-foreground">
            <ArrowLeftRight class="h-3 w-3" />
            <span class="hidden sm:inline">Comparando</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Filters (shown for reports that support them) -->
    {#if currentReportConfig().showFilters}
      <div class="mt-3">
        <ReportFilters
          bind:selectedAccounts
          bind:selectedCategories
          bind:selectedPayees
          showAccounts={true}
          showCategories={activeReport !== 'spending-payee'}
          showPayees={activeReport !== 'spending-category'}
          showDatePresets={false}
        />
      </div>
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

<style>
  /* Report Panel */
  .report-panel {
    background: var(--card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.625rem 1rem;
    background: var(--muted);
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }

  .panel-header:hover {
    background: color-mix(in srgb, var(--muted) 90%, var(--foreground) 10%);
  }

  .panel-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--foreground);
  }

  .panel-title {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .current-report-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: var(--primary);
    color: var(--primary-foreground);
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .panel-header-right {
    color: var(--muted-foreground);
  }

  .panel-content {
    padding: 0.75rem 1rem;
    background: var(--background);
  }

  /* Report Grid */
  .report-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
  }

  .report-category-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .category-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    padding: 0 0.25rem;
  }

  .report-tiles {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .report-tile {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    background: var(--muted);
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    color: var(--foreground);
    font-size: 0.8rem;
  }

  .report-tile:hover {
    background: var(--accent);
    border-color: var(--border);
  }

  .report-tile.active {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .report-tile :global(.tile-icon) {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .tile-label {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Current Report Info */
  .current-report-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .report-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    line-height: 1.2;
  }

  .report-desc {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    margin: 0;
    line-height: 1.3;
  }

  /* Responsive */
  @media (max-width: 1024px) {
    .report-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 640px) {
    .report-grid {
      grid-template-columns: 1fr;
    }

    .current-report-info {
      display: none;
    }

    .report-desc {
      display: none;
    }
  }
</style>
