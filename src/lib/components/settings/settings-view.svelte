<script lang="ts">
  import { onMount } from 'svelte';
  import { FolderOpen, Plus, Trash2, Cloud, HardDrive } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { t } from '$lib/i18n';
  import { isTauri, getDropboxPath } from '$lib/services';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';
  import ThemeToggle from './theme-toggle.svelte';

  // Settings stored in localStorage
  let searchFolders = $state<string[]>([]);
  let isDesktop = $state(false);
  let isDropboxConnected = $state(false);
  let dropboxPath = $state<string | null>(null);

  onMount(async () => {
    isDesktop = isTauri();
    isDropboxConnected = DropboxAuth.isAuthenticated();
    
    // Load settings from localStorage
    const savedFolders = localStorage.getItem('ynab4-search-folders');
    if (savedFolders) {
      searchFolders = JSON.parse(savedFolders);
    }
    
    // Get Dropbox path
    if (isDesktop) {
      dropboxPath = await getDropboxPath();
      
      // Add default paths if empty
      if (searchFolders.length === 0) {
        const defaultPaths: string[] = [];
        if (dropboxPath) {
          defaultPaths.push(`${dropboxPath}/YNAB`);
        }
        // Add Documents/YNAB
        try {
          const { documentDir } = await import('@tauri-apps/api/path');
          const docs = await documentDir();
          defaultPaths.push(`${docs}YNAB`);
        } catch {}
        
        if (defaultPaths.length > 0) {
          searchFolders = defaultPaths;
          saveSettings();
        }
      }
    }
  });

  function saveSettings() {
    localStorage.setItem('ynab4-search-folders', JSON.stringify(searchFolders));
  }

  async function addFolder() {
    if (isDesktop) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Select folder to search for budgets',
        });
        if (selected && !searchFolders.includes(selected as string)) {
          searchFolders = [...searchFolders, selected as string];
          saveSettings();
        }
      } catch (e) {
        console.error('Error selecting folder:', e);
      }
    }
  }

  function removeFolder(index: number) {
    searchFolders = searchFolders.filter((_, i) => i !== index);
    saveSettings();
  }

  function connectDropbox() {
    DropboxAuth.authorize();
  }

  function disconnectDropbox() {
    DropboxAuth.signOut();
    isDropboxConnected = false;
  }
</script>

<div class="p-6 space-y-6 bg-[var(--background)]">
  <!-- Theme -->
  <section class="space-y-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="font-semibold text-[var(--foreground)]">{$t('settings.theme') || 'Tema'}</h2>
        <p class="text-sm text-[var(--muted-foreground)]">{$t('settings.themeDescription') || 'Selecciona el tema de la aplicación'}</p>
      </div>
      <ThemeToggle />
    </div>
  </section>

  <!-- Dropbox -->
  <section class="space-y-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
    <div class="flex items-center gap-2">
      <Cloud class="h-5 w-5 text-[var(--info)]" />
      <h2 class="font-semibold text-[var(--foreground)]">Dropbox</h2>
    </div>
    <p class="text-sm text-[var(--muted-foreground)]">{$t('settings.dropboxDescription')}</p>
    
    {#if isDropboxConnected}
      <div class="flex items-center justify-between p-3 rounded-lg bg-[var(--background)] border border-[var(--success)]/30">
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-[var(--success)]"></span>
          <span class="text-sm font-medium text-[var(--success)]">{$t('settings.connected')}</span>
        </div>
        <button 
          onclick={disconnectDropbox}
          class="px-3 py-1 text-sm rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors border border-[var(--border)]"
        >
          {$t('settings.disconnect')}
        </button>
      </div>
    {:else}
      <button 
        onclick={connectDropbox}
        class="px-4 py-2 rounded-lg font-medium text-white transition-all hover:opacity-90 bg-[var(--info)]"
      >
        <Cloud class="mr-2 h-4 w-4 inline" />
        {$t('settings.connectDropbox')}
      </button>
    {/if}
  </section>

  <!-- Search Folders (Desktop only) -->
  {#if isDesktop}
    <section class="space-y-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
      <div class="flex items-center gap-2">
        <HardDrive class="h-5 w-5 text-[var(--primary)]" />
        <h2 class="font-semibold text-[var(--foreground)]">{$t('settings.searchFolders') || 'Carpetas de Búsqueda'}</h2>
      </div>
      <p class="text-sm text-[var(--muted-foreground)]">
        {$t('settings.searchFoldersDescription') || 'Carpetas donde se buscarán presupuestos YNAB4'}
      </p>

      <!-- List of folders -->
      <div class="space-y-2">
        {#if searchFolders.length === 0}
          <p class="text-sm text-[var(--muted-foreground)] italic">
            {$t('settings.noSearchFolders') || 'No hay carpetas configuradas'}
          </p>
        {:else}
          {#each searchFolders as folder, i}
            <div class="flex items-center gap-2 p-3 rounded-lg group bg-[var(--background)] border border-[var(--border)]">
              <FolderOpen class="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
              <span class="text-sm flex-1 truncate text-[var(--foreground)]" title={folder}>{folder}</span>
              <button
                class="p-1 rounded hover:bg-[var(--destructive)]/20 text-[var(--muted-foreground)] hover:text-[var(--destructive)] opacity-0 group-hover:opacity-100 transition-all"
                onclick={() => removeFolder(i)}
                aria-label="Remove folder"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Add folder button -->
      <button 
        onclick={addFolder}
        class="px-4 py-2 rounded-lg font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors border border-[var(--border)]"
      >
        <Plus class="mr-2 h-4 w-4 inline" />
        {$t('settings.addFolder') || 'Añadir Carpeta'}
      </button>
    </section>
  {/if}
</div>
