<script lang="ts">
  import { Calendar, Clock, Flag, Play, SkipForward, Pencil, Trash2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { cn, formatCurrency, formatDate, formatDateLong } from '$lib/utils';
  import type { ScheduledTransaction } from '$lib/stores/budget';
  import { payees, categories, accounts } from '$lib/stores/budget';

  interface Props {
    transaction: ScheduledTransaction;
    onEnter?: () => void;
    onSkip?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
  }

  let { transaction, onEnter, onSkip, onEdit, onDelete }: Props = $props();

  const payee = $derived($payees.find((p) => p.entityId === transaction.payeeId));
  const category = $derived($categories.find((c) => c.entityId === transaction.categoryId));
  const account = $derived($accounts.find((a) => a.id === transaction.accountId));

  const isOverdue = $derived.by(() => {
    const today = new Date().toISOString().split('T')[0];
    return transaction.dateNext <= today;
  });

  const isDueSoon = $derived.by(() => {
    const today = new Date();
    const dueDate = new Date(transaction.dateNext);
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays > 0;
  });

  const frequencyLabel: Record<string, string> = {
    'Once': 'One time',
    'Weekly': 'Weekly',
    'Every2Weeks': 'Every 2 weeks',
    'TwiceAMonth': 'Twice a month',
    'Every4Weeks': 'Every 4 weeks',
    'Monthly': 'Monthly',
    'Every2Months': 'Every 2 months',
    'Every3Months': 'Quarterly',
    'Every4Months': 'Every 4 months',
    'TwiceAYear': 'Twice a year',
    'Yearly': 'Yearly',
  };

  const flagColors: Record<string, string> = {
    Red: 'bg-red-500',
    Orange: 'bg-orange-500',
    Yellow: 'bg-yellow-500',
    Green: 'bg-green-500',
    Blue: 'bg-blue-500',
    Purple: 'bg-purple-500',
  };
</script>

<div
  class={cn(
    'relative rounded-lg border p-4 transition-colors',
    isOverdue && 'border-destructive bg-destructive/5',
    isDueSoon && !isOverdue && 'border-ynab-orange bg-ynab-orange/5'
  )}
>
  <!-- Flag indicator -->
  {#if transaction.flag}
    <div class={cn('absolute left-0 top-0 h-full w-1 rounded-l-lg', flagColors[transaction.flag] || 'bg-gray-400')}></div>
  {/if}

  <!-- Header: Payee and Amount -->
  <div class="flex items-start justify-between gap-4">
    <div class="flex-1 min-w-0">
      <p class="font-medium truncate">
        {payee?.name || 'No Payee'}
      </p>
      <p class="text-sm text-muted-foreground truncate">
        {category?.name || 'No Category'}
      </p>
    </div>
    <span
      class={cn(
        'amount text-lg font-semibold whitespace-nowrap',
        transaction.amount > 0 ? 'text-ynab-green' : 'text-ynab-red'
      )}
    >
      {transaction.amount > 0 ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
    </span>
  </div>

  <!-- Meta row -->
  <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
    <!-- Next date -->
    <Badge variant={isOverdue ? 'destructive' : isDueSoon ? 'secondary' : 'outline'}>
      <Calendar class="mr-1 h-3 w-3" />
      {formatDateLong(transaction.dateNext)}
    </Badge>

    <!-- Frequency -->
    <Badge variant="outline">
      <Clock class="mr-1 h-3 w-3" />
      {frequencyLabel[transaction.frequency] || transaction.frequency}
    </Badge>

    <!-- Account -->
    {#if account}
      <span class="text-xs text-muted-foreground">
        {account.name}
      </span>
    {/if}
  </div>

  <!-- Memo -->
  {#if transaction.memo}
    <p class="mt-2 text-sm italic text-muted-foreground truncate">
      {transaction.memo}
    </p>
  {/if}

  <!-- Actions -->
  <div class="mt-4 flex gap-2">
    {#if onEnter}
      <Button variant={isOverdue ? 'default' : 'outline'} size="sm" onclick={onEnter}>
        <Play class="mr-1 h-4 w-4" />
        Enter Now
      </Button>
    {/if}
    {#if onSkip}
      <Button variant="outline" size="sm" onclick={onSkip}>
        <SkipForward class="mr-1 h-4 w-4" />
        Skip
      </Button>
    {/if}
    {#if onEdit}
      <Button variant="ghost" size="sm" onclick={onEdit}>
        <Pencil class="h-4 w-4" />
      </Button>
    {/if}
    {#if onDelete}
      <Button variant="ghost" size="sm" onclick={onDelete}>
        <Trash2 class="h-4 w-4 text-destructive" />
      </Button>
    {/if}
  </div>
</div>

