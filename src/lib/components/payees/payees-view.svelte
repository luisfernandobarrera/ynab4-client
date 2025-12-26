<script lang="ts">
  import { Search, X, Edit2, Merge, Tag } from 'lucide-svelte';
  import { payees, transactions, categories, budgetInfo } from '$lib/stores/budget';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { t } from '$lib/i18n';

  // State
  let searchTerm = $state('');
  let activePayee = $state<(typeof $payees)[number] | null>(null);
  let isRenaming = $state(false);
  let newName = $state('');
  
  // Combine payees modal
  let showCombineModal = $state(false);
  let combineSearchTerm = $state('');
  let combineTargetId = $state<string | null>(null);
  
  // Auto-category modal
  let showAutoCategoryModal = $state(false);
  let selectedCategoryId = $state<string | null>(null);

  // Filter payees - exclude transfers and tombstones
  const filteredPayees = $derived.by(() => {
    let list = $payees.filter(p => 
      p.entityId && 
      !p.entityId.startsWith('Payee/Transfer:')
    );
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(p => p.name?.toLowerCase().includes(term));
    }
    
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  });

  // Get transaction count per payee
  const transactionCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    $transactions.forEach(tx => {
      if (tx.payeeId) {
        counts[tx.payeeId] = (counts[tx.payeeId] || 0) + 1;
      }
    });
    return counts;
  });

  // Get category name
  function getCategoryName(categoryId: string | null): string | null {
    if (!categoryId) return null;
    const cat = $categories.find(c => c.entityId === categoryId);
    if (!cat) return categoryId;
    if (cat.masterCategoryName) {
      return `${cat.masterCategoryName}: ${cat.name}`;
    }
    return cat.name;
  }

  // Select payee for details
  function handleSelectPayee(payee: (typeof $payees)[number]) {
    activePayee = payee;
    isRenaming = false;
    newName = payee.name || '';
  }

  // Start rename
  function startRename() {
    isRenaming = true;
    newName = activePayee?.name || '';
  }

  // Save rename
  function saveRename() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Enable edit mode to rename payees' });
      return;
    }
    
    if (activePayee && newName.trim() && newName !== activePayee.name) {
      addPendingChange({
        type: 'payee',
        action: 'update',
        entityId: activePayee.entityId,
        entityName: newName.trim(),
        data: { name: newName.trim(), previousName: activePayee.name }
      });
      
      addToast({ type: 'success', message: 'Payee renamed' });
    }
    isRenaming = false;
  }

  // Cancel rename
  function cancelRename() {
    isRenaming = false;
    newName = activePayee?.name || '';
  }

  // Handle keydown in rename input
  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveRename();
    if (e.key === 'Escape') cancelRename();
  }

  // Combine payees
  const combineFilteredPayees = $derived.by(() => {
    if (!combineSearchTerm) return filteredPayees.filter(p => p.entityId !== activePayee?.entityId);
    const term = combineSearchTerm.toLowerCase();
    return filteredPayees
      .filter(p => p.entityId !== activePayee?.entityId)
      .filter(p => p.name?.toLowerCase().includes(term));
  });

  function openCombineModal() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Enable edit mode to combine payees' });
      return;
    }
    combineSearchTerm = '';
    combineTargetId = null;
    showCombineModal = true;
  }

  function confirmCombine() {
    if (!activePayee || !combineTargetId) return;
    
    const targetPayee = $payees.find(p => p.entityId === combineTargetId);
    if (!targetPayee) return;

    // Track combine as pending change - will update all transactions from source to target
    addPendingChange({
      type: 'payee',
      action: 'delete',
      entityId: activePayee.entityId,
      entityName: activePayee.name || '',
      data: { 
        combineInto: combineTargetId,
        targetName: targetPayee.name
      }
    });

    addToast({ type: 'success', message: `Payee "${activePayee.name}" combined into "${targetPayee.name}"` });
    showCombineModal = false;
    activePayee = null;
  }

  // Auto-category
  const categoryOptions = $derived(
    $categories
      .filter(c => !c.isTombstone)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  );

  function openAutoCategoryModal() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Enable edit mode to set auto-category' });
      return;
    }
    selectedCategoryId = (activePayee as unknown as { autoFillCategoryId?: string }).autoFillCategoryId || null;
    showAutoCategoryModal = true;
  }

  function saveAutoCategory() {
    if (!activePayee) return;

    addPendingChange({
      type: 'payee',
      action: 'update',
      entityId: activePayee.entityId,
      entityName: activePayee.name || '',
      data: { autoFillCategoryId: selectedCategoryId }
    });

    addToast({ type: 'success', message: 'Auto-category set' });
    showAutoCategoryModal = false;
  }
</script>

