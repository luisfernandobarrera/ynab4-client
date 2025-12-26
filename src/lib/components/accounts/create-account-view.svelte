<script lang="ts">
  import { Wallet, CreditCard, PiggyBank, Landmark, DollarSign, Building, TrendingUp, Home } from 'lucide-svelte';
  import { t } from '$lib/i18n';
  import { budgetInfo, accounts } from '$lib/stores/budget';
  import { isEditMode, addPendingChange, addToast } from '$lib/stores/ui';

  // Account type definitions
  const ACCOUNT_TYPES = [
    { id: 'Checking', icon: Landmark, isLiability: false },
    { id: 'Savings', icon: PiggyBank, isLiability: false },
    { id: 'CreditCard', icon: CreditCard, isLiability: true },
    { id: 'Cash', icon: Wallet, isLiability: false },
    { id: 'LineOfCredit', icon: DollarSign, isLiability: true },
    { id: 'PayPal', icon: DollarSign, isLiability: false },
    { id: 'MerchantAccount', icon: Building, isLiability: true },
    { id: 'InvestmentAccount', icon: TrendingUp, isLiability: false },
    { id: 'Mortgage', icon: Home, isLiability: true },
    { id: 'OtherAsset', icon: DollarSign, isLiability: false },
    { id: 'OtherLiability', icon: DollarSign, isLiability: true },
  ];

  // Form state
  let accountName = $state('');
  let selectedType = $state('Checking');
  let isOnBudget = $state(true);
  let startingBalance = $state('');
  let startingDate = $state(new Date().toISOString().split('T')[0]);
  let note = $state('');
  let isCreating = $state(false);
  let error = $state<string | null>(null);

  // Get type info
  const selectedTypeInfo = $derived(ACCOUNT_TYPES.find(t => t.id === selectedType));
  const isLiability = $derived(selectedTypeInfo?.isLiability || false);

  function getAccountTypeLabel(typeId: string): string {
    // Use translations
    const key = `account.types.${typeId.charAt(0).toLowerCase()}${typeId.slice(1)}` as keyof typeof $t;
    const translated = $t(key);
    return translated || typeId;
  }

  async function handleSubmit() {
    // Validate
    if (!accountName.trim()) {
      error = $t('account.nameRequired');
      return;
    }

    if (!$isEditMode) {
      addToast({ type: 'warning', message: 'Enable edit mode to create accounts' });
      return;
    }

    const client = $budgetInfo.client;
    if (!client) {
      error = $t('account.createFailed');
      return;
    }

    isCreating = true;
    error = null;

    try {
      // Parse balance
      let balance = parseFloat(startingBalance) || 0;
      // For liabilities, make the balance negative
      if (isLiability && balance > 0) {
        balance = -balance;
      }

      // Create account data
      const accountData = {
        name: accountName.trim(),
        type: selectedType,
        onBudget: isOnBudget,
        balance,
        startingDate,
        note: note.trim() || undefined
      };

      // Track as pending change
      addPendingChange({
        type: 'account',
        action: 'create',
        entityId: 'new-account-' + Date.now(),
        entityName: accountName.trim(),
        data: accountData
      });

      addToast({ type: 'success', message: 'Account created' });

      // Reset form
      accountName = '';
      selectedType = 'Checking';
      isOnBudget = true;
      startingBalance = '';
      startingDate = new Date().toISOString().split('T')[0];
      note = '';

    } catch (err) {
      console.error('Failed to create account:', err);
      error = $t('account.createFailed');
    } finally {
      isCreating = false;
    }
  }
</script>

