<script lang="ts">
  import { PieChart, BarChart3, TrendingUp, Calendar, Table2, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import SpendingByCategory from './spending-by-category.svelte';
  import IncomeVsExpense from './income-vs-expense.svelte';
  import NetWorth from './net-worth.svelte';
  import HierarchicalSpending from './hierarchical-spending.svelte';

  type ReportType = 'spending' | 'income-expense' | 'net-worth' | 'hierarchical';

  let activeReport = $state<ReportType>('hierarchical');

  // Month navigation state
  const today = new Date();
  let selectedYear = $state(today.getFullYear());
  let selectedMonth = $state(today.getMonth()); // 0-indexed

  // Month names in Spanish
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Calculate date range for selected month
  const dateRanges = $derived(() => {
    const startDate = new Date(selectedYear, selectedMonth, 1);
    const endDate = new Date(selectedYear, selectedMonth + 1, 0); // Last day of month
    
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    };
  });

  // Format displayed month
  const displayedMonth = $derived(() => {
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
  }

  function nextMonth() {
    if (selectedMonth === 11) {
      selectedMonth = 0;
      selectedYear++;
    } else {
      selectedMonth++;
    }
  }

  function goToCurrentMonth() {
    selectedYear = today.getFullYear();
    selectedMonth = today.getMonth();
  }

  // Check if we're on the current month
  const isCurrentMonth = $derived(() => {
    return selectedYear === today.getFullYear() && selectedMonth === today.getMonth();
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
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-heading font-semibold">Reportes</h2>
      
      <!-- Month Navigator -->
      <div class="flex items-center gap-2 bg-muted/50 rounded-lg p-1">
        <Button variant="ghost" size="icon" class="h-8 w-8" onclick={previousMonth}>
          <ChevronLeft class="h-4 w-4" />
        </Button>
        
        <button 
          class="px-4 py-1 min-w-[160px] text-center font-medium hover:bg-accent rounded transition-colors"
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
          disabled={isCurrentMonth()}
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
          <IncomeVsExpense months={1} />
        {:else if activeReport === 'net-worth'}
          <NetWorth />
        {/if}
      </CardContent>
    </Card>
  </div>
</div>
