<script lang="ts">
  import { Plus, Search, ChevronLeft, Lock, Circle, CheckCircle2 } from 'lucide-svelte';
  import { Input } from '$lib/components/ui/input';
  import { selectedAccountTransactions, selectedAccountId, accounts } from '$lib/stores/budget';
  import { isMobile } from '$lib/stores/ui';
  import { formatCurrency } from '$lib/utils';
  import { t } from '$lib/i18n';

  interface Props {
    onAddTransaction?: () => void;
    onEditTransaction?: (id: string) => void;
  }

  let { onAddTransaction, onEditTransaction }: Props = $props();

  let searchQuery = $state('');

  const selectedAccount = $derived(
    $selectedAccountId ? $accounts.find((a) => a.id === $selectedAccountId) : null
  );

  // Filter transactions
  const filteredTransactions = $derived(
    $selectedAccountTransactions.filter((tx) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        tx.payee?.toLowerCase().includes(query) ||
        tx.category?.toLowerCase().includes(query) ||
        tx.memo?.toLowerCase().includes(query)
      );
    })
  );

  // Group transactions by date
  const groupedTransactions = $derived(() => {
    const groups: Map<string, typeof filteredTransactions> = new Map();
    
    for (const tx of filteredTransactions) {
      const date = tx.date || 'No date';
      if (!groups.has(date)) {
        groups.set(date, []);
      }
      groups.get(date)!.push(tx);
    }
    
    // Sort groups by date descending
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  });

  function formatDate(dateStr: string): string {
    if (dateStr === 'No date') return dateStr;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  function formatAmount(amount: number): string {
    const formatted = Math.abs(amount).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return amount < 0 ? `-$${formatted}` : `+$${formatted}`;
  }

  function getStatusIcon(cleared: string) {
    switch (cleared) {
      case 'Reconciled':
      case 'Cleared':
        return { component: Lock, class: 'text-emerald-500' };
      default:
        return { component: Circle, class: 'text-gray-400' };
    }
  }
</script>

<div class="flex flex-col h-full bg-[var(--background)]">
  <!-- Header -->
  <header class="bg-[#1e3a5f] text-white">
    <!-- Account name -->
    <div class="flex items-center gap-3 px-4 py-3">
      <button class="p-1 -ml-1 hover:bg-white/10 rounded-lg transition-colors">
        <ChevronLeft class="h-6 w-6" />
      </button>
      <div class="flex items-center gap-2">
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <h1 class="text-lg font-semibold">
          {selectedAccount?.name || $t('accounts.allAccounts')}
        </h1>
      </div>
    </div>

    <!-- Balance summary -->
    <div class="grid grid-cols-3 text-center text-xs border-t border-white/20 py-2">
      <div>
        <div class="text-white/70 uppercase tracking-wide">From Nov</div>
        <div class="font-semibold text-cyan-300">
          {formatCurrency(selectedAccount?.balance || 0)}
        </div>
      </div>
      <div>
        <div class="text-white/70 uppercase tracking-wide">Funded in Dic</div>
        <div class="font-semibold">$0.00</div>
      </div>
      <div>
        <div class="text-white/70 uppercase tracking-wide">Spent in Dic</div>
        <div class="font-semibold">$0.00</div>
      </div>
    </div>

    <!-- Remaining banner -->
    <div class="flex items-center justify-between px-4 py-3 {(selectedAccount?.balance || 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500'}">
      <span class="text-sm font-semibold uppercase tracking-wide">Remaining:</span>
      <span class="text-2xl font-bold">
        {formatCurrency(selectedAccount?.balance || 0)}
      </span>
    </div>
  </header>

  <!-- Search (optional) -->
  {#if searchQuery || filteredTransactions.length > 20}
    <div class="px-4 py-2 border-b border-[var(--border)] bg-[var(--card)]">
      <div class="relative">
        <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          type="search"
          placeholder={$t('common.search')}
          class="pl-10 h-9 bg-[var(--background)] border-[var(--border)]"
          bind:value={searchQuery}
        />
      </div>
    </div>
  {/if}

  <!-- Transaction list -->
  <div class="flex-1 overflow-y-auto bg-[var(--background)]">
    {#if filteredTransactions.length === 0}
      <div class="flex flex-col items-center justify-center py-16 text-center px-4">
        <p class="text-[var(--muted-foreground)]">{$t('transactions.noTransactionsFound')}</p>
      </div>
    {:else}
      {#each groupedTransactions as [date, transactions]}
        <!-- Date header -->
        <div class="sticky top-0 z-10 px-4 py-2 bg-[var(--background)] border-b-2 border-cyan-500">
          <span class="text-sm font-medium text-cyan-600">{formatDate(date)}</span>
        </div>

        <!-- Transactions for this date -->
        {#each transactions as tx (tx.id)}
          {@const status = getStatusIcon(tx.cleared)}
          {@const isOutflow = tx.amount < 0}
          <button
            class="w-full flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--accent)] transition-colors text-left"
            onclick={() => onEditTransaction?.(tx.id)}
          >
            <!-- Status icon -->
            <div class="pt-0.5">
              <svelte:component this={status.component} class="h-4 w-4 {status.class}" />
            </div>

            <!-- Payee and category -->
            <div class="flex-1 min-w-0">
              <p class="font-medium text-[var(--foreground)] truncate">
                {#if tx.isTransfer && tx.transferAccountName}
                  {tx.transferAccountName}
                {:else}
                  {tx.payee || $t('payees.unknown')}
                {/if}
              </p>
              <p class="text-sm text-[var(--muted-foreground)] truncate">
                {#if tx.isTransfer}
                  Transfer
                {:else if tx.category}
                  {tx.category}
                  {#if tx.masterCategory}
                    <span class="opacity-60"> · {tx.masterCategory}</span>
                  {/if}
                {:else}
                  -
                {/if}
              </p>
            </div>

            <!-- Amount and account -->
            <div class="text-right shrink-0">
              <p class="font-semibold tabular-nums {isOutflow ? 'text-red-500' : 'text-emerald-500'}">
                {formatAmount(tx.amount)}
              </p>
              {#if tx.accountName && !selectedAccount}
                <p class="text-sm text-[var(--muted-foreground)]">{tx.accountName}</p>
              {/if}
            </div>
          </button>
        {/each}
      {/each}
    {/if}
  </div>

  <!-- FAB - Add Transaction -->
  {#if onAddTransaction}
    <button
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-6 py-3 rounded-full bg-cyan-500 text-white font-semibold shadow-lg hover:bg-cyan-600 active:scale-95 transition-all"
      onclick={onAddTransaction}
    >
      <Plus class="h-5 w-5" strokeWidth={2.5} />
      <span>Add Transaction</span>
    </button>
  {/if}
</div>