<div class="create-account-view">
  <div class="create-account-header">
    <h2>{$t('account.createAccount')}</h2>
  </div>

  {#if !$isEditMode}
    <div class="edit-mode-warning">
      <p class="warning-title">{$t('account.editModeRequired')}</p>
      <p class="warning-text">{$t('account.enableEditMode')}</p>
    </div>
  {:else}
    <form class="create-account-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <!-- Account Name -->
      <div class="form-field">
        <label for="account-name">{$t('account.accountName')}</label>
        <input
          id="account-name"
          type="text"
          bind:value={accountName}
          placeholder={$t('account.enterName')}
          class:error={error && !accountName.trim()}
        />
        {#if error && !accountName.trim()}
          <span class="field-error">{error}</span>
        {/if}
      </div>

      <!-- Account Type -->
      <fieldset class="form-field">
        <legend class="field-legend">{$t('account.accountType')}</legend>
        <div class="account-type-grid">
          {#each ACCOUNT_TYPES as type}
            {@const Icon = type.icon}
            <button
              type="button"
              class="type-option"
              class:selected={selectedType === type.id}
              onclick={() => selectedType = type.id}
            >
              <Icon class="h-5 w-5" />
              <span>{getAccountTypeLabel(type.id)}</span>
            </button>
          {/each}
        </div>
      </fieldset>

      <!-- Budget Status -->
      <fieldset class="form-field">
        <legend class="field-legend">{$t('account.budgetStatus')}</legend>
        <div class="budget-status-options">
          <button
            type="button"
            class="budget-option"
            class:selected={isOnBudget}
            onclick={() => isOnBudget = true}
          >
            <span class="option-label">{$t('account.onBudget')}</span>
            <span class="option-hint">{$t('account.onBudgetHint')}</span>
          </button>
          <button
            type="button"
            class="budget-option"
            class:selected={!isOnBudget}
            onclick={() => isOnBudget = false}
          >
            <span class="option-label">{$t('account.offBudget')}</span>
            <span class="option-hint">{$t('account.offBudgetHint')}</span>
          </button>
        </div>
      </fieldset>

      <!-- Starting Balance -->
      <div class="form-field">
        <label for="starting-balance">{$t('account.startingBalance')}</label>
        <div class="balance-input-wrapper">
          <span class="currency-symbol">$</span>
          <input
            id="starting-balance"
            type="text"
            inputmode="decimal"
            bind:value={startingBalance}
            placeholder="0.00"
          />
        </div>
        <span class="field-hint">
          {isLiability ? $t('account.liabilityBalanceHint') : $t('account.assetBalanceHint')}
        </span>
      </div>

      <!-- Starting Date -->
      <div class="form-field">
        <label for="starting-date">{$t('account.startingDate')}</label>
        <input
          id="starting-date"
          type="date"
          bind:value={startingDate}
        />
      </div>

      <!-- Note -->
      <div class="form-field">
        <label for="account-note">{$t('account.note')}</label>
        <textarea
          id="account-note"
          bind:value={note}
          placeholder={$t('account.noteOptional')}
          rows="3"
        ></textarea>
      </div>

      <!-- Submit -->
      <div class="form-actions">
        <button type="submit" class="btn-primary" disabled={isCreating}>
          {isCreating ? $t('account.creating') : $t('account.createAccount')}
        </button>
      </div>

      {#if error && accountName.trim()}
        <div class="form-error">
          {error}
        </div>
      {/if}
    </form>
  {/if}
</div>

<style>
  .create-account-view {
    max-width: 600px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .create-account-header {
    margin-bottom: 1.5rem;
  }

  .create-account-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--foreground);
  }

  /* Edit Mode Warning */
  .edit-mode-warning {
    text-align: center;
    padding: 3rem 1rem;
    background: var(--muted);
    border-radius: 8px;
  }

  .warning-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--foreground);
    margin: 0 0 0.5rem;
  }

  .warning-text {
    color: var(--muted-foreground);
    margin: 0;
  }

  /* Form */
  .create-account-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border: none;
    padding: 0;
    margin: 0;
  }

  .form-field label,
  .field-legend {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--foreground);
    padding: 0;
  }

  .form-field input[type="text"],
  .form-field input[type="date"],
  .form-field textarea {
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.9rem;
  }

  .form-field input:focus,
  .form-field textarea:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .form-field input.error {
    border-color: var(--destructive);
  }

  .field-error {
    font-size: 0.8rem;
    color: var(--destructive);
  }

  .field-hint {
    font-size: 0.8rem;
    color: var(--muted-foreground);
  }

  /* Balance Input */
  .balance-input-wrapper {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .balance-input-wrapper:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .currency-symbol {
    padding: 0.75rem;
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 0.9rem;
  }

  .balance-input-wrapper input {
    flex: 1;
    padding: 0.75rem;
    border: none;
    background: var(--background);
    color: var(--foreground);
    font-size: 0.9rem;
    outline: none;
  }

  /* Account Type Grid */
  .account-type-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.5rem;
  }

  .type-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0.75rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    color: var(--muted-foreground);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .type-option:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .type-option.selected {
    border-color: var(--primary);
    background: rgba(59, 130, 246, 0.1);
    color: var(--primary);
  }

  /* Budget Status Options */
  .budget-status-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .budget-option {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--background);
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }

  .budget-option:hover {
    background: var(--accent);
  }

  .budget-option.selected {
    border-color: var(--primary);
    background: rgba(59, 130, 246, 0.1);
  }

  .option-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--foreground);
    margin-bottom: 0.25rem;
  }

  .option-hint {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  /* Form Actions */
  .form-actions {
    padding-top: 1rem;
  }

  .btn-primary {
    width: 100%;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-error {
    padding: 0.75rem;
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.3);
    border-radius: 6px;
    color: var(--destructive);
    font-size: 0.85rem;
    text-align: center;
  }

  /* Mobile */
  @media (max-width: 640px) {
    .create-account-view {
      padding: 1rem;
    }

    .account-type-grid {
      grid-template-columns: repeat(3, 1fr);
    }

    .budget-status-options {
      grid-template-columns: 1fr;
    }
  }
</style>

