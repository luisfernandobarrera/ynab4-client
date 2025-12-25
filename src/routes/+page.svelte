<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { FolderOpen, Cloud, Loader2, Plus, HardDrive, RefreshCw, Settings } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { BudgetPicker, BudgetView, CreateBudgetDialog } from '$lib/components/budget';
  import { TransactionList } from '$lib/components/transactions';
  import { TransactionEntrySheet } from '$lib/components/entry';
  import { ScheduledList } from '$lib/components/scheduled';
  import { ReportsView } from '$lib/components/reports';
  import { SettingsView } from '$lib/components/settings';
  import { budgetInfo, currentView, isLoading, loadFromLocal, loadFromDropbox } from '$lib/stores/budget';
  import { activeModal, openModal, closeModal } from '$lib/stores/ui';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';
  import { BudgetLoader, openBudgetFolderDialog, findLocalBudgets, isTauri } from '$lib/services';
  import { t, locale, supportedLocales, setLocale, localeNames } from '$lib/i18n';

  // State
  let isDropboxConnected = $state(false);
  let accessToken = $state<string | null>(null);
  let showTransactionEntry = $state(false);
  let isDesktop = $state(false);
  
  // Budget lists
  let localBudgets = $state<Array<{name: string, path: string}>>([]);
  let dropboxBudgets = $state<Array<{name: string, path: string}>>([]);
  let loadingLocal = $state(false);
  let loadingDropbox = $state(false);
  let loadingBudgetList = $state(false);
  let dropboxError = $state<string | null>(null);

  // Check Tauri
  const checkTauri = () => {
    if (!browser) return false;
    const win = window as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
    return '__TAURI__' in win || '__TAURI_INTERNALS__' in win;
  };

  onMount(async () => {
    // Check if running in Tauri (desktop)
    isDesktop = checkTauri();
    console.log('[Page] isDesktop:', isDesktop);
    
    // Find local budgets if desktop
    if (isDesktop) {
      loadLocalBudgetList();
    }
    
    // Check Dropbox connection
    isDropboxConnected = DropboxAuth.isAuthenticated();
    
    // Handle OAuth callback
    const success = await DropboxAuth.handleCallback();
    if (success) {
      isDropboxConnected = true;
      accessToken = await DropboxAuth.getAccessToken();
      loadDropboxBudgetList();
    } else if (isDropboxConnected) {
      accessToken = await DropboxAuth.getAccessToken();
      loadDropboxBudgetList();
    }
  });

  async function loadLocalBudgetList() {
    try {
      localBudgets = await findLocalBudgets();
      console.log('[Page] Found local budgets:', localBudgets);
    } catch (e) {
      console.warn('[Page] Could not find local budgets:', e);
    }
  }

  async function loadDropboxBudgetList() {
    if (!accessToken) return;
    
    loadingBudgetList = true;
    dropboxError = null;
    
    try {
      dropboxBudgets = await BudgetLoader.listDropboxBudgets(accessToken);
      console.log('[Page] Found Dropbox budgets:', dropboxBudgets);
    } catch (e) {
      dropboxError = e instanceof Error ? e.message : 'Error loading budgets';
      console.error('[Page] Error loading Dropbox budgets:', e);
    } finally {
      loadingBudgetList = false;
    }
  }

  async function connectDropbox() {
    loadingDropbox = true;
    try {
      await DropboxAuth.authorize();
    } finally {
      loadingDropbox = false;
    }
  }

  function disconnectDropbox() {
    DropboxAuth.signOut();
    isDropboxConnected = false;
    accessToken = null;
    dropboxBudgets = [];
  }

  async function selectDropboxBudget(path: string) {
    if (!accessToken) return;
    loadingDropbox = true;
    try {
      await loadFromDropbox(accessToken, path);
    } catch (error) {
      console.error('Error loading budget:', error);
    } finally {
      loadingDropbox = false;
    }
  }

  async function selectLocalBudget(path: string) {
    loadingLocal = true;
    try {
      await loadFromLocal(path);
    } catch (error) {
      console.error('Error loading budget:', error);
    } finally {
      loadingLocal = false;
    }
  }

  async function openLocalBudget() {
    loadingLocal = true;
    try {
      const path = await openBudgetFolderDialog();
      if (path) {
        await loadFromLocal(path);
      }
    } catch (error) {
      console.error('Error loading local budget:', error);
    } finally {
      loadingLocal = false;
    }
  }

  function createNewBudget() {
    // TODO: Implement budget creation
    openModal('create-budget');
  }

  function handleAddTransaction() {
    showTransactionEntry = true;
  }

  function handleSaveTransaction(data: unknown) {
    console.log('Save transaction:', data);
    showTransactionEntry = false;
  }
