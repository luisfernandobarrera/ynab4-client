<script lang="ts">
  import { X, ChevronDown, Check, Flag, Calendar, Plus, Minus } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import NumericKeypad from './numeric-keypad.svelte';
  import { cn, formatCurrency } from '$lib/utils';
  import { accounts, payees, categories } from '$lib/stores/budget';

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
  <div class="fixed inset-0 z-50 flex flex-col bg-background">
    <!-- Header -->
    <header class="flex h-14 items-center justify-between border-b px-4">
      <Button variant="ghost" size="icon" onclick={onClose}>
        <X class="h-5 w-5" />
      </Button>
      <h2 class="font-heading font-semibold">
        {editTransaction ? 'Edit Transaction' : 'New Transaction'}
      </h2>
      <Button variant="ghost" onclick={handleSave} disabled={!amountString || amountString === '0'}>
        Save
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
        class={cn(
          'flex w-full items-center justify-between rounded-lg border p-4 transition-colors',
          activeField === 'account' && 'border-primary'
        )}
        onclick={() => (activeField = 'account')}
      >
        <span class="text-sm text-muted-foreground">Account</span>
        <div class="flex items-center gap-2">
          <span class="font-medium">{selectedAccount()?.name || 'Select account'}</span>
          <ChevronDown class="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      <!-- Payee -->
      <button
        class={cn(
          'flex w-full items-center justify-between rounded-lg border p-4 transition-colors',
          activeField === 'payee' && 'border-primary'
        )}
        onclick={() => (activeField = 'payee')}
      >
        <span class="text-sm text-muted-foreground">Payee</span>
        <div class="flex items-center gap-2">
          <span class="font-medium">{selectedPayee?.name || payeeSearch || 'Select payee'}</span>
          <ChevronDown class="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      <!-- Category -->
      <button
        class={cn(
          'flex w-full items-center justify-between rounded-lg border p-4 transition-colors',
          activeField === 'category' && 'border-primary'
        )}
        onclick={() => (activeField = 'category')}
      >
        <span class="text-sm text-muted-foreground">Category</span>
        <div class="flex items-center gap-2">
          <span class="font-medium">{selectedCategory()?.name || categorySearch || 'Select category'}</span>
          <ChevronDown class="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      <!-- Date -->
      <div class="flex items-center justify-between rounded-lg border p-4">
        <span class="text-sm text-muted-foreground">Date</span>
        <input
          type="date"
          class="bg-transparent font-medium text-right outline-none"
          bind:value={date}
        />
      </div>

      <!-- Memo -->
      <div class="flex items-center justify-between rounded-lg border p-4">
        <span class="text-sm text-muted-foreground">Memo</span>
        <Input
          type="text"
          placeholder="Add memo..."
          class="border-none bg-transparent text-right p-0 h-auto"
          bind:value={memo}
        />
      </div>

      <!-- Cleared and Flag row -->
      <div class="flex items-center gap-4">
        <button
          class={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg border p-4 transition-colors',
            cleared && 'border-ynab-green bg-ynab-green/10'
          )}
          onclick={() => (cleared = !cleared)}
        >
          <Check class={cn('h-5 w-5', cleared ? 'text-ynab-green' : 'text-muted-foreground')} />
          <span class={cn('font-medium', cleared ? 'text-ynab-green' : 'text-muted-foreground')}>
            Cleared
          </span>
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
            />
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
            placeholder="Search or enter payee..."
            bind:value={payeeSearch}
            autofocus
          />
          <div class="max-h-48 overflow-y-auto space-y-1">
            {#each filteredPayees as payee (payee.id)}
              <button
                class="flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-accent"
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
            placeholder="Search category..."
            bind:value={categorySearch}
            autofocus
          />
          <div class="max-h-48 overflow-y-auto space-y-1">
            {#each filteredCategories as category (category.entityId)}
              <button
                class="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-accent"
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
              class={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-accent',
                selectedAccountId === account.id && 'bg-accent'
              )}
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
            Cancel
          </Button>
          <Button class="flex-1" onclick={handleSave} disabled={!amountString || amountString === '0'}>
            Save Transaction
          </Button>
        </div>
      {/if}
    </div>
  </div>
{/if}

