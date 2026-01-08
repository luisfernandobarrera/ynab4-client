<script lang="ts">
  import { CalendarClock, Play, SkipForward, Calendar, Clock, AlertCircle, ChevronDown, ChevronUp, X, Edit3, Check } from 'lucide-svelte';
  import { scheduledTransactions, payees, categories, accounts, budgetInfo, transactions } from '$lib/stores/budget';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { formatCurrency } from '$lib/utils';
  import { t } from '$lib/i18n';

  interface Props {
    accountId?: string | null;
  }

  let { accountId = null }: Props = $props();

  let isOpen = $state(false);

  // Filter by account if specified
  const filteredScheduled = $derived.by(() => {
    let list = $scheduledTransactions.filter(t => t && t.dateNext && !t.dateNext.startsWith('0'));
    if (accountId) {
      list = list.filter(t => t.accountId === accountId);
    }
    return list.sort((a, b) => (a.dateNext || '').localeCompare(b.dateNext || ''));
  });

  // Get overdue and upcoming counts
  const today = $derived(new Date().toISOString().split('T')[0]);

  const overdueTransactions = $derived(
    filteredScheduled.filter(t => t.dateNext <= today)
  );

  const upcomingTransactions = $derived(
    filteredScheduled.filter(t => t.dateNext > today)
  );

  const totalCount = $derived(filteredScheduled.length);
  const overdueCount = $derived(overdueTransactions.length);

  // Helpers
  function getPayeeName(payeeId: string | null): string {
    if (!payeeId) return 'Sin Beneficiario';
    const p = $payees.find(p => p.entityId === payeeId);
    return p?.name || 'Sin Beneficiario';
  }

  function getCategoryName(categoryId: string | null): string {
    if (!categoryId) return '';
    const c = $categories.find(c => c.entityId === categoryId);
    if (!c) return '';
    // Get master category
    const mc = $categories.find(mc => mc.entityId === c.masterCategoryId);
    return mc ? `${c.name} · ${mc.name}` : c.name;
  }

  function getAccountName(accountIdVal: string): string {
    const a = $accounts.find(a => a.id === accountIdVal);
    return a?.name || '';
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr + 'T12:00:00');
      return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    } catch {
      return dateStr;
    }
  }

  function formatFullDate(dateStr: string): string {
    if (!dateStr) return '';
    return dateStr; // YYYY-MM-DD format
  }

  const frequencyLabels: Record<string, string> = {
    'Never': 'Una vez',
    'Once': 'Una vez',
    'Weekly': 'Semanal',
    'EveryOtherWeek': 'Cada 2 sem',
    'Every2Weeks': 'Cada 2 sem',
    'TwiceAMonth': '2x mes',
    'Every4Weeks': 'Cada 4 sem',
    'Monthly': 'Mensual',
    'EveryOtherMonth': 'Cada 2 meses',
    'Every2Months': 'Cada 2 meses',
    'Every3Months': 'Trimestral',
    'Every4Months': 'Cuatrim.',
    'TwiceAYear': 'Semestral',
    'Yearly': 'Anual',
    'EveryOtherYear': 'Cada 2 años',
    'Every2Years': 'Cada 2 años',
  };

  // Check if tx is overdue
  function isOverdue(dateNext: string): boolean {
    return dateNext <= today;
  }

  // Actions
  async function handleEnter(tx: typeof filteredScheduled[number]) {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Activa el modo edicion para ingresar transacciones' });
      return;
    }

    const client = $budgetInfo.client;
    if (!client) return;

    // Create the transaction from scheduled
    const newTxId = `${tx.entityId}_${tx.dateNext}_0`;

    // Check if already exists
    if ($transactions.some(t => t.entityId === newTxId)) {
      addToast({ type: 'warning', message: 'Esta transaccion ya fue ingresada' });
      return;
    }

    const newTx = {
      entityId: newTxId,
      date: tx.dateNext,
      amount: tx.amount,
      payeeId: tx.payeeId,
      categoryId: tx.categoryId,
      accountId: tx.accountId,
      memo: tx.memo || '',
      cleared: 'Uncleared',
      flag: tx.flag,
      // Mark as entered from scheduled
      dateEnteredFromSchedule: tx.dateNext,
    };

    addPendingChange({
      type: 'transaction',
      action: 'create',
      entityId: newTxId,
      entityName: getPayeeName(tx.payeeId),
      data: newTx,
    });

    // If one-time, mark scheduled as deleted
    if (tx.frequency === 'Never' || tx.frequency === 'Once') {
      addPendingChange({
        type: 'transaction', // For now use transaction type, could add scheduledTransaction later
        action: 'delete',
        entityId: tx.entityId,
        entityName: getPayeeName(tx.payeeId),
        data: { entityId: tx.entityId },
      });
    } else {
      // Update scheduled transaction to next date
      // This would need the RecurrenceCalculator from ynab-library
      // For now, just show success
    }

    addToast({ type: 'success', message: 'Transaccion ingresada' });
  }

  async function handleSkip(tx: typeof filteredScheduled[number]) {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Activa el modo edicion para saltar transacciones' });
      return;
    }

    if (tx.frequency === 'Never' || tx.frequency === 'Once') {
      addToast({ type: 'warning', message: 'No se puede saltar una transaccion unica' });
      return;
    }

    // Would need to calculate next date and update
    addToast({ type: 'info', message: 'Transaccion saltada (pendiente implementar calculo de siguiente fecha)' });
  }

  function togglePanel() {
    isOpen = !isOpen;
  }

  function closePanel() {
    isOpen = false;
  }
