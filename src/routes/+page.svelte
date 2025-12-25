<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { FolderOpen, Cloud, Loader2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { BudgetPicker, BudgetView } from '$lib/components/budget';
  import { TransactionList } from '$lib/components/transactions';
  import { TransactionEntrySheet } from '$lib/components/entry';
  import { ScheduledList } from '$lib/components/scheduled';
  import { ReportsView } from '$lib/components/reports';
  import { budgetInfo, currentView, isLoading, loadFromLocal } from '$lib/stores/budget';
  import { activeModal, openModal, closeModal } from '$lib/stores/ui';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';
  import { openBudgetFolderDialog } from '$lib/services';
  import { t, locale, supportedLocales, setLocale, localeNames } from '$lib/i18n';

  let isDropboxConnected = $state(false);
  let accessToken = $state<string | null>(null);
  let showTransactionEntry = $state(false);
  let isDesktop = $state(false);
  let loadingLocal = $state(false);
  let loadingDropbox = $state(false);

  onMount(async () => {
    // Check if running in Tauri (desktop)
    if (browser) {
      isDesktop = typeof (window as { __TAURI__?: unknown }).__TAURI__ !== 'undefined';
      console.log('[Page] isDesktop:', isDesktop);
    }
    
    // Check Dropbox connection
    isDropboxConnected = DropboxAuth.isAuthenticated();
    
    // Handle OAuth callback
    const success = await DropboxAuth.handleCallback();
    if (success) {
      isDropboxConnected = true;
      accessToken = await DropboxAuth.getAccessToken();
    } else if (isDropboxConnected) {
      accessToken = await DropboxAuth.getAccessToken();
    }
  });

  async function connectDropbox() {
    loadingDropbox = true;
    try {
      await DropboxAuth.authorize();
    } finally {
      loadingDropbox = false;
    }
  }

  function openBudgetPicker() {
    openModal('budget-picker', { accessToken });
  }

  async function openLocalBudget() {
    if (!isDesktop) return;
    
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

  function handleAddTransaction() {
    showTransactionEntry = true;
  }

  function handleSaveTransaction(data: unknown) {
    console.log('Save transaction:', data);
    showTransactionEntry = false;
  }
</script>

{#if !$budgetInfo.client}
  <!-- Welcome screen - clean and focused -->
  <div class="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-background/95">
    <div class="w-full max-w-md space-y-8">
      <!-- Logo/Title -->
      <div class="text-center space-y-2">
        <h1 class="text-3xl font-heading font-bold tracking-tight">YNAB4</h1>
        <p class="text-muted-foreground">{$t('welcome.subtitle')}</p>
      </div>

      <!-- Primary actions -->
      <div class="space-y-3">
        {#if isDropboxConnected}
          <!-- Dropbox connected - show budget picker -->
          <Button 
            class="w-full h-14 text-base gap-3" 
            onclick={openBudgetPicker}
          >
            <Cloud class="h-5 w-5" />
            {$t('dropbox.selectBudget')}
          </Button>
        {:else}
          <!-- Dropbox not connected -->
          <Button 
            class="w-full h-14 text-base gap-3" 
            onclick={connectDropbox}
            disabled={loadingDropbox}
          >
            {#if loadingDropbox}
              <Loader2 class="h-5 w-5 animate-spin" />
            {:else}
              <Cloud class="h-5 w-5" />
            {/if}
            {$t('dropbox.connect')}
          </Button>
        {/if}

        {#if isDesktop}
          <Button 
            variant="outline" 
            class="w-full h-14 text-base gap-3"
            onclick={openLocalBudget}
            disabled={loadingLocal}
          >
            {#if loadingLocal}
              <Loader2 class="h-5 w-5 animate-spin" />
            {:else}
              <FolderOpen class="h-5 w-5" />
            {/if}
            {$t('localFiles.open')}
          </Button>
        {/if}
      </div>

      <!-- Language selector - simple -->
      <div class="flex justify-center pt-4">
        <select 
          class="bg-transparent border-none text-sm text-muted-foreground cursor-pointer hover:text-foreground focus:outline-none"
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

<!-- Transaction Entry Sheet -->
<TransactionEntrySheet
  open={showTransactionEntry}
  onClose={() => (showTransactionEntry = false)}
  onSave={handleSaveTransaction}
/>
