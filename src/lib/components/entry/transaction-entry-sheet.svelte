<script lang="ts">
  import { X, ChevronDown, Check, Flag, Calendar, Plus, Minus } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import NumericKeypad from './numeric-keypad.svelte';
  import { cn, formatCurrency } from '$lib/utils';
  import { accounts, payees, categories } from '$lib/stores/budget';
  import { t } from '$lib/i18n';

  interface Props {
    open: boolean;
    onClose: () => void;
    onSave: (transaction: TransactionData) => void;
    editTransaction?: TransactionData | null;
  }

  interface TransactionData {
    id?: string;
    amount: number;
    payeeId: string | null;
    payeeName: string;
    categoryId: string | null;
    categoryName: string;
    accountId: string;
    date: string;
    memo: string;
    cleared: boolean;
    flag: string | null;
  }

  let { open, onClose, onSave, editTransaction = null }: Props = $props();

  // Form state
  let amountString = $state('');
  let isInflow = $state(false);
  let payeeSearch = $state('');
  let selectedPayeeId = $state<string | null>(null);
  let categorySearch = $state('');
  let selectedCategoryId = $state<string | null>(null);
  let selectedAccountId = $state('');
  let date = $state(new Date().toISOString().split('T')[0]);
  let memo = $state('');
  let cleared = $state(false);
  let flag = $state<string | null>(null);

  // UI state
  let activeField = $state<'amount' | 'payee' | 'category' | 'account' | 'date' | 'memo' | null>('amount');

  // Reset form when opened
  $effect(() => {
    if (open) {
      if (editTransaction) {
        // Edit mode
        amountString = Math.abs(editTransaction.amount).toString();
        isInflow = editTransaction.amount > 0;
        selectedPayeeId = editTransaction.payeeId;
        payeeSearch = editTransaction.payeeName;
        selectedCategoryId = editTransaction.categoryId;
        categorySearch = editTransaction.categoryName;
        selectedAccountId = editTransaction.accountId;
        date = editTransaction.date;
        memo = editTransaction.memo;
        cleared = editTransaction.cleared;
        flag = editTransaction.flag;
      } else {
        // New transaction
        amountString = '';
        isInflow = false;
        payeeSearch = '';
        selectedPayeeId = null;
        categorySearch = '';
        selectedCategoryId = null;
        selectedAccountId = $accounts[0]?.id || '';
        date = new Date().toISOString().split('T')[0];
        memo = '';
        cleared = false;
        flag = null;
      }
      activeField = 'amount';
    }
  });

  const displayAmount = $derived(() => {
    if (!amountString) return '$0.00';
    const num = parseFloat(amountString) || 0;
    return formatCurrency(num);
  });

  const selectedPayee = $derived(
    selectedPayeeId ? $payees.find((p) => p.id === selectedPayeeId) : null
  );

  const selectedCategory = $derived(() => {
    if (!selectedCategoryId) return null;
    return $categories.find((c) => c.entityId === selectedCategoryId);
  });

  const selectedAccount = $derived(() => {
    return $accounts.find((a) => a.id === selectedAccountId);
  });

  const filteredPayees = $derived(
    payeeSearch
      ? $payees.filter((p) => p.name.toLowerCase().includes(payeeSearch.toLowerCase())).slice(0, 10)
      : $payees.slice(0, 10)
  );

  const filteredCategories = $derived(
    categorySearch
      ? $categories.filter((c) => c.name.toLowerCase().includes(categorySearch.toLowerCase())).slice(0, 10)
      : $categories.slice(0, 10)
  );

  const flagColors = [
    { name: 'Red', class: 'bg-red-500' },
    { name: 'Orange', class: 'bg-orange-500' },
    { name: 'Yellow', class: 'bg-yellow-500' },
    { name: 'Green', class: 'bg-green-500' },
    { name: 'Blue', class: 'bg-blue-500' },
    { name: 'Purple', class: 'bg-purple-500' },
  ];

  function handleSave() {
    const amount = parseFloat(amountString) || 0;
    const finalAmount = isInflow ? amount : -amount;

    onSave({
      id: editTransaction?.id,
      amount: finalAmount,
      payeeId: selectedPayeeId,
      payeeName: selectedPayee?.name || payeeSearch,
      categoryId: selectedCategoryId,
      categoryName: selectedCategory()?.name || categorySearch,
      accountId: selectedAccountId,
      date,
      memo,
      cleared,
      flag,
    });

    onClose();
  }

  function selectPayee(payee: { id: string; name: string }) {
    selectedPayeeId = payee.id;
    payeeSearch = payee.name;
    activeField = 'category';
  }

  function selectCategory(category: { entityId: string; name: string }) {
    selectedCategoryId = category.entityId;
    categorySearch = category.name;
    activeField = null;
  }
