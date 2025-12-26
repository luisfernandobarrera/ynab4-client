<script lang="ts">
  import { 
    LayoutDashboard, 
    ArrowRightLeft, 
    CheckCircle2, 
    Calendar, 
    TrendingUp, 
    BarChart3,
    Users,
    Upload,
    Settings,
    Home,
    Menu,
    X,
    PlusCircle
  } from 'lucide-svelte';
  import { budgetInfo, currentView, resetBudget } from '$lib/stores/budget';
  import { isMobile } from '$lib/stores/ui';
  import { t } from '$lib/i18n';
  import { EditModeToggle } from '$lib/components/edit-mode';

  interface Props {
    open?: boolean;
    onToggle?: () => void;
  }

  let { open = true, onToggle }: Props = $props();

  const menuItems = $derived([
    { id: 'transactions', icon: ArrowRightLeft, label: $t('nav.transactions') },
    { id: 'budget', icon: LayoutDashboard, label: $t('nav.budget') },
    { id: 'reconciliation', icon: CheckCircle2, label: $t('nav.reconciliation') },
    { id: 'scheduled', icon: Calendar, label: $t('nav.scheduled') },
    { id: 'cashflow', icon: TrendingUp, label: $t('nav.cashFlow') },
    { id: 'reports', icon: BarChart3, label: $t('nav.reports') },
    { id: 'payees', icon: Users, label: $t('nav.payees') },
    { id: 'import', icon: Upload, label: $t('nav.import') },
    { id: 'createAccount', icon: PlusCircle, label: $t('nav.createAccount') },
    { id: 'settings', icon: Settings, label: $t('nav.settings') },
  ]);

  function handleViewChange(view: string) {
    currentView.set(view);
    if ($isMobile) {
      onToggle?.();
    }
  }

  function handleGoHome() {
    resetBudget();
  }

  // Get budget name without data folder
  const budgetName = $derived(
    $budgetInfo.budgetName?.split('~')[0] || 'YNAB4 Client'
  );
</script>

{#if $isMobile && open}
  <div 
    class="sidebar-overlay"
    onclick={onToggle}
    role="presentation"
  ></div>
{/if}

<aside class="sidebar" class:collapsed={!open}>
  <div class="sidebar-header">
    {#if $budgetInfo.client}
      <button 
        class="sidebar-title budget-btn"
        onclick={handleGoHome}
        title={$t('common.home')}
      >
        <span class="budget-name">{budgetName}</span>
        <span class="budget-switch">↺</span>
      </button>
    {:else}
      <h2 class="sidebar-title">YNAB4 Client</h2>
    {/if}
    <button class="hamburger-btn" onclick={onToggle}>
      {#if open}
        <X class="h-5 w-5" />
      {:else}
        <Menu class="h-5 w-5" />
      {/if}
    </button>
  </div>

  {#if $budgetInfo.client}
    <div class="edit-mode-section">
      <EditModeToggle compact={!open} />
    </div>
    
    <nav class="sidebar-nav">
      <ul class="sidebar-menu">
        {#each menuItems as item}
          {@const Icon = item.icon}
          <li>
            <button
              class="sidebar-menu-item"
              class:active={$currentView === item.id}
              onclick={() => handleViewChange(item.id)}
            >
              <span class="menu-icon">
                <Icon class="h-5 w-5" />
              </span>
              <span class="menu-text">{item.label}</span>
            </button>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}

  <div class="sidebar-footer">
    <button class="home-btn" onclick={handleGoHome}>
      <Home class="h-5 w-5" />
      {#if open}
        <span>{$t('common.home')}</span>
      {/if}
    </button>
  </div>
</aside>

<style>
  .sidebar-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.5);
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    width: 240px;
    min-width: 240px;
    height: 100%;
    background: var(--card);
    border-right: 1px solid var(--border);
    transition: all 0.3s ease;
    z-index: 50;
  }

  .sidebar.collapsed {
    width: 60px;
    min-width: 60px;
  }

  .sidebar.collapsed .menu-text,
  .sidebar.collapsed .budget-name,
  .sidebar.collapsed .budget-switch,
  .sidebar.collapsed .home-btn span {
    display: none;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
    min-height: 60px;
  }

  .sidebar-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  .budget-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }

  .budget-name {
    font-size: 1rem;
    font-weight: 700;
    color: var(--foreground);
  }

  .budget-switch {
    font-size: 0.875rem;
    color: var(--muted-foreground);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .budget-btn:hover .budget-switch {
    opacity: 1;
  }

  .hamburger-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.15s;
  }

  .hamburger-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .edit-mode-section {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .sidebar.collapsed .edit-mode-section {
    padding: 0.75rem 0.5rem;
    display: flex;
    justify-content: center;
  }

  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .sidebar-menu {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .sidebar-menu-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .sidebar-menu-item:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .sidebar-menu-item.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .menu-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .menu-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-footer {
    padding: 1rem;
    border-top: 1px solid var(--border);
  }

  .home-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--muted-foreground);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.15s;
  }
  
  .sidebar:not(.collapsed) .home-btn {
    justify-content: flex-start;
  }

  .home-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  /* Mobile */
  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      transform: translateX(0);
    }

    .sidebar.collapsed {
      transform: translateX(-100%);
      width: 240px;
      min-width: 240px;
    }

    .sidebar.collapsed .menu-text,
    .sidebar.collapsed .budget-name,
    .sidebar.collapsed .budget-switch,
    .sidebar.collapsed .home-btn span {
      display: inline;
    }
  }
</style>
