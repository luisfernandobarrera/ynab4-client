<script lang="ts">
  import { Delete } from 'lucide-svelte';
  import { cn } from '$lib/utils';

  interface Props {
    value: string;
    onInput: (value: string) => void;
    onSubmit?: () => void;
    maxLength?: number;
    allowDecimal?: boolean;
    class?: string;
  }

  let {
    value = '',
    onInput,
    onSubmit,
    maxLength = 12,
    allowDecimal = true,
    class: className,
  }: Props = $props();

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [allowDecimal ? '.' : '', '0', 'del'],
  ];

  function handleKeyPress(key: string) {
    if (key === '') return;
    
    if (key === 'del') {
      onInput(value.slice(0, -1));
      return;
    }

    // Prevent multiple decimals
    if (key === '.' && value.includes('.')) {
      return;
    }

    // Prevent leading zeros (except for "0.")
    if (key === '0' && value === '0') {
      return;
    }

    // Limit decimal places to 2
    if (value.includes('.')) {
      const decimalPart = value.split('.')[1];
      if (decimalPart && decimalPart.length >= 2) {
        return;
      }
    }

    // Max length check
    if (value.length >= maxLength) {
      return;
    }

    // If starting with decimal, prepend 0
    if (key === '.' && value === '') {
      onInput('0.');
      return;
    }

    onInput(value + key);
  }

  function handleKeyDown(event: KeyboardEvent) {
    const key = event.key;
    
    if (key >= '0' && key <= '9') {
      handleKeyPress(key);
    } else if (key === '.' && allowDecimal) {
      handleKeyPress('.');
    } else if (key === 'Backspace') {
      handleKeyPress('del');
    } else if (key === 'Enter' && onSubmit) {
      onSubmit();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class={cn('grid grid-cols-3 gap-2', className)}>
  {#each keys as row}
    {#each row as key}
      {#if key === ''}
        <div></div>
      {:else if key === 'del'}
        <button
          type="button"
          class="flex h-14 items-center justify-center rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-95 transition-all"
          onclick={() => handleKeyPress('del')}
        >
          <Delete class="h-6 w-6" />
        </button>
      {:else}
        <button
          type="button"
          class="flex h-14 items-center justify-center rounded-lg bg-accent text-accent-foreground text-xl font-medium hover:bg-accent/80 active:scale-95 transition-all"
          onclick={() => handleKeyPress(key)}
        >
          {key}
        </button>
      {/if}
    {/each}
  {/each}
</div>

