<script lang="ts">
  import { Upload, Download, Save, CheckCheck, Tag, Banknote } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
  import ImportRow from './import-row.svelte';
  import {
    parseCSV,
    detectColumns,
    csvToTransactions,
    serializeImportFile,
    generateImportFilename,
    type ImportTransaction,
    type ImportFile,
  } from '$lib/services/import-service';
  import { accounts, categories, payees } from '$lib/stores/budget';
  import { addToast } from '$lib/stores/ui';
  import { formatCurrency } from '$lib/utils';

  interface Props {
    onImport?: (transactions: ImportTransaction[]) => void;
    onClose?: () => void;
  }

  let { onImport, onClose }: Props = $props();

  let transactions = $state<ImportTransaction[]>([]);
  let selectedIds = $state<Set<string>>(new Set());
  let selectedAccountId = $state('');
  let importFileName = $state('');

  // Stats
  const stats = $derived(() => {
    const pending = transactions.filter((t) => t.status === 'pending').length;
    const ready = transactions.filter((t) => t.status === 'ready').length;
    const skipped = transactions.filter((t) => t.status === 'skipped').length;
    const total = transactions.reduce((sum, t) => {
      if (t.status === 'skipped') return sum;
      return sum + t.amount;
    }, 0);
    return { pending, ready, skipped, total };
  });

  const selectedAccount = $derived($accounts.find((a) => a.id === selectedAccountId));

  // Handle file upload
  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    importFileName = file.name;
    const content = await file.text();

    // Check if it's our custom format
    if (file.name.endsWith('.ynab-import.json')) {
      try {
        const importFile: ImportFile = JSON.parse(content);
        transactions = importFile.transactions;
        selectedAccountId = importFile.accountId;
        addToast({ type: 'success', message: `Loaded ${transactions.length} transactions` });
        return;
      } catch (e) {
        addToast({ type: 'error', message: 'Invalid import file format' });
        return;
      }
    }

    // Parse as CSV
    const rows = parseCSV(content);
    if (rows.length < 2) {
      addToast({ type: 'error', message: 'CSV file is empty or invalid' });
      return;
    }

    const mapping = detectColumns(rows[0]);
    transactions = csvToTransactions(rows, mapping, true);
    addToast({ type: 'success', message: `Parsed ${transactions.length} transactions from CSV` });
  }

  // Update a transaction
  function updateTransaction(id: string, updates: Partial<ImportTransaction>) {
    transactions = transactions.map((t) => (t.id === id ? { ...t, ...updates } : t));
  }

  // Toggle selection
  function toggleSelect(id: string) {
    selectedIds = new Set(selectedIds);
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
  }

  // Select all
  function selectAll() {
    if (selectedIds.size === transactions.length) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(transactions.map((t) => t.id));
    }
  }

  // Bulk assign category
  function bulkAssignCategory() {
    if (selectedIds.size === 0) {
      addToast({ type: 'warning', message: 'Select transactions first' });
      return;
    }
    // TODO: Open category picker
    addToast({ type: 'info', message: 'Category picker coming soon' });
  }

  // Bulk assign payee
  function bulkAssignPayee() {
    if (selectedIds.size === 0) {
      addToast({ type: 'warning', message: 'Select transactions first' });
      return;
    }
    // TODO: Open payee picker
    addToast({ type: 'info', message: 'Payee picker coming soon' });
  }

  // Save import file
  function saveImportFile() {
    if (!selectedAccount) {
      addToast({ type: 'error', message: 'Select an account first' });
      return;
    }

    const importFile: ImportFile = {
      id: crypto.randomUUID(),
      name: importFileName || 'Import',
      sourceFile: importFileName,
      accountId: selectedAccountId,
      accountName: selectedAccount.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactions,
    };

    const json = serializeImportFile(importFile);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generateImportFilename(selectedAccount.name);
    a.click();
    URL.revokeObjectURL(url);

    addToast({ type: 'success', message: 'Import file saved' });
  }

  // Import ready transactions
  function importTransactions() {
    const ready = transactions.filter((t) => t.status === 'ready');
    if (ready.length === 0) {
      addToast({ type: 'error', message: 'No transactions ready to import' });
      return;
    }

    onImport?.(ready);
    addToast({ type: 'success', message: `Imported ${ready.length} transactions` });

    // Mark as imported
    transactions = transactions.map((t) =>
      t.status === 'ready' ? { ...t, status: 'imported' as const } : t
    );
  }

  // Open MSI dialog
  function openMSI(txId: string) {
    // TODO: Open MSI dialog
    addToast({ type: 'info', message: 'MSI dialog coming soon' });
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="border-b p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-heading font-semibold">Import Transactions</h2>
      <div class="flex gap-2">
        <Button variant="outline" onclick={saveImportFile}>
          <Download class="mr-2 h-4 w-4" />
          Save
        </Button>
        <Button onclick={importTransactions} disabled={stats().ready === 0}>
          <CheckCheck class="mr-2 h-4 w-4" />
          Import {stats().ready}
        </Button>
      </div>
    </div>

    <!-- File upload and account selection -->
    <div class="flex items-center gap-4">
      <label class="flex-1">
        <input
          type="file"
          accept=".csv,.ynab-import.json"
          class="hidden"
          onchange={handleFileUpload}
        />
        <span class="flex items-center justify-center h-10 w-full rounded-md border border-input bg-background px-3 cursor-pointer hover:bg-accent hover:text-accent-foreground text-sm">
          <Upload class="mr-2 h-4 w-4" />
          {importFileName || 'Upload CSV or Import File'}
        </span>
      </label>

      <select
        class="h-10 rounded-md border border-input bg-background px-3"
        bind:value={selectedAccountId}
      >
        <option value="">Select account...</option>
        {#each $accounts as account (account.id)}
          <option value={account.id}>{account.name}</option>
        {/each}
      </select>
    </div>

    <!-- Stats and bulk actions -->
    {#if transactions.length > 0}
      <div class="flex items-center justify-between">
        <div class="flex gap-4 text-sm">
          <span>Total: <strong>{transactions.length}</strong></span>
          <span class="text-ynab-green">Ready: <strong>{stats().ready}</strong></span>
          <span class="text-destructive">Pending: <strong>{stats().pending}</strong></span>
          <span class="text-muted-foreground">Skipped: <strong>{stats().skipped}</strong></span>
          <span class="amount">
            Net: <strong class={stats().total >= 0 ? 'text-ynab-green' : 'text-ynab-red'}>
              {formatCurrency(stats().total)}
            </strong>
          </span>
        </div>

        <div class="flex gap-2">
          <Button variant="outline" size="sm" onclick={bulkAssignCategory}>
            <Tag class="mr-1 h-4 w-4" />
            Category
          </Button>
          <Button variant="outline" size="sm" onclick={bulkAssignPayee}>
            <Tag class="mr-1 h-4 w-4" />
            Payee
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Transaction list -->
  <div class="flex-1 overflow-auto">
    {#if transactions.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center p-8">
        <Upload class="h-12 w-12 text-muted-foreground mb-4" />
        <p class="text-lg font-medium">Upload a CSV file to start</p>
        <p class="text-sm text-muted-foreground mt-1">
          Or load a previously saved .ynab-import.json file
        </p>
      </div>
    {:else}
      <!-- Table header -->
      <div class="grid grid-cols-12 gap-2 items-center p-3 border-b bg-muted/50 text-sm font-medium sticky top-0">
        <div class="col-span-1">
          <input
            type="checkbox"
            checked={selectedIds.size === transactions.length}
            onchange={selectAll}
            class="h-4 w-4 rounded border-input"
          />
        </div>
        <div class="col-span-2">Date</div>
        <div class="col-span-3">Payee</div>
        <div class="col-span-2">Category</div>
        <div class="col-span-2 text-right">Amount</div>
        <div class="col-span-2 text-right">Status</div>
      </div>

      <!-- Rows -->
      {#each transactions as tx (tx.id)}
        <ImportRow
          transaction={tx}
          selected={selectedIds.has(tx.id)}
          onUpdate={(updates) => updateTransaction(tx.id, updates)}
          onSelect={() => toggleSelect(tx.id)}
          onMSI={() => openMSI(tx.id)}
        />
      {/each}
    {/if}
  </div>
</div>

