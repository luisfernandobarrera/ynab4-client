<script lang="ts">
  import { ChevronRight, Settings2, X, Wallet, CreditCard, PiggyBank, Building2, Landmark } from 'lucide-svelte';
  import { accounts, transactions, selectedAccountId } from '$lib/stores/budget';
  import { t } from '$lib/i18n';

  // State
  let expandedGroups = $state<Set<string>>(new Set(['onBudget', 'offBudget', 'checking', 'savings', 'creditCard', 'cash']));
  let groupBy = $state<'budget' | 'type'>('budget');
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

  // Active accounts
  const activeAccounts = $derived(
    $accounts.filter(a => !a.closed && !a.hidden)
  );

  // Group accounts
  const groupedAccounts = $derived.by(() => {
    const groups: Map<string, { label: string; accounts: typeof $accounts; total: number; order: number }> = new Map();
    
    if (groupBy === 'budget') {
      const onBudget = activeAccounts.filter(a => a.onBudget);
      const offBudget = activeAccounts.filter(a => !a.onBudget);
      
      if (onBudget.length > 0) {
        const total = onBudget.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
        groups.set('onBudget', { label: $t('accounts.onBudget'), accounts: onBudget, total, order: 1 });
      }
      if (offBudget.length > 0) {
        const total = offBudget.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
        groups.set('offBudget', { label: $t('accounts.offBudget'), accounts: offBudget, total, order: 2 });
      }
    } else {
      // Group by type
      const typeGroups: Record<string, { label: string; order: number }> = {
        checking: { label: $t('accountTypes.checking'), order: 1 },
        savings: { label: $t('accountTypes.savings'), order: 2 },
        cash: { label: $t('accountTypes.cash'), order: 3 },
        creditCard: { label: $t('accountTypes.creditCards'), order: 4 },
        investment: { label: $t('accountTypes.investments'), order: 5 },
        other: { label: $t('accountTypes.other'), order: 6 },
      };
      
      for (const account of activeAccounts) {
        const type = getAccountType(account.type);
        if (!groups.has(type)) {
          const config = typeGroups[type] || { label: type, order: 99 };
          groups.set(type, { label: config.label, accounts: [], total: 0, order: config.order });
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
    return activeAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0);
  });

  function getAccountType(type: string): string {
    const typeMap: Record<string, string> = {
      'Checking': 'checking',
      'Savings': 'savings',
      'Cash': 'cash',
      'CreditCard': 'creditCard',
      'Investment': 'investment',
      'LineOfCredit': 'creditCard',
      'Merchant': 'other',
      'PayPal': 'other',
      'Mortgage': 'other',
      'OtherAsset': 'other',
      'OtherLiability': 'other',
    };
    return typeMap[type] || 'other';
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

  function getAccountIcon(type: string) {
    const t = getAccountType(type);
    switch (t) {
      case 'checking': return Building2;
      case 'savings': return PiggyBank;
      case 'creditCard': return CreditCard;
      case 'investment': return Landmark;
      default: return Wallet;
    }
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
        <label>{$t('accounts.groupBy')}:</label>
        <select bind:value={groupBy}>
          <option value="budget">{$t('accounts.byBudget')}</option>
          <option value="type">{$t('accounts.byType')}</option>
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
            class="h-3 w-3 ap-chevron" 
            class:expanded={expandedGroups.has(key)}
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
              {@const Icon = getAccountIcon(account.type)}
              <button
                class="ap-account"
                class:active={$selectedAccountId === account.id}
                onclick={() => selectAccount(account.id)}
              >
                <Icon class="h-4 w-4 ap-account-icon" />
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
    width: 280px;
    min-width: 260px;
    background: var(--card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }

  .ap-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .ap-title {
    font-weight: 600;
    font-size: 0.75rem;
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
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: 6px;
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
    padding: 0.75rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .ap-option-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
  }

  .ap-option-row label {
    color: var(--muted-foreground);
    font-weight: 500;
  }

  .ap-option-row select {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.8rem;
    background: var(--background);
    color: var(--foreground);
  }

  .ap-totals {
    padding: 0.5rem 0.75rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .ap-total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ap-total-label {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .ap-total-value {
    font-family: var(--font-family-mono);
    font-size: 0.85rem;
    font-weight: 600;
    font-feature-settings: "tnum";
  }

  .ap-total-value.positive { color: var(--success); }
  .ap-total-value.negative { color: var(--destructive); }
  .ap-total-value.zero { color: var(--muted-foreground); }

  .ap-groups {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .ap-group {
    margin-bottom: 0.125rem;
  }

  .ap-group-header {
    width: 100%;
    display: flex;
    align-items: center;
    padding: 0.5rem 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted-foreground);
    transition: all 0.15s;
    gap: 0.35rem;
    border-bottom: 1px solid var(--border);
  }

  .ap-group-header:hover {
    color: var(--foreground);
  }

  .ap-chevron {
    transition: transform 0.15s;
    color: var(--muted-foreground);
  }

  .ap-chevron.expanded {
    transform: rotate(90deg);
  }

  .ap-group-name {
    flex: 1;
    text-align: left;
  }

  .ap-group-total {
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
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
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--foreground);
    transition: all 0.15s;
    gap: 0.5rem;
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

  .ap-account.active .ap-account-icon {
    color: var(--primary-foreground);
  }

  .ap-account-icon {
    color: var(--muted-foreground);
    flex-shrink: 0;
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
    font-size: 0.75rem;
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
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
    }
  }
</style>

