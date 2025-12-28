<script lang="ts">
  import { onMount } from 'svelte';
  import { X, Loader2, Cloud, HardDrive, FolderOpen, ChevronRight, ChevronLeft, DollarSign, Calendar } from 'lucide-svelte';
  import { t, locale } from '$lib/i18n';
  import { isTauri, getDropboxPath } from '$lib/services';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';

  interface Props {
    open?: boolean;
    onClose?: () => void;
    onCreated?: (budgetPath: string, source: 'local' | 'dropbox') => void;
  }

  let { open = false, onClose, onCreated }: Props = $props();

  // Wizard step
  let step = $state(1);
  const totalSteps = 2;

  // Form state - Step 1: Basics
  let budgetName = $state('');
  let selectedCurrency = $state('USD');
  let selectedDateFormat = $state('en_US');
  
  // Form state - Step 2: Location
  let saveLocation = $state<'local' | 'dropbox'>('local');
  let localPath = $state('');
  
  // UI state
  let isCreating = $state(false);
  let error = $state<string | null>(null);
  let isDesktop = $state(false);
  let isDropboxConnected = $state(false);

  // Currency options
  const currencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en_US' },
    { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de_DE' },
    { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en_GB' },
    { code: 'MXN', symbol: '$', name: 'Peso Mexicano', locale: 'es_MX' },
    { code: 'CAD', symbol: '$', name: 'Canadian Dollar', locale: 'en_CA' },
    { code: 'AUD', symbol: '$', name: 'Australian Dollar', locale: 'en_AU' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja_JP' },
    { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', locale: 'de_CH' },
    { code: 'BRL', symbol: 'R$', name: 'Real Brasileño', locale: 'pt_BR' },
    { code: 'ARS', symbol: '$', name: 'Peso Argentino', locale: 'es_AR' },
    { code: 'COP', symbol: '$', name: 'Peso Colombiano', locale: 'es_CO' },
    { code: 'CLP', symbol: '$', name: 'Peso Chileno', locale: 'es_CL' },
  ];

  // Date format options
  const dateFormats = [
    { locale: 'en_US', format: 'MM/DD/YYYY', example: '12/31/2025' },
    { locale: 'en_GB', format: 'DD/MM/YYYY', example: '31/12/2025' },
    { locale: 'es_MX', format: 'DD/MM/YYYY', example: '31/12/2025' },
    { locale: 'de_DE', format: 'DD.MM.YYYY', example: '31.12.2025' },
    { locale: 'ja_JP', format: 'YYYY/MM/DD', example: '2025/12/31' },
    { locale: 'ISO', format: 'YYYY-MM-DD', example: '2025-12-31' },
  ];

  // Check platform on mount
  onMount(() => {
    isDesktop = isTauri();
    isDropboxConnected = DropboxAuth.isAuthenticated();
  });

  // Set defaults when opened
  $effect(() => {
    if (open) {
      // Reset form
      step = 1;
      budgetName = '';
      error = null;
      isDropboxConnected = DropboxAuth.isAuthenticated();
      
      // Set default currency/date based on UI locale
      if ($locale === 'es') {
        selectedCurrency = 'MXN';
        selectedDateFormat = 'es_MX';
      } else {
        selectedCurrency = 'USD';
        selectedDateFormat = 'en_US';
      }
      
      if (isDesktop) {
        loadDefaultPath();
      } else {
        saveLocation = isDropboxConnected ? 'dropbox' : 'local';
      }
    }
  });

  async function loadDefaultPath() {
    try {
      const dropboxPath = await getDropboxPath();
      if (dropboxPath) {
        localPath = `${dropboxPath}/YNAB`;
      } else {
        try {
          const { documentDir } = await import('@tauri-apps/api/path');
          const docs = await documentDir();
          localPath = `${docs}YNAB`;
        } catch {
          localPath = '';
        }
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
        title: $t('budget.selectFolderTitle') || 'Select folder to save budget',
      });
      if (selected) {
        localPath = selected as string;
      }
    } catch (e) {
      console.error('Error selecting folder:', e);
    }
  }

  function nextStep() {
    if (step === 1) {
      if (!budgetName.trim()) {
        error = $t('budget.nameRequired') || 'Budget name is required';
        return;
      }
      error = null;
      step = 2;
    }
  }

  function prevStep() {
    if (step > 1) {
      error = null;
      step -= 1;
    }
  }

  async function createBudget() {
    if (!budgetName.trim()) {
      error = $t('budget.nameRequired') || 'Budget name is required';
      return;
    }

    isCreating = true;
    error = null;

    try {
      // Get the locale for currency
      const currencyInfo = currencies.find(c => c.code === selectedCurrency);
      const budgetLocale = currencyInfo?.locale || selectedDateFormat || 'en_US';
      
      // Determine the base path
      let basePath: string;
      if (saveLocation === 'local' && isDesktop) {
        if (!localPath) {
          error = $t('budget.folderRequired') || 'Please select a folder';
          isCreating = false;
          return;
        }
        basePath = localPath;
      } else if (saveLocation === 'dropbox' && isDropboxConnected) {
        basePath = '/YNAB';
      } else {
        error = $t('budget.selectLocationError') || 'Please select a valid save location';
        isCreating = false;
        return;
      }

      // Create the budget
      if (saveLocation === 'local' && isDesktop) {
        const { TauriIO } = await import('$lib/services/tauri-io');
        const { YnabClient } = await import('ynab-library');
        
        const io = new TauriIO(false);
        const result = await YnabClient.createNewBudget(io, basePath, {
          budgetName: budgetName.trim(),
          locale: budgetLocale,
          startYear: new Date().getFullYear(),
          endYear: new Date().getFullYear(),
          monthlyIncome: 0,
          empty: true,
        });
        
        console.log('[CreateBudget] Created:', result);
        onCreated?.(result.budgetPath, 'local');
      } else if (saveLocation === 'dropbox' && isDropboxConnected) {
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
          empty: true,
        });
        
        console.log('[CreateBudget] Created in Dropbox:', result);
        onCreated?.(result.budgetPath, 'dropbox');
      }

      onClose?.();
    } catch (e) {
      console.error('[CreateBudget] Error:', e);
      error = e instanceof Error ? e.message : $t('budget.createError') || 'Failed to create budget';
    } finally {
      isCreating = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose?.();
    } else if (e.key === 'Enter' && step < totalSteps) {
      nextStep();
    }
  }

  // Derived
  const selectedCurrencyInfo = $derived(currencies.find(c => c.code === selectedCurrency));
  const selectedDateInfo = $derived(dateFormats.find(d => d.locale === selectedDateFormat));
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- Backdrop -->
  <div 
    class="fixed inset-0 z-[100] bg-black/80"
    onclick={onClose}
    role="presentation"
  ></div>
  
  <!-- Dialog Window -->
  <div class="fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg px-4">
    <div class="rounded-xl shadow-2xl overflow-hidden bg-[var(--card)] border-2 border-[var(--border)]">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 bg-[var(--secondary)] text-[var(--secondary-foreground)]">
        <div>
          <h2 class="text-lg font-heading font-bold">
            {$t('budget.createNew')}
          </h2>
          <p class="text-xs opacity-70">
            {$t('budget.step') || 'Paso'} {step} / {totalSteps}
          </p>
        </div>
        <button 
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          onclick={onClose}
          aria-label="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Progress bar -->
      <div class="h-1 bg-[var(--muted)]">
        <div 
          class="h-full bg-[var(--primary)] transition-all duration-300"
          style="width: {(step / totalSteps) * 100}%"
        ></div>
      </div>

      <!-- Content -->
      <div class="p-5 space-y-5 bg-[var(--card)] min-h-[280px]">
        {#if step === 1}
          <!-- Step 1: Name, Currency, Date Format -->
          <div class="space-y-4">
            <!-- Budget Name -->
            <div class="space-y-2">
              <label for="budget-name" class="text-sm font-medium text-[var(--foreground)]">
                {$t('budget.name')}
              </label>
              <input
                id="budget-name"
                bind:value={budgetName}
                placeholder={$t('budget.namePlaceholder') || 'Mi Presupuesto'}
                disabled={isCreating}
                class="w-full h-11 px-3 rounded-lg text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--background)] border border-[var(--border)]"
              />
            </div>

            <!-- Currency -->
            <div class="space-y-2">
              <label for="currency" class="text-sm font-medium text-[var(--foreground)] flex items-center gap-2">
                <DollarSign class="h-4 w-4 text-[var(--muted-foreground)]" />
                {$t('budget.currency') || 'Moneda'}
              </label>
              <select
                id="currency"
                bind:value={selectedCurrency}
                disabled={isCreating}
                class="w-full h-11 px-3 rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--background)] border border-[var(--border)]"
              >
                {#each currencies as currency}
                  <option value={currency.code}>
                    {currency.symbol} {currency.code} - {currency.name}
                  </option>
                {/each}
              </select>
            </div>

            <!-- Date Format -->
            <div class="space-y-2">
              <label for="date-format" class="text-sm font-medium text-[var(--foreground)] flex items-center gap-2">
                <Calendar class="h-4 w-4 text-[var(--muted-foreground)]" />
                {$t('budget.dateFormat') || 'Formato de fecha'}
              </label>
              <select
                id="date-format"
                bind:value={selectedDateFormat}
                disabled={isCreating}
                class="w-full h-11 px-3 rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--background)] border border-[var(--border)]"
              >
                {#each dateFormats as fmt}
                  <option value={fmt.locale}>
                    {fmt.format} ({fmt.example})
                  </option>
                {/each}
              </select>
            </div>
          </div>
        {:else if step === 2}
          <!-- Step 2: Save Location -->
          <fieldset class="space-y-3">
            <legend class="text-sm font-medium text-[var(--foreground)]">{$t('budget.saveLocation')}</legend>
            <div class="space-y-2">
              {#if isDesktop}
                <button
                  type="button"
                  class="w-full flex items-center gap-3 p-4 rounded-lg transition-all text-[var(--foreground)] bg-[var(--background)] border-2 {saveLocation === 'local' ? 'border-[var(--primary)]' : 'border-[var(--border)]'}"
                  onclick={() => saveLocation = 'local'}
                  disabled={isCreating}
                >
                  <div class="p-2 rounded-lg bg-[var(--primary)]/20">
                    <HardDrive class="h-5 w-5 text-[var(--primary)]" />
                  </div>
                  <div class="text-left">
                    <p class="font-medium">{$t('localFiles.title')}</p>
                    <p class="text-xs text-[var(--muted-foreground)]">{$t('budget.saveLocal') || 'Guardar en disco local'}</p>
                  </div>
                </button>
              {/if}
              
              <button
                type="button"
                class="w-full flex items-center gap-3 p-4 rounded-lg transition-all text-[var(--foreground)] bg-[var(--background)] border-2 {saveLocation === 'dropbox' ? 'border-[var(--info)]' : 'border-[var(--border)]'} {!isDropboxConnected ? 'opacity-50' : ''}"
                onclick={() => { if (isDropboxConnected) saveLocation = 'dropbox' }}
                disabled={isCreating || !isDropboxConnected}
              >
                <div class="p-2 rounded-lg bg-[var(--info)]/20">
                  <Cloud class="h-5 w-5 text-[var(--info)]" />
                </div>
                <div class="text-left flex-1">
                  <p class="font-medium">Dropbox</p>
                  <p class="text-xs text-[var(--muted-foreground)]">
                    {isDropboxConnected ? ($t('budget.syncDropbox') || 'Sincronizar con Dropbox') : ($t('budget.connectDropboxFirst') || 'Conectar Dropbox primero')}
                  </p>
                </div>
                {#if !isDropboxConnected}
                  <span class="text-xs px-2 py-1 rounded text-[var(--muted-foreground)] bg-[var(--muted)]">
                    {$t('budget.notConnected') || 'No conectado'}
                  </span>
                {/if}
              </button>
            </div>
          </fieldset>

          <!-- Local Path -->
          {#if isDesktop && saveLocation === 'local'}
            <div class="space-y-2">
              <label for="local-path" class="text-sm font-medium text-[var(--foreground)]">{$t('budget.folder')}</label>
              <div class="flex gap-2">
                <input
                  id="local-path"
                  bind:value={localPath}
                  placeholder="/path/to/YNAB"
                  disabled={isCreating}
                  class="flex-1 h-11 px-3 rounded-lg text-[var(--foreground)] text-sm placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] bg-[var(--background)] border border-[var(--border)]"
                />
                <button 
                  onclick={selectFolder}
                  disabled={isCreating}
                  class="h-11 w-11 rounded-lg flex items-center justify-center text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors border border-[var(--border)]"
                >
                  <FolderOpen class="h-4 w-4" />
                </button>
              </div>
            </div>
          {/if}

          <!-- Summary -->
          <div class="p-3 rounded-lg bg-[var(--muted)] text-sm space-y-1">
            <p><strong>{$t('budget.name')}:</strong> {budgetName}</p>
            <p><strong>{$t('budget.currency') || 'Moneda'}:</strong> {selectedCurrencyInfo?.symbol} {selectedCurrencyInfo?.code}</p>
            <p><strong>{$t('budget.dateFormat') || 'Fecha'}:</strong> {selectedDateInfo?.format}</p>
          </div>
        {/if}

        <!-- Error -->
        {#if error}
          <div class="p-3 rounded-lg bg-[var(--destructive)]/15 border border-[var(--destructive)]/30">
            <p class="text-sm text-[var(--destructive)]">{error}</p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex justify-between gap-3 px-5 py-4 bg-[var(--background)] border-t border-[var(--border)]">
        <div>
          {#if step > 1}
            <button 
              onclick={prevStep} 
              disabled={isCreating}
              class="px-4 py-2 rounded-lg font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors border border-[var(--border)] flex items-center gap-1"
            >
              <ChevronLeft class="h-4 w-4" />
              {$t('common.back') || 'Atrás'}
            </button>
          {:else}
            <button 
              onclick={onClose} 
              disabled={isCreating}
              class="px-4 py-2 rounded-lg font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors border border-[var(--border)]"
            >
              {$t('common.cancel')}
            </button>
          {/if}
        </div>
        
        <div>
          {#if step < totalSteps}
            <button 
              onclick={nextStep} 
              disabled={!budgetName.trim()}
              class="px-4 py-2 rounded-lg font-medium text-[var(--primary-foreground)] bg-[var(--primary)] transition-all hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
            >
              {$t('common.next') || 'Siguiente'}
              <ChevronRight class="h-4 w-4" />
            </button>
          {:else}
            <button 
              onclick={createBudget} 
              disabled={isCreating || !budgetName.trim()}
              class="px-4 py-2 rounded-lg font-medium text-[var(--primary-foreground)] bg-[var(--primary)] transition-all hover:opacity-90 disabled:opacity-50"
            >
              {#if isCreating}
                <Loader2 class="mr-2 h-4 w-4 animate-spin inline" />
              {/if}
              {$t('budget.create')}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