</script>

{#if open}
  <!-- Full screen overlay -->
  <div class="entry-sheet">
    <!-- Header -->
    <header class="entry-header">
      <Button variant="ghost" size="icon" onclick={onClose}>
        <X class="h-5 w-5" />
      </Button>
      <h2 class="entry-title">
        {editTransaction ? $t('transactions.editTransaction') : $t('transactions.newTransaction')}
      </h2>
      <Button variant="ghost" onclick={handleSave} disabled={!amountString || amountString === '0'}>
        {$t('common.save')}
      </Button>
    </header>

    <!-- Amount display -->
    <div
      class="flex flex-col items-center justify-center py-8 cursor-pointer"
      role="button"
      tabindex="0"
      onclick={() => (activeField = 'amount')}
      onkeydown={(e) => e.key === 'Enter' && (activeField = 'amount')}
    >
      <div class="flex items-center gap-2 mb-2">
        <button
          class={cn(
            'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
            !isInflow ? 'bg-ynab-red text-white' : 'bg-muted text-muted-foreground'
          )}
          onclick={(e) => { e.stopPropagation(); isInflow = false; }}
        >
          <Minus class="h-5 w-5" />
        </button>
        <button
          class={cn(
            'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
            isInflow ? 'bg-ynab-green text-white' : 'bg-muted text-muted-foreground'
          )}
          onclick={(e) => { e.stopPropagation(); isInflow = true; }}
        >
          <Plus class="h-5 w-5" />
        </button>
      </div>
      <span
        class={cn(
          'text-5xl font-mono font-bold tracking-tight',
          isInflow ? 'text-ynab-green' : 'text-ynab-red'
        )}
      >
        {displayAmount()}
      </span>
    </div>

    <!-- Fields -->
    <div class="flex-1 overflow-y-auto px-4 space-y-4">
      <!-- Account -->
      <button
        class="entry-field"
        class:active={activeField === 'account'}
        onclick={() => (activeField = 'account')}
      >
        <span class="field-label">{$t('transactions.account')}</span>
        <div class="field-value">
          <span>{selectedAccount()?.name || $t('transactions.selectAccount')}</span>
          <ChevronDown class="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      <!-- Payee -->
      <button
        class="entry-field"
        class:active={activeField === 'payee'}
        onclick={() => (activeField = 'payee')}
      >
        <span class="field-label">{$t('transactions.payee')}</span>
        <div class="field-value">
          <span>{selectedPayee?.name || payeeSearch || $t('transactions.selectPayee')}</span>
          <ChevronDown class="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      <!-- Category -->
      <button
        class="entry-field"
        class:active={activeField === 'category'}
        onclick={() => (activeField = 'category')}
      >
        <span class="field-label">{$t('transactions.category')}</span>
        <div class="field-value">
          <span>{selectedCategory()?.name || categorySearch || $t('transactions.selectCategory')}</span>
          <ChevronDown class="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      <!-- Date -->
      <div class="entry-field">
        <span class="field-label">{$t('transactions.date')}</span>
        <input
          type="date"
          class="date-input"
          bind:value={date}
        />
      </div>

      <!-- Memo -->
      <div class="entry-field">
        <span class="field-label">{$t('transactions.memo')}</span>
        <Input
          type="text"
          placeholder={$t('transactions.addMemo')}
          class="border-none bg-transparent text-right p-0 h-auto"
          bind:value={memo}
        />
      </div>

      <!-- Cleared and Flag row -->
      <div class="flex items-center gap-4">
        <button
          class="cleared-btn"
          class:active={cleared}
          onclick={() => (cleared = !cleared)}
        >
          <Check class="h-5 w-5" />
          <span>{$t('transactions.cleared')}</span>
        </button>

        <div class="flex items-center gap-2">
          {#each flagColors as flagColor}
            <button
              class={cn(
                'h-8 w-8 rounded-full transition-all',
                flagColor.class,
                flag === flagColor.name ? 'ring-2 ring-offset-2 ring-offset-background' : 'opacity-50 hover:opacity-100'
              )}
              onclick={() => (flag = flag === flagColor.name ? null : flagColor.name)}
              aria-label="Flag: {flagColor.name}"
            ></button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Bottom input area based on active field -->
    <div class="border-t p-4 pb-[env(safe-area-inset-bottom)]">
      {#if activeField === 'amount'}
        <NumericKeypad
          value={amountString}
          onInput={(v) => (amountString = v)}
          onSubmit={() => (activeField = 'payee')}
        />
      {:else if activeField === 'payee'}
        <div class="space-y-2">
          <Input
            type="text"
            placeholder={$t('transactions.searchPayee')}
            bind:value={payeeSearch}
            autofocus
          />
          <div class="max-h-48 overflow-y-auto space-y-1">
            {#each filteredPayees as payee (payee.id)}
              <button
                class="select-option"
                onclick={() => selectPayee(payee)}
              >
                {payee.name}
              </button>
            {/each}
          </div>
        </div>
      {:else if activeField === 'category'}
        <div class="space-y-2">
          <Input
            type="text"
            placeholder={$t('transactions.searchCategory')}
            bind:value={categorySearch}
            autofocus
          />
          <div class="max-h-48 overflow-y-auto space-y-1">
            {#each filteredCategories as category (category.entityId)}
              <button
                class="select-option flex-col items-start"
                onclick={() => selectCategory(category)}
              >
                <span class="font-medium">{category.name}</span>
                <span class="text-xs text-muted-foreground">{category.masterCategoryName}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else if activeField === 'account'}
        <div class="max-h-64 overflow-y-auto space-y-1">
          {#each $accounts as account (account.id)}
            <button
              class="select-option justify-between"
              class:selected={selectedAccountId === account.id}
              onclick={() => { selectedAccountId = account.id; activeField = 'payee'; }}
            >
              <span>{account.name}</span>
              <span class="text-sm text-muted-foreground">{formatCurrency(account.balance)}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="flex gap-2">
          <Button variant="outline" class="flex-1" onclick={onClose}>
            {$t('common.cancel')}
          </Button>
          <Button class="flex-1" onclick={handleSave} disabled={!amountString || amountString === '0'}>
            {$t('common.save')}
          </Button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .entry-sheet {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    background: var(--card);
  }
  
  .entry-header {
    display: flex;
    height: 56px;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--card);
  }
  
  .entry-title {
    font-weight: 600;
    color: var(--foreground);
  }
  
  .entry-field {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: transparent;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  
  .entry-field.active {
    border-color: var(--primary);
  }
  
  .field-label {
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }
  
  .field-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    color: var(--foreground);
  }
  
  .date-input {
    background: transparent;
    font-weight: 500;
    text-align: right;
    outline: none;
    color: var(--foreground);
  }
  
  .cleared-btn {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .cleared-btn.active {
    border-color: var(--success);
    background: color-mix(in srgb, var(--success) 10%, transparent);
    color: var(--success);
  }
  
  .select-option {
    display: flex;
    width: 100%;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    color: var(--foreground);
  }
  
  .select-option:hover {
    background: var(--accent);
  }
  
  .select-option.selected {
    background: var(--accent);
  }
</style>

