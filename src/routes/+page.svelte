<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { FolderOpen, Cloud, Loader2, Plus, HardDrive, Settings, Languages, X } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { BudgetPicker, BudgetView, CreateBudgetDialog } from '$lib/components/budget';
  import { TransactionList } from '$lib/components/transactions';
  import { TransactionEntrySheet } from '$lib/components/entry';
    import { ReportsView } from '$lib/components/reports';
  import { SettingsView, ThemeToggle, DevicesView } from '$lib/components/settings';
  import { ReconciliationView } from '$lib/components/reconciliation';
  import { CashFlowView } from '$lib/components/cashflow';
  import { PayeesView } from '$lib/components/payees';
  import { EditModeWarning } from '$lib/components/edit-mode';
  import { CreateAccountView } from '$lib/components/accounts';
  import { ImportView } from '$lib/components/import';
  import { budgetInfo, currentView, isLoading, loadFromLocal, loadFromDropbox } from '$lib/stores/budget';
  import { activeModal, openModal, closeModal, isMobile } from '$lib/stores/ui';
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
  let loadingBudgetPath = $state<string | null>(null); // Track which budget is loading

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

  // Check if error is token-related
  const isTokenError = $derived(
    dropboxError?.toLowerCase().includes('token') ||
    dropboxError?.toLowerCase().includes('expired') ||
    dropboxError?.toLowerCase().includes('reconnect') ||
    dropboxError?.toLowerCase().includes('unauthorized')
  );

  // Handle retry - reconnect if token error, otherwise just reload
  async function handleDropboxRetry() {
    if (isTokenError) {
      // Token expired - need to reconnect
      disconnectDropbox();
      await connectDropbox();
    } else {
      // Other error - just retry loading
      await loadDropboxBudgetList();
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
    loadingBudgetPath = path;
    try {
      await loadFromDropbox(accessToken, path);
    } catch (error) {
      console.error('Error loading budget:', error);
    } finally {
      loadingDropbox = false;
      loadingBudgetPath = null;
    }
  }

  async function selectLocalBudget(path: string) {
    console.log('[Page] Selecting local budget:', path);
    loadingLocal = true;
    loadingBudgetPath = path;
    try {
      await loadFromLocal(path);
      console.log('[Page] Budget loaded successfully');
    } catch (error) {
      console.error('[Page] Error loading budget:', error);
      alert(`Error loading budget: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      loadingLocal = false;
      loadingBudgetPath = null;
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
  <div class="min-h-screen flex flex-col bg-[var(--background)]">
    <!-- Top bar -->
    <header class="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--card)]">
      <h1 class="text-xl font-heading font-bold text-[var(--foreground)]">YNAB4 Client</h1>
      <div class="flex items-center gap-1">
        <ThemeToggle compact />
        <button
          class="p-2 rounded-lg transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
          onclick={() => openModal('language')}
          title={$t('settings.language')}
        >
          <Languages class="h-5 w-5" />
        </button>
        <button
          class="p-2 rounded-lg transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]"
          onclick={() => openModal('settings')}
          title={$t('settings.title')}
        >
          <Settings class="h-5 w-5" />
        </button>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto p-4 bg-[var(--background)]">
      <div class="max-w-4xl mx-auto space-y-4">
        
        <!-- Action bar -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <!-- Create button -->
            <button 
              class="h-10 px-4 rounded-lg font-medium text-[var(--primary-foreground)] bg-[var(--primary)] flex items-center gap-2 transition-all hover:opacity-90"
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
                class="h-10 px-3 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex items-center gap-2 transition-colors border border-[var(--border)] bg-[var(--card)]"
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
                class="h-10 px-3 rounded-lg font-medium text-white flex items-center gap-2 transition-all hover:opacity-90 bg-blue-500"
                title="Dropbox"
              >
                {#if loadingDropbox}
                  <Loader2 class="h-5 w-5 animate-spin" />
                {:else}
                  <Cloud class="h-5 w-5" />
                {/if}
              </button>
            {:else}
              <span class="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-500">
                <span class="h-2 w-2 rounded-full bg-green-500"></span>
                <Cloud class="h-3 w-3" />
              </span>
            {/if}
          </div>
          
          <!-- Filter icons (only in Tauri with both sources) -->
          {#if isDesktop && (dropboxBudgets.length > 0 || localBudgets.length > 0)}
            <div class="flex items-center rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--card)]">
              <button 
                onclick={() => budgetFilter = 'all'}
                class="h-9 px-3 text-sm transition-colors {budgetFilter === 'all' ? 'bg-[var(--accent)] text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}"
              >
                {$t('common.all')}
              </button>
              <button 
                onclick={() => budgetFilter = 'dropbox'}
                class="h-9 px-3 transition-colors {budgetFilter === 'dropbox' ? 'bg-[var(--accent)] text-blue-500' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}"
                title="Dropbox"
              >
                <Cloud class="h-4 w-4" />
              </button>
              <button 
                onclick={() => budgetFilter = 'local'}
                class="h-9 px-3 transition-colors {budgetFilter === 'local' ? 'bg-[var(--accent)] text-[var(--primary)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}"
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
            <Loader2 class="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
          </div>
        {:else if filteredBudgets.length === 0}
          <div class="text-center py-16">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-[var(--card)]">
              {#if !isDropboxConnected}
                <Cloud class="h-8 w-8 text-blue-500" />
              {:else}
                <FolderOpen class="h-8 w-8 text-[var(--muted-foreground)]" />
              {/if}
            </div>
            
            {#if !isDropboxConnected}
              <!-- Not connected to Dropbox -->
              <p class="text-[var(--foreground)] font-medium mb-2">{$t('budget.connectDropbox')}</p>
              <p class="text-sm text-[var(--muted-foreground)] mb-6 max-w-sm mx-auto">
                {$t('welcome.getStarted')}
              </p>
              <button 
                onclick={connectDropbox} 
                disabled={loadingDropbox}
                class="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all hover:opacity-90 bg-blue-500"
              >
                {#if loadingDropbox}
                  <Loader2 class="h-5 w-5 animate-spin" />
                {:else}
                  <Cloud class="h-5 w-5" />
                {/if}
                {$t('dropbox.connect')}
              </button>
            {:else if dropboxError}
              <!-- Dropbox error -->
              <p class="text-[var(--destructive)] mb-2">{dropboxError}</p>
              <button
                onclick={handleDropboxRetry}
                class="text-sm text-[var(--primary)] hover:underline"
              >
                {isTokenError ? $t('dropbox.connect') : $t('common.retry')}
              </button>
            {:else}
              <!-- Connected but no budgets found -->
              <p class="text-[var(--muted-foreground)] mb-2">{$t('budget.noBudgetsFound')}</p>
              <p class="text-sm text-[var(--muted-foreground)]">{$t('welcome.getStarted')}</p>
            {/if}
          </div>
        {:else}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {#each filteredBudgets as budget}
              {@const isLoadingThis = loadingBudgetPath === budget.path}
              <button
                class="group p-4 rounded-xl text-left transition-all hover:scale-[1.02] bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] disabled:opacity-50 disabled:cursor-wait relative overflow-hidden"
                onclick={() => budget.source === 'dropbox' ? selectDropboxBudget(budget.path) : selectLocalBudget(budget.path)}
                disabled={loadingBudgetPath !== null}
              >
                {#if isLoadingThis}
                  <div class="absolute inset-0 bg-[var(--card)]/90 flex items-center justify-center z-10">
                    <Loader2 class="h-6 w-6 animate-spin text-[var(--primary)]" />
                  </div>
                {/if}
                <div class="flex items-start justify-between mb-3">
                  <h3 class="font-semibold text-[var(--foreground)] truncate pr-2">{budget.name}</h3>
                  {#if budget.source === 'dropbox'}
                    <Cloud class="h-4 w-4 text-blue-500 shrink-0" />
                  {:else}
                    <HardDrive class="h-4 w-4 shrink-0 text-[var(--primary)]" />
                  {/if}
                </div>
                <div class="text-xs text-[var(--muted-foreground)]">
                  {budget.source === 'dropbox' ? 'Dropbox' : $t('localFiles.title')}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </main>
    
    <!-- Loading overlay when opening a budget -->
    {#if loadingBudgetPath}
      <div class="fixed inset-0 bg-[var(--background)]/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div class="flex flex-col items-center gap-4 p-8 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl">
          <Loader2 class="h-12 w-12 animate-spin text-[var(--primary)]" />
          <p class="text-lg font-medium text-[var(--foreground)]">{$t('common.loading')}</p>
          <p class="text-sm text-[var(--muted-foreground)] max-w-xs text-center truncate">
            {loadingBudgetPath.split('/').pop() || loadingBudgetPath}
          </p>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <!-- Budget loaded - content only (layout handles sidebar) -->
  {#if $isLoading}
    <div class="flex items-center justify-center h-full">
      <Loader2 class="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
    </div>
  {:else if $currentView === 'transactions'}
    <TransactionList
      onAddTransaction={handleAddTransaction}
      onEditTransaction={(id) => console.log('Edit:', id)}
    />
  {:else if $currentView === 'budget'}
    <BudgetView />
  {:else if $currentView === 'reconciliation'}
    <ReconciliationView />
  {:else if $currentView === 'cashflow'}
    <CashFlowView />
  {:else if $currentView === 'reports'}
    <ReportsView />
  {:else if $currentView === 'payees'}
    <PayeesView />
  {:else if $currentView === 'import'}
    <ImportView />
  {:else if $currentView === 'createAccount'}
    <CreateAccountView />
  {:else if $currentView === 'devices'}
    <DevicesView />
  {:else if $currentView === 'settings'}
    <SettingsView />
  {:else}
    <TransactionList
      onAddTransaction={handleAddTransaction}
      onEditTransaction={(id) => console.log('Edit:', id)}
    />
  {/if}
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
  onCreated={async (path, source) => {
    closeModal();
    
    // Refresh the budget list first
    if (isDesktop) {
      await loadLocalBudgetList();
    }
    if (source === 'dropbox' && accessToken) {
      await loadDropboxBudgetList();
    }
    
    // Then try to load the new budget
    try {
      if (source === 'dropbox' && accessToken) {
        await loadFromDropbox(accessToken, path);
      } else {
        await loadFromLocal(path);
      }
    } catch (e) {
      console.error('[CreateBudget] Error loading new budget:', e);
      // Budget was created, list is refreshed, user can manually open it
    }
  }}
/>

{#if $activeModal === 'settings'}
  <!-- Backdrop -->
  <div 
    class="fixed inset-0 z-[100] bg-black/80"
    onclick={() => {
      closeModal();
      if (isDesktop) loadLocalBudgetList();
    }}
    role="presentation"
  ></div>
  <!-- Dialog Window -->
  <div class="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
    <div class="rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col bg-[var(--card)] border-2 border-[var(--border)]">
      <div class="flex items-center justify-between px-5 py-4 bg-[var(--secondary)] text-[var(--secondary-foreground)] shrink-0">
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
      <div class="flex-1 overflow-y-auto bg-[var(--background)]">
        <SettingsView />
      </div>
    </div>
  </div>
{/if}

{#if $activeModal === 'language'}
  <!-- Language selector fullscreen -->
  <div 
    class="fixed inset-0 z-[100] bg-black/80"
    onclick={() => closeModal()}
    role="presentation"
  ></div>
  <div class="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
    <div class="rounded-xl shadow-2xl w-full max-w-sm overflow-hidden pointer-events-auto bg-[var(--card)] border-2 border-[var(--border)]">
      <div class="flex items-center justify-between px-5 py-4 bg-[var(--secondary)] text-[var(--secondary-foreground)]">
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
      <div class="p-2 bg-[var(--background)]">
        {#each supportedLocales as loc}
          <button
            class="w-full p-4 rounded-lg text-left transition-colors flex items-center justify-between {$locale === loc ? 'bg-[var(--accent)] text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]'}"
            onclick={() => { setLocale(loc); closeModal(); }}
          >
            <span class="text-lg">{localeNames[loc]}</span>
            {#if $locale === loc}
              <span class="text-[var(--success)]">✓</span>
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

<!-- Edit Mode Warning Modal -->
<EditModeWarning />