</script>

<div class="scheduled-toggle-wrapper">
  <button
    class="scheduled-toggle-btn"
    class:has-overdue={overdueCount > 0}
    class:active={isOpen}
    onclick={togglePanel}
    title={isOpen ? 'Ocultar programadas' : 'Mostrar programadas'}
  >
    <CalendarClock class="h-4 w-4" />
    {#if totalCount > 0}
      <span class="scheduled-count" class:overdue={overdueCount > 0}>
        {totalCount}
      </span>
    {/if}
    {#if isOpen}
      <ChevronUp class="h-3 w-3 chevron" />
    {:else}
      <ChevronDown class="h-3 w-3 chevron" />
    {/if}
  </button>

  {#if isOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="scheduled-panel" onclick={(e) => e.stopPropagation()}>
      <div class="panel-header">
        <div class="header-title">
          <CalendarClock class="h-4 w-4" />
          <span>Transacciones Programadas</span>
          {#if overdueCount > 0}
            <span class="overdue-badge">
              <AlertCircle class="h-3 w-3" />
              {overdueCount} vencidas
            </span>
          {/if}
        </div>
        <div class="header-actions">
          {#if !$isEditMode}
            <span class="edit-mode-hint">
              <Edit3 class="h-3 w-3" />
              Solo lectura
            </span>
          {/if}
          <button class="close-btn" onclick={closePanel}>
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="panel-content">
        {#if filteredScheduled.length === 0}
          <div class="empty-state">
            <CalendarClock class="h-8 w-8" />
            <p>No hay transacciones programadas</p>
          </div>
        {:else}
          <div class="table-wrapper">
            <table class="scheduled-table">
              <thead>
                <tr>
                  <th class="col-date">Fecha</th>
                  <th class="col-payee">Beneficiario</th>
                  <th class="col-category">Categoria</th>
                  {#if !accountId}
                    <th class="col-account">Cuenta</th>
                  {/if}
                  <th class="col-freq">Frecuencia</th>
                  <th class="col-outflow">Salida</th>
                  <th class="col-inflow">Entrada</th>
                  <th class="col-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredScheduled as tx (tx.entityId)}
                  {@const overdue = isOverdue(tx.dateNext)}
                  <tr class:overdue>
                    <td class="col-date" class:overdue-cell={overdue}>
                      {formatFullDate(tx.dateNext)}
                      {#if overdue}
                        <AlertCircle class="h-3 w-3 overdue-icon" />
                      {/if}
                    </td>
                    <td class="col-payee">{getPayeeName(tx.payeeId)}</td>
                    <td class="col-category">
                      {#if getCategoryName(tx.categoryId)}
                        {@const cat = getCategoryName(tx.categoryId)}
                        {@const parts = cat.split(' · ')}
                        <span class="cat-name">{parts[0]}</span>
                        {#if parts[1]}
                          <span class="cat-master">· {parts[1]}</span>
                        {/if}
                      {/if}
                    </td>
                    {#if !accountId}
                      <td class="col-account">{getAccountName(tx.accountId)}</td>
                    {/if}
                    <td class="col-freq">
                      <span class="freq-badge">
                        <Clock class="h-3 w-3" />
                        {frequencyLabels[tx.frequency] || tx.frequency}
                      </span>
                    </td>
                    <td class="col-outflow">
                      {#if tx.amount < 0}
                        <span class="amount negative">{formatCurrency(Math.abs(tx.amount))}</span>
                      {/if}
                    </td>
                    <td class="col-inflow">
                      {#if tx.amount >= 0}
                        <span class="amount positive">{formatCurrency(tx.amount)}</span>
                      {/if}
                    </td>
                    <td class="col-actions">
                      <div class="action-buttons">
                        <button
                          class="action-btn enter"
                          class:primary={overdue}
                          onclick={() => handleEnter(tx)}
                          title="Ingresar en registro"
                          disabled={!$isEditMode}
                        >
                          <Play class="h-3 w-3" />
                        </button>
                        {#if tx.frequency !== 'Never' && tx.frequency !== 'Once'}
                          <button
                            class="action-btn skip"
                            onclick={() => handleSkip(tx)}
                            title="Saltar al siguiente"
                            disabled={!$isEditMode}
                          >
                            <SkipForward class="h-3 w-3" />
                          </button>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="panel-footer">
            <div class="summary">
              <span class="summary-item">
                Total: <strong>{filteredScheduled.length}</strong>
              </span>
              {#if overdueCount > 0}
                <span class="summary-item overdue">
                  Vencidas: <strong>{overdueCount}</strong>
                </span>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .scheduled-toggle-wrapper {
    position: relative;
  }

  .scheduled-toggle-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
    font-size: 0.8rem;
  }

  .scheduled-toggle-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .scheduled-toggle-btn.active {
    background: var(--accent);
    border-color: var(--border);
    color: var(--foreground);
  }

  .scheduled-toggle-btn.has-overdue {
    color: var(--destructive);
  }

  .scheduled-toggle-btn.has-overdue:hover {
    color: var(--destructive);
  }

  .scheduled-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    background: var(--muted);
    border-radius: 9px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .scheduled-count.overdue {
    background: var(--destructive);
    color: white;
  }

  .scheduled-panel {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    width: min(700px, 90vw);
    max-height: 70vh;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 100;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .overdue-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    background: var(--destructive);
    color: white;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .edit-mode-hint {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    padding: 0.25rem 0.5rem;
    background: var(--background);
    border-radius: 4px;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--muted-foreground);
    cursor: pointer;
  }

  .close-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .panel-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: var(--muted-foreground);
    gap: 0.5rem;
    text-align: center;
  }

  .table-wrapper {
    flex: 1;
    overflow: auto;
  }

  .scheduled-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .scheduled-table thead {
    position: sticky;
    top: 0;
    background: var(--muted);
    z-index: 1;
  }

  .scheduled-table th {
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-weight: 600;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.025em;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .scheduled-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .scheduled-table tbody tr {
    background: var(--background);
    transition: background 0.1s;
  }

  .scheduled-table tbody tr:hover {
    background: var(--accent);
  }

  .scheduled-table tbody tr.overdue {
    background: color-mix(in srgb, var(--destructive) 8%, var(--background));
  }

  .scheduled-table tbody tr.overdue:hover {
    background: color-mix(in srgb, var(--destructive) 12%, var(--background));
  }

  .col-date {
    width: 100px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .col-date.overdue-cell {
    color: var(--destructive);
    font-weight: 500;
  }

  .col-payee {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .col-category {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cat-name {
    font-weight: 500;
  }

  .cat-master {
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }

  .col-account {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted-foreground);
    font-size: 0.75rem;
  }

  .col-freq {
    width: 90px;
  }

  .freq-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    background: var(--muted);
    border-radius: 4px;
    font-size: 0.7rem;
    color: var(--muted-foreground);
  }

  .col-outflow, .col-inflow {
    width: 85px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .amount {
    font-weight: 500;
  }

  .amount.negative {
    color: var(--destructive);
  }

  .amount.positive {
    color: var(--success);
  }

  .col-actions {
    width: 70px;
    text-align: center;
  }

  .action-buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--accent);
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .action-btn.primary {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .action-btn.primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .panel-footer {
    padding: 0.5rem 1rem;
    background: var(--muted);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .summary {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .summary-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .summary-item.overdue {
    color: var(--destructive);
  }

  .summary-item strong {
    color: var(--foreground);
  }

  .summary-item.overdue strong {
    color: var(--destructive);
  }
</style>
