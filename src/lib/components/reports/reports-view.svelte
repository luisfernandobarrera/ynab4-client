<script lang="ts">
  import { PieChart, BarChart3, TrendingUp, Calendar, Table2, ChevronLeft, ChevronRight, Users, Hash } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import SpendingByCategory from './spending-by-category.svelte';
  import SpendingByPayee from './spending-by-payee.svelte';
  import SpendingTrends from './spending-trends.svelte';
  import IncomeVsExpense from './income-vs-expense.svelte';
  import NetWorth from './net-worth.svelte';
  import HierarchicalSpending from './hierarchical-spending.svelte';
  import ReportFilters from './report-filters.svelte';
  import BenfordDistribution from './benford-distribution.svelte';

  type ReportType = 'hierarchical' | 'spending-category' | 'spending-payee' | 'trends' | 'income-expense' | 'net-worth' | 'benford';

  let activeReport = $state<ReportType>('hierarchical');

  // Month navigation state
  const today = new Date();
  let selectedYear = $state(today.getFullYear());
  let selectedMonth = $state(today.getMonth()); // 0-indexed

  // Filter state
  let selectedAccounts = $state<string[]>([]);
  let selectedCategories = $state<string[]>([]);
  let selectedPayees = $state<string[]>([]);
  let datePreset = $state<'thisMonth' | 'last3Months' | 'thisYear' | 'lastYear' | 'allDates' | 'custom'>('thisMonth');

  // Month names in Spanish
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Calculate date range based on preset or selected month
  const dateRanges = $derived(() => {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (datePreset) {
      case 'thisMonth':
        start = new Date(selectedYear, selectedMonth, 1);
        end = new Date(selectedYear, selectedMonth + 1, 0);
        break;
      case 'last3Months':
        end = new Date(selectedYear, selectedMonth + 1, 0);
        start = new Date(selectedYear, selectedMonth - 2, 1);
        break;
      case 'thisYear':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      case 'lastYear':
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
        break;
      case 'allDates':
        start = new Date(2000, 0, 1);
        end = now;
        break;
      default:
        start = new Date(selectedYear, selectedMonth, 1);
        end = new Date(selectedYear, selectedMonth + 1, 0);
    }

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  });

  // Format displayed month
  const displayedMonth = $derived(() => {
    if (datePreset === 'thisMonth' || datePreset === 'custom') {
      return `${monthNames[selectedMonth]} ${selectedYear}`;
    }
    if (datePreset === 'last3Months') {
      return 'Últimos 3 Meses';
    }
    if (datePreset === 'thisYear') {
      return `Año ${today.getFullYear()}`;
    }
    if (datePreset === 'lastYear') {
      return `Año ${today.getFullYear() - 1}`;
    }
    if (datePreset === 'allDates') {
      return 'Todas las Fechas';
    }
    return `${monthNames[selectedMonth]} ${selectedYear}`;
  });

  // Navigation functions
  function previousMonth() {
    if (selectedMonth === 0) {
      selectedMonth = 11;
      selectedYear--;
    } else {
      selectedMonth--;
    }
    // When navigating, switch to custom/single month mode
    if (datePreset !== 'thisMonth') {
      datePreset = 'custom';
    }
  }

  function nextMonth() {
    if (selectedMonth === 11) {
      selectedMonth = 0;
      selectedYear++;
    } else {
      selectedMonth++;
    }
    if (datePreset !== 'thisMonth') {
      datePreset = 'custom';
    }
  }

  function goToCurrentMonth() {
    selectedYear = today.getFullYear();
    selectedMonth = today.getMonth();
    datePreset = 'thisMonth';
  }

  // Check if we're on the current month
  const isCurrentMonth = $derived(() => {
    return selectedYear === today.getFullYear() && selectedMonth === today.getMonth();
  });

  // Handle date preset changes
  function handleDatePresetChange(preset: string) {
    datePreset = preset as typeof datePreset;
    // Reset to current month for some presets
    if (preset === 'thisMonth' || preset === 'thisYear') {
      selectedYear = today.getFullYear();
      selectedMonth = today.getMonth();
    }
  }

  // Report types with their configurations
  const reportTypes = [
    { id: 'hierarchical' as const, label: 'Gastos e Ingresos', icon: Table2, showFilters: false },
    { id: 'spending-category' as const, label: 'Por Categoría', icon: PieChart, showFilters: true },
    { id: 'spending-payee' as const, label: 'Por Beneficiario', icon: Users, showFilters: true },
    { id: 'trends' as const, label: 'Tendencias', icon: TrendingUp, showFilters: true },
    { id: 'income-expense' as const, label: 'Ingresos vs Gastos', icon: BarChart3, showFilters: false },
    { id: 'net-worth' as const, label: 'Patrimonio', icon: TrendingUp, showFilters: false },
    { id: 'benford' as const, label: 'Benford', icon: Hash, showFilters: false },
  ];

  const currentReportConfig = $derived(() => reportTypes.find(r => r.id === activeReport) || reportTypes[0]);
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="sticky top-0 z-10 bg-background border-b p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-heading font-semibold">Reportes</h2>

      <!-- Month Navigator -->
      <div class="flex items-center gap-2 bg-muted/50 rounded-lg p-1">
        <Button variant="ghost" size="icon" class="h-8 w-8" onclick={previousMonth}>
          <ChevronLeft class="h-4 w-4" />
        </Button>

        <button
          class="px-4 py-1 min-w-[180px] text-center font-medium hover:bg-accent rounded transition-colors"
          onclick={goToCurrentMonth}
          title="Ir al mes actual"
        >
          <Calendar class="h-4 w-4 inline-block mr-2 opacity-60" />
          {displayedMonth()}
        </button>

        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          onclick={nextMonth}
          disabled={isCurrentMonth() && datePreset === 'thisMonth'}
        >
          <ChevronRight class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <!-- Report type tabs -->
    <div class="flex gap-2 overflow-x-auto pb-1">
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

    <!-- Filters (shown for reports that support them) -->
    {#if currentReportConfig().showFilters}
      <ReportFilters
        bind:selectedAccounts
        bind:selectedCategories
        bind:selectedPayees
        bind:datePreset
        onDatePresetChange={handleDatePresetChange}
        showAccounts={true}
        showCategories={activeReport !== 'spending-payee'}
        showPayees={activeReport !== 'spending-category'}
        showDatePresets={true}
      />
    {/if}
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
        {:else if activeReport === 'spending-category'}
          <SpendingByCategory
            startDate={dateRanges().start}
            endDate={dateRanges().end}
          />
        {:else if activeReport === 'spending-payee'}
          <SpendingByPayee
            startDate={dateRanges().start}
            endDate={dateRanges().end}
            selectedAccounts={selectedAccounts}
            selectedCategories={selectedCategories}
          />
        {:else if activeReport === 'trends'}
          <SpendingTrends
            startDate={dateRanges().start}
            endDate={dateRanges().end}
            selectedAccounts={selectedAccounts}
            selectedCategories={selectedCategories}
            selectedPayees={selectedPayees}
            groupBy={datePreset === 'thisMonth' ? 'week' : 'month'}
          />
        {:else if activeReport === 'income-expense'}
          <IncomeVsExpense months={datePreset === 'thisMonth' ? 1 : datePreset === 'last3Months' ? 3 : 12} />
        {:else if activeReport === 'net-worth'}
          <NetWorth />
        {:else if activeReport === 'benford'}
          <BenfordDistribution
            startDate={dateRanges().start}
            endDate={dateRanges().end}
          />
        {/if}
      </CardContent>
    </Card>
  </div>
</div>
