<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { FolderOpen, Cloud, Loader2, Plus, HardDrive, RefreshCw } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { BudgetPicker, BudgetView } from '$lib/components/budget';
  import { TransactionList } from '$lib/components/transactions';
  import { TransactionEntrySheet } from '$lib/components/entry';
  import { ScheduledList } from '$lib/components/scheduled';
  import { ReportsView } from '$lib/components/reports';
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
    <div class="max-w-2xl mx-auto space-y-8">
      <!-- Header -->
      <div class="text-center space-y-2 pt-8">
        <h1 class="text-4xl font-heading font-bold tracking-tight">YNAB4</h1>
        <p class="text-muted-foreground">{$t('welcome.subtitle')}</p>
      </div>

      <!-- Dropbox Section -->
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold flex items-center gap-2">
            <Cloud class="h-5 w-5 text-blue-500" />
            Dropbox
          </h2>
          {#if isDropboxConnected}
            <button 
              class="text-sm text-muted-foreground hover:text-foreground"
              onclick={disconnectDropbox}
            >
              {$t('dropbox.disconnect')}
            </button>
          {/if}
        </div>

        {#if !isDropboxConnected}
          <Button 
            class="w-full h-12" 
            onclick={connectDropbox}
            disabled={loadingDropbox}
          >
            {#if loadingDropbox}
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            {:else}
              <Cloud class="mr-2 h-4 w-4" />
            {/if}
            {$t('dropbox.connect')}
          </Button>
        {:else}
          <div class="rounded-lg border bg-card">
            {#if loadingBudgetList}
              <div class="flex items-center justify-center py-8">
                <Loader2 class="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            {:else if dropboxError}
              <div class="p-4 text-center">
                <p class="text-sm text-destructive mb-2">{dropboxError}</p>
                <Button variant="outline" size="sm" onclick={loadDropboxBudgetList}>
                  <RefreshCw class="mr-2 h-3 w-3" />
                  {$t('common.refresh')}
                </Button>
              </div>
            {:else if dropboxBudgets.length === 0}
              <div class="p-4 text-center text-muted-foreground text-sm">
                {$t('budget.noBudgetsFound')}
              </div>
            {:else}
              <div class="divide-y">
                {#each dropboxBudgets as budget}
                  <button
                    class="w-full flex items-center justify-between p-4 hover:bg-accent transition-colors text-left"
                    onclick={() => selectDropboxBudget(budget.path)}
                    disabled={loadingDropbox}
                  >
                    <div>
                      <p class="font-medium">{budget.name}</p>
                      <p class="text-xs text-muted-foreground">{budget.path}</p>
                    </div>
                    {#if loadingDropbox}
                      <Loader2 class="h-4 w-4 animate-spin" />
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </section>

      <!-- Local Files Section (Desktop only) -->
      {#if isDesktop}
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <HardDrive class="h-5 w-5 text-orange-500" />
              {$t('localFiles.title') || 'Local'}
            </h2>
            <Button variant="ghost" size="sm" onclick={openLocalBudget}>
              <FolderOpen class="mr-2 h-3 w-3" />
              {$t('common.search') || 'Browse'}
            </Button>
          </div>

          {#if localBudgets.length > 0}
            <div class="rounded-lg border bg-card divide-y">
              {#each localBudgets as budget}
                <button
                  class="w-full flex items-center justify-between p-4 hover:bg-accent transition-colors text-left"
                  onclick={() => selectLocalBudget(budget.path)}
                  disabled={loadingLocal}
                >
                  <div>
                    <p class="font-medium">{budget.name}</p>
                    <p class="text-xs text-muted-foreground truncate max-w-[300px]">{budget.path}</p>
                  </div>
                  {#if loadingLocal}
                    <Loader2 class="h-4 w-4 animate-spin" />
                  {/if}
                </button>
              {/each}
            </div>
          {:else}
            <div class="rounded-lg border bg-card p-4 text-center text-muted-foreground text-sm">
              {$t('budget.noBudgetsFound')}
            </div>
          {/if}
        </section>
      {/if}

      <!-- Create New Budget -->
      <section class="pt-4 border-t">
        <Button 
          variant="outline" 
          class="w-full h-12"
          onclick={createNewBudget}
        >
          <Plus class="mr-2 h-4 w-4" />
          {$t('budget.createNew') || 'Create New Budget'}
        </Button>
      </section>

      <!-- Language selector -->
      <div class="flex justify-center pt-4">
        <select 
          class="bg-card border border-border rounded-md px-3 py-1.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
          value={$locale}
          onchange={(e) => setLocale(e.currentTarget.value)}
        >
          {#each supportedLocales as loc}
            <option value={loc}>{localeNames[loc]}</option>
          {/each}
        </select>
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
      <div class="container mx-auto p-6">
        <h2 class="text-2xl font-heading font-bold">{$t('settings.title')}</h2>
        <p class="text-muted-foreground mt-2">Coming soon...</p>
      </div>
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

{#if $activeModal === 'create-budget'}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="bg-card rounded-lg p-6 max-w-md w-full">
      <h2 class="text-xl font-heading font-bold mb-4">Create New Budget</h2>
      <p class="text-muted-foreground mb-4">
        Budget creation is coming soon. For now, you can create a budget in YNAB4 desktop app.
      </p>
      <Button onclick={closeModal} class="w-full">
        {$t('common.close')}
      </Button>
    </div>
  </div>
{/if}

<!-- Transaction Entry Sheet -->
<TransactionEntrySheet
  open={showTransactionEntry}
  onClose={() => (showTransactionEntry = false)}
  onSave={handleSaveTransaction}
/>
