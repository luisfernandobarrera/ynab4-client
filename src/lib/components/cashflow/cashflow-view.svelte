<script lang="ts">
  import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-svelte';
  import { accounts, transactions, payees } from '$lib/stores/budget';
  import { t } from '$lib/i18n';
  import { formatCurrency } from '$lib/utils';
  import DateNavigation from '$lib/components/transactions/date-navigation.svelte';

  // State
  let selectedYear = $state(new Date().getFullYear());
  let selectedMonth = $state(new Date().getMonth());
  let mainTab = $state<'summary' | 'checking' | 'savings'>('summary');
  let showDateNav = $state(false);

  // Get month names
  const monthsLong = $derived(($t('months.long') as unknown) as string[]);

  // Format amount
  function formatAmount(amount: number): string {
    return Math.abs(amount).toLocaleString(undefined, {
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

  // Get date range for selected month
  function getDateRange(): { from: string; to: string } {
    const from = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const to = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${lastDay}`;
    return { from, to };
  }

  // Classify accounts by type
  const accountTypes = $derived.by(() => {
    const checking = new Set<string>();
    const savings = new Set<string>();
    const creditCards = new Set<string>();
    const cash = new Set<string>();
    
    $accounts.forEach(a => {
      if (a.closed) return;
      
      const type = a.type?.toLowerCase() || '';
      
      if (type.includes('checking') || type === 'Checking') {
        checking.add(a.id);
      } else if (type.includes('savings') || type === 'Savings') {
        savings.add(a.id);
      } else if (type.includes('credit') || type === 'CreditCard') {
        creditCards.add(a.id);
      } else if (type.includes('cash') || type === 'Cash') {
        cash.add(a.id);
      }
    });
    
    return { checking, savings, creditCards, cash };
  });

  // Calculate cash flow data
  const cashFlowData = $derived.by(() => {
    const { from, to } = getDateRange();
    const { checking, savings, creditCards, cash } = accountTypes;
    
    // Filter transactions by date
    const filtered = $transactions.filter(tx => {
      if (tx.date < from || tx.date > to) return false;
      return true;
    });
    
    // Initialize totals per account
    const accountData: Record<string, {
      name: string;
      type: string;
      initialBalance: number;
      finalBalance: number;
      inflows: number;
      outflows: number;
      change: number;
    }> = {};
    
    // Calculate balances before the period for each account
    $accounts.forEach(acc => {
      if (acc.closed) return;
      
      // Calculate balance before the selected month
      const beforeBalance = $transactions
        .filter(tx => tx.accountId === acc.id && tx.date < from)
        .reduce((sum, tx) => sum + tx.amount, 0);
      
      accountData[acc.id] = {
        name: acc.name,
        type: acc.type,
        initialBalance: beforeBalance,
        finalBalance: beforeBalance,
        inflows: 0,
        outflows: 0,
        change: 0
      };
    });
    
    // Process transactions in period
    filtered.forEach(tx => {
      if (!accountData[tx.accountId]) return;
      
      accountData[tx.accountId].finalBalance += tx.amount;
      accountData[tx.accountId].change += tx.amount;
      
      if (tx.amount >= 0) {
        accountData[tx.accountId].inflows += tx.amount;
      } else {
        accountData[tx.accountId].outflows += Math.abs(tx.amount);
      }
    });
    
    // Calculate totals
    let totalIncome = 0;
    let totalExpenses = 0;
    let checkingInitial = 0;
    let checkingFinal = 0;
    let savingsInitial = 0;
    let savingsFinal = 0;
    
    Object.entries(accountData).forEach(([id, data]) => {
      if (checking.has(id)) {
        checkingInitial += data.initialBalance;
        checkingFinal += data.finalBalance;
        totalIncome += data.inflows;
        totalExpenses += data.outflows;
      } else if (savings.has(id)) {
        savingsInitial += data.initialBalance;
        savingsFinal += data.finalBalance;
      }
    });
    
    return {
      accountData,
      checking: Array.from(checking).map(id => ({ id, ...accountData[id] })).filter(a => a.name),
      savings: Array.from(savings).map(id => ({ id, ...accountData[id] })).filter(a => a.name),
      totals: {
        totalIncome,
        totalExpenses,
        netFlow: totalIncome - totalExpenses,
        checkingInitial,
        checkingFinal,
        checkingChange: checkingFinal - checkingInitial,
        savingsInitial,
        savingsFinal,
        savingsChange: savingsFinal - savingsInitial
      }
    };
  });

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
</script>

<div class="cashflow-view">
  <!-- Header -->
  <div class="cf-header">
    <div class="cf-nav">
      <button class="nav-btn" onclick={() => navigateMonth(-1)}>
        <ChevronLeft class="h-5 w-5" />
      </button>
      <button class="month-display" onclick={() => showDateNav = !showDateNav}>
        <span class="month-name">{monthsLong[selectedMonth]}</span>
        <span class="year-name">{selectedYear}</span>
      </button>
      <button class="nav-btn" onclick={() => navigateMonth(1)}>
        <ChevronRight class="h-5 w-5" />
      </button>
    </div>
    
    <div class="cf-tabs">
      <button 
        class="tab-btn" 
        class:active={mainTab === 'summary'}
        onclick={() => mainTab = 'summary'}
      >
        {$t('cashFlow.summary')}
      </button>
      <button 
        class="tab-btn" 
        class:active={mainTab === 'checking'}
        onclick={() => mainTab = 'checking'}
      >
        {$t('cashFlow.checking')}
      </button>
      <button 
        class="tab-btn" 
        class:active={mainTab === 'savings'}
        onclick={() => mainTab = 'savings'}
      >
        {$t('cashFlow.savings')}
      </button>
    </div>
  </div>

  <!-- Date Navigation (optional) -->
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

  <!-- Content -->
  <div class="cf-content">
    {#if mainTab === 'summary'}
      <!-- Summary View -->
      <div class="cf-summary">
        <!-- Overview Cards -->
        <div class="summary-cards">
          <div class="summary-card income">
            <div class="card-icon">
              <TrendingUp class="h-6 w-6" />
            </div>
            <div class="card-content">
              <span class="card-label">{$t('cashFlow.income')}</span>
              <span class="card-value positive">{formatAmount(cashFlowData.totals.totalIncome)}</span>
            </div>
          </div>
          
          <div class="summary-card expenses">
            <div class="card-icon">
              <TrendingDown class="h-6 w-6" />
            </div>
            <div class="card-content">
              <span class="card-label">{$t('cashFlow.expenses')}</span>
              <span class="card-value negative">{formatAmount(cashFlowData.totals.totalExpenses)}</span>
            </div>
          </div>
          
          <div class="summary-card net">
            <div class="card-icon">
              <ArrowRightLeft class="h-6 w-6" />
            </div>
            <div class="card-content">
              <span class="card-label">{$t('cashFlow.netCashFlow')}</span>
              <span class="card-value {getBalanceClass(cashFlowData.totals.netFlow)}">
                {formatChange(cashFlowData.totals.netFlow)}
              </span>
            </div>
          </div>
        </div>

        <!-- Balance Summary -->
        <div class="balance-summary">
          <h3 class="section-title">{$t('cashFlow.summary')}</h3>
          
          <table class="balance-table">
            <thead>
              <tr>
                <th>{$t('cashFlow.type')}</th>
                <th class="col-amount">{$t('cashFlow.initial')}</th>
                <th class="col-amount">{$t('cashFlow.final')}</th>
                <th class="col-amount">{$t('common.change')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="type-label">{$t('cashFlow.checking')}</td>
                <td class="col-amount">{formatAmount(cashFlowData.totals.checkingInitial)}</td>
                <td class="col-amount">{formatAmount(cashFlowData.totals.checkingFinal)}</td>
                <td class="col-amount {getBalanceClass(cashFlowData.totals.checkingChange)}">
                  {formatChange(cashFlowData.totals.checkingChange)}
                </td>
              </tr>
              <tr>
                <td class="type-label">{$t('cashFlow.savings')}</td>
                <td class="col-amount">{formatAmount(cashFlowData.totals.savingsInitial)}</td>
                <td class="col-amount">{formatAmount(cashFlowData.totals.savingsFinal)}</td>
                <td class="col-amount {getBalanceClass(cashFlowData.totals.savingsChange)}">
                  {formatChange(cashFlowData.totals.savingsChange)}
                </td>
              </tr>
              <tr class="total-row">
                <td class="type-label">{$t('common.total')}</td>
                <td class="col-amount">
                  {formatAmount(cashFlowData.totals.checkingInitial + cashFlowData.totals.savingsInitial)}
                </td>
                <td class="col-amount">
                  {formatAmount(cashFlowData.totals.checkingFinal + cashFlowData.totals.savingsFinal)}
                </td>
                <td class="col-amount {getBalanceClass(cashFlowData.totals.checkingChange + cashFlowData.totals.savingsChange)}">
                  {formatChange(cashFlowData.totals.checkingChange + cashFlowData.totals.savingsChange)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    {:else if mainTab === 'checking'}
      <!-- Checking Accounts -->
      <div class="cf-accounts">
        <h3 class="section-title">{$t('cashFlow.checking')}</h3>
        
        {#if cashFlowData.checking.length === 0}
          <div class="empty-state">
            <p>{$t('reconciliation.noAccounts')}</p>
          </div>
        {:else}
          <table class="accounts-table">
            <thead>
              <tr>
                <th>{$t('transactions.account')}</th>
                <th class="col-amount">{$t('cashFlow.initial')}</th>
                <th class="col-amount">{$t('cashFlow.income')}</th>
                <th class="col-amount">{$t('cashFlow.expenses')}</th>
                <th class="col-amount">{$t('cashFlow.final')}</th>
                <th class="col-amount">{$t('common.change')}</th>
              </tr>
            </thead>
            <tbody>
              {#each cashFlowData.checking as account (account.id)}
                <tr>
                  <td class="account-name">{account.name}</td>
                  <td class="col-amount">{formatAmount(account.initialBalance)}</td>
                  <td class="col-amount positive">{formatAmount(account.inflows)}</td>
                  <td class="col-amount negative">{formatAmount(account.outflows)}</td>
                  <td class="col-amount">{formatAmount(account.finalBalance)}</td>
                  <td class="col-amount {getBalanceClass(account.change)}">
                    {formatChange(account.change)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    {:else if mainTab === 'savings'}
      <!-- Savings Accounts -->
      <div class="cf-accounts">
        <h3 class="section-title">{$t('cashFlow.savings')}</h3>
        
        {#if cashFlowData.savings.length === 0}
          <div class="empty-state">
            <p>{$t('reconciliation.noAccounts')}</p>
          </div>
        {:else}
          <table class="accounts-table">
            <thead>
              <tr>
                <th>{$t('transactions.account')}</th>
                <th class="col-amount">{$t('cashFlow.initial')}</th>
                <th class="col-amount">{$t('cashFlow.income')}</th>
                <th class="col-amount">{$t('cashFlow.expenses')}</th>
                <th class="col-amount">{$t('cashFlow.final')}</th>
                <th class="col-amount">{$t('common.change')}</th>
              </tr>
            </thead>
            <tbody>
              {#each cashFlowData.savings as account (account.id)}
                <tr>
                  <td class="account-name">{account.name}</td>
                  <td class="col-amount">{formatAmount(account.initialBalance)}</td>
                  <td class="col-amount positive">{formatAmount(account.inflows)}</td>
                  <td class="col-amount negative">{formatAmount(account.outflows)}</td>
                  <td class="col-amount">{formatAmount(account.finalBalance)}</td>
                  <td class="col-amount {getBalanceClass(account.change)}">
                    {formatChange(account.change)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    {/if}
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

  .cf-tabs {
    display: flex;
    gap: 0.25rem;
  }

  .tab-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--muted-foreground);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .tab-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .tab-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  /* Content */
  .cf-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  /* Summary */
  .cf-summary {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .summary-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--muted);
    color: var(--muted-foreground);
  }

  .summary-card.income .card-icon {
    background: rgba(34, 197, 94, 0.1);
    color: var(--success);
  }

  .summary-card.expenses .card-icon {
    background: rgba(239, 68, 68, 0.1);
    color: var(--destructive);
  }

  .summary-card.net .card-icon {
    background: rgba(59, 130, 246, 0.1);
    color: var(--primary);
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .card-label {
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }

  .card-value {
    font-size: 1.25rem;
    font-weight: 600;
    font-family: var(--font-family-mono);
  }

  .card-value.positive {
    color: var(--success);
  }

  .card-value.negative {
    color: var(--destructive);
  }

  .card-value.zero {
    color: var(--muted-foreground);
  }

  /* Sections */
  .section-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--foreground);
    margin: 0 0 0.75rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .balance-summary {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
  }

  /* Tables */
  .balance-table,
  .accounts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .balance-table th,
  .accounts-table th {
    text-align: left;
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--muted-foreground);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .balance-table td,
  .accounts-table td {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
    color: var(--foreground);
  }

  .balance-table tr:last-child td,
  .accounts-table tr:last-child td {
    border-bottom: none;
  }

  .col-amount {
    text-align: right;
    font-family: var(--font-family-mono);
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

  .type-label {
    font-weight: 500;
  }

  .total-row {
    font-weight: 600;
    background: var(--muted);
  }

  .account-name {
    font-weight: 500;
  }

  /* Empty State */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--muted-foreground);
  }

  /* CF Accounts Section */
  .cf-accounts {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
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

    .cf-tabs {
      justify-content: center;
    }

    .summary-cards {
      grid-template-columns: 1fr;
    }

    .balance-table,
    .accounts-table {
      display: block;
      overflow-x: auto;
    }
  }
</style>

