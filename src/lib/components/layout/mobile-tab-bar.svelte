<script lang="ts">
  import { Wallet, Receipt, Calendar, PieChart, Menu } from 'lucide-svelte';
  import { currentView, selectedAccountId } from '$lib/stores/budget';
  import { sidebarOpen } from '$lib/stores/ui';
  import { t } from '$lib/i18n';
  import { cn } from '$lib/utils';

  const tabs = [
    { id: 'budget', labelKey: 'nav.budget', icon: Wallet },
    { id: 'transactions', labelKey: 'nav.accounts', icon: Receipt },
    { id: 'scheduled', labelKey: 'nav.scheduled', icon: Calendar },
    { id: 'reports', labelKey: 'nav.reports', icon: PieChart },
    { id: 'menu', labelKey: 'nav.more', icon: Menu },
  ] as const;

  function handleTabClick(tabId: string) {
    if (tabId === 'menu') {
      sidebarOpen.set(true);
    } else {
      currentView.set(tabId);
      selectedAccountId.set(null);
    }
  }
</script>

<nav class="fixed bottom-0 left-0 right-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
  <div class="flex h-14 items-center justify-around">
    {#each tabs as tab}
      <button
        class={cn(
          'flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] min-h-[44px] transition-colors',
          $currentView === tab.id && tab.id !== 'menu'
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onclick={() => handleTabClick(tab.id)}
      >
        <tab.icon class="h-5 w-5" />
        <span class="text-xs">{$t(tab.labelKey)}</span>
      </button>
    {/each}
  </div>
</nav>

