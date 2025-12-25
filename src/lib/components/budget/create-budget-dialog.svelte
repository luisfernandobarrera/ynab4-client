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
  <!-- Backdrop - completely opaque -->
  <div 
    class="fixed inset-0 z-[100]"
    style="background-color: rgba(0, 0, 0, 0.9);"
    onclick={onClose}
    role="presentation"
  ></div>
  
  <!-- Dialog Window -->
  <div class="fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 w-full max-w-md px-4">
    <div class="rounded-lg shadow-2xl border-2 border-border overflow-hidden" style="background-color: hsl(var(--card));">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 text-white" style="background-color: var(--color-sodalita);">
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
      <div class="p-5 space-y-5" style="background-color: hsl(var(--card));">
        <!-- Budget Name -->
        <div class="space-y-2">
          <Label for="budget-name">{$t('budget.name')}</Label>
          <Input
            id="budget-name"
            bind:value={budgetName}
            placeholder="Mi Presupuesto"
            disabled={isCreating}
            class="h-11"
          />
        </div>

        <!-- Save Location -->
        <div class="space-y-3">
          <Label>{$t('budget.saveLocation')}</Label>
          <div class="space-y-2">
            {#if isDesktop}
              <button
                type="button"
                class="w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all {saveLocation === 'local' ? 'border-[--color-terracota]' : 'border-border hover:border-[--color-terracota]/50'}"
                style="background-color: hsl(var(--background));"
                onclick={() => saveLocation = 'local'}
                disabled={isCreating}
              >
                <div class="p-2 rounded-lg" style="background-color: rgba(199, 91, 57, 0.15);">
                  <HardDrive class="h-5 w-5 text-[--color-terracota]" />
                </div>
                <div class="text-left">
                  <p class="font-medium">{$t('localFiles.title')}</p>
                  <p class="text-xs text-muted-foreground">Guardar en disco local</p>
                </div>
              </button>
            {/if}
            
            <button
              type="button"
              class="w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all {saveLocation === 'dropbox' ? 'border-blue-500' : 'border-border hover:border-blue-500/50'} {!isDropboxConnected ? 'opacity-50' : ''}"
              style="background-color: hsl(var(--background));"
              onclick={() => { if (isDropboxConnected) saveLocation = 'dropbox' }}
              disabled={isCreating || !isDropboxConnected}
            >
              <div class="p-2 rounded-lg" style="background-color: rgba(45, 74, 111, 0.15);">
                <Cloud class="h-5 w-5 text-blue-500" />
              </div>
              <div class="text-left flex-1">
                <p class="font-medium">Dropbox</p>
                <p class="text-xs text-muted-foreground">
                  {isDropboxConnected ? 'Sincronizar con Dropbox' : 'Conectar Dropbox primero'}
                </p>
              </div>
              {#if !isDropboxConnected}
                <span class="text-xs px-2 py-1 rounded text-muted-foreground" style="background-color: hsl(var(--muted));">
                  No conectado
                </span>
              {/if}
            </button>
          </div>
        </div>

        <!-- Local Path (only for desktop when local selected) -->
        {#if isDesktop && saveLocation === 'local'}
          <div class="space-y-2">
            <Label for="local-path">{$t('budget.folder')}</Label>
            <div class="flex gap-2">
              <Input
                id="local-path"
                bind:value={localPath}
                placeholder="/path/to/YNAB"
                disabled={isCreating}
                class="flex-1 h-11 text-sm"
              />
              <Button 
                variant="outline" 
                size="icon"
                onclick={selectFolder}
                disabled={isCreating}
                class="h-11 w-11 shrink-0"
              >
                <FolderOpen class="h-4 w-4" />
              </Button>
            </div>
          </div>
        {/if}

        <!-- Error -->
        {#if error}
          <div class="p-3 rounded-lg border border-red-500/30" style="background-color: rgba(220, 38, 38, 0.1);">
            <p class="text-sm text-red-500">{error}</p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-3 px-5 py-4 border-t border-border" style="background-color: hsl(var(--muted));">
        <Button variant="outline" onclick={onClose} disabled={isCreating}>
          {$t('common.cancel')}
        </Button>
        <Button 
          onclick={createBudget} 
          disabled={isCreating || !budgetName.trim()}
          style="background-color: var(--color-terracota); color: white;"
          class="hover:opacity-90"
        >
          {#if isCreating}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          {/if}
          {$t('budget.create')}
        </Button>
      </div>
    </div>
  </div>
{/if}
