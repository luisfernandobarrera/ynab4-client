<script lang="ts">
  import { X, FileText, Trash2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { t } from '$lib/i18n';

  interface CategoryInfo {
    id: string;
    name: string;
    masterCategoryId: string;
    masterCategoryName: string;
    monthKey: string;
    note?: string;
  }

  interface Props {
    open?: boolean;
    category?: CategoryInfo | null;
    onClose?: () => void;
  }

  let { open = $bindable(false), category = null, onClose }: Props = $props();

  // Form state
  let noteText = $state('');

  // Reset when opened
  $effect(() => {
    if (open && category) {
      noteText = category.note || '';
    }
  });

  function handleSave() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      return;
    }

    if (!category) return;

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
        note: noteText.trim() || null,
      },
    });

    addToast({
      type: 'success',
      message: $t('budget.noteSaved'),
    });

    handleClose();
  }

  function handleDelete() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      return;
    }

    if (!category) return;

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
        note: null,
      },
    });

    addToast({
      type: 'success',
      message: $t('budget.noteDeleted'),
    });

    handleClose();
  }

  function handleClose() {
    open = false;
    onClose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  }
</script>

{#if open && category}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="note-dialog-title"
    onkeydown={handleKeydown}
  >
    <Card class="w-full max-w-md">
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle id="note-dialog-title" class="flex items-center gap-2">
            <FileText class="h-5 w-5" />
            {$t('budget.noteFor', { name: category.name })}
          </CardTitle>
          <Button variant="ghost" size="icon" onclick={handleClose}>
            <X class="h-5 w-5" />
          </Button>
        </div>
        <p class="text-sm text-muted-foreground mt-1">
          {category.masterCategoryName} - {category.monthKey}
        </p>
      </CardHeader>

      <CardContent>
        <textarea
          class="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          placeholder={$t('budget.notePlaceholder')}
          bind:value={noteText}
          disabled={!$isEditMode}
        ></textarea>
        {#if !$isEditMode}
          <p class="text-xs text-muted-foreground mt-2">
            {$t('common.enableEditMode')}
          </p>
        {/if}
      </CardContent>

      <CardFooter class="flex justify-between">
        <div>
          {#if category.note && $isEditMode}
            <Button variant="destructive" size="sm" onclick={handleDelete}>
              <Trash2 class="h-4 w-4 mr-1" />
              {$t('budget.deleteNote')}
            </Button>
          {/if}
        </div>
        <div class="flex gap-2">
          <Button variant="outline" onclick={handleClose}>
            {$t('common.cancel')}
          </Button>
          <Button onclick={handleSave} disabled={!$isEditMode}>
            {$t('budget.saveNote')}
          </Button>
        </div>
      </CardFooter>
    </Card>
  </div>
{/if}
