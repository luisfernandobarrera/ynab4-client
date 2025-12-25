<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2, FolderOpen, AlertCircle, RefreshCw } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
  import { BudgetLoader, type DropboxBudget } from '$lib/services';
  import { loadFromDropbox, isLoading } from '$lib/stores/budget';
  import { addToast } from '$lib/stores/ui';

  interface Props {
    accessToken: string;
    onClose?: () => void;
  }

  let { accessToken, onClose }: Props = $props();

  let budgets = $state<DropboxBudget[]>([]);
  let loadingList = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    await loadBudgetList();
  });

  async function loadBudgetList() {
    loadingList = true;
    error = null;

    try {
      budgets = await BudgetLoader.listDropboxBudgets(accessToken);
      if (budgets.length === 0) {
        error = 'No YNAB4 budgets found in Dropbox';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to list budgets';
    } finally {
      loadingList = false;
    }
  }

  async function selectBudget(budget: DropboxBudget) {
    try {
      await loadFromDropbox(accessToken, budget.path);
      addToast({ type: 'success', message: `Loaded: ${budget.name}` });
      onClose?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load budget';
      addToast({ type: 'error', message });
    }
  }
</script>

<Card class="max-w-md mx-auto">
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <FolderOpen class="h-5 w-5" />
      Select Budget
    </CardTitle>
  </CardHeader>
  <CardContent class="space-y-4">
    {#if loadingList}
      <div class="flex items-center justify-center py-8">
        <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    {:else if error}
      <div class="flex flex-col items-center gap-4 py-8 text-center">
        <AlertCircle class="h-8 w-8 text-destructive" />
        <p class="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onclick={loadBudgetList}>
          <RefreshCw class="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    {:else}
      <div class="space-y-2">
        {#each budgets as budget (budget.path)}
          <button
            class="flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-accent disabled:opacity-50"
            onclick={() => selectBudget(budget)}
            disabled={$isLoading}
          >
            <div>
              <p class="font-medium">{budget.name}</p>
              <p class="text-xs text-muted-foreground">{budget.path}</p>
            </div>
            {#if $isLoading}
              <Loader2 class="h-4 w-4 animate-spin" />
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="flex justify-end pt-4">
      <Button variant="outline" onclick={onClose}>
        Cancel
      </Button>
    </div>
  </CardContent>
</Card>

