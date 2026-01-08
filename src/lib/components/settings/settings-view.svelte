<script lang="ts">
  import { onMount } from 'svelte';
  import { FolderOpen, Plus, Trash2, Cloud, HardDrive, Copy, Check, Monitor, RefreshCw, Edit3, AlertTriangle, Languages, BookOpen, Lock } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { t, locale, supportedLocales, setLocale, localeNames } from '$lib/i18n';
  import { isTauri, getDropboxPath } from '$lib/services';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';
  import { installationConfig, type InstallationConfig } from '$lib/services/installation-config';
  import { addToast } from '$lib/stores/ui';
  import ThemeToggle from './theme-toggle.svelte';

  // Settings stored in localStorage
  let searchFolders = $state<string[]>([]);
  let isDesktop = $state(false);
  let isDropboxConnected = $state(false);
  let dropboxPath = $state<string | null>(null);
  let copiedField = $state<string | null>(null);

  // App preferences
  let defaultReadOnly = $state(false);
  let currentLocale = $state<string>('es');

  // Installation config
  let installConfig = $state<InstallationConfig | null>(null);
  let isEditingName = $state(false);
  let editedName = $state('');
  let showResetConfirm = $state(false);


  function copyToClipboard(text: string | undefined, field: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 2000);
  }

  function startEditingName() {
    if (installConfig) {
      editedName = installConfig.deviceShortName;
      isEditingName = true;
    }
  }

  function saveDeviceName() {
    if (editedName.trim() && installConfig) {
      installationConfig.setDeviceName(editedName.trim());
      installConfig = installationConfig.getConfig();
      addToast({ type: 'success', message: 'Nombre del dispositivo actualizado' });
    }
    isEditingName = false;
  }

  function cancelEditingName() {
    isEditingName = false;
    editedName = '';
  }

  function resetInstallation() {
    installConfig = installationConfig.reset();
    showResetConfirm = false;
    addToast({ type: 'warning', message: 'Instalación reiniciada con nuevo GUID' });
  }

  onMount(async () => {
    isDesktop = isTauri();
    isDropboxConnected = DropboxAuth.isAuthenticated();

    // Load installation config
    installConfig = installationConfig.load();

    // Load app preferences
    defaultReadOnly = localStorage.getItem('ynab4-default-readonly') === 'true';
    currentLocale = $locale;

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

  function handleLocaleChange(newLocale: string) {
    currentLocale = newLocale;
    setLocale(newLocale);
    addToast({ type: 'success', message: newLocale === 'es' ? 'Idioma cambiado a Español' : 'Language changed to English' });
  }

  function toggleDefaultReadOnly() {
    defaultReadOnly = !defaultReadOnly;
    localStorage.setItem('ynab4-default-readonly', defaultReadOnly.toString());
    addToast({
      type: 'info',
      message: defaultReadOnly
        ? ($locale === 'es' ? 'Los presupuestos se abrirán en modo solo lectura' : 'Budgets will open in read-only mode')
        : ($locale === 'es' ? 'Los presupuestos se abrirán en modo edición' : 'Budgets will open in edit mode')
    });
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

  <!-- Language -->
  <section class="space-y-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
    <div class="flex items-center gap-2">
      <Languages class="h-5 w-5 text-[var(--primary)]" />
      <h2 class="font-semibold text-[var(--foreground)]">{$t('settings.language') || 'Idioma'}</h2>
    </div>
    <p class="text-sm text-[var(--muted-foreground)]">
      {$t('settings.languageDescription') || 'Selecciona el idioma de la aplicación'}
    </p>

    <div class="flex gap-2">
      {#each supportedLocales as loc}
        <button
          onclick={() => handleLocaleChange(loc)}
          class="px-4 py-2 rounded-lg text-sm font-medium transition-all {currentLocale === loc
            ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
            : 'bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--accent)]'}"
        >
          {localeNames[loc]}
        </button>
      {/each}
    </div>
  </section>

  <!-- Default Open Mode -->
  <section class="space-y-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
    <div class="flex items-center gap-2">
      <Lock class="h-5 w-5 text-[var(--warning)]" />
      <h2 class="font-semibold text-[var(--foreground)]">{$t('settings.defaultMode') || 'Modo de Apertura'}</h2>
    </div>
    <p class="text-sm text-[var(--muted-foreground)]">
      {$t('settings.defaultModeDescription') || 'Define cómo se abren los presupuestos por defecto'}
    </p>

    <div class="flex items-center justify-between p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
      <div class="flex items-center gap-3">
        <BookOpen class="h-5 w-5 text-[var(--muted-foreground)]" />
        <div>
          <div class="text-sm font-medium text-[var(--foreground)]">
            {$t('settings.openReadOnly') || 'Abrir en solo lectura'}
          </div>
          <div class="text-xs text-[var(--muted-foreground)]">
            {$t('settings.openReadOnlyDescription') || 'Los presupuestos se abrirán sin permitir cambios'}
          </div>
        </div>
      </div>
      <button
        onclick={toggleDefaultReadOnly}
        class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {defaultReadOnly ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}"
        role="switch"
        aria-checked={defaultReadOnly}
      >
        <span
          class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {defaultReadOnly ? 'translate-x-6' : 'translate-x-1'}"
        ></span>
      </button>
    </div>

    <p class="text-xs text-[var(--muted-foreground)]">
      {$t('settings.defaultModeNote') || 'Puedes cambiar el modo de un presupuesto individual después de abrirlo.'}
    </p>
  </section>

  <!-- Installation Settings -->
  {#if installConfig}
    <section class="space-y-3 p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
      <div class="flex items-center gap-2">
        <Monitor class="h-5 w-5 text-[var(--primary)]" />
        <h2 class="font-semibold text-[var(--foreground)]">{$t('settings.installation') || 'Instalación'}</h2>
      </div>
      <p class="text-sm text-[var(--muted-foreground)]">
        {$t('settings.installationDescription') || 'Identificación única de esta instalación del cliente. Se usará para registrar cambios en los presupuestos.'}
      </p>

      <div class="space-y-2">
        <!-- Device Name (Editable) -->
        <div class="flex items-center justify-between p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
          <div class="flex-1 min-w-0">
            <span class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">{$t('settings.deviceName') || 'Nombre del Dispositivo'}</span>
            {#if isEditingName}
              <div class="flex items-center gap-2 mt-1">
                <Input
                  bind:value={editedName}
                  class="h-8 text-sm"
                  onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && saveDeviceName()}
                />
                <button
                  onclick={saveDeviceName}
                  class="p-1.5 rounded-lg hover:bg-[var(--success)]/20 text-[var(--success)]"
                  title="Guardar"
                >
                  <Check class="h-4 w-4" />
                </button>
                <button
                  onclick={cancelEditingName}
                  class="p-1.5 rounded-lg hover:bg-[var(--destructive)]/20 text-[var(--destructive)]"
                  title="Cancelar"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
            {:else}
              <div class="text-sm font-medium text-[var(--foreground)]">{installConfig.deviceShortName}</div>
            {/if}
          </div>
          {#if !isEditingName}
            <button
              onclick={startEditingName}
              class="p-2 rounded-lg hover:bg-[var(--accent)] transition-colors text-[var(--muted-foreground)]"
              title="Editar nombre"
            >
              <Edit3 class="h-4 w-4" />
            </button>
          {/if}
        </div>

        <!-- Device Type -->
        <div class="flex items-center justify-between p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
          <div>
            <span class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">{$t('settings.deviceType') || 'Tipo'}</span>
            <div class="text-sm text-[var(--foreground)]">{installConfig.deviceType}</div>
          </div>
        </div>

        <!-- Installation GUID -->
        <div class="flex items-center justify-between p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
          <div class="flex-1 min-w-0">
            <span class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">{$t('settings.installationGUID') || 'GUID de Instalación'}</span>
            <div class="font-mono text-xs text-[var(--foreground)] truncate" title={installConfig.deviceGUID}>
              {installConfig.deviceGUID}
            </div>
          </div>
          <button
            onclick={() => copyToClipboard(installConfig?.deviceGUID, 'installGuid')}
            class="p-2 rounded-lg hover:bg-[var(--accent)] transition-colors text-[var(--muted-foreground)] shrink-0 ml-2"
            title="Copiar"
          >
            {#if copiedField === 'installGuid'}
              <Check class="h-4 w-4 text-[var(--success)]" />
            {:else}
              <Copy class="h-4 w-4" />
            {/if}
          </button>
        </div>

        <!-- Created/Last Used -->
        <div class="grid grid-cols-2 gap-2">
          <div class="p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <span class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">{$t('settings.createdAt') || 'Creado'}</span>
            <div class="text-xs text-[var(--foreground)]">
              {new Date(installConfig.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div class="p-3 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <span class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">{$t('settings.lastUsed') || 'Último uso'}</span>
            <div class="text-xs text-[var(--foreground)]">
              {new Date(installConfig.lastUsedAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      <!-- Reset Installation -->
      <div class="pt-2 border-t border-[var(--border)]">
        {#if showResetConfirm}
          <div class="p-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 space-y-2">
            <div class="flex items-start gap-2">
              <AlertTriangle class="h-4 w-4 text-[var(--destructive)] shrink-0 mt-0.5" />
              <p class="text-xs text-[var(--destructive)]">
                {$t('settings.resetWarning') || 'Esto generará un nuevo GUID. Esta instalación aparecerá como un dispositivo nuevo en todos los presupuestos. ¿Estás seguro?'}
              </p>
            </div>
            <div class="flex gap-2">
              <button
                onclick={resetInstallation}
                class="px-3 py-1 text-xs rounded-lg font-medium text-white bg-[var(--destructive)] hover:opacity-90"
              >
                {$t('common.confirm') || 'Confirmar'}
              </button>
              <button
                onclick={() => showResetConfirm = false}
                class="px-3 py-1 text-xs rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
              >
                {$t('common.cancel') || 'Cancelar'}
              </button>
            </div>
          </div>
        {:else}
          <button
            onclick={() => showResetConfirm = true}
            class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors"
          >
            <RefreshCw class="h-4 w-4" />
            {$t('settings.resetInstallation') || 'Reiniciar Instalación'}
          </button>
        {/if}
      </div>

      <p class="text-xs text-[var(--muted-foreground)]">
        {$t('settings.installationNote') || 'Este GUID identifica únicamente esta instalación. Cuando actives el modo edición, los cambios se registrarán con este identificador.'}
      </p>
    </section>
  {/if}

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
