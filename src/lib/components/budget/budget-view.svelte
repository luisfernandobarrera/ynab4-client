<script lang="ts">
  import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X } from 'lucide-svelte';
  import { MonthlyBudgetCalculator } from 'ynab-library';
  import { 
    rawTransactions, 
    monthlyBudgets, 
    rawCategories, 
    rawMasterCategories,
    accounts,
    payees,
    selectedMonth,
    budgetInfo
  } from '$lib/stores/budget';
  import { isMobile, isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { t } from '$lib/i18n';

  // Initialize calculator
  const budgetCalculator = new MonthlyBudgetCalculator();

  // Month navigation state
  const currentDate = new Date();
  let selectedYear = $state(currentDate.getFullYear());
  let centerMonth = $state(currentDate.getMonth());
  let visibleMonths = $state(4);
  let showOnlyActive = $state(true);
  
  // Expansion state
  let expandedMasters = $state<Set<string>>(new Set());
  
  // Selection state for transactions panel
  let selection = $state<{
    type: 'category' | 'master';
    id: string;
    monthKey: string;
    name: string;
  } | null>(null);
  let showTransactions = $state(false);

  // Budget editing state
  let editingBudget = $state<{
    categoryId: string;
    monthKey: string;
    currentBudgeted: number;
    inputValue: string;
  } | null>(null);

  // Get months short/long names from translations
  const monthsShort = $derived(($t('months.short') as unknown) as string[]);
  const monthsLong = $derived(($t('months.long') as unknown) as string[]);

  // Calculate visible months range
  const monthRange = $derived.by(() => {
    const months: Array<{ month: number; year: number; key: string }> = [];
    let startMonth = centerMonth - 1;
    let startYear = selectedYear;
    
    if (startMonth < 0) {
      startMonth += 12;
      startYear -= 1;
    }
    
    for (let i = 0; i < visibleMonths; i++) {
      let m = startMonth + i;
      let y = startYear;
      
      if (m >= 12) {
        m -= 12;
        y += 1;
      }
      
      months.push({ month: m, year: y, key: `${y}-${String(m + 1).padStart(2, '0')}` });
    }
    
    return months;
  });

  // Get years with data
  const yearsWithData = $derived.by(() => {
    const years = new Set<number>();
    
    $rawTransactions?.forEach(tx => {
      if (tx.date) {
        const year = parseInt(tx.date.slice(0, 4));
        if (!isNaN(year) && year > 1990 && year < 2100) {
          years.add(year);
        }
      }
    });
    
    $monthlyBudgets?.forEach(mb => {
      const monthStr = mb.month || mb.entityId || '';
      if (monthStr) {
        const year = parseInt(monthStr.slice(0, 4));
        if (!isNaN(year) && year > 1990 && year < 2100) {
          years.add(year);
        }
      }
    });
    
    if (years.size === 0) {
      years.add(currentDate.getFullYear());
    }
    
    return Array.from(years).sort((a, b) => b - a);
  });

  // Calculate budget data for all visible months
  const monthsData = $derived.by(() => {
    const subCategories = $rawCategories?.filter(c => !c.isTombstone) || [];
    const masters = $rawMasterCategories?.filter(mc => !mc.isTombstone) || [];
    
    if (!subCategories.length) return {};
    
    const data: Record<string, ReturnType<typeof budgetCalculator.calculateMonthlyBudget>> = {};
    
    monthRange.forEach(({ key }) => {
      try {
        data[key] = budgetCalculator.calculateMonthlyBudget(
          key,
          $rawTransactions || [],
          $monthlyBudgets || [],
          subCategories,
          masters
        );
      } catch (err) {
        console.error(`[BudgetView] Error calculating ${key}:`, err);
        data[key] = { month: key, totalBudgeted: 0, totalActivity: 0, totalCarryover: 0, totalAvailable: 0, masterCategories: [] };
      }
    });
    
    return data;
  });

  // Determine active categories in visible range
  const activeCategoriesInRange = $derived.by(() => {
    const active = new Set<string>();
    const threshold = 0.01;
    
    monthRange.forEach(({ key }) => {
      const monthData = monthsData[key];
      if (!monthData?.masterCategories) return;
      
      monthData.masterCategories.forEach(mc => {
        mc.categories?.forEach(cat => {
          const hasBudget = Math.abs(cat.budgeted || 0) >= threshold;
          const hasActivity = Math.abs(cat.activity || 0) >= threshold;
          const hasBalance = Math.abs(cat.available || 0) >= threshold;
          
          if (hasBudget || hasActivity || hasBalance) {
            active.add(cat.categoryId || '');
          }
        });
      });
    });
    
    return active;
  });

  // Build category structure
  const allCategoryStructure = $derived.by(() => {
    const masters = $rawMasterCategories?.filter(mc => 
      !mc.isTombstone && 
      !mc.name?.startsWith('Hidden') && 
      !mc.name?.startsWith('Internal')
    ) || [];
    
    const subCats = $rawCategories?.filter(c => !c.isTombstone) || [];
    
    return masters
      .map(mc => {
        const subs = subCats.filter(sc => sc.masterCategoryId === mc.entityId);
        
        return {
          id: mc.entityId,
          name: mc.name,
          type: mc.type,
          sortableIndex: mc.sortableIndex || 0,
          subCategories: subs.map(sc => ({
            id: sc.entityId,
            name: sc.name,
            sortableIndex: sc.sortableIndex || 0,
            isActive: activeCategoriesInRange.has(sc.entityId)
          })).sort((a, b) => a.sortableIndex - b.sortableIndex)
        };
      })
      .sort((a, b) => a.sortableIndex - b.sortableIndex);
  });

  // Filter categories based on showOnlyActive
  const categoryStructure = $derived.by(() => {
    if (!showOnlyActive) return allCategoryStructure;
    
    return allCategoryStructure
      .map(master => ({
        ...master,
        subCategories: master.subCategories.filter(sub => sub.isActive)
      }))
      .filter(master => master.subCategories.length > 0);
  });

  // Category statistics
  const categoryStats = $derived.by(() => {
    const totalSubs = allCategoryStructure.reduce((sum, m) => sum + m.subCategories.length, 0);
    const activeSubs = allCategoryStructure.reduce(
      (sum, m) => sum + m.subCategories.filter(s => s.isActive).length, 
      0
    );
    return { total: totalSubs, active: activeSubs };
  });

  // Get category data for a specific month
  function getCategoryData(categoryId: string, monthKey: string, isMaster: boolean = false) {
    const monthData = monthsData[monthKey];
    if (!monthData) return { budgeted: 0, activity: 0, available: 0 };
    
    if (isMaster) {
      const mc = monthData.masterCategories?.find(m => m.masterCategoryId === categoryId);
      return mc || { budgeted: 0, activity: 0, available: 0 };
    }
    
    for (const master of (monthData.masterCategories || [])) {
      const cat = master.categories?.find(c => c.categoryId === categoryId);
      if (cat) return cat;
    }
    
    return { budgeted: 0, activity: 0, available: 0 };
  }

  // Get transactions for selected category/month
  const selectedTransactions = $derived.by(() => {
    if (!selection || !$rawTransactions) return [];
    
    const { type, id, monthKey } = selection;
    
    // Get all category IDs to filter
    let categoryIds: string[] = [];
    if (type === 'master') {
      const master = categoryStructure.find(m => m.id === id);
      if (master) {
        categoryIds = master.subCategories.map(c => c.id);
      }
    } else {
      categoryIds = [id];
    }
    
    // Filter transactions by month and category
    const result: Array<{
      entityId: string;
      date: string;
      amount: number;
      payeeId: string | null;
      accountId: string;
      memo: string;
      isSplit?: boolean;
      transferAccountId?: string;
    }> = [];
    
    $rawTransactions.forEach(tx => {
      if (tx.isTombstone || !tx.date || !tx.date.startsWith(monthKey)) return;
      
      // Handle split transactions
      if (tx.subTransactions?.length) {
        tx.subTransactions.forEach(split => {
          if (split.categoryId && categoryIds.includes(split.categoryId)) {
            result.push({
              entityId: tx.entityId,
              date: tx.date,
              amount: split.amount || 0,
              payeeId: null,
              accountId: '',
              memo: '',
              isSplit: true
            });
          }
        });
      } else if (tx.categoryId && categoryIds.includes(tx.categoryId)) {
        result.push({
          entityId: tx.entityId,
          date: tx.date,
          amount: tx.amount,
          payeeId: null,
          accountId: '',
          memo: ''
        });
      }
    });
    
    return result.sort((a, b) => b.date.localeCompare(a.date));
  });

  // Navigation
  function navigateMonth(direction: number) {
    let newMonth = centerMonth + direction;
    if (newMonth < 0) {
      selectedYear -= 1;
      centerMonth = 11;
    } else if (newMonth > 11) {
      selectedYear += 1;
      centerMonth = 0;
    } else {
      centerMonth = newMonth;
    }
    
    // Update the global selectedMonth store
    const key = `${selectedYear}-${String(centerMonth + 1).padStart(2, '0')}`;
    selectedMonth.set(key);
  }

  function toggleMaster(masterId: string, e?: Event) {
    e?.stopPropagation();
    const next = new Set(expandedMasters);
    if (next.has(masterId)) {
      next.delete(masterId);
    } else {
      next.add(masterId);
    }
    expandedMasters = next;
  }

  function handleCellClick(type: 'category' | 'master', id: string, monthKey: string, name: string, e?: Event) {
    e?.stopPropagation();
    
    if (selection?.type === type && selection?.id === id && selection?.monthKey === monthKey) {
      selection = null;
      showTransactions = false;
    } else {
      selection = { type, id, monthKey, name };
      showTransactions = true;
    }
  }

  function closePanel() {
    showTransactions = false;
    selection = null;
  }

  // Start editing a budgeted amount
  function startBudgetEdit(categoryId: string, monthKey: string, currentBudgeted: number, e?: Event) {
    e?.stopPropagation();
    
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Enable edit mode to modify budget' });
      return;
    }
    
    editingBudget = {
      categoryId,
      monthKey,
      currentBudgeted,
      inputValue: currentBudgeted === 0 ? '' : currentBudgeted.toFixed(2)
    };
  }

  function cancelBudgetEdit() {
    editingBudget = null;
  }

  function saveBudgetEdit() {
    if (!editingBudget) return;
    
    const newAmount = parseFloat(editingBudget.inputValue) || 0;
    const { categoryId, monthKey, currentBudgeted } = editingBudget;
    
    if (newAmount === currentBudgeted) {
      cancelBudgetEdit();
      return;
    }
    
    const client = $budgetInfo.client;
    if (!client) {
      addToast({ type: 'error', message: 'No budget loaded' });
      cancelBudgetEdit();
      return;
    }
    
    try {
      // Update the monthly budget through the client
      // For now, track as pending change; actual write will happen on sync
      addPendingChange({
        type: 'budget',
        action: 'update',
        entityId: `${monthKey}-${categoryId}`,
        entityName: `Budget for ${monthKey}`,
        data: {
          categoryId,
          monthKey,
          budgeted: newAmount,
          previousBudgeted: currentBudgeted
        }
      });
      
      addToast({ type: 'success', message: 'Budget updated' });
      cancelBudgetEdit();
    } catch (error) {
      console.error('Failed to update budget:', error);
      addToast({ type: 'error', message: 'Failed to update budget' });
    }
  }

  function handleBudgetKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cancelBudgetEdit();
    } else if (e.key === 'Enter') {
      saveBudgetEdit();
    }
  }

  // Formatting functions
  function formatAmount(amount: number): string {
    if (amount === 0 || Math.abs(amount) < 0.01) return '';
    const absAmount = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    
    let formatted: string;
    if (absAmount >= 100000) {
      formatted = Math.round(absAmount / 1000) + 'K';
    } else if (absAmount >= 1000) {
      formatted = Math.round(absAmount).toLocaleString();
    } else if (absAmount >= 100) {
      formatted = Math.round(absAmount).toString();
    } else {
      formatted = absAmount.toFixed(2);
    }
    
    return sign + formatted;
  }

  function formatAmountFull(amount: number, showSign: boolean = false): string {
    if (amount === 0 || Math.abs(amount) < 0.01) return '0.00';
    const formatted = Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    if (showSign) {
      return amount < 0 ? `-${formatted}` : `+${formatted}`;
    }
    return amount < 0 ? `-${formatted}` : formatted;
  }

  function getBalanceClass(amount: number): string {
    const threshold = 0.01;
    if (Math.abs(amount || 0) < threshold) return 'zero';
    if (amount < 0) return 'negative';
    if (amount > 0) return 'positive';
    return 'zero';
  }

  function isNearZero(amount: number): boolean {
    return Math.abs(amount || 0) < 0.01;
  }

  function getMonthName(monthKey: string): string {
    if (!monthKey) return '';
    const [year, month] = monthKey.split('-');
    return `${monthsLong[parseInt(month) - 1]} ${year}`;
  }

  function isCellSelected(type: string, id: string, monthKey: string): boolean {
    return selection?.type === type && selection?.id === id && selection?.monthKey === monthKey;
  }

  // Sync scroll between categories and data
  let categoriesRef: HTMLDivElement;
  let dataRef: HTMLDivElement;

  function handleCategoriesScroll(e: Event) {
    if (dataRef) {
      dataRef.scrollTop = (e.target as HTMLDivElement).scrollTop;
    }
  }

  function handleDataScroll(e: Event) {
    if (categoriesRef) {
      categoriesRef.scrollTop = (e.target as HTMLDivElement).scrollTop;
    }
  }

  // Responsive: adjust visible months based on width
  $effect(() => {
    function updateVisibleMonths() {
      if ($isMobile) {
        visibleMonths = 1;
      } else {
        const width = window.innerWidth;
        const panelAdjustment = showTransactions ? 350 : 0;
        const availableWidth = width - 200 - panelAdjustment; // 200 = categories column width
        const monthWidth = 270;
        visibleMonths = Math.max(2, Math.min(5, Math.floor(availableWidth / monthWidth)));
      }
    }
    
    updateVisibleMonths();
    window.addEventListener('resize', updateVisibleMonths);
    return () => window.removeEventListener('resize', updateVisibleMonths);
  });

  // Initialize expanded masters
  $effect(() => {
    if (allCategoryStructure.length > 0 && expandedMasters.size === 0) {
      expandedMasters = new Set(allCategoryStructure.map(m => m.id));
    }
  });
