<script lang="ts">
  import { onMount } from 'svelte';
  import { Plus, Search, Lock, ChevronDown, ChevronUp, Save, X, PanelLeftClose, PanelLeft, Calendar, Flag, ArrowUpDown, Trash2, Split, Settings2, Eye, EyeOff, GripVertical, List, LayoutList, Grid3x3 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { AccountsPanel } from '$lib/components/accounts';
  import DateNavigation from './date-navigation.svelte';
  import Autocomplete from '$lib/components/ui/autocomplete.svelte';
  import { selectedAccountTransactions, selectedAccountId, accounts, transactions, payees, categories, budgetInfo } from '$lib/stores/budget';
  import { isMobile, isEditMode, addPendingChange, addToast, transactionSortOrder, toggleTransactionSortOrder, reverseScroll, toggleReverseScroll } from '$lib/stores/ui';
  import { formatCurrency } from '$lib/utils';
  import { t } from '$lib/i18n';
  import { browser } from '$app/environment';
  
  // Account type classification
  function getAccountType(accountId: string): string {
    const acc = $accounts.find(a => a.id === accountId);
    if (!acc) return 'other';
    const type = acc.type?.toLowerCase() || '';
    if (type.includes('checking')) return 'checking';
    if (type.includes('savings')) return 'savings';
    if (type.includes('creditcard') || type.includes('credit card')) return 'creditCard';
    if (type.includes('cash')) return 'cash';
    if (type.includes('lineofcredit') || type.includes('line of credit')) return 'lineOfCredit';
    if (type.includes('merchant') || type.includes('store')) return 'merchant';
    if (type.includes('investment')) return 'investment';
    if (type.includes('mortgage')) return 'mortgage';
    if (type.includes('otherasset') || type.includes('other asset')) return 'otherAsset';
    if (type.includes('otherliability') || type.includes('other liability')) return 'otherLiability';
    return 'other';
  }
  
  // Get transfer category label based on target account type
  function getTransferCategoryLabel(accountId: string | null): string {
    if (!accountId) return 'Transferencia';
    const type = getAccountType(accountId);
    const labels: Record<string, string> = {
      checking: 'Cuenta Cheques',
      savings: 'Cuenta Ahorro',
      creditCard: 'Tarjeta de Crédito',
      cash: 'Efectivo',
      lineOfCredit: 'Línea de Crédito',
      merchant: 'Tarjeta Departamental',
      investment: 'Inversión',
      mortgage: 'Hipoteca',
      otherAsset: 'Otros Activos',
      otherLiability: 'Otros Pasivos',
      other: 'Transferencia'
    };
    return labels[type] || 'Transferencia';
  }
  
  // Get transfer target account ID from payee
  function getTransferTargetId(tx: { transferAccountId?: string | null; payeeId?: string | null; payee?: string | null }): string | null {
    if (tx.transferAccountId) return tx.transferAccountId;
    if (tx.payeeId?.startsWith('Payee/Transfer:')) {
      return tx.payeeId.replace('Payee/Transfer:', '');
    }
    // Try to extract from payee name "Transfer: AccountName"
    if (tx.payee?.startsWith('Transfer')) {
      const accName = tx.payee.replace(/^Transfer\s*:\s*/, '');
      const acc = $accounts.find(a => a.name === accName);
      return acc?.id || null;
    }
    return null;
  }
  
  // Column configuration
  interface ColumnConfig {
    id: string;
    label: string;
    defaultWidth: number;
    minWidth: number;
    canHide: boolean;
    canResize: boolean;
  }
  
  const COLUMNS: ColumnConfig[] = [
    { id: 'flag', label: 'transactions.flag', defaultWidth: 4, minWidth: 4, canHide: true, canResize: false },
    { id: 'date', label: 'transactions.date', defaultWidth: 80, minWidth: 70, canHide: false, canResize: true },
    { id: 'account', label: 'transactions.account', defaultWidth: 100, minWidth: 60, canHide: true, canResize: true },
    { id: 'icon', label: '', defaultWidth: 18, minWidth: 18, canHide: false, canResize: false },
    { id: 'payee', label: 'transactions.payee', defaultWidth: 140, minWidth: 80, canHide: false, canResize: true },
    { id: 'category', label: 'transactions.category', defaultWidth: 200, minWidth: 100, canHide: false, canResize: true },
    { id: 'memo', label: 'transactions.memo', defaultWidth: 150, minWidth: 60, canHide: true, canResize: true },
    { id: 'outflow', label: 'transactions.outflow', defaultWidth: 85, minWidth: 60, canHide: false, canResize: true },
    { id: 'inflow', label: 'transactions.inflow', defaultWidth: 85, minWidth: 60, canHide: false, canResize: true },
    { id: 'balance', label: 'transactions.balance', defaultWidth: 90, minWidth: 60, canHide: true, canResize: true },
    { id: 'status', label: 'transactions.status', defaultWidth: 4, minWidth: 4, canHide: true, canResize: false },
  ];
  
  // Transaction indicator types
  type TxIndicator = 'transfer' | 'needsCategory' | 'needsApproval' | null;
  
  function getTxIndicator(tx: { transferAccountId?: string | null; categoryId?: string | null; accepted?: boolean; payee?: string | null }): TxIndicator {
    // Check if needs approval (imported transactions)
    if (tx.accepted === false) return 'needsApproval';
    // Check if transfer
    if (tx.transferAccountId || tx.payee?.startsWith('Transfer')) return 'transfer';
    // Check if needs category (non-transfer without category)
    if (!tx.categoryId && !tx.transferAccountId && !tx.payee?.startsWith('Transfer')) return 'needsCategory';
    return null;
  }
  
  // Load/save column settings from localStorage
  const COLUMN_SETTINGS_KEY = 'ynab4-tx-columns';
  
  interface ColumnSettings {
    widths: Record<string, number>;
    hidden: string[];
  }
  
  // Default hidden columns
  const DEFAULT_HIDDEN_COLUMNS = ['account', 'memo'];
  
  function loadColumnSettings(): ColumnSettings {
    if (!browser) return { widths: {}, hidden: DEFAULT_HIDDEN_COLUMNS };
    try {
      const saved = localStorage.getItem(COLUMN_SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { widths: {}, hidden: DEFAULT_HIDDEN_COLUMNS };
  }
  
  function saveColumnSettings(settings: ColumnSettings) {
    if (!browser) return;
    try {
      localStorage.setItem(COLUMN_SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }
  
  let columnSettings = $state<ColumnSettings>(loadColumnSettings());
  let showColumnSettings = $state(false);
  let compactMode = $state(true); // Compact mode by default
  let showGrid = $state(true); // Show grid lines by default
  
  // Get column width
  function getColumnWidth(id: string): number {
    return columnSettings.widths[id] || COLUMNS.find(c => c.id === id)?.defaultWidth || 80;
  }
  
  // Check if column is visible
  function isColumnVisible(id: string): boolean {
    const col = COLUMNS.find(c => c.id === id);
    if (!col?.canHide) return true;
    return !columnSettings.hidden.includes(id);
  }
  
  // Toggle column visibility
  function toggleColumnVisibility(id: string) {
    const col = COLUMNS.find(c => c.id === id);
    if (!col?.canHide) return;
    
    const hidden = [...columnSettings.hidden];
    const idx = hidden.indexOf(id);
    if (idx >= 0) {
      hidden.splice(idx, 1);
    } else {
      hidden.push(id);
    }
    columnSettings = { ...columnSettings, hidden };
    saveColumnSettings(columnSettings);
  }
  
  // Resize column
  let resizingColumn = $state<string | null>(null);
  let resizeStartX = 0;
  let resizeStartWidth = 0;
  
  function startResize(e: MouseEvent, columnId: string) {
    e.preventDefault();
    e.stopPropagation();
    resizingColumn = columnId;
    resizeStartX = e.clientX;
    resizeStartWidth = getColumnWidth(columnId);
    
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
  }
  
  function handleResize(e: MouseEvent) {
    if (!resizingColumn) return;
    const col = COLUMNS.find(c => c.id === resizingColumn);
    if (!col) return;
    
    const delta = e.clientX - resizeStartX;
    const newWidth = Math.max(col.minWidth, resizeStartWidth + delta);
    
    columnSettings = {
      ...columnSettings,
      widths: { ...columnSettings.widths, [resizingColumn]: newWidth }
    };
  }
  
  function stopResize() {
    if (resizingColumn) {
      saveColumnSettings(columnSettings);
      resizingColumn = null;
    }
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }

  interface Props {
    onAddTransaction?: () => void;
    onEditTransaction?: (id: string) => void;
  }

  let { onAddTransaction, onEditTransaction }: Props = $props();

  let searchQuery = $state('');
  let hideReconciled = $state(false);
  let showAccountsPanel = $state(true);
  let showDateNav = $state(false);
  
  // Sort order from user preferences: 'asc' = oldest first (top to bottom), 'desc' = newest first
  const sortOrder = $derived($transactionSortOrder);
  const isReverseScroll = $derived($reverseScroll);
  
  // Date filter state
  const currentDate = new Date();
  let selectedYear = $state(currentDate.getFullYear());
  let selectedMonth = $state(currentDate.getMonth());
  let showAllDates = $state(true);
  
  // Flag colors
  const FLAG_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
  let showFlagPicker = $state<string | null>(null);
  
  // Expanded splits
  let expandedSplits = $state<Set<string>>(new Set());
  
  function toggleSplit(txId: string) {
    const next = new Set(expandedSplits);
    if (next.has(txId)) {
      next.delete(txId);
    } else {
      next.add(txId);
    }
    expandedSplits = next;
  }
  
  function hasSplits(tx: typeof visibleTransactions[number]): boolean {
    return Array.isArray(tx.subTransactions) && tx.subTransactions.length > 0;
  }
  
  // Inline entry state (for new transactions)
  let isEditing = $state(false);
  let entryDate = $state(new Date().toISOString().split('T')[0]);
  let entryAccount = $state('');
  let entryPayee = $state('');
  let entryCategory = $state('');
  let entryMemo = $state('');
  let entryOutflow = $state('');
  let entryInflow = $state('');
  let entryFlag = $state<string | null>(null);
  
  // Editing existing transaction
  let editingTxId = $state<string | null>(null);
  let editTx = $state<{
    date: string;
    payee: string;
    category: string;
    memo: string;
    outflow: string;
    inflow: string;
    flag: string | null;
  } | null>(null);
  
  // Selection state for transaction sums
  let selectedTxIds = $state<Set<string>>(new Set());
  
  // Selection totals
  const selectionTotals = $derived.by(() => {
    if (selectedTxIds.size === 0) return null;
    let inflow = 0, outflow = 0;
    for (const tx of visibleTransactions) {
      if (selectedTxIds.has(tx.id)) {
        if (tx.amount >= 0) inflow += tx.amount;
        else outflow += tx.amount;
      }
    }
    return { count: selectedTxIds.size, inflow, outflow, net: inflow + outflow };
  });
  
  // Toggle transaction selection
  function toggleTxSelection(txId: string, event: MouseEvent) {
    const newSet = new Set(selectedTxIds);
    if (event.shiftKey && selectedTxIds.size > 0) {
      // Shift-click: select range
      const txIds = visibleTransactions.map(t => t.id);
      const lastSelected = Array.from(selectedTxIds).pop();
      const lastIdx = txIds.indexOf(lastSelected || '');
      const currentIdx = txIds.indexOf(txId);
      if (lastIdx >= 0 && currentIdx >= 0) {
        const [start, end] = lastIdx < currentIdx ? [lastIdx, currentIdx] : [currentIdx, lastIdx];
        for (let i = start; i <= end; i++) {
          newSet.add(txIds[i]);
        }
      }
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd-click: toggle single
      if (newSet.has(txId)) newSet.delete(txId);
      else newSet.add(txId);
    } else {
      // Regular click: toggle single (clear others if not already selected)
      if (newSet.has(txId) && newSet.size === 1) {
        newSet.clear();
      } else {
        newSet.clear();
        newSet.add(txId);
      }
    }
    selectedTxIds = newSet;
  }
  
  function clearTxSelection() {
    selectedTxIds = new Set();
  }
  
  function selectAllTx() {
    selectedTxIds = new Set(visibleTransactions.map(t => t.id));
  }
  
  // Autocomplete options for accounts
  const accountOptions = $derived(
    $accounts
      .filter(a => !a.closed && !a.hidden)
      .map(a => ({ value: a.id, label: a.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  );

  // Autocomplete options for payees
  const payeeOptions = $derived(
    $payees
      .filter(p => p.name && !p.isTombstone)
      .map(p => ({ value: p.name, label: p.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  );
  
  // Autocomplete options for categories (grouped by master category)
  const categoryOptions = $derived.by(() => {
    const opts: { value: string; label: string; group?: string }[] = [];
    
    // Group categories by master category
    const byMaster = new Map<string, typeof $categories>();
    for (const cat of $categories) {
      if (cat.isTombstone || !cat.name) continue;
      const masterName = cat.masterCategoryName || 'Sin categoría';
      if (!byMaster.has(masterName)) {
        byMaster.set(masterName, []);
      }
      byMaster.get(masterName)!.push(cat);
    }
    
    // Sort by master category order and add to options
    for (const [masterName, cats] of byMaster.entries()) {
      for (const cat of cats.sort((a, b) => (a.sortableIndex || 0) - (b.sortableIndex || 0))) {
        opts.push({
          value: cat.name,
          label: cat.name,
          group: masterName
        });
      }
    }
    
    return opts;
  });
  
  // Handle outflow/inflow exclusivity
  function handleOutflowInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    entryOutflow = value;
    if (value) entryInflow = '';
  }
  
  function handleInflowInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    entryInflow = value;
    if (value) entryOutflow = '';
  }
  
  // Handle keyboard events for entry
  function handleEntryKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cancelEntry();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      saveEntry();
    }
  }
  
  // Pagination for performance with infinite scroll
  const PAGE_SIZE = 100;
  let visibleCount = $state(PAGE_SIZE);
  let tableContainer: HTMLDivElement;
  
  // Infinite scroll handler
  function handleScroll(e: Event) {
    const target = e.target as HTMLDivElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    
    if (isReverseScroll) {
      // In reverse scroll mode with scaleY(-1):
      // Visual "top" (where older transactions appear) = actual scroll bottom
      // So we load more when scrollBottom is small (user scrolled to visual top)
      if (scrollBottom < 200 && hasMore) {
        visibleCount += PAGE_SIZE;
      }
    } else {
      // Normal mode: load more when near bottom
      if (scrollBottom < 200 && hasMore) {
        visibleCount += PAGE_SIZE;
      }
    }
  }
  
  // Toggle sort order
  // Use the store action for toggling sort order (saves to localStorage)
  function toggleSortOrder() {
    toggleTransactionSortOrder();
  }
  
  // Calculate date range from year/month selection
  const dateFilter = $derived.by(() => {
    if (showAllDates) {
      return { from: '', to: '' };
    }
    const from = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const to = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${lastDay}`;
    return { from, to };
  });

  const selectedAccount = $derived(
    $selectedAccountId ? $accounts.find((a) => a.id === $selectedAccountId) : null
  );

  // Filter transactions
  const filteredTransactions = $derived(
    $selectedAccountTransactions.filter((tx) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !tx.payee?.toLowerCase().includes(query) &&
          !tx.category?.toLowerCase().includes(query) &&
          !tx.memo?.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      // Hide reconciled
      if (hideReconciled && tx.cleared === 'Reconciled') {
        return false;
      }
      // Date filter
      if (dateFilter.from && tx.date && tx.date < dateFilter.from) {
        return false;
      }
      if (dateFilter.to && tx.date && tx.date > dateFilter.to) {
        return false;
      }
      return true;
    })
  );

  // Calculate totals
  const totals = $derived.by(() => {
    let working = 0;
    let cleared = 0;
    let reconciled = 0;
    
    for (const tx of filteredTransactions) {
      working += tx.amount;
      if (tx.cleared === 'Cleared' || tx.cleared === 'Reconciled') {
        cleared += tx.amount;
      }
      if (tx.cleared === 'Reconciled') {
        reconciled += tx.amount;
      }
    }
    
    return { working, cleared, reconciled, count: filteredTransactions.length };
  });

  // Group transactions by date for mobile view (uses visibleTransactions for performance)
  const groupedTransactions = $derived.by(() => {
    const groups: Map<string, typeof visibleTransactions> = new Map();
    
    for (const tx of visibleTransactions) {
      const date = tx.date || 'No date';
      if (!groups.has(date)) {
        groups.set(date, []);
      }
      groups.get(date)!.push(tx);
    }
    
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  });

  function formatDate(dateStr: string): string {
    if (dateStr === 'No date') return dateStr;
    try {
      // Return YYYY-MM-DD format directly if it's already in that format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      const d = new Date(dateStr + 'T12:00:00');
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return dateStr;
    }
  }

  function formatAmount(amount: number): string {
    return Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Parse flexible date input (supports dd/mm, dd/mm/yyyy, yyyy-mm-dd)
  function parseDateInput(input: string): string {
    if (!input) return new Date().toISOString().split('T')[0];

    // Already in ISO format
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return input;
    }

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    // dd/mm format - assume current year
    if (/^\d{1,2}\/\d{1,2}$/.test(input)) {
      const [day, month] = input.split('/').map(Number);
      return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // dd/mm/yyyy or dd/mm/yy format
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(input)) {
      const [day, month, year] = input.split('/').map(Number);
      const fullYear = year < 100 ? 2000 + year : year;
      return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // mm-dd-yyyy format (US)
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(input)) {
      const [month, day, year] = input.split('-').map(Number);
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Fallback: try to parse as Date
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    // Return as-is if we can't parse
    return input;
  }

  function getCategoryNameById(categoryId: string): string {
    const cat = $categories.find(c => c.entityId === categoryId);
    if (!cat) return '';
    if (cat.masterCategoryName) {
      return `${cat.masterCategoryName}: ${cat.name}`;
    }
    return cat.name;
  }

  function getStatusClass(cleared: string): string {
    switch (cleared) {
      case 'Reconciled': return 'reconciled';
      case 'Cleared': return 'cleared';
      default: return 'uncleared';
    }
  }

  // Calculate running balance
  const transactionsWithBalance = $derived.by(() => {
    if (!$selectedAccountId) {
      // Sort by date based on sortOrder, same date: inflows before outflows
      const sorted = [...filteredTransactions].sort((a, b) => {
        const dateCompare = (a.date || '').localeCompare(b.date || '');
        if (dateCompare !== 0) return sortOrder === 'desc' ? -dateCompare : dateCompare;
        const amountOrder = (a.amount >= 0 && b.amount < 0) ? -1 : (a.amount < 0 && b.amount >= 0) ? 1 : 0;
        return sortOrder === 'desc' ? -amountOrder : amountOrder;
      });
      return sorted.map(tx => ({ ...tx, runningBalance: 0 }));
    }
    
    // Get all transactions for this account sorted by date ascending (for running balance)
    // On same date: inflows before outflows to avoid negative intermediate balances
    const accountTxs = [...$transactions]
      .filter(tx => tx.accountId === $selectedAccountId)
      .sort((a, b) => {
        const dateCompare = (a.date || '').localeCompare(b.date || '');
        if (dateCompare !== 0) return dateCompare;
        // Same date: deposits (positive) before expenses (negative)
        if (a.amount >= 0 && b.amount < 0) return -1;
        if (a.amount < 0 && b.amount >= 0) return 1;
        return 0;
      });
    
    let runningBalance = 0;
    const balanceMap = new Map<string, number>();
    
    for (const tx of accountTxs) {
      runningBalance += tx.amount;
      balanceMap.set(tx.id, runningBalance);
    }
    
    // Apply sort order for display
    const withBalance = filteredTransactions.map(tx => ({
      ...tx,
      runningBalance: balanceMap.get(tx.id) || 0
    }));
    
    // Sort by date based on sortOrder
    // Same date: maintain inflows before outflows order for ASC, reverse for DESC
    withBalance.sort((a, b) => {
      const dateCompare = (a.date || '').localeCompare(b.date || '');
      if (dateCompare !== 0) return sortOrder === 'desc' ? -dateCompare : dateCompare;
      // Same date: in DESC mode, outflows first (reverse of ASC)
      const amountOrder = (a.amount >= 0 && b.amount < 0) ? -1 : (a.amount < 0 && b.amount >= 0) ? 1 : 0;
      return sortOrder === 'desc' ? -amountOrder : amountOrder;
    });
    
    return withBalance;
  });

  // Visible transactions (limited for performance)
  const visibleTransactions = $derived(transactionsWithBalance.slice(0, visibleCount));
  const hasMore = $derived(visibleCount < transactionsWithBalance.length);
  
  function loadMore() {
    visibleCount += PAGE_SIZE;
  }
  
  // Reset visible count when filters change
  $effect(() => {
    // Track filter dependencies
    searchQuery;
    hideReconciled;
    showAllDates;
    selectedYear;
    selectedMonth;
    $selectedAccountId;
    // Reset
    visibleCount = PAGE_SIZE;
  });

  // Start new entry
  function startEntry() {
    // Cancel any existing edit first
    cancelEdit();
    isEditing = true;
    entryDate = new Date().toISOString().split('T')[0];
    // Use selected account ID or first account ID
    entryAccount = selectedAccount?.id || $accounts[0]?.id || '';
    entryPayee = '';
    entryCategory = '';
    entryMemo = '';
    entryOutflow = '';
    entryInflow = '';
    entryFlag = null;
  }

  function cancelEntry() {
    isEditing = false;
    entryAccount = '';
  }

  function saveEntry() {
    // Check if edit mode is enabled
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Enable edit mode to add transactions' });
      return;
    }

    const client = $budgetInfo.client;
    if (!client) {
      addToast({ type: 'error', message: 'No budget loaded' });
      return;
    }

    // Use entry account or selected account or first account
    const accountId = entryAccount || selectedAccount?.id || $accounts[0]?.id;
    if (!accountId) {
      addToast({ type: 'error', message: 'Please select an account' });
      return;
    }

    // Parse amounts
    const outflowAmount = entryOutflow ? parseFloat(entryOutflow) : 0;
    const inflowAmount = entryInflow ? parseFloat(entryInflow) : 0;
    const amount = inflowAmount - outflowAmount;

    // Parse date (support flexible formats)
    const parsedDate = parseDateInput(entryDate);

    // Find or create payee
    let payeeId: string | undefined;
    if (entryPayee) {
      const existingPayee = $payees.find(p => p.name === entryPayee);
      payeeId = existingPayee?.entityId;
      // If payee doesn't exist, it will be created when syncing
    }

    // Find category
    let categoryId: string | undefined;
    if (entryCategory) {
      const cat = $categories.find(c => c.name === entryCategory);
      categoryId = cat?.entityId;
    }

    try {
      // Create the transaction via YnabClient
      const txData = {
        date: parsedDate,
        amount,
        accountId,
        payeeId,
        categoryId,
        memo: entryMemo || undefined,
        flagColor: entryFlag || undefined,
        cleared: 'Uncleared' as const
      };

      client.createTransaction(txData);

      // Track as pending change
      addPendingChange({
        type: 'transaction',
        action: 'create',
        entityId: 'new-' + Date.now(),
        entityName: entryPayee || 'New Transaction',
        data: txData
      });

      addToast({ type: 'success', message: 'Transaction added' });

      // Reset form
      resetEntry();
      isEditing = false;

      // Refresh transactions from store (client already updated the data)
      // In a real implementation, we would reload from the client
    } catch (error) {
      console.error('Failed to create transaction:', error);
      addToast({ type: 'error', message: 'Failed to add transaction' });
    }
  }

  function resetEntry() {
    entryDate = new Date().toISOString().split('T')[0];
    entryPayee = '';
    entryCategory = '';
    entryMemo = '';
    entryOutflow = '';
    entryInflow = '';
    entryFlag = null;
  }
  
  // Start editing an existing transaction
  function startEdit(tx: typeof visibleTransactions[number]) {
    // Cancel any new entry first
    isEditing = false;
    editingTxId = tx.id;
    
    const outflow = tx.amount < 0 ? Math.abs(tx.amount).toFixed(2) : '';
    const inflow = tx.amount > 0 ? tx.amount.toFixed(2) : '';
    
    editTx = {
      date: tx.date || '',
      payee: tx.payee || '',
      category: tx.category || '',
      memo: tx.memo || '',
      outflow,
      inflow,
      flag: tx.flag?.toLowerCase() || null
    };
  }
  
  function cancelEdit() {
    editingTxId = null;
    editTx = null;
  }
  
  function saveEdit() {
    if (!editingTxId || !editTx) return;
    
    // Store local reference to avoid null checks
    const txId = editingTxId;
    const txData = editTx;
    
    // Check if edit mode is enabled
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Enable edit mode to edit transactions' });
      return;
    }

    const client = $budgetInfo.client;
    if (!client) {
      addToast({ type: 'error', message: 'No budget loaded' });
      return;
    }

    // Parse amounts
    const outflowAmount = txData.outflow ? parseFloat(txData.outflow) : 0;
    const inflowAmount = txData.inflow ? parseFloat(txData.inflow) : 0;
    const amount = inflowAmount - outflowAmount;

    // Parse date
    const parsedDate = parseDateInput(txData.date);

    // Find payee
    let payeeId: string | undefined;
    if (txData.payee) {
      const existingPayee = $payees.find(p => p.name === txData.payee);
      payeeId = existingPayee?.entityId;
    }

    // Find category
    let categoryId: string | undefined;
    if (txData.category) {
      const cat = $categories.find(c => c.name === txData.category);
      categoryId = cat?.entityId;
    }

    try {
      // Get the transaction from the client
      const allTx = client.getTransactions() as Array<{
        entityId: string;
        date: string;
        amount: number;
        payeeId?: string;
        categoryId?: string;
        memo?: string;
        flagColor?: string;
        accountId?: string;
      }>;
      const tx = allTx.find(t => t.entityId === txId);
      
      if (tx) {
        // Update transaction properties
        (tx as any).date = parsedDate;
        (tx as any).amount = amount;
        (tx as any).payeeId = payeeId;
        (tx as any).categoryId = categoryId;
        (tx as any).memo = txData.memo;
        (tx as any).flagColor = txData.flag;

        // Track as pending change
        addPendingChange({
          type: 'transaction',
          action: 'update',
          entityId: txId,
          entityName: txData.payee || 'Transaction',
          data: {
            date: parsedDate,
            amount,
            payeeId,
            categoryId,
            memo: txData.memo,
            flagColor: txData.flag
          }
        });

        addToast({ type: 'success', message: 'Transaction updated' });
      }

      cancelEdit();
    } catch (error) {
      console.error('Failed to update transaction:', error);
      addToast({ type: 'error', message: 'Failed to update transaction' });
    }
  }
  
  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
  }
  
  // Global keyboard handler for edit mode
  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (editingTxId) {
        cancelEdit();
      } else if (isEditing) {
        cancelEntry();
      }
    }
  }
  
  // Add global keydown listener
  $effect(() => {
    if (editingTxId || isEditing) {
      document.addEventListener('keydown', handleGlobalKeydown);
      return () => {
        document.removeEventListener('keydown', handleGlobalKeydown);
      };
    }
  });
  
  function handleEditOutflow(e: Event) {
    if (!editTx) return;
    const value = (e.target as HTMLInputElement).value;
    editTx.outflow = value;
    if (value) editTx.inflow = '';
  }
  
  function handleEditInflow(e: Event) {
    if (!editTx) return;
    const value = (e.target as HTMLInputElement).value;
    editTx.inflow = value;
    if (value) editTx.outflow = '';
  }
  
  // Parse flexible date input (e.g., "20/12" -> "2025-12-20")
  function parseFlexibleDate(input: string): string {
    const trimmed = input.trim();
    const now = new Date();
    const year = now.getFullYear();
    
    // Try DD/MM format
    const ddmmMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (ddmmMatch) {
      const day = ddmmMatch[1].padStart(2, '0');
      const month = ddmmMatch[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Try DD/MM/YY or DD/MM/YYYY
    const fullMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (fullMatch) {
      const day = fullMatch[1].padStart(2, '0');
      const month = fullMatch[2].padStart(2, '0');
      let y = fullMatch[3];
      if (y.length === 2) y = `20${y}`;
      return `${y}-${month}-${day}`;
    }
    
    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    return input;
  }
  
  function handleDateInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const parsed = parseFlexibleDate(target.value);
    if (parsed !== target.value && /^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
      entryDate = parsed;
    }
  }

  const hasDateFilter = $derived(!showAllDates);
</script>

<div class="transactions-view">
  <!-- Accounts Panel -->
  {#if showAccountsPanel && !$isMobile}
    <AccountsPanel />
  {/if}

  <!-- Main Content -->
  <div class="transactions-main">
    <!-- Toolbar -->
    <div class="tx-toolbar">
      <div class="tx-toolbar-left">
        <!-- Panel toggle -->
        {#if !$isMobile}
          <button 
            class="tx-icon-btn"
            onclick={() => showAccountsPanel = !showAccountsPanel}
            title={showAccountsPanel ? $t('common.hidePanel') : $t('common.showPanel')}
          >
            {#if showAccountsPanel}
              <PanelLeftClose class="h-4 w-4" />
            {:else}
              <PanelLeft class="h-4 w-4" />
            {/if}
          </button>
        {/if}
        
        <!-- Account name display -->
        <span class="account-display">
          <span class="account-name">{selectedAccount?.name || $t('accounts.allAccounts')}</span>
          {#if selectedAccount}
            <span class="tx-balance" class:positive={totals.working >= 0} class:negative={totals.working < 0}>
              {formatCurrency(totals.working)}
            </span>
          {/if}
        </span>
      </div>
      
      <div class="tx-toolbar-actions">
        <!-- Date nav toggle -->
        <button 
          class="tx-icon-btn"
          class:active={showDateNav}
          onclick={() => showDateNav = !showDateNav}
          title={$t('transactions.toggleDateFilter')}
        >
          <Calendar class="h-4 w-4" />
          {#if !showAllDates}
            <span class="date-indicator">{selectedYear}/{selectedMonth + 1}</span>
          {/if}
        </button>
        
        <button 
          class="tx-icon-btn"
          class:active={sortOrder === 'asc'}
          onclick={toggleSortOrder}
          title={sortOrder === 'desc' ? $t('transactions.oldestFirst') : $t('transactions.newestFirst')}
        >
          {#if sortOrder === 'desc'}
            <ChevronDown class="h-4 w-4" />
          {:else}
            <ChevronUp class="h-4 w-4" />
          {/if}
        </button>
        
        <button 
          class="tx-icon-btn"
          class:active={isReverseScroll}
          onclick={toggleReverseScroll}
          title={isReverseScroll ? 'Scroll normal' : 'Scroll invertido (tipo chat)'}
        >
          <ArrowUpDown class="h-4 w-4" />
        </button>
        
        <button 
          class="tx-icon-btn"
          class:active={hideReconciled}
          onclick={() => hideReconciled = !hideReconciled}
          title={hideReconciled ? $t('transactions.showAll') : $t('transactions.hideReconciled')}
        >
          <Lock class="h-4 w-4" />
        </button>
        
        <button 
          class="tx-icon-btn"
          class:active={!compactMode}
          onclick={() => compactMode = !compactMode}
          title={compactMode ? 'Modo detallado' : 'Modo compacto'}
        >
          {#if compactMode}
            <LayoutList class="h-4 w-4" />
          {:else}
            <List class="h-4 w-4" />
          {/if}
        </button>
        
        <button 
          class="tx-icon-btn"
          class:active={showGrid}
          onclick={() => showGrid = !showGrid}
          title={showGrid ? 'Ocultar grilla' : 'Mostrar grilla'}
        >
          <Grid3x3 class="h-4 w-4" />
        </button>
        
        <div class="column-settings-wrapper">
          <button 
            class="tx-icon-btn"
            class:active={showColumnSettings}
            onclick={() => showColumnSettings = !showColumnSettings}
            title={$t('transactions.columnSettings') || 'Columnas'}
          >
            <Settings2 class="h-4 w-4" />
          </button>
          
          {#if showColumnSettings}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="column-settings-dropdown" onclick={(e) => e.stopPropagation()}>
              <div class="column-settings-header">
                <span>{$t('transactions.visibleColumns') || 'Columnas visibles'}</span>
                <button class="column-settings-close" onclick={() => showColumnSettings = false}>
                  <X class="h-3 w-3" />
                </button>
              </div>
              <div class="column-settings-list">
                {#each COLUMNS.filter(c => c.canHide) as col (col.id)}
                  <label class="column-toggle">
                    <input 
                      type="checkbox" 
                      checked={isColumnVisible(col.id)}
                      onchange={() => toggleColumnVisibility(col.id)}
                    />
                    <span>{col.label ? $t(col.label) : col.id}</span>
                  </label>
                {/each}
              </div>
              <div class="column-settings-hint">
                {$t('transactions.resizeHint') || 'Arrastra bordes de columnas para ajustar ancho'}
              </div>
            </div>
          {/if}
        </div>
        
        <div class="tx-search">
          <Search class="h-4 w-4 tx-search-icon" />
          <input
            type="text"
            placeholder={$t('common.search')}
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <button class="tx-search-clear" onclick={() => searchQuery = ''}>×</button>
          {/if}
        </div>
      </div>
    </div>
    
    <!-- Date Navigation -->
    {#if showDateNav}
      <DateNavigation
        {selectedYear}
        {selectedMonth}
        showAll={showAllDates}
        onYearChange={(year) => selectedYear = year}
        onMonthChange={(month) => selectedMonth = month}
        onShowAllChange={(show) => showAllDates = show}
      />
    {/if}

    <!-- Table (Desktop) -->
    <div class="tx-table-container" class:resizing={resizingColumn !== null} class:reverse-scroll={isReverseScroll} bind:this={tableContainer} onscroll={handleScroll}>
      <table class="tx-table" class:show-grid={showGrid}>
        <thead>
          <tr>
            {#if isColumnVisible('flag')}
              <th class="col-flag"></th>
            {/if}
            <th class="col-date resizable" style="width: {getColumnWidth('date')}px">
              <button class="sort-header" onclick={toggleSortOrder}>
                {$t('transactions.date')}
                {#if sortOrder === 'desc'}
                  <ChevronDown class="h-3 w-3" />
                {:else}
                  <ChevronUp class="h-3 w-3" />
                {/if}
              </button>
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
              <div class="resize-handle" role="separator" aria-orientation="vertical" onmousedown={(e) => startResize(e, 'date')}></div>
            </th>
            {#if !selectedAccount && isColumnVisible('account')}
              <th class="col-account resizable" style="width: {getColumnWidth('account')}px">
                {$t('transactions.account')}
                <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
                <div class="resize-handle" role="separator" aria-orientation="vertical" onmousedown={(e) => startResize(e, 'account')}></div>
              </th>
            {/if}
            <th class="col-icon"></th>
            <th class="col-payee resizable" style="width: {getColumnWidth('payee')}px">
              {$t('transactions.payee')}
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
              <div class="resize-handle" role="separator" aria-orientation="vertical" onmousedown={(e) => startResize(e, 'payee')}></div>
            </th>
            <th class="col-category resizable" style="width: {getColumnWidth('category')}px">
              {$t('transactions.category')}
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
              <div class="resize-handle" role="separator" aria-orientation="vertical" onmousedown={(e) => startResize(e, 'category')}></div>
            </th>
            <th class="col-outflow resizable" style="width: {getColumnWidth('outflow')}px">
              {$t('transactions.outflow')}
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
              <div class="resize-handle" role="separator" aria-orientation="vertical" onmousedown={(e) => startResize(e, 'outflow')}></div>
            </th>
            <th class="col-inflow resizable" style="width: {getColumnWidth('inflow')}px">
              {$t('transactions.inflow')}
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
              <div class="resize-handle" role="separator" aria-orientation="vertical" onmousedown={(e) => startResize(e, 'inflow')}></div>
            </th>
            {#if selectedAccount && isColumnVisible('balance')}
              <th class="col-balance resizable" style="width: {getColumnWidth('balance')}px">
                {$t('transactions.balance')}
                <!-- svelte-ignore a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
                <div class="resize-handle" role="separator" aria-orientation="vertical" onmousedown={(e) => startResize(e, 'balance')}></div>
              </th>
            {/if}
            {#if isColumnVisible('status')}
              <th class="col-status"></th>
            {/if}
          </tr>
        </thead>
        <tbody>
          <!-- Top entry row (when sortOrder is desc - newest first) -->
          {#if sortOrder === 'desc' && $isEditMode}
            {#if isEditing}
              <tr class="tx-entry-row">
                <td class="col-flag">
                  <div class="flag-tag-wrapper">
                    <button 
                      class="flag-tag {entryFlag ? `flag-${entryFlag}` : 'flag-empty'}"
                      onclick={() => showFlagPicker = showFlagPicker === 'entry' ? null : 'entry'}
                      type="button"
                      aria-label="Select flag"
                    ></button>
                    {#if showFlagPicker === 'entry'}
                      <div class="flag-picker">
                        <button 
                          class="flag-option flag-none" 
                          onclick={() => { entryFlag = null; showFlagPicker = null; }}
                          type="button"
                          aria-label="Clear flag"
                        >✕</button>
                        {#each FLAG_COLORS as color}
                          <button
                            class="flag-option flag-{color}"
                            onclick={() => { entryFlag = color; showFlagPicker = null; }}
                            type="button"
                            aria-label="Flag {color}"
                          ></button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </td>
                <td class="col-date">
                  <input 
                    type="text" 
                    class="inline-input" 
                    bind:value={entryDate}
                    placeholder="DD/MM"
                    onblur={handleDateInput}
                    onkeydown={handleEntryKeydown}
                  />
                </td>
                {#if !selectedAccount && isColumnVisible('account')}
                  <td class="col-account">
                    <Autocomplete
                      options={accountOptions}
                      value={entryAccount}
                      placeholder={$t('transactions.account')}
                      onSelect={(v) => entryAccount = v}
                    />
                  </td>
                {/if}
                <td class="col-icon"></td>
                <td class="col-payee">
                  <Autocomplete
                    options={payeeOptions}
                    value={entryPayee}
                    placeholder={$t('transactions.payee')}
                    onSelect={(v) => entryPayee = v}
                    onCreate={(v) => entryPayee = v}
                  />
                </td>
                <td class="col-category">
                  <div class="category-entry">
                    <Autocomplete
                      options={categoryOptions}
                      value={entryCategory}
                      placeholder={$t('transactions.category')}
                      onSelect={(v) => entryCategory = v}
                    />
                    <input 
                      type="text" 
                      class="inline-input memo-input" 
                      placeholder={$t('transactions.memo')}
                      bind:value={entryMemo}
                      onkeydown={handleEntryKeydown}
                    />
                  </div>
                </td>
                <td class="col-outflow">
                  <input 
                    type="text" 
                    class="inline-input amount-input" 
                    placeholder=""
                    value={entryOutflow}
                    oninput={handleOutflowInput}
                    onkeydown={handleEntryKeydown}
                  />
                </td>
                <td class="col-inflow">
                  <input 
                    type="text" 
                    class="inline-input amount-input" 
                    placeholder=""
                    value={entryInflow}
                    oninput={handleInflowInput}
                    onkeydown={handleEntryKeydown}
                  />
                </td>
                {#if selectedAccount}
                  <td class="col-balance"></td>
                {/if}
                <td class="col-status">
                  <div class="entry-actions">
                    <button class="entry-save-btn" onclick={saveEntry} title={$t('common.save')}>
                      <Save class="h-3 w-3" />
                    </button>
                    <button class="entry-cancel-btn" onclick={cancelEntry} title={$t('common.cancel')} onkeydown={handleEntryKeydown}>
                      <X class="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            {:else}
              <!-- Add transaction row (discrete) TOP -->
              <tr class="tx-add-row">
                <td class="col-flag">
                  <button class="add-btn" onclick={startEntry}>
                    <Plus class="h-3 w-3" />
                  </button>
                </td>
                <td class="col-date">
                  <button class="add-btn add-text" onclick={startEntry}>{$t('transactions.addTransaction')}</button>
                </td>
                {#if !selectedAccount && isColumnVisible('account')}
                  <td class="col-account"></td>
                {/if}
                <td class="col-icon"></td>
                <td class="col-payee"></td>
                <td class="col-category"></td>
                <td class="col-outflow"></td>
                <td class="col-inflow"></td>
                {#if selectedAccount}
                  <td class="col-balance"></td>
                {/if}
                <td class="col-status"></td>
              </tr>
            {/if}
          {/if}
          
          {#each visibleTransactions as tx (tx.id)}
            {@const isOutflow = tx.amount < 0}
            {@const isInflow = tx.amount > 0}
            {@const categoryParts = (tx.category || '').split(': ')}
            {@const subCategory = categoryParts.length > 1 ? categoryParts[1] : categoryParts[0]}
            {@const masterCategory = categoryParts.length > 1 ? categoryParts[0] : ''}
            {@const isBeingEdited = editingTxId === tx.id}
            
            {#if isBeingEdited && editTx}
              <!-- Editing row -->
              <tr class="tx-edit-row">
                <td class="col-flag">
                  <div class="flag-tag-wrapper">
                    <button 
                      class="flag-tag {editTx?.flag ? `flag-${editTx.flag}` : 'flag-empty'}"
                      onclick={() => showFlagPicker = showFlagPicker === `edit-${tx.id}` ? null : `edit-${tx.id}`}
                      type="button"
                      aria-label="Select flag"
                    ></button>
                    {#if showFlagPicker === `edit-${tx.id}`}
                      <div class="flag-picker">
                        <button 
                          class="flag-option flag-none" 
                          onclick={() => { if (editTx) editTx.flag = null; showFlagPicker = null; }}
                          type="button"
                          aria-label="Clear flag"
                        >✕</button>
                        {#each FLAG_COLORS as color}
                          <button
                            class="flag-option flag-{color}"
                            onclick={() => { if (editTx) editTx.flag = color; showFlagPicker = null; }}
                            type="button"
                            aria-label="Flag {color}"
                          ></button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </td>
                <td class="col-date">
                  <input 
                    type="text" 
                    class="inline-input" 
                    bind:value={editTx!.date}
                    onkeydown={handleEditKeydown}
                  />
                </td>
                {#if !selectedAccount && isColumnVisible('account')}
                  <td class="col-account">{tx.accountName}</td>
                {/if}
                <td class="col-icon">
                  <span class="tx-icon transfer" title="Transferencia">{tx.transferAccountId ? '↔' : ''}</span>
                </td>
                <td class="col-payee">
                  <Autocomplete
                    options={payeeOptions}
                    value={editTx!.payee}
                    placeholder={$t('transactions.payee')}
                    onSelect={(v) => { if (editTx) editTx.payee = v; }}
                    onCreate={(v) => { if (editTx) editTx.payee = v; }}
                  />
                </td>
                <td class="col-category">
                  <div class="category-entry">
                    <Autocomplete
                      options={categoryOptions}
                      value={editTx!.category}
                      placeholder={$t('transactions.category')}
                      onSelect={(v) => { if (editTx) editTx.category = v; }}
                    />
                    <input 
                      type="text" 
                      class="inline-input memo-input" 
                      placeholder={$t('transactions.memo')}
                      bind:value={editTx!.memo}
                      onkeydown={handleEditKeydown}
                    />
                  </div>
                </td>
                <td class="col-outflow">
                  <input 
                    type="text" 
                    class="inline-input amount-input" 
                    placeholder=""
                    value={editTx.outflow}
                    oninput={handleEditOutflow}
                    onkeydown={handleEditKeydown}
                  />
                </td>
                <td class="col-inflow">
                  <input 
                    type="text" 
                    class="inline-input amount-input" 
                    placeholder=""
                    value={editTx.inflow}
                    oninput={handleEditInflow}
                    onkeydown={handleEditKeydown}
                  />
                </td>
                {#if selectedAccount}
                  <td class="col-balance"></td>
                {/if}
                <td class="col-status">
                  <div class="entry-actions">
                    <button class="entry-save-btn" onclick={saveEdit} title={$t('common.save')}>
                      <Save class="h-3 w-3" />
                    </button>
                    <button class="entry-cancel-btn" onclick={cancelEdit} title={$t('common.cancel')}>
                      <X class="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            {:else}
              {@const txHasSplits = hasSplits(tx)}
              {@const isExpanded = expandedSplits.has(tx.id)}
              {@const isTransfer = !!(tx.transferAccountId || tx.payee?.startsWith('Transfer'))}
              {@const transferName = tx.payee?.replace(/^Transfer\s*:\s*/, '') || ''}
              {@const transferTargetId = isTransfer ? getTransferTargetId(tx) : null}
              {@const txIndicator = getTxIndicator(tx)}
              {@const isTxSelected = selectedTxIds.has(tx.id)}
              <!-- Display row -->
              <tr 
                class="tx-row"
                class:has-splits={txHasSplits}
                class:compact={compactMode}
                class:needs-approval={txIndicator === 'needsApproval'}
                class:selected={isTxSelected}
                ondblclick={() => startEdit(tx)}
                onclick={(e) => { toggleTxSelection(tx.id, e); if (txHasSplits && !e.ctrlKey && !e.metaKey && !e.shiftKey) toggleSplit(tx.id); }}
              >
                {#if isColumnVisible('flag')}
                  <td class="col-flag {tx.flag ? `flag-${tx.flag.toLowerCase()}` : ''}"></td>
                {/if}
                <td class="col-date">{formatDate(tx.date)}</td>
                {#if !selectedAccount && isColumnVisible('account')}
                  <td class="col-account">{tx.accountName}</td>
                {/if}
                <td class="col-icon">
                  {#if txIndicator === 'transfer'}
                    <span class="tx-icon transfer" title="Transferencia">↔</span>
                  {:else if txIndicator === 'needsApproval'}
                    <span class="tx-icon warning" title="Necesita aprobación">⚠</span>
                  {:else if txIndicator === 'needsCategory'}
                    <span class="tx-icon error" title="Sin categoría">!</span>
                  {/if}
                </td>
                <td class="col-payee">
                  <span class="payee-name">{isTransfer ? transferName : (tx.payee || '')}</span>
                </td>
                <td class="col-category">
                  <div class="category-cell">
                    {#if txHasSplits}
                      <span class="split-indicator" class:expanded={isExpanded}>
                        <Split class="h-3 w-3" />
                        <span>{$t('transactions.split')} ({tx.subTransactions?.length})</span>
                      </span>
                    {:else if isTransfer}
                      <span class="transfer-category">
                        <strong>{getTransferCategoryLabel(transferTargetId)}</strong>
                        <span class="transfer-label"> · Transferencia</span>
                      </span>
                    {:else if subCategory}
                      <span class="category-display">
                        <strong class="cat-sub">{subCategory}</strong>
                        {#if masterCategory}
                          <span class="cat-master"> · {masterCategory}</span>
                        {/if}
                      </span>
                    {/if}
                    {#if isColumnVisible('memo') && tx.memo}
                      <span class="memo-below">{tx.memo}</span>
                    {/if}
                  </div>
                </td>
                <td class="col-outflow">
                  {isOutflow ? formatAmount(tx.amount) : ''}
                </td>
                <td class="col-inflow">
                  {isInflow ? formatAmount(tx.amount) : ''}
                </td>
                {#if selectedAccount && isColumnVisible('balance')}
                  <td class="col-balance" class:positive={tx.runningBalance >= 0} class:negative={tx.runningBalance < 0}>
                    {formatAmount(tx.runningBalance)}
                  </td>
                {/if}
                {#if isColumnVisible('status')}
                  <td class="col-status {getStatusClass(tx.cleared)}"></td>
                {/if}
              </tr>
              
              <!-- Split details row -->
              {#if txHasSplits && isExpanded}
                <tr class="split-details-row">
                  <td colspan="99">
                    <div class="split-details">
                      <div class="split-header">
                        <span class="split-col-category">{$t('transactions.category')}</span>
                        <span class="split-col-memo">{$t('transactions.memo')}</span>
                        <span class="split-col-outflow">{$t('transactions.outflow')}</span>
                        <span class="split-col-inflow">{$t('transactions.inflow')}</span>
                      </div>
                      {#each tx.subTransactions || [] as split, index}
                        {@const splitAmount = split.amount ?? 0}
                        {@const splitIsOutflow = splitAmount < 0}
                        {@const splitIsInflow = splitAmount > 0}
                        {@const splitCategoryName = getCategoryNameById(split.categoryId || '')}
                        {@const splitCategoryParts = (splitCategoryName || '').split(': ')}
                        {@const splitSubCategory = splitCategoryParts.length > 1 ? splitCategoryParts[1] : splitCategoryParts[0]}
                        {@const splitMasterCategory = splitCategoryParts.length > 1 ? splitCategoryParts[0] : ''}
                        <div class="split-row">
                          <span class="split-col-category">
                            <strong>{splitSubCategory || '-'}</strong>
                            {#if splitMasterCategory}
                              <span class="split-master"> · {splitMasterCategory}</span>
                            {/if}
                          </span>
                          <span class="split-col-memo">{split.memo || ''}</span>
                          <span class="split-col-outflow" class:has-value={splitIsOutflow}>
                            {splitIsOutflow ? formatAmount(splitAmount) : ''}
                          </span>
                          <span class="split-col-inflow" class:has-value={splitIsInflow}>
                            {splitIsInflow ? formatAmount(splitAmount) : ''}
                          </span>
                        </div>
                      {/each}
                    </div>
                  </td>
                </tr>
              {/if}
            {/if}
          {/each}
          
          <!-- Bottom entry row (when sortOrder is asc - oldest first) -->
          {#if sortOrder === 'asc' && $isEditMode}
            {#if isEditing}
              <tr class="tx-entry-row">
                <td class="col-flag">
                  <div class="flag-tag-wrapper">
                    <button 
                      class="flag-tag {entryFlag ? `flag-${entryFlag}` : 'flag-empty'}"
                      onclick={() => showFlagPicker = showFlagPicker === 'entry-bottom' ? null : 'entry-bottom'}
                      type="button"
                      aria-label="Select flag"
                    ></button>
                    {#if showFlagPicker === 'entry-bottom'}
                      <div class="flag-picker flag-picker-up">
                        <button 
                          class="flag-option flag-none" 
                          onclick={() => { entryFlag = null; showFlagPicker = null; }}
                          type="button"
                          aria-label="Clear flag"
                        >✕</button>
                        {#each FLAG_COLORS as color}
                          <button
                            class="flag-option flag-{color}"
                            onclick={() => { entryFlag = color; showFlagPicker = null; }}
                            type="button"
                            aria-label="Flag {color}"
                          ></button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </td>
                <td class="col-date">
                  <input 
                    type="text" 
                    class="inline-input" 
                    bind:value={entryDate}
                    placeholder="DD/MM"
                    onblur={handleDateInput}
                    onkeydown={handleEntryKeydown}
                  />
                </td>
                {#if !selectedAccount && isColumnVisible('account')}
                  <td class="col-account">
                    <Autocomplete
                      options={accountOptions}
                      value={entryAccount}
                      placeholder={$t('transactions.account')}
                      onSelect={(v) => entryAccount = v}
                    />
                  </td>
                {/if}
                <td class="col-icon"></td>
                <td class="col-payee">
                  <Autocomplete
                    options={payeeOptions}
                    value={entryPayee}
                    placeholder={$t('transactions.payee')}
                    onSelect={(v) => entryPayee = v}
                    onCreate={(v) => entryPayee = v}
                  />
                </td>
                <td class="col-category">
                  <div class="category-entry">
                    <Autocomplete
                      options={categoryOptions}
                      value={entryCategory}
                      placeholder={$t('transactions.category')}
                      onSelect={(v) => entryCategory = v}
                    />
                    <input 
                      type="text" 
                      class="inline-input memo-input" 
                      placeholder={$t('transactions.memo')}
                      bind:value={entryMemo}
                      onkeydown={handleEntryKeydown}
                    />
                  </div>
                </td>
                <td class="col-outflow">
                  <input 
                    type="text" 
                    class="inline-input amount-input" 
                    placeholder=""
                    value={entryOutflow}
                    oninput={handleOutflowInput}
                    onkeydown={handleEntryKeydown}
                  />
                </td>
                <td class="col-inflow">
                  <input 
                    type="text" 
                    class="inline-input amount-input" 
                    placeholder=""
                    value={entryInflow}
                    oninput={handleInflowInput}
                    onkeydown={handleEntryKeydown}
                  />
                </td>
                {#if selectedAccount}
                  <td class="col-balance"></td>
                {/if}
                <td class="col-status">
                  <div class="entry-actions">
                    <button class="entry-save-btn" onclick={saveEntry} title={$t('common.save')}>
                      <Save class="h-3 w-3" />
                    </button>
                    <button class="entry-cancel-btn" onclick={cancelEntry} title={$t('common.cancel')} onkeydown={handleEntryKeydown}>
                      <X class="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            {:else}
              <!-- Add transaction row (discrete) at bottom -->
              <tr class="tx-add-row">
                <td class="col-flag">
                  <button class="add-btn" onclick={startEntry}>
                    <Plus class="h-3.5 w-3.5" />
                  </button>
                </td>
                <td class="col-date">
                  <button class="add-btn add-text" onclick={startEntry}>{$t('transactions.addTransaction')}</button>
                </td>
                {#if !selectedAccount && isColumnVisible('account')}
                  <td class="col-account"></td>
                {/if}
                <td class="col-icon"></td>
                <td class="col-payee"></td>
                <td class="col-category"></td>
                <td class="col-outflow"></td>
                <td class="col-inflow"></td>
                {#if selectedAccount}
                  <td class="col-balance"></td>
                {/if}
                <td class="col-status"></td>
              </tr>
            {/if}
          {/if}
          
          <!-- Loading indicator for infinite scroll (hidden in reverse mode) -->
          {#if hasMore && !isReverseScroll}
            <tr class="tx-loading-row">
              <td colspan={selectedAccount ? 9 : 9}>
                <span class="loading-text">{$t('common.loading')}</span>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
    
    <!-- Selection summary bar -->
    {#if selectionTotals}
      <div class="selection-bar">
        <div class="selection-info">
          <span class="selection-count">{selectionTotals.count} seleccionadas</span>
          <button class="selection-action" onclick={selectAllTx}>Todas</button>
          <button class="selection-action" onclick={clearTxSelection}>Limpiar</button>
        </div>
        <div class="selection-totals">
          <span class="total-item outflow">
            <span class="total-label">Cargo:</span>
            <span class="total-value">{formatCurrency(selectionTotals.outflow)}</span>
          </span>
          <span class="total-item inflow">
            <span class="total-label">Abono:</span>
            <span class="total-value">{formatCurrency(selectionTotals.inflow)}</span>
          </span>
          <span class="total-item net" class:positive={selectionTotals.net >= 0} class:negative={selectionTotals.net < 0}>
            <span class="total-label">Neto:</span>
            <span class="total-value">{formatCurrency(selectionTotals.net)}</span>
          </span>
        </div>
      </div>
    {/if}

    <!-- Cards (Mobile) -->
    <div class="tx-cards-container">
      {#each groupedTransactions as [date, txs]}
        <div class="tx-date-group">
          <div class="tx-date-header">{formatDate(date)}</div>
          {#each txs as tx (tx.id)}
            {@const isOutflow = tx.amount < 0}
            <button
              class="tx-card"
              onclick={() => onEditTransaction?.(tx.id)}
            >
              <div class="tx-card-status {getStatusClass(tx.cleared)}"></div>
              <div class="tx-card-main">
                <div class="tx-card-payee">
                  {#if tx.transferAccountId}
                    <span class="transfer-payee" class:outgoing={isOutflow} class:incoming={!isOutflow}>
                      {tx.payee || 'Transfer'}
                    </span>
                  {:else}
                    {tx.payee || $t('payees.unknown')}
                  {/if}
                </div>
                <div class="tx-card-category">
                  {tx.category || '-'}
                </div>
              </div>
              <div class="tx-card-amount" class:negative={isOutflow} class:positive={!isOutflow}>
                {isOutflow ? '-' : '+'}{formatAmount(tx.amount)}
              </div>
            </button>
          {/each}
        </div>
      {/each}
    </div>

    <!-- Status Bar -->
    <div class="tx-status-bar">
      <span class="status-item">
        <span class="status-label">{$t('transactions.count')}:</span>
        <span class="status-value">{totals.count.toLocaleString()}</span>
      </span>
      {#if selectedAccount}
        <span class="status-separator">|</span>
        <span class="status-item">
          <span class="status-label">{$t('transactions.working')}:</span>
          <span class="status-value" class:positive={totals.working >= 0} class:negative={totals.working < 0}>
            {formatAmount(totals.working)}
          </span>
        </span>
        <span class="status-item">
          <span class="status-label">{$t('transactions.cleared')}:</span>
          <span class="status-value" class:positive={totals.cleared >= 0} class:negative={totals.cleared < 0}>
            {formatAmount(totals.cleared)}
          </span>
        </span>
      {/if}
    </div>
  </div>

  <!-- Mobile FAB -->
  {#if $isMobile && onAddTransaction}
    <button class="tx-fab" onclick={onAddTransaction}>
      <Plus class="h-6 w-6" />
      <span>{$t('transactions.addTransaction')}</span>
    </button>
  {/if}
</div>

<style>
  .transactions-view {
    display: flex;
    height: 100%;
    background: var(--background);
  }

  .transactions-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  /* Toolbar */
  .tx-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .tx-toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tx-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .tx-icon-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .tx-icon-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  /* Account Display */
  .account-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .account-name {
    font-weight: 600;
    font-size: 0.8rem;
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Date Indicator */
  .date-indicator {
    font-size: 0.6rem;
    background: var(--primary);
    color: var(--primary-foreground);
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    margin-left: 0.25rem;
    font-weight: 600;
  }

  /* Flag Tag for entry/edit rows */
  .flag-tag-wrapper {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
  }

  .flag-tag {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 24px;
    border: none;
    border-radius: 0;
    cursor: pointer;
    transition: all 0.15s;
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
  }

  .flag-tag.flag-empty {
    background: transparent;
    border: none;
  }

  .flag-tag.flag-empty:hover {
    background: var(--muted);
  }

  /* Flag colors for entry/edit rows */
  .flag-tag.flag-red { background: #e74c3c !important; }
  .flag-tag.flag-orange { background: #e67e22 !important; }
  .flag-tag.flag-yellow { background: #f1c40f !important; }
  .flag-tag.flag-green { background: #27ae60 !important; }
  .flag-tag.flag-blue { background: #3498db !important; }
  .flag-tag.flag-purple { background: #9b59b6 !important; }

  .flag-picker {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 60;
    display: flex;
    gap: 2px;
    padding: 4px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .flag-picker.flag-picker-up {
    top: auto;
    bottom: 100%;
  }

  .flag-option {
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .flag-option:hover {
    transform: scale(1.15);
  }

  .flag-option.flag-none {
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 10px;
    line-height: 18px;
  }

  /* Flag option colors - solid bright colors matching YNAB4 */
  .flag-option.flag-red { background: #e74c3c !important; }
  .flag-option.flag-orange { background: #e67e22 !important; }
  .flag-option.flag-yellow { background: #f1c40f !important; }
  .flag-option.flag-green { background: #27ae60 !important; }
  .flag-option.flag-blue { background: #3498db !important; }
  .flag-option.flag-purple { background: #9b59b6 !important; }


  .account-item-balance {
    font-family: var(--font-family-mono);
    font-size: 0.8125rem;
    font-weight: 600;
    font-feature-settings: "tnum";
    flex-shrink: 0;
  }

  .account-item-balance.positive { color: var(--success); }
  .account-item-balance.negative { color: var(--destructive); }

  .tx-balance {
    font-family: var(--font-family-mono);
    font-size: 0.875rem;
    font-weight: 600;
    font-feature-settings: "tnum";
  }

  .tx-balance.positive { color: var(--success); }
  .tx-balance.negative { color: var(--destructive); }


  .date-filter-clear {
    width: 100%;
    padding: 0.375rem;
    border: none;
    border-radius: 4px;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .date-filter-clear:hover {
    background: var(--destructive);
    color: white;
  }

  .tx-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .tx-search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .tx-search input {
    width: 160px;
    height: 32px;
    padding: 0 1.75rem 0 2rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.8125rem;
  }

  .tx-search input:focus {
    outline: none;
    border-color: var(--ring);
  }

  .tx-search-icon {
    position: absolute;
    left: 0.625rem;
    color: var(--muted-foreground);
    pointer-events: none;
  }

  .tx-search-clear {
    position: absolute;
    right: 0.375rem;
    width: 18px;
    height: 18px;
    border: none;
    background: var(--muted);
    color: var(--muted-foreground);
    border-radius: 50%;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }

  /* Table */
  .tx-table-container {
    flex: 1;
    overflow: auto;
  }

  /* Reverse scroll mode (chat-style) - uses transform to flip scroll direction */
  .tx-table-container.reverse-scroll {
    transform: scaleY(-1);
  }

  .tx-table-container.reverse-scroll .tx-table {
    transform: scaleY(-1);
  }

  /* Keep header at top (visually bottom due to flip, but sticky top works) */
  .tx-table-container.reverse-scroll thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--background);
  }

  .sort-header {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 0;
  }

  .sort-header:hover {
    color: var(--primary);
  }

  .tx-loading-row td {
    padding: 0.75rem;
    text-align: center;
    color: var(--muted-foreground);
  }

  .loading-text {
    font-size: 0.75rem;
    font-style: italic;
  }

  .tx-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
    table-layout: auto;
  }

  .tx-table thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--card);
  }

  .tx-table th {
    text-align: left;
    padding: 0.5rem 0.375rem;
    font-weight: 600;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }

  .tx-table td {
    padding: 0.5rem 0.375rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    color: var(--foreground);
  }

  /* Grid lines (conditional) */
  .tx-table.show-grid th {
    border-right: 1px solid var(--border);
  }
  
  .tx-table.show-grid td {
    border-right: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }
  
  .tx-table.show-grid th:last-child,
  .tx-table.show-grid td:last-child {
    border-right: none;
  }

  .tx-row {
    cursor: pointer;
    transition: background 0.15s;
  }

  .tx-row:hover {
    background: var(--accent);
  }

  /* Flag column - colored bar on left edge */
  /* Flag column - solid colored bar */
  .col-flag { 
    width: 4px !important; 
    min-width: 4px !important;
    max-width: 4px !important;
    padding: 0 !important; 
    border: none !important;
  }
  
  td.col-flag.flag-red { background: #e74c3c !important; }
  td.col-flag.flag-orange { background: #e67e22 !important; }
  td.col-flag.flag-yellow { background: #f1c40f !important; }
  td.col-flag.flag-green { background: #27ae60 !important; }
  td.col-flag.flag-blue { background: #3498db !important; }
  td.col-flag.flag-purple { background: #9b59b6 !important; }

  th.col-flag { background: transparent; }

  /* Consistent font sizes across all columns */
  .col-date { 
    font-family: var(--font-family-mono);
    font-size: 0.75rem; 
    white-space: nowrap;
  }
  .col-account { 
    font-size: 0.75rem; 
    max-width: 100px;
    overflow: hidden; 
    text-overflow: ellipsis; 
    white-space: nowrap; 
  }
  .col-payee { font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .col-category { font-size: 0.75rem; overflow: hidden; }
  .col-memo { font-size: 0.7rem; color: var(--muted-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  
  /* Category cell */
  .category-cell {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  
  .memo-below {
    font-size: 0.7rem;
    color: var(--muted-foreground);
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 350px;
    opacity: 0.8;
  }
  
  .category-display {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem;
  }
  
  .cat-sub {
    font-weight: 600;
    color: var(--foreground);
  }
  
  .cat-master {
    font-weight: 400;
    color: var(--muted-foreground);
    opacity: 0.9;
    font-size: 0.9em;
  }
  
  /* Transfer display */
  /* Icon column */
  /* Icon column - minimal width */
  .col-icon {
    width: 18px !important;
    min-width: 18px !important;
    max-width: 18px !important;
    padding: 0 2px !important;
    text-align: center;
    vertical-align: middle;
  }
  
  .tx-icon {
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1;
  }
  
  .tx-icon.transfer {
    color: var(--muted-foreground);
  }
  
  .tx-icon.warning {
    color: #f59e0b;
  }
  
  .tx-icon.error {
    color: #ef4444;
  }
  
  /* Needs approval row highlight */
  .tx-row.needs-approval {
    background: rgba(245, 158, 11, 0.05);
  }
  
  .tx-row.needs-approval:hover {
    background: rgba(245, 158, 11, 0.1);
  }
  
  /* Payee name styling */
  .payee-name {
    font-weight: 600;
    color: var(--foreground);
  }
  
  /* Transfer category styling */
  .transfer-category {
    font-size: 0.75rem;
  }
  
  .transfer-category strong {
    color: var(--foreground);
    font-weight: 600;
  }
  
  .transfer-label {
    color: var(--muted-foreground);
    font-weight: 400;
  }
  .col-outflow, .col-inflow, .col-balance { 
    text-align: right; 
    font-family: var(--font-family-mono);
    font-feature-settings: "tnum";
    font-size: 0.75rem;
  }
  
  /* Status column - colored bar on right edge */
  /* Status column - solid colored bar */
  .col-status { 
    width: 4px !important; 
    min-width: 4px !important;
    max-width: 4px !important;
    padding: 0 !important; 
    border: none !important;
  }
  
  td.col-status.reconciled { 
    background: var(--foreground) !important;
  }
  td.col-status.cleared { 
    background: #10b981 !important;
  }
  td.col-status.uncleared { 
    background: transparent !important;
  }
  
  th.col-status { background: transparent; }

  .col-balance.positive { color: var(--success); }
  .col-balance.negative { color: var(--destructive); }
  
  /* Column Settings */
  .column-settings-wrapper {
    position: relative;
  }
  
  .column-settings-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    min-width: 200px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
  }
  
  .column-settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--foreground);
  }
  
  .column-settings-close {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 4px;
  }
  
  .column-settings-close:hover {
    background: var(--accent);
    color: var(--foreground);
  }
  
  .column-settings-list {
    padding: 0.5rem;
  }
  
  .column-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    cursor: pointer;
    border-radius: 4px;
    font-size: 0.8rem;
    color: var(--foreground);
  }
  
  .column-toggle:hover {
    background: var(--accent);
  }
  
  .column-toggle input {
    accent-color: var(--primary);
  }
  
  .column-settings-hint {
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border);
    font-size: 0.7rem;
    color: var(--muted-foreground);
    font-style: italic;
  }
  
  /* Resize handles */
  .tx-table th.resizable {
    position: relative;
  }
  
  .resize-handle {
    position: absolute;
    right: 0;
    top: 4px;
    bottom: 4px;
    width: 6px;
    cursor: col-resize;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .resize-handle::before {
    content: '';
    width: 2px;
    height: 12px;
    background: var(--muted-foreground);
    border-radius: 1px;
    opacity: 0.4;
    transition: opacity 0.15s, background 0.15s;
  }
  
  .resize-handle:hover::before,
  .tx-table-container.resizing .resize-handle::before {
    opacity: 1;
    background: var(--primary);
    height: 100%;
  }
  
  .tx-table-container.resizing {
    cursor: col-resize;
    user-select: none;
  }

  /* Add Transaction Row */
  .tx-add-row {
    background: var(--muted);
  }

  .tx-add-row td {
    padding: 0.375rem;
    border-bottom: 1px solid var(--border);
  }

  .add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: color 0.15s;
  }

  .add-btn:hover {
    color: var(--primary);
  }

  .add-text {
    font-size: 0.75rem;
    font-style: italic;
    justify-content: flex-start;
  }

  .load-more-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .load-more-btn:hover {
    background: var(--accent);
    color: var(--foreground);
    border-color: var(--primary);
  }

  /* Inline Entry Row (new transaction) */
  .tx-entry-row {
    background: var(--muted);
  }

  .tx-entry-row td {
    padding: 0.125rem 0.125rem;
    vertical-align: middle;
    border-bottom: 1px solid var(--primary);
  }
  
  /* Inline Edit Row (existing transaction) */
  .tx-edit-row {
    background: color-mix(in srgb, var(--warning) 10%, var(--background));
  }

  .tx-edit-row td {
    padding: 0.125rem 0.125rem;
    vertical-align: middle;
    border-bottom: 1px solid var(--warning);
  }

  /* Transparent inline inputs */
  .inline-input {
    width: 100%;
    padding: 0.125rem 0.25rem;
    border: none;
    border-bottom: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--foreground);
    font-size: 0.7rem;
    transition: all 0.15s;
  }

  .inline-input:hover {
    border-bottom-color: var(--border);
  }

  .inline-input:focus {
    outline: none;
    border-bottom-color: var(--primary);
    background: var(--background);
  }

  .inline-input::placeholder {
    color: var(--muted-foreground);
    font-style: italic;
  }

  /* Category entry with memo */
  .category-entry {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .memo-input {
    font-size: 0.7rem;
    font-style: normal;
    color: var(--foreground);
  }

  .amount-input {
    text-align: right;
    font-family: var(--font-family-mono);
    font-feature-settings: "tnum";
  }

  .entry-actions {
    display: flex;
    gap: 0.25rem;
    justify-content: center;
  }

  .entry-save-btn,
  .entry-cancel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .entry-save-btn {
    background: var(--success);
    color: white;
  }

  .entry-cancel-btn {
    background: var(--muted);
    color: var(--muted-foreground);
  }

  .entry-save-btn:hover,
  .entry-cancel-btn:hover {
    opacity: 0.85;
  }

  /* Category display with master category */
  .category-display {
    font-size: 0.7rem;
    line-height: 1.3;
  }

  .category-display strong {
    font-weight: 600;
  }

  .master-category {
    color: var(--muted-foreground);
    font-weight: 400;
  }

  .flag-red { background: var(--color-ynab-red); }
  .flag-orange { background: var(--color-ynab-orange); }
  .flag-yellow { background: var(--color-ynab-yellow); }
  .flag-green { background: var(--color-ynab-green); }
  .flag-blue { background: var(--color-ynab-blue); }
  .flag-purple { background: var(--color-ynab-purple); }

  /* Transfer badge in category column */
  .transfer-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    font-style: italic;
  }

  .transfer-badge.outgoing {
    color: var(--destructive);
  }

  .transfer-badge.incoming {
    color: var(--success);
  }

  /* Compact mode row styling */
  .tx-row.compact td {
    padding: 0.375rem 0.375rem;
  }

  /* Cards (Mobile) */
  .tx-cards-container {
    display: none;
    flex: 1;
    overflow-y: auto;
    padding-bottom: 80px;
  }

  .tx-date-group {
    margin-bottom: 0.5rem;
  }

  .tx-date-header {
    position: sticky;
    top: 0;
    z-index: 5;
    padding: 0.375rem 0.75rem;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 0.75rem;
    font-weight: 600;
    border-bottom: 1px solid var(--border);
  }

  .tx-card {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: none;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    text-align: left;
    gap: 0.625rem;
    transition: background 0.15s;
  }

  .tx-card:hover {
    background: var(--accent);
  }

  .tx-card-status {
    width: 3px;
    height: 28px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .tx-card-status.reconciled { background: var(--success); }
  .tx-card-status.cleared { background: var(--success); opacity: 0.5; }
  .tx-card-status.uncleared { background: var(--muted-foreground); opacity: 0.3; }

  .tx-card-main {
    flex: 1;
    min-width: 0;
  }

  .tx-card-payee {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tx-card-category {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tx-card-amount {
    font-family: var(--font-family-mono);
    font-size: 0.875rem;
    font-weight: 600;
    font-feature-settings: "tnum";
    flex-shrink: 0;
  }

  .tx-card-amount.positive { color: var(--success); }
  .tx-card-amount.negative { color: var(--destructive); }

  /* Status Bar */
  .tx-status-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem 0.75rem;
    background: var(--muted);
    border-top: 1px solid var(--border);
    font-size: 0.6875rem;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .status-label {
    color: var(--muted-foreground);
  }

  .status-value {
    font-family: var(--font-family-mono);
    font-weight: 600;
    font-feature-settings: "tnum";
    color: var(--foreground);
  }

  .status-value.positive { color: var(--success); }
  .status-value.negative { color: var(--destructive); }

  .status-separator {
    color: var(--border);
  }

  /* FAB */
  .tx-fab {
    position: fixed;
    bottom: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    border: none;
    border-radius: 9999px;
    background: var(--primary);
    color: var(--primary-foreground);
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.15s;
  }

  .tx-fab:hover {
    opacity: 0.9;
  }

  .tx-fab:active {
    transform: translateX(-50%) scale(0.97);
  }

  /* Split transactions */
  .tx-row.has-splits {
    cursor: pointer;
  }

  .split-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.65rem;
    color: var(--primary);
    font-weight: 600;
  }

  .split-indicator.expanded {
    color: var(--foreground);
  }

  .split-details-row {
    background: var(--muted);
  }

  .split-details-row td {
    padding: 0 !important;
    border-bottom: 2px solid var(--border);
  }

  .split-details {
    padding: 0.25rem 0;
    margin-left: 2rem;
  }

  .split-header {
    display: flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--border);
  }

  .split-row {
    display: flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    border-bottom: 1px solid var(--border);
  }

  .split-row:last-child {
    border-bottom: none;
  }

  .split-col-category {
    flex: 2;
    min-width: 120px;
  }

  .split-col-memo {
    flex: 2;
    min-width: 100px;
    color: var(--muted-foreground);
    font-style: italic;
  }

  .split-col-outflow,
  .split-col-inflow {
    width: 80px;
    text-align: right;
    font-family: var(--font-family-mono);
    font-feature-settings: "tnum";
  }


  .split-transfer {
    font-style: italic;
  }

  .split-transfer.outgoing {
    color: var(--destructive);
  }

  .split-transfer.incoming {
    color: var(--success);
  }

  .split-master {
    color: var(--muted-foreground);
    font-weight: 400;
  }

  /* Selection styles */
  .tx-row {
    cursor: pointer;
    user-select: none;
  }
  
  .tx-row.selected {
    background: color-mix(in srgb, var(--primary) 20%, transparent) !important;
  }
  
  .tx-row.selected:hover {
    background: color-mix(in srgb, var(--primary) 30%, transparent) !important;
  }

  /* Selection summary bar */
  .selection-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--card);
    border-top: 2px solid var(--primary);
    gap: 1rem;
    flex-wrap: wrap;
  }
  
  .selection-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .selection-count {
    font-weight: 600;
    color: var(--primary);
    font-size: 0.875rem;
  }
  
  .selection-action {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    background: var(--muted);
    color: var(--muted-foreground);
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .selection-action:hover {
    background: var(--accent);
    color: var(--foreground);
  }
  
  .selection-totals {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  
  .total-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  
  .total-label {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }
  
  .total-value {
    font-family: var(--font-family-mono);
    font-size: 0.875rem;
    font-weight: 600;
  }
  
  .total-item.outflow .total-value {
    color: var(--destructive);
  }
  
  .total-item.inflow .total-value {
    color: var(--success);
  }
  
  .total-item.net.positive .total-value {
    color: var(--success);
  }
  
  .total-item.net.negative .total-value {
    color: var(--destructive);
  }

  /* Mobile */
  @media (max-width: 768px) {
    .tx-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
    }

    .tx-toolbar-left {
      justify-content: space-between;
    }

    .tx-toolbar-actions {
      flex-wrap: wrap;
    }

    .tx-search {
      flex: 1;
      min-width: 120px;
    }

    .tx-search input {
      width: 100%;
    }

    .tx-table-container {
      display: none;
    }

    .tx-cards-container {
      display: block;
    }

    .tx-status-bar {
      display: none;
    }
    
    .selection-bar {
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .selection-totals {
      flex-wrap: wrap;
      gap: 0.75rem;
    }
  }
</style>
