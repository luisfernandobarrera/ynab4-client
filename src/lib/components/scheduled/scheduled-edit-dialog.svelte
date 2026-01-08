<script lang="ts">
  import { X, Calendar, DollarSign, Tag, User, Building2, RepeatIcon } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { accounts, payees, categories, masterCategories } from '$lib/stores/budget';
  import { t } from '$lib/i18n';
  import { formatCurrency } from '$lib/utils';

  interface ScheduledTx {
    entityId: string;
    date: string;
    dateNext: string;
    frequency: string;
    amount: number;
    payeeId: string | null;
    categoryId: string | null;
    accountId: string;
    memo: string;
    flag: string | null;
  }

  interface Props {
    open?: boolean;
    transaction?: ScheduledTx | null;
    onClose?: () => void;
  }

  let { open = $bindable(false), transaction = null, onClose }: Props = $props();

  // Form state
  let dateNext = $state('');
  let frequency = $state('');
  let amount = $state(0);
  let isOutflow = $state(true);
  let payeeId = $state<string | null>(null);
  let categoryId = $state<string | null>(null);
  let accountId = $state('');
  let memo = $state('');

  // Reset when opened
  $effect(() => {
    if (open && transaction) {
      dateNext = transaction.dateNext || '';
      frequency = transaction.frequency || 'Monthly';
      amount = Math.abs(transaction.amount);
      isOutflow = transaction.amount < 0;
      payeeId = transaction.payeeId;
      categoryId = transaction.categoryId;
      accountId = transaction.accountId;
      memo = transaction.memo || '';
    }
  });

  // Frequency options
  const frequencyOptions = [
    { value: 'Once', label: 'Una vez' },
    { value: 'Weekly', label: 'Semanal' },
    { value: 'Every2Weeks', label: 'Quincenal' },
    { value: 'TwiceAMonth', label: '2 veces al mes' },
    { value: 'Every4Weeks', label: 'Cada 4 semanas' },
    { value: 'Monthly', label: 'Mensual' },
    { value: 'Every2Months', label: 'Bimestral' },
    { value: 'Every3Months', label: 'Trimestral' },
    { value: 'Every4Months', label: 'Cuatrimestral' },
    { value: 'TwiceAYear', label: 'Semestral' },
    { value: 'Yearly', label: 'Anual' },
    { value: 'Every2Years', label: 'Bianual' },
  ];

  // Available accounts (not closed, not hidden)
  const availableAccounts = $derived(
    $accounts.filter(a => !a.closed && !a.hidden)
  );

  // Available payees (sorted by name)
  const availablePayees = $derived(
    [...$payees].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  );

  // Grouped categories by master category
  const groupedCategories = $derived.by(() => {
    const groups: { masterName: string; categories: { id: string; name: string }[] }[] = [];

    for (const mc of $masterCategories) {
      if (mc.isTombstone || mc.isHidden) continue;
      const cats = $categories
        .filter(c => c.masterCategoryId === mc.entityId && !c.isTombstone && !c.isHidden)
        .map(c => ({ id: c.entityId, name: c.name }));
      if (cats.length > 0) {
        groups.push({ masterName: mc.name, categories: cats });
      }
    }
    return groups;
  });

  function getPayeeName(id: string | null): string {
    if (!id) return '';
    const p = $payees.find(p => p.entityId === id);
    return p?.name || '';
  }

  function handleSave() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      return;
    }

    if (!transaction) return;

    const finalAmount = isOutflow ? -Math.abs(amount) : Math.abs(amount);

    const changes: Record<string, unknown> = {
      entityId: transaction.entityId,
    };
    let hasChanges = false;

    if (dateNext !== transaction.dateNext) {
      changes.dateNext = dateNext;
      hasChanges = true;
    }

    if (frequency !== transaction.frequency) {
      changes.frequency = frequency;
      hasChanges = true;
    }

    if (finalAmount !== transaction.amount) {
      changes.amount = finalAmount;
      hasChanges = true;
    }

    if (payeeId !== transaction.payeeId) {
      changes.payeeId = payeeId;
      hasChanges = true;
    }

    if (categoryId !== transaction.categoryId) {
      changes.categoryId = categoryId;
      hasChanges = true;
    }

    if (accountId !== transaction.accountId) {
      changes.accountId = accountId;
      hasChanges = true;
    }

    if (memo !== (transaction.memo || '')) {
      changes.memo = memo || null;
      hasChanges = true;
    }

    if (hasChanges) {
      addPendingChange({
        type: 'scheduledTransaction',
        action: 'update',
        entityId: transaction.entityId,
        entityName: getPayeeName(transaction.payeeId) || 'Transacción programada',
        data: changes,
      });

      addToast({
        type: 'success',
        message: $t('scheduled.transactionUpdated'),
      });
    }

    handleClose();
  }

  function handleClose() {
    open = false;
    onClose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
  }
