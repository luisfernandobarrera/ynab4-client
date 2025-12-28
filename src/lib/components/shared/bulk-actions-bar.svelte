<script lang="ts">
  import { Tag, User, Flag, X, Check, Trash2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { categories, payees } from '$lib/stores/budget';
  import { formatCurrency } from '$lib/utils';

  interface Props {
    selectedCount: number;
    totalInflow?: number;
    totalOutflow?: number;
    onAssignCategory?: (categoryId: string, categoryName: string) => void;
    onAssignPayee?: (payeeId: string | null, payeeName: string) => void;
    onAssignFlag?: (flag: string | null) => void;
    onMarkReady?: () => void;
    onMarkSkipped?: () => void;
    onDelete?: () => void;
    onClear: () => void;
    showImportActions?: boolean;
  }

  let {
    selectedCount,
    totalInflow = 0,
    totalOutflow = 0,
    onAssignCategory,
    onAssignPayee,
    onAssignFlag,
    onMarkReady,
    onMarkSkipped,
    onDelete,
    onClear,
    showImportActions = false
  }: Props = $props();

  let showCategoryPicker = $state(false);
  let showPayeePicker = $state(false);
  let showFlagPicker = $state(false);
  let categorySearch = $state('');
  let payeeSearch = $state('');

  const filteredCategories = $derived(
    $categories
      .filter(c => !c.isTombstone && c.name.toLowerCase().includes(categorySearch.toLowerCase()))
      .slice(0, 10)
  );

  const filteredPayees = $derived(
    $payees
      .filter(p => !p.isTombstone && p.name.toLowerCase().includes(payeeSearch.toLowerCase()))
      .slice(0, 10)
  );

  const flagColors = [
    { name: 'Rojo', value: 'Red', class: 'bg-red-500' },
    { name: 'Naranja', value: 'Orange', class: 'bg-orange-500' },
    { name: 'Amarillo', value: 'Yellow', class: 'bg-yellow-500' },
    { name: 'Verde', value: 'Green', class: 'bg-green-500' },
    { name: 'Azul', value: 'Blue', class: 'bg-blue-500' },
    { name: 'Morado', value: 'Purple', class: 'bg-purple-500' },
  ];

  function selectCategory(cat: { entityId: string; name: string }) {
    onAssignCategory?.(cat.entityId, cat.name);
    showCategoryPicker = false;
    categorySearch = '';
  }

  function selectPayee(payee: { id: string; name: string }) {
    onAssignPayee?.(payee.id, payee.name);
    showPayeePicker = false;
    payeeSearch = '';
  }

  function createNewPayee() {
    if (payeeSearch.trim()) {
      onAssignPayee?.(null, payeeSearch.trim());
      showPayeePicker = false;
      payeeSearch = '';
    }
  }

  function selectFlag(flag: string | null) {
    onAssignFlag?.(flag);
    showFlagPicker = false;
  }

  const netAmount = $derived(totalInflow + totalOutflow);
</script>

{#if selectedCount > 0}
  <div class="bulk-actions-bar">
    <div class="bulk-info">
      <span class="bulk-count">{selectedCount} seleccionadas</span>
      <div class="bulk-totals">
        {#if totalInflow > 0}
          <span class="inflow">+{formatCurrency(totalInflow)}</span>
        {/if}
        {#if totalOutflow < 0}
          <span class="outflow">{formatCurrency(totalOutflow)}</span>
        {/if}
        <span class="net" class:positive={netAmount >= 0} class:negative={netAmount < 0}>
          = {formatCurrency(netAmount)}
        </span>
      </div>
    </div>

    <div class="bulk-actions">
      <!-- Category picker -->
      <div class="action-group">
        <Button 
          variant="outline" 
          size="sm" 
          onclick={() => { showCategoryPicker = !showCategoryPicker; showPayeePicker = false; showFlagPicker = false; }}
        >
          <Tag class="h-4 w-4 mr-1" />
          Categoría
        </Button>
        {#if showCategoryPicker}
          <div class="picker-dropdown">
            <input
              type="text"
              placeholder="Buscar categoría..."
              class="picker-search"
              bind:value={categorySearch}
              autofocus
            />
            <div class="picker-list">
              {#each filteredCategories as cat (cat.entityId)}
                <button class="picker-item" onclick={() => selectCategory(cat)}>
                  {cat.name}
                </button>
              {/each}
              {#if filteredCategories.length === 0}
                <div class="picker-empty">No hay categorías</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Payee picker -->
      <div class="action-group">
        <Button 
          variant="outline" 
          size="sm" 
          onclick={() => { showPayeePicker = !showPayeePicker; showCategoryPicker = false; showFlagPicker = false; }}
        >
          <User class="h-4 w-4 mr-1" />
          Beneficiario
        </Button>
        {#if showPayeePicker}
          <div class="picker-dropdown">
            <input
              type="text"
              placeholder="Buscar o crear beneficiario..."
              class="picker-search"
              bind:value={payeeSearch}
              autofocus
              onkeydown={(e) => e.key === 'Enter' && createNewPayee()}
            />
            <div class="picker-list">
              {#if payeeSearch.trim() && !filteredPayees.some(p => p.name.toLowerCase() === payeeSearch.toLowerCase())}
                <button class="picker-item picker-new" onclick={createNewPayee}>
                  + Crear "{payeeSearch}"
                </button>
              {/if}
              {#each filteredPayees as payee (payee.id)}
                <button class="picker-item" onclick={() => selectPayee(payee)}>
                  {payee.name}
                </button>
              {/each}
              {#if filteredPayees.length === 0 && !payeeSearch.trim()}
                <div class="picker-empty">No hay beneficiarios</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Flag picker -->
      <div class="action-group">
        <Button 
          variant="outline" 
          size="sm" 
          onclick={() => { showFlagPicker = !showFlagPicker; showCategoryPicker = false; showPayeePicker = false; }}
        >
          <Flag class="h-4 w-4 mr-1" />
          Bandera
        </Button>
        {#if showFlagPicker}
          <div class="picker-dropdown flag-dropdown">
            <div class="flag-grid">
              <button class="flag-option flag-none" onclick={() => selectFlag(null)} title="Sin bandera">
                <X class="h-3 w-3" />
              </button>
              {#each flagColors as flag}
                <button 
                  class="flag-option {flag.class}" 
                  onclick={() => selectFlag(flag.value)}
                  title={flag.name}
                />
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Import-specific actions -->
      {#if showImportActions}
        <Button variant="outline" size="sm" onclick={onMarkReady}>
          <Check class="h-4 w-4 mr-1" />
          Listas
        </Button>
        <Button variant="outline" size="sm" onclick={onMarkSkipped}>
          <X class="h-4 w-4 mr-1" />
          Omitir
        </Button>
      {/if}

      {#if onDelete}
        <Button variant="outline" size="sm" onclick={onDelete} class="text-destructive">
          <Trash2 class="h-4 w-4 mr-1" />
          Eliminar
        </Button>
      {/if}

      <!-- Clear selection -->
      <Button variant="ghost" size="sm" onclick={onClear}>
        <X class="h-4 w-4" />
      </Button>
    </div>
  </div>
{/if}

<style>
  .bulk-actions-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: var(--accent);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .bulk-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .bulk-count {
    font-weight: 600;
    font-size: 0.875rem;
  }

  .bulk-totals {
    display: flex;
    gap: 0.75rem;
    font-size: 0.8125rem;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .bulk-totals .inflow { color: var(--ynab-green); }
  .bulk-totals .outflow { color: var(--ynab-red); }
  .bulk-totals .net.positive { color: var(--ynab-green); }
  .bulk-totals .net.negative { color: var(--ynab-red); }

  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .action-group {
    position: relative;
  }

  .picker-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.25rem;
    min-width: 220px;
    background: var(--popover);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 50;
    overflow: hidden;
  }

  .picker-search {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    border-bottom: 1px solid var(--border);
    background: transparent;
    font-size: 0.875rem;
    outline: none;
  }

  .picker-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .picker-item {
    display: block;
    width: 100%;
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-size: 0.875rem;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }

  .picker-item:hover {
    background: var(--accent);
  }

  .picker-item.picker-new {
    color: var(--primary);
    font-weight: 500;
  }

  .picker-empty {
    padding: 0.75rem;
    text-align: center;
    color: var(--muted-foreground);
    font-size: 0.8125rem;
  }

  .flag-dropdown {
    min-width: auto;
    padding: 0.5rem;
  }

  .flag-grid {
    display: flex;
    gap: 0.25rem;
  }

  .flag-option {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.25rem;
    border: 1px solid var(--border);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s;
  }

  .flag-option:hover {
    transform: scale(1.1);
  }

  .flag-none {
    background: var(--muted);
  }
</style>

