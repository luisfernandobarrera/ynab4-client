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
  <div class="min-h-screen flex flex-col bg-background">
    <!-- Top bar with actions -->
    <header class="flex items-center justify-between px-4 py-3 border-b border-border">
      <h1 class="text-xl font-heading font-bold">YNAB4</h1>
      <div class="flex items-center gap-1">
        {#if isDesktop}
          <button
            class="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            onclick={openLocalBudget}
            title={$t('localFiles.open')}
          >
            <FolderOpen class="h-5 w-5" />
          </button>
        {/if}
        {#if !isDropboxConnected}
          <button
            class="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            onclick={connectDropbox}
            disabled={loadingDropbox}
            title={$t('dropbox.connect')}
          >
            {#if loadingDropbox}
              <Loader2 class="h-5 w-5 animate-spin" />
            {:else}
              <Cloud class="h-5 w-5" />
            {/if}
          </button>
        {:else}
          <span class="flex items-center gap-1 px-2 text-xs text-green-600">
            <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
            Dropbox
          </span>
        {/if}
        <div class="w-px h-5 bg-border mx-1"></div>
        <select 
          class="bg-transparent text-sm cursor-pointer focus:outline-none text-muted-foreground hover:text-foreground"
          value={$locale}
          onchange={(e) => setLocale(e.currentTarget.value)}
        >
          {#each supportedLocales as loc}
            <option value={loc}>{localeNames[loc]}</option>
          {/each}
        </select>
        <button
          class="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          onclick={() => openModal('settings')}
          title={$t('settings.title')}
        >
          <Settings class="h-5 w-5" />
        </button>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto p-4">
      <div class="max-w-lg mx-auto">
        <!-- Budget list -->
        {#if loadingBudgetList}
          <div class="flex items-center justify-center py-20">
            <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        {:else}
          {@const allBudgets = isDesktop ? localBudgets : dropboxBudgets}
          
          {#if allBudgets.length === 0}
            <div class="text-center py-16">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <FolderOpen class="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 class="text-lg font-medium mb-2">{$t('budget.noBudgetsFound')}</h2>
              <p class="text-sm text-muted-foreground mb-6">
                {$t('welcome.getStarted') || 'Create a new budget or connect to Dropbox'}
              </p>
              <div class="flex flex-col gap-2 max-w-xs mx-auto">
                <Button onclick={createNewBudget} class="w-full">
                  <Plus class="mr-2 h-4 w-4" />
                  {$t('budget.createNew')}
                </Button>
                {#if !isDropboxConnected}
                  <Button variant="outline" onclick={connectDropbox} class="w-full">
                    <Cloud class="mr-2 h-4 w-4" />
                    {$t('dropbox.connect')}
                  </Button>
                {/if}
              </div>
            </div>
          {:else}
            <div class="space-y-2">
              {#each allBudgets as budget}
                {@const isDropboxBudget = budget.path.toLowerCase().includes('dropbox')}
                <button
                  class="group w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/30 transition-all text-left"
                  onclick={() => isDesktop ? selectLocalBudget(budget.path) : selectDropboxBudget(budget.path)}
                  disabled={loadingLocal || loadingDropbox}
                >
                  <div class="p-2 rounded-md {isDropboxBudget ? 'bg-blue-500/10' : 'bg-orange-500/10'}">
                    {#if isDropboxBudget}
                      <Cloud class="h-4 w-4 text-blue-500" />
                    {:else}
                      <HardDrive class="h-4 w-4 text-orange-500" />
                    {/if}
                  </div>
                  <span class="flex-1 font-medium truncate">{budget.name}</span>
                  {#if loadingLocal || loadingDropbox}
                    <Loader2 class="h-4 w-4 animate-spin shrink-0" />
                  {:else}
                    <svg class="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </main>

    <!-- Bottom action bar (only when budgets exist) -->
    {@const allBudgets = isDesktop ? localBudgets : dropboxBudgets}
    {#if allBudgets.length > 0}
      <footer class="border-t border-border p-3">
        <div class="max-w-lg mx-auto">
          <Button 
            variant="outline" 
            class="w-full"
            onclick={createNewBudget}
          >
            <Plus class="mr-2 h-4 w-4" />
            {$t('budget.createNew')}
          </Button>
        </div>
      </footer>
    {/if}
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
  <!-- Backdrop -->
  <div 
    class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
    onclick={() => {
      closeModal();
      if (isDesktop) loadLocalBudgetList();
    }}
    role="presentation"
  ></div>
  <!-- Dialog -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
    <div class="bg-background border border-border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto">
      <div class="sticky top-0 flex justify-end p-3 bg-background/95 backdrop-blur border-b border-border">
        <button
          class="p-2 rounded-lg hover:bg-accent transition-colors"
          onclick={() => {
            closeModal();
            if (isDesktop) loadLocalBudgetList();
          }}
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <SettingsView />
    </div>
  </div>
{/if}

<!-- Transaction Entry Sheet -->
<TransactionEntrySheet
  open={showTransactionEntry}
  onClose={() => (showTransactionEntry = false)}
  onSave={handleSaveTransaction}
/>
