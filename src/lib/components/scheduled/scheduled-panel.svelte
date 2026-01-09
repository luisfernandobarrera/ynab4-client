<script lang="ts">
  import { ChevronDown, ChevronUp, Play, SkipForward, Trash2, Calendar, AlertCircle } from 'lucide-svelte';
  import { scheduledTransactions, payees, categories, accounts, transactions } from '$lib/stores/budget';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import {
    formatCurrency,
    getPayeeName as getPayeeNameUtil,
    getCategoryName as getCategoryNameUtil
  } from '$lib/utils';
  import { browser } from '$app/environment';
  import ScheduledContextMenu from './scheduled-context-menu.svelte';
  import ScheduledEditDialog from './scheduled-edit-dialog.svelte';

  interface Props {
    accountId?: string | null;
    showAccountColumn?: boolean;
  }

  let { accountId = null, showAccountColumn = true }: Props = $props();

  // Persist panel state
  let isExpanded = $state(browser ? localStorage.getItem('scheduledPanelExpanded') !== 'false' : true);
  let panelHeight = $state(browser ? parseInt(localStorage.getItem('scheduledPanelHeight') || '200') : 200);

  $effect(() => {
    if (browser) {
      localStorage.setItem('scheduledPanelExpanded', String(isExpanded));
    }
  });

  $effect(() => {
    if (browser) {
      localStorage.setItem('scheduledPanelHeight', String(panelHeight));
    }
  });

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
  const overdueTransactions = $derived(filteredScheduled.filter(t => t.dateNext <= today));
  const totalCount = $derived(filteredScheduled.length);
  const overdueCount = $derived(overdueTransactions.length);

  // Selection state - click based (single click = select, ctrl+click = add to selection)
  let selectedIds = $state<Set<string>>(new Set());
  let lastClickedId = $state<string | null>(null);

  function handleRowClick(tx: typeof filteredScheduled[number], e: MouseEvent) {
    const id = tx.entityId;

    if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      selectedIds = newSet;
    } else if (e.shiftKey && lastClickedId) {
      // Range selection
      const ids = filteredScheduled.map(t => t.entityId);
      const startIdx = ids.indexOf(lastClickedId);
      const endIdx = ids.indexOf(id);
      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      const newSet = new Set(selectedIds);
      for (let i = from; i <= to; i++) {
        newSet.add(ids[i]);
      }
      selectedIds = newSet;
    } else {
      // Single selection
      selectedIds = new Set([id]);
    }
    lastClickedId = id;
  }

  function clearSelection() {
    selectedIds = new Set();
    lastClickedId = null;
  }

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);

  function openContextMenu(tx: typeof filteredScheduled[number], clientX: number, clientY: number) {
    // If item is not in selection, select only it
    if (!selectedIds.has(tx.entityId)) {
      selectedIds = new Set([tx.entityId]);
      lastClickedId = tx.entityId;
    }

    contextMenuX = clientX;
    contextMenuY = clientY;
    contextMenuOpen = true;
  }

  function handleContextMenu(tx: typeof filteredScheduled[number], e: MouseEvent) {
    e.preventDefault();
    openContextMenu(tx, e.clientX, e.clientY);
  }

  function handleContextMenuClose() {
    contextMenuOpen = false;
  }

  // Long press for touch devices (mobile context menu)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressTx: typeof filteredScheduled[number] | null = null;
  const LONG_PRESS_DURATION = 500; // ms

  function handleTouchStart(tx: typeof filteredScheduled[number], e: TouchEvent) {
    longPressTx = tx;
    const touch = e.touches[0];
    longPressTimer = setTimeout(() => {
      if (longPressTx) {
        // Prevent default to avoid text selection
        e.preventDefault();
        openContextMenu(longPressTx, touch.clientX, touch.clientY);
        longPressTx = null;
      }
    }, LONG_PRESS_DURATION);
  }

  function handleTouchEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressTx = null;
  }

  function handleTouchMove() {
    // Cancel long press if finger moves
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressTx = null;
  }

  // Get selected transactions for context menu
  const selectedTransactions = $derived(
    filteredScheduled.filter(t => selectedIds.has(t.entityId))
  );

  // Helpers - using centralized utilities
  function getPayeeName(payeeId: string | null): string {
    return getPayeeNameUtil(payeeId, $payees);
  }

  function getCategoryName(categoryId: string | null): string {
    if (!categoryId) return '';
    const c = $categories.find(c => c.entityId === categoryId);
    if (!c) return '';
    // This component shows category with master category, which is unique behavior
    const mc = $categories.find(mc => mc.entityId === c.masterCategoryId);
    return mc ? `${c.name} · ${mc.name}` : c.name;
  }

  function getAccountName(accountIdVal: string): string {
    const a = $accounts.find(a => a.id === accountIdVal);
    return a?.name || '';
  }

  const frequencyLabels: Record<string, string> = {
    'Never': 'Una vez',
    'Once': 'Una vez',
    'Weekly': 'Semanal',
    'EveryOtherWeek': 'Quincenal',
    'Every2Weeks': 'Quincenal',
    'TwiceAMonth': '2x mes',
    'Every4Weeks': 'Cada 4 sem',
    'Monthly': 'Mensual',
    'EveryOtherMonth': 'Bimestral',
    'Every2Months': 'Bimestral',
    'Every3Months': 'Trimestral',
    'Every4Months': 'Cuatrim.',
    'TwiceAYear': 'Semestral',
    'Yearly': 'Anual',
    'EveryOtherYear': 'Bianual',
    'Every2Years': 'Bianual',
  };

  function isOverdue(dateNext: string): boolean {
    return dateNext <= today;
  }

  function isOneTime(frequency: string): boolean {
    return frequency === 'Never' || frequency === 'Once';
  }

  // Quick actions (shown on hover)
  async function handleEnter(tx: typeof filteredScheduled[number], e: MouseEvent) {
    e.stopPropagation();
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Activa el modo edición para ingresar transacciones' });
      return;
    }

    const newTxId = `${tx.entityId}_${tx.dateNext}_0`;

    if ($transactions.some(t => t.entityId === newTxId)) {
      addToast({ type: 'warning', message: 'Esta transacción ya fue ingresada' });
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
      dateEnteredFromSchedule: tx.dateNext,
    };

    addPendingChange({
      type: 'transaction',
      action: 'create',
      entityId: newTxId,
      entityName: getPayeeName(tx.payeeId),
      data: newTx,
    });

    if (isOneTime(tx.frequency)) {
      addPendingChange({
        type: 'scheduledTransaction',
        action: 'delete',
        entityId: tx.entityId,
        entityName: getPayeeName(tx.payeeId),
        data: { entityId: tx.entityId },
      });
    }

    addToast({ type: 'success', message: `Transacción ingresada: ${getPayeeName(tx.payeeId)}` });
    selectedIds.delete(tx.entityId);
    selectedIds = new Set(selectedIds);
  }

  async function handleSkip(tx: typeof filteredScheduled[number], e: MouseEvent) {
    e.stopPropagation();
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Activa el modo edición para saltar' });
      return;
    }

    if (isOneTime(tx.frequency)) {
      addToast({ type: 'warning', message: 'No puedes saltar una transacción de una sola vez' });
      return;
    }

    addToast({ type: 'info', message: `Saltar pendiente de implementar` });
  }

  // Edit dialog state
  let editDialogOpen = $state(false);
  let editingTransaction = $state<typeof filteredScheduled[number] | null>(null);

  // Double click to edit
  function handleDoubleClick(tx: typeof filteredScheduled[number]) {
    openEditDialog(tx);
  }

  // Open edit dialog
  function openEditDialog(tx: typeof filteredScheduled[number]) {
    editingTransaction = tx;
    editDialogOpen = true;
  }

  // Close edit dialog
  function handleEditDialogClose() {
    editDialogOpen = false;
    editingTransaction = null;
  }

  // Resizing
  let isResizing = $state(false);
  let startY = $state(0);
  let startHeight = $state(0);

  function startResize(e: MouseEvent) {
    isResizing = true;
    startY = e.clientY;
    startHeight = panelHeight;
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
  }

  function onResize(e: MouseEvent) {
    if (!isResizing) return;
    const delta = startY - e.clientY;
    panelHeight = Math.max(100, Math.min(500, startHeight + delta));
  }

  function stopResize() {
    isResizing = false;
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
  }

  // Click outside to clear selection
  function handlePanelClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.scheduled-table tbody tr')) return;
    clearSelection();
  }
