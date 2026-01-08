<script lang="ts">
  import {
    FileText,
    Calculator,
    Eye,
    EyeOff,
    Settings2,
    ArrowUpRight,
    ArrowDownLeft,
    Copy,
    CornerDownRight,
  } from 'lucide-svelte';
  import {
    ContextMenu,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
  } from '$lib/components/ui/context-menu';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { t } from '$lib/i18n';

  interface CategoryInfo {
    id: string;
    name: string;
    masterCategoryId: string;
    masterCategoryName: string;
    budgeted: number;
    activity: number;
    available: number;
    monthKey: string;
    note?: string;
    hidden?: boolean;
    overspendingHandling?: 'Confined' | 'AffectsBuffer' | null;
  }

  interface Props {
    open?: boolean;
    x?: number;
    y?: number;
    category?: CategoryInfo | null;
    onClose?: () => void;
    onShowNote?: (category: CategoryInfo) => void;
    onViewTransactions?: (category: CategoryInfo) => void;
    onQuickBudget?: (category: CategoryInfo, action: string) => void;
  }

  let {
    open = $bindable(false),
    x = 0,
    y = 0,
    category = null,
    onClose,
    onShowNote,
    onViewTransactions,
    onQuickBudget,
  }: Props = $props();

  function closeMenu() {
    open = false;
    onClose?.();
  }

  // View transactions for this category
  function handleViewTransactions() {
    if (category && onViewTransactions) {
      onViewTransactions(category);
    }
    closeMenu();
  }

  // Quick budget actions
  function handleBudgetLastMonth() {
    if (category && onQuickBudget) {
      onQuickBudget(category, 'lastMonth');
    }
    closeMenu();
  }

  function handleBudgetAverage() {
    if (category && onQuickBudget) {
      onQuickBudget(category, 'average');
    }
    closeMenu();
  }

  function handleBudgetGoal() {
    if (category && onQuickBudget) {
      onQuickBudget(category, 'goal');
    }
    closeMenu();
  }

  function handleCoverOverspending() {
    if (category && onQuickBudget) {
      onQuickBudget(category, 'coverOverspending');
    }
    closeMenu();
  }

  function handleZeroBudget() {
    if (category && onQuickBudget) {
      onQuickBudget(category, 'zero');
    }
    closeMenu();
  }

  // Toggle overspending handling (Confined vs AffectsBuffer)
  function handleToggleOverspending() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      closeMenu();
      return;
    }

    if (category) {
      const newHandling = category.overspendingHandling === 'Confined'
        ? 'AffectsBuffer'
        : 'Confined';

      // Create the monthly budget entity ID
      const [year, month] = category.monthKey.split('-');
      const monthlyBudgetId = `MCB/${year}-${month}-01/${category.id}`;

      addPendingChange({
        type: 'monthlyCategoryBudget',
        action: 'update',
        entityId: monthlyBudgetId,
        entityName: category.name,
        data: {
          entityId: monthlyBudgetId,
          categoryId: category.id,
          overspendingHandling: newHandling,
        },
      });

      addToast({
        type: 'success',
        message: newHandling === 'Confined'
          ? $t('budget.overspendingConfined', { name: category.name })
          : $t('budget.overspendingAffectsBuffer', { name: category.name }),
      });
    }
    closeMenu();
  }

  // Show/edit note
  function handleShowNote() {
    if (category && onShowNote) {
      onShowNote(category);
    }
    closeMenu();
  }

  // Toggle category hidden state
  function handleToggleHidden() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      closeMenu();
      return;
    }

    if (category) {
      addPendingChange({
        type: 'category',
        action: 'update',
        entityId: category.id,
        entityName: category.name,
        data: {
          entityId: category.id,
          hidden: !category.hidden,
        },
      });

      addToast({
        type: 'success',
        message: category.hidden
          ? $t('budget.categoryShown', { name: category.name })
          : $t('budget.categoryHidden', { name: category.name }),
      });
    }
    closeMenu();
  }

  // Computed: Is category overspent?
  const isOverspent = $derived(category && category.available < -0.01);
</script>

<ContextMenu bind:open {x} {y} {onClose}>
  {#if category}
    <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground truncate max-w-[200px]">
      {category.name}
    </div>
    <div class="px-2 py-0.5 text-[10px] text-muted-foreground">
      {category.masterCategoryName}
    </div>

    <ContextMenuSeparator />

    <!-- View Transactions -->
    <ContextMenuItem onclick={handleViewTransactions}>
      <ArrowDownLeft class="mr-2 h-4 w-4" />
      {$t('budget.viewTransactions')}
    </ContextMenuItem>

    <ContextMenuSeparator />

    <!-- Quick Budget Actions -->
    <ContextMenuSub label={$t('budget.quickBudget')}>
      <ContextMenuItem onclick={handleBudgetLastMonth} disabled={!$isEditMode}>
        <Copy class="mr-2 h-4 w-4" />
        {$t('budget.budgetLastMonth')}
      </ContextMenuItem>
      <ContextMenuItem onclick={handleBudgetAverage} disabled={!$isEditMode}>
        <Calculator class="mr-2 h-4 w-4" />
        {$t('budget.budgetAverage')}
      </ContextMenuItem>
      <ContextMenuItem onclick={handleZeroBudget} disabled={!$isEditMode}>
        <ArrowDownLeft class="mr-2 h-4 w-4" />
        {$t('budget.budgetZero')}
      </ContextMenuItem>
    </ContextMenuSub>

    <!-- Cover Overspending (only if overspent) -->
    {#if isOverspent}
      <ContextMenuItem onclick={handleCoverOverspending} disabled={!$isEditMode}>
        <ArrowUpRight class="mr-2 h-4 w-4" />
        {$t('budget.coverOverspending')}
      </ContextMenuItem>
    {/if}

    <ContextMenuSeparator />

    <!-- Toggle Overspending Handling -->
    {#if isOverspent}
      <ContextMenuItem onclick={handleToggleOverspending} disabled={!$isEditMode}>
        <CornerDownRight class="mr-2 h-4 w-4" />
        {#if category.overspendingHandling === 'Confined'}
          {$t('budget.makeOverspendingAffectATB')}
        {:else}
          {$t('budget.makeOverspendingRollover')}
        {/if}
      </ContextMenuItem>
    {/if}

    <!-- Note -->
    <ContextMenuItem onclick={handleShowNote}>
      <FileText class="mr-2 h-4 w-4" />
      {#if category.note}
        {$t('budget.viewNote')}
      {:else}
        {$t('budget.addNote')}
      {/if}
    </ContextMenuItem>

    <ContextMenuSeparator />

    <!-- Hide/Show Category -->
    <ContextMenuItem onclick={handleToggleHidden} disabled={!$isEditMode}>
      {#if category.hidden}
        <Eye class="mr-2 h-4 w-4" />
        {$t('budget.showCategory')}
      {:else}
        <EyeOff class="mr-2 h-4 w-4" />
        {$t('budget.hideCategory')}
      {/if}
    </ContextMenuItem>
  {/if}
</ContextMenu>
