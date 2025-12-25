<script lang="ts">
  import { onMount } from 'svelte';
  import { Settings, FolderOpen, Plus, X, Trash2, Globe, Cloud, HardDrive, Fingerprint, Copy, Check } from 'lucide-svelte';
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
  let deviceGUID = $state<string | null>(null);
  let shortDeviceId = $state<string | null>(null);
  let copied = $state(false);

  onMount(async () => {
    isDesktop = isTauri();
    isDropboxConnected = DropboxAuth.isAuthenticated();
    
    // Load settings from localStorage
    const savedFolders = localStorage.getItem('ynab4-search-folders');
    if (savedFolders) {
      searchFolders = JSON.parse(savedFolders);
    }
    
    // Load device GUID
    deviceGUID = localStorage.getItem('ynab4-device-guid');
    shortDeviceId = localStorage.getItem('ynab4-short-device-id');
    
    // Generate new GUID if not exists
    if (!deviceGUID) {
      deviceGUID = crypto.randomUUID().toUpperCase();
      localStorage.setItem('ynab4-device-guid', deviceGUID);
    }
    if (!shortDeviceId) {
      // Generate short ID (A-Z)
      shortDeviceId = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      localStorage.setItem('ynab4-short-device-id', shortDeviceId);
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
  
  async function copyDeviceGUID() {
    if (deviceGUID) {
      await navigator.clipboard.writeText(deviceGUID);
      copied = true;
      setTimeout(() => copied = false, 2000);
    }
  }

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

<div class="p-6 space-y-6" style="background-color: hsl(var(--background));">
  <!-- Language -->
  <section class="space-y-3 p-4 rounded-lg border border-border" style="background-color: hsl(var(--card));">
    <div class="flex items-center gap-2">
      <Globe class="h-5 w-5 text-muted-foreground" />
      <h2 class="font-semibold">{$t('settings.language')}</h2>
    </div>
    <p class="text-sm text-muted-foreground">{$t('settings.languageDescription')}</p>
    <select 
      class="w-full border border-border rounded-md px-3 py-2 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
      style="background-color: hsl(var(--background));"
      value={$locale}
      onchange={(e) => setLocale(e.currentTarget.value)}
    >
      {#each supportedLocales as loc}
        <option value={loc}>{localeNames[loc]}</option>
      {/each}
    </select>
  </section>

  <!-- Dropbox -->
  <section class="space-y-3 p-4 rounded-lg border border-border" style="background-color: hsl(var(--card));">
    <div class="flex items-center gap-2">
      <Cloud class="h-5 w-5 text-blue-500" />
      <h2 class="font-semibold">Dropbox</h2>
    </div>
    <p class="text-sm text-muted-foreground">{$t('settings.dropboxDescription')}</p>
    
    {#if isDropboxConnected}
      <div class="flex items-center justify-between p-3 rounded-lg border border-green-500/30" style="background-color: hsl(var(--background));">
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

  <!-- Search Folders (Desktop only) -->
  {#if isDesktop}
    <section class="space-y-3 p-4 rounded-lg border border-border" style="background-color: hsl(var(--card));">
      <div class="flex items-center gap-2">
        <HardDrive class="h-5 w-5 text-[--color-terracota]" />
        <h2 class="font-semibold">{$t('settings.searchFolders') || 'Carpetas de Búsqueda'}</h2>
      </div>
      <p class="text-sm text-muted-foreground">
        {$t('settings.searchFoldersDescription') || 'Carpetas donde se buscarán presupuestos YNAB4'}
      </p>

      <!-- List of folders -->
      <div class="space-y-2">
        {#if searchFolders.length === 0}
          <p class="text-sm text-muted-foreground italic">
            {$t('settings.noSearchFolders') || 'No hay carpetas configuradas'}
          </p>
        {:else}
          {#each searchFolders as folder, i}
            <div class="flex items-center gap-2 p-2 rounded-lg border border-border group" style="background-color: hsl(var(--background));">
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
        {$t('settings.addFolder') || 'Añadir Carpeta'}
      </Button>
    </section>
  {/if}

  <!-- Device Info -->
  <section class="space-y-3 p-4 rounded-lg border border-border" style="background-color: hsl(var(--card));">
    <div class="flex items-center gap-2">
      <Fingerprint class="h-5 w-5 text-purple-500" />
      <h2 class="font-semibold">{$t('settings.device') || 'Dispositivo'}</h2>
    </div>
    <p class="text-sm text-muted-foreground">
      {$t('settings.deviceDescription') || 'Identificador único de este dispositivo para sincronizar cambios'}
    </p>
    
    <div class="space-y-3 p-3 rounded-lg border border-border" style="background-color: hsl(var(--background));">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs text-muted-foreground uppercase tracking-wide">Device GUID</p>
          <p class="font-mono text-xs select-all break-all">{deviceGUID || '—'}</p>
        </div>
        <button 
          class="p-2 rounded-lg hover:bg-accent transition-colors shrink-0"
          onclick={copyDeviceGUID}
          aria-label="Copy"
        >
          {#if copied}
            <Check class="h-4 w-4 text-green-500" />
          {:else}
            <Copy class="h-4 w-4 text-muted-foreground" />
          {/if}
        </button>
      </div>
      <div>
        <p class="text-xs text-muted-foreground uppercase tracking-wide">Short ID</p>
        <p class="font-mono text-lg font-bold">{shortDeviceId || '—'}</p>
      </div>
    </div>
  </section>

  <!-- About -->
  <section class="space-y-3 p-4 rounded-lg border border-border" style="background-color: hsl(var(--card));">
    <h2 class="font-semibold">{$t('settings.about')}</h2>
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

