<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { FolderOpen, Cloud, Loader2, Plus, HardDrive, Settings, Languages, X } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { BudgetPicker, BudgetView, CreateBudgetDialog } from '$lib/components/budget';
  import { TransactionList } from '$lib/components/transactions';
  import { TransactionEntrySheet } from '$lib/components/entry';
  import { ScheduledList } from '$lib/components/scheduled';
  import { ReportsView } from '$lib/components/reports';
  import { SettingsView, ThemeToggle } from '$lib/components/settings';
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
                class="h-10 px-3 rounded-lg font-medium text-white flex items-center gap-2 transition-all hover:opacity-90 bg-[var(--info)]"
                title="Dropbox"
              >
                {#if loadingDropbox}
                  <Loader2 class="h-5 w-5 animate-spin" />
                {:else}
                  <Cloud class="h-5 w-5" />
                {/if}
              </button>
            {:else}
              <span class="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-[var(--success)]/20 text-[var(--success)]">
                <span class="h-2 w-2 rounded-full bg-[var(--success)]"></span>
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
                class="h-9 px-3 transition-colors {budgetFilter === 'dropbox' ? 'bg-[var(--accent)] text-[var(--info)]' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}"
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
              <FolderOpen class="h-8 w-8 text-[var(--muted-foreground)]" />
            </div>
            <p class="text-[var(--muted-foreground)] mb-2">{$t('budget.noBudgetsFound')}</p>
            <p class="text-sm text-[var(--muted-foreground)]">{$t('welcome.getStarted')}</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {#each filteredBudgets as budget}
              <button
                class="group p-4 rounded-xl text-left transition-all hover:scale-[1.02] bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)]"
                onclick={() => budget.source === 'dropbox' ? selectDropboxBudget(budget.path) : selectLocalBudget(budget.path)}
              >
                <div class="flex items-start justify-between mb-3">
                  <h3 class="font-semibold text-[var(--foreground)] truncate pr-2">{budget.name}</h3>
                  {#if budget.source === 'dropbox'}
                    <Cloud class="h-4 w-4 text-[var(--info)] shrink-0" />
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
  </div>
{:else}
  <!-- Budget loaded - show current view -->
  <div class="h-full bg-[var(--background)]">
    {#if $isLoading}
      <div class="flex items-center justify-center h-full">
        <Loader2 class="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
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
