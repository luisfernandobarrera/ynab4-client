<script lang="ts">
  import { ChevronDown, Check, X, Filter } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { accounts, categories, masterCategories, payees } from '$lib/stores/budget';
  import { t } from '$lib/i18n';

  interface Props {
    // Selected filters (bound)
    selectedAccounts?: string[];
    selectedCategories?: string[];
    selectedPayees?: string[];
    // Date range presets
    datePreset?: 'thisMonth' | 'last3Months' | 'thisYear' | 'lastYear' | 'allDates' | 'custom';
    // Callbacks
    onAccountsChange?: (accounts: string[]) => void;
    onCategoriesChange?: (categories: string[]) => void;
    onPayeesChange?: (payees: string[]) => void;
    onDatePresetChange?: (preset: string) => void;
    // Options
    showAccounts?: boolean;
    showCategories?: boolean;
    showPayees?: boolean;
    showDatePresets?: boolean;
  }

  let {
    selectedAccounts = $bindable([]),
    selectedCategories = $bindable([]),
    selectedPayees = $bindable([]),
    datePreset = $bindable('thisMonth'),
    onAccountsChange,
    onCategoriesChange,
    onPayeesChange,
    onDatePresetChange,
    showAccounts = true,
    showCategories = true,
    showPayees = true,
    showDatePresets = true,
  }: Props = $props();

  // Dropdown states
  let accountsOpen = $state(false);
  let categoriesOpen = $state(false);
  let payeesOpen = $state(false);
  let datePresetsOpen = $state(false);

  // Search states
  let accountSearch = $state('');
  let categorySearch = $state('');
  let payeeSearch = $state('');

  // Date presets
  const datePresets = [
    { id: 'thisMonth', label: $t('reports.filters.thisMonth') || 'Este Mes' },
    { id: 'last3Months', label: $t('reports.filters.last3Months') || 'Últimos 3 Meses' },
    { id: 'thisYear', label: $t('reports.filters.thisYear') || 'Este Año' },
    { id: 'lastYear', label: $t('reports.filters.lastYear') || 'Año Pasado' },
    { id: 'allDates', label: $t('reports.filters.allDates') || 'Todas las Fechas' },
  ];

  // Filtered lists
  const filteredAccounts = $derived(
    $accounts.filter((a) =>
      a.accountName.toLowerCase().includes(accountSearch.toLowerCase())
    )
  );

  const filteredCategories = $derived(() => {
    const search = categorySearch.toLowerCase();
    const result: { masterId: string; masterName: string; categories: { id: string; name: string }[] }[] = [];

    for (const master of $masterCategories) {
      const cats = $categories
        .filter((c) => c.masterCategoryId === master.entityId)
        .filter((c) => c.name.toLowerCase().includes(search) || master.name.toLowerCase().includes(search))
        .map((c) => ({ id: c.entityId, name: c.name }));

      if (cats.length > 0 || master.name.toLowerCase().includes(search)) {
        result.push({
          masterId: master.entityId,
          masterName: master.name,
          categories: cats,
        });
      }
    }
    return result;
  });

  const filteredPayees = $derived(
    $payees
      .filter((p) => !p.name.startsWith('Transfer :'))
      .filter((p) => p.name.toLowerCase().includes(payeeSearch.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  // Toggle functions
  function toggleAccount(accountId: string) {
    if (selectedAccounts.includes(accountId)) {
      selectedAccounts = selectedAccounts.filter((id) => id !== accountId);
    } else {
      selectedAccounts = [...selectedAccounts, accountId];
    }
    onAccountsChange?.(selectedAccounts);
  }

  function toggleCategory(categoryId: string) {
    if (selectedCategories.includes(categoryId)) {
      selectedCategories = selectedCategories.filter((id) => id !== categoryId);
    } else {
      selectedCategories = [...selectedCategories, categoryId];
    }
    onCategoriesChange?.(selectedCategories);
  }

  function togglePayee(payeeId: string) {
    if (selectedPayees.includes(payeeId)) {
      selectedPayees = selectedPayees.filter((id) => id !== payeeId);
    } else {
      selectedPayees = [...selectedPayees, payeeId];
    }
    onPayeesChange?.(selectedPayees);
  }

  function selectAllAccounts() {
    selectedAccounts = $accounts.map((a) => a.entityId);
    onAccountsChange?.(selectedAccounts);
  }

  function clearAccounts() {
    selectedAccounts = [];
    onAccountsChange?.(selectedAccounts);
  }

  function selectAllCategories() {
    selectedCategories = $categories.map((c) => c.entityId);
    onCategoriesChange?.(selectedCategories);
  }

  function clearCategories() {
    selectedCategories = [];
    onCategoriesChange?.(selectedCategories);
  }

  function selectAllPayees() {
    selectedPayees = $payees.filter((p) => !p.name.startsWith('Transfer :')).map((p) => p.entityId);
    onPayeesChange?.(selectedPayees);
  }

  function clearPayees() {
    selectedPayees = [];
    onPayeesChange?.(selectedPayees);
  }

  function setDatePreset(preset: string) {
    datePreset = preset as typeof datePreset;
    datePresetsOpen = false;
    onDatePresetChange?.(preset);
  }

  // Close dropdowns when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.filter-dropdown')) {
      accountsOpen = false;
      categoriesOpen = false;
      payeesOpen = false;
      datePresetsOpen = false;
    }
  }

  // Get display labels
  const accountsLabel = $derived(() => {
    if (selectedAccounts.length === 0 || selectedAccounts.length === $accounts.length) {
      return $t('reports.filters.allAccounts') || 'Todas las Cuentas';
    }
    if (selectedAccounts.length === 1) {
      const acc = $accounts.find((a) => a.entityId === selectedAccounts[0]);
      return acc?.accountName || '1 cuenta';
    }
    return `${selectedAccounts.length} cuentas`;
  });

  const categoriesLabel = $derived(() => {
    if (selectedCategories.length === 0 || selectedCategories.length === $categories.length) {
      return $t('reports.filters.allCategories') || 'Todas las Categorías';
    }
    if (selectedCategories.length === 1) {
      const cat = $categories.find((c) => c.entityId === selectedCategories[0]);
      return cat?.name || '1 categoría';
    }
    return `${selectedCategories.length} categorías`;
  });

  const payeesLabel = $derived(() => {
    const nonTransferPayees = $payees.filter((p) => !p.name.startsWith('Transfer :'));
    if (selectedPayees.length === 0 || selectedPayees.length === nonTransferPayees.length) {
      return $t('reports.filters.allPayees') || 'Todos los Beneficiarios';
    }
    if (selectedPayees.length === 1) {
      const payee = $payees.find((p) => p.entityId === selectedPayees[0]);
      return payee?.name || '1 beneficiario';
    }
    return `${selectedPayees.length} beneficiarios`;
  });

  const datePresetLabel = $derived(() => {
    const preset = datePresets.find((p) => p.id === datePreset);
    return preset?.label || 'Este Mes';
  });
</script>

<svelte:window onclick={handleClickOutside} />

<div class="flex flex-wrap gap-2 items-center">
  <Filter class="h-4 w-4 text-muted-foreground" />

  <!-- Date Presets -->
  {#if showDatePresets}
    <div class="relative filter-dropdown">
      <Button
        variant="outline"
        size="sm"
        class="h-8 gap-1"
        onclick={() => datePresetsOpen = !datePresetsOpen}
      >
        {datePresetLabel()}
        <ChevronDown class="h-3 w-3 opacity-50" />
      </Button>

      {#if datePresetsOpen}
        <div class="absolute top-full left-0 mt-1 w-48 bg-popover border rounded-lg shadow-lg z-50 p-1">
          {#each datePresets as preset}
            <button
              class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left"
              onclick={() => setDatePreset(preset.id)}
            >
              {#if datePreset === preset.id}
                <Check class="h-4 w-4 text-primary" />
              {:else}
                <span class="w-4"></span>
              {/if}
              {preset.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Accounts Filter -->
  {#if showAccounts}
    <div class="relative filter-dropdown">
      <Button
        variant="outline"
        size="sm"
        class="h-8 gap-1"
        onclick={() => accountsOpen = !accountsOpen}
      >
        {accountsLabel()}
        <ChevronDown class="h-3 w-3 opacity-50" />
      </Button>

      {#if accountsOpen}
        <div class="absolute top-full left-0 mt-1 w-64 bg-popover border rounded-lg shadow-lg z-50">
          <div class="p-2 border-b">
            <input
              type="text"
              placeholder="Buscar cuenta..."
              class="w-full px-3 py-1.5 text-sm border rounded bg-background"
              bind:value={accountSearch}
            />
          </div>
          <div class="flex gap-1 p-2 border-b">
            <button class="text-xs text-primary hover:underline" onclick={selectAllAccounts}>Todas</button>
            <span class="text-muted-foreground">|</span>
            <button class="text-xs text-primary hover:underline" onclick={clearAccounts}>Ninguna</button>
          </div>
          <div class="max-h-64 overflow-y-auto p-1">
            {#each filteredAccounts as account}
              <button
                class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left"
                onclick={() => toggleAccount(account.entityId)}
              >
                <div class="w-4 h-4 border rounded flex items-center justify-center {selectedAccounts.includes(account.entityId) ? 'bg-primary border-primary' : ''}">
                  {#if selectedAccounts.includes(account.entityId)}
                    <Check class="h-3 w-3 text-primary-foreground" />
                  {/if}
                </div>
                <span class="truncate">{account.accountName}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Categories Filter -->
  {#if showCategories}
    <div class="relative filter-dropdown">
      <Button
        variant="outline"
        size="sm"
        class="h-8 gap-1"
        onclick={() => categoriesOpen = !categoriesOpen}
      >
        {categoriesLabel()}
        <ChevronDown class="h-3 w-3 opacity-50" />
      </Button>

      {#if categoriesOpen}
        <div class="absolute top-full left-0 mt-1 w-72 bg-popover border rounded-lg shadow-lg z-50">
          <div class="p-2 border-b">
            <input
              type="text"
              placeholder="Buscar categoría..."
              class="w-full px-3 py-1.5 text-sm border rounded bg-background"
              bind:value={categorySearch}
            />
          </div>
          <div class="flex gap-1 p-2 border-b">
            <button class="text-xs text-primary hover:underline" onclick={selectAllCategories}>Todas</button>
            <span class="text-muted-foreground">|</span>
            <button class="text-xs text-primary hover:underline" onclick={clearCategories}>Ninguna</button>
          </div>
          <div class="max-h-64 overflow-y-auto p-1">
            {#each filteredCategories() as master}
              <div class="py-1">
                <div class="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
                  {master.masterName}
                </div>
                {#each master.categories as category}
                  <button
                    class="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors text-left"
                    onclick={() => toggleCategory(category.id)}
                  >
                    <div class="w-4 h-4 border rounded flex items-center justify-center {selectedCategories.includes(category.id) ? 'bg-primary border-primary' : ''}">
                      {#if selectedCategories.includes(category.id)}
                        <Check class="h-3 w-3 text-primary-foreground" />
                      {/if}
                    </div>
                    <span class="truncate">{category.name}</span>
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Payees Filter -->
  {#if showPayees}
    <div class="relative filter-dropdown">
      <Button
        variant="outline"
        size="sm"
        class="h-8 gap-1"
        onclick={() => payeesOpen = !payeesOpen}
      >
        {payeesLabel()}
        <ChevronDown class="h-3 w-3 opacity-50" />
      </Button>

      {#if payeesOpen}
        <div class="absolute top-full left-0 mt-1 w-64 bg-popover border rounded-lg shadow-lg z-50">
          <div class="p-2 border-b">
            <input
              type="text"
              placeholder="Buscar beneficiario..."
              class="w-full px-3 py-1.5 text-sm border rounded bg-background"
              bind:value={payeeSearch}
            />
          </div>
          <div class="flex gap-1 p-2 border-b">
            <button class="text-xs text-primary hover:underline" onclick={selectAllPayees}>Todos</button>
            <span class="text-muted-foreground">|</span>
            <button class="text-xs text-primary hover:underline" onclick={clearPayees}>Ninguno</button>
          </div>
          <div class="max-h-64 overflow-y-auto p-1">
            {#each filteredPayees as payee}
              <button
                class="w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left"
                onclick={() => togglePayee(payee.entityId)}
              >
                <div class="w-4 h-4 border rounded flex items-center justify-center {selectedPayees.includes(payee.entityId) ? 'bg-primary border-primary' : ''}">
                  {#if selectedPayees.includes(payee.entityId)}
                    <Check class="h-3 w-3 text-primary-foreground" />
                  {/if}
                </div>
                <span class="truncate">{payee.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Clear All Filters -->
  {#if (selectedAccounts.length > 0 && selectedAccounts.length < $accounts.length) ||
       (selectedCategories.length > 0 && selectedCategories.length < $categories.length) ||
       (selectedPayees.length > 0 && selectedPayees.length < $payees.filter(p => !p.name.startsWith('Transfer :')).length)}
    <Button
      variant="ghost"
      size="sm"
      class="h-8 text-muted-foreground hover:text-destructive"
      onclick={() => {
        selectedAccounts = [];
        selectedCategories = [];
        selectedPayees = [];
        onAccountsChange?.([]);
        onCategoriesChange?.([]);
        onPayeesChange?.([]);
      }}
    >
      <X class="h-3 w-3 mr-1" />
      Limpiar filtros
    </Button>
  {/if}
</div>
