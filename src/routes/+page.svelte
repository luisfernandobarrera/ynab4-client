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
  <div class="min-h-screen p-6 bg-gradient-to-b from-background to-background/95">
    <div class="max-w-xl mx-auto space-y-6">
      <!-- Header -->
      <div class="text-center space-y-2 pt-6">
        <h1 class="text-3xl font-heading font-bold tracking-tight">YNAB4</h1>
        <p class="text-sm text-muted-foreground">{$t('welcome.subtitle')}</p>
      </div>

      <!-- Budgets Section -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold">{$t('budget.yourBudgets') || 'Your Budgets'}</h2>
          <div class="flex items-center gap-2">
            {#if isDesktop}
              <Button variant="ghost" size="sm" onclick={openLocalBudget}>
                <FolderOpen class="h-4 w-4" />
              </Button>
            {/if}
            {#if !isDropboxConnected}
              <Button variant="ghost" size="sm" onclick={connectDropbox} disabled={loadingDropbox}>
                {#if loadingDropbox}
                  <Loader2 class="h-4 w-4 animate-spin" />
                {:else}
                  <Cloud class="h-4 w-4" />
                {/if}
              </Button>
            {/if}
          </div>
        </div>

        <!-- Unified budget list -->
        {#if loadingBudgetList}
          <div class="flex items-center justify-center py-12">
            <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        {:else}
          {@const allBudgets = isDesktop 
            ? localBudgets 
            : dropboxBudgets}
          
          {#if allBudgets.length === 0}
            <div class="rounded-xl border-2 border-dashed border-border p-8 text-center">
              <p class="text-muted-foreground text-sm mb-4">
                {$t('budget.noBudgetsFound')}
              </p>
              {#if !isDropboxConnected}
                <Button variant="outline" size="sm" onclick={connectDropbox}>
                  <Cloud class="mr-2 h-4 w-4" />
                  {$t('dropbox.connect')}
                </Button>
              {/if}
            </div>
          {:else}
            <div class="grid gap-2">
              {#each allBudgets as budget}
                {@const isDropboxBudget = budget.path.toLowerCase().includes('dropbox')}
                <button
                  class="group w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/30 transition-all text-left"
                  onclick={() => isDesktop ? selectLocalBudget(budget.path) : selectDropboxBudget(budget.path)}
                  disabled={loadingLocal || loadingDropbox}
                >
                  <div class="p-2 rounded-lg {isDropboxBudget ? 'bg-blue-500/10' : 'bg-orange-500/10'}">
                    {#if isDropboxBudget}
                      <Cloud class="h-5 w-5 text-blue-500" />
                    {:else}
                      <HardDrive class="h-5 w-5 text-orange-500" />
                    {/if}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium truncate">{budget.name}</p>
                    <p class="text-xs text-muted-foreground">
                      {isDropboxBudget ? 'Dropbox' : $t('localFiles.title') || 'Local'}
                    </p>
                  </div>
                  {#if loadingLocal || loadingDropbox}
                    <Loader2 class="h-4 w-4 animate-spin shrink-0" />
                  {:else}
                    <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        {/if}

        <!-- Dropbox connection status (only in browser, not Tauri) -->
        {#if !isDesktop && isDropboxConnected}
          <div class="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <span class="flex items-center gap-1.5">
              <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
              Dropbox {$t('settings.connected')}
            </span>
            <button class="hover:text-foreground" onclick={disconnectDropbox}>
              {$t('dropbox.disconnect')}
            </button>
          </div>
        {/if}
      </section>

      <!-- Create New Budget -->
      <Button 
        variant="outline" 
        class="w-full h-11"
        onclick={createNewBudget}
      >
        <Plus class="mr-2 h-4 w-4" />
        {$t('budget.createNew')}
      </Button>

      <!-- Footer -->
      <div class="flex justify-center items-center gap-3 pt-2">
        <select 
          class="bg-card border border-border rounded-lg px-3 py-1.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
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
          aria-label="Settings"
        >
          <Settings class="h-5 w-5" />
        </button>
      </div>
    </div>
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
