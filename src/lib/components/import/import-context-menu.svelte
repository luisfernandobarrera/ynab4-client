<script lang="ts">
  import {
    Tag,
    User,
    Flag,
    ArrowRightLeft,
    Trash2,
    Check,
    X,
    Sparkles,
    Copy,
    FolderOpen,
    RefreshCw,
    ChevronRight,
  } from 'lucide-svelte';
  import {
    ContextMenu,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
  } from '$lib/components/ui/context-menu';
  import { categories, payees, type Category, type Payee } from '$lib/stores/budget';
  import type { ImportTransaction } from '$lib/services/import-service';

  interface Props {
    open?: boolean;
    x?: number;
    y?: number;
    selectedTransactions: ImportTransaction[];
    onClose?: () => void;
    // Actions
    onAssignCategory: (categoryId: string, categoryName: string) => void;
    onAssignPayee: (payeeId: string | null, payeeName: string) => void;
    onAssignFlag: (flag: string | null) => void;
    onAssignAccount: (accountName: string) => void;
    onMarkReady: () => void;
    onMarkSkipped: () => void;
    onDelete: () => void;
    onRenameLikePayees: (oldName: string, newPayeeId: string | null, newPayeeName: string) => void;
    onApplySuggestions: () => void;
  }

  let {
    open = $bindable(false),
    x = 0,
    y = 0,
    selectedTransactions,
    onClose,
    onAssignCategory,
    onAssignPayee,
    onAssignFlag,
    onAssignAccount,
    onMarkReady,
    onMarkSkipped,
    onDelete,
    onRenameLikePayees,
    onApplySuggestions,
  }: Props = $props();

  const selectionCount = $derived(selectedTransactions.length);
  
  // Get first selected transaction for context
  const firstTx = $derived(selectedTransactions[0]);
  const firstPayee = $derived(firstTx?.payeeName || firstTx?.description || '');

  // Flag options
  const flagColors = [
    { name: 'Rojo', value: 'Red', class: 'bg-red-500' },
    { name: 'Naranja', value: 'Orange', class: 'bg-orange-500' },
    { name: 'Amarillo', value: 'Yellow', class: 'bg-yellow-500' },
    { name: 'Verde', value: 'Green', class: 'bg-green-500' },
    { name: 'Azul', value: 'Blue', class: 'bg-blue-500' },
    { name: 'Morado', value: 'Purple', class: 'bg-purple-500' },
  ];

  // ========================
  // SMART SUGGESTIONS
  // ========================

  // Categories grouped by master category
  const categoriesByMaster = $derived.by(() => {
    const result: Map<string, { masterName: string; subs: Category[] }> = new Map();
    const allCats = $categories.filter(c => !c.isTombstone && c.masterCategoryId);
    
    for (const cat of allCats) {
      const masterId = cat.masterCategoryId;
      if (!result.has(masterId)) {
        result.set(masterId, { masterName: cat.masterCategoryName, subs: [] });
      }
      result.get(masterId)!.subs.push(cat);
    }
    
    return result;
  });

  // Get master categories for menu (convert to array)
  const masterCategories = $derived(
    Array.from(categoriesByMaster.entries())
      .map(([id, data]) => ({ id, masterName: data.masterName, subs: data.subs }))
      .slice(0, 10)
  );

  // Find similar payees in budget based on first selected transaction
  const similarPayees = $derived.by(() => {
    if (!firstPayee) return [];
    
    const search = firstPayee.toLowerCase();
    const words = search.split(/\s+/).filter(w => w.length > 2);
    
    return $payees
      .filter(p => !p.isTombstone)
      .map(p => {
        const name = p.name.toLowerCase();
        let score = 0;
        
        // Exact match
        if (name === search) score = 100;
        // Starts with
        else if (name.startsWith(search) || search.startsWith(name)) score = 80;
        // Contains
        else if (name.includes(search) || search.includes(name)) score = 60;
        // Word match
        else {
          for (const word of words) {
            if (name.includes(word)) score += 20;
          }
        }
        
        return { payee: p, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(x => x.payee);
  });

  // Get recent categories for first payee (if it exists in budget)
  const recentCategoriesForPayee = $derived.by(() => {
    // This would ideally come from transaction history
    // For now, return most used categories (those with masterCategoryId are subcategories)
    return $categories
      .filter(c => !c.isTombstone && c.masterCategoryId)
      .slice(0, 5);
  });

  // Unique accounts from selected transactions
  const uniqueAccounts = $derived.by(() => {
    const accounts = new Set<string>();
    for (const tx of selectedTransactions) {
      if (tx.accountName) accounts.add(tx.accountName);
    }
    return Array.from(accounts);
  });

  // Has suggested payees?
  const hasSuggestions = $derived(
    selectedTransactions.some(tx => tx.suggestedPayee && tx.suggestedPayee !== tx.payeeName)
  );

  // ========================
  // ACTIONS
  // ========================

  function close() {
    open = false;
    onClose?.();
  }

  function handleAssignCategory(categoryId: string, categoryName: string) {
    onAssignCategory(categoryId, categoryName);
    close();
  }

  function handleAssignPayee(payee: Payee) {
    onAssignPayee(payee.id, payee.name);
    close();
  }

  function handleAssignFlag(flag: string | null) {
    onAssignFlag(flag);
    close();
  }

  function handleMarkReady() {
    onMarkReady();
    close();
  }

  function handleMarkSkipped() {
    onMarkSkipped();
    close();
  }

  function handleDelete() {
    onDelete();
    close();
  }

  function handleRenameLike(payee: Payee) {
    if (!firstPayee) return;
    onRenameLikePayees(firstPayee, payee.id, payee.name);
    close();
  }

  function handleApplySuggestions() {
    onApplySuggestions();
    close();
  }
</script>

<ContextMenu bind:open {x} {y} {onClose}>
  <div class="ctx-header">
    <span class="ctx-count">{selectionCount}</span> seleccionadas
  </div>

  <ContextMenuSeparator />

  <!-- Quick Category Assignment (frequent) -->
  {#if recentCategoriesForPayee.length > 0}
    <div class="ctx-section-label">Categorías frecuentes</div>
    {#each recentCategoriesForPayee.slice(0, 3) as cat (cat.entityId)}
      <ContextMenuItem onclick={() => handleAssignCategory(cat.entityId, cat.name)}>
        <Tag class="ctx-icon" />
        {cat.name}
      </ContextMenuItem>
    {/each}
    <ContextMenuSeparator />
  {/if}

  <!-- Categorize As (with submenus) -->
  <ContextMenuSub label="Categoría">
    {#if categoriesByMaster.size > 0}
      {#each masterCategories as { id, masterName, subs } (id)}
        {#if subs.length > 1}
          <ContextMenuSub label={masterName}>
            {#each subs as sub (sub.entityId)}
              <ContextMenuItem onclick={() => handleAssignCategory(sub.entityId, sub.name)}>
                {sub.name}
              </ContextMenuItem>
            {/each}
          </ContextMenuSub>
        {:else if subs.length === 1}
          <ContextMenuItem onclick={() => handleAssignCategory(subs[0].entityId, subs[0].name)}>
            {subs[0].name}
          </ContextMenuItem>
        {/if}
      {/each}
    {:else}
      <ContextMenuItem disabled>
        Sin categorías disponibles
      </ContextMenuItem>
    {/if}
  </ContextMenuSub>

  <ContextMenuSeparator />

  <!-- Similar Payees -->
  {#if similarPayees.length > 0}
    <ContextMenuSub label="Renombrar a...">
      {#each similarPayees as payee (payee.id)}
        <ContextMenuItem onclick={() => handleAssignPayee(payee)}>
          <User class="ctx-icon" />
          {payee.name}
        </ContextMenuItem>
      {/each}
    </ContextMenuSub>
  {/if}

  <!-- Rename Like Payees (for batch renaming) -->
  {#if selectionCount === 1 && similarPayees.length > 0}
    <ContextMenuSub label="Renombrar similares a...">
      {#each similarPayees as payee (payee.id)}
        <ContextMenuItem onclick={() => handleRenameLike(payee)}>
          <RefreshCw class="ctx-icon" />
          {payee.name}
          <span class="ctx-hint">todos</span>
        </ContextMenuItem>
      {/each}
    </ContextMenuSub>
  {/if}

  <!-- Apply Suggestions -->
  {#if hasSuggestions}
    <ContextMenuItem onclick={handleApplySuggestions}>
      <Sparkles class="ctx-icon text-primary" />
      Aplicar sugerencias
      <span class="ctx-hint">payees</span>
    </ContextMenuItem>
  {/if}

  <ContextMenuSeparator />

  <!-- Set Flag -->
  <ContextMenuSub label="Bandera">
    {#each flagColors as flag (flag.value)}
      <ContextMenuItem onclick={() => handleAssignFlag(flag.value)}>
        <span class="flag-dot {flag.class}"></span>
        {flag.name}
      </ContextMenuItem>
    {/each}
    <ContextMenuSeparator />
    <ContextMenuItem onclick={() => handleAssignFlag(null)}>
      <span class="flag-dot bg-muted"></span>
      Quitar bandera
    </ContextMenuItem>
  </ContextMenuSub>

  <ContextMenuSeparator />

  <!-- Status -->
  <ContextMenuItem onclick={handleMarkReady}>
    <Check class="ctx-icon text-green-500" />
    Marcar como lista
  </ContextMenuItem>
  <ContextMenuItem onclick={handleMarkSkipped}>
    <X class="ctx-icon text-muted-foreground" />
    Omitir
  </ContextMenuItem>

  <ContextMenuSeparator />

  <!-- Delete -->
  <ContextMenuItem destructive onclick={handleDelete}>
    <Trash2 class="ctx-icon" />
    Eliminar
  </ContextMenuItem>
</ContextMenu>

<style>
  .ctx-header {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .ctx-count {
    font-weight: 600;
    color: var(--foreground);
  }

  .ctx-section-label {
    padding: 0.25rem 0.75rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  :global(.ctx-icon) {
    width: 1rem;
    height: 1rem;
    margin-right: 0.5rem;
    flex-shrink: 0;
  }

  .flag-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    margin-right: 0.5rem;
    flex-shrink: 0;
  }

  .ctx-hint {
    margin-left: auto;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    padding-left: 1rem;
  }
</style>

