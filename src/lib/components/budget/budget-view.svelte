<script lang="ts">
  import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, ChevronsDownUp, ChevronsUpDown } from 'lucide-svelte';
  import { MonthlyBudgetCalculator } from 'ynab-library';
  import { 
    rawTransactions, 
    transactions,
    monthlyBudgets, 
    rawCategories, 
    rawMasterCategories,
    accounts,
    payees,
    selectedMonth,
    budgetInfo
  } from '$lib/stores/budget';
  import { isMobile, isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { t, tArray } from '$lib/i18n';

  // Initialize calculator
  const budgetCalculator = new MonthlyBudgetCalculator();

  // Month navigation state
  const currentDate = new Date();
  let selectedYear = $state(currentDate.getFullYear());
  let centerMonth = $state(currentDate.getMonth());
  let baseVisibleMonths = $state(4);
  // visibleMonths is derived from baseVisibleMonths (which is responsive)
  const visibleMonths = $derived(baseVisibleMonths);
  // Category filter: 'active' (with activity in visible months), 'open' (not hidden), 'all'
  let categoryFilter = $state<'active' | 'open' | 'all'>('active');
  let showSummary = $state(true);
  
  // View mode: 'budget' (normal budget view) or 'spending' (income/expenses only)
  let viewMode = $state<'budget' | 'spending'>('budget');
  
  // Expansion state
  let expandedMasters = $state<Set<string>>(new Set());
  let userManuallyChangedExpansion = $state(false);
  
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
  const monthsShort = $derived($tArray('months.short'));
  const monthsLong = $derived($tArray('months.long'));

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

  // When there's a selection, show only that month
  const displayMonthRange = $derived.by(() => {
    if (showTransactions && selection) {
      // Parse the selected month key
      const [year, month] = selection.monthKey.split('-').map(Number);
      return [{ month: month - 1, year, key: selection.monthKey }];
    }
    return monthRange;
  });

  // Check if we're in single month mode (selection active)
  const isSingleMonthMode = $derived(showTransactions && selection !== null);

  // Get years with data - primarily from transactions, limited range from budgets
  const yearsWithData = $derived.by(() => {
    const transactionYears = new Set<number>();
    const budgetYears = new Set<number>();
    const thisYear = currentDate.getFullYear();
    
    // Get years from actual transactions
    $rawTransactions?.forEach(tx => {
      if (tx.date) {
        const year = parseInt(tx.date.slice(0, 4));
        if (!isNaN(year) && year > 1990 && year < 2100) {
          transactionYears.add(year);
        }
      }
    });
    
    // Get years from monthly budgets (but limit to sensible range)
    $monthlyBudgets?.forEach(mb => {
      const monthStr = mb.month || '';
      if (monthStr && monthStr.match(/^\d{4}-\d{2}/)) {
        const year = parseInt(monthStr.slice(0, 4));
        // Only include budget years within 2 years of transaction data or current year
        if (!isNaN(year) && year > 1990 && year <= thisYear + 2) {
          budgetYears.add(year);
        }
      }
    });
    
    // Combine: all transaction years + budget years within sensible range
    const years = new Set([...transactionYears, ...budgetYears]);
    
    if (years.size === 0) {
      years.add(thisYear);
    }
    
    return Array.from(years).sort((a, b) => b - a);
  });

  // Calculate budget data for all visible months
  const monthsData = $derived.by(() => {
    const subCategories = $rawCategories?.filter(c => !c.isTombstone) || [];
    const masters = $rawMasterCategories?.filter(mc => !mc.isTombstone) || [];
    
    if (!subCategories.length) return {};
    
    const data: Record<string, ReturnType<typeof budgetCalculator.calculateMonthlyBudget>> = {};
    
    // Prepare account data for the calculator
    const accountData = ($accounts || []).map(a => ({
      entityId: a.entityId,
      onBudget: a.onBudget,
      isTombstone: a.isTombstone
    }));
    
    monthRange.forEach(({ key }) => {
      try {
        data[key] = budgetCalculator.calculateMonthlyBudget(
          key,
          $rawTransactions || [],
          $monthlyBudgets || [],
          subCategories,
          masters,
          accountData
        );
      } catch (err) {
        console.error(`[BudgetView] Error calculating ${key}:`, err);
        data[key] = { 
          month: key, 
          totalBudgeted: 0, 
          totalActivity: 0, 
          totalCarryover: 0, 
          totalAvailable: 0, 
          masterCategories: [],
          income: 0,
          fromLastMonth: 0,
          lastMonthOverspent: 0,
          deferredIncome: 0,
          availableToBudget: 0
        };
      }
    });
    
    return data;
  });

  // Get current month's summary for the header
  const currentMonthKey = $derived(`${selectedYear}-${String(centerMonth + 1).padStart(2, '0')}`);
  const currentMonthSummary = $derived.by(() => {
    const data = monthsData[currentMonthKey];
    
    // Debug logging
    if (data) {
      // Formula: fromLastMonth + lastMonthOverspent + income + deferredIncome - totalBudgeted = ATB
      const deferredIncome = data.deferredIncome || 0;
      const calculatedATB = data.fromLastMonth + data.lastMonthOverspent + data.income + deferredIncome - data.totalBudgeted;
      
      console.log(`[Budget Debug] ${currentMonthKey}:`, {
        fromLastMonth: data.fromLastMonth,
        lastMonthOverspent: data.lastMonthOverspent,
        income: data.income,
        deferredIncome: deferredIncome,
        totalBudgeted: data.totalBudgeted,
        availableToBudget: data.availableToBudget,
        formula: `${data.fromLastMonth} + ${data.lastMonthOverspent} + ${data.income} + ${deferredIncome} - ${data.totalBudgeted} = ${calculatedATB}`,
        match: Math.abs(calculatedATB - data.availableToBudget) < 0.01 ? '✓' : '✗ MISMATCH!'
      });
    }
    
    if (!data) {
      return {
        income: 0,
        deferredIncome: 0,
        fromLastMonth: 0,
        lastMonthOverspent: 0,
        totalBudgeted: 0,
        availableToBudget: 0
      };
    }
    return {
      income: data.income || 0,
      deferredIncome: data.deferredIncome || 0,
      fromLastMonth: data.fromLastMonth || 0,
      lastMonthOverspent: data.lastMonthOverspent || 0,
      totalBudgeted: data.totalBudgeted || 0,
      availableToBudget: data.availableToBudget || 0
    };
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

  // === SPENDING MODE DATA ===
  
  // Set of on-budget account IDs for quick lookup
  const onBudgetAccountIds = $derived(
    new Set(($accounts || []).filter(a => a.onBudget && !a.isTombstone).map(a => a.entityId))
  );

  // Helper to check if transaction should be excluded from spending report
  // Returns true if it's a transfer BETWEEN on-budget accounts (just moves money, not real income/expense)
  // Returns false if it's a transfer TO/FROM off-budget account (real income/expense)
  function isInternalTransfer(tx: { transferAccountId?: string | null }): boolean {
    if (!tx.transferAccountId) return false;
    // If transfer target is ON-budget, it's internal (exclude)
    // If transfer target is OFF-budget, it's a real expense/income (include)
    return onBudgetAccountIds.has(tx.transferAccountId);
  }

  // Calculate income by payee for spending mode
  const incomeByPayee = $derived.by(() => {
    if (viewMode !== 'spending') return [];
    
    const byPayee = new Map<string, { 
      payeeId: string; 
      payeeName: string; 
      total: number;
      byMonth: Record<string, number>;
    }>();
    
    $transactions?.forEach(tx => {
      if (!tx.date || tx.amount <= 0) return;
      // Only exclude transfers between on-budget accounts
      if (isInternalTransfer(tx)) return;
      
      const monthKey = tx.date.substring(0, 7);
      if (!displayMonthRange.some(m => m.key === monthKey)) return;
      
      const payeeId = tx.payeeId || 'unknown';
      const payeeName = tx.payee || $payees?.find(p => p.entityId === payeeId)?.name || 'Sin Beneficiario';
      
      if (!byPayee.has(payeeId)) {
        byPayee.set(payeeId, { payeeId, payeeName, total: 0, byMonth: {} });
      }
      
      const data = byPayee.get(payeeId)!;
      data.total += tx.amount;
      data.byMonth[monthKey] = (data.byMonth[monthKey] || 0) + tx.amount;
    });
    
    return Array.from(byPayee.values()).sort((a, b) => b.total - a.total);
  });

  // Calculate expenses by category for spending mode (simplified, no budget data)
  const expensesByCategory = $derived.by(() => {
    if (viewMode !== 'spending') return new Map<string, Record<string, number>>();
    
    const byCat = new Map<string, Record<string, number>>();
    
    $transactions?.forEach(tx => {
      if (!tx.date || tx.amount >= 0) return;
      // Only exclude transfers between on-budget accounts
      if (isInternalTransfer(tx)) return;
      
      const monthKey = tx.date.substring(0, 7);
      if (!displayMonthRange.some(m => m.key === monthKey)) return;
      
      // Handle split transactions
      if (tx.subTransactions && tx.subTransactions.length > 0) {
        tx.subTransactions.forEach(sub => {
          // Also check sub-transactions for internal transfers
          if (sub.transferAccountId && onBudgetAccountIds.has(sub.transferAccountId)) return;
          
          if (sub.amount && sub.amount < 0 && sub.categoryId) {
            if (!byCat.has(sub.categoryId)) {
              byCat.set(sub.categoryId, {});
            }
            const data = byCat.get(sub.categoryId)!;
            data[monthKey] = (data[monthKey] || 0) + Math.abs(sub.amount);
          }
        });
      } else if (tx.categoryId) {
        if (!byCat.has(tx.categoryId)) {
          byCat.set(tx.categoryId, {});
        }
        const data = byCat.get(tx.categoryId)!;
        data[monthKey] = (data[monthKey] || 0) + Math.abs(tx.amount);
      }
    });
    
    return byCat;
  });

  // Get expense for category in month (spending mode)
  function getExpenseForMonth(categoryId: string, monthKey: string): number {
    const catData = expensesByCategory.get(categoryId);
    return catData?.[monthKey] || 0;
  }

  // Get income totals per month
  const incomeTotalsByMonth = $derived.by(() => {
    const totals: Record<string, number> = {};
    displayMonthRange.forEach(({ key }) => {
      totals[key] = incomeByPayee.reduce((sum, p) => sum + (p.byMonth[key] || 0), 0);
    });
    return totals;
  });

  // Get expense totals per month
  const expenseTotalsByMonth = $derived.by(() => {
    const totals: Record<string, number> = {};
    displayMonthRange.forEach(({ key }) => {
      let sum = 0;
      expensesByCategory.forEach((byMonth) => {
        sum += byMonth[key] || 0;
      });
      totals[key] = sum;
    });
    return totals;
  });

  // Get net totals for spending mode
  const totalIncomeAll = $derived(Object.values(incomeTotalsByMonth).reduce((a, b) => a + b, 0));
  const totalExpensesAll = $derived(Object.values(expenseTotalsByMonth).reduce((a, b) => a + b, 0));
  const totalNetAll = $derived(totalIncomeAll - totalExpensesAll);

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

  // Check if category has activity in the visible months
  // Activity = budgeted OR spent (not just balance from previous months)
  function hasActivityInVisibleMonths(categoryId: string, isMaster: boolean): boolean {
    const monthsToCheck = isSingleMonthMode && selection ? [selection.monthKey] : displayMonthRange.map(m => m.key);
    
    for (const monthKey of monthsToCheck) {
      const data = getCategoryData(categoryId, monthKey, isMaster);
      // Only consider budgeted and activity (spending), NOT balance
      // Balance alone doesn't mean the category is "active" this month
      if (data.budgeted !== 0 || data.activity !== 0) {
        return true;
      }
    }
    return false;
  }

  // Filter categories based on categoryFilter
  const categoryStructure = $derived.by(() => {
    if (categoryFilter === 'all') return allCategoryStructure;
    
    if (categoryFilter === 'open') {
      // Show all non-hidden categories
      return allCategoryStructure
        .map(master => ({
          ...master,
          subCategories: master.subCategories.filter(sub => sub.isActive)
        }))
        .filter(master => master.subCategories.length > 0);
    }
    
    // 'active' - only categories with activity in visible months
    return allCategoryStructure
      .map(master => ({
        ...master,
        subCategories: master.subCategories.filter(sub => 
          sub.isActive && hasActivityInVisibleMonths(sub.id, false)
        )
      }))
      .filter(master => master.subCategories.length > 0 || hasActivityInVisibleMonths(master.id, true));
  });

  // Category statistics
  const categoryStats = $derived.by(() => {
    const totalSubs = allCategoryStructure.reduce((sum, m) => sum + m.subCategories.length, 0);
    const openSubs = allCategoryStructure.reduce(
      (sum, m) => sum + m.subCategories.filter(s => s.isActive).length, 
      0
    );
    const activeSubs = allCategoryStructure.reduce(
      (sum, m) => sum + m.subCategories.filter(s => s.isActive && hasActivityInVisibleMonths(s.id, false)).length, 
      0
    );
    const currentCount = categoryStructure.reduce((sum, m) => sum + m.subCategories.length, 0);
    return { total: totalSubs, open: openSubs, active: activeSubs, current: currentCount };
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

  // Get previous month key
  function getPreviousMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    if (month === 1) {
      return `${year - 1}-12`;
    }
    return `${year}-${String(month - 1).padStart(2, '0')}`;
  }

  // Get category data for previous month (balance from last month)
  function getPreviousMonthBalance(categoryId: string, monthKey: string, isMaster: boolean = false): number {
    const prevKey = getPreviousMonthKey(monthKey);
    const data = getCategoryData(categoryId, prevKey, isMaster);
    return data.available || 0;
  }

  // Get transactions for selected category/month (using full transaction store)
  const selectedTransactions = $derived.by(() => {
    if (!selection || !$transactions) return [];
    
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
      payeeName: string;
      accountName: string;
      memo: string;
      flag: string | null;
      isSplit?: boolean;
      cleared: string;
    }> = [];
    
    $transactions.forEach(tx => {
      if (!tx.date || !tx.date.startsWith(monthKey)) return;
      
      // Handle split transactions
      if (tx.subTransactions?.length) {
        tx.subTransactions.forEach(split => {
          if (split.categoryId && categoryIds.includes(split.categoryId)) {
            result.push({
              entityId: tx.entityId,
              date: tx.date,
              amount: split.amount || 0,
              payeeName: tx.payee || '',
              accountName: tx.accountName || '',
              memo: split.memo || tx.memo || '',
              flag: tx.flag || null,
              isSplit: true,
              cleared: tx.cleared || ''
            });
          }
        });
      } else if (tx.categoryId && categoryIds.includes(tx.categoryId)) {
        result.push({
          entityId: tx.entityId,
          date: tx.date,
          amount: tx.amount,
          payeeName: tx.payee || '',
          accountName: tx.accountName || '',
          memo: tx.memo || '',
          flag: tx.flag || null,
          isSplit: false,
          cleared: tx.cleared || ''
        });
      }
    });
    
    return result.sort((a, b) => b.date.localeCompare(a.date));
  });

  // Navigation
  function navigateMonth(direction: number) {
    let newMonth = centerMonth + direction;
    let newYear = selectedYear;
    
    if (newMonth < 0) {
      newYear -= 1;
      newMonth = 11;
    } else if (newMonth > 11) {
      newYear += 1;
      newMonth = 0;
    }
    
    selectedYear = newYear;
    centerMonth = newMonth;
    
    // Update the global selectedMonth store
    const key = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
    selectedMonth.set(key);
    
    // If there's an active selection, update its month key
    if (selection) {
      selection = {
        ...selection,
        monthKey: key
      };
    }
  }

  // Set a specific month (used by month buttons)
  function setMonth(monthIndex: number) {
    centerMonth = monthIndex;
    const key = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    selectedMonth.set(key);
    
    // If there's an active selection, update its month key
    if (selection) {
      selection = {
        ...selection,
        monthKey: key
      };
    }
  }

  // Set a specific year (used by year buttons)
  function setYear(year: number) {
    selectedYear = year;
    const key = `${year}-${String(centerMonth + 1).padStart(2, '0')}`;
    selectedMonth.set(key);
    
    // If there's an active selection, update its month key
    if (selection) {
      selection = {
        ...selection,
        monthKey: key
      };
    }
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

  function expandAllCategories() {
    const allIds = allCategoryStructure.map(m => m.id).filter(Boolean) as string[];
    expandedMasters = new Set(allIds);
    userManuallyChangedExpansion = true;
  }

  function collapseAllCategories() {
    expandedMasters = new Set();
    userManuallyChangedExpansion = true;
  }

  // Check if all/none are expanded
  const allExpanded = $derived(
    allCategoryStructure.length > 0 && 
    allCategoryStructure.every(m => m.id && expandedMasters.has(m.id))
  );

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
  let dataColumnsRef: HTMLDivElement;

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

  // Responsive: adjust visible months based on actual container width
  $effect(() => {
    if (!dataColumnsRef) {
      // For mobile, also calculate based on container when available
      if ($isMobile) {
        baseVisibleMonths = 1;
      }
      return;
    }
    
    // Different min/max widths based on mode and whether transactions panel is open
    const isDetailMode = showTransactions && selection;
    let minColumnWidth: number;
    let maxColumnWidth: number;
    
    if (viewMode === 'spending') {
      // Spending mode: wider columns since only 1 value per month
      minColumnWidth = $isMobile ? 80 : (isDetailMode ? 70 : 100);
      maxColumnWidth = $isMobile ? 120 : (isDetailMode ? 120 : 180);
    } else {
      // Budget mode: need more space for 3-4 columns
      minColumnWidth = $isMobile ? 200 : (isDetailMode ? 180 : 220);
      maxColumnWidth = $isMobile ? 300 : (isDetailMode ? 300 : 380);
    }
    
    function updateVisibleMonths() {
      if (!dataColumnsRef) return;
      
      const containerWidth = dataColumnsRef.clientWidth;
      if (containerWidth === 0) return;
      
      // Calculate how many columns fit at minimum width
      const maxColumns = Math.floor(containerWidth / minColumnWidth);
      // But also don't go too wide - ensure we don't have columns wider than max
      const minColumns = Math.max(1, Math.ceil(containerWidth / maxColumnWidth));
      
      // Use optimal: prefer fitting more columns but not too small
      const optimalColumns = Math.max(minColumns, Math.min(maxColumns, 12));
      
      // On mobile, allow at least 1, on desktop at least 2
      const minimumCols = $isMobile ? 1 : 2;
      baseVisibleMonths = Math.max(minimumCols, optimalColumns);
    }
    
    const resizeObserver = new ResizeObserver(updateVisibleMonths);
    resizeObserver.observe(dataColumnsRef);
    
    updateVisibleMonths();
    
    return () => resizeObserver.disconnect();
  });

  // Initialize expanded masters (only on first load, not after user changes)
  $effect(() => {
    if (allCategoryStructure.length > 0 && expandedMasters.size === 0 && !userManuallyChangedExpansion) {
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
      <!-- Mobile View Mode Toggle -->
      <div class="view-mode-toggle mobile">
        <button 
          class="mode-btn"
          class:active={viewMode === 'budget'}
          onclick={() => viewMode = 'budget'}
        >
          {$t('budget.budgetMode')}
        </button>
        <button 
          class="mode-btn"
          class:active={viewMode === 'spending'}
          onclick={() => viewMode = 'spending'}
        >
          {$t('budget.spendingMode')}
        </button>
      </div>
    {:else}
      <div class="budget-nav-years">
        {#each yearsWithData as year}
          <button
            class="year-btn"
            class:active={selectedYear === year}
            onclick={() => setYear(year)}
          >
            {year}
          </button>
        {/each}
      </div>
      
      <div class="budget-nav-row">
        <div class="budget-nav-months">
          <button class="nav-arrow" onclick={() => navigateMonth(-1)}>
            <ChevronLeft class="h-4 w-4" />
          </button>
          {#each monthsShort as name, idx}
            <button
              class="month-btn"
              class:active={centerMonth === idx}
              onclick={() => setMonth(idx)}
            >
              {name}
            </button>
          {/each}
          <button class="nav-arrow" onclick={() => navigateMonth(1)}>
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>
        
        <!-- View Mode Toggle -->
        <div class="view-mode-toggle">
          <button 
            class="mode-btn"
            class:active={viewMode === 'budget'}
            onclick={() => viewMode = 'budget'}
          >
            {$t('budget.budgetMode')}
          </button>
          <button 
            class="mode-btn"
            class:active={viewMode === 'spending'}
            onclick={() => viewMode = 'spending'}
          >
            {$t('budget.spendingMode')}
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Budget Summary Header -->
  <div class="budget-summary-header" class:collapsed={!showSummary}>
    <button class="summary-toggle" onclick={() => showSummary = !showSummary}>
      {#if showSummary}
        <ChevronUp class="h-4 w-4" />
      {:else}
        <ChevronDown class="h-4 w-4" />
      {/if}
      <span>{showSummary ? $t('budget.hideSummary') : $t('budget.showSummary')}</span>
    </button>
    
    {#if showSummary}
      <div class="summary-content">
        <div class="summary-main">
          <div class="available-to-budget" class:negative={currentMonthSummary.availableToBudget < 0}>
            <span class="atb-label">
              {currentMonthSummary.availableToBudget >= 0 ? $t('budget.availableToBudget') : $t('budget.overbudgeted')}
            </span>
            <span class="atb-amount">
              {formatAmountFull(Math.abs(currentMonthSummary.availableToBudget))}
            </span>
          </div>
        </div>
        
        <div class="summary-breakdown">
          <div class="breakdown-row">
            <span class="breakdown-label">{$t('budget.incomeThisMonth')}</span>
            <span class="breakdown-value positive">{formatAmountFull(currentMonthSummary.income)}</span>
          </div>
          <div class="breakdown-row">
            <span class="breakdown-label">{$t('budget.fromLastMonth')}</span>
            <span class="breakdown-value" class:positive={currentMonthSummary.fromLastMonth > 0}>
              {formatAmountFull(currentMonthSummary.fromLastMonth, true)}
            </span>
          </div>
          <div class="breakdown-row">
            <span class="breakdown-label">{$t('budget.lastMonthOverspent')}</span>
            <span class="breakdown-value negative">
              {currentMonthSummary.lastMonthOverspent !== 0 ? formatAmountFull(currentMonthSummary.lastMonthOverspent) : '0.00'}
            </span>
          </div>
          <div class="breakdown-row">
            <span class="breakdown-label">{$t('budget.budgetedThisMonth')}</span>
            <span class="breakdown-value negative">
              -{formatAmountFull(currentMonthSummary.totalBudgeted)}
            </span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="budget-main-area" class:detail-mode={showTransactions && selection} class:spending-mode={viewMode === 'spending'}>
    <!-- Budget/Spending Grid -->
    <div class="budget-grid-container">
        <!-- Categories Column -->
        <div class="budget-categories-column">
        <div class="categories-header">
          <div class="header-top-row">
            <span class="header-label">{$t('budget.categories')}</span>
            <span class="category-count">{categoryStats.current}</span>
            <div class="expand-buttons">
              <button 
                class="expand-btn"
                title={$t('budget.expandAll')}
                onclick={expandAllCategories}
                disabled={allExpanded}
              >
                <ChevronsUpDown class="h-3 w-3" />
              </button>
              <button 
                class="expand-btn"
                title={$t('budget.collapseAll')}
                onclick={collapseAllCategories}
                disabled={expandedMasters.size === 0}
              >
                <ChevronsDownUp class="h-3 w-3" />
              </button>
            </div>
          </div>
          <div class="filter-toggle">
            <button 
              class="filter-btn"
              class:active={categoryFilter === 'active'}
              onclick={() => categoryFilter = 'active'}
            >
              Activas
            </button>
            <button 
              class="filter-btn"
              class:active={categoryFilter === 'open'}
              onclick={() => categoryFilter = 'open'}
            >
              Abiertas
            </button>
            <button 
              class="filter-btn"
              class:active={categoryFilter === 'all'}
              onclick={() => categoryFilter = 'all'}
            >
              Todas
            </button>
          </div>
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
      <div class="budget-data-columns" class:single-month={isSingleMonthMode} bind:this={dataColumnsRef}>
        <div class="budget-months-header">
          {#each displayMonthRange as { month, year, key }}
            <div class="month-header-group" class:single-month={isSingleMonthMode} class:spending-mode={viewMode === 'spending'}>
              <div class="month-title">
                {monthsShort[month]} {year}
              </div>
              {#if viewMode !== 'spending'}
                <div class="month-columns">
                  {#if isSingleMonthMode}
                    <span class="col-header">ANT</span>
                  {/if}
                  <span class="col-header">PRES</span>
                  <span class="col-header">GAST</span>
                  <span class="col-header">SALDO</span>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        
        <div 
          class="budget-data-scroll"
          bind:this={dataRef}
          onscroll={handleDataScroll}
        >
          {#each categoryStructure as master (master.id)}
            {@const isMasterOverspent = displayMonthRange.some(({ key }) => {
              const d = getCategoryData(master.id, key, true);
              return d.available < -0.01;
            })}
            <div class="data-group" class:overspent-group={isMasterOverspent}>
              <!-- Master Row -->
              <div class="data-row master-row" class:selected-row={selection?.type === 'master' && selection?.id === master.id}>
                {#each displayMonthRange as { key }}
                  {@const data = getCategoryData(master.id, key, true)}
                  {@const prevBalance = getPreviousMonthBalance(master.id, key, true)}
                  {@const isSelected = isCellSelected('master', master.id, key)}
                  {@const isOverspent = data.available < -0.01}
                  <button 
                    class="month-data"
                    class:selected={isSelected}
                    class:overspent={isOverspent}
                    class:single-month={isSingleMonthMode}
                    class:spending-mode={viewMode === 'spending'}
                    onclick={(e) => handleCellClick('master', master.id, key, master.name, e)}
                  >
                    {#if isSingleMonthMode && viewMode !== 'spending'}
                      <span class="cell previous {prevBalance < -0.01 ? 'negative' : (prevBalance > 0.01 ? 'positive' : '')}">
                        {formatAmount(prevBalance)}
                      </span>
                    {/if}
                    {#if viewMode !== 'spending'}
                      <span class="cell budgeted">{formatAmount(data.budgeted)}</span>
                    {/if}
                    <span class="cell outflows" class:negative={!isNearZero(data.activity) && data.activity < 0}>
                      {formatAmount(data.activity)}
                    </span>
                    {#if viewMode !== 'spending'}
                      <span class="cell balance {getBalanceClass(data.available)}">
                        {formatAmount(data.available)}
                      </span>
                    {/if}
                  </button>
                {/each}
              </div>
              
              <!-- Subcategory Rows -->
              {#if expandedMasters.has(master.id)}
                {#each master.subCategories as sub (sub.id)}
                  {@const isSubOverspent = displayMonthRange.some(({ key }) => {
                    const d = getCategoryData(sub.id, key, false);
                    return d.available < -0.01;
                  })}
                  <div class="data-row sub-row" class:selected-row={selection?.type === 'category' && selection?.id === sub.id} class:overspent-row={isSubOverspent}>
                    {#each displayMonthRange as { key }}
                      {@const data = getCategoryData(sub.id, key, false)}
                      {@const prevBalance = getPreviousMonthBalance(sub.id, key, false)}
                      {@const isSelected = isCellSelected('category', sub.id, key)}
                      {@const isOverspent = data.available < -0.01}
                      <button 
                        class="month-data"
                        class:selected={isSelected}
                        class:overspent={isOverspent}
                        class:single-month={isSingleMonthMode}
                        class:spending-mode={viewMode === 'spending'}
                        onclick={(e) => handleCellClick('category', sub.id, key, sub.name, e)}
                      >
                        {#if isSingleMonthMode && viewMode !== 'spending'}
                          <span class="cell previous {prevBalance < -0.01 ? 'negative' : (prevBalance > 0.01 ? 'positive' : '')}">
                            {formatAmount(prevBalance)}
                          </span>
                        {/if}
                        {#if viewMode !== 'spending'}
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
                        {/if}
                        <span class="cell outflows" class:negative={!isNearZero(data.activity) && data.activity < 0}>
                          {formatAmount(data.activity)}
                        </span>
                        {#if viewMode !== 'spending'}
                          <span class="cell balance {getBalanceClass(data.available)}">
                            {formatAmount(data.available)}
                            {#if data.available < -0.01 && 'overspendingHandling' in data && data.overspendingHandling === 'Confined'}
                              <span class="rolling-indicator" title="Se traslada al siguiente mes">→</span>
                            {/if}
                          </span>
                        {/if}
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

    <!-- Transactions Panel (when category is selected) -->
    {#if showTransactions && selection}
      <div class="detail-transactions">
        <div class="detail-tx-header">
          <div class="detail-tx-title">
            <strong>{selection.name}</strong>
            <span class="detail-tx-month">{getMonthName(selection.monthKey)}</span>
            <span class="tx-count-label">· {selectedTransactions.length} {$t('budget.transactions')}</span>
          </div>
          <button class="detail-close-btn" onclick={closePanel}>
            <X class="h-4 w-4" />
          </button>
        </div>
        
        {#if selectedTransactions.length === 0}
          <div class="no-transactions-detail">
            {$t('budget.noTransactions')}
          </div>
        {:else}
          <div class="detail-tx-table-container">
            <table class="detail-tx-table">
              <thead>
                <tr>
                  <th class="col-flag"></th>
                  <th class="col-date">{$t('transactions.date')}</th>
                  <th class="col-account">{$t('transactions.account')}</th>
                  <th class="col-payee">{$t('transactions.payee')}</th>
                  <th class="col-memo">{$t('transactions.memo')}</th>
                  <th class="col-amount">{$t('transactions.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {#each selectedTransactions as tx, idx (tx.entityId + '-' + idx)}
                  <tr class:split={tx.isSplit}>
                    <td class="col-flag">
                      {#if tx.flag}
                        <span class="flag-indicator flag-{tx.flag.toLowerCase()}"></span>
                      {/if}
                    </td>
                    <td class="col-date">{tx.date}</td>
                    <td class="col-account">{tx.accountName}</td>
                    <td class="col-payee">
                      {#if tx.isSplit}<span class="split-badge">÷</span>{/if}
                      {tx.payeeName}
                    </td>
                    <td class="col-memo">{tx.memo || ''}</td>
                    <td class="col-amount {isNearZero(tx.amount) ? 'zero' : (tx.amount < 0 ? 'negative' : 'positive')}">
                      {formatAmountFull(tx.amount, true)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
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

  /* Budget Summary Header */
  .budget-summary-header {
    flex-shrink: 0;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    padding: 0.5rem 1rem;
  }

  .budget-summary-header.collapsed {
    padding: 0.25rem 1rem;
  }

  .summary-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    font-size: 0.7rem;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .summary-toggle:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .summary-content {
    display: flex;
    align-items: flex-start;
    gap: 2rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }

  .summary-main {
    flex-shrink: 0;
  }

  .available-to-budget {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.125rem;
    padding: 0.75rem 1.25rem;
    background: var(--success);
    color: white;
    border-radius: 8px;
    min-width: 180px;
  }

  .available-to-budget.negative {
    background: var(--destructive);
  }

  .atb-label {
    font-size: 0.7rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    opacity: 0.9;
  }

  .atb-amount {
    font-size: 1.5rem;
    font-weight: 700;
    font-family: var(--font-family-mono);
    font-variant-numeric: tabular-nums;
  }

  .summary-breakdown {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.25rem;
  }

  .breakdown-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.5rem;
    font-size: 0.75rem;
  }

  .breakdown-label {
    color: var(--muted-foreground);
  }

  .breakdown-value {
    font-family: var(--font-family-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    color: var(--foreground);
    text-align: right;
    min-width: 80px;
  }

  .breakdown-value.positive {
    color: var(--success);
  }

  .breakdown-value.negative {
    color: var(--destructive);
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

  .budget-nav-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    gap: 0.5rem;
  }

  .budget-nav-months {
    display: flex;
    align-items: center;
    gap: 0;
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

  .budget-main-area.detail-mode .budget-grid-container {
    flex: 0 0 auto;
    max-width: 50%;
    min-width: 380px;
  }

  /* Detail mode with spending - much more compact */
  .budget-main-area.detail-mode.spending-mode .budget-grid-container {
    max-width: 45%;
    min-width: 320px;
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
    padding: 0.4rem 0.5rem;
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
    gap: 0.25rem;
  }

  .header-top-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-label {
    flex: 1;
  }

  .expand-buttons {
    display: flex;
    gap: 0.15rem;
  }

  .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .expand-btn:hover:not(:disabled) {
    background: var(--accent);
    color: var(--foreground);
    border-color: var(--primary);
  }

  .expand-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .category-count {
    font-size: 0.6rem;
    font-weight: 500;
    color: var(--muted-foreground);
    background: var(--background);
    padding: 0.1rem 0.3rem;
    border-radius: 8px;
    min-width: 18px;
    text-align: center;
  }

  .filter-toggle {
    display: flex;
    gap: 0;
    background: var(--background);
    border-radius: 4px;
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .filter-btn {
    flex: 1;
    padding: 0.2rem 0.35rem;
    font-size: 0.55rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .filter-btn:not(:last-child) {
    border-right: 1px solid var(--border);
  }

  .filter-btn:hover:not(.active) {
    background: var(--accent);
    color: var(--foreground);
  }

  .filter-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  /* Remove old select styles */
  .category-filter-select {
    display: none;
    cursor: pointer;
    outline: none;
  }

  .category-filter-select:focus {
    border-color: var(--primary);
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
    padding: 0 0.5rem 0 0.25rem;
    height: 32px;
    box-sizing: border-box;
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
    padding: 0 0.5rem 0 1.5rem;
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

  .category-sub.overspent {
    color: var(--destructive);
  }

  .category-sub.overspent.selected {
    color: var(--primary-foreground) !important;
  }

  .category-sub :global(.overspent-icon) {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    margin-right: 0.25rem;
    color: var(--destructive);
  }

  .category-sub.selected :global(.overspent-icon) {
    color: var(--primary-foreground);
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

  /* Single month mode - add width for the extra "previous" column */
  .budget-data-columns.single-month {
    flex: 0 0 340px;
    min-width: 340px;
    max-width: 340px;
  }

  .budget-data-columns.single-month .budget-months-header {
    height: auto;
    min-height: 50px;
  }

  .month-header-group.single-month {
    flex: 1;
    width: 100%;
  }

  .month-header-group.single-month .month-columns {
    display: flex;
  }

  .month-header-group.single-month .col-header {
    flex: 1;
    min-width: 55px;
    text-align: right;
    padding: 0 0.25rem;
  }

  .month-data.single-month {
    display: flex !important;
    width: 100% !important;
    min-width: unset !important;
  }

  .month-data.single-month .cell {
    flex: 1;
    min-width: 55px;
    text-align: right;
    padding: 0 0.25rem;
  }

  .cell.previous {
    color: var(--muted-foreground);
  }

  .cell.previous.positive {
    color: var(--success);
  }

  .cell.previous.negative {
    color: var(--destructive);
  }

  .budget-months-header {
    display: flex;
    flex-shrink: 0;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    height: 60px;
  }

  .month-header-group {
    flex: 1;
    min-width: 200px;
    max-width: 350px;
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
  }

  .data-row.master-row {
    height: 32px;
    background: var(--muted);
    font-weight: 600;
  }

  .data-row.master-row .cell {
    font-size: 0.8rem;
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

  /* Removed overspent row backgrounds - only the balance value shows red */

  .month-data {
    flex: 1;
    min-width: 200px;
    max-width: 350px;
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

  /* Removed overspent cell backgrounds - only the balance value shows red */

  .month-data.selected {
    background: var(--primary);
  }

  .month-data.selected .cell {
    color: var(--primary-foreground) !important;
  }

  .cell {
    flex: 1;
    padding: 0 0.35rem;
    text-align: right;
    font-size: 0.75rem;
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

  /* Spending mode - single column layout, flexible to fill space */
  .budget-main-area.spending-mode .budget-months-header {
    display: flex;
  }

  .month-data.spending-mode {
    flex: 1;
    min-width: 90px;
    max-width: 200px;
    justify-content: flex-end;
    padding: 0 0.75rem;
  }

  .month-data.spending-mode .cell {
    flex: none;
    text-align: right;
    font-size: 0.85rem;
  }

  .month-header-group.spending-mode {
    flex: 1;
    min-width: 90px;
    max-width: 200px;
  }

  .month-header-group.spending-mode .month-title {
    font-size: 0.8rem;
    padding: 0.5rem 0.25rem;
    text-align: center;
  }

  .budget-main-area.spending-mode .budget-data-columns {
    flex: 1;
  }

  .budget-main-area.spending-mode .budget-categories-column {
    flex: 0 0 auto;
    max-width: 220px;
  }

  .budget-main-area.spending-mode .data-row {
    display: flex;
  }

  /* Detail mode - more compact columns */
  .budget-main-area.detail-mode .month-data {
    min-width: 160px;
    max-width: 280px;
  }

  .budget-main-area.detail-mode .month-header-group {
    min-width: 160px;
    max-width: 280px;
  }

  /* Detail mode with spending - even more compact */
  .budget-main-area.detail-mode.spending-mode .month-data.spending-mode {
    min-width: 55px;
    max-width: 100px;
    padding: 0 0.25rem;
  }

  .budget-main-area.detail-mode.spending-mode .month-header-group.spending-mode {
    min-width: 55px;
    max-width: 100px;
  }

  .budget-main-area.detail-mode.spending-mode .budget-categories-column {
    max-width: 150px;
  }

  .budget-main-area.detail-mode.spending-mode .cell {
    font-size: 0.7rem;
  }

  .budget-main-area.detail-mode.spending-mode .month-title {
    font-size: 0.65rem;
    padding: 0.25rem;
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

  .rolling-indicator {
    margin-left: 0.25rem;
    font-weight: 700;
    color: var(--warning, #f59e0b);
    font-size: 0.7rem;
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

  /* Detail View (single month + transactions) */
  .detail-view {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .detail-budget-panel {
    width: 420px;
    min-width: 380px;
    background: var(--card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-budget-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .detail-back-btn {
    padding: 0.375rem;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .detail-back-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .detail-month-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .detail-budget-grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-grid-header {
    display: grid;
    grid-template-columns: 1fr 65px 55px 55px 65px;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted-foreground);
  }

  .detail-grid-header .col-prev,
  .detail-grid-header .col-bud,
  .detail-grid-header .col-act,
  .detail-grid-header .col-bal {
    text-align: right;
  }

  .detail-grid-scroll {
    flex: 1;
    overflow-y: auto;
  }

  .detail-grid-group {
    border-bottom: 1px solid var(--border-subtle);
  }

  .detail-grid-row {
    display: grid;
    grid-template-columns: 1fr 65px 55px 55px 65px;
    gap: 0.25rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.1s;
  }

  .detail-grid-row:hover {
    background: var(--accent);
  }

  .detail-grid-row.selected {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .detail-grid-row.selected .col-prev,
  .detail-grid-row.selected .col-bud,
  .detail-grid-row.selected .col-act,
  .detail-grid-row.selected .col-bal {
    color: var(--primary-foreground) !important;
  }

  .detail-grid-row.master {
    font-weight: 600;
    background: var(--muted);
  }

  .detail-grid-row.sub {
    padding-left: 1.5rem;
  }

  .detail-grid-row .col-cat {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .expand-btn-mini {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    font-size: 0.65rem;
    width: 12px;
    transition: transform 0.15s;
  }

  .expand-btn-mini span.expanded {
    display: inline-block;
    transform: rotate(90deg);
  }

  .detail-grid-row .col-prev,
  .detail-grid-row .col-bud,
  .detail-grid-row .col-act,
  .detail-grid-row .col-bal {
    text-align: right;
    font-family: var(--font-family-mono);
    font-size: 0.7rem;
  }

  .detail-grid-row .col-prev.positive { color: var(--success); }
  .detail-grid-row .col-prev.negative { color: var(--destructive); }
  .detail-grid-row .col-act.negative { color: var(--destructive); }
  .detail-grid-row .col-bal.positive { color: var(--success); }
  .detail-grid-row .col-bal.negative { color: var(--destructive); }
  .detail-grid-row .col-bal.warning { color: var(--warning); }

  /* Detail Transactions */
  .detail-transactions {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--background);
  }

  .detail-tx-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .detail-tx-title {
    font-size: 0.85rem;
    color: var(--foreground);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .detail-tx-title strong {
    font-weight: 600;
  }

  .detail-tx-month {
    color: var(--muted-foreground);
    font-size: 0.8rem;
  }

  .tx-count-label {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted-foreground);
  }

  .detail-close-btn {
    padding: 0.375rem;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .detail-close-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .no-transactions-detail {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    font-size: 0.9rem;
  }

  .detail-tx-table-container {
    flex: 1;
    overflow: auto;
  }

  .detail-tx-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .detail-tx-table th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 2px solid var(--border);
    font-weight: 600;
    color: var(--muted-foreground);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--card);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .detail-tx-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    color: var(--foreground);
  }

  .detail-tx-table tr:hover td {
    background: var(--accent);
  }

  .detail-tx-table tr.split td {
    background: var(--muted);
  }

  .detail-tx-table .col-flag {
    width: 24px;
    padding: 0.25rem 0.5rem;
    text-align: center;
  }

  .detail-tx-table .col-date {
    width: 90px;
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
    color: var(--muted-foreground);
    white-space: nowrap;
  }

  .detail-tx-table .col-account {
    width: 120px;
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }

  .detail-tx-table .col-payee {
    min-width: 150px;
  }

  .detail-tx-table .col-memo {
    color: var(--muted-foreground);
    font-size: 0.75rem;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-tx-table th.col-amount,
  .detail-tx-table .col-amount {
    text-align: right;
    font-family: var(--font-family-mono);
    width: 100px;
    font-weight: 500;
  }

  .detail-tx-table .col-amount.positive { color: var(--success); }
  .detail-tx-table .col-amount.negative { color: var(--destructive); }
  .detail-tx-table .col-amount.zero { color: var(--muted-foreground); }

  /* Transactions Panel (legacy - keeping for compatibility) */
  .budget-transactions-panel {
    width: 450px;
    min-width: 400px;
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
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--card);
  }

  .summary-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 70px;
  }

  .summary-item .label {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted-foreground);
  }

  .summary-item .value {
    font-size: 0.8rem;
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

  .tx-mini-table .col-flag {
    width: 20px;
    padding: 0.25rem !important;
    text-align: center;
  }

  .flag-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .flag-red { background: #ef4444; }
  .flag-orange { background: #f97316; }
  .flag-yellow { background: #eab308; }
  .flag-green { background: #22c55e; }
  .flag-blue { background: #3b82f6; }
  .flag-purple { background: #a855f7; }

  .tx-mini-table .col-account {
    width: 90px;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-foreground);
    font-size: 0.7rem;
  }

  .tx-mini-table .col-payee {
    min-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .split-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 0.6rem;
    font-weight: 700;
    margin-right: 4px;
    vertical-align: middle;
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
    font-size: 0.8rem;
    padding: 0.5rem;
    text-align: center;
  }

  .budget-view.mobile-view .month-columns {
    justify-content: center;
    gap: 0;
  }

  .budget-view.mobile-view .col-header {
    font-size: 0.6rem;
    padding: 0 0.25rem;
  }

  .budget-view.mobile-view .cell {
    font-size: 0.7rem;
    padding: 0 0.15rem;
  }

  /* Mobile spending mode - allow multiple columns */
  .budget-view.mobile-view .month-header-group.spending-mode,
  .budget-view.mobile-view .month-data.spending-mode {
    width: auto;
    min-width: 75px;
    max-width: 130px;
    flex: 1;
  }

  .budget-view.mobile-view .month-header-group.spending-mode .month-title {
    font-size: 0.7rem;
    padding: 0.35rem 0.25rem;
  }

  .budget-view.mobile-view .month-data.spending-mode .cell {
    font-size: 0.75rem;
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

  /* ==============================================
     VIEW MODE TOGGLE STYLES
     ============================================== */
  .view-mode-toggle {
    display: flex;
    gap: 0;
    background: var(--muted);
    border-radius: 6px;
    padding: 3px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .view-mode-toggle.mobile {
    margin: 0 auto 0.5rem auto;
    justify-content: center;
  }

  .view-mode-toggle.mobile .mode-btn {
    padding: 8px 20px;
    font-size: 0.85rem;
  }

  .mode-btn {
    padding: 6px 14px;
    font-size: 0.75rem;
    font-weight: 500;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .mode-btn:hover {
    color: var(--foreground);
  }

  .mode-btn.active {
    background: var(--background);
    color: var(--primary);
    box-shadow: var(--shadow-sm);
  }

</style>

