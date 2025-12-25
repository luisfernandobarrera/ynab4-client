<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, Loader2, Cloud, HardDrive, FolderOpen } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { t, locale, supportedLocales, localeNames } from '$lib/i18n';
  import { isTauri, openBudgetFolderDialog, getDropboxPath } from '$lib/services';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';

  interface Props {
    open?: boolean;
    onClose?: () => void;
    onCreated?: (budgetPath: string) => void;
  }

  let { open = false, onClose, onCreated }: Props = $props();

  // Form state
  let budgetName = $state('My Budget');
  let saveLocation = $state<'local' | 'dropbox'>('local');
  let localPath = $state('');
  let isCreating = $state(false);
  let error = $state<string | null>(null);
  
  const isDesktop = $derived(isTauri());
  const isDropboxConnected = $derived(DropboxAuth.isAuthenticated());

  // Set default path when opened
  $effect(() => {
    if (open && isDesktop) {
      loadDefaultPath();
    }
  });

  async function loadDefaultPath() {
    try {
      const dropboxPath = await getDropboxPath();
      if (dropboxPath) {
        localPath = `${dropboxPath}/YNAB`;
        saveLocation = 'dropbox';
      } else {
        // Fallback to Documents
        const { documentDir } = await import('@tauri-apps/api/path');
        const docs = await documentDir();
        localPath = `${docs}/YNAB`;
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
        title: 'Seleccionar carpeta para guardar el presupuesto',
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
      error = 'Budget name is required';
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
          error = 'Please select a folder';
          isCreating = false;
          return;
        }
        basePath = localPath;
      } else if (saveLocation === 'dropbox' && isDropboxConnected) {
        basePath = '/YNAB';
      } else {
        error = 'Please select a valid save location';
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
      error = e instanceof Error ? e.message : 'Failed to create budget';
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
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
    onclick={onClose}
    role="presentation"
  ></div>
  
  <!-- Dialog -->
  <div class="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md">
    <div class="bg-card rounded-lg shadow-xl border border-border">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-border">
        <h2 class="text-lg font-heading font-semibold">
          {$t('budget.createNew') || 'Create New Budget'}
        </h2>
        <button 
          class="p-1 rounded-md hover:bg-accent transition-colors"
          onclick={onClose}
          aria-label="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-4 space-y-4">
        <!-- Budget Name -->
        <div class="space-y-2">
          <Label for="budget-name">{$t('budget.name') || 'Budget Name'}</Label>
          <Input
            id="budget-name"
            bind:value={budgetName}
            placeholder="My Budget"
            disabled={isCreating}
          />
        </div>

        <!-- Save Location -->
        <div class="space-y-2">
          <Label>{$t('budget.saveLocation') || 'Save Location'}</Label>
          <div class="grid grid-cols-2 gap-2">
            {#if isDesktop}
              <button
                type="button"
                class="flex items-center gap-2 p-3 rounded-lg border transition-colors {saveLocation === 'local' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}"
                onclick={() => saveLocation = 'local'}
                disabled={isCreating}
              >
                <HardDrive class="h-5 w-5 text-orange-500" />
                <span class="text-sm font-medium">Local</span>
              </button>
            {/if}
            <button
              type="button"
              class="flex items-center gap-2 p-3 rounded-lg border transition-colors {saveLocation === 'dropbox' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'} {!isDropboxConnected ? 'opacity-50 cursor-not-allowed' : ''}"
              onclick={() => { if (isDropboxConnected) saveLocation = 'dropbox' }}
              disabled={isCreating || !isDropboxConnected}
            >
              <Cloud class="h-5 w-5 text-blue-500" />
              <span class="text-sm font-medium">Dropbox</span>
            </button>
          </div>
          {#if !isDropboxConnected}
            <p class="text-xs text-muted-foreground">
              {$t('dropbox.connectToSave') || 'Connect Dropbox to save budgets there'}
            </p>
          {/if}
        </div>

        <!-- Local Path (only for desktop) -->
        {#if isDesktop && saveLocation === 'local'}
          <div class="space-y-2">
            <Label for="local-path">{$t('budget.folder') || 'Folder'}</Label>
            <div class="flex gap-2">
              <Input
                id="local-path"
                bind:value={localPath}
                placeholder="/path/to/YNAB"
                disabled={isCreating}
                class="flex-1"
              />
              <Button 
                variant="outline" 
                size="icon"
                onclick={selectFolder}
                disabled={isCreating}
              >
                <FolderOpen class="h-4 w-4" />
              </Button>
            </div>
          </div>
        {/if}

        <!-- Error -->
        {#if error}
          <p class="text-sm text-destructive">{error}</p>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 p-4 border-t border-border">
        <Button variant="ghost" onclick={onClose} disabled={isCreating}>
          {$t('common.cancel')}
        </Button>
        <Button onclick={createBudget} disabled={isCreating}>
          {#if isCreating}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          {/if}
          {$t('budget.create') || 'Create'}
        </Button>
      </div>
    </div>
  </div>
{/if}

