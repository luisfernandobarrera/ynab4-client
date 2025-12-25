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
  <div class="min-h-screen flex flex-col" style="background: #1a1a2e;">
    <!-- Top bar -->
    <header class="flex items-center justify-between px-4 py-3 border-b" style="background: #25253a; border-color: #404060;">
      <h1 class="text-xl font-heading font-bold text-white">YNAB4 Client</h1>
      <div class="flex items-center gap-2">
        <select 
          class="rounded-md px-2 py-1 text-sm cursor-pointer focus:outline-none text-white"
          style="background: #35354a; border: 1px solid #404060;"
          value={$locale}
          onchange={(e) => setLocale(e.currentTarget.value)}
        >
          {#each supportedLocales as loc}
            <option value={loc}>{localeNames[loc]}</option>
          {/each}
        </select>
        <button
          class="p-2 rounded-lg transition-colors text-gray-300 hover:text-white hover:bg-white/10"
          onclick={() => openModal('settings')}
          title={$t('settings.title')}
        >
          <Settings class="h-5 w-5" />
        </button>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto p-6" style="background: #1a1a2e;">
      <div class="max-w-lg mx-auto space-y-6">
        
        <!-- Dropbox Section -->
        <section class="rounded-xl p-5" style="background: #25253a; border: 1px solid #404060;">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg" style="background: rgba(59, 130, 246, 0.2);">
                <Cloud class="h-5 w-5 text-blue-400" />
              </div>
              <h2 class="text-lg font-semibold text-white">Dropbox</h2>
            </div>
            {#if isDropboxConnected}
              <div class="flex items-center gap-3">
                <span class="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full" style="background: rgba(34, 197, 94, 0.2); color: #4ade80;">
                  <span class="h-2 w-2 rounded-full bg-green-400"></span>
                  {$t('settings.connected')}
                </span>
                <button 
                  class="text-xs text-gray-400 hover:text-white transition-colors"
                  onclick={disconnectDropbox}
                >
                  {$t('dropbox.disconnect')}
                </button>
              </div>
            {:else}
              <Button size="sm" onclick={connectDropbox} disabled={loadingDropbox} style="background: #3b82f6; color: white;">
                {#if loadingDropbox}
                  <Loader2 class="mr-2 h-3 w-3 animate-spin" />
                {/if}
                {$t('dropbox.connect')}
              </Button>
            {/if}
          </div>
          
          {#if isDropboxConnected}
            {#if loadingDropbox}
              <div class="flex items-center justify-center py-8">
                <Loader2 class="h-6 w-6 animate-spin text-blue-400" />
              </div>
            {:else if dropboxBudgets.length === 0}
              <p class="text-sm text-gray-400 py-6 text-center">
                {$t('budget.noBudgetsFound')}
              </p>
            {:else}
              <div class="space-y-2">
                {#each dropboxBudgets as budget}
                  <button
                    class="group w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all text-white"
                    style="background: #1a1a2e;"
                    onmouseover={(e) => e.currentTarget.style.background = '#35354a'}
                    onmouseout={(e) => e.currentTarget.style.background = '#1a1a2e'}
                    onclick={() => selectDropboxBudget(budget.path)}
                    disabled={loadingDropbox}
                  >
                    <span class="flex-1 font-medium truncate">{budget.name}</span>
                    <svg class="h-5 w-5 text-gray-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                {/each}
              </div>
            {/if}
          {:else}
            <p class="text-sm text-gray-400">
              {$t('budget.dropboxDescription')}
            </p>
          {/if}
        </section>

        <!-- Local Files Section (Desktop only) -->
        {#if isDesktop}
          <section class="rounded-xl p-5" style="background: #25253a; border: 1px solid #404060;">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg" style="background: rgba(199, 91, 57, 0.2);">
                  <HardDrive class="h-5 w-5" style="color: #E07A5F;" />
                </div>
                <h2 class="text-lg font-semibold text-white">{$t('localFiles.title')}</h2>
              </div>
              <Button size="sm" variant="outline" onclick={openLocalBudget} style="border-color: #404060; color: white;">
                <FolderOpen class="mr-2 h-3 w-3" />
                {$t('common.browse')}
              </Button>
            </div>
            
            {#if loadingLocal}
              <div class="flex items-center justify-center py-8">
                <Loader2 class="h-6 w-6 animate-spin" style="color: #E07A5F;" />
              </div>
            {:else if localBudgets.length === 0}
              <p class="text-sm text-gray-400 py-6 text-center">
                {$t('budget.noBudgetsFound')}
              </p>
            {:else}
              <div class="space-y-2">
                {#each localBudgets as budget}
                  <button
                    class="group w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all text-white"
                    style="background: #1a1a2e;"
                    onmouseover={(e) => e.currentTarget.style.background = '#35354a'}
                    onmouseout={(e) => e.currentTarget.style.background = '#1a1a2e'}
                    onclick={() => selectLocalBudget(budget.path)}
                    disabled={loadingLocal}
                  >
                    <span class="flex-1 font-medium truncate">{budget.name}</span>
                    <svg class="h-5 w-5 text-gray-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                {/each}
              </div>
            {/if}
          </section>
        {/if}

        <!-- Create New Budget -->
        <button 
          class="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
          style="background: #C75B39;"
          onclick={createNewBudget}
        >
          <Plus class="h-5 w-5" />
          {$t('budget.createNew')}
        </button>
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
  <!-- Backdrop -->
  <div 
    class="fixed inset-0 z-[100]"
    style="background: rgba(0, 0, 0, 0.95);"
    onclick={() => {
      closeModal();
      if (isDesktop) loadLocalBudgetList();
    }}
    role="presentation"
  ></div>
  <!-- Dialog Window -->
  <div class="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
    <div class="rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col" style="background: #25253a; border: 2px solid #404060;">
      <div class="flex items-center justify-between px-5 py-4 text-white shrink-0" style="background: #2D4A6F;">
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
      <div class="flex-1 overflow-y-auto" style="background: #1a1a2e;">
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
