<script lang="ts">
  import { cn } from '$lib/utils';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLButtonElement> {
    disabled?: boolean;
    destructive?: boolean;
    class?: string;
    children?: import('svelte').Snippet;
  }

  let {
    disabled = false,
    destructive = false,
    class: className,
    children,
    ...restProps
  }: Props = $props();
</script>

<button
  class={cn(
    'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
    'hover:bg-accent hover:text-accent-foreground',
    'focus:bg-accent focus:text-accent-foreground',
    disabled && 'pointer-events-none opacity-50',
    destructive && 'text-destructive hover:bg-destructive/10 hover:text-destructive',
    className
  )}
  role="menuitem"
  {disabled}
  {...restProps}
>
  {@render children?.()}
</button>

