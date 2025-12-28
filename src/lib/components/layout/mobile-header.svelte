<script lang="ts">
  import { Menu, LayoutList, Calendar } from 'lucide-svelte';
  import { ThemeToggle } from '$lib/components/settings';
  import { budgetInfo, currentView } from '$lib/stores/budget';
  import { t } from '$lib/i18n';

  interface Props {
    onMenuClick?: () => void;
    onAccountsClick?: () => void;
    showAccountsPanel?: boolean;
  }

  let { onMenuClick, onAccountsClick, showAccountsPanel = false }: Props = $props();

  const viewLabels = $derived<Record<string, string>>({
    transactions: $t('nav.transactions'),
    budget: $t('nav.budget'),
    reconciliation: $t('nav.reconciliation'),
    scheduled: $t('nav.scheduled'),
    cashflow: $t('nav.cashFlow'),
    reports: $t('nav.reports'),
    payees: $t('nav.payees'),
    import: $t('nav.import'),
    settings: $t('nav.settings'),
  });

  const budgetName = $derived(
    $budgetInfo.budgetName?.split('~')[0] || 'YNAB4 Client'
  );
</script>

<header class="mobile-header">
  <div class="header-left">
    <button class="menu-btn" onclick={onMenuClick}>
      <Menu class="h-5 w-5" />
    </button>
    <div class="header-breadcrumb">
      <span class="header-view">{viewLabels[$currentView] || budgetName}</span>
    </div>
  </div>
  
  <div class="header-actions">
    {#if $budgetInfo.client && $currentView === 'transactions'}
      <button 
        class="action-btn"
        class:active={showAccountsPanel}
        onclick={onAccountsClick}
      >
        <LayoutList class="h-5 w-5" />
      </button>
    {/if}
    <ThemeToggle compact />
  </div>
</header>

<style>
  .mobile-header {
    display: none;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    min-height: 56px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    background: transparent;
    color: var(--foreground);
    cursor: pointer;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .menu-btn:hover {
    background: var(--accent);
  }

  .header-breadcrumb {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .header-view {
    font-weight: 600;
    font-size: 1rem;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 8px;
  }

  .action-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .action-btn.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  @media (max-width: 768px) {
    .mobile-header {
      display: flex;
    }
  }
</style>
