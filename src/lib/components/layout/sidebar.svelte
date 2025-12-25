<script lang="ts">
  import { X, Wallet, Receipt, Calendar, PieChart, Settings, FolderOpen } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Separator } from '$lib/components/ui/separator';
  import { sidebarOpen, isMobile } from '$lib/stores/ui';
  import { budgetInfo, onBudgetAccounts, offBudgetAccounts, currentView, selectedAccountId } from '$lib/stores/budget';
  import { cn, formatCurrency } from '$lib/utils';

  function handleNavClick(view: string) {
    currentView.set(view);
    selectedAccountId.set(null);
    if ($isMobile) {
      sidebarOpen.set(false);
    }
  }

  function handleAccountClick(accountId: string) {
    currentView.set('transactions');
    selectedAccountId.set(accountId);
    if ($isMobile) {
      sidebarOpen.set(false);
    }
  }

  const navItems = [
    { id: 'budget', label: 'Budget', icon: Wallet },
    { id: 'transactions', label: 'All Accounts', icon: Receipt },
    { id: 'scheduled', label: 'Scheduled', icon: Calendar },
    { id: 'reports', label: 'Reports', icon: PieChart },
  ] as const;
</script>

<!-- Overlay for mobile -->
{#if $isMobile && $sidebarOpen}
  <div
    class="fixed inset-0 z-40 bg-black/60"
    onclick={() => sidebarOpen.set(false)}
    onkeydown={(e) => e.key === 'Escape' && sidebarOpen.set(false)}
    role="button"
    tabindex="-1"
  ></div>
{/if}

<!-- Sidebar -->
<aside
  class={cn(
    'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card border-r transition-transform duration-300 md:static md:translate-x-0',
    $sidebarOpen ? 'translate-x-0' : '-translate-x-full'
  )}
>
  <!-- Header -->
  <div class="flex h-14 items-center justify-between border-b px-4">
    <h2 class="font-heading text-lg font-semibold truncate">
      {$budgetInfo.budgetName || 'Select Budget'}
    </h2>
    {#if $isMobile}
      <Button variant="ghost" size="icon" onclick={() => sidebarOpen.set(false)}>
        <X class="h-5 w-5" />
      </Button>
    {/if}
  </div>

  <!-- Navigation -->
  <nav class="flex-1 overflow-y-auto p-4 space-y-6">
    <!-- Main navigation -->
    <div class="space-y-1">
      {#each navItems as item}
        <button
          class={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            $currentView === item.id
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-accent hover:text-accent-foreground'
          )}
          onclick={() => handleNavClick(item.id)}
        >
          <item.icon class="h-4 w-4" />
          {item.label}
        </button>
      {/each}
    </div>

    <Separator />

    <!-- On Budget Accounts -->
    {#if $onBudgetAccounts.length > 0}
      <div>
        <h3 class="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
          Budget
        </h3>
        <div class="space-y-1">
          {#each $onBudgetAccounts as account}
            <button
              class={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                $selectedAccountId === account.id
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
              onclick={() => handleAccountClick(account.id)}
            >
              <span class="truncate">{account.name}</span>
              <span class={cn('amount text-xs', account.balance >= 0 ? 'text-ynab-green' : 'text-ynab-red')}>
                {formatCurrency(account.balance)}
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Off Budget Accounts -->
    {#if $offBudgetAccounts.length > 0}
      <div>
        <h3 class="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
          Tracking
        </h3>
        <div class="space-y-1">
          {#each $offBudgetAccounts as account}
            <button
              class={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                $selectedAccountId === account.id
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
              onclick={() => handleAccountClick(account.id)}
            >
              <span class="truncate">{account.name}</span>
              <span class="amount text-xs text-muted-foreground">
                {formatCurrency(account.balance)}
              </span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </nav>

  <!-- Footer -->
  <div class="border-t p-4 space-y-2">
    <Button variant="outline" class="w-full justify-start gap-2" onclick={() => handleNavClick('open')}>
      <FolderOpen class="h-4 w-4" />
      Open Budget
    </Button>
    <Button variant="ghost" class="w-full justify-start gap-2" onclick={() => handleNavClick('settings')}>
      <Settings class="h-4 w-4" />
      Settings
    </Button>
  </div>
</aside>

