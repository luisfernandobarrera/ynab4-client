<script lang="ts">
  import { Plus, Filter, Search, MoreVertical } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import TransactionCard from './transaction-card.svelte';
  import { selectedAccountTransactions, selectedAccountId, accounts } from '$lib/stores/budget';
  import { isMobile, selectedTransactionIds, clearTransactionSelection } from '$lib/stores/ui';
  import { cn, formatCurrency } from '$lib/utils';

  interface Props {
    onAddTransaction?: () => void;
    onEditTransaction?: (id: string) => void;
  }

  let { onAddTransaction, onEditTransaction }: Props = $props();

  let searchQuery = $state('');
  let showCleared = $state(true);

  const selectedAccount = $derived(
    $selectedAccountId ? $accounts.find((a) => a.id === $selectedAccountId) : null
  );

  const filteredTransactions = $derived(
    $selectedAccountTransactions.filter((tx) => {
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
  );

  const hasSelection = $derived($selectedTransactionIds.size > 0);

  function handleTransactionClick(txId: string) {
    if (hasSelection) {
      // In selection mode, toggle selection
      import('$lib/stores/ui').then(({ toggleTransactionSelection }) => {
        toggleTransactionSelection(txId);
      });
    } else {
      // Normal mode, edit transaction
      onEditTransaction?.(txId);
    }
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="sticky top-0 z-10 bg-background border-b p-4 space-y-4">
    <!-- Account info or All Accounts -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-heading font-semibold">
          {selectedAccount?.name || 'All Accounts'}
        </h2>
        {#if selectedAccount}
          <p class={cn('amount text-sm', selectedAccount.balance >= 0 ? 'text-ynab-green' : 'text-ynab-red')}>
            Balance: {formatCurrency(selectedAccount.balance)}
          </p>
        {/if}
      </div>
      
      {#if !$isMobile}
        <Button onclick={onAddTransaction}>
          <Plus class="mr-2 h-4 w-4" />
          Add Transaction
        </Button>
      {/if}
    </div>

    <!-- Search and filters -->
    <div class="flex items-center gap-2">
      <div class="relative flex-1">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search transactions..."
          class="pl-10"
          bind:value={searchQuery}
        />
      </div>
      <Button variant="outline" size="icon">
        <Filter class="h-4 w-4" />
      </Button>
    </div>

    <!-- Selection bar -->
    {#if hasSelection}
      <div class="flex items-center justify-between rounded-lg bg-accent p-2">
        <span class="text-sm">
          {$selectedTransactionIds.size} selected
        </span>
        <div class="flex gap-2">
          <Button variant="ghost" size="sm" onclick={clearTransactionSelection}>
            Cancel
          </Button>
          <Button variant="outline" size="sm">
            <MoreVertical class="mr-2 h-4 w-4" />
            Actions
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Transaction list -->
  <div class="flex-1 overflow-y-auto p-4">
    {#if filteredTransactions.length === 0}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground">No transactions found</p>
        {#if searchQuery}
          <Button variant="link" onclick={() => (searchQuery = '')}>
            Clear search
          </Button>
        {/if}
      </div>
    {:else}
      <div class="space-y-2">
        {#each filteredTransactions as tx (tx.id)}
          <TransactionCard
            transaction={tx}
            onClick={() => handleTransactionClick(tx.id)}
          />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Mobile FAB -->
  {#if $isMobile && onAddTransaction}
    <button
      class="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-transform"
      onclick={onAddTransaction}
    >
      <Plus class="h-6 w-6" />
    </button>
  {/if}
</div>

