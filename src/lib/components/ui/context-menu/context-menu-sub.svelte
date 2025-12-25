<script lang="ts">
  import { cn } from '$lib/utils';
  import { ChevronRight } from 'lucide-svelte';

  interface Props {
    label: string;
    class?: string;
    children?: import('svelte').Snippet;
  }

  let { label, class: className, children }: Props = $props();

  let showSub = $state(false);
</script>

<div
  class="relative"
  role="none"
  onmouseenter={() => (showSub = true)}
  onmouseleave={() => (showSub = false)}
>
  <button
    class={cn(
      'relative flex w-full cursor-pointer select-none items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
      'hover:bg-accent hover:text-accent-foreground',
      className
    )}
    role="menuitem"
    aria-haspopup="true"
    aria-expanded={showSub}
  >
    {label}
    <ChevronRight class="h-4 w-4" />
  </button>

  {#if showSub}
    <div
      class="absolute left-full top-0 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      role="menu"
    >
      {@render children?.()}
    </div>
  {/if}
</div>