</script>

{#if open && transaction}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="scheduled-dialog-title"
    tabindex="-1"
    onkeydown={handleKeydown}
  >
    <Card class="w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle id="scheduled-dialog-title" class="flex items-center gap-2">
            <Calendar class="h-5 w-5" />
            {$t('scheduled.editScheduled')}
          </CardTitle>
          <Button variant="ghost" size="icon" onclick={handleClose}>
            <X class="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent class="space-y-4">
        <!-- Date -->
        <div>
          <label for="scheduled-date" class="text-sm font-medium mb-2 block flex items-center gap-2">
            <Calendar class="h-4 w-4" />
            {$t('scheduled.nextDate')}
          </label>
          <Input
            id="scheduled-date"
            type="date"
            bind:value={dateNext}
            disabled={!$isEditMode}
          />
        </div>

        <!-- Frequency -->
        <div>
          <label for="scheduled-frequency" class="text-sm font-medium mb-2 block flex items-center gap-2">
            <RepeatIcon class="h-4 w-4" />
            {$t('scheduled.frequency')}
          </label>
          <select
            id="scheduled-frequency"
            class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            bind:value={frequency}
            disabled={!$isEditMode}
          >
            {#each frequencyOptions as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>

        <!-- Account -->
        <div>
          <label for="scheduled-account" class="text-sm font-medium mb-2 block flex items-center gap-2">
            <Building2 class="h-4 w-4" />
            {$t('common.account')}
          </label>
          <select
            id="scheduled-account"
            class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            bind:value={accountId}
            disabled={!$isEditMode}
          >
            {#each availableAccounts as account}
              <option value={account.id}>{account.name}</option>
            {/each}
          </select>
        </div>

        <!-- Payee -->
        <div>
          <label for="scheduled-payee" class="text-sm font-medium mb-2 block flex items-center gap-2">
            <User class="h-4 w-4" />
            {$t('common.payee')}
          </label>
          <select
            id="scheduled-payee"
            class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            bind:value={payeeId}
            disabled={!$isEditMode}
          >
            <option value={null}>-- Sin beneficiario --</option>
            {#each availablePayees as payee}
              <option value={payee.entityId}>{payee.name}</option>
            {/each}
          </select>
        </div>

        <!-- Category -->
        <div>
          <label for="scheduled-category" class="text-sm font-medium mb-2 block flex items-center gap-2">
            <Tag class="h-4 w-4" />
            {$t('common.category')}
          </label>
          <select
            id="scheduled-category"
            class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            bind:value={categoryId}
            disabled={!$isEditMode}
          >
            <option value={null}>-- Sin categoría --</option>
            {#each groupedCategories as group}
              <optgroup label={group.masterName}>
                {#each group.categories as cat}
                  <option value={cat.id}>{cat.name}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
        </div>

        <!-- Amount -->
        <div>
          <label for="scheduled-amount" class="text-sm font-medium mb-2 block flex items-center gap-2">
            <DollarSign class="h-4 w-4" />
            {$t('common.amount')}
          </label>
          <div class="flex gap-2">
            <select
              class="w-28 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
              bind:value={isOutflow}
              disabled={!$isEditMode}
            >
              <option value={true}>{$t('common.outflow')}</option>
              <option value={false}>{$t('common.inflow')}</option>
            </select>
            <Input
              id="scheduled-amount"
              type="number"
              step="0.01"
              min="0"
              bind:value={amount}
              disabled={!$isEditMode}
              class="flex-1"
            />
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            {isOutflow ? $t('common.outflow') : $t('common.inflow')}: {formatCurrency(amount)}
          </p>
        </div>

        <!-- Memo -->
        <div>
          <label for="scheduled-memo" class="text-sm font-medium mb-2 block">
            {$t('common.memo')}
          </label>
          <textarea
            id="scheduled-memo"
            class="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            bind:value={memo}
            disabled={!$isEditMode}
            placeholder={$t('common.memoPlaceholder')}
          ></textarea>
        </div>

        {#if !$isEditMode}
          <p class="text-xs text-muted-foreground text-center">
            {$t('common.enableEditMode')}
          </p>
        {/if}
      </CardContent>

      <CardFooter class="flex justify-end gap-2">
        <Button variant="outline" onclick={handleClose}>
          {$t('common.cancel')}
        </Button>
        <Button onclick={handleSave} disabled={!$isEditMode}>
          {$t('common.save')}
        </Button>
      </CardFooter>
    </Card>
  </div>
{/if}
