<script lang="ts">
  import { Check, Flag, ArrowRightLeft } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { cn, formatCurrency, formatDate } from '$lib/utils';
  import type { Transaction } from '$lib/stores/budget';
  import { selectedTransactionIds, toggleTransactionSelection } from '$lib/stores/ui';

  interface Props {
    transaction: Transaction;
    onClick?: () => void;
  }

  let { transaction, onClick }: Props = $props();

  const isSelected = $derived($selectedTransactionIds.has(transaction.id));
  const isTransfer = $derived(!!transaction.transferAccountId);
  const amount = $derived(transaction.amount);
  const isInflow = $derived(amount > 0);

  const flagColors: Record<string, string> = {
    Red: 'bg-red-500',
    Orange: 'bg-orange-500',
    Yellow: 'bg-yellow-500',
    Green: 'bg-green-500',
    Blue: 'bg-blue-500',
    Purple: 'bg-purple-500',
  };
</script>

<button
  class={cn(
    'relative flex w-full flex-col gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent/50',
    isSelected && 'bg-accent',
    transaction.cleared === 'Reconciled' && 'opacity-75'
  )}
  onclick={onClick}
  oncontextmenu={(e) => {
    e.preventDefault();
    toggleTransactionSelection(transaction.id);
  }}
>
  <!-- Flag indicator -->
  {#if transaction.flag}
    <div class={cn('absolute left-0 top-0 h-full w-1 rounded-l-lg', flagColors[transaction.flag] || 'bg-gray-400')} />
  {/if}

  <!-- Top row: Payee and Amount -->
  <div class="flex items-start justify-between gap-4">
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        {#if isTransfer}
          <ArrowRightLeft class="h-4 w-4 text-muted-foreground shrink-0" />
        {/if}
        <span class="font-medium truncate">
          {transaction.payee || 'No Payee'}
        </span>
      </div>
    </div>
    <span
      class={cn(
        'amount text-lg font-semibold whitespace-nowrap',
        isInflow ? 'text-ynab-green' : 'text-ynab-red'
      )}
    >
      {isInflow ? '+' : '-'}{formatCurrency(Math.abs(amount))}
    </span>
  </div>

  <!-- Middle row: Category and Date -->
  <div class="flex items-center justify-between gap-4 text-sm text-muted-foreground">
    <span class="truncate flex-1">
      {transaction.category || 'No Category'}
    </span>
    <span class="whitespace-nowrap">{formatDate(transaction.date)}</span>
  </div>

  <!-- Bottom row: Account, Cleared, and Memo -->
  <div class="flex items-center gap-2 text-xs text-muted-foreground">
    <Badge variant="outline" class="shrink-0">
      {transaction.accountName}
    </Badge>
    
    {#if transaction.cleared === 'Cleared'}
      <Badge variant="secondary" class="shrink-0">
        <Check class="h-3 w-3 mr-1" />
        Cleared
      </Badge>
    {:else if transaction.cleared === 'Reconciled'}
      <Badge variant="default" class="shrink-0">
        <Check class="h-3 w-3 mr-1" />
        Reconciled
      </Badge>
    {/if}

    {#if transaction.memo}
      <span class="truncate italic">
        {transaction.memo}
      </span>
    {/if}
  </div>
</button>

