<script lang="ts">
  import {
    Check,
    CheckCheck,
    Flag,
    Tag,
    Trash2,
    Copy,
    ArrowRight,
    CalendarClock,
  } from 'lucide-svelte';
  import {
    ContextMenu,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
  } from '$lib/components/ui/context-menu';
  import { selectedTransactionIds, clearTransactionSelection, addToast, isEditMode, addPendingChange } from '$lib/stores/ui';
  import { categories, payees, transactions } from '$lib/stores/budget';
  import { t } from '$lib/i18n';

  interface TransactionInfo {
    entityId: string;
    date: string;
    amount: number;
    payeeId?: string | null;
    categoryId?: string | null;
    accountId: string;
    memo?: string;
    flag?: string | null;
  }

  interface Props {
    open?: boolean;
    x?: number;
    y?: number;
    selectedTransactions?: TransactionInfo[];
    onClose?: () => void;
  }

  let { open = $bindable(false), x = 0, y = 0, selectedTransactions = [], onClose }: Props = $props();

  const selectionCount = $derived(selectedTransactions.length || $selectedTransactionIds.size);

  // Check if any selected transaction has a future date
  const today = new Date().toISOString().split('T')[0];
  const hasFutureDate = $derived(
    selectedTransactions.some(tx => tx.date > today)
  );
  const allFutureDates = $derived(
    selectedTransactions.length > 0 && selectedTransactions.every(tx => tx.date > today)
  );

  const flagColors = [
    { name: 'Red', color: 'bg-red-500' },
    { name: 'Orange', color: 'bg-orange-500' },
    { name: 'Yellow', color: 'bg-yellow-500' },
    { name: 'Green', color: 'bg-green-500' },
    { name: 'Blue', color: 'bg-blue-500' },
    { name: 'Purple', color: 'bg-purple-500' },
  ];

  function handleAction(action: string) {
    console.log(`Action: ${action} on ${selectionCount} transactions`);
    addToast({
      type: 'info',
      message: `${action}: ${selectionCount} transaction(s)`,
    });
    clearTransactionSelection();
    open = false;
    onClose?.();
  }

  function markCleared() {
    handleAction('Mark Cleared');
  }

  function markReconciled() {
    handleAction('Mark Reconciled');
  }

  function markUncleared() {
    handleAction('Mark Uncleared');
  }

  function setFlag(flagName: string) {
    handleAction(`Set Flag: ${flagName}`);
  }

  function clearFlag() {
    handleAction('Clear Flag');
  }

  function setCategory(categoryId: string, categoryName: string) {
    handleAction(`Set Category: ${categoryName}`);
  }

  function setPayee(payeeId: string, payeeName: string) {
    handleAction(`Set Payee: ${payeeName}`);
  }

  function deleteTransactions() {
    handleAction('Delete');
  }

  function duplicateTransactions() {
    handleAction('Duplicate');
  }

  // Convert transaction(s) to scheduled
  function convertToScheduled() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      closeMenu();
      return;
    }

    const futureTransactions = selectedTransactions.filter(tx => tx.date > today);

    if (futureTransactions.length === 0) {
      addToast({ type: 'warning', message: $t('scheduled.dateCannotBePast') });
      closeMenu();
      return;
    }

    for (const tx of futureTransactions) {
      // Create scheduled transaction
      const scheduledTxId = `scheduled_${tx.entityId}_${Date.now()}`;

      addPendingChange({
        type: 'scheduledTransaction',
        action: 'create',
        entityId: scheduledTxId,
        entityName: getPayeeName(tx.payeeId),
        data: {
          entityId: scheduledTxId,
          dateNext: tx.date,
          date: tx.date,
          frequency: 'Once',
          amount: tx.amount,
          payeeId: tx.payeeId,
          categoryId: tx.categoryId,
          accountId: tx.accountId,
          memo: tx.memo || '',
          flag: tx.flag,
        },
      });

      // Delete original transaction
      addPendingChange({
        type: 'transaction',
        action: 'delete',
        entityId: tx.entityId,
        entityName: getPayeeName(tx.payeeId),
        data: { entityId: tx.entityId },
      });
    }

    addToast({
      type: 'success',
      message: futureTransactions.length === 1
        ? $t('scheduled.convertedToScheduled')
        : `${futureTransactions.length} ${$t('scheduled.convertedToScheduled').toLowerCase()}`
    });

    closeMenu();
  }

  function getPayeeName(payeeId: string | null | undefined): string {
    if (!payeeId) return 'Sin Beneficiario';
    const p = $payees.find(p => p.entityId === payeeId || p.id === payeeId);
    return p?.name || 'Sin Beneficiario';
  }

  function closeMenu() {
    clearTransactionSelection();
    open = false;
    onClose?.();
  }
