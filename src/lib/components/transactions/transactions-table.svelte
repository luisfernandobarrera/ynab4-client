<script lang="ts">
  import { Flag, Check, Circle } from 'lucide-svelte';
  import { t } from '$lib/i18n';
  import { formatCurrency } from '$lib/utils';
  import { accounts } from '$lib/stores/budget';
  import { isMobile } from '$lib/stores/ui';

  interface Transaction {
    id: string;
    date: string;
    payee: string;
    category: string;
    masterCategory?: string;
    memo?: string;
    outflow: number;
    inflow: number;
    amount: number;
    cleared: 'Uncleared' | 'Cleared' | 'Reconciled';
    flagColor?: string;
    accountId?: string;
    accountName?: string;
    isTransfer?: boolean;
    transferAccountName?: string;
  }

  interface Props {
    transactions: Transaction[];
    showAccount?: boolean;
    showRunningBalance?: boolean;
    onTransactionClick?: (id: string) => void;
  }

  let { 
    transactions, 
    showAccount = false,
    showRunningBalance = false,
    onTransactionClick 
  }: Props = $props();

  // Calculate running balance
  const transactionsWithBalance = $derived(() => {
    if (!showRunningBalance) return transactions;
    
    let runningBalance = 0;
    return transactions.map(tx => {
      runningBalance += tx.amount;
      return { ...tx, runningBalance };
    });
  });

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  }

  function formatAmount(amount: number): string {
    return Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getStatusIcon(cleared: string) {
    switch (cleared) {
      case 'Reconciled': return { icon: '✓✓', class: 'reconciled' };
      case 'Cleared': return { icon: '✓', class: 'cleared' };
      default: return { icon: '○', class: 'uncleared' };
    }
  }

  function getCategoryDisplay(tx: Transaction) {
    if (tx.isTransfer && tx.transferAccountName) {
      return {
        main: tx.transferAccountName,
        sub: 'Transfer',
        isTransfer: true,
        isOutgoing: tx.amount < 0
      };
    }
    return {
      main: tx.category || '-',
      sub: tx.masterCategory || '',
      isTransfer: false,
      isOutgoing: false
    };
  }
</script>

<div class="transactions-table-wrapper">
  <!-- Desktop Table -->
  <table class="transactions-table">
    <thead>
      <tr>
        <th class="col-flag"></th>
        <th class="col-date">{$t('transactions.date')}</th>
        {#if showAccount}
          <th class="col-account">{$t('transactions.account')}</th>
        {/if}
        <th class="col-payee">{$t('transactions.payee')}</th>
        <th class="col-category">{$t('transactions.category')}</th>
        <th class="col-outflow">{$t('transactions.outflow')}</th>
        <th class="col-inflow">{$t('transactions.inflow')}</th>
        {#if showRunningBalance}
          <th class="col-balance">{$t('transactions.balance')}</th>
        {/if}
        <th class="col-status"></th>
      </tr>
    </thead>
    <tbody>
      {#each transactionsWithBalance as tx (tx.id)}
        {@const isOutflow = tx.amount < 0}
        {@const isInflow = tx.amount > 0}
        {@const status = getStatusIcon(tx.cleared)}
        {@const category = getCategoryDisplay(tx)}
        <tr 
          class="transaction-row"
          onclick={() => onTransactionClick?.(tx.id)}
        >
          <!-- Flag -->
          <td class="col-flag">
            {#if tx.flagColor}
              <span class="flag-{tx.flagColor.toLowerCase()}">●</span>
            {/if}
          </td>
          
          <!-- Date -->
          <td class="col-date">{formatDate(tx.date)}</td>
          
          <!-- Account (optional) -->
          {#if showAccount}
            <td class="col-account">{tx.accountName || '-'}</td>
          {/if}
          
          <!-- Payee -->
          <td class="col-payee">
            {#if category.isTransfer}
              <span class="transfer-payee {category.isOutgoing ? 'outgoing' : 'incoming'}">
                {category.main}
              </span>
            {:else}
              {tx.payee || '-'}
            {/if}
          </td>
          
          <!-- Category & Memo -->
          <td class="col-category">
            <div class="category-memo">
              {#if category.isTransfer}
                <span class="transfer-display {category.isOutgoing ? 'outgoing' : 'incoming'}">
                  <span class="transfer-icon">{category.isOutgoing ? '↗' : '↙'}</span>
                  <span>Transfer</span>
                </span>
              {:else}
                <span class="category-text">
                  <span class="cat-sub">{category.main}</span>
                  {#if category.sub}
                    <span class="cat-sep"> · </span>
                    <span class="cat-master">{category.sub}</span>
                  {/if}
                </span>
              {/if}
              {#if tx.memo}
                <span class="memo-text">{tx.memo}</span>
              {/if}
            </div>
          </td>
          
          <!-- Outflow -->
          <td class="col-outflow" class:has-value={isOutflow}>
            {isOutflow ? formatAmount(tx.amount) : ''}
          </td>
          
          <!-- Inflow -->
          <td class="col-inflow" class:has-value={isInflow}>
            {isInflow ? formatAmount(tx.amount) : ''}
          </td>
          
          <!-- Running Balance (optional) -->
          {#if showRunningBalance}
            <td class="col-balance" class:positive={tx.runningBalance >= 0} class:negative={tx.runningBalance < 0}>
              {formatAmount(tx.runningBalance)}
            </td>
          {/if}
          
          <!-- Status -->
          <td class="col-status">
            <span class="status-indicator {status.class}">{status.icon}</span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <!-- Mobile Cards -->
  <div class="transactions-card-list">
    {#each transactionsWithBalance as tx (tx.id)}
      {@const isOutflow = tx.amount < 0}
      {@const status = getStatusIcon(tx.cleared)}
      {@const category = getCategoryDisplay(tx)}
      <div 
        class="transaction-card"
        onclick={() => onTransactionClick?.(tx.id)}
        role="button"
        tabindex="0"
      >
        <div class="transaction-card-header">
          <div class="card-header-left">
            <span class="card-payee-name">
              {#if category.isTransfer}
                {category.main}
              {:else}
                {tx.payee || $t('payees.unknown')}
              {/if}
            </span>
            <span class="card-date">{formatDate(tx.date)}</span>
          </div>
          <span class="card-amount" class:positive={!isOutflow} class:negative={isOutflow}>
            {isOutflow ? '-' : '+'}${formatAmount(tx.amount)}
          </span>
        </div>
        
        <div class="transaction-card-body">
          <div class="card-row">
            <span class="card-category">
              {#if category.isTransfer}
                Transfer · {category.main}
              {:else if category.sub}
                {category.main} · {category.sub}
              {:else}
                {category.main}
              {/if}
            </span>
            <span class="card-status-badge {status.class}">
              {status.icon}
            </span>
          </div>
          
          {#if showAccount && tx.accountName}
            <div class="card-row card-secondary">
              <span class="card-account">{tx.accountName}</span>
              {#if tx.flagColor}
                <span class="card-flag flag-{tx.flagColor.toLowerCase()}">●</span>
              {/if}
            </div>
          {/if}
          
          {#if tx.memo}
            <div class="card-memo">{tx.memo}</div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

