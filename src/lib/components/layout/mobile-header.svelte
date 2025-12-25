<script lang="ts">
  import { Menu, Plus } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { sidebarOpen } from '$lib/stores/ui';
  import { budgetInfo } from '$lib/stores/budget';

  interface Props {
    onAddClick?: () => void;
  }

  let { onAddClick }: Props = $props();
</script>

<header class="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 md:hidden">
  <!-- Menu button -->
  <Button variant="ghost" size="icon" onclick={() => sidebarOpen.set(true)}>
    <Menu class="h-5 w-5" />
    <span class="sr-only">Toggle sidebar</span>
  </Button>

  <!-- Budget name -->
  <h1 class="flex-1 truncate font-heading text-lg font-semibold">
    {$budgetInfo.budgetName || 'YNAB4 Client'}
  </h1>

  <!-- Add button -->
  {#if onAddClick}
    <Button variant="ghost" size="icon" onclick={onAddClick}>
      <Plus class="h-5 w-5" />
      <span class="sr-only">Add transaction</span>
    </Button>
  {/if}
</header>

