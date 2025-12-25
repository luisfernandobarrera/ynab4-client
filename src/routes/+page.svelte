<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { FolderOpen, Cloud, Loader2, Plus, HardDrive, RefreshCw, Settings, Languages, X } from 'lucide-svelte';
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
  let budgetFilter = $state<'all' | 'dropbox' | 'local'>('all');

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
  {@const allBudgets = [...dropboxBudgets.map(b => ({...b, source: 'dropbox' as const})), ...localBudgets.map(b => ({...b, source: 'local' as const}))]}
  {@const filteredBudgets = budgetFilter === 'all' ? allBudgets : allBudgets.filter(b => b.source === budgetFilter)}
  
  <!-- Welcome screen -->
  <div class="min-h-screen flex flex-col" style="background: #1a1a2e;">
    <!-- Top bar -->
    <header class="flex items-center justify-between px-4 py-3 border-b" style="background: #25253a; border-color: #404060;">
      <h1 class="text-xl font-heading font-bold text-white">YNAB4 Client</h1>
      <div class="flex items-center gap-1">
        <button
          class="p-2 rounded-lg transition-colors text-gray-300 hover:text-white hover:bg-white/10"
          onclick={() => openModal('language')}
          title={$t('settings.language')}
        >
          <Languages class="h-5 w-5" />
        </button>
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
    <main class="flex-1 overflow-y-auto p-4" style="background: #1a1a2e;">
      <div class="max-w-4xl mx-auto space-y-4">
        
        <!-- Action bar -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <!-- Create button -->
            <button 
              class="h-10 px-4 rounded-lg font-medium text-white flex items-center gap-2 transition-all hover:opacity-90"
              style="background: #C75B39;"
              onclick={createNewBudget}
              title={$t('budget.createNew')}
            >
              <Plus class="h-5 w-5" />
              <span class="hidden sm:inline">{$t('budget.create')}</span>
            </button>
            
            <!-- Browse local -->
            {#if isDesktop}
              <button 
                onclick={openLocalBudget}
                class="h-10 px-3 rounded-lg text-gray-300 hover:text-white flex items-center gap-2 transition-colors"
                style="border: 1px solid #404060;"
                title={$t('common.browse')}
              >
                <FolderOpen class="h-5 w-5" />
              </button>
            {/if}
            
            <!-- Dropbox connection -->
            {#if !isDropboxConnected}
              <button 
                onclick={connectDropbox} 
                disabled={loadingDropbox}
                class="h-10 px-3 rounded-lg font-medium text-white flex items-center gap-2 transition-all hover:opacity-90"
                style="background: #3b82f6;"
                title="Dropbox"
              >
                {#if loadingDropbox}
                  <Loader2 class="h-5 w-5 animate-spin" />
                {:else}
                  <Cloud class="h-5 w-5" />
                {/if}
              </button>
            {:else}
              <span class="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full" style="background: rgba(34, 197, 94, 0.2); color: #4ade80;">
                <span class="h-2 w-2 rounded-full bg-green-400"></span>
                <Cloud class="h-3 w-3" />
              </span>
            {/if}
          </div>
          
          <!-- Filter icons (only in Tauri with both sources) -->
          {#if isDesktop && (dropboxBudgets.length > 0 || localBudgets.length > 0)}
            <div class="flex items-center rounded-lg overflow-hidden" style="border: 1px solid #404060;">
              <button 
                onclick={() => budgetFilter = 'all'}
                class="h-9 px-3 text-sm transition-colors {budgetFilter === 'all' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}"
                style={budgetFilter === 'all' ? 'background: #404060;' : ''}
              >
                {$t('common.all')}
              </button>
              <button 
                onclick={() => budgetFilter = 'dropbox'}
                class="h-9 px-3 transition-colors {budgetFilter === 'dropbox' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}"
                style={budgetFilter === 'dropbox' ? 'background: #404060;' : ''}
                title="Dropbox"
              >
                <Cloud class="h-4 w-4" />
              </button>
              <button 
                onclick={() => budgetFilter = 'local'}
                class="h-9 px-3 transition-colors {budgetFilter === 'local' ? '' : 'text-gray-500 hover:text-gray-300'}"
                style={budgetFilter === 'local' ? 'background: #404060; color: #E07A5F;' : ''}
                title={$t('localFiles.title')}
              >
                <HardDrive class="h-4 w-4" />
              </button>
            </div>
          {/if}
        </div>
        
        <!-- Budget grid -->
        {#if loadingBudgetList || loadingDropbox || loadingLocal}
          <div class="flex items-center justify-center py-16">
            <Loader2 class="h-8 w-8 animate-spin text-gray-400" />
          </div>
        {:else if filteredBudgets.length === 0}
          <div class="text-center py-16">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style="background: #25253a;">
              <FolderOpen class="h-8 w-8 text-gray-500" />
            </div>
            <p class="text-gray-400 mb-2">{$t('budget.noBudgetsFound')}</p>
            <p class="text-sm text-gray-500">{$t('welcome.getStarted')}</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {#each filteredBudgets as budget}
              <button
                class="group p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
                style="background: #25253a; border: 1px solid #404060;"
                onmouseover={(e) => e.currentTarget.style.borderColor = budget.source === 'dropbox' ? '#3b82f6' : '#C75B39'}
                onmouseout={(e) => e.currentTarget.style.borderColor = '#404060'}
                onclick={() => budget.source === 'dropbox' ? selectDropboxBudget(budget.path) : selectLocalBudget(budget.path)}
              >
                <div class="flex items-start justify-between mb-3">
                  <h3 class="font-semibold text-white truncate pr-2">{budget.name}</h3>
                  {#if budget.source === 'dropbox'}
                    <Cloud class="h-4 w-4 text-blue-400 shrink-0" />
                  {:else}
                    <HardDrive class="h-4 w-4 shrink-0" style="color: #E07A5F;" />
                  {/if}
                </div>
                <div class="text-xs text-gray-500">
                  {budget.source === 'dropbox' ? 'Dropbox' : $t('localFiles.title')}
                </div>
              </button>
            {/each}
          </div>
        {/if}
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
          <X class="h-5 w-5" />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto" style="background: #1a1a2e;">
        <SettingsView />
      </div>
    </div>
  </div>
{/if}

{#if $activeModal === 'language'}
  <!-- Language selector fullscreen -->
  <div 
    class="fixed inset-0 z-[100]"
    style="background: rgba(0, 0, 0, 0.95);"
    onclick={() => closeModal()}
    role="presentation"
  ></div>
  <div class="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
    <div class="rounded-xl shadow-2xl w-full max-w-sm overflow-hidden pointer-events-auto" style="background: #25253a; border: 2px solid #404060;">
      <div class="flex items-center justify-between px-5 py-4 text-white" style="background: #2D4A6F;">
        <h2 class="text-lg font-heading font-bold flex items-center gap-2">
          <Languages class="h-5 w-5" />
          {$t('settings.language')}
        </h2>
        <button
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          onclick={() => closeModal()}
          aria-label="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>
      <div class="p-2" style="background: #1a1a2e;">
        {#each supportedLocales as loc}
          <button
            class="w-full p-4 rounded-lg text-left transition-colors flex items-center justify-between {$locale === loc ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}"
            style={$locale === loc ? 'background: #404060;' : ''}
            onclick={() => { setLocale(loc); closeModal(); }}
          >
            <span class="text-lg">{localeNames[loc]}</span>
            {#if $locale === loc}
              <span class="text-green-400">✓</span>
            {/if}
          </button>
        {/each}
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