</script>

<div class="budget-view" class:with-panel={showTransactions} class:mobile-view={$isMobile}>
  <!-- Navigation Bar -->
  <div class="budget-nav-bar">
    {#if $isMobile}
      <div class="budget-nav-mobile">
        <button class="nav-arrow-lg" onclick={() => navigateMonth(-1)}>‹</button>
        <div class="current-month-display">
          <span class="month-name">{monthsLong[centerMonth]}</span>
          <span class="year-name">{selectedYear}</span>
        </div>
        <button class="nav-arrow-lg" onclick={() => navigateMonth(1)}>›</button>
      </div>
    {:else}
      <div class="budget-nav-years">
        {#each yearsWithData as year}
          <button
            class="year-btn"
            class:active={selectedYear === year}
            onclick={() => selectedYear = year}
          >
            {year}
          </button>
        {/each}
      </div>
      
      <div class="budget-nav-months">
        <button class="nav-arrow" onclick={() => navigateMonth(-1)}>
          <ChevronLeft class="h-4 w-4" />
        </button>
        {#each monthsShort as name, idx}
          <button
            class="month-btn"
            class:active={centerMonth === idx}
            onclick={() => { centerMonth = idx; selectedMonth.set(`${selectedYear}-${String(idx + 1).padStart(2, '0')}`); }}
          >
            {name}
          </button>
        {/each}
        <button class="nav-arrow" onclick={() => navigateMonth(1)}>
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>
    {/if}
  </div>

  <div class="budget-main-area">
    <!-- Main Grid -->
    <div class="budget-grid-container">
      <!-- Categories Column -->
      <div class="budget-categories-column">
        <div class="categories-header">
          <div class="header-label-row">
            <span class="header-label">{$t('budget.categories')}</span>
            <span class="category-count">
              {showOnlyActive ? categoryStats.active : categoryStats.total}
            </span>
          </div>
          <label class="active-filter-toggle">
            <input 
              type="checkbox"
              bind:checked={showOnlyActive}
            />
            <span class="toggle-label">{$t('budget.activeOnly')}</span>
          </label>
        </div>
        
        <div 
          class="budget-categories-scroll"
          bind:this={categoriesRef}
          onscroll={handleCategoriesScroll}
        >
          {#each categoryStructure as master (master.id)}
            <div class="category-group">
              <button 
                class="category-master"
                class:selected={selection?.type === 'master' && selection?.id === master.id}
                onclick={(e) => toggleMaster(master.id, e)}
              >
                <span class="expand-arrow" class:expanded={expandedMasters.has(master.id)}>▸</span>
                <span class="master-name">{master.name}</span>
              </button>
              
              {#if expandedMasters.has(master.id)}
                {#each master.subCategories as sub (sub.id)}
                  <div 
                    class="category-sub"
                    class:selected={selection?.type === 'category' && selection?.id === sub.id}
                  >
                    <span class="sub-name">{sub.name}</span>
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Data Columns -->
      <div class="budget-data-columns">
        <div class="budget-months-header">
          {#each monthRange as { month, year, key }}
            <div class="month-header-group">
              <div class="month-title">
                {monthsShort[month]} {year}
              </div>
              <div class="month-columns">
                <span class="col-header">PRES</span>
                <span class="col-header">GAST</span>
                <span class="col-header">SALDO</span>
              </div>
            </div>
          {/each}
        </div>
        
        <div 
          class="budget-data-scroll"
          bind:this={dataRef}
          onscroll={handleDataScroll}
        >
          {#each categoryStructure as master (master.id)}
            <div class="data-group">
              <!-- Master Row -->
              <div class="data-row master-row" class:selected-row={selection?.type === 'master' && selection?.id === master.id}>
                {#each monthRange as { key }}
                  {@const data = getCategoryData(master.id, key, true)}
                  {@const isSelected = isCellSelected('master', master.id, key)}
                  <button 
                    class="month-data"
                    class:selected={isSelected}
                    onclick={(e) => handleCellClick('master', master.id, key, master.name, e)}
                  >
                    <span class="cell budgeted">{formatAmount(data.budgeted)}</span>
                    <span class="cell outflows" class:negative={!isNearZero(data.activity) && data.activity < 0}>
                      {formatAmount(data.activity)}
                    </span>
                    <span class="cell balance {getBalanceClass(data.available)}">
                      {formatAmount(data.available)}
                    </span>
                  </button>
                {/each}
              </div>
              
              <!-- Subcategory Rows -->
              {#if expandedMasters.has(master.id)}
                {#each master.subCategories as sub (sub.id)}
                  <div class="data-row sub-row" class:selected-row={selection?.type === 'category' && selection?.id === sub.id}>
                    {#each monthRange as { key }}
                      {@const data = getCategoryData(sub.id, key, false)}
                      {@const isSelected = isCellSelected('category', sub.id, key)}
                      <button 
                        class="month-data"
                        class:selected={isSelected}
                        onclick={(e) => handleCellClick('category', sub.id, key, sub.name, e)}
                      >
                        {#if editingBudget?.categoryId === sub.id && editingBudget?.monthKey === key}
                          <span class="cell budgeted editing">
                            <input
                              type="text"
                              class="budget-input"
                              bind:value={editingBudget.inputValue}
                              onkeydown={handleBudgetKeydown}
                              onblur={saveBudgetEdit}
                            />
                          </span>
                        {:else}
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <span 
                            class="cell budgeted"
                            class:editable={$isEditMode}
                            ondblclick={(e) => { if ($isEditMode) { e.stopPropagation(); startBudgetEdit(sub.id, key, data.budgeted, e); } }}
                          >{formatAmount(data.budgeted)}</span>
                        {/if}
                        <span class="cell outflows" class:negative={!isNearZero(data.activity) && data.activity < 0}>
                          {formatAmount(data.activity)}
                        </span>
                        <span class="cell balance {getBalanceClass(data.available)}">
                          {formatAmount(data.available)}
                        </span>
                      </button>
                    {/each}
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Transactions Panel -->
    {#if showTransactions && selection}
      <div class="budget-transactions-panel">
        <div class="tx-panel-header">
          <div class="tx-panel-title">
            <h3>{selection.name}</h3>
            <span class="tx-panel-month">{getMonthName(selection.monthKey)}</span>
          </div>
          <button class="tx-panel-close" onclick={closePanel}>
            <X class="h-5 w-5" />
          </button>
        </div>
        
        {#if selection}
          {@const data = getCategoryData(selection.id, selection.monthKey, selection.type === 'master')}
          <div class="tx-panel-summary">
            <div class="summary-item">
              <span class="label">{$t('budget.budgeted')}</span>
              <span class="value">{formatAmountFull(data.budgeted)}</span>
            </div>
            <div class="summary-item">
              <span class="label">{$t('budget.activity')}</span>
              <span class="value {isNearZero(data.activity) ? 'zero' : (data.activity < 0 ? 'negative' : 'positive')}">
                {formatAmountFull(data.activity, true)}
              </span>
            </div>
            <div class="summary-item highlight">
              <span class="label">{$t('budget.balance')}</span>
              <span class="value {getBalanceClass(data.available)}">
                {formatAmountFull(data.available)}
              </span>
            </div>
          </div>
        {/if}
        
        <div class="tx-panel-list">
          {#if selectedTransactions.length === 0}
            <div class="no-transactions">
              {$t('budget.noTransactions')}
            </div>
          {:else}
            <table class="tx-mini-table">
              <thead>
                <tr>
                  <th>{$t('transactions.date')}</th>
                  <th class="col-amount">{$t('transactions.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {#each selectedTransactions as tx, idx (tx.entityId + '-' + idx)}
                  <tr class:split={tx.isSplit}>
                    <td class="col-date">{tx.date}</td>
                    <td class="col-amount {isNearZero(tx.amount) ? 'zero' : (tx.amount < 0 ? 'negative' : 'positive')}">
                      {formatAmountFull(tx.amount, true)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
        
        <div class="tx-panel-footer">
          <span class="tx-count">
            {selectedTransactions.length} {$t('budget.transactions')}
          </span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .budget-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
    overflow: hidden;
  }

  /* Navigation Bar */
  .budget-nav-bar {
    flex-shrink: 0;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }

  .budget-nav-years {
    display: flex;
    gap: 0;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    background: var(--muted);
  }

  .year-btn {
    padding: 0.4rem 0.75rem;
    border: none;
    background: transparent;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .year-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .year-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .budget-nav-months {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0.375rem 0.5rem;
    overflow-x: auto;
  }

  .nav-arrow {
    padding: 0.375rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-arrow:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .month-btn {
    padding: 0.375rem 0.625rem;
    border: none;
    background: transparent;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
    white-space: nowrap;
    text-transform: uppercase;
  }

  .month-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .month-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  /* Main Area */
  .budget-main-area {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .budget-grid-container {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  /* Categories Column */
  .budget-categories-column {
    flex-shrink: 0;
    width: 200px;
    min-width: 160px;
    max-width: 280px;
    display: flex;
    flex-direction: column;
    background: var(--card);
    border-right: 2px solid var(--border);
  }

  .categories-header {
    padding: 0.5rem 0.75rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    height: 60px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .header-label-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .category-count {
    font-size: 0.65rem;
    font-weight: 500;
    color: var(--muted-foreground);
    background: var(--background);
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
  }

  .active-filter-toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    font-size: 0.65rem;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
  }

  .active-filter-toggle input {
    width: 12px;
    height: 12px;
    cursor: pointer;
    accent-color: var(--primary);
  }

  .toggle-label {
    color: var(--muted-foreground);
  }

  .budget-categories-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Category Groups */
  .category-group {
    border-bottom: 1px solid var(--border);
  }

  .category-master {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.5rem 0.5rem 0.25rem;
    background: var(--muted);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--foreground);
    transition: background 0.15s;
    height: 32px;
    box-sizing: border-box;
    width: 100%;
    border: none;
    text-align: left;
  }

  .category-master:hover {
    background: var(--accent);
  }

  .category-master.selected {
    background: var(--primary) !important;
    color: var(--primary-foreground) !important;
  }

  .expand-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    font-size: 0.65rem;
    color: var(--muted-foreground);
    transition: transform 0.15s;
    flex-shrink: 0;
  }

  .expand-arrow.expanded {
    transform: rotate(90deg);
  }

  .master-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .category-sub {
    display: flex;
    align-items: center;
    padding: 0.375rem 0.5rem 0.375rem 1.5rem;
    font-size: 0.8rem;
    color: var(--foreground);
    height: 28px;
    box-sizing: border-box;
  }

  .category-sub:hover {
    background: var(--accent);
  }

  .category-sub.selected {
    background: var(--primary) !important;
    color: var(--primary-foreground) !important;
  }

  .sub-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Data Columns */
  .budget-data-columns {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .budget-months-header {
    display: flex;
    flex-shrink: 0;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    height: 60px;
  }

  .month-header-group {
    flex: 0 0 auto;
    width: 270px;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
  }

  .month-title {
    padding: 0.375rem 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--foreground);
    text-align: center;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }

  .month-columns {
    display: flex;
    flex: 1;
  }

  .col-header {
    flex: 1;
    padding: 0.125rem 0.25rem;
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0;
    color: var(--muted-foreground);
    text-align: right;
    white-space: nowrap;
  }

  .budget-data-scroll {
    flex: 1;
    overflow: auto;
  }

  .data-group {
    border-bottom: 1px solid var(--border);
  }

  .data-row {
    display: flex;
    height: 32px;
  }

  .data-row.master-row {
    background: var(--muted);
    font-weight: 600;
  }

  .data-row.sub-row {
    height: 28px;
  }

  .data-row:hover {
    background: var(--accent);
  }

  .data-row.master-row:hover {
    background: var(--accent);
  }

  .data-row.selected-row {
    background: rgba(59, 130, 246, 0.1) !important;
  }

  .month-data {
    flex: 0 0 auto;
    width: 270px;
    min-width: 220px;
    display: flex;
    align-items: center;
    border-right: 1px solid var(--border);
    cursor: pointer;
    border: none;
    background: transparent;
    padding: 0;
    transition: background 0.15s;
  }

  .month-data:hover {
    background: var(--accent);
  }

  .month-data.selected {
    background: var(--primary);
  }

  .month-data.selected .cell {
    color: var(--primary-foreground) !important;
  }

  .cell {
    flex: 1;
    padding: 0 0.25rem;
    text-align: right;
    font-size: 0.65rem;
    font-family: var(--font-family-mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    min-width: 0;
    color: var(--foreground);
  }

  .cell.outflows {
    color: var(--muted-foreground);
  }

  .cell.outflows.negative {
    color: var(--destructive);
  }

  .cell.balance {
    font-weight: 500;
  }

  .cell.balance.positive {
    color: var(--success);
  }

  .cell.balance.negative {
    color: var(--destructive);
    background: rgba(220, 38, 38, 0.08);
  }

  .cell.balance.zero {
    color: var(--muted-foreground);
  }

  /* Editable Budget Cells */
  .cell.budgeted.editable {
    cursor: pointer;
  }

  .cell.budgeted.editable:hover {
    background: rgba(59, 130, 246, 0.1);
    border-radius: 2px;
  }

  .cell.budgeted.editing {
    padding: 0;
  }

  .budget-input {
    width: 100%;
    padding: 0 4px;
    background: var(--background);
    border: 1px solid var(--primary);
    border-radius: 2px;
    font-size: 0.65rem;
    font-family: var(--font-family-mono);
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: var(--foreground);
    outline: none;
  }

  .budget-input:focus {
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
  }

  /* Transactions Panel */
  .budget-transactions-panel {
    width: 350px;
    min-width: 300px;
    background: var(--card);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tx-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0.75rem 1rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .tx-panel-title h3 {
    margin: 0 0 0.25rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .tx-panel-month {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .tx-panel-close {
    background: none;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    line-height: 1;
    padding: 0.25rem;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .tx-panel-close:hover {
    color: var(--foreground);
    background: var(--accent);
  }

  .tx-panel-summary {
    display: flex;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--card);
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .summary-item .label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted-foreground);
  }

  .summary-item .value {
    font-size: 0.85rem;
    font-weight: 600;
    font-family: var(--font-family-mono);
    color: var(--foreground);
  }

  .summary-item .value.positive {
    color: var(--success);
  }

  .summary-item .value.negative {
    color: var(--destructive);
  }

  .summary-item .value.zero {
    color: var(--muted-foreground);
  }

  .summary-item.highlight {
    padding: 0.375rem 0.5rem;
    background: var(--muted);
    border-radius: 4px;
    margin-left: auto;
  }

  .tx-panel-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .no-transactions {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 120px;
    color: var(--muted-foreground);
    font-size: 0.85rem;
  }

  .tx-mini-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .tx-mini-table th {
    text-align: left;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--muted-foreground);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .tx-mini-table td {
    padding: 0.5rem;
    border-bottom: 1px solid var(--border);
    color: var(--foreground);
  }

  .tx-mini-table tr:hover td {
    background: var(--accent);
  }

  .tx-mini-table tr.split td {
    background: var(--muted);
  }

  .tx-mini-table .col-date {
    width: 75px;
    font-family: var(--font-family-mono);
    font-size: 0.7rem;
    color: var(--muted-foreground);
    white-space: nowrap;
  }

  .tx-mini-table th.col-amount,
  .tx-mini-table .col-amount {
    text-align: right;
    font-family: var(--font-family-mono);
    width: 80px;
    font-weight: 500;
  }

  .tx-mini-table .col-amount.positive {
    color: var(--success);
  }

  .tx-mini-table .col-amount.negative {
    color: var(--destructive);
  }

  .tx-mini-table .col-amount.zero {
    color: var(--muted-foreground);
  }

  .tx-panel-footer {
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--muted);
  }

  .tx-count {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  /* Mobile Navigation */
  .budget-nav-mobile {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--card);
  }

  .nav-arrow-lg {
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    font-size: 1.75rem;
    font-weight: 300;
    color: var(--primary);
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.15s;
    line-height: 1;
  }

  .nav-arrow-lg:hover {
    background: var(--accent);
  }

  .current-month-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    cursor: pointer;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    transition: background 0.15s;
  }

  .current-month-display:hover {
    background: var(--accent);
  }

  .current-month-display .month-name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--foreground);
    text-transform: capitalize;
  }

  .current-month-display .year-name {
    font-size: 0.85rem;
    color: var(--muted-foreground);
  }

  /* Mobile View */
  .budget-view.mobile-view .budget-categories-column {
    width: 45%;
    min-width: 120px;
    max-width: 180px;
  }

  .budget-view.mobile-view .month-header-group,
  .budget-view.mobile-view .month-data {
    width: 100%;
    min-width: unset;
    flex: 1;
  }

  .budget-view.mobile-view .budget-data-columns {
    flex: 1;
  }

  .budget-view.mobile-view .budget-data-scroll {
    overflow-x: hidden;
  }

  .budget-view.mobile-view .month-title {
    display: none;
  }

  .budget-view.mobile-view.with-panel .budget-grid-container {
    display: none;
  }

  .budget-view.mobile-view .budget-transactions-panel {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    z-index: 100;
    border-radius: 0;
    border-left: none;
  }

  /* Scrollbars */
  .budget-categories-scroll::-webkit-scrollbar,
  .budget-data-scroll::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .budget-categories-scroll::-webkit-scrollbar-track,
  .budget-data-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .budget-categories-scroll::-webkit-scrollbar-thumb,
  .budget-data-scroll::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }

  .budget-categories-scroll::-webkit-scrollbar-thumb:hover,
  .budget-data-scroll::-webkit-scrollbar-thumb:hover {
    background: var(--muted-foreground);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .budget-categories-column {
      width: 140px;
      min-width: 120px;
    }
    
    .month-header-group,
    .month-data {
      width: 210px;
      min-width: 180px;
    }
    
    .category-master {
      font-size: 0.75rem;
      padding: 0.375rem 0.25rem;
    }
    
    .category-sub {
      font-size: 0.75rem;
      padding-left: 1rem;
    }
    
    .cell {
      font-size: 0.7rem;
      padding: 0 0.25rem;
    }
  }

  @media (max-width: 480px) {
    .budget-categories-column {
      width: 100px;
      min-width: 80px;
    }
    
    .month-header-group,
    .month-data {
      width: 150px;
      min-width: 120px;
    }
    
    .col-header {
      font-size: 0.55rem;
    }
    
    .budget-view.with-panel .budget-grid-container {
      display: none;
    }
    
    .budget-transactions-panel {
      width: 100%;
      min-width: 100%;
    }
  }
</style>
