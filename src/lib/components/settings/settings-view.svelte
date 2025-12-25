<script lang="ts">
  import { onMount } from 'svelte';
  import { Settings, FolderOpen, Plus, X, Trash2, Globe, Cloud, HardDrive } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Separator } from '$lib/components/ui/separator';
  import { t, locale, supportedLocales, setLocale, localeNames } from '$lib/i18n';
  import { isTauri, getDropboxPath } from '$lib/services';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';

  // Settings stored in localStorage
  let searchFolders = $state<string[]>([]);
  let isDesktop = $state(false);
  let isDropboxConnected = $state(false);
  let dropboxPath = $state<string | null>(null);
  let newFolderPath = $state('');

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
    } else if (newFolderPath.trim()) {
      if (!searchFolders.includes(newFolderPath.trim())) {
        searchFolders = [...searchFolders, newFolderPath.trim()];
        saveSettings();
      }
      newFolderPath = '';
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

<div class="container mx-auto max-w-2xl p-6 space-y-8">
  <div class="flex items-center gap-3">
    <Settings class="h-6 w-6" />
    <h1 class="text-2xl font-heading font-bold">{$t('settings.title')}</h1>
  </div>

  <!-- Language -->
  <section class="space-y-4">
    <div class="flex items-center gap-2">
      <Globe class="h-5 w-5 text-muted-foreground" />
      <h2 class="text-lg font-semibold">{$t('settings.language')}</h2>
    </div>
    <p class="text-sm text-muted-foreground">{$t('settings.languageDescription')}</p>
    <select 
      class="w-full bg-card border border-border rounded-md px-3 py-2 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
      value={$locale}
      onchange={(e) => setLocale(e.currentTarget.value)}
    >
      {#each supportedLocales as loc}
        <option value={loc}>{localeNames[loc]}</option>
      {/each}
    </select>
  </section>

  <Separator />

  <!-- Dropbox -->
  <section class="space-y-4">
    <div class="flex items-center gap-2">
      <Cloud class="h-5 w-5 text-blue-500" />
      <h2 class="text-lg font-semibold">Dropbox</h2>
    </div>
    <p class="text-sm text-muted-foreground">{$t('settings.dropboxDescription')}</p>
    
    {#if isDropboxConnected}
      <div class="flex items-center justify-between p-3 rounded-lg bg-accent/50">
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full bg-green-500"></span>
          <span class="text-sm font-medium">{$t('settings.connected')}</span>
        </div>
        <Button variant="outline" size="sm" onclick={disconnectDropbox}>
          {$t('settings.disconnect')}
        </Button>
      </div>
    {:else}
      <Button onclick={connectDropbox}>
        <Cloud class="mr-2 h-4 w-4" />
        {$t('settings.connectDropbox')}
      </Button>
    {/if}
  </section>

  <Separator />

  <!-- Search Folders (Desktop only) -->
  {#if isDesktop}
    <section class="space-y-4">
      <div class="flex items-center gap-2">
        <HardDrive class="h-5 w-5 text-orange-500" />
        <h2 class="text-lg font-semibold">{$t('settings.searchFolders') || 'Search Folders'}</h2>
      </div>
      <p class="text-sm text-muted-foreground">
        {$t('settings.searchFoldersDescription') || 'Folders where YNAB4 budgets will be searched'}
      </p>

      <!-- List of folders -->
      <div class="space-y-2">
        {#if searchFolders.length === 0}
          <p class="text-sm text-muted-foreground italic">
            {$t('settings.noSearchFolders') || 'No folders configured'}
          </p>
        {:else}
          {#each searchFolders as folder, i}
            <div class="flex items-center gap-2 p-2 rounded-lg bg-accent/30 group">
              <FolderOpen class="h-4 w-4 text-muted-foreground shrink-0" />
              <span class="text-sm flex-1 truncate" title={folder}>{folder}</span>
              <button
                class="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
      <Button variant="outline" onclick={addFolder}>
        <Plus class="mr-2 h-4 w-4" />
        {$t('settings.addFolder') || 'Add Folder'}
      </Button>
    </section>

    <Separator />
  {/if}

  <!-- About -->
  <section class="space-y-4">
    <h2 class="text-lg font-semibold">{$t('settings.about')}</h2>
    <p class="text-sm text-muted-foreground">
      {$t('settings.aboutDescription')}
    </p>
    <p class="text-xs text-muted-foreground">
      {$t('settings.disclaimer')}
    </p>
    <p class="text-xs text-muted-foreground">
      {$t('settings.version')}: 0.1.0
    </p>
  </section>
</div>

