<script lang="ts">
  import { X, Building2, Wallet, CreditCard, PiggyBank, Landmark, Info } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';
  import { t } from '$lib/i18n';
  import { cn, formatCurrency } from '$lib/utils';

  interface AccountInfo {
    id: string;
    name: string;
    type: string;
    onBudget: boolean;
    closed: boolean;
    hidden: boolean;
    note?: string;
    balance: number;
    clearedBalance?: number;
    unclearedBalance?: number;
    lastReconciledDate?: string;
    lastReconciledBalance?: number;
  }

  interface Props {
    open?: boolean;
    account?: AccountInfo | null;
    onClose?: () => void;
  }

  let { open = $bindable(false), account = null, onClose }: Props = $props();

  // Form state
  let accountName = $state('');
  let accountNote = $state('');

  // Reset when opened
  $effect(() => {
    if (open && account) {
      accountName = account.name;
      accountNote = account.note || '';
    }
  });

  // Type display mapping
  const accountTypes: Record<string, { icon: typeof Wallet; label: string }> = {
    Checking: { icon: Building2, label: 'typeChecking' },
    Savings: { icon: PiggyBank, label: 'typeSavings' },
    CreditCard: { icon: CreditCard, label: 'typeCreditCard' },
    LineOfCredit: { icon: CreditCard, label: 'typeLineOfCredit' },
    Cash: { icon: Wallet, label: 'typeCash' },
    Paypal: { icon: Wallet, label: 'typePaypal' },
    Merchant: { icon: Building2, label: 'typeMerchant' },
    Investment: { icon: Landmark, label: 'typeInvestment' },
    Mortgage: { icon: Landmark, label: 'typeMortgage' },
    OtherAsset: { icon: Wallet, label: 'typeOtherAsset' },
    OtherLiability: { icon: CreditCard, label: 'typeOtherLiability' },
  };

  function getAccountTypeInfo(type: string) {
    return accountTypes[type] || { icon: Wallet, label: type };
  }

  function handleSave() {
    if (!$isEditMode) {
      addToast({ type: 'warning', message: $t('common.enableEditMode') });
      return;
    }

    if (!account) return;

    const changes: Record<string, unknown> = { entityId: account.id };
    let hasChanges = false;

    if (accountName.trim() !== account.name) {
      changes.accountName = accountName.trim();
      hasChanges = true;
    }

    if (accountNote.trim() !== (account.note || '')) {
      changes.note = accountNote.trim() || null;
      hasChanges = true;
    }

    if (hasChanges) {
      addPendingChange({
        type: 'account',
        action: 'update',
        entityId: account.id,
        entityName: account.name,
        data: changes,
      });

      addToast({
        type: 'success',
        message: $t('accounts.accountSaved'),
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

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  }

  // Get the icon component
  const TypeIcon = $derived(account ? getAccountTypeInfo(account.type).icon : Wallet);
</script>

{#if open && account}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="account-dialog-title"
    onkeydown={handleKeydown}
  >
    <Card class="w-full max-w-lg">
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle id="account-dialog-title" class="flex items-center gap-2">
            <svelte:component this={TypeIcon} class="h-5 w-5" />
            {$t('accounts.accountDetails')}
          </CardTitle>
          <Button variant="ghost" size="icon" onclick={handleClose}>
            <X class="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent class="space-y-6">
        <!-- Status badges -->
        <div class="flex flex-wrap gap-2">
          <Badge variant={account.onBudget ? 'default' : 'secondary'}>
            {account.onBudget ? $t('accounts.onBudgetAccount') : $t('accounts.offBudgetAccount')}
          </Badge>
          {#if account.closed}
            <Badge variant="outline" class="bg-muted">
              {$t('accounts.closedAccount')}
            </Badge>
          {/if}
          {#if account.hidden}
            <Badge variant="outline" class="bg-muted">
              {$t('accounts.hiddenAccount')}
            </Badge>
          {/if}
        </div>

        <!-- Account name -->
        <div>
          <label for="account-name" class="text-sm font-medium mb-2 block">
            {$t('accounts.accountName')}
          </label>
          <Input
            id="account-name"
            type="text"
            bind:value={accountName}
            disabled={!$isEditMode}
          />
        </div>

        <!-- Account type (read-only) -->
        <div>
          <label class="text-sm font-medium mb-2 block">
            {$t('accounts.accountType')}
          </label>
          <div class="flex items-center gap-2 h-10 px-3 rounded-md border border-input bg-muted/50">
            <svelte:component this={TypeIcon} class="h-4 w-4" />
            <span>{$t(`accounts.${getAccountTypeInfo(account.type).label}`)}</span>
          </div>
        </div>

        <!-- Balance information -->
        <div class="rounded-lg border p-4 space-y-3">
          <div class="flex items-center gap-2 text-sm font-medium">
            <Info class="h-4 w-4" />
            {$t('common.balance')}
          </div>

          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-muted-foreground">{$t('accounts.workingBalance')}</span>
              <div class={cn('text-lg font-semibold', account.balance < 0 ? 'text-red-500' : '')}>
                {formatCurrency(account.balance)}
              </div>
            </div>

            {#if account.clearedBalance !== undefined}
              <div>
                <span class="text-muted-foreground">{$t('accounts.clearedBalance')}</span>
                <div class={cn('text-lg font-semibold', (account.clearedBalance || 0) < 0 ? 'text-red-500' : '')}>
                  {formatCurrency(account.clearedBalance || 0)}
                </div>
              </div>
            {/if}

            {#if account.unclearedBalance !== undefined}
              <div>
                <span class="text-muted-foreground">{$t('accounts.unclearedBalance')}</span>
                <div class="text-lg font-semibold text-muted-foreground">
                  {formatCurrency(account.unclearedBalance || 0)}
                </div>
              </div>
            {/if}

            {#if account.lastReconciledDate}
              <div>
                <span class="text-muted-foreground">{$t('accounts.lastReconciled')}</span>
                <div class="font-medium">
                  {formatDate(account.lastReconciledDate)}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Note -->
        <div>
          <label for="account-note" class="text-sm font-medium mb-2 block">
            {$t('accounts.accountNote')}
          </label>
          <textarea
            id="account-note"
            class="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder={$t('accounts.accountNotePlaceholder')}
            bind:value={accountNote}
            disabled={!$isEditMode}
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
