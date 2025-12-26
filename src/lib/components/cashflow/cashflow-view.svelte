<script lang="ts">
  import { ChevronLeft, ChevronRight, Building2, PiggyBank, Filter } from 'lucide-svelte';
  import { accounts, transactions, payees, categories } from '$lib/stores/budget';
  import { t, tArray } from '$lib/i18n';
  import DateNavigation from '$lib/components/transactions/date-navigation.svelte';

  // State
  let selectedYear = $state(new Date().getFullYear());
  let selectedMonth = $state(new Date().getMonth());
  let showDateNav = $state(false);
  let accountFilter = $state<'all' | 'checking' | 'savings'>('all');
  let selectedAccountId = $state<string | null>(null);
  let displayLimit = $state(100); // Limit displayed transactions for performance
  
  // Reset display limit when filters change
  $effect(() => {
    // When any filter changes, reset the display limit
    selectedYear; selectedMonth; accountFilter; selectedAccountId;
    displayLimit = 100;
  });

  // Get month names
  const monthsLong = $derived($tArray('months.long'));

  // Format amount
  function formatAmount(amount: number): string {
    const abs = Math.abs(amount);
    return abs.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getBalanceClass(value: number): string {
    if (Math.abs(value) < 0.01) return 'zero';
    return value >= 0 ? 'positive' : 'negative';
  }

  function formatChange(value: number): string {
    if (Math.abs(value) < 0.01) return '0.00';
    const sign = value >= 0 ? '+' : '-';
    return sign + formatAmount(value);
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // Get date range for selected month
  function getDateRange(): { from: string; to: string } {
    const from = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const to = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${lastDay}`;
    return { from, to };
  }

  // Classify accounts by type (include all accounts, even closed ones for historical data)
  const accountTypes = $derived.by(() => {
    const checking = new Set<string>();
    const savings = new Set<string>();
    
    $accounts.forEach(a => {
      const type = a.type?.toLowerCase() || '';
      
      if (type.includes('checking') || type === 'Checking') {
        checking.add(a.id);
      } else if (type.includes('savings') || type === 'Savings') {
        savings.add(a.id);
      }
    });
    
    return { checking, savings };
  });
  

  // Get active account IDs based on filter
  const activeAccountIds = $derived.by(() => {
    const { checking, savings } = accountTypes;
    
    if (accountFilter === 'checking') return checking;
    if (accountFilter === 'savings') return savings;
    return new Set([...checking, ...savings]);
  });

  // Pre-compute account balances in a single pass (optimized)
  // Hide internal transfers that don't change the pool's total
  const accountsData = $derived.by(() => {
    const { from, to } = getDateRange();
    const { checking, savings } = accountTypes;
    
    // Define the pool ONCE based on filter
    // Pool = the group of accounts we're analyzing
    let pool: Set<string>;
    if (accountFilter === 'checking') {
      pool = checking;
    } else if (accountFilter === 'savings') {
      pool = savings;
    } else {
      // "All" mode = checking + savings together
      pool = new Set([...checking, ...savings]);
    }
    
    // Build a map of account data - single pass through transactions
    const accountMap = new Map<string, {
      beforeBalance: number;
      inflows: number;
      outflows: number;
      txCount: number;
    }>();
    
    // Initialize only accounts in the current pool
    for (const acc of $accounts) {
      if (!pool.has(acc.id)) continue;
      
      accountMap.set(acc.id, {
        beforeBalance: 0,
        inflows: 0,
        outflows: 0,
        txCount: 0
      });
    }
    
    // Single pass through transactions
    for (const tx of $transactions) {
      const accData = accountMap.get(tx.accountId);
      if (!accData) continue; // Transaction not in our pool
      
      // Get transfer target (from transferAccountId or payee format)
      const transferTargetId = tx.transferAccountId || 
        (tx.payeeId?.startsWith('Payee/Transfer:') ? tx.payeeId.replace('Payee/Transfer:', '') : null);
      
      // An "internal" transfer is when BOTH source AND target are in the pool
      // These don't change the pool's total balance, so we exclude them from calculations
      const isInternalTransfer = transferTargetId && pool.has(transferTargetId);
      
      if (tx.date < from) {
        // Before period - add to initial balance (always include for accurate starting balance)
        accData.beforeBalance += tx.amount;
      } else if (tx.date <= to) {
        // In period - count inflows/outflows (but skip internal transfers)
        if (!isInternalTransfer) {
          if (tx.amount >= 0) {
            accData.inflows += tx.amount;
          } else {
            accData.outflows += Math.abs(tx.amount);
          }
          accData.txCount++;
        }
      }
    }
    
    // Convert to array and filter by current filter
    const data: Array<{
      id: string;
      name: string;
      type: 'checking' | 'savings';
      initialBalance: number;
      finalBalance: number;
      inflows: number;
      outflows: number;
      change: number;
      transactionCount: number;
      isClosed: boolean;
    }> = [];
    
    for (const acc of $accounts) {
      // Only include accounts in the pool
      if (!pool.has(acc.id)) continue;
      
      const accData = accountMap.get(acc.id);
      if (!accData) continue;
      
      // Only show accounts that had activity in the period (or have a balance)
      if (accData.txCount === 0 && Math.abs(accData.beforeBalance) < 0.01) continue;
      
      const change = accData.inflows - accData.outflows;
      const isChecking = checking.has(acc.id);
      
      data.push({
        id: acc.id,
        name: acc.name,
        type: isChecking ? 'checking' : 'savings',
        initialBalance: accData.beforeBalance,
        finalBalance: accData.beforeBalance + change,
        inflows: accData.inflows,
        outflows: accData.outflows,
        change,
        transactionCount: accData.txCount,
        isClosed: acc.closed || false
      });
    }
    
    // Sort: active accounts first, then by name
    return data.sort((a, b) => {
      if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  });

  // Calculate totals
  const totals = $derived.by(() => {
    let totalInitial = 0;
    let totalFinal = 0;
    let totalInflows = 0;
    let totalOutflows = 0;
    
    for (const acc of accountsData) {
      totalInitial += acc.initialBalance;
      totalFinal += acc.finalBalance;
      totalInflows += acc.inflows;
      totalOutflows += acc.outflows;
    }
    
    return {
      initial: totalInitial,
      final: totalFinal,
      inflows: totalInflows,
      outflows: totalOutflows,
      change: totalFinal - totalInitial
    };
  });

  // Helper to get transfer target account ID from transaction
  function getTransferTargetId(tx: { transferAccountId: string | null; payeeId: string | null }): string | null {
    // First check transferAccountId
    if (tx.transferAccountId) return tx.transferAccountId;
    // Also check payee format "Payee/Transfer:ACCOUNT-ID"
    if (tx.payeeId?.startsWith('Payee/Transfer:')) {
      return tx.payeeId.replace('Payee/Transfer:', '');
    }
    return null;
  }

  // Filter transactions for the selected period and accounts
  // Key logic: Each mode defines a POOL of accounts.
  // Hide transfers where BOTH source AND target are within the pool (internal moves).
  const filteredTransactions = $derived.by(() => {
    const { from, to } = getDateRange();
    const { checking, savings } = accountTypes;
    
    // Define the pool based on filter
    let pool: Set<string>;
    if (selectedAccountId) {
      pool = new Set([selectedAccountId]);
    } else if (accountFilter === 'checking') {
      pool = checking;
    } else if (accountFilter === 'savings') {
      pool = savings;
    } else {
      // All mode: pool is checking + savings
      pool = new Set([...checking, ...savings]);
    }
    
    const result = [];
    for (const tx of $transactions) {
      if (tx.date < from || tx.date > to) continue;
      if (!pool.has(tx.accountId)) continue;
      
      // Get transfer target (from transferAccountId or payee format)
      const transferTargetId = getTransferTargetId(tx);
      
      // Hide transfers where both source and target are in the pool
      if (transferTargetId && pool.has(transferTargetId)) {
        continue; // Internal transfer within the pool - skip
      }
      
      result.push(tx);
    }
    
    return result.sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
  });
  
  // Displayed transactions (limited for performance)
  const displayedTransactions = $derived(filteredTransactions.slice(0, displayLimit));
  const hasMoreTransactions = $derived(filteredTransactions.length > displayLimit);
  
  function loadMore() {
    displayLimit += 100;
  }

  // Get payee name
  function getPayeeName(payeeId: string | null): string {
    if (!payeeId) return '';
    if (payeeId.startsWith('Payee/Transfer:')) {
      const accId = payeeId.replace('Payee/Transfer:', '');
      const acc = $accounts.find(a => a.id === accId);
      return acc ? `↔ ${acc.name}` : 'Transfer';
    }
    const payee = $payees.find(p => p.entityId === payeeId);
    return payee?.name || '';
  }

  // Get category name
  function getCategoryName(categoryId: string | null): string {
    if (!categoryId) return '';
    const cat = $categories.find(c => c.entityId === categoryId);
    return cat?.name || '';
  }

  // Get account name
  function getAccountName(accountId: string): string {
    const acc = $accounts.find(a => a.id === accountId);
    return acc?.name || '';
  }

  // Navigation
  function navigateMonth(direction: number) {
    let newMonth = selectedMonth + direction;
    if (newMonth < 0) {
      selectedYear -= 1;
      selectedMonth = 11;
    } else if (newMonth > 11) {
      selectedYear += 1;
      selectedMonth = 0;
    } else {
      selectedMonth = newMonth;
    }
  }
  
  function selectAccount(id: string | null) {
    selectedAccountId = selectedAccountId === id ? null : id;
  }
</script>

<div class="cashflow-view">
  <!-- Header with Date Navigation -->
  <div class="cf-header">
    <div class="cf-nav">
      <button class="nav-btn" onclick={() => navigateMonth(-1)} aria-label="Previous month">
        <ChevronLeft class="h-5 w-5" />
      </button>
      <button class="month-display" onclick={() => showDateNav = !showDateNav}>
        <span class="month-name">{monthsLong[selectedMonth]}</span>
        <span class="year-name">{selectedYear}</span>
      </button>
      <button class="nav-btn" onclick={() => navigateMonth(1)} aria-label="Next month">
        <ChevronRight class="h-5 w-5" />
      </button>
    </div>
    
    <div class="cf-filters">
      <button 
        class="filter-btn" 
        class:active={accountFilter === 'all'}
        onclick={() => { accountFilter = 'all'; selectedAccountId = null; }}
      >
        {$t('cashFlow.all')}
      </button>
      <button 
        class="filter-btn" 
        class:active={accountFilter === 'checking'}
        onclick={() => { accountFilter = 'checking'; selectedAccountId = null; }}
      >
        <Building2 class="h-4 w-4" />
        {$t('cashFlow.checking')}
      </button>
      <button 
        class="filter-btn" 
        class:active={accountFilter === 'savings'}
        onclick={() => { accountFilter = 'savings'; selectedAccountId = null; }}
      >
        <PiggyBank class="h-4 w-4" />
        {$t('cashFlow.savings')}
      </button>
    </div>
  </div>

  <!-- Date Navigation Panel -->
  {#if showDateNav}
    <DateNavigation
      selectedYear={selectedYear}
      selectedMonth={selectedMonth}
      showAll={false}
      onYearChange={(y: number) => selectedYear = y}
      onMonthChange={(m: number) => selectedMonth = m}
      onShowAllChange={() => {}}
    />
  {/if}

  <!-- Main Content -->
  <div class="cf-main">
    <!-- Accounts Panel (Left) -->
    <div class="cf-accounts-panel">
      <div class="accounts-header">
        <h3>{$t('nav.accounts')}</h3>
        <span class="account-count">{accountsData.length}</span>
      </div>
      
      <!-- Totals Row -->
      <button class="totals-row" class:selected={selectedAccountId === null} onclick={() => selectAccount(null)} type="button">
        <div class="totals-info">
          <span class="totals-label">{$t('common.total')}</span>
          <span class="totals-count">{filteredTransactions.length} tx</span>
        </div>
        <div class="totals-amounts">
          <span class="totals-balance {getBalanceClass(totals.final)}">{formatAmount(totals.final)}</span>
          <span class="totals-change {getBalanceClass(totals.change)}">{formatChange(totals.change)}</span>
        </div>
      </button>
      
      <div class="accounts-list">
        {#each accountsData as acc (acc.id)}
          <button 
            class="account-row" 
            class:selected={selectedAccountId === acc.id}
            onclick={() => selectAccount(acc.id)}
          >
            <div class="account-info">
              <span class="account-name">{acc.name}</span>
              <span class="account-type-badge" class:checking={acc.type === 'checking'} class:savings={acc.type === 'savings'}>
                {acc.type === 'checking' ? $t('cashFlow.checking') : $t('cashFlow.savings')}
              </span>
            </div>
            <div class="account-amounts">
              <span class="account-balance {getBalanceClass(acc.finalBalance)}">{formatAmount(acc.finalBalance)}</span>
              <span class="account-change {getBalanceClass(acc.change)}">{formatChange(acc.change)}</span>
            </div>
          </button>
        {/each}
      </div>
      
      <!-- Summary Section -->
      <div class="accounts-summary">
        <div class="summary-row">
          <span class="summary-label">{$t('cashFlow.initial')}</span>
          <span class="summary-value">{formatAmount(totals.initial)}</span>
        </div>
        <div class="summary-row inflows">
          <span class="summary-label">+ {$t('cashFlow.income')}</span>
          <span class="summary-value positive">{formatAmount(totals.inflows)}</span>
        </div>
        <div class="summary-row outflows">
          <span class="summary-label">- {$t('cashFlow.expenses')}</span>
          <span class="summary-value negative">{formatAmount(totals.outflows)}</span>
        </div>
        <div class="summary-row final">
          <span class="summary-label">{$t('cashFlow.final')}</span>
          <span class="summary-value {getBalanceClass(totals.final)}">{formatAmount(totals.final)}</span>
        </div>
      </div>
    </div>

    <!-- Transactions Panel (Right) -->
    <div class="cf-transactions-panel">
      <div class="transactions-header">
        <h3>
          {#if selectedAccountId}
            {getAccountName(selectedAccountId)}
          {:else}
            {$t('nav.transactions')}
          {/if}
        </h3>
        <span class="transaction-count">{filteredTransactions.length}</span>
      </div>
      
      <div class="transactions-list">
        {#if filteredTransactions.length === 0}
          <div class="empty-state">
            <p>{$t('budget.noTransactions')}</p>
          </div>
        {:else}
          <table class="tx-table">
            <thead>
              <tr>
                <th class="col-date">{$t('transactions.date')}</th>
                {#if !selectedAccountId}
                  <th class="col-account">{$t('transactions.account')}</th>
                {/if}
                <th class="col-payee">{$t('transactions.payee')}</th>
                <th class="col-category">{$t('transactions.category')}</th>
                <th class="col-amount">{$t('transactions.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {#each displayedTransactions as tx (tx.id)}
                <tr>
                  <td class="col-date">{formatDate(tx.date)}</td>
                  {#if !selectedAccountId}
                    <td class="col-account">{getAccountName(tx.accountId)}</td>
                  {/if}
                  <td class="col-payee">{getPayeeName(tx.payeeId)}</td>
                  <td class="col-category">{getCategoryName(tx.categoryId)}</td>
                  <td class="col-amount {getBalanceClass(tx.amount)}">
                    {tx.amount >= 0 ? '+' : '-'}{formatAmount(tx.amount)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if hasMoreTransactions}
            <div class="load-more">
              <button class="load-more-btn" onclick={loadMore}>
                {$t('common.loadMore')} ({filteredTransactions.length - displayLimit} {$t('common.remaining')})
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .cashflow-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
    overflow: hidden;
  }

  /* Header */
  .cf-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    gap: 1rem;
    flex-wrap: wrap;
  }

  .cf-nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    color: var(--primary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.15s;
  }

  .nav-btn:hover {
    background: var(--accent);
  }

  .month-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 1.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
    transition: background 0.15s;
  }

  .month-display:hover {
    background: var(--accent);
  }

  .month-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .year-name {
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }

  .cf-filters {
    display: flex;
    gap: 0.25rem;
  }

  .filter-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--muted-foreground);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .filter-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .filter-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  /* Main Layout */
  .cf-main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* Accounts Panel */
  .cf-accounts-panel {
    width: 280px;
    min-width: 240px;
    max-width: 320px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--card);
  }

  .accounts-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .accounts-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .account-count {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    background: var(--muted);
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
  }

  .totals-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s;
  }

  .totals-row:hover {
    background: var(--accent);
  }

  .totals-row.selected {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .totals-row.selected .totals-count,
  .totals-row.selected .totals-change {
    color: var(--primary-foreground);
    opacity: 0.8;
  }

  .totals-row.selected .totals-balance {
    color: var(--primary-foreground);
  }

  .totals-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .totals-label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .totals-count {
    font-size: 0.7rem;
    color: var(--muted-foreground);
  }

  .totals-amounts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.125rem;
  }

  .totals-balance {
    font-size: 0.9rem;
    font-weight: 600;
    font-family: var(--font-family-mono);
  }

  .totals-change {
    font-size: 0.7rem;
    font-family: var(--font-family-mono);
  }

  .accounts-list {
    flex: 1;
    overflow-y: auto;
  }

  .account-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.625rem 1rem;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }

  .account-row:hover {
    background: var(--accent);
  }

  .account-row.selected {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .account-row.selected .account-type-badge,
  .account-row.selected .account-change {
    color: var(--primary-foreground);
    opacity: 0.8;
  }

  .account-row.selected .account-balance {
    color: var(--primary-foreground);
  }

  .account-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    overflow: hidden;
  }

  .account-name {
    font-size: 0.8rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-type-badge {
    font-size: 0.65rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .account-type-badge.checking {
    color: var(--info);
  }

  .account-type-badge.savings {
    color: var(--success);
  }

  .account-amounts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.125rem;
    flex-shrink: 0;
  }

  .account-balance {
    font-size: 0.8rem;
    font-weight: 500;
    font-family: var(--font-family-mono);
  }

  .account-change {
    font-size: 0.65rem;
    font-family: var(--font-family-mono);
  }

  .accounts-summary {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border);
    background: var(--muted);
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0;
    font-size: 0.75rem;
  }

  .summary-label {
    color: var(--muted-foreground);
  }

  .summary-value {
    font-family: var(--font-family-mono);
    font-weight: 500;
  }

  .summary-row.final {
    padding-top: 0.5rem;
    margin-top: 0.25rem;
    border-top: 1px solid var(--border);
    font-weight: 600;
  }

  .summary-row.final .summary-label {
    color: var(--foreground);
  }

  /* Transactions Panel */
  .cf-transactions-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--background);
  }

  .transactions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }

  .transactions-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .transaction-count {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    background: var(--muted);
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
  }

  .transactions-list {
    flex: 1;
    overflow-y: auto;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: var(--muted-foreground);
  }

  /* Transactions Table */
  .tx-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .tx-table th {
    position: sticky;
    top: 0;
    text-align: left;
    padding: 0.625rem 0.75rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--muted-foreground);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .tx-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    color: var(--foreground);
  }

  .tx-table tr:hover td {
    background: var(--accent);
  }

  .col-date {
    width: 80px;
    white-space: nowrap;
  }

  .col-account {
    width: 120px;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-payee {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-category {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-foreground);
  }

  .col-amount {
    width: 100px;
    text-align: right;
    font-family: var(--font-family-mono);
    font-weight: 500;
    white-space: nowrap;
  }

  .positive {
    color: var(--success);
  }

  .negative {
    color: var(--destructive);
  }

  .zero {
    color: var(--muted-foreground);
  }

  /* Load More */
  .load-more {
    padding: 1rem;
    text-align: center;
  }

  .load-more-btn {
    padding: 0.5rem 1rem;
    background: var(--muted);
    color: var(--foreground);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .load-more-btn:hover {
    background: var(--accent);
    border-color: var(--primary);
  }

  /* Mobile */
  @media (max-width: 768px) {
    .cf-header {
      flex-direction: column;
      align-items: stretch;
    }

    .cf-nav {
      justify-content: center;
    }

    .cf-filters {
      justify-content: center;
    }

    .cf-main {
      flex-direction: column;
    }

    .cf-accounts-panel {
      width: 100%;
      max-width: none;
      max-height: 40vh;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }

    .col-account {
      display: none;
    }
  }
</style>
