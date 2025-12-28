<script lang="ts">
  import { Check, X, Flag, Banknote, ChevronDown, ChevronRight } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { cn, formatCurrency, formatDate } from '$lib/utils';
  import type { ImportTransaction } from '$lib/services/import-service';
  import { payees, categories } from '$lib/stores/budget';

  interface Props {
    transaction: ImportTransaction;
    selected?: boolean;
    expanded?: boolean;
    showOriginalMemo?: boolean;
    showReference?: boolean;
    onUpdate: (updates: Partial<ImportTransaction>) => void;
    onSelect?: () => void;
    onMSI?: () => void;
    onToggleExpand?: () => void;
  }

  let { 
    transaction, 
    selected = false, 
    expanded = false, 
    showOriginalMemo = false,
    showReference = false,
    onUpdate, 
    onSelect, 
    onMSI, 
    onToggleExpand 
  }: Props = $props();

  let editingPayee = $state(false);
  let editingMemo = $state(false);
  let payeeSearch = $state('');
  let memoValue = $state('');
  
  // Initialize values when transaction changes
  $effect(() => {
    payeeSearch = transaction.payeeName || transaction.suggestedPayee || transaction.description;
    memoValue = transaction.memo || '';
  });

  const filteredPayees = $derived(
    $payees
      .filter((p) => !p.isTombstone && p.name.toLowerCase().includes(payeeSearch.toLowerCase()))
      .slice(0, 8)
  );

  const filteredCategories = $derived(
    $categories.filter((c) => !c.isTombstone)
  );

  function selectPayee(payee: { id: string; name: string }) {
    onUpdate({
      payeeId: payee.id,
      payeeName: payee.name,
      status: transaction.categoryId ? 'ready' : 'pending',
    });
    editingPayee = false;
  }

  function setCustomPayee() {
    if (payeeSearch.trim()) {
      onUpdate({
        payeeId: null,
        payeeName: payeeSearch.trim(),
        status: transaction.categoryId ? 'ready' : 'pending',
      });
    }
    editingPayee = false;
  }

  function selectCategory(category: { entityId: string; name: string }) {
    onUpdate({
      categoryId: category.entityId,
      categoryName: category.name,
      status: transaction.payeeName ? 'ready' : 'pending',
    });
  }

  function updateMemo() {
    onUpdate({ memo: memoValue });
    editingMemo = false;
  }

  function toggleStatus() {
    if (transaction.status === 'skipped') {
      onUpdate({ status: 'pending' });
    } else {
      onUpdate({ status: 'skipped' });
    }
  }

  function setFlag(color: string | null) {
    onUpdate({ flag: color });
  }

  const statusBadge = $derived(() => {
    switch (transaction.status) {
      case 'ready':
        return { variant: 'default' as const, text: 'Listo', class: 'bg-green-600' };
      case 'imported':
        return { variant: 'secondary' as const, text: 'Importado', class: '' };
      case 'skipped':
        return { variant: 'outline' as const, text: 'Omitir', class: '' };
      default:
        return { variant: 'destructive' as const, text: 'Pendiente', class: '' };
    }
  });

  const flagColors = [
    { name: 'Red', color: 'bg-red-500', value: 'Red' },
    { name: 'Orange', color: 'bg-orange-500', value: 'Orange' },
    { name: 'Yellow', color: 'bg-yellow-500', value: 'Yellow' },
    { name: 'Green', color: 'bg-green-500', value: 'Green' },
    { name: 'Blue', color: 'bg-blue-500', value: 'Blue' },
    { name: 'Purple', color: 'bg-purple-500', value: 'Purple' },
  ];

  const currentFlagColor = $derived(
    flagColors.find(f => f.value === transaction.flag)?.color || ''
  );
</script>

<!-- Main Row -->
<div
  class={cn(
    'border-b hover:bg-accent/30 transition-colors',
    selected && 'bg-accent/50',
    transaction.status === 'skipped' && 'opacity-50'
  )}
  role="row"