</script>

{#if !$budgetInfo.client}
  <!-- Welcome screen -->
  <div class="min-h-screen flex flex-col" style="background-color: hsl(var(--background));">
    <!-- Top bar -->
    <header class="flex items-center justify-between px-4 py-3 border-b border-border" style="background-color: hsl(var(--card));">
      <h1 class="text-xl font-heading font-bold">YNAB4 Client</h1>
      <div class="flex items-center gap-2">
        <select 
          class="bg-card border border-border rounded-md px-2 py-1 text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
          value={$locale}
          onchange={(e) => setLocale(e.currentTarget.value)}
        >
          {#each supportedLocales as loc}
            <option value={loc}>{localeNames[loc]}</option>
          {/each}
        </select>
        <button
          class="p-2 rounded-lg hover:bg-accent transition-colors"
          onclick={() => openModal('settings')}
          title={$t('settings.title')}
        >
          <Settings class="h-5 w-5" />
        </button>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto p-4" style="background-color: hsl(var(--background));">
      <div class="max-w-lg mx-auto space-y-6">
        
        <!-- Dropbox Section -->
        <section class="rounded-lg border border-border p-4" style="background-color: hsl(var(--card));">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <Cloud class="h-5 w-5 text-blue-500" />
              <h2 class="font-semibold">Dropbox</h2>
            </div>
            {#if isDropboxConnected}
              <div class="flex items-center gap-2">
                <span class="flex items-center gap-1.5 text-xs text-green-600 bg-green-500/10 px-2 py-1 rounded-full">
                  <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  {$t('settings.connected')}
                </span>
                <button 
                  class="text-xs text-muted-foreground hover:text-foreground"
                  onclick={disconnectDropbox}
                >
                  {$t('dropbox.disconnect')}
                </button>
              </div>
            {:else}
              <Button size="sm" variant="outline" onclick={connectDropbox} disabled={loadingDropbox}>
                {#if loadingDropbox}
                  <Loader2 class="mr-2 h-3 w-3 animate-spin" />
                {/if}
                {$t('dropbox.connect')}
              </Button>
            {/if}
          </div>
          
          {#if isDropboxConnected}
            {#if loadingDropbox}
              <div class="flex items-center justify-center py-6">
                <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            {:else if dropboxBudgets.length === 0}
              <p class="text-sm text-muted-foreground py-4 text-center">
                {$t('budget.noBudgetsFound')}
              </p>
            {:else}
              <div class="space-y-1.5">
                {#each dropboxBudgets as budget}
                  <button
                    class="group w-full flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors text-left"
                    onclick={() => selectDropboxBudget(budget.path)}
                    disabled={loadingDropbox}
                  >
                    <span class="flex-1 font-medium truncate">{budget.name}</span>
                    <svg class="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                {/each}
              </div>
            {/if}
          {:else}
            <p class="text-sm text-muted-foreground">
              {$t('budget.dropboxDescription')}
            </p>
          {/if}
        </section>

        <!-- Local Files Section (Desktop only) -->
        {#if isDesktop}
          <section class="rounded-lg border border-border p-4" style="background-color: hsl(var(--card));">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <HardDrive class="h-5 w-5 text-[--color-terracota]" />
                <h2 class="font-semibold">{$t('localFiles.title')}</h2>
              </div>
              <Button size="sm" variant="outline" onclick={openLocalBudget}>
                <FolderOpen class="mr-2 h-3 w-3" />
                {$t('common.browse')}
              </Button>
            </div>
            
            {#if loadingLocal}
              <div class="flex items-center justify-center py-6">
                <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            {:else if localBudgets.length === 0}
              <p class="text-sm text-muted-foreground py-4 text-center">
                {$t('budget.noBudgetsFound')}
              </p>
            {:else}
              <div class="space-y-1.5">
                {#each localBudgets as budget}
                  <button
                    class="group w-full flex items-center gap-3 p-3 rounded-md hover:bg-accent transition-colors text-left"
                    onclick={() => selectLocalBudget(budget.path)}
                    disabled={loadingLocal}
                  >
                    <span class="flex-1 font-medium truncate">{budget.name}</span>
                    <svg class="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                {/each}
              </div>
            {/if}
          </section>
        {/if}

        <!-- Create New Budget -->
        <Button 
          class="w-full bg-[--color-terracota] hover:bg-[--color-terracota-dark] text-white"
          onclick={createNewBudget}
        >
          <Plus class="mr-2 h-4 w-4" />
          {$t('budget.createNew')}
        </Button>
      </div>
    </main>
  </div>
{:else}
  <!-- Budget loaded - show current view -->
  <div class="h-full">
    {#if $isLoading}
      <div class="flex items-center justify-center h-full">
        <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    {:else if $currentView === 'budget'}
      <BudgetView />
    {:else if $currentView === 'transactions'}
      <TransactionList
        onAddTransaction={handleAddTransaction}
        onEditTransaction={(id) => console.log('Edit:', id)}
      />
    {:else if $currentView === 'scheduled'}
      <ScheduledList />
    {:else if $currentView === 'reports'}
      <ReportsView />
    {:else if $currentView === 'settings'}
      <SettingsView />
    {:else}
      <BudgetView />
    {/if}
  </div>
{/if}

<!-- Modals -->
{#if $activeModal === 'budget-picker' && accessToken}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <BudgetPicker
      {accessToken}
      onClose={closeModal}
    />
  </div>
{/if}

<CreateBudgetDialog
  open={$activeModal === 'create-budget'}
  onClose={closeModal}
  onCreated={async (path) => {
    closeModal();
    // Load the newly created budget
    if (accessToken && path.startsWith('/')) {
      await loadFromDropbox(accessToken, path);
    } else {
      await loadFromLocal(path);
    }
  }}
/>

{#if $activeModal === 'settings'}
  <!-- Backdrop - completely opaque -->
  <div 
    class="fixed inset-0 z-[100]"
    style="background-color: rgba(0, 0, 0, 0.9);"
    onclick={() => {
      closeModal();
      if (isDesktop) loadLocalBudgetList();
    }}
    role="presentation"
  ></div>
  <!-- Dialog Window -->
  <div class="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
    <div class="border-2 border-border rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col" style="background-color: hsl(var(--card));">
      <div class="flex items-center justify-between px-5 py-4 text-white shrink-0" style="background-color: var(--color-sodalita);">
        <h2 class="text-lg font-heading font-bold">{$t('settings.title')}</h2>
        <button
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          onclick={() => {
            closeModal();
            if (isDesktop) loadLocalBudgetList();
          }}
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto" style="background-color: hsl(var(--background));">
        <SettingsView />
      </div>
    </div>
  </div>
{/if}

<!-- Transaction Entry Sheet -->
<TransactionEntrySheet
  open={showTransactionEntry}
  onClose={() => (showTransactionEntry = false)}
  onSave={handleSaveTransaction}
/>
