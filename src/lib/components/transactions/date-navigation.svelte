<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import { transactions } from '$lib/stores/budget';
  import { t } from '$lib/i18n';

  interface Props {
    selectedYear: number;
    selectedMonth: number;
    showAll: boolean;
    onYearChange: (year: number) => void;
    onMonthChange: (month: number) => void;
    onShowAllChange: (showAll: boolean) => void;
  }

  let { 
    selectedYear, 
    selectedMonth, 
    showAll, 
    onYearChange, 
    onMonthChange, 
    onShowAllChange 
  }: Props = $props();

  // Month names
  const monthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Get available years from transactions
  const availableYears = $derived.by(() => {
    const years = new Set<number>();
    for (const tx of $transactions) {
      if (tx.date && tx.date.length >= 4) {
        const year = parseInt(tx.date.substring(0, 4), 10);
        if (!isNaN(year)) years.add(year);
      }
    }
    const sorted = Array.from(years).sort((a, b) => b - a);
    return sorted.length > 0 ? sorted : [new Date().getFullYear()];
  });

  // Check if month has transactions
  function isMonthAvailable(monthIndex: number, year: number): boolean {
    return $transactions.some(tx => {
      if (!tx.date || tx.date.length < 7) return false;
      const txYear = parseInt(tx.date.substring(0, 4), 10);
      const txMonth = parseInt(tx.date.substring(5, 7), 10) - 1;
      return txYear === year && txMonth === monthIndex;
    });
  }

  function handlePrevMonth() {
    if (selectedMonth === 0) {
      const prevYearIndex = availableYears.indexOf(selectedYear) + 1;
      if (prevYearIndex < availableYears.length) {
        onYearChange(availableYears[prevYearIndex]);
        onMonthChange(11);
      }
    } else {
      onMonthChange(selectedMonth - 1);
    }
  }

  function handleNextMonth() {
    if (selectedMonth === 11) {
      const nextYearIndex = availableYears.indexOf(selectedYear) - 1;
      if (nextYearIndex >= 0) {
        onYearChange(availableYears[nextYearIndex]);
        onMonthChange(0);
      }
    } else {
      onMonthChange(selectedMonth + 1);
    }
  }

  function selectYear(year: number) {
    onYearChange(year);
    onShowAllChange(false);
  }

  function selectMonth(month: number) {
    if (isMonthAvailable(month, selectedYear)) {
      onMonthChange(month);
    }
  }

  function selectAll() {
    onShowAllChange(true);
  }
</script>

<div class="date-nav">
  <!-- Year tabs -->
  <div class="year-tabs">
    <button 
      class="year-tab" 
      class:active={showAll}
      onclick={selectAll}
    >
      {$t('transactions.allDates')}
    </button>
    {#each availableYears as year}
      <button 
        class="year-tab" 
        class:active={year === selectedYear && !showAll}
        onclick={() => selectYear(year)}
      >
        {year}
      </button>
    {/each}
  </div>

  <!-- Month bar -->
  {#if !showAll}
    <div class="month-bar-container">
      <button class="month-nav-btn" onclick={handlePrevMonth}>
        <ChevronLeft class="h-4 w-4" />
      </button>
      
      <div class="month-bar">
        {#each monthsShort as monthName, index}
          {@const isAvailable = isMonthAvailable(index, selectedYear)}
          <button 
            class="month-btn"
            class:active={index === selectedMonth}
            class:disabled={!isAvailable}
            onclick={() => selectMonth(index)}
            disabled={!isAvailable}
          >
            {monthName}
          </button>
        {/each}
      </div>
      
      <button class="month-nav-btn" onclick={handleNextMonth}>
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>
  {/if}
</div>

<style>
  .date-nav {
    border-bottom: 1px solid var(--border);
    background: var(--card);
  }

  /* Year tabs */
  .year-tabs {
    display: flex;
    gap: 0;
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--muted) transparent;
    background: var(--sidebar-bg, var(--muted));
  }

  .year-tabs::-webkit-scrollbar {
    height: 3px;
  }

  .year-tabs::-webkit-scrollbar-thumb {
    background: var(--muted-foreground);
    border-radius: 2px;
  }

  .year-tab {
    padding: 0.5rem 0.875rem;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .year-tab:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--foreground);
  }

  .year-tab.active {
    background: rgba(255, 255, 255, 0.12);
    color: var(--foreground);
    font-weight: 600;
  }

  /* Month bar */
  .month-bar-container {
    display: flex;
    align-items: stretch;
    background: var(--background);
  }

  .month-nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.5rem;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .month-nav-btn:hover {
    color: var(--foreground);
    background: var(--accent);
  }

  .month-bar {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .month-btn {
    flex: 1 1 0;
    min-width: 0;
    padding: 0.5rem 0;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
    text-align: center;
  }

  .month-btn:hover:not(.disabled) {
    background: var(--accent);
    color: var(--foreground);
  }

  .month-btn.active {
    color: var(--primary);
    font-weight: 700;
    background: var(--accent);
  }

  .month-btn.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 25%;
    right: 25%;
    height: 2px;
    background: var(--primary);
  }

  .month-btn.disabled {
    color: var(--muted);
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* Mobile */
  @media (max-width: 768px) {
    .year-tab {
      padding: 0.5rem 0.75rem;
      font-size: 0.7rem;
    }

    .month-btn {
      padding: 0.5rem 0.125rem;
      font-size: 0.6rem;
    }
  }
</style>

