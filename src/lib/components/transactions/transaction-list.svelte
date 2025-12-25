<script lang="ts">
  import { Plus, Filter, Search, MoreVertical, Settings2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import TransactionsTable from './transactions-table.svelte';
  import TransactionContextMenu from './transaction-context-menu.svelte';
  import { selectedAccountTransactions, selectedAccountId, accounts } from '$lib/stores/budget';
  import { isMobile, selectedTransactionIds, clearTransactionSelection, toggleTransactionSelection } from '$lib/stores/ui';
  import { cn, formatCurrency } from '$lib/utils';
  import { t } from '$lib/i18n';

  interface Props {
    onAddTransaction?: () => void;
    onEditTransaction?: (id: string) => void;
  }

  let { onAddTransaction, onEditTransaction }: Props = $props();

  let searchQuery = $state('');
  let showCleared = $state(true);
  let contextMenuOpen = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);

  const selectedAccount = $derived(
    $selectedAccountId ? $accounts.find((a) => a.id === $selectedAccountId) : null
  );

  // Transform transactions to the format expected by TransactionsTable
  const tableTransactions = $derived(
    $selectedAccountTransactions
      .filter((tx) => {
        // Filter by search
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesPayee = tx.payee?.toLowerCase().includes(query);
          const matchesCategory = tx.category?.toLowerCase().includes(query);
          const matchesMemo = tx.memo?.toLowerCase().includes(query);
          if (!matchesPayee && !matchesCategory && !matchesMemo) {
            return false;
          }
        }
        // Filter cleared
        if (!showCleared && tx.cleared === 'Cleared') {
          return false;
        }
        return true;
      })
      .map(tx => ({
        id: tx.id,
        date: tx.date,
        payee: tx.payee || '',
        category: tx.category || '',
        masterCategory: tx.masterCategory,
        memo: tx.memo,
        outflow: tx.amount < 0 ? Math.abs(tx.amount) : 0,
        inflow: tx.amount > 0 ? tx.amount : 0,
        amount: tx.amount,
        cleared: tx.cleared as 'Uncleared' | 'Cleared' | 'Reconciled',
        flagColor: tx.flagColor,
        accountId: tx.accountId,
        accountName: tx.accountName,
        isTransfer: tx.isTransfer,
        transferAccountName: tx.transferAccountName,
      }))
  );

  const hasSelection = $derived($selectedTransactionIds.size > 0);

  function handleTransactionClick(txId: string) {
    if (hasSelection) {
      toggleTransactionSelection(txId);
    } else {
      onEditTransaction?.(txId);
    }
  }

  function handleContextMenu(event: MouseEvent, txId: string) {
    event.preventDefault();
    
    if (!$selectedTransactionIds.has(txId)) {
      clearTransactionSelection();
      toggleTransactionSelection(txId);
    }
    
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuOpen = true;
  }

  function openBulkActionsMenu(event: MouseEvent) {
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    contextMenuX = rect.left;
    contextMenuY = rect.bottom + 4;
    contextMenuOpen = true;
  }
</script>

<div class="flex flex-col h-full bg-[var(--background)]">
  <!-- Header -->
  <div class="sticky top-0 z-10 bg-[var(--card)] border-b border-[var(--border)] p-4 space-y-4">
    <!-- Account info or All Accounts -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-heading font-semibold text-[var(--foreground)]">
          {selectedAccount?.name || $t('accounts.allAccounts')}
        </h2>
        {#if selectedAccount}
          <p class={cn('amount text-sm', selectedAccount.balance >= 0 ? 'text-[var(--success)]' : 'text-[var(--destructive)]')}>
            {$t('accounts.balance')}: {formatCurrency(selectedAccount.balance)}
          </p>
        {/if}
      </div>
      
      {#if !$isMobile}
        <Button onclick={onAddTransaction} class="bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)]">
          <Plus class="mr-2 h-4 w-4" />
          {$t('transactions.addTransaction')}
        </Button>
      {/if}
    </div>

    <!-- Search and filters -->
    <div class="flex items-center gap-2">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          type="search"
          placeholder={$t('common.search')}
          class="pl-10 bg-[var(--input)] border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
          bind:value={searchQuery}
        />
      </div>
      <Button variant="outline" size="icon" class="border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]">
        <Filter class="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" class="border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]">
        <Settings2 class="h-4 w-4" />
      </Button>
    </div>

    <!-- Selection bar -->
    {#if hasSelection}
      <div class="flex items-center justify-between rounded-lg bg-[var(--accent)] p-2">
        <span class="text-sm text-[var(--accent-foreground)]">
          {$selectedTransactionIds.size} {$t('common.selected')}
        </span>
        <div class="flex gap-2">
          <Button variant="ghost" size="sm" onclick={clearTransactionSelection}>
            {$t('common.cancel')}
          </Button>
          <Button variant="outline" size="sm" onclick={openBulkActionsMenu}>
            <MoreVertical class="mr-2 h-4 w-4" />
            {$t('common.actions')}
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Transaction list/table -->
  <div class="flex-1 overflow-y-auto">
    {#if tableTransactions.length === 0}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-[var(--muted-foreground)]">{$t('transactions.noTransactionsFound')}</p>
        {#if searchQuery}
          <Button variant="link" onclick={() => (searchQuery = '')}>
            {$t('common.clearSearch')}
          </Button>
        {/if}
      </div>
    {:else}
      <TransactionsTable
        transactions={tableTransactions}
        showAccount={!selectedAccount}
        showRunningBalance={!!selectedAccount}
        onTransactionClick={handleTransactionClick}
      />
    {/if}
  </div>

  <!-- Mobile FAB -->
  {#if $isMobile && onAddTransaction}
    <button
      class="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg hover:opacity-90 active:scale-95 transition-transform"
      onclick={onAddTransaction}
    >
      <Plus class="h-6 w-6" />
    </button>
  {/if}

  <!-- Context Menu -->
  <TransactionContextMenu
    bind:open={contextMenuOpen}
    x={contextMenuX}
    y={contextMenuY}
    onClose={() => (contextMenuOpen = false)}
  />
</div>
