<script lang="ts">
  import { AlertTriangle, X } from 'lucide-svelte';
  import { t } from '$lib/i18n';
  import { showEditModeWarning, enableEditMode, cancelEditModeRequest } from '$lib/stores/ui';

  function handleEnable() {
    enableEditMode();
  }

  function handleCancel() {
    cancelEditModeRequest();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleCancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $showEditModeWarning}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-overlay" onclick={handleCancel} role="dialog" aria-modal="true" tabindex="-1">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal-content" onclick={(e) => e.stopPropagation()} role="none">
      <button class="modal-close" onclick={handleCancel} aria-label={$t('common.close')}>
        <X class="h-4 w-4" />
      </button>
      
      <div class="modal-icon">
        <AlertTriangle class="h-12 w-12" />
      </div>
      
      <h2 class="modal-title">{$t('editMode.warningTitle')}</h2>
      
      <p class="modal-text">{$t('editMode.warningText')}</p>
      
      <ul class="warning-list">
        <li>{$t('editMode.warningItem1')}</li>
        <li>{$t('editMode.warningItem2')}</li>
        <li>{$t('editMode.warningItem3')}</li>
      </ul>
      
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={handleCancel}>
          {$t('common.cancel')}
        </button>
        <button class="btn btn-primary" onclick={handleEnable}>
          {$t('editMode.enableEditMode')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    padding: 1rem;
  }

  .modal-content {
    position: relative;
    max-width: 480px;
    width: 100%;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 2rem;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .modal-close:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .modal-icon {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
    color: #f59e0b;
  }

  .modal-title {
    margin: 0 0 1rem;
    font-size: 1.25rem;
    font-weight: 600;
    text-align: center;
    color: var(--foreground);
  }

  .modal-text {
    margin: 0 0 1rem;
    font-size: 0.9rem;
    color: var(--muted-foreground);
    text-align: center;
    line-height: 1.5;
  }

  .warning-list {
    margin: 0 0 1.5rem;
    padding: 1rem 1rem 1rem 2rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    list-style: disc;
  }

  .warning-list li {
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    color: var(--foreground);
  }

  .warning-list li:last-child {
    margin-bottom: 0;
  }

  .modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }

  .btn {
    padding: 0.625rem 1.25rem;
    font-size: 0.9rem;
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

  .btn-primary {
    background: #f59e0b;
    border: 1px solid #f59e0b;
    color: #000;
  }

  .btn-primary:hover {
    background: #d97706;
    border-color: #d97706;
  }
</style>

