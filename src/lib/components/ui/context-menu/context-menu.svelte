<script lang="ts">
  import { onDestroy } from 'svelte';
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

  // Close handlers
  function closeMenu() {
    open = false;
    onClose?.();
  }

  function handleClickOutside(event: MouseEvent) {
    if (menuRef && !menuRef.contains(event.target as Node)) {
      closeMenu();
    }
  }

  function handleContextMenuOutside(event: MouseEvent) {
    // Close if right-clicking outside the menu
    if (menuRef && !menuRef.contains(event.target as Node)) {
      closeMenu();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeMenu();
    }
  }

  function handleScroll() {
    closeMenu();
  }

  // Add/remove event listeners when menu opens/closes
  $effect(() => {
    if (open) {
      // Use setTimeout to avoid the current click event closing the menu immediately
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true);
        document.addEventListener('contextmenu', handleContextMenuOutside, true);
        document.addEventListener('keydown', handleKeydown);
        document.addEventListener('scroll', handleScroll, true);
      }, 0);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
      document.removeEventListener('contextmenu', handleContextMenuOutside, true);
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('scroll', handleScroll, true);
    };
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside, true);
    document.removeEventListener('contextmenu', handleContextMenuOutside, true);
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('scroll', handleScroll, true);
  });
</script>

{#if open}
  <!-- Backdrop to catch clicks -->
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="context-menu-backdrop" onclick={closeMenu}></div>

  <div
    bind:this={menuRef}
    class={cn(
      'context-menu-container fixed z-50 min-w-[160px] overflow-hidden rounded-md border p-1 shadow-lg animate-in fade-in-0 zoom-in-95',
      className
    )}
    role="menu"
  >
    {@render children?.()}
  </div>
{/if}

<style>
  .context-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
  }

  .context-menu-container {
    background-color: var(--popover);
    color: var(--popover-foreground);
    border-color: var(--border);
  }
</style>
