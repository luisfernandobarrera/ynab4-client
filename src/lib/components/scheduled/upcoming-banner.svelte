<script lang="ts">
  import { AlertTriangle, X, ChevronRight } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { scheduledTransactions, payees } from '$lib/stores/budget';
  import { cn, formatCurrency, formatDate } from '$lib/utils';

  interface Props {
    onViewAll?: () => void;
    onDismiss?: () => void;
  }

  let { onViewAll, onDismiss }: Props = $props();

  let dismissed = $state(false);

  // Get overdue and due-soon transactions
  const dueTransactions = $derived(() => {
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);
    const todayStr = today.toISOString().split('T')[0];
    const thresholdStr = threeDaysFromNow.toISOString().split('T')[0];

    return $scheduledTransactions
      .filter((t) => t.dateNext <= thresholdStr)
      .sort((a, b) => a.dateNext.localeCompare(b.dateNext))
      .slice(0, 3);
  });

  const overdueCount = $derived(
    $scheduledTransactions.filter((t) => {
      const today = new Date().toISOString().split('T')[0];
      return t.dateNext <= today;
    }).length
  );

  function handleDismiss() {
    dismissed = true;
    onDismiss?.();
  }
</script>

{#if !dismissed && dueTransactions().length > 0}
  <div
    class={cn(
      'relative border-l-4 rounded-r-lg p-4 mb-4',
      overdueCount > 0 ? 'bg-destructive/10 border-destructive' : 'bg-ynab-orange/10 border-ynab-orange'
    )}
  >
    <!-- Close button -->
    <button
      class="absolute top-2 right-2 p-1 rounded hover:bg-black/10"
      onclick={handleDismiss}
    >
      <X class="h-4 w-4" />
    </button>

    <!-- Header -->
    <div class="flex items-center gap-2 mb-2">
      <AlertTriangle class={cn('h-5 w-5', overdueCount > 0 ? 'text-destructive' : 'text-ynab-orange')} />
      <h4 class="font-semibold">
        {#if overdueCount > 0}
          {overdueCount} overdue transaction{overdueCount > 1 ? 's' : ''}
        {:else}
          Upcoming transactions
        {/if}
      </h4>
    </div>

    <!-- Transaction list -->
    <div class="space-y-2 text-sm">
      {#each dueTransactions() as tx (tx.entityId)}
        {@const payee = $payees.find((p) => p.id === tx.payeeId)}
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <span class="truncate">{payee?.name || 'Transaction'}</span>
            <span class="text-muted-foreground ml-2 tabular-nums">{formatDate(tx.dateNext)}</span>
          </div>
          <span class={cn('amount font-medium', tx.amount > 0 ? 'text-ynab-green' : 'text-ynab-red')}>
            {formatCurrency(Math.abs(tx.amount))}
          </span>
        </div>
      {/each}
    </div>

    <!-- View all link -->
    {#if onViewAll}
      <Button variant="link" class="mt-2 p-0 h-auto" onclick={onViewAll}>
        View all scheduled
        <ChevronRight class="ml-1 h-4 w-4" />
      </Button>
    {/if}
  </div>
{/if}

