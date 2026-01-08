<script lang="ts">
  import { Users, CreditCard, Smartphone, FolderTree, X, Info } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import PayeesView from '$lib/components/payees/payees-view.svelte';
  import AccountsPanel from '$lib/components/accounts/accounts-panel.svelte';
  import DevicesPanel from './devices-panel.svelte';
  import CategoriesPanel from './categories-panel.svelte';
  import BudgetInfoPanel from './budget-info-panel.svelte';

  interface Props {
    visible?: boolean;
    onClose?: () => void;
  }

  let { visible = false, onClose }: Props = $props();

  type TabId = 'info' | 'payees' | 'accounts' | 'devices' | 'categories';

  let activeTab = $state<TabId>('info');

  const tabs: { id: TabId; label: string; icon: typeof Users }[] = [
    { id: 'info', label: 'Info', icon: Info },
    { id: 'payees', label: 'Beneficiarios', icon: Users },
    { id: 'accounts', label: 'Cuentas', icon: CreditCard },
    { id: 'devices', label: 'Dispositivos', icon: Smartphone },
    { id: 'categories', label: 'Categorías', icon: FolderTree },
  ];

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visible}
  <div class="management-panel-overlay">
    <div class="management-panel">
      <!-- Header -->
      <div class="panel-header">
        <h2>Gestión</h2>
        <Button variant="ghost" size="icon" onclick={() => onClose?.()}>
          <X class="h-4 w-4" />
        </Button>
      </div>

      <!-- Tabs -->
      <div class="panel-tabs">
        {#each tabs as tab}
          {@const Icon = tab.icon}
          <button
            class="panel-tab"
            class:active={activeTab === tab.id}
            onclick={() => activeTab = tab.id}
          >
            <Icon class="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        {/each}
      </div>

      <!-- Content -->
      <div class="panel-content">
        {#if activeTab === 'info'}
          <BudgetInfoPanel />
        {:else if activeTab === 'payees'}
          <PayeesView />
        {:else if activeTab === 'accounts'}
          <AccountsPanel />
        {:else if activeTab === 'devices'}
          <DevicesPanel />
        {:else if activeTab === 'categories'}
          <CategoriesPanel />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .management-panel-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    padding: 1rem;
  }

  .management-panel {
    width: 100%;
    max-width: 900px;
    height: 85vh;
    max-height: 700px;
    display: flex;
    flex-direction: column;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--card));
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .panel-tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    background: hsl(var(--muted) / 0.5);
    border-bottom: 1px solid hsl(var(--border));
  }

  .panel-tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    background: transparent;
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .panel-tab:hover {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }

  .panel-tab.active {
    background: hsl(var(--background));
    color: hsl(var(--primary));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .panel-content {
    flex: 1;
    overflow: hidden;
  }

  /* Override child component styles to fit in panel */
  .panel-content :global(.budget-info-panel),
  .panel-content :global(.payees-view),
  .panel-content :global(.accounts-panel),
  .panel-content :global(.devices-panel),
  .panel-content :global(.categories-panel) {
    height: 100%;
  }

  /* Mobile adjustments */
  @media (max-width: 768px) {
    .management-panel-overlay {
      padding: 0;
    }

    .management-panel {
      max-width: 100%;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }

    .panel-tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .panel-tabs::-webkit-scrollbar {
      display: none;
    }

    .panel-tab {
      white-space: nowrap;
    }
  }
</style>
