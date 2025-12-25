<script lang="ts">
  import { ChevronLeft, ChevronRight, Plus, Minus } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { masterCategories, selectedMonth, categories } from '$lib/stores/budget';
  import { isMobile } from '$lib/stores/ui';
  import { cn, formatCurrency } from '$lib/utils';

  // Month navigation
  function previousMonth() {
    selectedMonth.update((m) => {
      const date = new Date(m + '-01');
      date.setMonth(date.getMonth() - 1);
      return date.toISOString().substring(0, 7);
    });
  }

  function nextMonth() {
    selectedMonth.update((m) => {
      const date = new Date(m + '-01');
      date.setMonth(date.getMonth() + 1);
      return date.toISOString().substring(0, 7);
    });
  }

  function formatMonth(monthStr: string): string {
    const date = new Date(monthStr + '-01');
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  // Calculate totals
  const totals = $derived(() => {
    let budgeted = 0;
    let activity = 0;
    let available = 0;

    for (const cat of $categories) {
      budgeted += cat.budgeted;
      activity += cat.activity;
      available += cat.balance;
    }

    return { budgeted, activity, available };
  });
</script>

<div class="flex flex-col h-full">
  <!-- Month Header -->
  <div class="sticky top-0 z-10 bg-background border-b p-4">
    <div class="flex items-center justify-between">
      <Button variant="ghost" size="icon" onclick={previousMonth}>
        <ChevronLeft class="h-5 w-5" />
      </Button>
      <h2 class="text-xl font-heading font-semibold">
        {formatMonth($selectedMonth)}
      </h2>
      <Button variant="ghost" size="icon" onclick={nextMonth}>
        <ChevronRight class="h-5 w-5" />
      </Button>
    </div>

    <!-- Totals row (desktop) -->
    {#if !$isMobile}
      <div class="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
        <div>
          <p class="text-muted-foreground">Budgeted</p>
          <p class="amount font-semibold">{formatCurrency(totals().budgeted)}</p>
        </div>
        <div>
          <p class="text-muted-foreground">Activity</p>
          <p class="amount font-semibold">{formatCurrency(totals().activity)}</p>
        </div>
        <div>
          <p class="text-muted-foreground">Available</p>
          <p class={cn('amount font-semibold', totals().available >= 0 ? 'text-ynab-green' : 'text-ynab-red')}>
            {formatCurrency(totals().available)}
          </p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Categories List -->
  <div class="flex-1 overflow-y-auto">
    {#if $masterCategories.length === 0}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground">No categories found</p>
      </div>
    {:else}
      <div class="divide-y">
        {#each $masterCategories as masterCategory (masterCategory.entityId)}
          <!-- Master Category Header -->
          <div class="sticky top-0 bg-muted/50 backdrop-blur px-4 py-2">
            <h3 class="text-sm font-semibold text-muted-foreground uppercase">
              {masterCategory.name}
            </h3>
          </div>

          <!-- Categories -->
          {#each masterCategory.categories as category (category.entityId)}
            <div
              class="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer"
            >
              <span class="flex-1 truncate">{category.name}</span>
              
              {#if $isMobile}
                <!-- Mobile: Just show available -->
                <span
                  class={cn(
                    'amount font-medium',
                    category.balance >= 0 ? 'text-ynab-green' : 'text-ynab-red'
                  )}
                >
                  {formatCurrency(category.balance)}
                </span>
              {:else}
                <!-- Desktop: Show all columns -->
                <div class="flex items-center gap-6 text-sm">
                  <span class="amount w-24 text-right">
                    {formatCurrency(category.budgeted)}
                  </span>
                  <span class="amount w-24 text-right text-muted-foreground">
                    {formatCurrency(category.activity)}
                  </span>
                  <span
                    class={cn(
                      'amount w-24 text-right font-medium',
                      category.balance >= 0 ? 'text-ynab-green' : 'text-ynab-red'
                    )}
                  >
                    {formatCurrency(category.balance)}
                  </span>
                </div>
              {/if}
            </div>
          {/each}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Desktop Column Headers -->
  {#if !$isMobile && $masterCategories.length > 0}
    <div class="sticky bottom-0 border-t bg-background px-4 py-2">
      <div class="flex items-center justify-end gap-6 text-xs text-muted-foreground">
        <span class="w-24 text-right">BUDGETED</span>
        <span class="w-24 text-right">ACTIVITY</span>
        <span class="w-24 text-right">AVAILABLE</span>
      </div>
    </div>
  {/if}
</div>

