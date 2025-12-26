<script lang="ts">
  import { onMount } from 'svelte';
  import { Plus, Search, Lock, ChevronDown, ChevronUp, Save, X, PanelLeftClose, PanelLeft, Calendar, Flag, ArrowUpDown, Trash2, Split } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { AccountsPanel } from '$lib/components/accounts';
  import DateNavigation from './date-navigation.svelte';
  import Autocomplete from '$lib/components/ui/autocomplete.svelte';
  import { selectedAccountTransactions, selectedAccountId, accounts, transactions, payees, categories } from '$lib/stores/budget';
  import { isMobile } from '$lib/stores/ui';
  import { formatCurrency } from '$lib/utils';
  import { t } from '$lib/i18n';

  interface Props {
    onAddTransaction?: () => void;
    onEditTransaction?: (id: string) => void;
  }

  let { onAddTransaction, onEditTransaction }: Props = $props();

  let searchQuery = $state('');
  let hideReconciled = $state(false);
  let showAccountsPanel = $state(true);
  let showDateNav = $state(false);
  
  // Sort order: 'desc' = newest first (default), 'asc' = oldest first
  let sortOrder = $state<'asc' | 'desc'>('desc');
  
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
    
    // Load more when within 200px of bottom
    if (scrollBottom < 200 && hasMore) {
      visibleCount += PAGE_SIZE;
    }
  }
  
  // Toggle sort order
  function toggleSortOrder() {
    sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
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
      return new Date(dateStr).toISOString().split('T')[0];
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
      // Sort by date based on sortOrder
      const sorted = [...filteredTransactions].sort((a, b) => {
        const cmp = (a.date || '').localeCompare(b.date || '');
        return sortOrder === 'desc' ? -cmp : cmp;
      });
      return sorted.map(tx => ({ ...tx, runningBalance: 0 }));
    }
    
    // Get all transactions for this account sorted by date ascending (for running balance)
    const accountTxs = [...$transactions]
      .filter(tx => tx.accountId === $selectedAccountId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    
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
    withBalance.sort((a, b) => {
      const cmp = (a.date || '').localeCompare(b.date || '');
      return sortOrder === 'desc' ? -cmp : cmp;
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
    entryPayee = '';
    entryCategory = '';
    entryMemo = '';
    entryOutflow = '';
    entryInflow = '';
    entryFlag = null;
  }

  function cancelEntry() {
    isEditing = false;
  }

  function saveEntry() {
    // TODO: Implement save
    const accountId = selectedAccount?.id || $accounts[0]?.id;
    console.log('Save entry:', { entryDate, accountId, entryPayee, entryCategory, entryMemo, entryOutflow, entryInflow, entryFlag });
    isEditing = false;
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
    
    // TODO: Implement save to budget
    console.log('Save edit:', editingTxId, editTx);
    
    cancelEdit();
  }
  
  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      saveEdit();
    }
  }
  
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

  const hasDateFilter = $derived(datePreset !== 'all');
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
          class:active={hideReconciled}
          onclick={() => hideReconciled = !hideReconciled}
          title={hideReconciled ? $t('transactions.showAll') : $t('transactions.hideReconciled')}
        >
          <Lock class="h-4 w-4" />
        </button>
        
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
    <div class="tx-table-container" bind:this={tableContainer} onscroll={handleScroll}>
      <table class="tx-table">
        <thead>
          <tr>
            <th class="col-flag"></th>
            <th class="col-date">
              <button class="sort-header" onclick={toggleSortOrder}>
                {$t('transactions.date')}
                {#if sortOrder === 'desc'}
                  <ChevronDown class="h-3 w-3" />
                {:else}
                  <ChevronUp class="h-3 w-3" />
                {/if}
              </button>
            </th>
            {#if !selectedAccount}
              <th class="col-account">{$t('transactions.account')}</th>
            {/if}
            <th class="col-payee">{$t('transactions.payee')}</th>
            <th class="col-category">{$t('transactions.category')} / {$t('transactions.memo')}</th>
            <th class="col-outflow">{$t('transactions.outflow')}</th>
            <th class="col-inflow">{$t('transactions.inflow')}</th>
            {#if selectedAccount}
              <th class="col-balance">{$t('transactions.balance')}</th>
            {/if}
            <th class="col-status"></th>
          </tr>
        </thead>
        <tbody>
          <!-- Top entry row (when sortOrder is desc - newest first) -->
          {#if sortOrder === 'desc'}
            {#if isEditing}
              <tr class="tx-entry-row">
                <td class="col-flag">
                  <div class="flag-tag-wrapper">
                    <button 
                      class="flag-tag {entryFlag ? `flag-${entryFlag}` : 'flag-empty'}"
                      onclick={() => showFlagPicker = showFlagPicker === 'entry' ? null : 'entry'}
                      type="button"
                    ></button>
                    {#if showFlagPicker === 'entry'}
                      <div class="flag-picker">
                        <button 
                          class="flag-option flag-none" 
                          onclick={() => { entryFlag = null; showFlagPicker = null; }}
                          type="button"
                        >✕</button>
                        {#each FLAG_COLORS as color}
                          <button
                            class="flag-option flag-{color}"
                            onclick={() => { entryFlag = color; showFlagPicker = null; }}
                            type="button"
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
                {#if !selectedAccount}
                  <td class="col-account">
                    <span class="entry-account-auto">{$accounts[0]?.name || '-'}</span>
                  </td>
                {/if}
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
              <!-- Add transaction row (discrete) -->
              <tr class="tx-add-row">
                <td class="col-flag">
                  <button class="add-btn" onclick={startEntry}>
                    <Plus class="h-3 w-3" />
                  </button>
                </td>
                <td class="col-date">
                  <button class="add-btn add-text" onclick={startEntry}>{$t('transactions.addTransaction')}</button>
                </td>
                {#if !selectedAccount}
                  <td class="col-account"></td>
                {/if}
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
                      class="flag-tag {editTx.flag ? `flag-${editTx.flag}` : 'flag-empty'}"
                      onclick={() => showFlagPicker = showFlagPicker === `edit-${tx.id}` ? null : `edit-${tx.id}`}
                      type="button"
                    ></button>
                    {#if showFlagPicker === `edit-${tx.id}`}
                      <div class="flag-picker">
                        <button 
                          class="flag-option flag-none" 
                          onclick={() => { editTx.flag = null; showFlagPicker = null; }}
                          type="button"
                        >✕</button>
                        {#each FLAG_COLORS as color}
                          <button
                            class="flag-option flag-{color}"
                            onclick={() => { editTx.flag = color; showFlagPicker = null; }}
                            type="button"
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
                    bind:value={editTx.date}
                    onkeydown={handleEditKeydown}
                  />
                </td>
                {#if !selectedAccount}
                  <td class="col-account">{tx.accountName}</td>
                {/if}
                <td class="col-payee">
                  <Autocomplete
                    options={payeeOptions}
                    value={editTx.payee}
                    placeholder={$t('transactions.payee')}
                    onSelect={(v) => editTx.payee = v}
                    onCreate={(v) => editTx.payee = v}
                  />
                </td>
                <td class="col-category">
                  <div class="category-entry">
                    <Autocomplete
                      options={categoryOptions}
                      value={editTx.category}
                      placeholder={$t('transactions.category')}
                      onSelect={(v) => editTx.category = v}
                    />
                    <input 
                      type="text" 
                      class="inline-input memo-input" 
                      placeholder={$t('transactions.memo')}
                      bind:value={editTx.memo}
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
              <!-- Display row -->
              <tr 
                class="tx-row"
                class:has-splits={txHasSplits}
                ondblclick={() => startEdit(tx)}
                onclick={() => txHasSplits && toggleSplit(tx.id)}
              >
                <td class="col-flag">
                  <span class="flag-tag {tx.flag ? `flag-${tx.flag.toLowerCase()}` : 'flag-empty'}"></span>
                </td>
                <td class="col-date">{formatDate(tx.date)}</td>
                {#if !selectedAccount}
                  <td class="col-account">{tx.accountName}</td>
                {/if}
                <td class="col-payee">
                  {#if tx.transferAccountId}
                    <span class="transfer-payee" class:outgoing={isOutflow} class:incoming={isInflow}>
                      {tx.payee || 'Transfer'}
                    </span>
                  {:else}
                    {tx.payee || ''}
                  {/if}
                </td>
                <td class="col-category">
                  <div class="category-memo">
                    {#if txHasSplits}
                      <span class="split-indicator" class:expanded={isExpanded}>
                        <Split class="h-3 w-3" />
                        <span>{$t('transactions.split')} ({tx.subTransactions?.length})</span>
                      </span>
                    {:else if tx.transferAccountId}
                      <span class="transfer-badge" class:outgoing={isOutflow} class:incoming={isInflow}>
                        {isOutflow ? '↗' : '↙'} Transfer
                      </span>
                    {:else if subCategory}
                      <span class="category-display">
                        <strong>{subCategory}</strong>
                        {#if masterCategory}
                          <span class="master-category"> · {masterCategory}</span>
                        {/if}
                      </span>
                    {/if}
                    {#if tx.memo}
                      <span class="memo-text">{tx.memo}</span>
                    {/if}
                  </div>
                </td>
                <td class="col-outflow" class:has-value={isOutflow}>
                  {isOutflow ? formatAmount(tx.amount) : ''}
                </td>
                <td class="col-inflow" class:has-value={isInflow}>
                  {isInflow ? formatAmount(tx.amount) : ''}
                </td>
                {#if selectedAccount}
                  <td class="col-balance" class:positive={tx.runningBalance >= 0} class:negative={tx.runningBalance < 0}>
                    {formatAmount(tx.runningBalance)}
                  </td>
                {/if}
                <td class="col-status">
                  <span class="status-bar {getStatusClass(tx.cleared)}" title={tx.cleared}></span>
                </td>
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
                        {@const splitIsOutflow = split.amount < 0}
                        {@const splitIsInflow = split.amount > 0}
                        {@const splitCategoryParts = (split.category || '').split(': ')}
                        {@const splitSubCategory = splitCategoryParts.length > 1 ? splitCategoryParts[1] : splitCategoryParts[0]}
                        {@const splitMasterCategory = splitCategoryParts.length > 1 ? splitCategoryParts[0] : ''}
                        <div class="split-row">
                          <span class="split-col-category">
                            {#if split.transferAccountId}
                              <span class="split-transfer" class:outgoing={splitIsOutflow} class:incoming={splitIsInflow}>
                                {splitIsOutflow ? '↗' : '↙'} {split.transferAccountName || 'Transfer'}
                              </span>
                            {:else}
                              <strong>{splitSubCategory || '-'}</strong>
                              {#if splitMasterCategory}
                                <span class="split-master"> · {splitMasterCategory}</span>
                              {/if}
                            {/if}
                          </span>
                          <span class="split-col-memo">{split.memo || ''}</span>
                          <span class="split-col-outflow" class:has-value={splitIsOutflow}>
                            {splitIsOutflow ? formatAmount(split.amount) : ''}
                          </span>
                          <span class="split-col-inflow" class:has-value={splitIsInflow}>
                            {splitIsInflow ? formatAmount(split.amount) : ''}
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
          {#if sortOrder === 'asc'}
            {#if isEditing}
              <tr class="tx-entry-row">
                <td class="col-flag">
                  <div class="flag-tag-wrapper">
                    <button 
                      class="flag-tag {entryFlag ? `flag-${entryFlag}` : 'flag-empty'}"
                      onclick={() => showFlagPicker = showFlagPicker === 'entry-bottom' ? null : 'entry-bottom'}
                      type="button"
                    ></button>
                    {#if showFlagPicker === 'entry-bottom'}
                      <div class="flag-picker flag-picker-up">
                        <button 
                          class="flag-option flag-none" 
                          onclick={() => { entryFlag = null; showFlagPicker = null; }}
                          type="button"
                        >✕</button>
                        {#each FLAG_COLORS as color}
                          <button
                            class="flag-option flag-{color}"
                            onclick={() => { entryFlag = color; showFlagPicker = null; }}
                            type="button"
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
                {#if !selectedAccount}
                  <td class="col-account">
                    <span class="entry-account-auto">{$accounts[0]?.name || '-'}</span>
                  </td>
                {/if}
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
                {#if !selectedAccount}
                  <td class="col-account"></td>
                {/if}
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
          
          <!-- Loading indicator for infinite scroll -->
          {#if hasMore}
            <tr class="tx-loading-row">
              <td colspan={selectedAccount ? 9 : 9}>
                <span class="loading-text">{$t('common.loading')}</span>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

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

  /* Flag Tag (solid color vertical rectangle) */
  .flag-tag-wrapper {
    position: relative;
    display: flex;
    justify-content: center;
  }

  .flag-tag {
    display: block;
    width: 6px;
    height: 20px;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .flag-tag.flag-empty {
    background: var(--muted);
    border: 1px dashed var(--border);
  }

  .flag-tag.flag-empty:hover {
    border-color: var(--muted-foreground);
  }

  .flag-tag.flag-red { background: #ef4444; }
  .flag-tag.flag-orange { background: #f97316; }
  .flag-tag.flag-yellow { background: #eab308; }
  .flag-tag.flag-green { background: #22c55e; }
  .flag-tag.flag-blue { background: #3b82f6; }
  .flag-tag.flag-purple { background: #a855f7; }

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

  .flag-option.flag-red { background: #ef4444; }
  .flag-option.flag-orange { background: #f97316; }
  .flag-option.flag-yellow { background: #eab308; }
  .flag-option.flag-green { background: #22c55e; }
  .flag-option.flag-blue { background: #3b82f6; }
  .flag-option.flag-purple { background: #a855f7; }

  .entry-account-auto {
    font-size: 0.65rem;
    color: var(--muted-foreground);
    font-style: italic;
  }

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


  .date-filter-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .date-filter-row label {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    width: 40px;
  }

  .date-filter-row input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.8125rem;
  }

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

  .tx-row {
    cursor: pointer;
    transition: background 0.15s;
  }

  .tx-row:hover {
    background: var(--accent);
  }

  .col-flag { width: 22px; text-align: center; padding: 0 !important; }
  .col-date { width: 72px; font-size: 0.7rem; }
  .col-account { width: 80px; font-size: 0.7rem; }
  .col-payee { min-width: 100px; font-size: 0.75rem; }
  .col-category { min-width: 120px; font-size: 0.7rem; }
  .col-outflow, .col-inflow, .col-balance { 
    width: 70px; 
    text-align: right; 
    font-family: var(--font-family-mono);
    font-feature-settings: "tnum";
    font-size: 0.75rem;
  }
  .col-status { width: 24px; text-align: center; padding: 0 !important; }

  .col-outflow.has-value { color: var(--destructive); }
  .col-inflow.has-value { color: var(--success); }
  .col-balance.positive { color: var(--success); }
  .col-balance.negative { color: var(--destructive); }

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

  /* Load More Row */
  .tx-load-more-row td {
    padding: 0.75rem;
    text-align: center;
    border-bottom: 1px solid var(--border);
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
    font-size: 0.65rem;
    font-style: italic;
    color: var(--muted-foreground);
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

  .transfer-payee {
    font-weight: 500;
  }

  .transfer-payee.outgoing { color: var(--destructive); }
  .transfer-payee.incoming { color: var(--success); }

  .category-memo {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .category-text {
    color: var(--foreground);
  }

  .memo-text {
    color: var(--muted-foreground);
    font-size: 0.6875rem;
    font-style: italic;
  }

  .transfer-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.6875rem;
    font-weight: 500;
  }

  .transfer-badge.outgoing {
    background: rgba(239, 68, 68, 0.1);
    color: var(--destructive);
  }

  .transfer-badge.incoming {
    background: rgba(34, 197, 94, 0.1);
    color: var(--success);
  }

  .status-bar {
    width: 4px;
    height: 16px;
    border-radius: 2px;
    margin: 0 auto;
  }

  .status-bar.reconciled { background: var(--success); }
  .status-bar.cleared { background: var(--success); opacity: 0.5; }
  .status-bar.uncleared { background: var(--muted-foreground); opacity: 0.3; }

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

  .split-col-outflow.has-value {
    color: var(--destructive);
  }

  .split-col-inflow.has-value {
    color: var(--success);
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
  }
</style>
