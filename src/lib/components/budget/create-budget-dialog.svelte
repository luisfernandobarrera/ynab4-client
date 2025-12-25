<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Loader2, Cloud, HardDrive, FolderOpen } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { t, locale } from '$lib/i18n';
  import { isTauri, getDropboxPath } from '$lib/services';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';

  interface Props {
    open?: boolean;
    onClose?: () => void;
    onCreated?: (budgetPath: string) => void;
  }

  let { open = false, onClose, onCreated }: Props = $props();

  // Form state
  let budgetName = $state('');
  let saveLocation = $state<'local' | 'dropbox'>('local');
  let localPath = $state('');
  let isCreating = $state(false);
  let error = $state<string | null>(null);
  let isDesktop = $state(false);
  let isDropboxConnected = $state(false);

  // Check platform on mount
  onMount(() => {
    isDesktop = isTauri();
    isDropboxConnected = DropboxAuth.isAuthenticated();
  });

  // Set default path when opened
  $effect(() => {
    if (open) {
      // Reset form
      budgetName = '';
      error = null;
      isDropboxConnected = DropboxAuth.isAuthenticated();
      
      if (isDesktop) {
        loadDefaultPath();
      } else {
        // Browser only: force Dropbox if connected
        saveLocation = isDropboxConnected ? 'dropbox' : 'local';
      }
    }
  });

  async function loadDefaultPath() {
    try {
      const dropboxPath = await getDropboxPath();
      if (dropboxPath) {
        localPath = `${dropboxPath}/YNAB`;
      } else {
        // Fallback to Documents
        try {
          const { documentDir } = await import('@tauri-apps/api/path');
          const docs = await documentDir();
          localPath = `${docs}YNAB`;
        } catch {
          localPath = '';
        }
      }
    } catch {
      localPath = '';
    }
  }

  async function selectFolder() {
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: $t('budget.selectFolderTitle') || 'Select folder to save budget',
      });
      if (selected) {
        localPath = selected as string;
      }
    } catch (e) {
      console.error('Error selecting folder:', e);
    }
  }

  async function createBudget() {
    if (!budgetName.trim()) {
      error = $t('budget.nameRequired') || 'Budget name is required';
      return;
    }

    isCreating = true;
    error = null;

    try {
      // Get the current locale for the budget
      const budgetLocale = $locale === 'es' ? 'es_MX' : 'en_US';
      
      // Determine the base path
      let basePath: string;
      if (saveLocation === 'local' && isDesktop) {
        if (!localPath) {
          error = $t('budget.folderRequired') || 'Please select a folder';
          isCreating = false;
          return;
        }
        basePath = localPath;
      } else if (saveLocation === 'dropbox' && isDropboxConnected) {
        basePath = '/YNAB';
      } else {
        error = $t('budget.selectLocationError') || 'Please select a valid save location';
        isCreating = false;
        return;
      }

      // Use YnabClient.createNewBudget
      if (saveLocation === 'local' && isDesktop) {
        // Use TauriIO for local
        const { TauriIO } = await import('$lib/services/tauri-io');
        const { YnabClient } = await import('ynab-library');
        
        const io = new TauriIO(false); // Writable
        const result = await YnabClient.createNewBudget(io, basePath, {
          budgetName: budgetName.trim(),
          locale: budgetLocale,
          startYear: new Date().getFullYear(),
          endYear: new Date().getFullYear(),
          monthlyIncome: 0,
        });
        
        console.log('[CreateBudget] Created:', result);
        onCreated?.(result.budgetPath);
      } else if (saveLocation === 'dropbox' && isDropboxConnected) {
        // Use DropboxIO
        const accessToken = await DropboxAuth.getAccessToken();
        if (!accessToken) {
          throw new Error('Dropbox not connected');
        }
        
        const { DropboxIO, YnabClient } = await import('ynab-library');
        const io = new DropboxIO(accessToken);
        
        const result = await YnabClient.createNewBudget(io, basePath, {
          budgetName: budgetName.trim(),
          locale: budgetLocale,
          startYear: new Date().getFullYear(),
          endYear: new Date().getFullYear(),
          monthlyIncome: 0,
        });
        
        console.log('[CreateBudget] Created in Dropbox:', result);
        onCreated?.(result.budgetPath);
      }

      onClose?.();
    } catch (e) {
      console.error('[CreateBudget] Error:', e);
      error = e instanceof Error ? e.message : $t('budget.createError') || 'Failed to create budget';
    } finally {
      isCreating = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div 
    class="fixed inset-0 z-[100]"
    style="background: rgba(0, 0, 0, 0.95);"
    onclick={onClose}
    role="presentation"
  ></div>
  
  <!-- Dialog Window -->
  <div class="fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 w-full max-w-md px-4">
    <div class="rounded-xl shadow-2xl overflow-hidden" style="background: #25253a; border: 2px solid #404060;">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 text-white" style="background: #2D4A6F;">
        <h2 class="text-lg font-heading font-bold">
          {$t('budget.createNew')}
        </h2>
        <button 
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          onclick={onClose}
          aria-label="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-5 space-y-5" style="background: #25253a;">
        <!-- Budget Name -->
        <div class="space-y-2">
          <label for="budget-name" class="text-sm font-medium text-gray-300">{$t('budget.name')}</label>
          <input
            id="budget-name"
            bind:value={budgetName}
            placeholder="Mi Presupuesto"
            disabled={isCreating}
            class="w-full h-11 px-3 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            style="background: #1a1a2e; border: 1px solid #404060;"
          />
        </div>

        <!-- Save Location -->
        <div class="space-y-3">
          <label class="text-sm font-medium text-gray-300">{$t('budget.saveLocation')}</label>
          <div class="space-y-2">
            {#if isDesktop}
              <button
                type="button"
                class="w-full flex items-center gap-3 p-4 rounded-lg transition-all text-white"
                style="background: #1a1a2e; border: 2px solid {saveLocation === 'local' ? '#C75B39' : '#404060'};"
                onclick={() => saveLocation = 'local'}
                disabled={isCreating}
              >
                <div class="p-2 rounded-lg" style="background: rgba(199, 91, 57, 0.2);">
                  <HardDrive class="h-5 w-5" style="color: #E07A5F;" />
                </div>
                <div class="text-left">
                  <p class="font-medium">{$t('localFiles.title')}</p>
                  <p class="text-xs text-gray-400">Guardar en disco local</p>
                </div>
              </button>
            {/if}
            
            <button
              type="button"
              class="w-full flex items-center gap-3 p-4 rounded-lg transition-all text-white {!isDropboxConnected ? 'opacity-50' : ''}"
              style="background: #1a1a2e; border: 2px solid {saveLocation === 'dropbox' ? '#3b82f6' : '#404060'};"
              onclick={() => { if (isDropboxConnected) saveLocation = 'dropbox' }}
              disabled={isCreating || !isDropboxConnected}
            >
              <div class="p-2 rounded-lg" style="background: rgba(59, 130, 246, 0.2);">
                <Cloud class="h-5 w-5 text-blue-400" />
              </div>
              <div class="text-left flex-1">
                <p class="font-medium">Dropbox</p>
                <p class="text-xs text-gray-400">
                  {isDropboxConnected ? 'Sincronizar con Dropbox' : 'Conectar Dropbox primero'}
                </p>
              </div>
              {#if !isDropboxConnected}
                <span class="text-xs px-2 py-1 rounded text-gray-400" style="background: #35354a;">
                  No conectado
                </span>
              {/if}
            </button>
          </div>
        </div>

        <!-- Local Path (only for desktop when local selected) -->
        {#if isDesktop && saveLocation === 'local'}
          <div class="space-y-2">
            <label for="local-path" class="text-sm font-medium text-gray-300">{$t('budget.folder')}</label>
            <div class="flex gap-2">
              <input
                id="local-path"
                bind:value={localPath}
                placeholder="/path/to/YNAB"
                disabled={isCreating}
                class="flex-1 h-11 px-3 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                style="background: #1a1a2e; border: 1px solid #404060;"
              />
              <button 
                onclick={selectFolder}
                disabled={isCreating}
                class="h-11 w-11 rounded-lg flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                style="border: 1px solid #404060;"
              >
                <FolderOpen class="h-4 w-4" />
              </button>
            </div>
          </div>
        {/if}

        <!-- Error -->
        {#if error}
          <div class="p-3 rounded-lg" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3);">
            <p class="text-sm text-red-400">{error}</p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-3 px-5 py-4" style="background: #1a1a2e; border-top: 1px solid #404060;">
        <button 
          onclick={onClose} 
          disabled={isCreating}
          class="px-4 py-2 rounded-lg font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          style="border: 1px solid #404060;"
        >
          {$t('common.cancel')}
        </button>
        <button 
          onclick={createBudget} 
          disabled={isCreating || !budgetName.trim()}
          class="px-4 py-2 rounded-lg font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
          style="background: #C75B39;"
        >
          {#if isCreating}
            <Loader2 class="mr-2 h-4 w-4 animate-spin inline" />
          {/if}
          {$t('budget.create')}
        </button>
      </div>
    </div>
  </div>
{/if}
