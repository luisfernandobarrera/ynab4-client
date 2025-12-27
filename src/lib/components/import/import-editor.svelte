<script lang="ts">
  import { Upload, Download, Save, CheckCheck, Tag, Banknote, FileSpreadsheet, FileText } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
  import ImportRow from './import-row.svelte';
  import MSIDialog from './msi-dialog.svelte';
  import {
    parseCSV,
    detectColumns,
    csvToTransactions,
    excelToTransactions,
    getExcelSheetNames,
    serializeImportFile,
    generateImportFilename,
    downloadTemplate,
    type ImportTransaction,
    type ImportFile,
  } from '$lib/services/import-service';
  import { generateAllMSITransactions, type MSIResult } from '$lib/services/msi-service';
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
  let expandedIds = $state<Set<string>>(new Set());
  let selectedAccountId = $state('');
  let importFileName = $state('');

  // Expand/collapse functions
  function toggleExpand(id: string) {
    if (expandedIds.has(id)) {
      expandedIds = new Set([...expandedIds].filter(i => i !== id));
    } else {
      expandedIds = new Set([...expandedIds, id]);
    }
  }

  function expandAll() {
    expandedIds = new Set(transactions.map(t => t.id));
  }

  function collapseAll() {
    expandedIds = new Set();
  }

  // MSI Dialog state
  let msiDialogOpen = $state(false);
  let msiTransaction = $state<ImportTransaction | null>(null);

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

    // Check if it's our custom format
    if (file.name.endsWith('.ynab-import.json')) {
      try {
        const content = await file.text();
        const importFile: ImportFile = JSON.parse(content);
        transactions = importFile.transactions;
        selectedAccountId = importFile.accountId;
        addToast({ type: 'success', message: `Cargadas ${transactions.length} transacciones` });
        return;
      } catch (e) {
        addToast({ type: 'error', message: 'Formato de archivo inválido' });
        return;
      }
    }

    // Check if it's Excel
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      try {
        const buffer = await file.arrayBuffer();
        const sheetNames = getExcelSheetNames(buffer);
        
        // For now, use first sheet. TODO: Add sheet selector
        if (sheetNames.length === 0) {
          addToast({ type: 'error', message: 'El archivo Excel está vacío' });
          return;
        }
        
        transactions = excelToTransactions(buffer, 0);
        
        if (transactions.length === 0) {
          addToast({ type: 'warning', message: 'No se encontraron transacciones en el Excel' });
        } else {
          addToast({ 
            type: 'success', 
            message: `Cargadas ${transactions.length} transacciones de "${sheetNames[0]}"` 
          });
        }
        return;
      } catch (e) {
        console.error('Excel parse error:', e);
        addToast({ type: 'error', message: 'Error al leer el archivo Excel' });
        return;
      }
    }

    // Parse as CSV
    try {
      const content = await file.text();
      const rows = parseCSV(content);
      if (rows.length < 2) {
        addToast({ type: 'error', message: 'El archivo CSV está vacío o es inválido' });
        return;
      }

      const mapping = detectColumns(rows[0]);
      transactions = csvToTransactions(rows, mapping, true);
      addToast({ type: 'success', message: `Cargadas ${transactions.length} transacciones del CSV` });
    } catch (e) {
      console.error('CSV parse error:', e);
      addToast({ type: 'error', message: 'Error al leer el archivo CSV' });
    }
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
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    
    if (tx.amount >= 0) {
      addToast({ type: 'warning', message: 'MSI solo aplica a gastos (egresos)' });
      return;
    }
    
    msiTransaction = tx;
    msiDialogOpen = true;
  }

  // Handle MSI confirmation
  function handleMSIConfirm(result: MSIResult) {
    const tx = msiTransaction;
    if (!tx || !selectedAccountId) return;

    // Generate all MSI transactions
    const msiTxs = generateAllMSITransactions({
      originalTransaction: {
        date: tx.date,
        payeeId: tx.payeeId,
        payeeName: tx.payeeName || tx.description,
        categoryId: tx.categoryId,
        categoryName: tx.categoryName,
        accountId: selectedAccountId,
        amount: tx.amount,
        memo: tx.memo,
      },
      months: Math.round(Math.abs(tx.amount) / result.monthlyAmount),
      startDate: result.scheduledTransaction.date,
    });

    // Mark original as MSI and add counter + payments
    const originalId = tx.id;
    const now = Date.now();

    // Create counter-transaction
    const counterTx: ImportTransaction = {
      id: `import-msi-counter-${now}`,
      date: tx.date,
      description: `MSI Contrapartida: ${tx.description}`,
      originalMemo: tx.originalMemo || '',
      payeeId: null,
      payeeName: `MSI: ${tx.payeeName || tx.description}`,
      suggestedPayee: tx.suggestedPayee || '',
      categoryId: tx.categoryId,
      categoryName: tx.categoryName,
      suggestedCategory: tx.suggestedCategory || '',
      amount: Math.abs(tx.amount), // Positive (inflow)
      outflow: 0,
      inflow: Math.abs(tx.amount),
      memo: `Contrapartida MSI - ${msiTxs.length} meses`,
      reference: tx.reference || '',
      flag: 'Orange',
      cleared: false,
      isMSI: true,
      msiMonths: msiTxs.length,
      msiOriginalAmount: tx.amount,
      status: tx.categoryId ? 'ready' : 'pending',
    };

    // Create payment transactions
    const paymentTxs: ImportTransaction[] = msiTxs.map((msiTx, index) => ({
      id: `import-msi-payment-${now}-${index}`,
      date: msiTx.date,
      description: `MSI Pago ${index + 1}/${msiTxs.length}`,
      originalMemo: '',
      payeeId: tx.payeeId,
      payeeName: tx.payeeName || tx.description,
      suggestedPayee: tx.suggestedPayee || '',
      categoryId: tx.categoryId,
      categoryName: tx.categoryName,
      suggestedCategory: tx.suggestedCategory || '',
      amount: msiTx.amount,
      outflow: Math.abs(msiTx.amount),
      inflow: 0,
      memo: msiTx.memo,
      reference: '',
      flag: 'Orange',
      cleared: false,
      isMSI: true,
      msiMonths: msiTxs.length,
      msiOriginalAmount: tx.amount,
      status: tx.categoryId ? 'ready' : 'pending',
    }));

    // Update transactions list: mark original as skipped, add counter and payments
    transactions = transactions.map(t => 
      t.id === originalId ? { ...t, status: 'skipped' as const, memo: 'Convertido a MSI' } : t
    );
    transactions = [...transactions, counterTx, ...paymentTxs];

    msiDialogOpen = false;
    msiTransaction = null;
    addToast({ type: 'success', message: `MSI creado: ${msiTxs.length} pagos mensuales` });
  }

  // Export to YNAB4 CSV format
  function exportToYNAB4CSV() {
    if (!selectedAccount) {
      addToast({ type: 'error', message: 'Selecciona una cuenta primero' });
      return;
    }

    const readyTxs = transactions.filter(t => t.status === 'ready');
    if (readyTxs.length === 0) {
      addToast({ type: 'error', message: 'No hay transacciones listas para exportar' });
      return;
    }

    // YNAB4 CSV format: Date,Payee,Category,Memo,Outflow,Inflow
    const rows: string[] = [];
    rows.push('Date,Payee,Category,Memo,Outflow,Inflow');

    for (const tx of readyTxs) {
      const date = tx.date; // YYYY-MM-DD format
      const payee = `"${(tx.payeeName || tx.description).replace(/"/g, '""')}"`;
      const category = tx.categoryName ? `"${tx.categoryName.replace(/"/g, '""')}"` : '';
      const memo = tx.memo ? `"${tx.memo.replace(/"/g, '""')}"` : '';
      const outflow = tx.amount < 0 ? Math.abs(tx.amount).toFixed(2) : '';
      const inflow = tx.amount > 0 ? tx.amount.toFixed(2) : '';

      rows.push(`${date},${payee},${category},${memo},${outflow},${inflow}`);
    }

    // Download CSV
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ynab4-import-${selectedAccount.name}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    addToast({ type: 'success', message: `Exportado: ${readyTxs.length} transacciones` });
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="border-b p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-heading font-semibold">Transaction Workbench</h2>
      <div class="flex gap-2">
        <Button variant="outline" onclick={saveImportFile}>
          <Download class="mr-2 h-4 w-4" />
          Guardar
        </Button>
        <Button variant="outline" onclick={exportToYNAB4CSV} disabled={stats().ready === 0}>
          <FileText class="mr-2 h-4 w-4" />
          CSV YNAB4
        </Button>
        <Button onclick={importTransactions} disabled={stats().ready === 0}>
          <CheckCheck class="mr-2 h-4 w-4" />
          Importar {stats().ready}
        </Button>
      </div>
    </div>

    <!-- File upload and account selection -->
    <div class="flex items-center gap-4">
      <label class="flex-1">
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.ynab-import.json"
          class="hidden"
          onchange={handleFileUpload}
        />
        <span class="flex items-center justify-center h-10 w-full rounded-md border border-input bg-background px-3 cursor-pointer hover:bg-accent hover:text-accent-foreground text-sm">
          <Upload class="mr-2 h-4 w-4" />
          {importFileName || 'Cargar Excel, CSV o archivo guardado'}
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
        <FileSpreadsheet class="h-12 w-12 text-muted-foreground mb-4" />
        <p class="text-lg font-medium">Carga un archivo para empezar</p>
        <p class="text-sm text-muted-foreground mt-1">
          Soporta Excel (.xlsx), CSV, o archivos guardados (.ynab-import.json)
        </p>
        <div class="mt-4">
          <Button variant="outline" size="sm" onclick={downloadTemplate}>
            <Download class="mr-2 h-4 w-4" />
            Descargar Plantilla Excel
          </Button>
        </div>
        <p class="text-xs text-muted-foreground mt-4 max-w-md">
          La plantilla incluye todas las columnas soportadas con ejemplos e instrucciones
        </p>
      </div>
    {:else}
      <!-- Table header -->
      <div class="flex items-center justify-between p-2 border-b bg-muted/50 sticky top-0 z-10">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectedIds.size === transactions.length}
            onchange={selectAll}
            class="h-4 w-4 rounded border-input"
            title="Seleccionar todas"
          />
          <span class="text-sm text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} seleccionadas` : `${transactions.length} transacciones`}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="sm" onclick={expandAll}>
            Expandir
          </Button>
          <Button variant="ghost" size="sm" onclick={collapseAll}>
            Colapsar
          </Button>
        </div>
      </div>

      <!-- Column Headers -->
      <div class="grid grid-cols-[auto,1fr,1fr,1fr,auto,auto,auto] gap-2 items-center px-2 py-1 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
        <div class="w-14"></div>
        <div>Fecha</div>
        <div>Payee</div>
        <div>Categoría</div>
        <div class="text-right min-w-[120px]">Monto</div>
        <div class="w-6"></div>
        <div class="w-24 text-right">Acciones</div>
      </div>

      <!-- Rows -->
      {#each transactions as tx (tx.id)}
        <ImportRow
          transaction={tx}
          selected={selectedIds.has(tx.id)}
          expanded={expandedIds.has(tx.id)}
          onUpdate={(updates) => updateTransaction(tx.id, updates)}
          onSelect={() => toggleSelect(tx.id)}
          onMSI={() => openMSI(tx.id)}
          onToggleExpand={() => toggleExpand(tx.id)}
        />
      {/each}
    {/if}
  </div>
</div>

<!-- MSI Dialog -->
<MSIDialog
  bind:open={msiDialogOpen}
  transaction={msiTransaction ? {
    date: msiTransaction.date,
    payeeId: msiTransaction.payeeId,
    payeeName: msiTransaction.payeeName || msiTransaction.description,
    categoryId: msiTransaction.categoryId,
    categoryName: msiTransaction.categoryName,
    accountId: selectedAccountId,
    amount: msiTransaction.amount,
    memo: msiTransaction.memo,
  } : null}
  onConfirm={handleMSIConfirm}
  onClose={() => { msiDialogOpen = false; msiTransaction = null; }}
/>