>
  <!-- Primary Row -->
  <div class="grid grid-cols-[auto,1fr,1fr,1fr,auto,auto,auto] gap-2 items-center p-2">
    <!-- Checkbox + Expand -->
    <div class="flex items-center gap-1">
      <input
        type="checkbox"
        checked={selected}
        onchange={onSelect}
        class="h-4 w-4 rounded border-input"
      />
      <Button variant="ghost" size="icon" class="h-6 w-6" onclick={onToggleExpand}>
        {#if expanded}
          <ChevronDown class="h-3 w-3" />
        {:else}
          <ChevronRight class="h-3 w-3" />
        {/if}
      </Button>
    </div>

    <!-- Date + Reference -->
    <div class="text-sm">
      <div class="font-medium font-mono tabular-nums">{formatDate(transaction.date)}</div>
      {#if showReference && transaction.reference}
        <div class="text-xs text-muted-foreground truncate">{transaction.reference}</div>
      {/if}
      {#if showOriginalMemo && transaction.originalMemo}
        <div class="text-xs text-muted-foreground truncate max-w-[150px]" title={transaction.originalMemo}>
          {transaction.originalMemo}
        </div>
      {/if}
    </div>

    <!-- Payee -->
    <div class="relative">
      {#if editingPayee}
        <div class="relative">
          <Input
            type="text"
            bind:value={payeeSearch}
            placeholder="Buscar payee..."
            class="h-8 text-sm"
            autofocus
            onblur={() => setTimeout(() => setCustomPayee(), 150)}
            onkeydown={(e) => e.key === 'Enter' && setCustomPayee()}
          />
          {#if filteredPayees.length > 0}
            <div class="absolute top-full left-0 right-0 z-20 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
              {#each filteredPayees as payee (payee.id)}
                <button
                  class="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center justify-between"
                  onmousedown={() => selectPayee(payee)}
                >
                  <span>{payee.name}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <button
          class="text-left text-sm w-full hover:underline truncate block"
          onclick={() => (editingPayee = true)}
        >
          {transaction.payeeName || transaction.suggestedPayee || 'Seleccionar payee...'}
        </button>
        {#if transaction.suggestedPayee && transaction.payeeName !== transaction.suggestedPayee}
          <p class="text-xs text-muted-foreground truncate" title="Sugerido: {transaction.suggestedPayee}">
            → {transaction.suggestedPayee}
          </p>
        {/if}
      {/if}
    </div>

    <!-- Category -->
    <div>
      <select
        class="w-full h-8 text-sm rounded border border-input bg-background px-2"
        value={transaction.categoryId || ''}
        onchange={(e) => {
          const cat = filteredCategories.find((c) => c.entityId === e.currentTarget.value);
          if (cat) selectCategory(cat);
        }}
      >
        <option value="">Seleccionar categoría</option>
        {#each filteredCategories as cat (cat.entityId)}
          <option value={cat.entityId}>{cat.name}</option>
        {/each}
      </select>
      {#if transaction.suggestedCategory && transaction.categoryName !== transaction.suggestedCategory}
        <p class="text-xs text-muted-foreground truncate">→ {transaction.suggestedCategory}</p>
      {/if}
    </div>

    <!-- Amount (Outflow / Inflow) -->
    <div class="text-right min-w-[120px]">
      {#if transaction.outflow > 0}
        <span class="text-ynab-red font-medium">-{formatCurrency(transaction.outflow)}</span>
      {:else if transaction.inflow > 0}
        <span class="text-ynab-green font-medium">+{formatCurrency(transaction.inflow)}</span>
      {:else}
        <span class={cn('font-medium', transaction.amount > 0 ? 'text-ynab-green' : 'text-ynab-red')}>
          {transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}
        </span>
      {/if}
      {#if transaction.isMSI}
        <Badge variant="secondary" class="ml-1 text-xs">MSI {transaction.msiMonths}</Badge>
      {/if}
    </div>

    <!-- Flag -->
    <div class="flex items-center gap-1">
      <div class="relative group">
        <button
          class={cn(
            'w-6 h-6 rounded flex items-center justify-center border',
            currentFlagColor || 'bg-muted'
          )}
          title="Bandera"
        >
          <Flag class="h-3 w-3" />
        </button>
        <div class="absolute right-0 top-full mt-1 bg-popover border rounded shadow-lg p-1 hidden group-hover:flex gap-1 z-10">
          <button
            class="w-5 h-5 rounded bg-muted border hover:border-foreground"
            onclick={() => setFlag(null)}
            title="Sin bandera"
          />
          {#each flagColors as flag}
            <button
              class={cn('w-5 h-5 rounded', flag.color, 'hover:ring-2 ring-offset-1')}
              onclick={() => setFlag(flag.value)}
              title={flag.name}
            />
          {/each}
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-1">
      <Badge variant={statusBadge().variant} class={cn('text-xs', statusBadge().class)}>
        {statusBadge().text}
      </Badge>
      
      {#if transaction.amount < 0 && !transaction.isMSI}
        <Button variant="ghost" size="icon" class="h-7 w-7" onclick={onMSI} title="Convertir a MSI">
          <Banknote class="h-4 w-4" />
        </Button>
      {/if}
      
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        onclick={toggleStatus}
        title={transaction.status === 'skipped' ? 'Incluir' : 'Omitir'}
      >
        {#if transaction.status === 'skipped'}
          <Check class="h-4 w-4" />
        {:else}
          <X class="h-4 w-4" />
        {/if}
      </Button>
    </div>
  </div>

  <!-- Expanded Details -->
  {#if expanded}
    <div class="px-4 pb-3 pt-1 bg-muted/30 border-t grid grid-cols-2 gap-4 text-sm">
      <!-- Left Column -->
      <div class="space-y-2">
        <div>
          <label class="text-xs text-muted-foreground block mb-1">Descripción Original</label>
          <div class="font-mono text-xs bg-background p-2 rounded border truncate" title={transaction.description}>
            {transaction.description || '—'}
          </div>
        </div>
        
        {#if transaction.originalMemo}
          <div>
            <label class="text-xs text-muted-foreground block mb-1">Memo Original (Banco)</label>
            <div class="font-mono text-xs bg-background p-2 rounded border truncate" title={transaction.originalMemo}>
              {transaction.originalMemo}
            </div>
          </div>
        {/if}
      </div>

      <!-- Right Column -->
      <div class="space-y-2">
        <div>
          <label class="text-xs text-muted-foreground block mb-1">Memo (Editable)</label>
          {#if editingMemo}
            <Input
              type="text"
              bind:value={memoValue}
              placeholder="Agregar nota..."
              class="h-8 text-sm"
              autofocus
              onblur={updateMemo}
              onkeydown={(e) => e.key === 'Enter' && updateMemo()}
            />
          {:else}
            <button
              class="w-full text-left text-sm bg-background p-2 rounded border hover:border-primary truncate"
              onclick={() => (editingMemo = true)}
            >
              {transaction.memo || 'Click para agregar memo...'}
            </button>
          {/if}
        </div>

        {#if transaction.reference}
          <div>
            <label class="text-xs text-muted-foreground block mb-1">Referencia</label>
            <div class="font-mono text-xs">{transaction.reference}</div>
          </div>
        {/if}

        {#if transaction.isMSI}
          <div class="flex gap-4">
            <div>
              <label class="text-xs text-muted-foreground block">Meses</label>
              <div class="font-bold">{transaction.msiMonths}</div>
            </div>
            <div>
              <label class="text-xs text-muted-foreground block">Monto Original</label>
              <div class="font-bold">{formatCurrency(Math.abs(transaction.msiOriginalAmount))}</div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
