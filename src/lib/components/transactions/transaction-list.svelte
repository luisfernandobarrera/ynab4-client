<script lang="ts">
  import { Plus, Search, Filter, Lock, Circle, CheckCircle2, Settings2, LayoutList } from 'lucide-svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { AccountsPanel } from '$lib/components/accounts';
  import { selectedAccountTransactions, selectedAccountId, accounts, transactions } from '$lib/stores/budget';
  import { isMobile } from '$lib/stores/ui';
  import { formatCurrency } from '$lib/utils';
  import { t } from '$lib/i18n';

  interface Props {
    onAddTransaction?: () => void;
    onEditTransaction?: (id: string) => void;
  }

  let { onAddTransaction, onEditTransaction }: Props = $props();

  let searchQuery = $state('');
  let showAccountsPanel = $state(true);
  let hideReconciled = $state(false);

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

  function getStatusIcon(cleared: string): string {
    switch (cleared) {
      case 'Reconciled': return '✓';
      case 'Cleared': return '○';
      default: return '○';
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
</script>

<div class="transactions-view">
  <!-- Accounts Panel (Desktop) -->
  {#if showAccountsPanel && !$isMobile}
    <AccountsPanel />
  {/if}

  <!-- Main Content -->
  <div class="transactions-main">
    <!-- Toolbar -->
    <div class="tx-toolbar">
      <div class="tx-toolbar-left">
        <h2 class="tx-title">
          {selectedAccount?.name || $t('accounts.allAccounts')}
        </h2>
        {#if selectedAccount}
          <span class="tx-balance" class:positive={totals.working >= 0} class:negative={totals.working < 0}>
            {formatCurrency(totals.working)}
          </span>
        {/if}
      </div>
      
      <div class="tx-toolbar-actions">
        <button 
          class="tx-btn"
          class:active={showAccountsPanel}
          onclick={() => showAccountsPanel = !showAccountsPanel}
          title={$t('transactions.accounts')}
        >
          <LayoutList class="h-4 w-4" />
        </button>
        
        <button 
          class="tx-btn"
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
        
        {#if onAddTransaction}
          <Button onclick={onAddTransaction} class="bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Plus class="h-4 w-4 mr-2" />
            {$t('transactions.addTransaction')}
          </Button>
        {/if}
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
    padding: 0.75rem 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    gap: 1rem;
    flex-wrap: wrap;
  }

  .tx-toolbar-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .tx-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--foreground);
    margin: 0;
  }

  .tx-balance {
    font-family: var(--font-family-mono);
    font-size: 1rem;
    font-weight: 600;
    font-feature-settings: "tnum";
  }

  .tx-balance.positive { color: var(--success); }
  .tx-balance.negative { color: var(--destructive); }

  .tx-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tx-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .tx-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .tx-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .tx-search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .tx-search input {
    width: 200px;
    height: 36px;
    padding: 0 2rem 0 2.25rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.875rem;
  }

  .tx-search input:focus {
    outline: none;
    border-color: var(--ring);
  }

  .tx-search-icon {
    position: absolute;
    left: 0.75rem;
    color: var(--muted-foreground);
    pointer-events: none;
  }

  .tx-search-clear {
    position: absolute;
    right: 0.5rem;
    width: 20px;
    height: 20px;
    border: none;
    background: var(--muted);
    color: var(--muted-foreground);
    border-radius: 50%;
    cursor: pointer;
    font-size: 14px;
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
    font-size: 0.875rem;
  }

  .tx-table thead {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--card);
  }

  .tx-table th {
    text-align: left;
    padding: 0.75rem 0.5rem;
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
  }

  .tx-table td {
    padding: 0.625rem 0.5rem;
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
  .col-account { width: 120px; }
  .col-payee { min-width: 140px; }
  .col-category { min-width: 160px; }
  .col-outflow, .col-inflow, .col-balance { 
    width: 90px; 
    text-align: right; 
    font-family: var(--font-family-mono);
    font-feature-settings: "tnum";
  }
  .col-status { width: 24px; text-align: center; }

  .col-outflow.has-value { color: var(--destructive); }
  .col-inflow.has-value { color: var(--success); }
  .col-balance.positive { color: var(--success); }
  .col-balance.negative { color: var(--destructive); }

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
    font-size: 0.75rem;
    font-style: italic;
  }

  .transfer-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.75rem;
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
    height: 20px;
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
    padding: 0.5rem 1rem;
    background: var(--background);
    color: var(--info);
    font-size: 0.8rem;
    font-weight: 600;
    border-bottom: 2px solid var(--info);
  }

  .tx-card {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    text-align: left;
    gap: 0.75rem;
    transition: background 0.15s;
  }

  .tx-card:hover {
    background: var(--accent);
  }

  .tx-card-status {
    width: 4px;
    height: 32px;
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
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tx-card-category {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tx-card-amount {
    font-family: var(--font-family-mono);
    font-size: 0.9rem;
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
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: var(--muted);
    border-top: 1px solid var(--border);
    font-size: 0.75rem;
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
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 9999px;
    background: var(--info);
    color: white;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: all 0.15s;
  }

  .tx-fab:hover {
    background: var(--info);
    opacity: 0.9;
  }

  .tx-fab:active {
    transform: translateX(-50%) scale(0.95);
  }

  /* Mobile */
  @media (max-width: 768px) {
    .tx-toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .tx-toolbar-left {
      justify-content: space-between;
    }

    .tx-toolbar-actions {
      flex-wrap: wrap;
    }

    .tx-search {
      flex: 1;
      min-width: 150px;
    }

    .tx-search input {
      width: 100%;
    }

    .tx-toolbar-actions > :global(button:last-child) {
      display: none;
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