</script>

<!-- Context Menu -->
<ScheduledContextMenu
  bind:open={contextMenuOpen}
  x={contextMenuX}
  y={contextMenuY}
  selectedTransactions={selectedTransactions}
  onClose={handleContextMenuClose}
  onEdit={openEditDialog}
/>

<!-- Edit Dialog -->
<ScheduledEditDialog
  bind:open={editDialogOpen}
  transaction={editingTransaction}
  onClose={handleEditDialogClose}
/>

{#if totalCount > 0}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="scheduled-panel" class:expanded={isExpanded} onclick={handlePanelClick}>
    <!-- Resize handle -->
    {#if isExpanded}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="resize-handle" onmousedown={startResize}></div>
    {/if}

    <!-- Header -->
    <button class="panel-header" onclick={() => isExpanded = !isExpanded}>
      <div class="header-left">
        {#if isExpanded}
          <ChevronDown class="h-4 w-4" />
        {:else}
          <ChevronUp class="h-4 w-4" />
        {/if}
        <Calendar class="h-4 w-4" />
        <span class="header-title">Transacciones Programadas</span>
        <span class="header-count">{totalCount}</span>
        {#if overdueCount > 0}
          <span class="header-overdue">
            <AlertCircle class="h-3 w-3" />
            {overdueCount} vencidas
          </span>
        {/if}
      </div>
      <div class="header-right">
        {#if selectedIds.size > 0}
          <span class="selection-badge">{selectedIds.size} seleccionadas</span>
        {/if}
        {#if !$isEditMode}
          <span class="readonly-badge">Solo lectura</span>
        {/if}
      </div>
    </button>

    <!-- Content -->
    {#if isExpanded}
      <div class="panel-content" style="height: {panelHeight}px">
        <!-- Table -->
        <div class="table-wrapper">
          <table class="scheduled-table">
            <thead>
              <tr>
                <th class="col-date">Fecha</th>
                {#if showAccountColumn && !accountId}
                  <th class="col-account">Cuenta</th>
                {/if}
                <th class="col-payee">Beneficiario</th>
                <th class="col-category">Categoría</th>
                <th class="col-frequency">Frecuencia</th>
                <th class="col-outflow">Cargo</th>
                <th class="col-inflow">Abono</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredScheduled as tx (tx.entityId)}
                {@const overdue = isOverdue(tx.dateNext)}
                {@const isSelected = selectedIds.has(tx.entityId)}
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <tr
                  class:overdue
                  class:selected={isSelected}
                  onclick={(e) => handleRowClick(tx, e)}
                  ondblclick={() => handleDoubleClick(tx)}
                  oncontextmenu={(e) => handleContextMenu(tx, e)}
                  ontouchstart={(e) => handleTouchStart(tx, e)}
                  ontouchend={handleTouchEnd}
                  ontouchmove={handleTouchMove}
                >
                  <td class="col-date" class:overdue-text={overdue}>
                    {formatDate(tx.dateNext)}
                    {#if overdue}
                      <AlertCircle class="h-3 w-3 overdue-icon" />
                    {/if}
                  </td>
                  {#if showAccountColumn && !accountId}
                    <td class="col-account">{getAccountName(tx.accountId)}</td>
                  {/if}
                  <td class="col-payee">{getPayeeName(tx.payeeId)}</td>
                  <td class="col-category">{getCategoryName(tx.categoryId)}</td>
                  <td class="col-frequency">
                    <span class="freq-badge">{frequencyLabels[tx.frequency] || tx.frequency}</span>
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
                  <!-- Hover actions -->
                  <td class="col-actions">
                    <div class="action-buttons">
                      <button
                        class="action-btn enter"
                        class:primary={overdue}
                        onclick={(e) => handleEnter(tx, e)}
                        disabled={!$isEditMode}
                        title="Ingresar ahora"
                      >
                        <Play class="h-3 w-3" />
                      </button>
                      {#if !isOneTime(tx.frequency)}
                        <button
                          class="action-btn skip"
                          onclick={(e) => handleSkip(tx, e)}
                          disabled={!$isEditMode}
                          title="Saltar"
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
      </div>
    {/if}
  </div>
{/if}

<style>
  .scheduled-panel {
    background: var(--card);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .resize-handle {
    height: 4px;
    background: transparent;
    cursor: ns-resize;
    transition: background 0.15s;
  }

  .resize-handle:hover {
    background: var(--primary);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--muted);
    border: none;
    cursor: pointer;
    width: 100%;
    text-align: left;
  }

  .panel-header:hover {
    background: color-mix(in srgb, var(--muted) 90%, var(--foreground) 10%);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--foreground);
  }

  .header-title {
    font-weight: 600;
    font-size: 0.8rem;
  }

  .header-count {
    background: var(--primary);
    color: var(--primary-foreground);
    padding: 0.125rem 0.5rem;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .header-overdue {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--destructive);
    color: white;
    padding: 0.125rem 0.5rem;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .selection-badge {
    font-size: 0.65rem;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 15%, transparent);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .readonly-badge {
    font-size: 0.65rem;
    color: var(--muted-foreground);
    background: var(--background);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .panel-content {
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .table-wrapper {
    flex: 1;
    overflow: auto;
  }

  .scheduled-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
  }

  .scheduled-table thead {
    position: sticky;
    top: 0;
    background: var(--muted);
    z-index: 1;
  }

  .scheduled-table th {
    padding: 0.375rem 0.5rem;
    text-align: left;
    font-weight: 600;
    font-size: 0.65rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.025em;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .scheduled-table td {
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .scheduled-table tbody tr {
    background: var(--background);
    transition: background 0.1s;
    cursor: pointer;
    user-select: none;
  }

  .scheduled-table tbody tr:hover {
    background: var(--accent);
  }

  .scheduled-table tbody tr.selected {
    background: color-mix(in srgb, var(--primary) 15%, var(--background));
  }

  .scheduled-table tbody tr.selected:hover {
    background: color-mix(in srgb, var(--primary) 20%, var(--background));
  }

  .scheduled-table tbody tr.overdue {
    background: color-mix(in srgb, var(--destructive) 8%, var(--background));
  }

  .scheduled-table tbody tr.overdue:hover {
    background: color-mix(in srgb, var(--destructive) 12%, var(--background));
  }

  .scheduled-table tbody tr.overdue.selected {
    background: color-mix(in srgb, var(--destructive) 15%, var(--background));
  }

  .col-date {
    width: 90px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .col-date.overdue-text {
    color: var(--destructive);
    font-weight: 500;
  }

  .overdue-icon {
    display: inline-block;
    vertical-align: middle;
    margin-left: 0.25rem;
    color: var(--destructive);
  }

  .col-account {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    color: var(--muted-foreground);
  }

  .col-frequency {
    width: 80px;
  }

  .freq-badge {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: var(--muted);
    border-radius: 4px;
    font-size: 0.65rem;
    color: var(--muted-foreground);
  }

  .col-outflow,
  .col-inflow {
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
    color: var(--success, #22c55e);
  }

  .col-actions {
    width: 60px;
    padding: 0 !important;
  }

  .action-buttons {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    justify-content: flex-end;
    padding-right: 0.5rem;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .scheduled-table tbody tr:hover .action-buttons {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    color: var(--muted-foreground);
    transition: all 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--muted);
    color: var(--foreground);
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .action-btn.enter.primary {
    background: var(--success, #22c55e);
    color: white;
    border-color: var(--success, #22c55e);
  }

  .action-btn.enter.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--success, #22c55e) 90%, black);
  }
</style>
