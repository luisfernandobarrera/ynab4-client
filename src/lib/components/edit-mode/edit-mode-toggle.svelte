<script lang="ts">
  import { Eye, Edit3, AlertCircle, Save } from 'lucide-svelte';
  import { t } from '$lib/i18n';
  import { isEditMode, isDirty, changeCount, requestEditMode, disableEditMode, forceDisableEditMode } from '$lib/stores/ui';
  import { budgetInfo } from '$lib/stores/budget';
  import { syncPendingChanges, canSync } from '$lib/services/budget-sync';

  // Props
  interface Props {
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  // State
  let showConfirmDisable = $state(false);
  let isSyncing = $state(false);

  function handleToggle() {
    if ($isEditMode) {
      // Try to disable
      if (!disableEditMode()) {
        // Has unsaved changes
        showConfirmDisable = true;
      }
    } else {
      // Request to enable
      requestEditMode();
    }
  }

  async function handleSync() {
    if (isSyncing) return;
    isSyncing = true;
    try {
      await syncPendingChanges();
    } finally {
      isSyncing = false;
    }
  }

  function handleConfirmDisable() {
    forceDisableEditMode();
    showConfirmDisable = false;
  }

  function handleCancelDisable() {
    showConfirmDisable = false;
  }
</script>

{#if $budgetInfo.client}
  <div class="edit-mode-toggle" class:compact>
    <button 
      class="toggle-btn" 
      class:active={$isEditMode}
      class:dirty={$isDirty}
      onclick={handleToggle}
      title={$isEditMode ? $t('editMode.switchToRead') : $t('editMode.switchToEdit')}
    >
      {#if $isEditMode}
        <Edit3 class="h-4 w-4" />
        {#if !compact}
          <span class="label">{$t('editMode.editing')}</span>
        {/if}
        {#if $isDirty}
          <span class="badge">{$changeCount}</span>
        {/if}
      {:else}
        <Eye class="h-4 w-4" />
        {#if !compact}
          <span class="label">{$t('editMode.readOnly')}</span>
        {/if}
      {/if}
    </button>
    
    {#if $isDirty && $isEditMode}
      <button 
        class="sync-btn"
        onclick={handleSync}
        disabled={isSyncing}
        title="Sync changes"
      >
        <Save class="h-4 w-4" />
        {#if !compact}
          <span>Sync</span>
        {/if}
      </button>
    {/if}
  </div>
{/if}

{#if showConfirmDisable}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="confirm-overlay" onclick={handleCancelDisable} role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="confirm-dialog" onclick={(e) => e.stopPropagation()} role="none">
      <div class="confirm-icon">
        <AlertCircle class="h-8 w-8" />
      </div>
      <h3>Unsaved Changes</h3>
      <p>You have {$changeCount} unsaved change{$changeCount !== 1 ? 's' : ''}. Disabling edit mode will discard them.</p>
      <div class="confirm-actions">
        <button class="btn btn-secondary" onclick={handleCancelDisable}>
          Keep Editing
        </button>
        <button class="btn btn-danger" onclick={handleConfirmDisable}>
          Discard Changes
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .edit-mode-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .toggle-btn.active {
    background: rgba(245, 158, 11, 0.15);
    border-color: #f59e0b;
    color: #f59e0b;
  }

  .toggle-btn.active:hover {
    background: rgba(245, 158, 11, 0.25);
  }

  .toggle-btn.dirty {
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(245, 158, 11, 0);
    }
  }

  .compact .toggle-btn {
    padding: 0.375rem 0.5rem;
  }

  .label {
    white-space: nowrap;
  }

  .badge {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    background: #f59e0b;
    color: #000;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 9px;
  }

  /* Sync Button */
  .sync-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid #22c55e;
    border-radius: 6px;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .sync-btn:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.25);
  }

  .sync-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .compact .sync-btn {
    padding: 0.375rem 0.5rem;
  }

  /* Confirm Dialog */
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    padding: 1rem;
  }

  .confirm-dialog {
    max-width: 400px;
    width: 100%;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem;
    text-align: center;
  }

  .confirm-icon {
    margin-bottom: 1rem;
    color: #f59e0b;
  }

  .confirm-dialog h3 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--foreground);
  }

  .confirm-dialog p {
    margin: 0 0 1.25rem;
    font-size: 0.9rem;
    color: var(--muted-foreground);
  }

  .confirm-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .btn {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--foreground);
  }

  .btn-secondary:hover {
    background: var(--accent);
  }

  .btn-danger {
    background: #ef4444;
    border: 1px solid #ef4444;
    color: white;
  }

  .btn-danger:hover {
    background: #dc2626;
    border-color: #dc2626;
  }
</style>

