<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { computePosition, flip, shift, offset } from '@floating-ui/dom';
  import { cn } from '$lib/utils';

  interface Props {
    open?: boolean;
    x?: number;
    y?: number;
    onClose?: () => void;
    class?: string;
    children?: import('svelte').Snippet;
  }

  let {
    open = $bindable(false),
    x = 0,
    y = 0,
    onClose,
    class: className,
    children,
  }: Props = $props();

  let menuRef = $state<HTMLDivElement | null>(null);

  // Position the menu
  $effect(() => {
    if (open && menuRef) {
      // Create virtual element at click position
      const virtualEl = {
        getBoundingClientRect: () => ({
          width: 0,
          height: 0,
          x,
          y,
          top: y,
          left: x,
          right: x,
          bottom: y,
        }),
      };

      computePosition(virtualEl, menuRef, {
        placement: 'bottom-start',
        middleware: [offset(4), flip(), shift({ padding: 8 })],
      }).then(({ x: posX, y: posY }) => {
        if (menuRef) {
          menuRef.style.left = `${posX}px`;
          menuRef.style.top = `${posY}px`;
        }
      });
    }
  });

  // Close on click outside
  function handleClickOutside(event: MouseEvent) {
    if (menuRef && !menuRef.contains(event.target as Node)) {
      open = false;
      onClose?.();
    }
  }

  // Close on escape
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      open = false;
      onClose?.();
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if open}
  <div
    bind:this={menuRef}
    class={cn(
      'fixed z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
      className
    )}
    role="menu"
  >
    {@render children?.()}
  </div>
{/if}

