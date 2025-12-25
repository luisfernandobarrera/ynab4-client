<script lang="ts">
  import { Plus, Search, Lock, ChevronDown, Save, X, PanelLeftClose, PanelLeft, Calendar } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { AccountsPanel } from '$lib/components/accounts';
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
  let showAccountDropdown = $state(false);
  let showDateFilter = $state(false);
  
  // Date filter
  let dateFrom = $state('');
  let dateTo = $state('');
  
  // Inline entry state
  let isEditing = $state(false);
  let entryDate = $state(new Date().toISOString().split('T')[0]);
  let entryAccount = $state('');
  let entryPayee = $state('');
  let entryCategory = $state('');
  let entryMemo = $state('');
  let entryOutflow = $state('');
  let entryInflow = $state('');

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
      if (dateFrom && tx.date && tx.date < dateFrom) {
        return false;
      }
      if (dateTo && tx.date && tx.date > dateTo) {
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

  // Group transactions by date for mobile view
  const groupedTransactions = $derived.by(() => {
    const groups: Map<string, typeof filteredTransactions> = new Map();
    
    for (const tx of filteredTransactions) {
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
    if (!$selectedAccountId) return filteredTransactions.map(tx => ({ ...tx, runningBalance: 0 }));
    
    // Get all transactions for this account sorted by date ascending
    const accountTxs = [...$transactions]
      .filter(tx => tx.accountId === $selectedAccountId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    
    let runningBalance = 0;
    const balanceMap = new Map<string, number>();
    
    for (const tx of accountTxs) {
      runningBalance += tx.amount;
      balanceMap.set(tx.id, runningBalance);
    }
    
    return filteredTransactions.map(tx => ({
      ...tx,
      runningBalance: balanceMap.get(tx.id) || 0
    }));
  });

  function startEntry() {
    isEditing = true;
    entryDate = new Date().toISOString().split('T')[0];
    entryAccount = selectedAccount?.id || ($accounts[0]?.id ?? '');
    entryPayee = '';
    entryCategory = '';
    entryMemo = '';
    entryOutflow = '';
    entryInflow = '';
  }

  function cancelEntry() {
    isEditing = false;
  }

  function saveEntry() {
    // TODO: Implement save
    console.log('Save entry:', { entryDate, entryAccount, entryPayee, entryCategory, entryMemo, entryOutflow, entryInflow });
    isEditing = false;
  }

  function clearDateFilter() {
    dateFrom = '';
    dateTo = '';
    showDateFilter = false;
  }

  const hasDateFilter = $derived(!!dateFrom || !!dateTo);
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
        
        <!-- Account dropdown -->
        <div class="account-dropdown-wrapper">
          <button 
            class="account-dropdown-trigger"
            onclick={() => showAccountDropdown = !showAccountDropdown}
          >
            <span class="account-name">{selectedAccount?.name || $t('accounts.allAccounts')}</span>
            <ChevronDown class="h-4 w-4 chevron {showAccountDropdown ? 'open' : ''}" />
          </button>
          
          {#if showAccountDropdown}
            <div class="account-dropdown-overlay" onclick={() => showAccountDropdown = false} role="presentation"></div>
            <div class="account-dropdown-menu">
              <button 
                class="account-dropdown-item" 
                class:active={!$selectedAccountId}
                onclick={() => { selectedAccountId.set(null); showAccountDropdown = false; }}
              >
                {$t('accounts.allAccounts')}
              </button>
              {#each $accounts as account}
                <button 
                  class="account-dropdown-item"
                  class:active={$selectedAccountId === account.id}
                  onclick={() => { selectedAccountId.set(account.id); showAccountDropdown = false; }}
                >
                  <span class="account-item-name">{account.name}</span>
                  <span class="account-item-balance" class:positive={account.balance >= 0} class:negative={account.balance < 0}>
                    {formatCurrency(account.balance)}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        
        {#if selectedAccount}
          <span class="tx-balance" class:positive={totals.working >= 0} class:negative={totals.working < 0}>
            {formatCurrency(totals.working)}
          </span>
        {/if}
      </div>
      
      <div class="tx-toolbar-actions">
        <!-- Date filter -->
        <div class="date-filter-wrapper">
          <button 
            class="tx-icon-btn"
            class:active={hasDateFilter || showDateFilter}
            onclick={() => showDateFilter = !showDateFilter}
            title={$t('transactions.dateFilter')}
          >
            <Calendar class="h-4 w-4" />
          </button>
          
          {#if showDateFilter}
            <div class="date-filter-overlay" onclick={() => showDateFilter = false} role="presentation"></div>
            <div class="date-filter-popup">
              <div class="date-filter-row">
                <label>{$t('transactions.from')}:</label>
                <input type="date" bind:value={dateFrom} />
              </div>
              <div class="date-filter-row">
                <label>{$t('transactions.to')}:</label>
                <input type="date" bind:value={dateTo} />
              </div>
              {#if hasDateFilter}
                <button class="date-filter-clear" onclick={clearDateFilter}>
                  {$t('common.clear')}
                </button>
              {/if}
            </div>
          {/if}
        </div>
        
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

    <!-- Table (Desktop) -->
    <div class="tx-table-container">
      <table class="tx-table">
        <thead>
          <tr>
            <th class="col-flag"></th>
            <th class="col-date">{$t('transactions.date')}</th>
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
          
          <!-- Inline entry row -->
          {#if isEditing}
            <tr class="tx-entry-row">
              <td class="col-flag"></td>
              <td class="col-date">
                <input type="date" class="entry-input" bind:value={entryDate} />
              </td>
              {#if !selectedAccount}
                <td class="col-account">
                  <input 
                    type="text" 
                    class="entry-input"
                    placeholder={$t('transactions.account')}
                    bind:value={entryAccount}
                    list="accounts-list"
                  />
                  <datalist id="accounts-list">
                    {#each $accounts as account}
                      <option value={account.name}>{account.name}</option>
                    {/each}
                  </datalist>
                </td>
              {/if}
              <td class="col-payee">
                <input 
                  type="text" 
                  class="entry-input" 
                  placeholder={$t('transactions.payee')}
                  bind:value={entryPayee}
                  list="payees-list"
                />
                <datalist id="payees-list">
                  {#each $payees as payee}
                    <option value={payee.name}></option>
                  {/each}
                </datalist>
              </td>
              <td class="col-category">
                <input 
                  type="text" 
                  class="entry-input" 
                  placeholder={$t('transactions.category')}
                  bind:value={entryCategory}
                  list="categories-list"
                />
                <datalist id="categories-list">
                  {#each $categories as cat}
                    <option value={cat.name}></option>
                  {/each}
                </datalist>
                <input 
                  type="text" 
                  class="entry-input entry-memo" 
                  placeholder={$t('transactions.memo')}
                  bind:value={entryMemo}
                />
              </td>
              <td class="col-outflow">
                <input 
                  type="text" 
                  class="entry-input entry-amount" 
                  placeholder="0.00"
                  bind:value={entryOutflow}
                />
              </td>
              <td class="col-inflow">
                <input 
                  type="text" 
                  class="entry-input entry-amount" 
                  placeholder="0.00"
                  bind:value={entryInflow}
                />
              </td>
              {#if selectedAccount}
                <td class="col-balance"></td>
              {/if}
              <td class="col-status">
                <div class="entry-actions">
                  <button class="entry-save-btn" onclick={saveEntry} title={$t('common.save')}>
                    <Save class="h-3.5 w-3.5" />
                  </button>
                  <button class="entry-cancel-btn" onclick={cancelEntry} title={$t('common.cancel')}>
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          {:else}
            <!-- Add transaction row (discrete) -->
            <tr class="tx-add-row" onclick={startEntry}>
              <td class="col-flag">
                <Plus class="h-3.5 w-3.5 add-icon" />
              </td>
              <td colspan={selectedAccount ? 7 : 8} class="add-cell">
                <span class="add-text">{$t('transactions.addTransaction')}</span>
              </td>
            </tr>
          {/if}
        </thead>
        <tbody>
          {#each transactionsWithBalance as tx (tx.id)}
            {@const isOutflow = tx.amount < 0}
            {@const isInflow = tx.amount > 0}
            <tr 
              class="tx-row"
              onclick={() => onEditTransaction?.(tx.id)}
            >
              <td class="col-flag">
                {#if tx.flag}
                  <span class="flag-dot flag-{tx.flag.toLowerCase()}"></span>
                {/if}
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
                  {tx.payee || '-'}
                {/if}
              </td>
              <td class="col-category">
                <div class="category-memo">
                  {#if tx.transferAccountId}
                    <span class="transfer-badge" class:outgoing={isOutflow} class:incoming={isInflow}>
                      {isOutflow ? '↗' : '↙'} Transfer
                    </span>
                  {:else}
                    <span class="category-text">{tx.category || '-'}</span>
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
          {/each}
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

  /* Account Dropdown */
  .account-dropdown-wrapper {
    position: relative;
  }

  .account-dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    cursor: pointer;
    transition: all 0.15s;
    font-size: 0.875rem;
  }

  .account-dropdown-trigger:hover {
    border-color: var(--primary);
    background: var(--accent);
  }

  .account-name {
    font-weight: 600;
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chevron {
    transition: transform 0.15s;
    color: var(--muted-foreground);
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .account-dropdown-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .account-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 50;
    min-width: 260px;
    max-height: 360px;
    overflow-y: auto;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  .account-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.625rem 0.875rem;
    border: none;
    background: transparent;
    color: var(--foreground);
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }

  .account-dropdown-item:hover {
    background: var(--accent);
  }

  .account-dropdown-item.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .account-dropdown-item.active .account-item-balance {
    color: var(--primary-foreground);
  }

  .account-item-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 0.75rem;
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

  /* Date Filter */
  .date-filter-wrapper {
    position: relative;
  }

  .date-filter-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
  }

  .date-filter-popup {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 50;
    padding: 0.75rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    min-width: 200px;
  }

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

  .col-flag { width: 24px; text-align: center; }
  .col-date { width: 90px; }
  .col-account { width: 110px; }
  .col-payee { min-width: 120px; }
  .col-category { min-width: 140px; }
  .col-outflow, .col-inflow, .col-balance { 
    width: 85px; 
    text-align: right; 
    font-family: var(--font-family-mono);
    font-feature-settings: "tnum";
  }
  .col-status { width: 32px; text-align: center; }

  .col-outflow.has-value { color: var(--destructive); }
  .col-inflow.has-value { color: var(--success); }
  .col-balance.positive { color: var(--success); }
  .col-balance.negative { color: var(--destructive); }

  /* Add Transaction Row */
  .tx-add-row {
    cursor: pointer;
    transition: background 0.15s;
  }

  .tx-add-row:hover {
    background: var(--accent);
  }

  .tx-add-row td {
    padding: 0.375rem;
    border-bottom: 2px solid var(--border);
  }

  .add-icon {
    color: var(--muted-foreground);
  }

  .add-cell {
    color: var(--muted-foreground);
  }

  .add-text {
    font-size: 0.75rem;
    font-style: italic;
  }

  .tx-add-row:hover .add-icon,
  .tx-add-row:hover .add-text {
    color: var(--primary);
  }

  /* Inline Entry Row */
  .tx-entry-row {
    background: var(--accent);
  }

  .tx-entry-row td {
    padding: 0.375rem 0.25rem;
    vertical-align: top;
    border-bottom: 2px solid var(--primary);
  }

  .entry-input {
    width: 100%;
    padding: 0.25rem 0.375rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.75rem;
    transition: border-color 0.15s;
  }

  .entry-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .entry-input::placeholder {
    color: var(--muted-foreground);
  }

  .entry-memo {
    margin-top: 0.25rem;
    font-style: italic;
  }

  .entry-amount {
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

  .flag-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
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
