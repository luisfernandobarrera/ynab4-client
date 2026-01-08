<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, Zap, ClipboardCopy, Receipt, TrendingUp, TrendingDown, Target, CircleOff, ChevronRight } from 'lucide-svelte';
  import { formatCurrency } from '$lib/utils';
  import {
    type QuickBudgetOption,
    QUICK_BUDGET_LABELS,
  } from '$lib/services/quick-budget';

  interface Props {
    visible: boolean;
    x: number;
    y: number;
    categoryName: string;
    categoryId: string;
    // Preview values for each option
    preview: Record<QuickBudgetOption, number>;
    currentBudgeted: number;
    onSelect?: (option: QuickBudgetOption, value: number) => void;
    onClose?: () => void;
  }

  let {
    visible = false,
    x = 0,
    y = 0,
    categoryName = '',
    categoryId = '',
    preview = {} as Record<QuickBudgetOption, number>,
    currentBudgeted = 0,
    onSelect,
    onClose,
  }: Props = $props();

  // Menu options with icons
  const menuOptions: { option: QuickBudgetOption; icon: typeof Zap; color?: string }[] = [
    { option: 'budgetedLastMonth', icon: ClipboardCopy },
    { option: 'spentLastMonth', icon: Receipt },
    { option: 'averageSpent', icon: TrendingUp },
    { option: 'averageBudgeted', icon: TrendingDown },
    { option: 'underfunded', icon: Target, color: 'text-red-500' },
    { option: 'goalAmount', icon: Target, color: 'text-blue-500' },
    { option: 'zero', icon: CircleOff, color: 'text-muted-foreground' },
  ];

  function handleSelect(option: QuickBudgetOption) {
    const value = preview[option] ?? 0;
    onSelect?.(option, value);
    onClose?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose?.();
    }
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.quick-budget-menu')) {
      onClose?.();
    }
  }

  // Format difference from current
  function formatDiff(value: number): string {
    const diff = value - currentBudgeted;
    if (diff === 0) return '';
    const sign = diff > 0 ? '+' : '';
    return `(${sign}${formatCurrency(diff)})`;
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

{#if visible}
  <div
    class="quick-budget-menu fixed z-50 min-w-[280px] bg-popover border rounded-lg shadow-xl overflow-hidden"
    style="left: {x}px; top: {y}px;"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
      <div class="flex items-center gap-2">
        <Zap class="h-4 w-4 text-primary" />
        <span class="font-medium text-sm">QuickBudget</span>
      </div>
      <button
        class="p-1 rounded hover:bg-muted transition-colors"
        onclick={() => onClose?.()}
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Category name -->
    <div class="px-3 py-2 border-b bg-background">
      <div class="text-xs text-muted-foreground">Categoría</div>
      <div class="font-medium truncate">{categoryName}</div>
      <div class="text-xs text-muted-foreground mt-1">
        Actual: <span class="amount">{formatCurrency(currentBudgeted)}</span>
      </div>
    </div>

    <!-- Options -->
    <div class="py-1">
      {#each menuOptions as { option, icon: Icon, color }}
        {@const value = preview[option] ?? 0}
        {@const isZero = value === 0 && option !== 'zero'}
        {@const isSame = value === currentBudgeted}

        <button
          class="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors {isZero ? 'opacity-50' : ''}"
          onclick={() => handleSelect(option)}
          disabled={isZero && option !== 'zero'}
        >
          <Icon class="h-4 w-4 shrink-0 {color || ''}" />
          <span class="flex-1 text-left">{QUICK_BUDGET_LABELS[option]}</span>
          <span class="amount font-medium {isSame ? 'text-muted-foreground' : ''}">
            {formatCurrency(value)}
          </span>
          {#if !isZero && !isSame}
            <span class="text-xs {value > currentBudgeted ? 'text-green-500' : 'text-red-500'}">
              {formatDiff(value)}
            </span>
          {/if}
          <ChevronRight class="h-3 w-3 opacity-40" />
        </button>
      {/each}
    </div>

    <!-- Keyboard hint -->
    <div class="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
      <kbd class="px-1 py-0.5 bg-muted rounded">Esc</kbd> para cerrar
    </div>
  </div>
{/if}

<style>
  .quick-budget-menu {
    animation: menu-appear 0.15s ease-out;
  }

  @keyframes menu-appear {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-4px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
