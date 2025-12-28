<script lang="ts">
  import { Upload, Download, Save, Tag, FileSpreadsheet, FileText, ChevronDown, ChevronUp } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
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
    downloadSampleCSV,
    type ImportTransaction,
    type ImportFile,
  } from '$lib/services/import-service';
  import { generateAllMSITransactions, type MSIResult } from '$lib/services/msi-service';
  import { accounts, categories, payees, budgetInfo } from '$lib/stores/budget';
  import { addToast, isEditMode, addPendingChange } from '$lib/stores/ui';
  import { formatCurrency } from '$lib/utils';
  import { onMount, onDestroy } from 'svelte';
  import { isTauri } from '$lib/services';

  interface Props {
    onImport?: (transactions: ImportTransaction[]) => void;
    onClose?: () => void;
  }

  let { onImport, onClose }: Props = $props();

  let transactions = $state<ImportTransaction[]>([]);
  let selectedIds = $state<Set<string>>(new Set());
  let expandedIds = $state<Set<string>>(new Set());
  let expandedGroups = $state<Set<string>>(new Set(['__default__'])); // Groups expanded by default
  let importFileName = $state('');
  let isDragging = $state(false);
  let filterMode = $state<'all' | 'pending' | 'ready' | 'skipped'>('all');
  
  // Account mapping state (kept for future import functionality)
  let accountMapping = $state<Map<string, string>>(new Map());
  let showCreateAccountDialog = $state(false);
  let createAccountForGroup = $state<string | null>(null);
  let newAccountName = $state('');
  let newAccountType = $state('Checking');
  let newAccountOnBudget = $state(true);

  // Tauri file drop handling
  let tauriUnlisten: (() => void) | null = null;
  
  onMount(async () => {
    // Initialize all groups as expanded
    for (const key of transactionGroups.keys()) {
      expandedGroups.add(key);
    }
    
    // Set up Tauri file drop listener
    if (isTauri()) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const { readFile } = await import('@tauri-apps/plugin-fs');
        
        tauriUnlisten = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
          const paths = event.payload.paths;
          if (!paths || paths.length === 0) return;
          
          const filePath = paths[0];
          const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
          
          try {
            importFileName = fileName;
            
            if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
              // Read Excel file
              const data = await readFile(filePath);
              const buffer = data.buffer;
              const sheetNames = getExcelSheetNames(buffer);
              
              if (sheetNames.length === 0) {
                addToast({ type: 'error', message: 'El archivo Excel está vacío' });
                return;
              }
              
              transactions = excelToTransactions(buffer, 0);
              addToast({ type: 'success', message: `Cargadas ${transactions.length} transacciones de "${sheetNames[0]}"` });
              
            } else if (fileName.endsWith('.csv')) {
              // Read CSV file
              const data = await readFile(filePath);
              const content = new TextDecoder().decode(data);
              const rows = parseCSV(content);
              
              if (rows.length < 2) {
                addToast({ type: 'error', message: 'El archivo CSV está vacío o es inválido' });
                return;
              }
              
              const mapping = detectColumns(rows[0]);
              transactions = csvToTransactions(rows, mapping, true);
              addToast({ type: 'success', message: `Cargadas ${transactions.length} transacciones del CSV` });
              
            } else if (fileName.endsWith('.ynab-import.json')) {
              // Read JSON import file
              const data = await readFile(filePath);
              const content = new TextDecoder().decode(data);
              const importFile: ImportFile = JSON.parse(content);
              transactions = importFile.transactions;
              addToast({ type: 'success', message: `Cargadas ${transactions.length} transacciones` });
              
            } else {
              addToast({ type: 'warning', message: 'Formato de archivo no soportado. Usa .xlsx, .csv o .ynab-import.json' });
            }
          } catch (e) {
            console.error('Error loading file:', e);
            addToast({ type: 'error', message: 'Error al cargar el archivo' });
          }
        });
      } catch (e) {
        console.warn('Could not set up Tauri file drop listener:', e);
      }
    }
  });
  
  onDestroy(() => {
    if (tauriUnlisten) {
      tauriUnlisten();
    }
  });

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

  // Filtered transactions based on filterMode
  const filteredTransactions = $derived.by(() => {
    if (filterMode === 'all') return transactions;
    return transactions.filter(tx => tx.status === filterMode);
  });
  
  // Group transactions by detected account name
  const transactionGroups = $derived.by(() => {
    const groups = new Map<string, ImportTransaction[]>();
    
    for (const tx of filteredTransactions) {
      const groupKey = tx.accountName || '__default__';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(tx);
    }
    
    return groups;
  });
  
  // Get unique detected account names
  const detectedAccounts = $derived(Array.from(transactionGroups.keys()).filter(k => k !== '__default__'));
  
  // Check if multi-account mode (more than one detected account or any non-default)
  const isMultiAccount = $derived(detectedAccounts.length > 0);

  // Stats per group
  const groupStats = $derived.by(() => {
    const stats = new Map<string, { count: number; ready: number; pending: number; skipped: number; total: number }>();
    
    for (const [groupKey, txs] of transactionGroups) {
      const pending = txs.filter((t) => t.status === 'pending').length;
      const ready = txs.filter((t) => t.status === 'ready').length;
      const skipped = txs.filter((t) => t.status === 'skipped').length;
      const total = txs.reduce((sum, t) => t.status === 'skipped' ? sum : sum + t.amount, 0);
      stats.set(groupKey, { count: txs.length, ready, pending, skipped, total });
    }
    
    return stats;
  });

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
  
  // Check if all groups have assigned accounts
  const allGroupsAssigned = $derived.by(() => {
    for (const groupKey of transactionGroups.keys()) {
      if (groupKey === '__default__') {
        // Default group needs global account selection
        if (!accountMapping.get('__default__')) return false;
      } else {
        if (!accountMapping.get(groupKey)) return false;
      }
    }
    return transactionGroups.size > 0;
  });
  
  // Get account ID for a group
  function getGroupAccountId(groupKey: string): string {
    return accountMapping.get(groupKey) || '';
  }
  
  // Set account for a group
  function setGroupAccount(groupKey: string, accountId: string) {
    const newMapping = new Map(accountMapping);
    newMapping.set(groupKey, accountId);
    accountMapping = newMapping;
    
    // Update transactions with assigned account
    transactions = transactions.map(tx => {
      const txGroup = tx.accountName || '__default__';
      if (txGroup === groupKey) {
        return { ...tx, accountId };
      }
      return tx;
    });
  }
  
  // Toggle group expansion
  function toggleGroup(groupKey: string) {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    expandedGroups = newExpanded;
  }
  
  // Get account name by ID
  function getAccountName(accountId: string): string {
    return $accounts.find(a => a.id === accountId)?.name || '';
  }
  
  // Import a single group
  function importGroup(groupKey: string) {
    const groupAccountId = getGroupAccountId(groupKey);
    if (!groupAccountId) {
      addToast({ type: 'error', message: 'Asigna una cuenta antes de importar este grupo' });
      return;
    }
    
    const groupTxs = transactionGroups.get(groupKey);
    if (!groupTxs) return;
    
    const ready = groupTxs.filter(t => t.status === 'ready');
    if (ready.length === 0) {
      addToast({ type: 'warning', message: 'No hay transacciones listas en este grupo' });
      return;
    }
    
    // Ensure all have the accountId set
    const txsToImport = ready.map(tx => ({ ...tx, accountId: groupAccountId }));
    
    onImport?.(txsToImport);
    
    const accountName = getAccountName(groupAccountId);
    addToast({ type: 'success', message: `Importadas ${ready.length} transacciones a ${accountName}` });
    
    // Mark as imported
    transactions = transactions.map(t => {
      const txGroup = t.accountName || '__default__';
      if (txGroup === groupKey && t.status === 'ready') {
        return { ...t, status: 'imported' as const };
      }
      return t;
    });
  }
  
  // Get count of ready transactions in a group
  function getGroupReadyCount(groupKey: string): number {
    return groupStats.get(groupKey)?.ready || 0;
  }
  
  // Open create account dialog for a group
  function openCreateAccountDialog(groupKey: string) {
    createAccountForGroup = groupKey;
    // Pre-fill name with detected account name if not default
    newAccountName = groupKey === '__default__' ? '' : groupKey;
    newAccountType = 'Checking';
    newAccountOnBudget = true;
    showCreateAccountDialog = true;
  }
  
  // Virtual accounts created during this import session
  let virtualAccounts = $state<Array<{ id: string; name: string; type: string; onBudget: boolean }>>([]);
  
  // Combined accounts: real accounts + virtual accounts
  const allAccounts = $derived([...$accounts, ...virtualAccounts.map(va => ({
    id: va.id,
    name: va.name,
    type: va.type,
    onBudget: va.onBudget,
    balance: 0,
    clearedBalance: 0,
    unclearedBalance: 0,
    isTombstone: false
  }))]);
  
  // Create account and assign to group
  async function createAccount() {
    if (!newAccountName.trim()) {
      addToast({ type: 'error', message: 'Ingresa un nombre para la cuenta' });
      return;
    }
    
    // Generate a temporary ID for the new account
    const tempAccountId = `virtual-account-${Date.now()}`;
    
    // Create account data
    const accountData = {
      name: newAccountName.trim(),
      type: newAccountType,
      onBudget: newAccountOnBudget,
      balance: 0,
      startingDate: new Date().toISOString().split('T')[0],
    };
    
    // Track as pending change only if in edit mode
    if ($isEditMode) {
      addPendingChange({
        type: 'account',
        action: 'create',
        entityId: tempAccountId,
        entityName: newAccountName.trim(),
        data: accountData
      });
    }
    
    // Add to virtual accounts list
    virtualAccounts = [...virtualAccounts, {
      id: tempAccountId,
      name: newAccountName.trim(),
      type: newAccountType,
      onBudget: newAccountOnBudget
    }];
    
    // Auto-assign the new account to the group
    if (createAccountForGroup) {
      setGroupAccount(createAccountForGroup, tempAccountId);
    }
    
    addToast({ type: 'success', message: `Cuenta "${newAccountName}" ${$isEditMode ? 'creada' : 'agregada para mapeo'}` });
    
    showCreateAccountDialog = false;
    createAccountForGroup = null;
    newAccountName = '';
  }
  
  // Cancel create account dialog
  function cancelCreateAccount() {
    showCreateAccountDialog = false;
    createAccountForGroup = null;
    newAccountName = '';
  }

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
        // Set account mapping for default group if provided
        if (importFile.accountId) {
          setGroupAccount('__default__', importFile.accountId);
        }
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
  
  // Handle drag and drop
  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    
    // Create a fake event to reuse handleFileUpload logic
    const fakeInput = { files: [file] } as unknown as HTMLInputElement;
    const fakeEvent = { target: fakeInput } as unknown as Event;
    await handleFileUpload(fakeEvent);
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
    if (transactions.length === 0) {
      addToast({ type: 'error', message: 'No transactions to save' });
      return;
    }

    const importFile: ImportFile = {
      id: crypto.randomUUID(),
      name: importFileName || 'Import',
      sourceFile: importFileName,
      accountId: '', // Multi-account mode - accountId is per transaction
      accountName: 'Multiple Accounts',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transactions,
    };

    const json = serializeImportFile(importFile);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generateImportFilename(importFileName || 'import');
    a.click();
    URL.revokeObjectURL(url);

    addToast({ type: 'success', message: 'Import file saved' });
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
    if (!tx) return;
    
    // Get account ID for this transaction's group
    const txGroup = tx.accountName || '__default__';
    const txAccountId = tx.accountId || getGroupAccountId(txGroup);
    
    if (!txAccountId) {
      addToast({ type: 'error', message: 'Asigna una cuenta al grupo antes de crear MSI' });
      return;
    }

    // Generate all MSI transactions
    const msiTxs = generateAllMSITransactions({
      originalTransaction: {
        date: tx.date,
        payeeId: tx.payeeId,
        payeeName: tx.payeeName || tx.description,
        categoryId: tx.categoryId,
        categoryName: tx.categoryName,
        accountId: txAccountId,
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
      accountId: tx.accountId,
      accountName: tx.accountName || '',
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
      accountId: tx.accountId,
      accountName: tx.accountName || '',
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
    a.download = `ynab4-import-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    addToast({ type: 'success', message: `Exportado: ${readyTxs.length} transacciones` });
  }
</script>

<div class="flex flex-col h-full selectable">
  <!-- Header -->
  <div class="border-b p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-heading font-semibold">Editor de Transacciones</h2>
      <div class="flex gap-2">
        <Button variant="outline" onclick={saveImportFile} disabled={transactions.length === 0}>
          <Save class="mr-2 h-4 w-4" />
          Guardar
        </Button>
        <Button variant="outline" onclick={exportToYNAB4CSV} disabled={transactions.length === 0}>
          <FileText class="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>
    </div>

    <!-- File upload - prominent drop zone -->
    <label 
      class="file-drop-zone"
      class:dragging={isDragging}
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => isDragging = false}
      ondrop={handleDrop}
    >
      <input
        type="file"
        accept=".csv,.xlsx,.xls,.ynab-import.json"
        class="hidden"
        onchange={handleFileUpload}
      />
      <div class="drop-zone-content">
        <Upload class="h-6 w-6 text-muted-foreground" />
        <div class="text-sm font-medium">
          {importFileName || 'Haz clic o arrastra un archivo aquí'}
        </div>
        <div class="text-xs text-muted-foreground">
          Excel (.xlsx), CSV, o archivo guardado (.ynab-import.json)
        </div>
      </div>
    </label>

    <!-- Stats and filters -->
    {#if transactions.length > 0}
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex gap-4 text-sm">
          <span>Total: <strong>{transactions.length}</strong></span>
          <span class="text-ynab-green">Completas: <strong>{stats().ready}</strong></span>
          <span class="text-destructive">Sin categoría: <strong>{stats().pending}</strong></span>
          <span class="amount">
            Neto: <strong class={stats().total >= 0 ? 'text-ynab-green' : 'text-ynab-red'}>
              {formatCurrency(stats().total)}
            </strong>
          </span>
        </div>

        <div class="flex gap-2 items-center">
          <!-- Filter dropdown -->
          <select
            class="h-8 text-sm rounded-md border border-input bg-background px-2"
            bind:value={filterMode}
          >
            <option value="all">Todas</option>
            <option value="pending">Sin categoría</option>
            <option value="ready">Completas</option>
            <option value="skipped">Omitidas</option>
          </select>
          
          <Button variant="outline" size="sm" onclick={bulkAssignCategory} disabled={selectedIds.size === 0}>
            <Tag class="mr-1 h-4 w-4" />
            Categoría
          </Button>
          <Button variant="outline" size="sm" onclick={bulkAssignPayee} disabled={selectedIds.size === 0}>
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
        <div class="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onclick={() => downloadSampleCSV()}>
            <Download class="mr-2 h-4 w-4" />
            CSV de Ejemplo
          </Button>
          <Button variant="outline" size="sm" onclick={() => downloadTemplate()}>
            <Download class="mr-2 h-4 w-4" />
            Plantilla Excel
          </Button>
        </div>
        <p class="text-xs text-muted-foreground mt-4 max-w-md">
          El CSV incluye datos de ejemplo con múltiples cuentas. La plantilla Excel incluye instrucciones detalladas.
        </p>
      </div>
    {:else}
      <!-- Global header -->
      <div class="flex items-center justify-between p-2 border-b bg-card sticky top-0 z-20">
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
          {#if isMultiAccount}
            <span class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
              {transactionGroups.size} cuentas detectadas
            </span>
          {/if}
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

      <!-- Groups by account -->
      {#each Array.from(transactionGroups.entries()) as [groupKey, groupTxs] (groupKey)}
        {@const groupStat = groupStats.get(groupKey)}
        {@const groupAccountId = getGroupAccountId(groupKey)}
        {@const isExpanded = expandedGroups.has(groupKey)}
        
        <!-- Group Header -->
        <div class="border-b bg-card">
          <div class="flex items-center gap-3 p-2">
            <button 
              class="p-1 hover:bg-accent rounded"
              onclick={() => toggleGroup(groupKey)}
            >
              {#if isExpanded}
                <ChevronDown class="h-4 w-4" />
              {:else}
                <ChevronUp class="h-4 w-4" />
              {/if}
            </button>
            
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="font-medium">
                  {groupKey === '__default__' ? 'Sin cuenta asignada' : groupKey}
                </span>
                <span class="text-xs text-muted-foreground">
                  ({groupStat?.count || 0} transacciones)
                </span>
              </div>
              <div class="flex gap-3 text-xs mt-0.5">
                <span class="text-ynab-green">Listas: {groupStat?.ready || 0}</span>
                <span class="text-destructive">Pendientes: {groupStat?.pending || 0}</span>
                <span class={groupStat && groupStat.total >= 0 ? 'text-ynab-green' : 'text-ynab-red'}>
                  Neto: {formatCurrency(groupStat?.total || 0)}
                </span>
              </div>
            </div>
            
            <!-- Group actions (filter, etc) -->
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{groupStat?.count || 0} transacciones</span>
            </div>
          </div>
          
          {#if isExpanded}
            <!-- Column Headers for this group -->
            <div class="grid grid-cols-[auto,1fr,1fr,1fr,auto,auto,auto] gap-2 items-center px-2 py-1 border-t bg-muted/30 text-xs font-medium text-muted-foreground">
              <div class="w-14"></div>
              <div>Fecha</div>
              <div>Payee</div>
              <div>Categoría</div>
              <div class="text-right min-w-[120px]">Monto</div>
              <div class="w-6"></div>
              <div class="w-24 text-right">Acciones</div>
            </div>
          {/if}
        </div>

        <!-- Rows for this group -->
        {#if isExpanded}
          {#each groupTxs as tx (tx.id)}
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
    accountId: msiTransaction.accountId || '',
    amount: msiTransaction.amount,
    memo: msiTransaction.memo,
  } : null}
  onConfirm={handleMSIConfirm}
  onClose={() => { msiDialogOpen = false; msiTransaction = null; }}
/>

<!-- No longer using Create Account Dialog or Confirmation Dialog in edit mode -->

<style>
  .file-drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    border: 2px dashed var(--border);
    border-radius: 0.5rem;
    background: var(--muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .file-drop-zone:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, var(--muted));
  }
  
  .file-drop-zone.dragging {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, var(--muted));
    border-style: solid;
  }
  
  .drop-zone-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    text-align: center;
  }
  
  /* Fix sticky header overlapping - give solid backgrounds */
  :global(.import-editor) .sticky {
    background-color: var(--card);
  }
  
  /* Ensure group headers have solid background */
  :global(.group-header) {
    background-color: var(--card);
  }
</style>

