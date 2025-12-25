<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { Sun, Moon, Monitor } from 'lucide-svelte';
  import { t } from '$lib/i18n';

  interface Props {
    compact?: boolean;
  }

  let { compact = false }: Props = $props();

  const THEME_KEY = 'ynab4-theme';
  
  let theme = $state<'light' | 'dark' | 'system'>('system');

  onMount(() => {
    if (browser) {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        theme = saved;
      }
      applyTheme(theme);
    }
  });

  function applyTheme(newTheme: 'light' | 'dark' | 'system') {
    if (browser) {
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem(THEME_KEY, newTheme);
    }
  }

  function setTheme(newTheme: 'light' | 'dark' | 'system') {
    theme = newTheme;
    applyTheme(newTheme);
  }

  function cycleTheme() {
    const order: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const currentIndex = order.indexOf(theme);
    const nextIndex = (currentIndex + 1) % order.length;
    setTheme(order[nextIndex]);
  }

  const themes = [
    { id: 'light' as const, icon: Sun, label: 'Light' },
    { id: 'dark' as const, icon: Moon, label: 'Dark' },
    { id: 'system' as const, icon: Monitor, label: 'System' },
  ];

  const currentTheme = $derived(themes.find(t => t.id === theme) || themes[2]);
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
        class:active={theme === id}
        onclick={() => setTheme(id)}
        title={label}
      >
        <Icon class="h-4 w-4" />
      </button>
    {/each}
  </div>
{/if}

