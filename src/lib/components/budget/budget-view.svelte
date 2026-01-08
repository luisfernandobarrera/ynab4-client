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
  import CategoryContextMenu from './category-context-menu.svelte';
  import CategoryNoteDialog from './category-note-dialog.svelte';

  // Initialize calculator
  const budgetCalculator = new MonthlyBudgetCalculator();

  // Month navigation state
  const currentDate = new Date();
  let selectedYear = $state(currentDate.getFullYear());
  let centerMonth = $state(currentDate.getMonth());
  let visibleMonths = $state(4);
  let showOnlyActive = $state(true);
  let showSummary = $state(true);
  
  // View mode: 'budget' (normal) or 'spending' (only activity)
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

  // Context menu state
  interface CategoryInfo {
    id: string;
    name: string;
    masterCategoryId: string;
    masterCategoryName: string;
    budgeted: number;
    activity: number;
    available: number;
    monthKey: string;
    note?: string;
    hidden?: boolean;
    overspendingHandling?: 'Confined' | 'AffectsBuffer' | null;
  }

  let contextMenuOpen = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextMenuCategory = $state<CategoryInfo | null>(null);

  // Note dialog state
  let noteDialogOpen = $state(false);
  let noteDialogCategory = $state<CategoryInfo | null>(null);

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
      const [year, month] = selection.monthKey.split('-').map(Number);
      return [{ month: month - 1, year, key: selection.monthKey }];
    }
    return monthRange;
  });

  // Check if we're in single month mode (selection active)
  const isSingleMonthMode = $derived(showTransactions && selection !== null);

  // === SPENDING MODE DATA ===
  
  // Set of on-budget account IDs for quick lookup
  const onBudgetAccountIds = $derived(
    new Set(($accounts || []).filter(a => a.onBudget && !a.isTombstone).map(a => a.entityId))
  );

  // Helper to check if transaction is internal transfer (between on-budget accounts)
  function isInternalTransfer(tx: { transferAccountId?: string | null }): boolean {
    if (!tx.transferAccountId) return false;
    return onBudgetAccountIds.has(tx.transferAccountId);
  }

  // Income category IDs in YNAB4
  const IMMEDIATE_INCOME_CATEGORY = 'Category/__ImmediateIncome__';
  const DEFERRED_INCOME_CATEGORY = 'Category/__DeferredIncome__';

  // Helper to check if a transaction is real income
  function isIncomeTransaction(tx: { categoryId?: string | null }): boolean {
    return tx.categoryId === IMMEDIATE_INCOME_CATEGORY || tx.categoryId === DEFERRED_INCOME_CATEGORY;
  }

  // Calculate income by payee (payees as subcategories)
  const incomeByPayeeData = $derived.by(() => {
    const byPayee = new Map<string, { 
      payeeId: string; 
      payeeName: string; 
      total: number;
      byMonth: Record<string, number>;
    }>();
    
    $transactions?.forEach(tx => {
      if (!tx.date || tx.amount <= 0) return;
      if (!isIncomeTransaction(tx)) return;
      
      const monthKey = tx.date.substring(0, 7);
      const payeeId = tx.payeeId || tx.payee || 'unknown';
      // Use payee (the display name) not payeeId
      const payeeName = tx.payee || 'Sin beneficiario';
      
      if (!byPayee.has(payeeId)) {
        byPayee.set(payeeId, {
          payeeId,
          payeeName,
          total: 0,
          byMonth: {}
        });
      }
      
      const data = byPayee.get(payeeId)!;
      data.total += tx.amount;
      data.byMonth[monthKey] = (data.byMonth[monthKey] || 0) + tx.amount;
    });
    
    return byPayee;
  });

  // Filtered income payees for visible months
  const incomeCategories = $derived.by(() => {
    const filtered: Array<{ 
      categoryId: string; 
      categoryName: string; 
      total: number; 
      byMonth: Record<string, number> 
    }> = [];
    
    incomeByPayeeData.forEach((data) => {
      const relevantMonths = displayMonthRange.map(m => m.key);
      const hasIncomeInRange = relevantMonths.some(key => (data.byMonth[key] || 0) > 0);
      
      if (hasIncomeInRange) {
        const filteredByMonth: Record<string, number> = {};
        let visibleTotal = 0;
        relevantMonths.forEach(key => {
          if (data.byMonth[key]) {
            filteredByMonth[key] = data.byMonth[key];
            visibleTotal += data.byMonth[key];
          }
        });
        
        filtered.push({
          categoryId: data.payeeId, // Use payeeId as the ID
          categoryName: data.payeeName,
          total: visibleTotal,
          byMonth: filteredByMonth
        });
      }
    });
    
    // Sort by total income descending
    return filtered.sort((a, b) => b.total - a.total);
  });

  // Income structure as a virtual master category
  const INCOME_MASTER_ID = '__income__';
  
  const incomeStructure = $derived.by(() => {
    if (incomeCategories.length === 0) return null;
    
    return {
      id: INCOME_MASTER_ID,
      name: 'Ingresos',
      isIncome: true,
      subCategories: incomeCategories.map(c => ({
        id: `income_${c.categoryId}`,
        name: c.categoryName,
        isActive: true,
        categoryId: c.categoryId,
        isIncome: true
      }))
    };
  });

  // Calculate expenses by category for spending mode
  const expensesByCategory = $derived.by(() => {
    if (viewMode !== 'spending') return new Map<string, Record<string, number>>();
    
    const byCat = new Map<string, Record<string, number>>();
    
    $transactions?.forEach(tx => {
      if (!tx.date || tx.amount >= 0) return;
      if (isInternalTransfer(tx)) return;
      
      const monthKey = tx.date.substring(0, 7);
      if (!displayMonthRange.some(m => m.key === monthKey)) return;
      
      if (tx.subTransactions && tx.subTransactions.length > 0) {
        tx.subTransactions.forEach(sub => {
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

  // Get income totals per month
  const incomeTotalsByMonth = $derived.by(() => {
    const totals: Record<string, number> = {};
    displayMonthRange.forEach(({ key }) => {
      totals[key] = incomeCategories.reduce((sum, c) => sum + (c.byMonth[key] || 0), 0);
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

  // Get income data for a category in a given month
  function getIncomeData(categoryId: string, monthKey: string, isMaster: boolean = false) {
    if (isMaster && categoryId === INCOME_MASTER_ID) {
      let total = 0;
      incomeCategories.forEach(c => {
        total += c.byMonth[monthKey] || 0;
      });
      return { budgeted: 0, activity: total, available: 0 };
    }
    
    const cleanId = categoryId.startsWith('income_') ? categoryId.replace('income_', '') : categoryId;
    const categoryData = incomeCategories.find(c => c.categoryId === cleanId);
    if (!categoryData) return { budgeted: 0, activity: 0, available: 0 };
    
    const amount = categoryData.byMonth[monthKey] || 0;
    return { budgeted: 0, activity: amount, available: 0 };
  }

  // Get years with data - based on transactions only (not empty budget months)
  const yearsWithData = $derived.by(() => {
    const transactionYears = new Set<number>();
    const thisYear = currentDate.getFullYear();
    
    // Get years from actual transactions only
    $rawTransactions?.forEach(tx => {
      if (tx.date) {
        const year = parseInt(tx.date.slice(0, 4));
        if (!isNaN(year) && year > 1990 && year < 2100) {
          transactionYears.add(year);
        }
      }
    });
    
    // Add current year if no transactions
    if (transactionYears.size === 0) {
      transactionYears.add(thisYear);
    }
    
    // Also include next year for planning
    const maxYear = Math.max(...transactionYears);
    if (maxYear === thisYear) {
      transactionYears.add(thisYear + 1);
    }
    
    return Array.from(transactionYears).sort((a, b) => b - a);
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
  // Helper to get category name
  function getCategoryName(categoryId: string | undefined | null): string {
    if (!categoryId) return '';
    const cat = $rawCategories?.find(c => c.entityId === categoryId);
    return cat?.name || '';
  }

  const selectedTransactions = $derived.by(() => {
    if (!selection || !$transactions) return [];
    
    const { type, id, monthKey } = selection;
    
    // Check if this is an income selection
    const isIncomeSelection = id === INCOME_MASTER_ID || id.startsWith('income_');
    const showCategoryName = type === 'master' && !isIncomeSelection;
    
    // For income subcategories, filter by payee (using payeeId or payee name)
    let filterPayeeKey: string | null = null;
    if (isIncomeSelection && id !== INCOME_MASTER_ID) {
      filterPayeeKey = id.replace('income_', '');
    }
    
    // Get all category IDs to filter (for non-income selections)
    let categoryIds: string[] = [];
    if (!isIncomeSelection) {
      if (type === 'master') {
        const master = categoryStructure.find(m => m.id === id);
        if (master) {
          categoryIds = master.subCategories.map(c => c.id);
        }
      } else {
        categoryIds = [id];
      }
    }
    
    // Filter transactions by month and category/payee
    const result: Array<{
      entityId: string;
      date: string;
      amount: number;
      payee: string;
      accountName: string;
      memo: string;
      flag: string | null;
      isSplit?: boolean;
      categoryName?: string;
      transferAccountId?: string | null;
    }> = [];
    
    $transactions.forEach(tx => {
      if (!tx.date || !tx.date.startsWith(monthKey)) return;
      
      // For income selections
      if (isIncomeSelection) {
        // Only positive amounts that are income transactions
        if (tx.amount <= 0 || !isIncomeTransaction(tx)) return;
        
        // If filtering by specific payee (match by payeeId or payee name)
        if (filterPayeeKey) {
          const txPayeeKey = tx.payeeId || tx.payee || '';
          if (txPayeeKey !== filterPayeeKey) return;
        }
        
        result.push({
          entityId: tx.entityId,
          date: tx.date,
          amount: tx.amount,
          payee: tx.payee || '',
          accountName: tx.accountName || '',
          memo: tx.memo || '',
          flag: tx.flag || null,
          isSplit: false,
          categoryName: undefined,
          transferAccountId: tx.transferAccountId
        });
        return;
      }
      
      // For non-income selections
      // Handle split transactions
      if (tx.subTransactions?.length) {
        tx.subTransactions.forEach(split => {
          if (split.categoryId && categoryIds.includes(split.categoryId)) {
            result.push({
              entityId: tx.entityId,
              date: tx.date,
              amount: split.amount || 0,
              payee: tx.payee || '',
              accountName: tx.accountName || '',
              memo: split.memo || tx.memo || '',
              flag: tx.flag || null,
              isSplit: true,
              categoryName: showCategoryName ? getCategoryName(split.categoryId) : undefined,
              transferAccountId: tx.transferAccountId
            });
          }
        });
      } else if (tx.categoryId && categoryIds.includes(tx.categoryId)) {
        result.push({
          entityId: tx.entityId,
          date: tx.date,
          amount: tx.amount,
          payee: tx.payee || '',
          accountName: tx.accountName || '',
          memo: tx.memo || '',
          flag: tx.flag || null,
          isSplit: false,
          categoryName: showCategoryName ? getCategoryName(tx.categoryId) : undefined,
          transferAccountId: tx.transferAccountId
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
    
    // Update selection to new month if there's an active selection
    if (selection) {
      selection = { ...selection, monthKey: key };
    }
  }

  // Set a specific month (used by month buttons)
  function setMonth(monthIndex: number) {
    centerMonth = monthIndex;
    const key = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    selectedMonth.set(key);
    
    // Update selection to new month if there's an active selection
    if (selection) {
      selection = { ...selection, monthKey: key };
    }
  }

  // Set a specific year (used by year buttons)
  function setYear(year: number) {
    selectedYear = year;
    const key = `${year}-${String(centerMonth + 1).padStart(2, '0')}`;
    selectedMonth.set(key);
    
    // Update selection to new month if there's an active selection
    if (selection) {
      selection = { ...selection, monthKey: key };
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

  // Handle keyboard events
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && showTransactions) {
      closePanel();
    }
  }

  // Context menu handlers
  function handleCategoryContextMenu(
    categoryId: string,
    categoryName: string,
    masterCategoryId: string,
    masterCategoryName: string,
    monthKey: string,
    e: MouseEvent
  ) {
    e.preventDefault();
    e.stopPropagation();

    // Get category data for this month
    const data = getCategoryData(categoryId, monthKey, false);
    const categoryRaw = $rawCategories.find(c => c.entityId === categoryId);

    contextMenuCategory = {
      id: categoryId,
      name: categoryName,
      masterCategoryId,
      masterCategoryName,
      budgeted: data.budgeted,
      activity: data.activity,
      available: data.available,
      monthKey,
      note: data.note,
      hidden: categoryRaw?.hidden,
      overspendingHandling: data.overspendingHandling,
    };
    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    contextMenuOpen = true;
  }

  function handleContextMenuClose() {
    contextMenuOpen = false;
    contextMenuCategory = null;
  }

  function handleShowNote(category: CategoryInfo) {
    noteDialogCategory = category;
    noteDialogOpen = true;
  }

  function handleNoteDialogClose() {
    noteDialogOpen = false;
    noteDialogCategory = null;
  }

  function handleViewTransactions(category: CategoryInfo) {
    // Select the category and show transactions panel
    selection = {
      type: 'category',
      id: category.id,
      monthKey: category.monthKey,
      name: category.name,
    };
    showTransactions = true;
  }

  function handleQuickBudget(category: CategoryInfo, action: string) {
    // TODO: Implement quick budget actions
    addToast({
      type: 'info',
      message: `Quick budget: ${action} for ${category.name}`,
    });
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
        return;
      }
      
      const width = window.innerWidth;
      const sidebarWidth = 250; // approximate sidebar width
      const categoriesWidth = 240; // categories column width
      const panelWidth = showTransactions ? 400 : 0;
      const padding = 32; // some padding
      
      const availableWidth = width - sidebarWidth - categoriesWidth - panelWidth - padding;
      
      // Different min widths for different modes
      let minMonthWidth: number;
      if (viewMode === 'spending') {
        minMonthWidth = 90; // Compact for spending mode
      } else if (showTransactions) {
        minMonthWidth = 200; // Medium for detail mode
      } else {
        minMonthWidth = 180; // Normal budget mode
      }
      
      const maxMonths = viewMode === 'spending' ? 12 : 6;
      const minMonths = showTransactions ? 1 : 2;
      
      const calculatedMonths = Math.floor(availableWidth / minMonthWidth);
      visibleMonths = Math.max(minMonths, Math.min(maxMonths, calculatedMonths));
    }
    
    updateVisibleMonths();
    window.addEventListener('resize', updateVisibleMonths);
    return () => window.removeEventListener('resize', updateVisibleMonths);
  });

  // Recalculate visible months when view mode or panel changes
  $effect(() => {
    // Track dependencies
    const _ = viewMode;
    const __ = showTransactions;
    
    if (typeof window !== 'undefined') {
      // Use setTimeout to ensure state is updated
      setTimeout(() => {
        const width = window.innerWidth;
        const sidebarWidth = 250;
        const categoriesWidth = 240;
        const panelWidth = showTransactions ? 400 : 0;
        const padding = 32;
        
        const availableWidth = width - sidebarWidth - categoriesWidth - panelWidth - padding;
        
        let minMonthWidth: number;
        if (viewMode === 'spending') {
          minMonthWidth = 90;
        } else if (showTransactions) {
          minMonthWidth = 200;
        } else {
          minMonthWidth = 180;
        }
        
        const maxMonths = viewMode === 'spending' ? 12 : 6;
        const minMonths = showTransactions ? 1 : 2;
        
        const calculatedMonths = Math.floor(availableWidth / minMonthWidth);
        visibleMonths = Math.max(minMonths, Math.min(maxMonths, calculatedMonths));
      }, 0);
    }
  });

  // Initialize expanded masters (only on first load, not after user changes)
  $effect(() => {
    if (allCategoryStructure.length > 0 && expandedMasters.size === 0 && !userManuallyChangedExpansion) {
      expandedMasters = new Set(allCategoryStructure.map(m => m.id));
    }
  });

  // Get previous month balance for single-month mode
  function getPreviousMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    if (month === 1) {
      return `${year - 1}-12`;
    }
    return `${year}-${String(month - 1).padStart(2, '0')}`;
  }

  function getPreviousMonthBalance(categoryId: string, monthKey: string, isMaster: boolean = false): number {
    const prevKey = getPreviousMonthKey(monthKey);
    const data = getCategoryData(categoryId, prevKey, isMaster);
    return data.available || 0;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

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

  <!-- Budget Summary Header (hide in spending mode) -->
  {#if viewMode !== 'spending'}
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
  {/if}

  <div class="budget-main-area" class:detail-mode={isSingleMonthMode} class:spending-mode={viewMode === 'spending'}>
    <!-- Budget Grid -->
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
          <div class="header-controls">
            <div class="expand-buttons">
              <button 
                class="expand-btn"
                title={$t('budget.expandAll')}
                onclick={expandAllCategories}
                disabled={allExpanded}
              >
                <ChevronsUpDown class="h-3.5 w-3.5" />
              </button>
              <button 
                class="expand-btn"
                title={$t('budget.collapseAll')}
                onclick={collapseAllCategories}
                disabled={expandedMasters.size === 0}
              >
                <ChevronsDownUp class="h-3.5 w-3.5" />
              </button>
            </div>
            <label class="active-filter-toggle">
              <input 
                type="checkbox"
                bind:checked={showOnlyActive}
              />
              <span class="toggle-label">{$t('budget.activeOnly')}</span>
            </label>
          </div>
        </div>
        
        <div 
          class="budget-categories-scroll"
          bind:this={categoriesRef}
          onscroll={handleCategoriesScroll}
        >
          <!-- Income Section (Virtual Master Category) -->
          {#if incomeStructure}
            <div class="category-group income-group">
              <button 
                class="category-master income-master"
                class:selected={selection?.type === 'master' && selection?.id === INCOME_MASTER_ID}
                onclick={(e) => toggleMaster(INCOME_MASTER_ID, e)}
              >
                <span class="expand-arrow" class:expanded={expandedMasters.has(INCOME_MASTER_ID)}>▸</span>
                <span class="master-name">{incomeStructure.name}</span>
              </button>
              
              {#if expandedMasters.has(INCOME_MASTER_ID)}
                {#each incomeStructure.subCategories as sub (sub.id)}
                  <div 
                    class="category-sub income-sub"
                    class:selected={selection?.type === 'category' && selection?.id === sub.id}
                  >
                    <span class="sub-name">{sub.name}</span>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}

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
        
        <!-- Totals Labels (only in spending mode) -->
        {#if viewMode === 'spending'}
          <div class="totals-labels-fixed">
            <div class="category-totals-label income-label">
              <span class="totals-label-text">Total Ingresos</span>
            </div>
            <div class="category-totals-label expense-label">
              <span class="totals-label-text">Total Gastos</span>
            </div>
            <div class="category-totals-label net-label">
              <span class="totals-label-text">Neto</span>
            </div>
          </div>
        {/if}
      </div>

      <!-- Data Columns -->
      <div class="budget-data-columns" class:single-month={isSingleMonthMode}>
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
          <!-- Income Section Data -->
          {#if incomeStructure}
            <div class="data-group income-data-group">
              <!-- Income Master Row -->
              <div class="data-row master-row income-master-row" class:selected-row={selection?.type === 'master' && selection?.id === INCOME_MASTER_ID}>
                {#each displayMonthRange as { key }}
                  {@const data = getIncomeData(INCOME_MASTER_ID, key, true)}
                  {@const isSelected = isCellSelected('master', INCOME_MASTER_ID, key)}
                  <button 
                    class="month-data income-data"
                    class:selected={isSelected}
                    class:single-month={isSingleMonthMode}
                    class:spending-mode={viewMode === 'spending'}
                    onclick={(e) => handleCellClick('master', INCOME_MASTER_ID, key, 'Ingresos', e)}
                  >
                    {#if isSingleMonthMode && viewMode !== 'spending'}
                      <span class="cell previous">-</span>
                    {/if}
                    {#if viewMode !== 'spending'}
                      <span class="cell budgeted">-</span>
                    {/if}
                    <span class="cell outflows positive">
                      {formatAmount(data.activity)}
                    </span>
                    {#if viewMode !== 'spending'}
                      <span class="cell balance">-</span>
                    {/if}
                  </button>
                {/each}
              </div>
              
              <!-- Income Subcategory Rows -->
              {#if expandedMasters.has(INCOME_MASTER_ID)}
                {#each incomeStructure.subCategories as sub (sub.id)}
                  <div class="data-row sub-row income-sub-row" class:selected-row={selection?.type === 'category' && selection?.id === sub.id}>
                    {#each displayMonthRange as { key }}
                      {@const data = getIncomeData(sub.id, key, false)}
                      {@const isSelected = isCellSelected('category', sub.id, key)}
                      <button 
                        class="month-data income-data"
                        class:selected={isSelected}
                        class:single-month={isSingleMonthMode}
                        class:spending-mode={viewMode === 'spending'}
                        onclick={(e) => handleCellClick('category', sub.id, key, sub.name, e)}
                      >
                        {#if isSingleMonthMode && viewMode !== 'spending'}
                          <span class="cell previous">-</span>
                        {/if}
                        {#if viewMode !== 'spending'}
                          <span class="cell budgeted">-</span>
                        {/if}
                        <span class="cell outflows positive">
                          {formatAmount(data.activity)}
                        </span>
                        {#if viewMode !== 'spending'}
                          <span class="cell balance">-</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/each}
              {/if}
            </div>
          {/if}

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
                      <span class="cell previous" class:positive={prevBalance > 0.01} class:negative={prevBalance < -0.01}>
                        {formatAmount(prevBalance)}
                      </span>
                    {/if}
                    {#if viewMode !== 'spending'}
                      <span class="cell budgeted">{formatAmount(data.budgeted)}</span>
                    {/if}
                    <span class="cell outflows" class:negative={!isNearZero(data.activity) && data.activity < 0} class:positive={!isNearZero(data.activity) && data.activity > 0}>
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
                        oncontextmenu={(e) => handleCategoryContextMenu(sub.id, sub.name, master.id, master.name, key, e)}
                      >
                        {#if isSingleMonthMode && viewMode !== 'spending'}
                          <span class="cell previous" class:positive={prevBalance > 0.01} class:negative={prevBalance < -0.01}>
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
                        <span class="cell outflows" class:negative={!isNearZero(data.activity) && data.activity < 0} class:positive={!isNearZero(data.activity) && data.activity > 0}>
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
        
        <!-- Totals Row (only in spending mode) -->
        {#if viewMode === 'spending'}
          <div class="totals-fixed-bar">
            <div class="data-row totals-row income-total-row">
              {#each displayMonthRange as { key }}
                {@const income = incomeTotalsByMonth[key] || 0}
                <div class="month-data totals-data" class:spending-mode={viewMode === 'spending'}>
                  <span class="cell outflows positive total-value">
                    {formatAmount(income)}
                  </span>
                </div>
              {/each}
            </div>
            
            <div class="data-row totals-row expense-total-row">
              {#each displayMonthRange as { key }}
                {@const expenses = expenseTotalsByMonth[key] || 0}
                <div class="month-data totals-data" class:spending-mode={viewMode === 'spending'}>
                  <span class="cell outflows negative total-value">
                    {formatAmount(-expenses)}
                  </span>
                </div>
              {/each}
            </div>
            
            <div class="data-row totals-row net-total-row">
              {#each displayMonthRange as { key }}
                {@const income = incomeTotalsByMonth[key] || 0}
                {@const expenses = expenseTotalsByMonth[key] || 0}
                {@const net = income - expenses}
                <div class="month-data totals-data" class:spending-mode={viewMode === 'spending'}>
                  <span class="cell outflows total-value" class:positive={net > 0} class:negative={net < 0}>
                    {formatAmount(net)}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Transactions Panel -->
    {#if showTransactions && selection}
      <div class="budget-transactions-panel">
        <div class="tx-panel-header">
          <div class="tx-panel-title">
            <h3>{selection.name}</h3>
          </div>
          <button class="tx-panel-close" onclick={closePanel}>
            <X class="h-4 w-4" />
          </button>
        </div>
        
        <div class="tx-panel-list">
          {#if selectedTransactions.length === 0}
            <div class="no-transactions">
              {$t('budget.noTransactions')}
            </div>
          {:else}
            <table class="tx-mini-table">
              <thead>
                <tr>
                  <th class="col-date">Fecha</th>
                  <th class="col-account">Cuenta</th>
                  <th class="col-icon"></th>
                  <th class="col-payee">Beneficiario</th>
                  <th class="col-category-memo">Categoría</th>
                  <th class="col-amount">Monto</th>
                </tr>
              </thead>
              <tbody>
                {#each selectedTransactions as tx, idx (tx.entityId + '-' + idx)}
                  {@const isTransfer = tx.payee?.startsWith('Transfer') || tx.transferAccountId}
                  <tr class:split={tx.isSplit}>
                    <td class="col-date">{tx.date}</td>
                    <td class="col-account" title={tx.accountName}>{tx.accountName}</td>
                    <td class="col-icon">
                      {#if isTransfer}
                        <span class="tx-icon transfer" title="Transferencia">↔</span>
                      {/if}
                    </td>
                    <td class="col-payee">
                      {#if tx.isSplit}<span class="split-badge">÷</span>{/if}
                      {tx.payee}
                    </td>
                    <td class="col-category-memo">
                      {#if tx.categoryName}
                        <span class="cat-name">{tx.categoryName}</span>
                      {/if}
                      {#if tx.memo}
                        <span class="cat-memo">{tx.memo}</span>
                      {/if}
                    </td>
                    <td class="col-amount {tx.amount < 0 ? 'negative' : 'positive'}">
                      {tx.amount < 0 ? '' : '+'}{formatAmountFull(tx.amount, false)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
        
        <div class="tx-panel-footer">
          <span class="tx-count">{selectedTransactions.length} transacciones</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Context Menu -->
<CategoryContextMenu
  bind:open={contextMenuOpen}
  x={contextMenuX}
  y={contextMenuY}
  category={contextMenuCategory}
  onClose={handleContextMenuClose}
  onShowNote={handleShowNote}
  onViewTransactions={handleViewTransactions}
  onQuickBudget={handleQuickBudget}
/>

<!-- Note Dialog -->
<CategoryNoteDialog
  bind:open={noteDialogOpen}
  category={noteDialogCategory}
  onClose={handleNoteDialogClose}
/>

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

  /* View Mode Toggle */
  .view-mode-toggle {
    display: flex;
    gap: 0;
    background: var(--muted);
    border-radius: 6px;
    padding: 3px;
    margin-left: auto;
    flex-shrink: 0;
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
    width: 240px;
    min-width: 200px;
    max-width: 320px;
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

  .header-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: space-between;
  }

  .expand-buttons {
    display: flex;
    gap: 0.25rem;
  }

  .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
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
    user-select: none;
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
    user-select: none;
    cursor: pointer;
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

  .budget-months-header {
    display: flex;
    flex-shrink: 0;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    height: 60px;
  }

  .month-header-group {
    flex: 1 1 auto;
    min-width: 180px;
    max-width: 320px;
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
    padding: 0.125rem 0.35rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0;
    color: var(--muted-foreground);
    text-align: right;
    white-space: nowrap;
  }

  .budget-data-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .data-group {
    border-bottom: 1px solid var(--border);
  }

  .data-row {
    display: flex;
    height: 32px;
    user-select: none;
    cursor: pointer;
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
    background: rgba(59, 130, 246, 0.15) !important;
  }

  .data-row.selected-row:hover {
    background: rgba(59, 130, 246, 0.2) !important;
  }

  /* Highlight the entire group when master is selected */
  .data-group:has(.master-row.selected-row) {
    background: rgba(59, 130, 246, 0.05);
  }

  /* Removed overspent row backgrounds - only the balance value shows red */

  .month-data {
    flex: 1 1 auto;
    min-width: 180px;
    max-width: 320px;
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

  /* Single month mode styles */
  .budget-data-columns.single-month {
    flex: 0 0 340px;
    min-width: 340px;
    max-width: 340px;
  }

  .month-header-group.single-month {
    flex: 1;
    width: 100%;
  }

  .month-header-group.single-month .month-title {
    height: 28px;
  }

  .month-header-group.single-month .month-columns {
    display: flex;
    height: 32px;
    align-items: center;
  }

  .month-header-group.single-month .col-header {
    flex: 1;
    min-width: 55px;
    text-align: right;
    padding: 0 0.35rem;
    line-height: 32px;
  }

  .month-data.single-month {
    display: flex !important;
    width: 100% !important;
    min-width: unset !important;
    height: 28px;
    align-items: center;
  }

  .month-data.single-month .cell {
    flex: 1;
    min-width: 55px;
    text-align: right;
    padding: 0 0.35rem;
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

  /* Spending mode styles */
  .month-header-group.spending-mode {
    flex: 1 1 auto;
    min-width: 80px;
    max-width: 150px;
  }

  .month-header-group.spending-mode .month-title {
    font-size: 0.7rem;
    padding: 0.25rem;
    text-align: center;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .month-data.spending-mode {
    flex: 1 1 auto;
    min-width: 80px;
    max-width: 150px;
    justify-content: flex-end;
    padding: 0 0.5rem;
  }

  .month-data.spending-mode .cell {
    flex: none;
    text-align: right;
    font-size: 0.85rem;
  }

  /* Spending mode category column - wider to give more space for names */
  .budget-main-area.spending-mode .budget-categories-column {
    width: 240px;
    min-width: 200px;
    max-width: 280px;
  }

  /* Spending mode column headers */
  .month-header-group.spending-mode .month-columns {
    display: flex;
    justify-content: center;
    height: 32px;
    align-items: center;
  }

  .month-header-group.spending-mode .col-header {
    text-align: center;
    flex: 1;
  }

  .cell.outflows.positive {
    color: var(--success);
  }

  /* Income section styles */
  .income-group {
    border-bottom: 2px solid var(--success);
  }

  .category-master.income-master {
    background: rgba(34, 197, 94, 0.1);
    color: var(--success);
  }

  .category-master.income-master:hover {
    background: rgba(34, 197, 94, 0.2);
  }

  .category-sub.income-sub {
    background: rgba(34, 197, 94, 0.05);
  }

  .category-sub.income-sub:hover {
    background: rgba(34, 197, 94, 0.15);
  }

  .income-data-group {
    border-bottom: 2px solid var(--success);
  }

  .income-master-row {
    background: rgba(34, 197, 94, 0.1) !important;
  }

  .income-sub-row {
    background: rgba(34, 197, 94, 0.05);
  }

  .income-sub-row:hover {
    background: rgba(34, 197, 94, 0.15) !important;
  }

  .month-data.income-data .cell.outflows {
    color: var(--success);
  }

  .month-data.income-data .cell.previous,
  .month-data.income-data .cell.budgeted,
  .month-data.income-data .cell.balance {
    color: var(--muted-foreground);
    opacity: 0.5;
  }

  /* Totals section styles */
  .totals-labels-fixed {
    flex-shrink: 0;
    border-top: 2px solid var(--border);
    background: var(--card);
    padding: 0.25rem 0;
  }

  .totals-fixed-bar {
    flex-shrink: 0;
    border-top: 2px solid var(--border);
    background: var(--card);
    padding: 0.25rem 0;
  }

  .category-totals-label {
    display: flex;
    align-items: center;
    height: 28px;
    padding: 0 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .category-totals-label.income-label {
    color: var(--success);
  }

  .category-totals-label.expense-label {
    color: var(--destructive);
  }

  .category-totals-label.net-label {
    color: var(--foreground);
    font-weight: 700;
  }

  .totals-row {
    display: flex;
    height: 28px;
  }

  .totals-data {
    flex: 1;
    min-width: 90px;
    max-width: 200px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 0.75rem;
  }

  .total-value {
    font-weight: 600;
    font-size: 0.85rem !important;
  }

  .net-total-row .total-value {
    font-weight: 700;
    font-size: 0.9rem !important;
  }

  /* Detail mode (when transaction panel is open) */
  .budget-main-area.detail-mode .budget-grid-container {
    flex: 0 0 auto;
    width: auto;
    max-width: none;
    min-width: 0;
  }

  .budget-main-area.detail-mode .budget-categories-column {
    width: 220px;
    min-width: 180px;
    max-width: 250px;
  }

  .budget-main-area.detail-mode .budget-data-columns.single-month {
    flex: 0 0 auto;
    width: auto;
    min-width: 280px;
    max-width: 320px;
  }

  .budget-main-area.detail-mode .month-header-group.single-month {
    width: 100%;
    min-width: 0;
    max-width: none;
  }

  .budget-main-area.detail-mode .month-data.single-month {
    width: 100%;
    min-width: 0;
    max-width: none;
  }

  /* Detail mode with spending */
  .budget-main-area.detail-mode.spending-mode .budget-categories-column {
    width: 200px;
    min-width: 180px;
  }

  .budget-main-area.detail-mode.spending-mode .budget-data-columns.single-month {
    min-width: 100px;
    max-width: 150px;
  }

  .budget-main-area.detail-mode.spending-mode .month-data.spending-mode {
    min-width: 0;
    max-width: none;
    padding: 0 0.5rem;
  }

  .budget-main-area.detail-mode.spending-mode .cell {
    font-size: 0.8rem;
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
    font-size: 0.8rem;
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

  /* Transactions Panel */
  .budget-transactions-panel {
    flex: 1;
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
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    min-height: 40px;
  }

  .tx-panel-title h3 {
    margin: 0;
    font-size: 0.85rem;
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
    user-select: none;
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
    font-variant-numeric: tabular-nums;
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

  /* Transaction Mini Table - Similar to main transactions table */
  .tx-mini-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
    user-select: none;
  }

  .tx-mini-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--card);
  }

  .tx-mini-table th {
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-weight: 500;
    font-size: 0.75rem;
    color: var(--muted-foreground);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .tx-mini-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  .tx-mini-table tr {
    cursor: pointer;
  }

  .tx-mini-table tr:hover td {
    background: var(--accent);
  }

  .tx-mini-table tr.split td {
    background: rgba(59, 130, 246, 0.05);
  }

  .tx-mini-table .col-date {
    width: 85px;
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
    color: var(--muted-foreground);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .tx-mini-table .col-account {
    width: 140px;
    min-width: 120px;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-mini-table .col-icon {
    width: 20px;
    min-width: 20px;
    max-width: 20px;
    padding: 0.5rem 2px !important;
    text-align: center;
  }

  .tx-mini-table .tx-icon {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .tx-mini-table .tx-icon.transfer {
    color: var(--primary);
  }

  .tx-mini-table .col-payee {
    min-width: 80px;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-mini-table .col-category-memo {
    min-width: 100px;
  }

  .tx-mini-table .col-category-memo .cat-name {
    display: block;
    font-weight: 600;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-mini-table .col-category-memo .cat-memo {
    display: block;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-mini-table th.col-amount,
  .tx-mini-table .col-amount {
    width: 85px;
    text-align: right;
    font-family: var(--font-family-mono);
    white-space: nowrap;
    font-weight: 500;
  }

  .tx-mini-table .col-amount.positive {
    color: var(--success);
  }

  .tx-mini-table .col-amount.negative {
    color: var(--destructive);
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
    width: 50%;
    min-width: 140px;
    max-width: 220px;
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
      min-width: 160px;
      max-width: 280px;
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
      font-size: 0.75rem;
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
      min-width: 120px;
      max-width: 200px;
    }
    
    .col-header {
      font-size: 0.6rem;
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