<div class="payees-view">
  <div class="payees-header">
    <h2>{$t('payeeSettings.title')}</h2>
  </div>

  <div class="payees-content">
    <!-- Left: Payee List -->
    <div class="payee-list-panel">
      <div class="payee-list-toolbar">
        <div class="payee-search">
          <Search class="h-4 w-4 search-icon" />
          <input
            type="text"
            placeholder={$t('payeeSettings.searchPayees')}
            bind:value={searchTerm}
          />
          {#if searchTerm}
            <button class="clear-search" onclick={() => searchTerm = ''}>
              <X class="h-3 w-3" />
            </button>
          {/if}
        </div>
      </div>

      <div class="payee-list">
        {#each filteredPayees as payee (payee.entityId)}
          <button 
            class="payee-list-item"
            class:active={activePayee?.entityId === payee.entityId}
            onclick={() => handleSelectPayee(payee)}
          >
            <span class="payee-name">{payee.name}</span>
            <span class="payee-count">{transactionCounts[payee.entityId] || 0}</span>
          </button>
        {:else}
          <div class="payee-list-empty">
            {searchTerm ? $t('payeeSettings.noResults') : $t('payeeSettings.noPayees')}
          </div>
        {/each}
      </div>
    </div>

    <!-- Right: Payee Details -->
    <div class="payee-details-panel">
      {#if activePayee}
        <div class="payee-details-header">
          {#if isRenaming}
            <div class="rename-form">
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="text"
                bind:value={newName}
                onkeydown={handleRenameKeydown}
                autofocus
              />
              <div class="rename-actions">
                <button class="btn btn-primary" onclick={saveRename}>
                  {$t('common.save')}
                </button>
                <button class="btn" onclick={cancelRename}>
                  {$t('common.cancel')}
                </button>
              </div>
            </div>
          {:else}
            <h3>{activePayee.name}</h3>
            <div class="payee-actions">
              <button class="btn-icon" onclick={startRename} title={$t('payeeSettings.rename')}>
                <Edit2 class="h-4 w-4" />
              </button>
              <button class="btn-icon" onclick={openCombineModal} title={$t('payeeSettings.combine')}>
                <Merge class="h-4 w-4" />
              </button>
              <button class="btn-icon" onclick={openAutoCategoryModal} title={$t('payeeSettings.autoCategory')}>
                <Tag class="h-4 w-4" />
              </button>
            </div>
          {/if}
        </div>

        <div class="payee-details-content">
          <div class="detail-section">
            <span class="detail-label">{$t('payeeSettings.transactionCount')}</span>
            <span class="detail-value">
              {transactionCounts[activePayee.entityId] || 0}
            </span>
          </div>

          <div class="detail-section">
            <span class="detail-label">{$t('payeeSettings.autoCategory')}</span>
            <div class="detail-row">
              <span class="detail-value">
                {getCategoryName((activePayee as unknown as { autoFillCategoryId?: string }).autoFillCategoryId || null) || $t('payeeSettings.noAutoCategory')}
              </span>
              {#if $isEditMode}
                <button class="btn-small" onclick={openAutoCategoryModal}>
                  {$t('common.edit')}
                </button>
              {/if}
            </div>
          </div>

          <div class="detail-section">
            <span class="detail-label">{$t('payeeSettings.renameRules')}</span>
            {#if (activePayee as unknown as { renameConditions?: Array<{ type: string; operand: string }> }).renameConditions?.length}
              {@const rules = (activePayee as unknown as { renameConditions: Array<{ type: string; operand: string }> }).renameConditions}
              <ul class="rename-rules-list">
                {#each rules as rule, idx (idx)}
                  <li>
                    <span class="rule-type">{rule.type}</span>
                    <span class="rule-operand">"{rule.operand}"</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <span class="no-rules">{$t('payeeSettings.noRenameRules')}</span>
            {/if}
          </div>
        </div>
      {:else}
        <div class="payee-details-empty">
          <p>{$t('payeeSettings.selectPayee')}</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Combine Payees Modal -->
{#if showCombineModal && activePayee}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal-content">
      <div class="modal-header">
        <h3>{$t('payeeSettings.combinePayees')}</h3>
        <button class="modal-close" onclick={() => showCombineModal = false}>
          <X class="h-4 w-4" />
        </button>
      </div>
      <div class="modal-body">
        <p class="modal-description">{$t('payeeSettings.selectTargetPayee')}</p>
        
        <div class="combine-search">
          <Search class="h-4 w-4" />
          <input 
            type="text" 
            placeholder={$t('payeeSettings.searchPayees')}
            bind:value={combineSearchTerm}
          />
        </div>
        
        <div class="combine-list">
          {#each combineFilteredPayees.slice(0, 20) as payee (payee.entityId)}
            <button 
              class="combine-item"
              class:selected={combineTargetId === payee.entityId}
              onclick={() => combineTargetId = payee.entityId}
            >
              <span class="combine-name">{payee.name}</span>
              <span class="combine-count">{transactionCounts[payee.entityId] || 0}</span>
            </button>
          {/each}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick={() => showCombineModal = false}>
          {$t('common.cancel')}
        </button>
        <button class="btn btn-primary" onclick={confirmCombine} disabled={!combineTargetId}>
          {$t('payeeSettings.combine')}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Auto-Category Modal -->
{#if showAutoCategoryModal && activePayee}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal-content">
      <div class="modal-header">
        <h3>{$t('payeeSettings.autoCategory')}</h3>
        <button class="modal-close" onclick={() => showAutoCategoryModal = false}>
          <X class="h-4 w-4" />
        </button>
      </div>
      <div class="modal-body">
        <p class="modal-description">
          Select a default category for "{activePayee.name}"
        </p>
        
        <div class="category-select">
          <select bind:value={selectedCategoryId}>
            <option value={null}>-- {$t('payeeSettings.noAutoCategory')} --</option>
            {#each categoryOptions as cat (cat.entityId)}
              <option value={cat.entityId}>
                {cat.masterCategoryName ? `${cat.masterCategoryName}: ${cat.name}` : cat.name}
              </option>
            {/each}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick={() => showAutoCategoryModal = false}>
          {$t('common.cancel')}
        </button>
        <button class="btn btn-primary" onclick={saveAutoCategory}>
          {$t('common.save')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .payees-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
    overflow: hidden;
  }

  /* Header */
  .payees-header {
    padding: 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }

  .payees-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--foreground);
  }

  /* Content */
  .payees-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  /* Payee List Panel */
  .payee-list-panel {
    width: 300px;
    min-width: 250px;
    display: flex;
    flex-direction: column;
    background: var(--card);
    border-right: 1px solid var(--border);
  }

  .payee-list-toolbar {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  .payee-search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .payee-search input {
    width: 100%;
    padding: 0.5rem 0.75rem 0.5rem 32px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.85rem;
  }

  .payee-search input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .clear-search {
    position: absolute;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: var(--muted);
    color: var(--muted-foreground);
    border-radius: 50%;
    cursor: pointer;
  }

  .clear-search:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  /* Payee List */
  .payee-list {
    flex: 1;
    overflow-y: auto;
  }

  .payee-list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }

  .payee-list-item:hover {
    background: var(--accent);
  }

  .payee-list-item.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .payee-list-item.active .payee-count {
    background: rgba(255, 255, 255, 0.2);
    color: var(--primary-foreground);
  }

  .payee-name {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .payee-count {
    flex-shrink: 0;
    margin-left: 0.5rem;
    padding: 0.125rem 0.5rem;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 0.7rem;
    font-weight: 500;
    border-radius: 10px;
  }

  .payee-list-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--muted-foreground);
    font-size: 0.85rem;
  }

  /* Payee Details Panel */
  .payee-details-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--background);
  }

  .payee-details-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }

  .payee-details-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-icon:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  /* Rename Form */
  .rename-form {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .rename-form input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--primary);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 1rem;
    font-weight: 600;
  }

  .rename-form input:focus {
    outline: none;
  }

  .rename-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:hover {
    background: var(--accent);
  }

  .btn-primary {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  /* Payee Details Content */
  .payee-details-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .detail-section {
    margin-bottom: 1.5rem;
  }

  .detail-label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--muted-foreground);
  }

  .detail-value {
    font-size: 0.9rem;
    color: var(--foreground);
  }

  .no-rules {
    font-size: 0.85rem;
    color: var(--muted-foreground);
    font-style: italic;
  }

  .rename-rules-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rename-rules-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--muted);
    border-radius: 4px;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }

  .rule-type {
    font-weight: 500;
    color: var(--primary);
  }

  .rule-operand {
    color: var(--foreground);
  }

  /* Payee Details Empty */
  .payee-details-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    font-size: 0.9rem;
  }

  /* Payee Actions */
  .payee-actions {
    display: flex;
    gap: 0.5rem;
  }

  .detail-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .btn-small {
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-small:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    padding: 1rem;
  }

  .modal-content {
    width: 100%;
    max-width: 450px;
    max-height: 80vh;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    border-radius: 4px;
    cursor: pointer;
  }

  .modal-close:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .modal-description {
    margin: 0 0 1rem;
    font-size: 0.85rem;
    color: var(--muted-foreground);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 1rem;
    border-top: 1px solid var(--border);
  }

  /* Combine List */
  .combine-search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
  }

  .combine-search input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--foreground);
    font-size: 0.85rem;
    outline: none;
  }

  .combine-list {
    max-height: 250px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .combine-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: none;
    border-bottom: 1px solid var(--border);
    background: var(--background);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }

  .combine-item:last-child {
    border-bottom: none;
  }

  .combine-item:hover {
    background: var(--accent);
  }

  .combine-item.selected {
    background: rgba(59, 130, 246, 0.15);
  }

  .combine-name {
    font-size: 0.85rem;
    color: var(--foreground);
  }

  .combine-count {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  /* Category Select */
  .category-select select {
    width: 100%;
    padding: 0.625rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.85rem;
  }

  /* Mobile */
  @media (max-width: 768px) {
    .payees-content {
      flex-direction: column;
    }

    .payee-list-panel {
      width: 100%;
      max-height: 40vh;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
  }
</style>

