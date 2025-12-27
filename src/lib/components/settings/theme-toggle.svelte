<script lang="ts">
  import { Sun, Moon, Monitor } from 'lucide-svelte';
  import { theme, type Theme } from '$lib/stores/ui';

  interface Props {
    compact?: boolean;
  }

  let { compact = false }: Props = $props();

  const themes = [
    { id: 'light' as Theme, icon: Sun, label: 'Light' },
    { id: 'dark' as Theme, icon: Moon, label: 'Dark' },
    { id: 'system' as Theme, icon: Monitor, label: 'System' },
  ];

  function setTheme(newTheme: Theme) {
    theme.set(newTheme);
  }

  function cycleTheme() {
    const order: Theme[] = ['light', 'dark', 'system'];
    theme.update(current => {
      const currentIndex = order.indexOf(current);
      const nextIndex = (currentIndex + 1) % order.length;
      return order[nextIndex];
    });
  }

  const currentTheme = $derived(themes.find(t => t.id === $theme) || themes[2]);
</script>

{#if compact}
  {@const Icon = currentTheme.icon}
  <button
    class="theme-toggle-compact"
    onclick={cycleTheme}
    title={currentTheme.label}
  >
    <Icon class="h-4 w-4" />
  </button>
{:else}
  <div class="theme-toggle">
    {#each themes as { id, icon: Icon, label }}
      <button
        class="theme-toggle-btn"
        class:active={$theme === id}
        onclick={() => setTheme(id)}
        title={label}
      >
        <Icon class="h-4 w-4" />
      </button>
    {/each}
  </div>
{/if}

<style>
  .theme-toggle {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem;
    background: var(--muted);
    border-radius: 0.5rem;
  }

  .theme-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border-radius: 0.375rem;
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .theme-toggle-btn:hover {
    color: var(--foreground);
    background: var(--background);
  }

  .theme-toggle-btn.active {
    background: var(--background);
    color: var(--foreground);
    box-shadow: var(--shadow-sm);
  }

  .theme-toggle-compact {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    border-radius: 0.375rem;
  }

  .theme-toggle-compact:hover {
    color: var(--foreground);
    background: var(--muted);
  }
</style>
