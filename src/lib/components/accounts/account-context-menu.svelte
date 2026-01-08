<script lang="ts">
  import {
    FileText,
    Eye,
    EyeOff,
    Settings2,
    ArrowRightLeft,
    Trash2,
    CheckCircle2,
  } from 'lucide-svelte';
  import {
    ContextMenu,
    ContextMenuItem,
    ContextMenuSeparator,
  } from '$lib/components/ui/context-menu';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { selectedAccountId, currentView } from '$lib/stores/budget';
  import { t } from '$lib/i18n';

  interface AccountInfo {
    id: string;
    name: string;
    onBudget: boolean;
    closed: boolean;
    hidden: boolean;
    note?: string;
    balance: number;
    transactionCount: number;
  }

  interface Props {
    open?: boolean;
    x?: number;
    y?: number;
    account?: AccountInfo | null;
    onClose?: () => void;
    onShowDetails?: (account: AccountInfo) => void;
  }

  let {
    open = $bindable(false),
    x = 0,
    y = 0,
    account = null,
    onClose,
    onShowDetails,
  }: Props = $props();

  function closeMenu() {
    open = false;
    onClose?.();
  }

  // View transactions for this account
  function handleViewTransactions() {
    if (account) {
      selectedAccountId.set(account.id);
      currentView.set('transactions');
    }
    closeMenu();
  }

  // Reconcile this account
  function handleReconcile() {
    if (account) {
      selectedAccountId.set(account.id);
      currentView.set('reconciliation');
    }
    closeMenu();
  }

  // Toggle account visibility (hide/show)
  function handleToggleHidden() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      closeMenu();
      return;
    }

    if (account) {
      addPendingChange({
        type: 'account',
        action: 'update',
        entityId: account.id,
        entityName: account.name,
        data: {
          entityId: account.id,
          hidden: !account.hidden,
        },
      });

      addToast({
        type: 'success',
        message: account.hidden
          ? $t('accounts.shown', { name: account.name })
          : $t('accounts.hidden', { name: account.name }),
      });
    }
    closeMenu();
  }

  // Toggle account closed status
  function handleToggleClosed() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      closeMenu();
      return;
    }

    if (account) {
      addPendingChange({
        type: 'account',
        action: 'update',
        entityId: account.id,
        entityName: account.name,
        data: {
          entityId: account.id,
          closed: !account.closed,
        },
      });

      addToast({
        type: 'success',
        message: account.closed
          ? $t('accounts.reopened', { name: account.name })
          : $t('accounts.closed', { name: account.name }),
      });
    }
    closeMenu();
  }

  // Show account details/properties
  function handleShowDetails() {
    if (account && onShowDetails) {
      onShowDetails(account);
    }
    closeMenu();
  }

  // Delete account (only if no transactions)
  function handleDelete() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      closeMenu();
      return;
    }

    if (account) {
      if (account.transactionCount > 0) {
        addToast({
          type: 'error',
          message: $t('accounts.cannotDeleteWithTransactions'),
        });
        closeMenu();
        return;
      }

      addPendingChange({
        type: 'account',
        action: 'delete',
        entityId: account.id,
        entityName: account.name,
        data: { entityId: account.id },
      });

      addToast({
        type: 'success',
        message: $t('accounts.deleted', { name: account.name }),
      });
    }
    closeMenu();
  }

  // Computed: Can delete account?
  const canDelete = $derived(account !== null && account.transactionCount === 0);
</script>

<ContextMenu bind:open {x} {y} {onClose}>
  {#if account}
    <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground truncate max-w-[200px]">
      {account.name}
    </div>

    <ContextMenuSeparator />

    <!-- View Transactions -->
    <ContextMenuItem onclick={handleViewTransactions}>
      <ArrowRightLeft class="mr-2 h-4 w-4" />
      {$t('accounts.viewTransactions')}
    </ContextMenuItem>

    <!-- Reconcile -->
    <ContextMenuItem onclick={handleReconcile}>
      <CheckCircle2 class="mr-2 h-4 w-4" />
      {$t('accounts.reconcile')}
    </ContextMenuItem>

    <ContextMenuSeparator />

    <!-- Hide/Show -->
    <ContextMenuItem onclick={handleToggleHidden} disabled={!$isEditMode}>
      {#if account.hidden}
        <Eye class="mr-2 h-4 w-4" />
        {$t('accounts.show')}
      {:else}
        <EyeOff class="mr-2 h-4 w-4" />
        {$t('accounts.hide')}
      {/if}
    </ContextMenuItem>

    <!-- Close/Reopen -->
    <ContextMenuItem onclick={handleToggleClosed} disabled={!$isEditMode}>
      {#if account.closed}
        <Eye class="mr-2 h-4 w-4" />
        {$t('accounts.reopen')}
      {:else}
        <EyeOff class="mr-2 h-4 w-4" />
        {$t('accounts.close')}
      {/if}
    </ContextMenuItem>

    <ContextMenuSeparator />

    <!-- Properties/Details -->
    <ContextMenuItem onclick={handleShowDetails}>
      <Settings2 class="mr-2 h-4 w-4" />
      {$t('accounts.properties')}
    </ContextMenuItem>

    <!-- Note indicator if has note -->
    {#if account.note}
      <ContextMenuItem onclick={handleShowDetails}>
        <FileText class="mr-2 h-4 w-4" />
        {$t('accounts.viewNote')}
      </ContextMenuItem>
    {/if}

    <ContextMenuSeparator />

    <!-- Delete (only if no transactions) -->
    <ContextMenuItem
      destructive
      onclick={handleDelete}
      disabled={!$isEditMode || !canDelete}
    >
      <Trash2 class="mr-2 h-4 w-4" />
      {$t('common.delete')}
    </ContextMenuItem>
  {/if}
</ContextMenu>
