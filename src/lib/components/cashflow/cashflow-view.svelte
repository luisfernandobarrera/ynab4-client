<script lang="ts">
  import { ChevronLeft, ChevronRight, Building2, PiggyBank, ArrowUpDown, TrendingUp, TrendingDown, CreditCard, Wallet, PiggyBankIcon, Percent } from 'lucide-svelte';
  import { accounts, transactions, payees, categories } from '$lib/stores/budget';
  import { t, tArray } from '$lib/i18n';
  import DateNavigation from '$lib/components/transactions/date-navigation.svelte';

  // Types
  type TxCategory = 'income' | 'expense' | 'cc_payment' | 'savings_transfer' | 'savings_withdrawal' | 'interest' | 'other';
  type AccountSort = 'name' | 'balance' | 'activity';

  // State
  let selectedYear = $state(new Date().getFullYear());
  let selectedMonth = $state(new Date().getMonth());
  let showDateNav = $state(false);
  let accountFilter = $state<'all' | 'checking' | 'savings'>('all');
  let selectedAccountId = $state<string | null>(null);
  let selectedCategory = $state<TxCategory | null>(null);
  let accountSort = $state<AccountSort>('balance');
  let displayLimit = $state(100);
  let sortDirection = $state<'desc' | 'asc'>('desc'); // desc = newest first
  let showChanges = $state(false); // Toggle for showing account changes
  
  // Reset display limit when filters change
  $effect(() => {
    selectedYear; selectedMonth; accountFilter; selectedAccountId; selectedCategory;
    displayLimit = 100;
  });

  // Get month names
  const monthsLong = $derived($tArray('months.long'));

  // Format helpers
  function formatAmount(amount: number): string {
    return Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDate(dateStr: string): string {
    // Return YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const date = new Date(dateStr + 'T12:00:00');
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

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
    
    $accounts.forEach(a => {
      const type = a.type?.toLowerCase() || '';
      if (type.includes('checking')) checking.add(a.id);
      else if (type.includes('savings')) savings.add(a.id);
      else if (type.includes('credit')) creditCards.add(a.id);
    });
    
    return { checking, savings, creditCards };
  });

  // Helper to get transfer target account ID
  function getTransferTargetId(tx: { transferAccountId: string | null; payeeId: string | null }): string | null {
    if (tx.transferAccountId) return tx.transferAccountId;
    if (tx.payeeId?.startsWith('Payee/Transfer:')) {
      return tx.payeeId.replace('Payee/Transfer:', '');
    }
    return null;
  }

  // Categorize a transaction
  function categorizeTransaction(tx: typeof $transactions[0]): TxCategory {
    const { checking, savings, creditCards } = accountTypes;
    const transferTargetId = getTransferTargetId(tx);
    
    // Check for interest (by category or payee name)
    const payee = $payees.find(p => p.entityId === tx.payeeId);
    const cat = $categories.find(c => c.entityId === tx.categoryId);
    const payeeName = payee?.name?.toLowerCase() || '';
    const catName = cat?.name?.toLowerCase() || '';
    
    if (payeeName.includes('interest') || payeeName.includes('interés') || 
        catName.includes('interest') || catName.includes('interés')) {
      return 'interest';
    }
    
    // Credit card payment (transfer to credit card)
    if (transferTargetId && creditCards.has(transferTargetId)) {
      return 'cc_payment';
    }
    
    // Transfer to savings (from checking to savings)
    if (transferTargetId && savings.has(transferTargetId) && checking.has(tx.accountId)) {
      return 'savings_transfer';
    }
    
    // Withdrawal from savings (from savings to checking)
    if (transferTargetId && checking.has(transferTargetId) && savings.has(tx.accountId)) {
      return 'savings_withdrawal';
    }
    
    // Income vs Expense
    if (tx.amount > 0) return 'income';
    return 'expense';
  }

  // Get category label
  function getCategoryLabel(cat: TxCategory): string {
    const labels: Record<TxCategory, string> = {
      income: 'Ingreso',
      expense: 'Gasto',
      cc_payment: 'Pago TC',
      savings_transfer: 'A Ahorro',
      savings_withdrawal: 'De Ahorro',
      interest: 'Interés',
      other: 'Otro'
    };
    return labels[cat];
  }

  // Define the pool based on filter
  const pool = $derived.by(() => {
    const { checking, savings } = accountTypes;
    if (accountFilter === 'checking') return checking;
    if (accountFilter === 'savings') return savings;
    return new Set([...checking, ...savings]);
  });

  // Pre-compute account balances
  const accountsData = $derived.by(() => {
    const { from, to } = getDateRange();
    const { checking, savings } = accountTypes;
    
    const accountMap = new Map<string, {
      beforeBalance: number;
      monthTotal: number;  // All transactions in month (for final balance)
      inflows: number;     // Non-internal inflows (for display)
      outflows: number;    // Non-internal outflows (for display)
      txCount: number;
    }>();
    
    // Initialize accounts in pool
    for (const acc of $accounts) {
      if (!pool.has(acc.id)) continue;
      accountMap.set(acc.id, { beforeBalance: 0, monthTotal: 0, inflows: 0, outflows: 0, txCount: 0 });
    }
    
    // Calculate balances
    for (const tx of $transactions) {
      const accData = accountMap.get(tx.accountId);
      if (!accData) continue;
      
      const transferTargetId = getTransferTargetId(tx);
      const isInternalTransfer = transferTargetId && pool.has(transferTargetId);
      
      if (tx.date < from) {
        accData.beforeBalance += tx.amount;
      } else if (tx.date <= to) {
        // Always add to monthTotal for accurate final balance
        accData.monthTotal += tx.amount;
        
        // Only count non-internal transfers for inflows/outflows display
        if (!isInternalTransfer) {
          if (tx.amount >= 0) accData.inflows += tx.amount;
          else accData.outflows += Math.abs(tx.amount);
          accData.txCount++;
        }
      }
    }
    
    // Build data array
    const data: Array<{
      id: string;
      name: string;
      type: 'checking' | 'savings';
      initialBalance: number;
      finalBalance: number;
      inflows: number;
      outflows: number;
      activity: number;
      change: number;
      txCount: number;
      isClosed: boolean;
    }> = [];
    
    for (const acc of $accounts) {
      if (!pool.has(acc.id)) continue;
      const accData = accountMap.get(acc.id);
      if (!accData) continue;
      // Show account if it has activity OR has a balance
      const hasActivity = accData.txCount > 0 || Math.abs(accData.monthTotal) > 0.01;
      const hasBalance = Math.abs(accData.beforeBalance) > 0.01 || Math.abs(accData.beforeBalance + accData.monthTotal) > 0.01;
      if (!hasActivity && !hasBalance) continue;
      
      const change = accData.inflows - accData.outflows;
      const isChecking = checking.has(acc.id);
      
      data.push({
        id: acc.id,
        name: acc.name,
        type: isChecking ? 'checking' : 'savings',
        initialBalance: accData.beforeBalance,
        finalBalance: accData.beforeBalance + accData.monthTotal,  // Use actual total, not just non-internal
        inflows: accData.inflows,
        outflows: accData.outflows,
        activity: accData.inflows + accData.outflows,
        change,
        txCount: accData.txCount,
        isClosed: acc.closed || false
      });
    }
    
    // Sort based on selection
    return data.sort((a, b) => {
      if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
      if (accountSort === 'balance') return b.finalBalance - a.finalBalance;
      if (accountSort === 'activity') return b.activity - a.activity;
      return a.name.localeCompare(b.name);
    });
  });

  // Calculate totals
  const totals = $derived.by(() => {
    let initial = 0, inflows = 0, outflows = 0;
    for (const acc of accountsData) {
      initial += acc.initialBalance;
      inflows += acc.inflows;
      outflows += acc.outflows;
    }
    return { initial, inflows, outflows, final: initial + inflows - outflows };
  });

  // Categorized totals for summary
  const categorizedTotals = $derived.by(() => {
    const { from, to } = getDateRange();
    let income = 0, expenses = 0, ccPayments = 0, savingsTransfers = 0, savingsWithdrawals = 0, interest = 0;
    
    for (const tx of $transactions) {
      if (tx.date < from || tx.date > to) continue;
      if (!pool.has(tx.accountId)) continue;
      
      const transferTargetId = getTransferTargetId(tx);
      if (transferTargetId && pool.has(transferTargetId)) continue;
      
      const cat = categorizeTransaction(tx);
      const amount = Math.abs(tx.amount);
      
      switch (cat) {
        case 'income': income += amount; break;
        case 'expense': expenses += amount; break;
        case 'cc_payment': ccPayments += amount; break;
        case 'savings_transfer': savingsTransfers += amount; break;
        case 'savings_withdrawal': savingsWithdrawals += amount; break;
        case 'interest': interest += tx.amount; break;
      }
    }
    
    return { income, expenses, ccPayments, savingsTransfers, savingsWithdrawals, interest };
  });

  // Get initial balance for transactions
  const initialBalance = $derived.by(() => {
    const { from } = getDateRange();
    const targetPool = selectedAccountId ? new Set([selectedAccountId]) : pool;
    
    let balance = 0;
    for (const tx of $transactions) {
      if (tx.date >= from) continue;
      if (!targetPool.has(tx.accountId)) continue;
      balance += tx.amount;
    }
    return balance;
  });

  // Filter transactions with running balance
  const filteredTransactions = $derived.by(() => {
    const { from, to } = getDateRange();
    const targetPool = selectedAccountId ? new Set([selectedAccountId]) : pool;
    
    const result: Array<{
      id: string;
      date: string;
      accountId: string;
      payeeId: string | null;
      categoryId: string | null;
      amount: number;
      memo: string;
      txCategory: TxCategory;
      transferAccountId: string | null;
      runningBalance: number;
    }> = [];
    
    for (const tx of $transactions) {
      if (tx.date < from || tx.date > to) continue;
      if (!targetPool.has(tx.accountId)) continue;
      
      const transferTargetId = getTransferTargetId(tx);
      if (!selectedAccountId && !selectedCategory && transferTargetId && pool.has(transferTargetId)) continue;
      
      const txCat = categorizeTransaction(tx);
      
      // Filter by selected category if set
      if (selectedCategory && txCat !== selectedCategory) continue;
      
      result.push({
        id: tx.id,
        date: tx.date,
        accountId: tx.accountId,
        payeeId: tx.payeeId,
        categoryId: tx.categoryId,
        amount: tx.amount,
        memo: tx.memo || '',
        txCategory: txCat,
        transferAccountId: tx.transferAccountId,
        runningBalance: 0 // Will be calculated after sorting
      });
    }
    
    // Sort by date (always calculate balance from oldest to newest)
    result.sort((a, b) => a.date.localeCompare(b.date));
    
    // Calculate running balance
    let balance = initialBalance;
    for (const tx of result) {
      balance += tx.amount;
      tx.runningBalance = balance;
    }
    
    // Apply display sort
    if (sortDirection === 'desc') {
      result.reverse();
    }
    
    return result;
  });
  
  const displayedTransactions = $derived(filteredTransactions.slice(0, displayLimit));
  const hasMore = $derived(filteredTransactions.length > displayLimit);

  // Group accounts by type
  const checkingAccounts = $derived(accountsData.filter(a => a.type === 'checking'));
  const savingsAccounts = $derived(accountsData.filter(a => a.type === 'savings'));
  const checkingTotal = $derived(checkingAccounts.reduce((sum, a) => sum + a.finalBalance, 0));
  const savingsTotal = $derived(savingsAccounts.reduce((sum, a) => sum + a.finalBalance, 0));

  // Helpers
  function getPayeeName(payeeId: string | null): string {
    if (!payeeId) return '';
    if (payeeId.startsWith('Payee/Transfer:')) {
      const accId = payeeId.replace('Payee/Transfer:', '');
      const acc = $accounts.find(a => a.id === accId);
      return acc?.name || 'Transferencia';
    }
    return $payees.find(p => p.entityId === payeeId)?.name || '';
  }

  function getCategoryName(categoryId: string | null): string {
    if (!categoryId) return '';
    return $categories.find(c => c.entityId === categoryId)?.name || '';
  }

  function getAccountName(accountId: string): string {
    return $accounts.find(a => a.id === accountId)?.name || '';
  }

  // Get normalized account type from account ID
  function getAccountTypeById(accountId: string | null): string {
    if (!accountId) return 'other';
    const account = $accounts.find(a => a.id === accountId);
    if (!account) return 'other';
    const normalized = (account.type || '').toLowerCase();
    if (normalized === 'checking') return 'checking';
    if (normalized === 'savings') return 'savings';
    if (normalized === 'creditcard' || normalized === 'credit card') return 'creditCard';
    if (normalized === 'cash') return 'cash';
    if (normalized === 'lineofcredit') return 'lineOfCredit';
    if (normalized === 'merchantaccount' || normalized === 'merchant') return 'merchant';
    if (normalized === 'investmentaccount' || normalized === 'investment') return 'investment';
    if (normalized === 'mortgage') return 'mortgage';
    if (normalized === 'otherasset') return 'otherAsset';
    if (normalized === 'otherliability') return 'otherLiability';
    return 'other';
  }

  // Get transfer category label based on target account type
  function getTransferCategoryLabel(accountId: string | null): string {
    if (!accountId) return 'Transferencia';
    const type = getAccountTypeById(accountId);
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

  function navigateMonth(direction: number) {
    let newMonth = selectedMonth + direction;
    if (newMonth < 0) { selectedYear -= 1; selectedMonth = 11; }
    else if (newMonth > 11) { selectedYear += 1; selectedMonth = 0; }
    else { selectedMonth = newMonth; }
  }
  
  function selectAccount(id: string | null) {
    selectedAccountId = selectedAccountId === id ? null : id;
  }
  
  function cycleSort() {
    const sorts: AccountSort[] = ['balance', 'activity', 'name'];
    const idx = sorts.indexOf(accountSort);
    accountSort = sorts[(idx + 1) % sorts.length];
  }
</script>

<div class="cashflow-view">
  <!-- Header -->
  <header class="cf-header">
    <div class="cf-nav">
      <button class="nav-btn" onclick={() => navigateMonth(-1)} aria-label="Mes anterior">
        <ChevronLeft class="h-5 w-5" />
      </button>
      <button class="month-display" onclick={() => showDateNav = !showDateNav}>
        <span class="month-name">{monthsLong[selectedMonth]}</span>
        <span class="year-name">{selectedYear}</span>
      </button>
      <button class="nav-btn" onclick={() => navigateMonth(1)} aria-label="Mes siguiente">
        <ChevronRight class="h-5 w-5" />
      </button>
    </div>
    
    <div class="cf-filters">
      <button class="filter-btn" class:active={accountFilter === 'all'} onclick={() => { accountFilter = 'all'; selectedAccountId = null; }}>
        Todos
      </button>
      <button class="filter-btn" class:active={accountFilter === 'checking'} onclick={() => { accountFilter = 'checking'; selectedAccountId = null; }}>
        <Building2 class="h-4 w-4" />
        Cheques
      </button>
      <button class="filter-btn" class:active={accountFilter === 'savings'} onclick={() => { accountFilter = 'savings'; selectedAccountId = null; }}>
        <PiggyBank class="h-4 w-4" />
        Ahorros
      </button>
    </div>
  </header>

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

  <div class="cf-content">
    <!-- Accounts Panel -->
    <aside class="accounts-panel">
      <div class="panel-header">
        <h3>Cuentas</h3>
        <div class="panel-controls">
          <button 
            class="toggle-btn" 
            class:active={showChanges}
            onclick={() => showChanges = !showChanges}
            title="Mostrar cambios del mes"
          >
            ±
          </button>
          <button class="sort-btn" onclick={cycleSort} title="Ordenar por {accountSort}">
            <ArrowUpDown class="h-4 w-4" />
          </button>
        </div>
      </div>
      
      <!-- Summary Card -->
      <div class="summary-card">
        <div class="summary-row">
          <span class="label">Inicial</span>
          <span class="value">{formatAmount(totals.initial)}</span>
        </div>
        <div class="summary-row final">
          <span class="label">Final</span>
          <span class="value">{formatAmount(totals.final)}</span>
        </div>
        {#if showChanges}
          <div class="summary-row change">
            <span class="label">Cambio</span>
            <span class="value" class:positive={totals.final - totals.initial >= 0} class:negative={totals.final - totals.initial < 0}>
              {totals.final - totals.initial >= 0 ? '+' : ''}{formatAmount(totals.final - totals.initial)}
            </span>
          </div>
        {/if}
      </div>
      
      <!-- Categories Summary - Clickable -->
      <div class="categories-summary">
        <button 
          class="cat-row" 
          class:selected={selectedCategory === 'income'}
          onclick={() => selectedCategory = selectedCategory === 'income' ? null : 'income'}
        >
          <span class="cat-icon income"><TrendingUp class="h-3.5 w-3.5" /></span>
          <span class="cat-label">Ingresos</span>
          <span class="cat-value">{formatAmount(categorizedTotals.income)}</span>
        </button>
        <button 
          class="cat-row"
          class:selected={selectedCategory === 'expense'}
          onclick={() => selectedCategory = selectedCategory === 'expense' ? null : 'expense'}
        >
          <span class="cat-icon expense"><TrendingDown class="h-3.5 w-3.5" /></span>
          <span class="cat-label">Gastos</span>
          <span class="cat-value">{formatAmount(categorizedTotals.expenses)}</span>
        </button>
        <button 
          class="cat-row"
          class:selected={selectedCategory === 'cc_payment'}
          onclick={() => selectedCategory = selectedCategory === 'cc_payment' ? null : 'cc_payment'}
        >
          <span class="cat-icon cc"><CreditCard class="h-3.5 w-3.5" /></span>
          <span class="cat-label">Pagos TC</span>
          <span class="cat-value">{formatAmount(categorizedTotals.ccPayments)}</span>
        </button>
        {#if accountFilter !== 'savings'}
          <button 
            class="cat-row"
            class:selected={selectedCategory === 'savings_transfer'}
            onclick={() => selectedCategory = selectedCategory === 'savings_transfer' ? null : 'savings_transfer'}
          >
            <span class="cat-icon savings"><PiggyBank class="h-3.5 w-3.5" /></span>
            <span class="cat-label">A Ahorro</span>
            <span class="cat-value">{formatAmount(categorizedTotals.savingsTransfers)}</span>
          </button>
        {/if}
        {#if accountFilter !== 'checking' && categorizedTotals.savingsWithdrawals > 0}
          <button 
            class="cat-row"
            class:selected={selectedCategory === 'savings_withdrawal'}
            onclick={() => selectedCategory = selectedCategory === 'savings_withdrawal' ? null : 'savings_withdrawal'}
          >
            <span class="cat-icon withdrawal"><Wallet class="h-3.5 w-3.5" /></span>
            <span class="cat-label">De Ahorro</span>
            <span class="cat-value">{formatAmount(categorizedTotals.savingsWithdrawals)}</span>
          </button>
        {/if}
        {#if categorizedTotals.interest !== 0}
          <button 
            class="cat-row"
            class:selected={selectedCategory === 'interest'}
            onclick={() => selectedCategory = selectedCategory === 'interest' ? null : 'interest'}
          >
            <span class="cat-icon interest"><Percent class="h-3.5 w-3.5" /></span>
            <span class="cat-label">Intereses</span>
            <span class="cat-value">{categorizedTotals.interest >= 0 ? '' : '-'}{formatAmount(categorizedTotals.interest)}</span>
          </button>
        {/if}
      </div>
      
      <!-- Account List grouped by type -->
      <div class="accounts-list">
        
        {#if checkingAccounts.length > 0}
          <div class="account-group">
            <div class="group-header">
              <span class="group-name"><Building2 class="h-3.5 w-3.5" /> Cheques</span>
              <span class="group-total">{formatAmount(checkingTotal)}</span>
            </div>
            {#each checkingAccounts as acc (acc.id)}
              <button 
                class="account-item" 
                class:selected={selectedAccountId === acc.id}
                class:closed={acc.isClosed}
                onclick={() => selectAccount(acc.id)}
              >
                <span class="acc-name">{acc.name}</span>
                <div class="acc-amounts">
                  <span class="acc-balance">{formatAmount(acc.finalBalance)}</span>
                  {#if showChanges}
                    <span class="acc-change" class:positive={acc.change >= 0} class:negative={acc.change < 0}>
                      {acc.change >= 0 ? '+' : ''}{formatAmount(acc.change)}
                    </span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
        
        {#if savingsAccounts.length > 0}
          <div class="account-group">
            <div class="group-header">
              <span class="group-name"><PiggyBank class="h-3.5 w-3.5" /> Ahorros</span>
              <span class="group-total">{formatAmount(savingsTotal)}</span>
            </div>
            {#each savingsAccounts as acc (acc.id)}
              <button 
                class="account-item" 
                class:selected={selectedAccountId === acc.id}
                class:closed={acc.isClosed}
                onclick={() => selectAccount(acc.id)}
              >
                <span class="acc-name">{acc.name}</span>
                <div class="acc-amounts">
                  <span class="acc-balance">{formatAmount(acc.finalBalance)}</span>
                  {#if showChanges}
                    <span class="acc-change" class:positive={acc.change >= 0} class:negative={acc.change < 0}>
                      {acc.change >= 0 ? '+' : ''}{formatAmount(acc.change)}
                    </span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </aside>

    <!-- Transactions Table -->
    <main class="transactions-panel">
      <div class="panel-header">
        <h3>{selectedAccountId ? getAccountName(selectedAccountId) : 'Transacciones'}</h3>
        <span class="tx-count">{filteredTransactions.length}</span>
        <button 
          class="sort-btn" 
          onclick={() => sortDirection = sortDirection === 'desc' ? 'asc' : 'desc'}
          title={sortDirection === 'desc' ? 'Más recientes primero' : 'Más antiguas primero'}
        >
          <ArrowUpDown class="h-4 w-4" />
          {sortDirection === 'desc' ? '↓' : '↑'}
        </button>
      </div>
      
      {#if filteredTransactions.length === 0}
        <div class="empty-state">
          <p>Sin transacciones en este período</p>
        </div>
      {:else}
        <div class="table-container">
          <table class="tx-table">
            <thead>
              <tr>
                <th class="col-date">Fecha</th>
                {#if !selectedAccountId}
                  <th class="col-account">Cuenta</th>
                {/if}
                <th class="col-category">Categoría</th>
                <th class="col-payee">Beneficiario</th>
                <th class="col-outflow">Cargo</th>
                <th class="col-inflow">Abono</th>
                <th class="col-balance">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <!-- Initial balance row (at top if ascending, bottom if descending) -->
              {#if sortDirection === 'asc'}
                <tr class="tx-row balance-row">
                  <td class="col-date">{formatDate(getDateRange().from)}</td>
                  {#if !selectedAccountId}<td class="col-account"></td>{/if}
                  <td class="col-category"><em>Saldo Inicial</em></td>
                  <td class="col-payee"></td>
                  <td class="col-outflow"></td>
                  <td class="col-inflow"></td>
                  <td class="col-balance">{formatAmount(initialBalance)}</td>
                </tr>
              {/if}
              
              {#each displayedTransactions as tx (tx.id)}
                {@const isOutflow = tx.amount < 0}
                {@const isTransfer = !!getTransferTargetId(tx)}
                {@const transferTarget = getTransferTargetId(tx)}
                <tr class="tx-row">
                  <td class="col-date">{formatDate(tx.date)}</td>
                  {#if !selectedAccountId}
                    <td class="col-account">{getAccountName(tx.accountId)}</td>
                  {/if}
                  <td class="col-category">
                    {#if isTransfer}
                      <strong>{getTransferCategoryLabel(transferTarget)}</strong>
                    {:else}
                      <strong>{getCategoryName(tx.categoryId)}</strong>
                    {/if}
                  </td>
                  <td class="col-payee">
                    {#if isTransfer}
                      <span class="transfer-display">
                        <span class="transfer-icon">↔</span>
                        {$accounts.find(a => a.id === transferTarget)?.name || getPayeeName(tx.payeeId)}
                      </span>
                    {:else}
                      {getPayeeName(tx.payeeId)}
                    {/if}
                  </td>
                  <td class="col-outflow">{isOutflow ? formatAmount(tx.amount) : ''}</td>
                  <td class="col-inflow">{!isOutflow ? formatAmount(tx.amount) : ''}</td>
                  <td class="col-balance" class:positive={tx.runningBalance >= 0} class:negative={tx.runningBalance < 0}>
                    {formatAmount(tx.runningBalance)}
                  </td>
                </tr>
              {/each}
              
              <!-- Initial balance row (at bottom if descending) -->
              {#if sortDirection === 'desc' && displayedTransactions.length >= filteredTransactions.length}
                <tr class="tx-row balance-row">
                  <td class="col-date">{formatDate(getDateRange().from)}</td>
                  {#if !selectedAccountId}<td class="col-account"></td>{/if}
                  <td class="col-category"><em>Saldo Inicial</em></td>
                  <td class="col-payee"></td>
                  <td class="col-outflow"></td>
                  <td class="col-inflow"></td>
                  <td class="col-balance">{formatAmount(initialBalance)}</td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
        
        {#if hasMore}
          <div class="load-more">
            <button onclick={() => displayLimit += 100}>
              Cargar más ({filteredTransactions.length - displayLimit} restantes)
            </button>
          </div>
        {/if}
      {/if}
    </main>
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
    transition: background 0.15s;
  }

  .nav-btn:hover { background: var(--accent); }

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

  .month-display:hover { background: var(--accent); }
  .month-name { font-size: 1.1rem; font-weight: 600; color: var(--foreground); }
  .year-name { font-size: 0.8rem; color: var(--muted-foreground); }

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

  .filter-btn:hover { background: var(--accent); color: var(--foreground); }
  .filter-btn.active { background: var(--primary); color: white; border-color: var(--primary); }

  /* Content */
  .cf-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    gap: 1px;
    background: var(--border);
  }

  /* Accounts Panel */
  .accounts-panel {
    width: 280px;
    min-width: 280px;
    background: var(--card);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .panel-header h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--foreground);
    margin: 0;
  }

  .panel-controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--muted-foreground);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .toggle-btn:hover { background: var(--accent); color: var(--foreground); }
  .toggle-btn.active { background: var(--primary); color: var(--primary-foreground); border-color: var(--primary); }

  .sort-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 4px;
  }

  .sort-btn:hover { background: var(--accent); color: var(--foreground); }

  /* Summary Card */
  .summary-card {
    padding: 0.75rem 1rem;
    background: var(--accent);
    border-bottom: 1px solid var(--border);
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0;
    font-size: 0.8rem;
  }

  .summary-row .label {
    color: var(--muted-foreground);
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .summary-row .value {
    font-family: var(--font-family-mono);
    font-weight: 500;
    color: var(--foreground);
  }

  .summary-row.final { border-top: 1px solid var(--border); padding-top: 0.5rem; margin-top: 0.25rem; }
  .summary-row.final .label { font-weight: 600; color: var(--foreground); }
  .summary-row.final .value { font-size: 0.85rem; font-weight: 600; }
  .summary-row.change { font-size: 0.75rem; }

  /* Categories Summary */
  .categories-summary {
    padding: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .cat-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    font-size: 0.8rem;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    text-align: left;
    transition: background 0.15s;
  }

  .cat-row:hover { background: var(--accent); }
  .cat-row.selected { background: var(--primary); }
  .cat-row.selected .cat-label,
  .cat-row.selected .cat-value { color: var(--primary-foreground); }
  .cat-row.selected .cat-icon { background: rgba(255, 255, 255, 0.2); color: var(--primary-foreground); }

  .cat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .cat-icon.income { background: rgba(34, 197, 94, 0.15); color: var(--success); }
  .cat-icon.expense { background: rgba(239, 68, 68, 0.15); color: var(--destructive); }
  .cat-icon.cc { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
  .cat-icon.savings { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
  .cat-icon.withdrawal { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
  .cat-icon.interest { background: rgba(234, 179, 8, 0.15); color: #eab308; }

  .cat-label { flex: 1; color: var(--foreground); font-weight: 500; }
  .cat-value { font-family: var(--font-family-mono); font-weight: 600; color: var(--foreground); }

  /* Account List */
  .accounts-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .account-group {
    margin-bottom: 0.75rem;
  }

  .account-group:not(:last-child) {
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.75rem;
  }

  .group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0.5rem;
    margin-bottom: 0.25rem;
  }

  .group-name {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  .group-total {
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .account-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.5rem 0.5rem;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .account-item:hover { background: var(--accent); }
  .account-item.selected { background: var(--primary); }
  .account-item.selected .acc-name,
  .account-item.selected .acc-balance,
  .account-item.selected .acc-change { color: white; }
  .account-item.closed { opacity: 0.5; }

  .acc-name { font-size: 0.75rem; font-weight: 500; color: var(--foreground); }

  .acc-amounts { display: flex; flex-direction: column; align-items: flex-end; gap: 0.125rem; }
  .acc-balance { font-family: var(--font-family-mono); font-size: 0.75rem; font-weight: 500; color: var(--foreground); }
  .acc-change { font-family: var(--font-family-mono); font-size: 0.7rem; }
  .positive { color: var(--success); }
  .negative { color: var(--destructive); }

  /* Transactions Panel */
  .transactions-panel {
    flex: 1;
    background: var(--card);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tx-count {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    background: var(--accent);
    padding: 0.125rem 0.5rem;
    border-radius: 10px;
  }

  .sort-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--accent);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--muted-foreground);
    font-size: 0.7rem;
    cursor: pointer;
    margin-left: auto;
  }

  .sort-btn:hover {
    background: var(--muted);
  }

  .table-container {
    flex: 1;
    overflow: auto;
  }

  .tx-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }

  .tx-table th {
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--card);
    border-bottom: 2px solid var(--border);
    border-right: 1px solid var(--border);
    padding: 0.5rem 0.5rem;
    text-align: left;
    font-weight: 600;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.025em;
    white-space: nowrap;
  }

  .tx-table th:last-child {
    border-right: none;
  }

  .tx-table td {
    padding: 0.5rem 0.5rem;
    border-bottom: 1px solid var(--border);
    border-right: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    color: var(--foreground);
    font-size: 0.75rem;
  }

  .tx-table td:last-child {
    border-right: none;
  }

  .tx-row:hover { background: var(--accent); }
  .tx-row.balance-row { 
    background: var(--muted);
    font-style: italic;
  }
  .tx-row.balance-row em {
    color: var(--muted-foreground);
  }

  .col-date { 
    width: 85px; 
    white-space: nowrap; 
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
  }
  .col-account { width: 100px; font-size: 0.7rem; }
  .col-category { min-width: 140px; }
  .col-category strong { font-weight: 600; }
  .col-payee { min-width: 120px; color: var(--muted-foreground); font-size: 0.75rem; }
  .col-outflow, .col-inflow, .col-balance { 
    width: 85px; 
    text-align: right; 
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
  }

  /* Transfer styling */
  .transfer-display {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .transfer-icon {
    color: var(--muted-foreground);
  }


  .empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
  }

  .load-more {
    padding: 1rem;
    text-align: center;
  }

  .load-more button {
    padding: 0.5rem 1.5rem;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--foreground);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .load-more button:hover { background: var(--accent); }

  /* Responsive */
  @media (max-width: 768px) {
    .cf-content {
      flex-direction: column;
    }
    
    .accounts-panel {
      width: 100%;
      min-width: unset;
      max-height: 40vh;
    }
    
    .accounts-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding: 0.5rem;
    }
    
    .account-item {
      flex: 1 1 calc(50% - 0.25rem);
      min-width: 140px;
    }
    
    .col-account { display: none; }
    .col-category { display: none; }
    .col-type { display: none; }
  }
</style>
