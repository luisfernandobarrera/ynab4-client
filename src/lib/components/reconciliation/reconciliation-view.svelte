<script lang="ts">
  import { ChevronDown, ChevronRight, X, Check, AlertTriangle } from 'lucide-svelte';
  import { accounts, transactions, budgetInfo } from '$lib/stores/budget';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { t } from '$lib/i18n';
  import { formatCurrency } from '$lib/utils';

  // Filter state
  let filter = $state<'all' | 'onBudget' | 'offBudget'>('all');
  let expandedTypes = $state<Set<string>>(new Set(['CreditCard', 'Checking', 'Savings']));

  // Reconciliation wizard state
  let showReconciliation = $state(false);
  let reconcileStep = $state<1 | 2 | 3>(1);
  let selectedAccountId = $state<string | null>(null);
  let statementBalance = $state('');
  let statementDate = $state(new Date().toISOString().split('T')[0]);
  let pendingTransactions = $state<Set<string>>(new Set());

  // Get selected account
  const selectedAccount = $derived($accounts.find(a => a.id === selectedAccountId));
  
  // Get cleared transactions for selected account
  const accountTransactions = $derived.by(() => {
    if (!selectedAccountId) return [];
    return $transactions
      .filter(tx => tx.accountId === selectedAccountId && tx.cleared !== 'Reconciled')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  });
  
  // Calculate current cleared balance
  const clearedBalance = $derived.by(() => {
    if (!selectedAccountId) return 0;
    return $transactions
      .filter(tx => tx.accountId === selectedAccountId && tx.cleared === 'Cleared')
      .reduce((sum, tx) => sum + tx.amount, 0);
  });
  
  // Calculate balance with selected pending items
  const pendingBalance = $derived.by(() => {
    let total = clearedBalance;
    pendingTransactions.forEach(txId => {
      const tx = accountTransactions.find(t => t.id === txId);
      if (tx) {
        total += tx.amount;
      }
    });
    return total;
  });
  
  // Calculate difference
  const statementBalanceNum = $derived(parseFloat(statementBalance) || 0);
  const difference = $derived(pendingBalance - statementBalanceNum);
  const isBalanced = $derived(Math.abs(difference) < 0.01);

  function startReconciliation(accountId: string) {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('reconciliation.editModeRequired') });
      return;
    }
    selectedAccountId = accountId;
    reconcileStep = 1;
    statementBalance = '';
    statementDate = new Date().toISOString().split('T')[0];
    pendingTransactions = new Set();
    showReconciliation = true;
  }

  function cancelReconciliation() {
    showReconciliation = false;
    selectedAccountId = null;
    reconcileStep = 1;
  }

  function goToStep2() {
    if (!statementBalance) {
      addToast({ type: 'warning', message: 'Please enter statement balance' });
      return;
    }
    reconcileStep = 2;
  }

  function toggleTransaction(txId: string) {
    const next = new Set(pendingTransactions);
    if (next.has(txId)) {
      next.delete(txId);
    } else {
      next.add(txId);
    }
    pendingTransactions = next;
  }

  function finishReconciliation() {
    if (!isBalanced) {
      addToast({ type: 'warning', message: 'Balance does not match. Create adjustment transaction first.' });
      return;
    }
    
    // Mark all selected transactions as reconciled
    const txIdsToReconcile = [...pendingTransactions];
    
    txIdsToReconcile.forEach(txId => {
      addPendingChange({
        type: 'transaction',
        action: 'update',
        entityId: txId,
        entityName: 'Reconciled transaction',
        data: { cleared: 'Reconciled', reconcileDate: statementDate }
      });
    });
    
    addToast({ type: 'success', message: $t('reconciliation.reconciliationComplete') });
    reconcileStep = 3;
    
    // Close after a delay
    setTimeout(() => {
      cancelReconciliation();
    }, 2000);
  }

  function createAdjustment() {
    if (!selectedAccountId || Math.abs(difference) < 0.01) return;
    
    addPendingChange({
      type: 'transaction',
      action: 'create',
      entityId: 'adjustment-' + Date.now(),
      entityName: 'Reconciliation Adjustment',
      data: {
        accountId: selectedAccountId,
        date: statementDate,
        amount: -difference,
        memo: $t('reconciliation.adjustmentMemo'),
        cleared: 'Cleared'
      }
    });
    
    addToast({ type: 'info', message: 'Adjustment transaction created' });
  }

  // Account type configuration - all YNAB4 types from pynab reference
  function getTypeConfig(type: string): { label: string; icon: string; order: number } {
    const configs: Record<string, { labelKey: string; icon: string; order: number }> = {
      'Cash': { labelKey: 'accountTypes.cash', icon: 'EF', order: 1 },
      'Checking': { labelKey: 'accountTypes.checking', icon: 'CH', order: 2 },
      'Savings': { labelKey: 'accountTypes.savings', icon: 'AH', order: 3 },
      'CreditCard': { labelKey: 'accountTypes.creditCards', icon: 'TC', order: 4 },
      'LineOfCredit': { labelKey: 'accountTypes.lineOfCredit', icon: 'LC', order: 5 },
      'PayPal': { labelKey: 'accountTypes.paypal', icon: 'PP', order: 6 },
      'Merchant': { labelKey: 'accountTypes.merchant', icon: 'TD', order: 7 },
      'Investment': { labelKey: 'accountTypes.investments', icon: 'IN', order: 8 },
      'InvestmentAccount': { labelKey: 'accountTypes.investments', icon: 'IN', order: 8 },
      'Mortgage': { labelKey: 'accountTypes.mortgage', icon: 'HI', order: 9 },
      'OtherAsset': { labelKey: 'accountTypes.otherAssets', icon: 'OA', order: 10 },
      'OtherLiability': { labelKey: 'accountTypes.otherLiabilities', icon: 'OD', order: 11 },
      'OtherCredit': { labelKey: 'accountTypes.lineOfCredit', icon: 'LC', order: 5 },
    };
    const config = configs[type] || { labelKey: 'accountTypes.otherAssets', icon: 'OA', order: 10 };
    return { label: $t(config.labelKey), icon: config.icon, order: config.order };
  }

  // Format date
  function formatDate(dateString: string | null): string {
    if (!dateString) return '-';
    try {
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateString;
    }
  }

  // Get days since date
  function getDaysSince(dateString: string | null): number | null {
    if (!dateString) return null;
    try {
      const [year, month, day] = dateString.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }

  // Get status class based on days since reconciliation
  function getStatusClass(days: number | null): string {
    if (days === null) return 'status-unknown';
    if (days <= 30) return 'status-ok';
    if (days <= 60) return 'status-warning';
    return 'status-danger';
  }

  // Analyze accounts
  const accountAnalyses = $derived.by(() => {
    let candidateAccounts = $accounts.filter(a => !a.closed && !a.hidden);
    
    // Apply budget filter
    if (filter === 'onBudget') {
      candidateAccounts = candidateAccounts.filter(a => a.onBudget);
    } else if (filter === 'offBudget') {
      candidateAccounts = candidateAccounts.filter(a => !a.onBudget);
    }

    return candidateAccounts.map(account => {
      const accountTxs = $transactions.filter(t => t.accountId === account.id);
      
      // Categorize by cleared status
      const reconciledTxs = accountTxs.filter(t => t.cleared === 'Reconciled');
      const clearedTxs = accountTxs.filter(t => t.cleared === 'Cleared');
      const unclearedTxs = accountTxs.filter(t => !t.cleared || t.cleared === 'Uncleared');
      
      // Sort by date descending
      const sortedTxs = [...accountTxs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const sortedClearedTxs = [...clearedTxs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const sortedReconciledTxs = [...reconciledTxs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      
      // Last dates
      const lastTransactionDate = sortedTxs[0]?.date || null;
      const lastClearedDate = sortedClearedTxs[0]?.date || null;
      const lastReconciledDate = sortedReconciledTxs[0]?.date || null;
      
      // Calculate balances
      const clearedBalance = reconciledTxs.reduce((sum, t) => sum + t.amount, 0) +
                            clearedTxs.reduce((sum, t) => sum + t.amount, 0);
      const unclearedBalance = unclearedTxs.reduce((sum, t) => sum + t.amount, 0);
      const workingBalance = clearedBalance + unclearedBalance;
      
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        typeConfig: getTypeConfig(account.type),
        onBudget: account.onBudget,
        isClosed: account.closed,
        lastTransactionDate,
        daysSinceLastTransaction: getDaysSince(lastTransactionDate),
        lastClearedDate,
        daysSinceCleared: getDaysSince(lastClearedDate),
        lastReconciledDate,
        daysSinceReconciled: getDaysSince(lastReconciledDate),
        clearedBalance,
        unclearedBalance,
        workingBalance,
        clearedCount: clearedTxs.length,
        unclearedCount: unclearedTxs.length,
        reconciledCount: reconciledTxs.length,
      };
    });
  });

  // Normalize account type to canonical key
  function getNormalizedType(rawType: string): string {
    const normalized = (rawType || '').toLowerCase();
    if (normalized === 'cash') return 'cash';
    if (normalized === 'checking') return 'checking';
    if (normalized === 'savings') return 'savings';
    if (normalized === 'creditcard' || normalized === 'credit card') return 'creditCard';
    if (normalized === 'lineofcredit' || normalized === 'line of credit') return 'lineOfCredit';
    if (normalized === 'paypal') return 'paypal';
    if (normalized === 'merchantaccount' || normalized === 'merchant account' || normalized === 'merchant') return 'merchant';
    if (normalized === 'investmentaccount' || normalized === 'investment account' || normalized === 'investment') return 'investment';
    if (normalized === 'mortgage') return 'mortgage';
    if (normalized === 'otherasset' || normalized === 'other asset') return 'otherAsset';
    if (normalized === 'otherliability' || normalized === 'other liability') return 'otherLiability';
    return 'otherAsset';
  }

  // Group by normalized account type
  const accountsByType = $derived.by(() => {
    const groups: Map<string, { type: string; config: ReturnType<typeof getTypeConfig>; accounts: typeof accountAnalyses }> = new Map();
    
    for (const account of accountAnalyses) {
      const normalizedType = getNormalizedType(account.type);
      const config = getTypeConfig(normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1)); // Get proper config
      
      if (!groups.has(normalizedType)) {
        groups.set(normalizedType, {
          type: normalizedType,
          config: config,
          accounts: []
        });
      }
      groups.get(normalizedType)!.accounts.push(account);
    }
    
    // Sort groups by order, then accounts by days since reconciled
    const sortedGroups = Array.from(groups.values()).sort((a, b) => a.config.order - b.config.order);
    
    for (const group of sortedGroups) {
      group.accounts.sort((a, b) => {
        if (a.daysSinceReconciled === null && b.daysSinceReconciled !== null) return 1;
        if (a.daysSinceReconciled !== null && b.daysSinceReconciled === null) return -1;
        return (b.daysSinceReconciled || 0) - (a.daysSinceReconciled || 0);
      });
    }
    
    return sortedGroups;
  });

  // Summary stats
  const totalAccounts = $derived(accountAnalyses.length);
  const needsAttention = $derived(accountAnalyses.filter(a => 
    a.daysSinceReconciled === null || a.daysSinceReconciled > 30
  ).length);
  const closedAccounts = $derived(accountAnalyses.filter(a => a.isClosed).length);

  function toggleType(type: string) {
    const next = new Set(expandedTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    expandedTypes = next;
  }
</script>

<div class="reconciliation-view">
  <!-- Summary Bar -->
  <div class="recon-summary-bar">
    <span class="recon-summary">
      {$t('reconciliation.accountsActive', { count: totalAccounts })}
      {#if closedAccounts > 0}
        {$t('reconciliation.accountsClosed', { count: closedAccounts })}
      {/if}
      {#if needsAttention > 0}
        <span class="attention-badge"> · {$t('reconciliation.needsAttention', { count: needsAttention })}</span>
      {/if}
    </span>
    
    <div class="recon-filters">
      <button 
        class="filter-btn"
        class:active={filter === 'all'}
        onclick={() => filter = 'all'}
      >
        {$t('reconciliation.all')}
      </button>
      <button 
        class="filter-btn"
        class:active={filter === 'onBudget'}
        onclick={() => filter = 'onBudget'}
      >
        {$t('reconciliation.onBudget')}
      </button>
      <button 
        class="filter-btn"
        class:active={filter === 'offBudget'}
        onclick={() => filter = 'offBudget'}
      >
        {$t('reconciliation.offBudget')}
      </button>
    </div>
  </div>

  <!-- Content -->
  <div class="recon-content">
    {#if accountsByType.length === 0}
      <div class="recon-empty">
        <p>{$t('reconciliation.noAccounts')}</p>
      </div>
    {:else}
      {#each accountsByType as group (group.type)}
        <div class="account-group">
          <button class="group-header" onclick={() => toggleType(group.type)}>
            <span class="group-icon">{group.config.icon}</span>
            <span class="group-label">{group.config.label}</span>
            <span class="group-count">{group.accounts.length}</span>
            {#if expandedTypes.has(group.type)}
              <ChevronDown class="h-4 w-4 group-chevron" />
            {:else}
              <ChevronRight class="h-4 w-4 group-chevron" />
            {/if}
          </button>
          
          {#if expandedTypes.has(group.type)}
            <table class="accounts-table">
              <thead>
                <tr>
                  <th class="col-name">{$t('transactions.account')}</th>
                  <th class="col-balance">{$t('reconciliation.cleared')}</th>
                  <th class="col-balance">{$t('reconciliation.uncleared')}</th>
                  <th class="col-balance">{$t('reconciliation.working')}</th>
                  <th class="col-date">{$t('reconciliation.lastTx')}</th>
                  <th class="col-date">{$t('reconciliation.lastCleared')}</th>
                  <th class="col-date">{$t('reconciliation.lastReconciled')}</th>
                  <th class="col-days">{$t('reconciliation.days')}</th>
                </tr>
              </thead>
              <tbody>
                {#each group.accounts as account (account.id)}
                  {@const statusClass = getStatusClass(account.daysSinceReconciled)}
                  <tr class="{statusClass}" class:closed={account.isClosed}>
                    <td class="col-name">
                      <span class="account-name">
                        {account.name}
                        {#if account.isClosed}
                          <span class="closed-tag">{$t('reconciliation.closed')}</span>
                        {/if}
                      </span>
                      <span class="budget-tag" class:on={account.onBudget} class:off={!account.onBudget}>
                        {account.onBudget ? $t('reconciliation.onBudget') : $t('reconciliation.offBudget')}
                      </span>
                    </td>
                    <td class="col-balance">
                      <span class:negative={account.clearedBalance < 0} class:positive={account.clearedBalance >= 0}>
                        {formatCurrency(account.clearedBalance)}
                      </span>
                      {#if account.clearedCount + account.reconciledCount > 0}
                        <span class="tx-count">({account.reconciledCount + account.clearedCount})</span>
                      {/if}
                    </td>
                    <td class="col-balance">
                      <span class:negative={account.unclearedBalance < 0} class:positive={account.unclearedBalance >= 0}>
                        {formatCurrency(account.unclearedBalance)}
                      </span>
                      {#if account.unclearedCount > 0}
                        <span class="tx-count">({account.unclearedCount})</span>
                      {/if}
                    </td>
                    <td class="col-balance">
                      <span class="working-balance" class:negative={account.workingBalance < 0} class:positive={account.workingBalance >= 0}>
                        {formatCurrency(account.workingBalance)}
                      </span>
                    </td>
                    <td class="col-date">
                      {#if account.lastTransactionDate}
                        <span class="date-value">{formatDate(account.lastTransactionDate)}</span>
                        <span class="days-ago">{account.daysSinceLastTransaction}d</span>
                      {:else}
                        <span class="no-date">-</span>
                      {/if}
                    </td>
                    <td class="col-date">
                      {#if account.lastClearedDate}
                        <span class="date-value">{formatDate(account.lastClearedDate)}</span>
                        <span class="days-ago">{account.daysSinceCleared}d</span>
                      {:else}
                        <span class="no-date">-</span>
                      {/if}
                    </td>
                    <td class="col-date">
                      {#if account.lastReconciledDate}
                        <span class="date-value">{formatDate(account.lastReconciledDate)}</span>
                        <span class="days-ago">{account.daysSinceReconciled}d</span>
                      {:else}
                        <span class="never-reconciled">{$t('common.never')}</span>
                      {/if}
                    </td>
                    <td class="col-days">
                      <span class="days-badge {statusClass}">
                        {account.daysSinceReconciled !== null ? account.daysSinceReconciled : '∞'}
                      </span>
                    </td>
                    <td class="col-action">
                      {#if !account.isClosed}
                        <button 
                          class="reconcile-btn"
                          onclick={() => startReconciliation(account.id)}
                          title={$t('reconciliation.reconciled')}
                        >
                          <Check class="h-3 w-3" />
                        </button>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- Reconciliation Wizard Modal -->
{#if showReconciliation && selectedAccount}
  <div class="recon-modal-overlay" role="dialog" aria-modal="true">
    <div class="recon-modal">
      <div class="recon-modal-header">
        <h2>{$t('reconciliation.title')}: {selectedAccount.name}</h2>
        <button class="close-btn" onclick={cancelReconciliation}>
          <X class="h-5 w-5" />
        </button>
      </div>
      
      <div class="recon-steps">
        <div class="step" class:active={reconcileStep === 1} class:done={reconcileStep > 1}>
          <span class="step-num">1</span>
          <span class="step-label">{$t('reconciliation.step1')}</span>
        </div>
        <div class="step" class:active={reconcileStep === 2} class:done={reconcileStep > 2}>
          <span class="step-num">2</span>
          <span class="step-label">{$t('reconciliation.step2')}</span>
        </div>
        <div class="step" class:active={reconcileStep === 3}>
          <span class="step-num">3</span>
          <span class="step-label">{$t('reconciliation.step3')}</span>
        </div>
      </div>

      <div class="recon-modal-body">
        {#if reconcileStep === 1}
          <div class="step-content">
            <div class="form-field">
              <label for="statement-date">{$t('reconciliation.statementDate')}</label>
              <input
                id="statement-date"
                type="date"
                bind:value={statementDate}
              />
            </div>
            <div class="form-field">
              <label for="statement-balance">{$t('reconciliation.statementBalance')}</label>
              <div class="balance-input">
                <span class="currency">$</span>
                <input
                  id="statement-balance"
                  type="text"
                  inputmode="decimal"
                  bind:value={statementBalance}
                  placeholder="0.00"
                />
              </div>
            </div>
            <button class="btn-primary" onclick={goToStep2}>
              {$t('reconciliation.startReconciliation')}
            </button>
          </div>
        {:else if reconcileStep === 2}
          <div class="step-content step2">
            <div class="recon-summary-info">
              <div class="summary-row">
                <span class="label">{$t('reconciliation.statementBalance')}:</span>
                <span class="value">{formatCurrency(statementBalanceNum)}</span>
              </div>
              <div class="summary-row">
                <span class="label">{$t('reconciliation.clearedBalance')}:</span>
                <span class="value">{formatCurrency(pendingBalance)}</span>
              </div>
              <div class="summary-row difference" class:balanced={isBalanced} class:unbalanced={!isBalanced}>
                <span class="label">{$t('reconciliation.difference')}:</span>
                <span class="value">{formatCurrency(difference)}</span>
              </div>
              {#if isBalanced}
                <div class="balanced-msg">
                  <Check class="h-4 w-4" />
                  {$t('reconciliation.balanced')}
                </div>
              {/if}
            </div>

            <div class="pending-list">
              <h4>{$t('reconciliation.pendingTransactions')}</h4>
              {#if accountTransactions.length === 0}
                <p class="no-transactions">{$t('reconciliation.noTransactionsToClear')}</p>
              {:else}
                <div class="tx-list">
                  {#each accountTransactions as tx (tx.id)}
                    <button 
                      class="tx-item"
                      class:selected={pendingTransactions.has(tx.id)}
                      onclick={() => toggleTransaction(tx.id)}
                    >
                      <span class="tx-check">
                        {#if pendingTransactions.has(tx.id)}
                          <Check class="h-4 w-4" />
                        {/if}
                      </span>
                      <span class="tx-date">{tx.date}</span>
                      <span class="tx-payee">{tx.payee || '-'}</span>
                      <span class="tx-amount" class:negative={tx.amount < 0} class:positive={tx.amount >= 0}>
                        {formatCurrency(tx.amount)}
                      </span>
                      <span class="tx-status {tx.cleared?.toLowerCase()}">{tx.cleared?.[0] || 'U'}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="recon-actions">
              {#if !isBalanced}
                <button class="btn-secondary" onclick={createAdjustment}>
                  {$t('reconciliation.createAdjustment')}
                </button>
              {/if}
              <button class="btn-primary" onclick={finishReconciliation} disabled={!isBalanced}>
                {$t('reconciliation.finishReconciliation')}
              </button>
            </div>
          </div>
        {:else if reconcileStep === 3}
          <div class="step-content step3">
            <div class="success-icon">
              <Check class="h-12 w-12" />
            </div>
            <h3>{$t('reconciliation.reconciliationComplete')}</h3>
            <p>{$t('reconciliation.transactionsMarkedReconciled')}</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .reconciliation-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
    overflow: hidden;
  }

  /* Summary Bar */
  .recon-summary-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    gap: 1rem;
    flex-wrap: wrap;
  }

  .recon-summary {
    font-size: 0.85rem;
    color: var(--foreground);
  }

  .attention-badge {
    color: var(--destructive);
    font-weight: 500;
  }

  .recon-filters {
    display: flex;
    gap: 0.25rem;
  }

  .filter-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--muted-foreground);
    font-size: 0.75rem;
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

  /* Content */
  .recon-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .recon-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--muted-foreground);
  }

  /* Account Groups */
  .account-group {
    margin-bottom: 0.5rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: var(--muted);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--foreground);
    text-align: left;
    transition: background 0.15s;
  }

  .group-header:hover {
    background: var(--accent);
  }

  .group-icon {
    font-family: var(--font-family-mono);
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--muted-foreground);
    background: var(--background);
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    border: 1px solid var(--border);
  }

  .group-label {
    flex: 1;
  }

  .group-count {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    background: var(--background);
    padding: 0.125rem 0.5rem;
    border-radius: 10px;
  }

  .group-chevron {
    color: var(--muted-foreground);
  }

  /* Table */
  .accounts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .accounts-table th {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--muted-foreground);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--background);
  }

  .accounts-table td {
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .accounts-table tr:last-child td {
    border-bottom: none;
  }

  .accounts-table tr:hover td {
    background: var(--accent);
  }

  .accounts-table tr.closed td {
    opacity: 0.6;
  }

  .col-name {
    min-width: 180px;
  }

  .col-balance {
    text-align: right;
    font-family: var(--font-family-mono);
    white-space: nowrap;
  }

  .col-date {
    text-align: center;
    white-space: nowrap;
  }

  .col-days {
    text-align: center;
    width: 60px;
  }

  .account-name {
    display: block;
    font-weight: 500;
    color: var(--foreground);
    margin-bottom: 0.125rem;
  }

  .closed-tag {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.125rem 0.375rem;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 0.65rem;
    border-radius: 3px;
    font-weight: 500;
  }

  .budget-tag {
    font-size: 0.65rem;
    color: var(--muted-foreground);
  }

  .positive {
    color: var(--foreground);
  }

  .negative {
    color: var(--destructive);
  }

  .working-balance {
    font-weight: 600;
  }

  .tx-count {
    margin-left: 0.25rem;
    font-size: 0.65rem;
    color: var(--muted-foreground);
  }

  .date-value {
    display: block;
    color: var(--foreground);
    font-size: 0.7rem;
  }

  .days-ago {
    display: block;
    font-size: 0.6rem;
    color: var(--muted-foreground);
  }

  .no-date,
  .never-reconciled {
    color: var(--muted-foreground);
    font-style: italic;
  }

  .days-badge {
    display: inline-block;
    font-family: var(--font-family-mono);
    font-size: 0.7rem;
    min-width: 32px;
    text-align: right;
    color: var(--muted-foreground);
  }

  .days-badge.status-warning {
    color: var(--warning);
  }

  .days-badge.status-danger {
    color: var(--destructive);
  }

  /* Action column */
  .col-action {
    width: 50px;
    text-align: center;
  }

  .reconcile-btn {
    display: inline-flex;
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

  .reconcile-btn:hover {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  /* Reconciliation Modal */
  .recon-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    padding: 1rem;
  }

  .recon-modal {
    width: 100%;
    max-width: 600px;
    max-height: 85vh;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .recon-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .recon-modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .recon-steps {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    padding: 1rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .step {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    opacity: 0.5;
  }

  .step.active, .step.done {
    opacity: 1;
  }

  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--muted-foreground);
    color: var(--background);
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 50%;
  }

  .step.active .step-num {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .step.done .step-num {
    background: var(--success);
  }

  .step-label {
    font-size: 0.85rem;
    color: var(--foreground);
  }

  .recon-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .step-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-field label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--foreground);
  }

  .form-field input[type="date"],
  .balance-input input {
    padding: 0.625rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.9rem;
  }

  .balance-input {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .balance-input .currency {
    padding: 0.625rem;
    background: var(--muted);
    color: var(--muted-foreground);
  }

  .balance-input input {
    flex: 1;
    border: none;
    border-radius: 0;
  }

  .btn-primary {
    padding: 0.625rem 1.25rem;
    background: var(--primary);
    color: var(--primary-foreground);
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    padding: 0.625rem 1.25rem;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--foreground);
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-secondary:hover {
    background: var(--accent);
  }

  /* Step 2 */
  .step2 {
    gap: 1.5rem;
  }

  .recon-summary-info {
    background: var(--muted);
    border-radius: 8px;
    padding: 1rem;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    padding: 0.375rem 0;
    font-size: 0.9rem;
  }

  .summary-row.difference {
    border-top: 1px solid var(--border);
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    font-weight: 600;
  }

  .summary-row.balanced .value {
    color: var(--success);
  }

  .summary-row.unbalanced .value {
    color: var(--destructive);
  }

  .balanced-msg {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(34, 197, 94, 0.1);
    color: var(--success);
    border-radius: 4px;
    font-weight: 500;
  }

  .pending-list h4 {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    color: var(--foreground);
  }

  .no-transactions {
    color: var(--muted-foreground);
    font-size: 0.85rem;
    text-align: center;
    padding: 1rem;
  }

  .tx-list {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .tx-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    border-bottom: 1px solid var(--border);
    background: var(--background);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }

  .tx-item:last-child {
    border-bottom: none;
  }

  .tx-item:hover {
    background: var(--accent);
  }

  .tx-item.selected {
    background: rgba(59, 130, 246, 0.1);
  }

  .tx-check {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--primary);
  }

  .tx-item.selected .tx-check {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--primary-foreground);
  }

  .tx-date {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    min-width: 80px;
  }

  .tx-payee {
    flex: 1;
    font-size: 0.85rem;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-amount {
    font-size: 0.85rem;
    font-family: var(--font-family-mono);
    min-width: 80px;
    text-align: right;
  }

  .tx-amount.negative {
    color: var(--destructive);
  }

  .tx-amount.positive {
    color: var(--success);
  }

  .tx-status {
    font-size: 0.65rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    background: var(--muted);
    color: var(--muted-foreground);
  }

  .tx-status.cleared {
    background: rgba(59, 130, 246, 0.2);
    color: var(--primary);
  }

  .recon-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  /* Step 3 */
  .step3 {
    text-align: center;
    padding: 2rem;
  }

  .success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    margin: 0 auto 1rem;
    background: rgba(34, 197, 94, 0.1);
    color: var(--success);
    border-radius: 50%;
  }

  .step3 h3 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    color: var(--foreground);
  }

  .step3 p {
    margin: 0;
    color: var(--muted-foreground);
  }

  /* Mobile */
  @media (max-width: 768px) {
    .recon-summary-bar {
      flex-direction: column;
      align-items: flex-start;
    }

    .accounts-table {
      display: block;
      overflow-x: auto;
    }

    .col-name {
      min-width: 140px;
    }

    .recon-modal {
      max-height: 95vh;
    }

    .recon-steps {
      gap: 1rem;
    }

    .step-label {
      display: none;
    }
  }
</style>

