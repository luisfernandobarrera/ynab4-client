<script lang="ts">
  import { ChevronRight, Settings2, X } from 'lucide-svelte';
  import { accounts, transactions, selectedAccountId } from '$lib/stores/budget';
  import { t } from '$lib/i18n';

  // State
  let expandedGroups = $state<Set<string>>(new Set(['onBudget', 'offBudget', 'cash', 'checking', 'savings', 'creditCard', 'lineOfCredit', 'paypal', 'merchant', 'investment', 'mortgage', 'otherAsset', 'otherLiability']));
  let groupBy = $state<'budget' | 'type'>('budget');
  let viewMode = $state<'dynamic' | 'normal' | 'showClosed'>('normal');
  let sortBy = $state<'ynab' | 'name' | 'balance'>('ynab');
  let showOptions = $state(false);

  // Calculate balances from transactions
  const accountBalances = $derived.by(() => {
    const balances: Record<string, number> = {};
    for (const tx of $transactions) {
      if (tx.accountId) {
        balances[tx.accountId] = (balances[tx.accountId] || 0) + tx.amount;
      }
    }
    return balances;
  });

  // Get current month range
  const getCurrentMonthRange = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    return { from, to };
  };

  // Accounts with activity this month
  const accountsActiveThisMonth = $derived.by(() => {
    const activeSet = new Set<string>();
    const { from, to } = getCurrentMonthRange();
    
    for (const tx of $transactions) {
      if (tx.accountId && tx.date && tx.date >= from && tx.date <= to && Math.abs(tx.amount) > 0.005) {
        activeSet.add(tx.accountId);
      }
    }
    return activeSet;
  });

  // Check if account is closed
  const isAccountClosed = (account: typeof $accounts[0]) => {
    return account.closed === true || account.hidden === true;
  };

  // Check if account is inactive (no balance, no activity this month)
  const isInactiveAccount = (account: typeof $accounts[0]) => {
    if (isAccountClosed(account)) return false;
    const balance = accountBalances[account.id] || 0;
    const hasBalance = Math.abs(balance) > 0.001;
    const hasActivityThisMonth = accountsActiveThisMonth.has(account.id);
    return !hasBalance && !hasActivityThisMonth;
  };

  // Filter accounts based on viewMode
  const filteredAccounts = $derived.by(() => {
    return $accounts.filter(a => {
      const isClosed = isAccountClosed(a);
      const balance = accountBalances[a.id] || 0;
      const hasBalance = Math.abs(balance) > 0.001;
      const hasActivityThisMonth = accountsActiveThisMonth.has(a.id);

      if (viewMode === 'dynamic') {
        // Only show accounts with balance OR activity this month
        if (isClosed) return false;
        return hasBalance || hasActivityThisMonth;
      } else if (viewMode === 'normal') {
        // Show active accounts, hide closed
        return !isClosed;
      } else {
        // showClosed: show all
        return true;
      }
    });
  });

  // Count closed and inactive
  const closedCount = $derived($accounts.filter(a => isAccountClosed(a)).length);
  const inactiveCount = $derived($accounts.filter(a => isInactiveAccount(a)).length);

  // Group accounts
  const groupedAccounts = $derived.by(() => {
    const groups: Map<string, { label: string; icon: string; accounts: typeof $accounts; total: number; order: number }> = new Map();
    
    // Sort accounts
    let sortedAccounts = [...filteredAccounts];
    if (sortBy === 'name') {
      sortedAccounts.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'balance') {
      sortedAccounts.sort((a, b) => (accountBalances[b.id] || 0) - (accountBalances[a.id] || 0));
    }
    // 'ynab' keeps original order
    
    if (groupBy === 'budget') {
      const onBudget = sortedAccounts.filter(a => a.onBudget);
      const offBudget = sortedAccounts.filter(a => !a.onBudget);
      
      if (onBudget.length > 0) {
        const total = onBudget.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
        groups.set('onBudget', { label: $t('accounts.onBudget'), icon: '▸', accounts: onBudget, total, order: 1 });
      }
      if (offBudget.length > 0) {
        const total = offBudget.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
        groups.set('offBudget', { label: $t('accounts.offBudget'), icon: '▹', accounts: offBudget, total, order: 2 });
      }
    } else {
      // Group by type - all YNAB4 account types from pynab reference
      const typeGroups: Record<string, { label: string; icon: string; order: number }> = {
        cash: { label: $t('accountTypes.cash'), icon: 'EF', order: 1 },
        checking: { label: $t('accountTypes.checking'), icon: 'CH', order: 2 },
        savings: { label: $t('accountTypes.savings'), icon: 'AH', order: 3 },
        creditCard: { label: $t('accountTypes.creditCards'), icon: 'TC', order: 4 },
        lineOfCredit: { label: $t('accountTypes.lineOfCredit'), icon: 'LC', order: 5 },
        paypal: { label: $t('accountTypes.paypal'), icon: 'PP', order: 6 },
        merchant: { label: $t('accountTypes.merchant'), icon: 'TD', order: 7 },
        investment: { label: $t('accountTypes.investments'), icon: 'IN', order: 8 },
        mortgage: { label: $t('accountTypes.mortgage'), icon: 'HI', order: 9 },
        otherAsset: { label: $t('accountTypes.otherAssets'), icon: 'OA', order: 10 },
        otherLiability: { label: $t('accountTypes.otherLiabilities'), icon: 'OD', order: 11 },
      };
      
      for (const account of sortedAccounts) {
        const type = getAccountType(account.type);
        if (!groups.has(type)) {
          const config = typeGroups[type] || { label: type, icon: '??', order: 99 };
          groups.set(type, { label: config.label, icon: config.icon, accounts: [], total: 0, order: config.order });
        }
        const group = groups.get(type)!;
        group.accounts.push(account);
        group.total += accountBalances[account.id] || 0;
      }
    }
    
    return Array.from(groups.entries()).sort((a, b) => a[1].order - b[1].order);
  });

  // Net worth calculation
  const netWorth = $derived.by(() => {
    return filteredAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
  });

  function getAccountType(type: string): string {
    // Map YNAB4 account types - using ynab-library's exact values
    // YNAB4 exact values from pynab reference:
    // - Checking, Savings, CreditCard, Cash
    // - LineofCredit (note: lowercase 'o' in 'of')
    // - Paypal
    // - MerchantAccount (department store cards)
    // - InvestmentAccount
    // - Mortgage
    // - OtherAsset, OtherLiability
    
    const normalized = (type || '').toLowerCase();
    
    if (normalized === 'cash') return 'cash';
    if (normalized === 'checking') return 'checking';
    if (normalized === 'savings') return 'savings';
    if (normalized === 'creditcard' || normalized === 'credit card') return 'creditCard';
    // YNAB4 uses "LineofCredit" (lowercase 'o')
    if (normalized === 'lineofcredit' || normalized === 'line of credit') return 'lineOfCredit';
    // Paypal
    if (normalized === 'paypal') return 'paypal';
    // YNAB4 uses "MerchantAccount" for department store cards
    if (normalized === 'merchantaccount' || normalized === 'merchant account' || normalized === 'merchant') return 'merchant';
    // YNAB4 uses "InvestmentAccount"
    if (normalized === 'investmentaccount' || normalized === 'investment account' || normalized === 'investment') return 'investment';
    // Mortgage
    if (normalized === 'mortgage') return 'mortgage';
    // Other assets/liabilities
    if (normalized === 'otherasset' || normalized === 'other asset') return 'otherAsset';
    if (normalized === 'otherliability' || normalized === 'other liability') return 'otherLiability';
    
    // Log unrecognized types for debugging
    console.warn('[AccountsPanel] Unknown account type:', type, '- treating as otherAsset');
    
    return 'otherAsset';
  }

  function toggleGroup(key: string) {
    const next = new Set(expandedGroups);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    expandedGroups = next;
  }

  function selectAccount(accountId: string) {
    if ($selectedAccountId === accountId) {
      selectedAccountId.set(null);
    } else {
      selectedAccountId.set(accountId);
    }
  }

  function formatBalance(balance: number): string {
    return Math.abs(balance).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getBalanceClass(balance: number): string {
    if (Math.abs(balance) < 0.01) return 'zero';
    return balance >= 0 ? 'positive' : 'negative';
  }

</script>

<div class="accounts-panel">
  <!-- Header -->
  <div class="ap-header">
    <span class="ap-title">{$t('transactions.accounts')}</span>
    <div class="ap-actions">
      {#if $selectedAccountId}
        <button 
          class="ap-btn"
          onclick={() => selectedAccountId.set(null)}
          title={$t('common.clearFilter')}
        >
          <X class="h-4 w-4" />
        </button>
      {/if}
      <button 
        class="ap-btn"
        class:active={showOptions}
        onclick={() => showOptions = !showOptions}
      >
        <Settings2 class="h-4 w-4" />
      </button>
    </div>
  </div>

  <!-- Options -->
  {#if showOptions}
    <div class="ap-options">
      <div class="ap-option-row">
        <label for="ap-view-mode">{$t('accounts.view')}:</label>
        <select id="ap-view-mode" bind:value={viewMode}>
          <option value="dynamic">{$t('accounts.viewDynamic')} ({inactiveCount})</option>
          <option value="normal">{$t('accounts.viewNormal')}</option>
          <option value="showClosed">{$t('accounts.viewClosed')} ({closedCount})</option>
        </select>
      </div>
      <div class="ap-option-row">
        <label for="ap-group-by">{$t('accounts.groupBy')}:</label>
        <select id="ap-group-by" bind:value={groupBy}>
          <option value="budget">{$t('accounts.byBudget')}</option>
          <option value="type">{$t('accounts.byType')}</option>
        </select>
      </div>
      <div class="ap-option-row">
        <label for="ap-sort-by">{$t('accounts.sortBy')}:</label>
        <select id="ap-sort-by" bind:value={sortBy}>
          <option value="ynab">YNAB</option>
          <option value="name">{$t('common.name')}</option>
          <option value="balance">{$t('accounts.balance')}</option>
        </select>
      </div>
    </div>
  {/if}

  <!-- Net Worth -->
  <div class="ap-totals">
    <div class="ap-total-row">
      <span class="ap-total-label">{$t('accounts.netWorth')}</span>
      <span class="ap-total-value {getBalanceClass(netWorth)}">
        {netWorth < 0 ? '-' : ''}{formatBalance(netWorth)}
      </span>
    </div>
  </div>

  <!-- Account Groups -->
  <div class="ap-groups">
    {#each groupedAccounts as [key, group]}
      <div class="ap-group">
        <button class="ap-group-header" onclick={() => toggleGroup(key)}>
          <ChevronRight 
            class="h-3 w-3 ap-chevron {expandedGroups.has(key) ? 'expanded' : ''}"
          />
          <span class="ap-group-name">{group.label}</span>
          <span class="ap-group-total {getBalanceClass(group.total)}">
            {group.total < 0 ? '-' : ''}{formatBalance(group.total)}
          </span>
        </button>

        {#if expandedGroups.has(key)}
          <div class="ap-group-items">
            {#each group.accounts as account}
              {@const balance = accountBalances[account.id] || 0}
              {@const isClosed = isAccountClosed(account)}
              {@const isInactive = isInactiveAccount(account)}
              <button
                class="ap-account"
                class:active={$selectedAccountId === account.id}
                class:closed={isClosed}
                class:inactive={isInactive}
                onclick={() => selectAccount(account.id)}
              >
                <span class="ap-account-name">{account.name}</span>
                <span class="ap-account-balance {getBalanceClass(balance)}">
                  {balance < 0 ? '-' : ''}{formatBalance(balance)}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .accounts-panel {
    width: 240px;
    min-width: 220px;
    max-width: 280px;
    background: var(--card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
    font-size: 0.75rem;
  }

  .ap-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--border);
  }

  .ap-title {
    font-weight: 600;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ap-actions {
    display: flex;
    gap: 0.25rem;
  }

  .ap-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .ap-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .ap-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .ap-options {
    padding: 0.5rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .ap-option-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.7rem;
  }

  .ap-option-row label {
    color: var(--muted-foreground);
    font-weight: 500;
    white-space: nowrap;
  }

  .ap-option-row select {
    flex: 1;
    min-width: 0;
    padding: 0.25rem;
    border: 1px solid var(--border);
    border-radius: 3px;
    font-size: 0.7rem;
    background: var(--background);
    color: var(--foreground);
  }

  .ap-totals {
    padding: 0.375rem 0.625rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .ap-total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ap-total-label {
    font-size: 0.65rem;
    font-weight: 500;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .ap-total-value {
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
    font-weight: 600;
    font-feature-settings: "tnum";
  }

  .ap-total-value.positive { color: var(--success); }
  .ap-total-value.negative { color: var(--destructive); }
  .ap-total-value.zero { color: var(--muted-foreground); }

  .ap-groups {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem 0;
  }

  .ap-group {
    margin-bottom: 0;
  }

  .ap-group-header {
    width: 100%;
    display: flex;
    align-items: center;
    padding: 0.375rem 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--muted-foreground);
    transition: all 0.15s;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border);
  }

  .ap-group-header:hover {
    color: var(--foreground);
  }

  :global(.ap-chevron) {
    transition: transform 0.15s;
    color: var(--muted-foreground);
  }

  :global(.ap-chevron.expanded) {
    transform: rotate(90deg);
  }

  .ap-group-icon {
    font-size: 0.65rem;
    color: var(--muted-foreground);
    margin-right: 0.125rem;
  }

  .ap-group-name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ap-group-total {
    font-family: var(--font-family-mono);
    font-size: 0.7rem;
    font-weight: 600;
    font-feature-settings: "tnum";
  }

  .ap-group-total.positive { color: var(--success); }
  .ap-group-total.negative { color: var(--destructive); }
  .ap-group-total.zero { color: var(--muted-foreground); }

  .ap-group-items {
    background: var(--background);
  }

  .ap-account {
    width: 100%;
    display: flex;
    align-items: center;
    padding: 0.375rem 0.375rem 0.375rem 0.75rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.7rem;
    color: var(--foreground);
    transition: all 0.15s;
    gap: 0.375rem;
  }

  .ap-account:hover {
    background: var(--accent);
  }

  .ap-account.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .ap-account.active .ap-account-balance {
    color: var(--primary-foreground) !important;
  }

  .ap-account.closed {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .ap-account.inactive {
    opacity: 0.6;
    font-style: italic;
  }

  .ap-account-name {
    flex: 1;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 450;
  }

  .ap-account-balance {
    font-family: var(--font-family-mono);
    font-size: 0.65rem;
    font-weight: 500;
    font-feature-settings: "tnum";
    white-space: nowrap;
  }

  .ap-account-balance.positive { color: var(--success); }
  .ap-account-balance.negative { color: var(--destructive); }
  .ap-account-balance.zero { color: var(--muted-foreground); }

  /* Mobile */
  @media (max-width: 768px) {
    .accounts-panel {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      z-index: 900;
      width: 240px;
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
    }
  }
</style>
