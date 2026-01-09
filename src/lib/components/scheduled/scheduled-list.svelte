<script lang="ts">
  import { AlertCircle, Plus, CalendarDays, Calendar, Clock, Play, SkipForward } from 'lucide-svelte';
  import { scheduledTransactions, payees, categories, accounts } from '$lib/stores/budget';
  import { t } from '$lib/i18n';
  import {
    formatCurrency,
    formatDateLong,
    getPayeeName as getPayeeNameUtil,
    getCategoryName as getCategoryNameUtil
  } from '$lib/utils';

  interface Props {
    onAdd?: () => void;
  }

  let { onAdd }: Props = $props();

  // Simple date helpers
  function getTodayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  // Wrapper functions to use stores with centralized utilities
  function getPayeeName(payeeId: string | null): string {
    return getPayeeNameUtil(payeeId, $payees);
  }

  function getCategoryName(categoryId: string | null): string {
    return getCategoryNameUtil(categoryId, $categories, '');
  }

  function getAccountName(accountId: string): string {
    const a = $accounts.find(a => a.id === accountId);
    return a?.name || '';
  }

  // Frequency labels
  const frequencyLabels: Record<string, string> = {
    'Once': 'Una vez',
    'Weekly': 'Semanal',
    'Every2Weeks': 'Cada 2 semanas',
    'TwiceAMonth': 'Dos veces al mes',
    'Every4Weeks': 'Cada 4 semanas',
    'Monthly': 'Mensual',
    'Every2Months': 'Cada 2 meses',
    'Every3Months': 'Trimestral',
    'Every4Months': 'Cada 4 meses',
    'TwiceAYear': 'Semestral',
    'Yearly': 'Anual',
  };

  // Compute sorted and grouped transactions
  const processedData = $derived.by(() => {
    const today = getTodayStr();
    const all = $scheduledTransactions
      .filter(t => t && t.dateNext && !t.dateNext.startsWith('0'))
      .sort((a, b) => (a.dateNext || '').localeCompare(b.dateNext || ''));
    
    const overdue = all.filter(t => t.dateNext <= today);
    const upcoming = all.filter(t => t.dateNext > today);
    
    return { all, overdue, upcoming, today };
  });

  function handleEnter(txId: string) {
    console.log('Enter transaction:', txId);
  }

  function handleSkip(txId: string) {
    console.log('Skip transaction:', txId);
  }
</script>

<div class="scheduled-view">
  <!-- Header -->
  <div class="scheduled-header">
    <div class="header-info">
      <h2>{$t('nav.scheduled')}</h2>
      <span class="count">{processedData.all.length} programadas</span>
    </div>
    {#if onAdd}
      <button class="add-btn" onclick={onAdd}>
        <Plus class="h-4 w-4" />
        <span>Nueva</span>
      </button>
    {/if}
  </div>

  <!-- Content -->
  <div class="scheduled-content">
    {#if processedData.all.length === 0}
      <div class="empty-state">
        <CalendarDays class="h-12 w-12" />
        <p>No hay transacciones programadas</p>
      </div>
    {:else}
      <!-- Overdue Section -->
      {#if processedData.overdue.length > 0}
        <div class="section overdue-section">
          <div class="section-header">
            <AlertCircle class="h-5 w-5" />
            <h3>Vencidas ({processedData.overdue.length})</h3>
          </div>
          <div class="tx-list">
            {#each processedData.overdue as tx (tx.entityId)}
              <div class="tx-card overdue">
                <div class="tx-main">
                  <div class="tx-info">
                    <span class="tx-payee">{getPayeeName(tx.payeeId)}</span>
                    <span class="tx-category">{getCategoryName(tx.categoryId)}</span>
                  </div>
                  <span class="tx-amount" class:negative={tx.amount < 0}>
                    {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                  </span>
                </div>
                <div class="tx-meta">
                  <span class="tx-date">
                    <Calendar class="h-3 w-3" />
                    {formatDateLong(tx.dateNext)}
                  </span>
                  <span class="tx-freq">
                    <Clock class="h-3 w-3" />
                    {frequencyLabels[tx.frequency] || tx.frequency}
                  </span>
                  <span class="tx-account">{getAccountName(tx.accountId)}</span>
                </div>
                <div class="tx-actions">
                  <button class="action-btn primary" onclick={() => handleEnter(tx.entityId)}>
                    <Play class="h-4 w-4" />
                    Ingresar
                  </button>
                  <button class="action-btn" onclick={() => handleSkip(tx.entityId)}>
                    <SkipForward class="h-4 w-4" />
                    Saltar
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Upcoming Section -->
      {#if processedData.upcoming.length > 0}
        <div class="section">
          <div class="section-header">
            <h3>Próximas ({processedData.upcoming.length})</h3>
          </div>
          <div class="tx-list">
            {#each processedData.upcoming as tx (tx.entityId)}
              <div class="tx-card">
                <div class="tx-main">
                  <div class="tx-info">
                    <span class="tx-payee">{getPayeeName(tx.payeeId)}</span>
                    <span class="tx-category">{getCategoryName(tx.categoryId)}</span>
                  </div>
                  <span class="tx-amount" class:negative={tx.amount < 0}>
                    {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                  </span>
                </div>
                <div class="tx-meta">
                  <span class="tx-date">
                    <Calendar class="h-3 w-3" />
                    {formatDateLong(tx.dateNext)}
                  </span>
                  <span class="tx-freq">
                    <Clock class="h-3 w-3" />
                    {frequencyLabels[tx.frequency] || tx.frequency}
                  </span>
                  <span class="tx-account">{getAccountName(tx.accountId)}</span>
                </div>
                <div class="tx-actions">
                  <button class="action-btn" onclick={() => handleEnter(tx.entityId)}>
                    <Play class="h-4 w-4" />
                    Ingresar
                  </button>
                  <button class="action-btn" onclick={() => handleSkip(tx.entityId)}>
                    <SkipForward class="h-4 w-4" />
                    Saltar
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .scheduled-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
  }

  .scheduled-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }

  .header-info h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .header-info .count {
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    background: var(--primary);
    color: var(--primary-foreground);
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .add-btn:hover {
    opacity: 0.9;
  }

  .scheduled-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: var(--muted-foreground);
    gap: 1rem;
  }

  .section {
    margin-bottom: 1.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .section-header h3 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .overdue-section .section-header {
    color: var(--destructive);
  }

  .overdue-section .section-header h3 {
    color: var(--destructive);
  }

  .tx-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .tx-card {
    padding: 1rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .tx-card.overdue {
    border-color: var(--destructive);
    background: color-mix(in srgb, var(--destructive) 5%, var(--card));
  }

  .tx-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .tx-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1;
  }

  .tx-payee {
    font-weight: 500;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-category {
    font-size: 0.8rem;
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tx-amount {
    font-size: 1.1rem;
    font-weight: 600;
    font-family: var(--font-family-mono);
    color: var(--success);
    white-space: nowrap;
  }

  .tx-amount.negative {
    color: var(--destructive);
  }

  .tx-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .tx-date, .tx-freq {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--muted);
    border-radius: 4px;
  }
  
  .tx-date {
    font-variant-numeric: tabular-nums;
  }

  .tx-card.overdue .tx-date {
    background: var(--destructive);
    color: white;
  }

  .tx-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.625rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: var(--accent);
  }

  .action-btn.primary {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .action-btn.primary:hover {
    opacity: 0.9;
  }
</style>
