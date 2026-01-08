<script lang="ts">
  import {
    Play,
    SkipForward,
    Trash2,
    Edit3,
    ArrowRightLeft,
  } from 'lucide-svelte';
  import {
    ContextMenu,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
  } from '$lib/components/ui/context-menu';
  import { accounts, transactions, payees, budgetInfo } from '$lib/stores/budget';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';

  interface ScheduledTx {
    entityId: string;
    date: string;
    dateNext: string;
    frequency: string;
    amount: number;
    payeeId: string | null;
    categoryId: string | null;
    accountId: string;
    memo: string;
    flag: string | null;
  }

  interface Props {
    open?: boolean;
    x?: number;
    y?: number;
    selectedTransactions?: ScheduledTx[];
    onClose?: () => void;
    onEdit?: (tx: ScheduledTx) => void;
  }

  let {
    open = $bindable(false),
    x = 0,
    y = 0,
    selectedTransactions = [],
    onClose,
    onEdit
  }: Props = $props();

  const selectionCount = $derived(selectedTransactions.length);
  const singleSelection = $derived(selectionCount === 1 ? selectedTransactions[0] : null);
  const hasRecurring = $derived(selectedTransactions.some(t => t.frequency !== 'Never' && t.frequency !== 'Once'));
  const allOneTime = $derived(selectedTransactions.every(t => t.frequency === 'Never' || t.frequency === 'Once'));

  function getPayeeName(payeeId: string | null): string {
    if (!payeeId) return 'Sin Beneficiario';
    const p = $payees.find(p => p.entityId === payeeId);
    return p?.name || 'Sin Beneficiario';
  }

  function isOneTime(frequency: string): boolean {
    return frequency === 'Never' || frequency === 'Once';
  }

  function closeMenu() {
    open = false;
    onClose?.();
  }

  // Enter transaction(s) into register
  function handleEnter() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Activa el modo edición para ingresar transacciones' });
      closeMenu();
      return;
    }

    let entered = 0;
    for (const tx of selectedTransactions) {
      const newTxId = `${tx.entityId}_${tx.dateNext}_0`;

      if ($transactions.some(t => t.entityId === newTxId)) {
        continue; // Already entered
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

      // If one-time, delete the scheduled
      if (isOneTime(tx.frequency)) {
        addPendingChange({
          type: 'scheduledTransaction',
          action: 'delete',
          entityId: tx.entityId,
          entityName: getPayeeName(tx.payeeId),
          data: { entityId: tx.entityId },
        });
      }

      entered++;
    }

    if (entered > 0) {
      addToast({
        type: 'success',
        message: entered === 1
          ? `Transacción ingresada: ${getPayeeName(selectedTransactions[0].payeeId)}`
          : `${entered} transacciones ingresadas`
      });
    }

    closeMenu();
  }

  // Skip to next occurrence
  function handleSkip() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Activa el modo edición para saltar transacciones' });
      closeMenu();
      return;
    }

    const recurring = selectedTransactions.filter(t => !isOneTime(t.frequency));
    if (recurring.length === 0) {
      addToast({ type: 'warning', message: 'No puedes saltar transacciones de una sola vez' });
      closeMenu();
      return;
    }

    // TODO: Calculate next date using RecurrenceCalculator
    addToast({
      type: 'info',
      message: `Saltar pendiente de implementar (${recurring.length} transacciones)`
    });

    closeMenu();
  }

  // Delete scheduled transaction(s)
  function handleDelete() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Activa el modo edición para eliminar' });
      closeMenu();
      return;
    }

    for (const tx of selectedTransactions) {
      addPendingChange({
        type: 'scheduledTransaction',
        action: 'delete',
        entityId: tx.entityId,
        entityName: getPayeeName(tx.payeeId),
        data: { entityId: tx.entityId },
      });
    }

    addToast({
      type: 'success',
      message: selectionCount === 1
        ? `Programada eliminada: ${getPayeeName(selectedTransactions[0].payeeId)}`
        : `${selectionCount} programadas eliminadas`
    });

    closeMenu();
  }

  // Move to another account
  function handleMoveToAccount(targetAccountId: string, targetAccountName: string) {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Activa el modo edición para mover' });
      closeMenu();
      return;
    }

    for (const tx of selectedTransactions) {
      addPendingChange({
        type: 'scheduledTransaction',
        action: 'update',
        entityId: tx.entityId,
        entityName: getPayeeName(tx.payeeId),
        data: {
          entityId: tx.entityId,
          accountId: targetAccountId
        },
      });
    }

    addToast({
      type: 'success',
      message: selectionCount === 1
        ? `Movida a ${targetAccountName}`
        : `${selectionCount} movidas a ${targetAccountName}`
    });

    closeMenu();
  }

  // Edit single transaction
  function handleEdit() {
    if (singleSelection && onEdit) {
      onEdit(singleSelection);
    }
    closeMenu();
  }

  // Get accounts for move submenu (excluding current)
  const moveTargetAccounts = $derived(
    singleSelection
      ? $accounts.filter(a => a.id !== singleSelection.accountId && !a.hidden)
      : $accounts.filter(a => !a.hidden)
  );
</script>

<ContextMenu bind:open {x} {y} {onClose}>
  <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
    {selectionCount} {selectionCount === 1 ? 'programada' : 'programadas'}
  </div>

  <ContextMenuSeparator />

  <!-- Enter in register -->
  <ContextMenuItem onclick={handleEnter} disabled={!$isEditMode}>
    <Play class="mr-2 h-4 w-4" />
    Ingresar ahora
  </ContextMenuItem>

  <!-- Skip (only for recurring) -->
  {#if hasRecurring}
    <ContextMenuItem onclick={handleSkip} disabled={!$isEditMode || allOneTime}>
      <SkipForward class="mr-2 h-4 w-4" />
      Saltar pago
    </ContextMenuItem>
  {/if}

  <ContextMenuSeparator />

  <!-- Move to account -->
  <ContextMenuSub label="Mover a cuenta">
    {#each moveTargetAccounts as account}
      <ContextMenuItem onclick={() => handleMoveToAccount(account.id, account.name)} disabled={!$isEditMode}>
        <ArrowRightLeft class="mr-2 h-4 w-4" />
        {account.name}
      </ContextMenuItem>
    {/each}
  </ContextMenuSub>

  <!-- Edit (only for single selection) -->
  {#if singleSelection}
    <ContextMenuItem onclick={handleEdit}>
      <Edit3 class="mr-2 h-4 w-4" />
      Editar
    </ContextMenuItem>
  {/if}

  <ContextMenuSeparator />

  <!-- Delete -->
  <ContextMenuItem destructive onclick={handleDelete} disabled={!$isEditMode}>
    <Trash2 class="mr-2 h-4 w-4" />
    Eliminar
  </ContextMenuItem>
</ContextMenu>
