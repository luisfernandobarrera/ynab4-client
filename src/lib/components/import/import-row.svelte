<script lang="ts">
  import { Check, X, Flag, MoreVertical, Banknote } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { cn, formatCurrency, formatDate } from '$lib/utils';
  import type { ImportTransaction } from '$lib/services/import-service';
  import { payees, categories } from '$lib/stores/budget';

  interface Props {
    transaction: ImportTransaction;
    selected?: boolean;
    onUpdate: (updates: Partial<ImportTransaction>) => void;
    onSelect?: () => void;
    onMSI?: () => void;
  }

  let { transaction, selected = false, onUpdate, onSelect, onMSI }: Props = $props();

  let editingPayee = $state(false);
  let payeeSearch = $state('');
  
  // Initialize payeeSearch when transaction changes
  $effect(() => {
    payeeSearch = transaction.payeeName || transaction.description;
  });

  const filteredPayees = $derived(
    $payees
      .filter((p) => p.name.toLowerCase().includes(payeeSearch.toLowerCase()))
      .slice(0, 5)
  );

  function selectPayee(payee: { id: string; name: string }) {
    onUpdate({
      payeeId: payee.id,
      payeeName: payee.name,
      status: transaction.categoryId ? 'ready' : 'pending',
    });
    editingPayee = false;
  }

  function selectCategory(category: { entityId: string; name: string }) {
    onUpdate({
      categoryId: category.entityId,
      categoryName: category.name,
      status: transaction.payeeName ? 'ready' : 'pending',
    });
  }

  function toggleStatus() {
    if (transaction.status === 'skipped') {
      onUpdate({ status: 'pending' });
    } else {
      onUpdate({ status: 'skipped' });
    }
  }

  const statusBadge = $derived(() => {
    switch (transaction.status) {
      case 'ready':
        return { variant: 'default' as const, text: 'Ready' };
      case 'imported':
        return { variant: 'secondary' as const, text: 'Imported' };
      case 'skipped':
        return { variant: 'outline' as const, text: 'Skipped' };
      default:
        return { variant: 'destructive' as const, text: 'Pending' };
    }
  });

  const flagColors = [
    { name: 'Red', color: 'bg-red-500' },
    { name: 'Orange', color: 'bg-orange-500' },
    { name: 'Yellow', color: 'bg-yellow-500' },
    { name: 'Green', color: 'bg-green-500' },
    { name: 'Blue', color: 'bg-blue-500' },
    { name: 'Purple', color: 'bg-purple-500' },
  ];
</script>

<div
  class={cn(
    'grid grid-cols-12 gap-2 items-center p-3 border-b hover:bg-accent/30 transition-colors',
    selected && 'bg-accent',
    transaction.status === 'skipped' && 'opacity-50'
  )}
  role="row"
>
  <!-- Checkbox -->
  <div class="col-span-1">
    <input
      type="checkbox"
      checked={selected}
      onchange={onSelect}
      class="h-4 w-4 rounded border-input"
    />
  </div>

  <!-- Date -->
  <div class="col-span-2 text-sm">
    {formatDate(transaction.date)}
  </div>

  <!-- Payee -->
  <div class="col-span-3 relative">
    {#if editingPayee}
      <div class="relative">
        <Input
          type="text"
          bind:value={payeeSearch}
          placeholder="Search payee..."
          class="h-8 text-sm"
          autofocus
          onblur={() => setTimeout(() => (editingPayee = false), 200)}
        />
        {#if filteredPayees.length > 0}
          <div class="absolute top-full left-0 right-0 z-10 mt-1 bg-popover border rounded-md shadow-md">
            {#each filteredPayees as payee (payee.id)}
              <button
                class="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onmousedown={() => selectPayee(payee)}
              >
                {payee.name}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <button
        class="text-left text-sm truncate w-full hover:underline"
        onclick={() => (editingPayee = true)}
      >
        {transaction.payeeName || transaction.description || 'Click to set payee'}
      </button>
    {/if}
    {#if transaction.description && transaction.payeeName !== transaction.description}
      <p class="text-xs text-muted-foreground truncate">{transaction.description}</p>
    {/if}
  </div>

  <!-- Category -->
  <div class="col-span-2">
    <select
      class="w-full h-8 text-sm rounded border border-input bg-background px-2"
      value={transaction.categoryId || ''}
      onchange={(e) => {
        const cat = $categories.find((c) => c.entityId === e.currentTarget.value);
        if (cat) selectCategory(cat);
      }}
    >
      <option value="">Select category</option>
      {#each $categories as cat (cat.entityId)}
        <option value={cat.entityId}>{cat.name}</option>
      {/each}
    </select>
  </div>

  <!-- Amount -->
  <div class="col-span-2 text-right">
    <span
      class={cn(
        'amount font-medium',
        transaction.amount > 0 ? 'text-ynab-green' : 'text-ynab-red'
      )}
    >
      {formatCurrency(Math.abs(transaction.amount))}
    </span>
    {#if transaction.isMSI}
      <Badge variant="secondary" class="ml-1 text-xs">
        MSI {transaction.msiMonths}
      </Badge>
    {/if}
  </div>

  <!-- Status & Actions -->
  <div class="col-span-2 flex items-center justify-end gap-1">
    <Badge variant={statusBadge().variant}>{statusBadge().text}</Badge>
    
    <Button variant="ghost" size="icon" class="h-8 w-8" onclick={onMSI} title="Convert to MSI">
      <Banknote class="h-4 w-4" />
    </Button>
    
    <Button
      variant="ghost"
      size="icon"
      class="h-8 w-8"
      onclick={toggleStatus}
      title={transaction.status === 'skipped' ? 'Include' : 'Skip'}
    >
      {#if transaction.status === 'skipped'}
        <Check class="h-4 w-4" />
      {:else}
        <X class="h-4 w-4" />
      {/if}
    </Button>
  </div>
</div>

