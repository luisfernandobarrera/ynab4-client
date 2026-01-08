<script lang="ts">
  import { Search, ChevronDown, ChevronRight, Edit2, Plus, Trash2, X, GripVertical } from 'lucide-svelte';
  import { masterCategories, categories, transactions } from '$lib/stores/budget';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';

  // State
  let searchTerm = $state('');
  let expandedMasterCategories = $state<Set<string>>(new Set());

  // Filter out hidden/internal master categories
  const visibleMasterCategories = $derived.by(() => {
    return $masterCategories
      .filter(mc =>
        mc.name &&
        !mc.name.startsWith('Hidden') &&
        !mc.name.startsWith('Internal') &&
        !mc.name.startsWith('Pre-YNAB') &&
        !mc.isTombstone
      )
      .sort((a, b) => (a.sortableIndex || 0) - (b.sortableIndex || 0));
  });

  // Get categories per master category
  const categoriesByMaster = $derived.by(() => {
    const map = new Map<string, typeof $categories>();

    for (const mc of visibleMasterCategories) {
      const cats = $categories
        .filter(c =>
          c.masterCategoryId === mc.entityId &&
          !c.isTombstone &&
          (!searchTerm || c.name?.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .sort((a, b) => (a.sortableIndex || 0) - (b.sortableIndex || 0));
      map.set(mc.entityId, cats);
    }

    return map;
  });

  // Transaction counts per category
  const transactionCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const tx of $transactions) {
      if (tx.categoryId) {
        counts[tx.categoryId] = (counts[tx.categoryId] || 0) + 1;
      }
    }
    return counts;
  });

  // Total categories count
  const totalCategories = $derived(
    Array.from(categoriesByMaster.values()).reduce((sum, cats) => sum + cats.length, 0)
  );

  // Filter master categories based on search
  const filteredMasterCategories = $derived.by(() => {
    if (!searchTerm) return visibleMasterCategories;

    const term = searchTerm.toLowerCase();
    return visibleMasterCategories.filter(mc => {
      // Include if master category name matches
      if (mc.name?.toLowerCase().includes(term)) return true;
      // Include if any sub-category matches
      const cats = categoriesByMaster.get(mc.entityId) || [];
      return cats.length > 0;
    });
  });

  function toggleMasterCategory(id: string) {
    const newSet = new Set(expandedMasterCategories);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    expandedMasterCategories = newSet;
  }

  function expandAll() {
    expandedMasterCategories = new Set(visibleMasterCategories.map(mc => mc.entityId));
  }

  function collapseAll() {
    expandedMasterCategories = new Set();
  }
</script>

<div class="categories-panel">
  <!-- Header -->
  <div class="categories-header">
    <div>
      <h3>Categorías</h3>
      <p class="categories-subtitle">
        {totalCategories} categorías en {filteredMasterCategories.length} grupos
      </p>
    </div>
    <div class="header-actions">
      <Button variant="outline" size="sm" onclick={expandAll}>
        Expandir
      </Button>
      <Button variant="outline" size="sm" onclick={collapseAll}>
        Colapsar
      </Button>
    </div>
  </div>

  <!-- Search -->
  <div class="categories-search">
    <div class="search-input-wrapper">
      <Search class="h-4 w-4 search-icon" />
      <Input
        type="text"
        placeholder="Buscar categorías..."
        bind:value={searchTerm}
        class="pl-9"
      />
      {#if searchTerm}
        <button class="clear-search" onclick={() => searchTerm = ''}>
          <X class="h-3 w-3" />
        </button>
      {/if}
    </div>
  </div>

  <!-- Categories List -->
  <div class="categories-list">
    {#each filteredMasterCategories as masterCategory (masterCategory.entityId)}
      {@const subCategories = categoriesByMaster.get(masterCategory.entityId) || []}
      {@const isExpanded = expandedMasterCategories.has(masterCategory.entityId)}

      <div class="master-category">
        <!-- Master Category Header -->
        <button
          class="master-category-header"
          onclick={() => toggleMasterCategory(masterCategory.entityId)}
        >
          <div class="master-category-toggle">
            {#if isExpanded}
              <ChevronDown class="h-4 w-4" />
            {:else}
              <ChevronRight class="h-4 w-4" />
            {/if}
          </div>
          <span class="master-category-name">{masterCategory.name}</span>
          <span class="master-category-count">{subCategories.length}</span>
        </button>

        <!-- Sub Categories -->
        {#if isExpanded}
          <div class="sub-categories">
            {#each subCategories as category (category.entityId)}
              <div class="sub-category">
                <div class="sub-category-info">
                  <span class="sub-category-name">{category.name}</span>
                  <span class="sub-category-transactions">
                    {transactionCounts[category.entityId] || 0} transacciones
                  </span>
                </div>
                {#if $isEditMode}
                  <div class="sub-category-actions">
                    <button class="action-btn" title="Editar">
                      <Edit2 class="h-3.5 w-3.5" />
                    </button>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="no-subcategories">
                Sin subcategorías
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="categories-empty">
        <p>{searchTerm ? 'No se encontraron categorías' : 'No hay categorías disponibles'}</p>
      </div>
    {/each}
  </div>

  <!-- Info -->
  <div class="categories-info">
    <p>
      Las categorías se utilizan para clasificar tus transacciones y generar reportes.
      {#if !$isEditMode}
        Activa el modo de edición para modificar las categorías.
      {/if}
    </p>
  </div>
</div>

<style>
  .categories-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: hsl(var(--background));
    overflow: hidden;
  }

  .categories-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--card));
  }

  .categories-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .categories-subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .categories-search {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--card));
  }

  .search-input-wrapper {
    position: relative;
  }

  .search-input-wrapper :global(input) {
    padding-left: 2.25rem !important;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: hsl(var(--muted-foreground));
    pointer-events: none;
  }

  .clear-search {
    position: absolute;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    border-radius: 50%;
    cursor: pointer;
  }

  .clear-search:hover {
    background: hsl(var(--accent));
    color: hsl(var(--foreground));
  }

  .categories-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .master-category {
    margin-bottom: 0.5rem;
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    overflow: hidden;
    background: hsl(var(--card));
  }

  .master-category-header {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: hsl(var(--muted) / 0.5);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .master-category-header:hover {
    background: hsl(var(--muted) / 0.8);
  }

  .master-category-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-right: 0.5rem;
    color: hsl(var(--muted-foreground));
  }

  .master-category-name {
    flex: 1;
    text-align: left;
    font-weight: 600;
    font-size: 0.875rem;
    color: hsl(var(--foreground));
  }

  .master-category-count {
    padding: 0.125rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 500;
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
    border-radius: 10px;
  }

  .sub-categories {
    border-top: 1px solid hsl(var(--border));
  }

  .sub-category {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 1rem 0.625rem 2.5rem;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
    transition: background 0.15s ease;
  }

  .sub-category:last-child {
    border-bottom: none;
  }

  .sub-category:hover {
    background: hsl(var(--muted) / 0.3);
  }

  .sub-category-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .sub-category-name {
    font-size: 0.85rem;
    color: hsl(var(--foreground));
  }

  .sub-category-transactions {
    font-size: 0.7rem;
    color: hsl(var(--muted-foreground));
  }

  .sub-category-actions {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .sub-category:hover .sub-category-actions {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    background: hsl(var(--accent));
    color: hsl(var(--foreground));
  }

  .no-subcategories {
    padding: 1rem 2.5rem;
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }

  .categories-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    font-size: 0.9rem;
  }

  .categories-info {
    padding: 1rem 1.25rem;
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.3);
  }

  .categories-info p {
    margin: 0;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
  }
</style>