</script>

<ContextMenu bind:open {x} {y} {onClose}>
  <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
    {selectionCount} selected
  </div>

  <ContextMenuSeparator />

  <!-- Cleared Status -->
  <ContextMenuItem onclick={markCleared}>
    <Check class="mr-2 h-4 w-4" />
    Mark Cleared
  </ContextMenuItem>
  <ContextMenuItem onclick={markReconciled}>
    <CheckCheck class="mr-2 h-4 w-4" />
    Mark Reconciled
  </ContextMenuItem>
  <ContextMenuItem onclick={markUncleared}>
    <Check class="mr-2 h-4 w-4 opacity-30" />
    Mark Uncleared
  </ContextMenuItem>

  <ContextMenuSeparator />

  <!-- Flag -->
  <ContextMenuSub label="Set Flag">
    {#each flagColors as flag}
      <ContextMenuItem onclick={() => setFlag(flag.name)}>
        <span class="mr-2 h-3 w-3 rounded-full {flag.color}"></span>
        {flag.name}
      </ContextMenuItem>
    {/each}
    <ContextMenuSeparator />
    <ContextMenuItem onclick={clearFlag}>
      <span class="mr-2 h-3 w-3 rounded-full bg-muted"></span>
      Clear Flag
    </ContextMenuItem>
  </ContextMenuSub>

  <!-- Category -->
  <ContextMenuSub label="Set Category">
    {#each $categories.slice(0, 10) as category}
      <ContextMenuItem onclick={() => setCategory(category.entityId, category.name)}>
        <Tag class="mr-2 h-4 w-4" />
        {category.name}
      </ContextMenuItem>
    {/each}
    {#if $categories.length > 10}
      <ContextMenuItem disabled>
        <span class="text-xs text-muted-foreground">+{$categories.length - 10} more...</span>
      </ContextMenuItem>
    {/if}
  </ContextMenuSub>

  <!-- Payee -->
  <ContextMenuSub label="Set Payee">
    {#each $payees.slice(0, 10) as payee}
      <ContextMenuItem onclick={() => setPayee(payee.id, payee.name)}>
        <ArrowRight class="mr-2 h-4 w-4" />
        {payee.name}
      </ContextMenuItem>
    {/each}
    {#if $payees.length > 10}
      <ContextMenuItem disabled>
        <span class="text-xs text-muted-foreground">+{$payees.length - 10} more...</span>
      </ContextMenuItem>
    {/if}
  </ContextMenuSub>

  <ContextMenuSeparator />

  <!-- Other Actions -->
  <ContextMenuItem onclick={duplicateTransactions}>
    <Copy class="mr-2 h-4 w-4" />
    Duplicate
  </ContextMenuItem>

  <!-- Convert to Scheduled (only for future-dated transactions) -->
  {#if hasFutureDate}
    <ContextMenuSeparator />
    <ContextMenuItem onclick={convertToScheduled} disabled={!$isEditMode}>
      <CalendarClock class="mr-2 h-4 w-4" />
      {$t('scheduled.convertToScheduled')}
    </ContextMenuItem>
  {/if}

  <ContextMenuSeparator />

  <ContextMenuItem destructive onclick={deleteTransactions}>
    <Trash2 class="mr-2 h-4 w-4" />
    Delete
  </ContextMenuItem>
</ContextMenu>

