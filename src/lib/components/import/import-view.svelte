<script lang="ts">
  import { Upload, Download, Save, FileText, ChevronDown, ChevronUp, ArrowLeft, Eye, EyeOff, Flag, Banknote, Check, X, ChevronRight, FileSpreadsheet, PanelLeftClose, PanelLeft, Settings2 } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import ImportFileList from './import-file-list.svelte';
  import BulkActionsBar from '../shared/bulk-actions-bar.svelte';
  import {
    parseCSV,
    detectColumns,
    csvToTransactions,
    excelToTransactions,
    getExcelSheetNames,
    downloadTemplate,
    type ImportTransaction,
  } from '$lib/services/import-service';
  import {
    getImportFileList,
    getImportFile,
    saveImportFile,
    deleteImportFile,
    createImportFile,
    exportImportFile,
    importFromJson,
    type StoredImportFile,
    type ImportFileWithTransactions
  } from '$lib/services/import-storage';
  import { categories, payees, budgetInfo, accounts as budgetAccounts } from '$lib/stores/budget';
  import { addToast, isMobile } from '$lib/stores/ui';
  import { formatCurrency } from '$lib/utils';
  import { onMount, onDestroy } from 'svelte';
  import { isTauri } from '$lib/services';

  interface Props {
    onImport?: (transactions: ImportTransaction[], targetAccountId: string) => void;
    onClose?: () => void;
  }

  let { onImport, onClose }: Props = $props();

  // View state
  let currentView = $state<'list' | 'editor'>('list');
  let currentFile = $state<ImportFileWithTransactions | null>(null);
  let fileList = $state<StoredImportFile[]>([]);
  
  // Editor state
  let transactions = $state<ImportTransaction[]>([]);
  let selectedIds = $state<Set<string>>(new Set());
  let expandedIds = $state<Set<string>>(new Set());
  let isDragging = $state(false);
  let filterMode = $state<'all' | 'pending' | 'ready' | 'skipped'>('all');
  let hasUnsavedChanges = $state(false);
  
  // Panel state
  let showAccountsPanel = $state(true);
  let selectedImportAccount = $state<string | null>(null);
  let showAccountOptions = $state(false);
  
  // Display options
  let showOriginalMemo = $state(false);
  let showReference = $state(false);
  
  // MSI Dialog state
  let msiDialogOpen = $state(false);
  let msiTransaction = $state<ImportTransaction | null>(null);
  let msiMonths = $state(12);
  let msiStartDate = $state(new Date().toISOString().split('T')[0]);

  // Export dialog state
  let showExportDialog = $state(false);
  let exportTargetAccount = $state<string>('');

  // Inline editing state
  let editingPayeeId = $state<string | null>(null);
  let editingCategoryId = $state<string | null>(null);
  let payeeSearch = $state('');
  let categorySearch = $state('');

  // Budget ID for storage
  const budgetId = $derived($budgetInfo?.budgetPath || 'default');

  // ========================
  // ACCOUNTS FROM IMPORT FILE
  // ========================
  
  // Get unique accounts from transactions
  const importAccounts = $derived.by(() => {
    const accountMap = new Map<string, { name: string; count: number; total: number; pending: number; ready: number }>();
    
    for (const tx of transactions) {
      const accountName = tx.accountName || 'Sin cuenta';
      if (!accountMap.has(accountName)) {
        accountMap.set(accountName, { name: accountName, count: 0, total: 0, pending: 0, ready: 0 });
      }
      const acc = accountMap.get(accountName)!;
      acc.count++;
      if (tx.status !== 'skipped') {
        acc.total += tx.amount;
      }
      if (tx.status === 'pending') acc.pending++;
      if (tx.status === 'ready') acc.ready++;
    }
    
    return Array.from(accountMap.entries()).map(([name, data]) => ({
      id: name,
      name: data.name,
      count: data.count,
      total: data.total,
      pending: data.pending,
      ready: data.ready
    }));
  });

  // ========================
  // PAYEES COMBINED
  // ========================
  
  // Get unique payees from import file (not in budget)
  const importPayees = $derived.by(() => {
    const payeeSet = new Set<string>();
    const budgetPayeeNames = new Set($payees.filter(p => !p.isTombstone).map(p => p.name.toLowerCase()));
    
    for (const tx of transactions) {
      // Add both payeeName and suggestedPayee if they exist and aren't in budget
      if (tx.payeeName && !budgetPayeeNames.has(tx.payeeName.toLowerCase())) {
        payeeSet.add(tx.payeeName);
      }
      if (tx.suggestedPayee && tx.suggestedPayee !== tx.payeeName && !budgetPayeeNames.has(tx.suggestedPayee.toLowerCase())) {
        payeeSet.add(tx.suggestedPayee);
      }
      // Also add description as potential payee
      if (tx.description && !budgetPayeeNames.has(tx.description.toLowerCase())) {
        payeeSet.add(tx.description);
      }
    }
    
    return Array.from(payeeSet).sort().map(name => ({ id: `import:${name}`, name, isImport: true }));
  });

  // Combined payees list (budget + import file)
  const combinedPayees = $derived.by(() => {
    const budgetPayeesList = $payees.filter(p => !p.isTombstone).map(p => ({ id: p.id, name: p.name, isImport: false }));
    return [...budgetPayeesList, ...importPayees];
  });

  // Filtered payees for search
  const filteredPayeesList = $derived(
    combinedPayees
      .filter(p => p.name.toLowerCase().includes(payeeSearch.toLowerCase()))
      .slice(0, 12)
  );

  // ========================
  // LIFECYCLE
  // ========================
  
  onMount(() => {
    loadFileList();
    setupTauriDropListener();
  });

  onDestroy(() => {
    if (tauriUnlisten) tauriUnlisten();
  });

  let tauriUnlisten: (() => void) | null = null;

  async function setupTauriDropListener() {
    if (!isTauri()) return;
    
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const { readFile } = await import('@tauri-apps/plugin-fs');
      
      tauriUnlisten = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
        const paths = event.payload.paths;
        if (!paths || paths.length === 0) return;
        
        const filePath = paths[0];
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
        
        await loadFileFromPath(filePath, fileName, readFile);
      });
    } catch (e) {
      console.warn('Could not set up Tauri file drop listener:', e);
    }
  }

  async function loadFileFromPath(
    filePath: string, 
    fileName: string, 
    readFile: (path: string) => Promise<Uint8Array>
  ) {
    try {
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const data = await readFile(filePath);
        const buffer = data.buffer as ArrayBuffer;
        const sheetNames = getExcelSheetNames(buffer);
        
        if (sheetNames.length === 0) {
          addToast({ type: 'error', message: 'El archivo Excel está vacío' });
          return;
        }
        
        const txs = excelToTransactions(buffer, 0);
        createNewFile(fileName, txs);
        
      } else if (fileName.endsWith('.csv')) {
        const data = await readFile(filePath);
        const content = new TextDecoder().decode(data);
        const rows = parseCSV(content);
        
        if (rows.length < 2) {
          addToast({ type: 'error', message: 'El archivo CSV está vacío o es inválido' });
          return;
        }
        
        const mapping = detectColumns(rows[0]);
        const txs = csvToTransactions(rows, mapping, true);
        createNewFile(fileName, txs);
        
      } else if (fileName.endsWith('.ynab-import.json')) {
        const data = await readFile(filePath);
        const content = new TextDecoder().decode(data);
        const imported = importFromJson(content);
        imported.name = fileName.replace('.ynab-import.json', '');
        saveImportFile(budgetId, imported);
        loadFileList();
        openFile(imported.id);
        addToast({ type: 'success', message: `Cargado: ${imported.transactionCount} transacciones` });
      } else {
        addToast({ type: 'warning', message: 'Formato no soportado. Usa .xlsx, .csv o .ynab-import.json' });
      }
    } catch (e) {
      console.error('Error loading file:', e);
      addToast({ type: 'error', message: 'Error al cargar el archivo' });
    }
  }

  function loadFileList() {
    fileList = getImportFileList(budgetId);
  }

  function openFile(fileId: string) {
    const file = getImportFile(budgetId, fileId);
    if (!file) {
      addToast({ type: 'error', message: 'No se pudo cargar el archivo' });
      return;
    }
    
    currentFile = file;
    transactions = [...file.transactions];
    selectedImportAccount = null;
    hasUnsavedChanges = false;
    currentView = 'editor';
  }

  function createNewFile(fileName: string, txs: ImportTransaction[]) {
    const name = fileName.replace(/\.(xlsx|xls|csv)$/i, '');
    const file = createImportFile(name, fileName, txs);
    saveImportFile(budgetId, file);
    loadFileList();
    openFile(file.id);
    addToast({ type: 'success', message: `Creado: ${txs.length} transacciones` });
  }

  function handleDeleteFile(fileId: string) {
    if (!confirm('¿Eliminar este archivo de importación?')) return;
    deleteImportFile(budgetId, fileId);
    loadFileList();
    addToast({ type: 'success', message: 'Archivo eliminado' });
  }

  function saveCurrentFile() {
    if (!currentFile) return;
    
    currentFile.transactions = transactions;
    currentFile.transactionCount = transactions.length;
    currentFile.readyCount = transactions.filter(t => t.status === 'ready').length;
    currentFile.pendingCount = transactions.filter(t => t.status === 'pending').length;
    currentFile.netAmount = transactions.reduce((sum, t) => t.status !== 'skipped' ? sum + t.amount : sum, 0);
    currentFile.accountGroups = [...new Set(transactions.map(t => t.accountName || 'Sin cuenta'))];
    
    saveImportFile(budgetId, currentFile);
    hasUnsavedChanges = false;
    loadFileList();
    addToast({ type: 'success', message: 'Guardado' });
  }

  function downloadCurrentFile() {
    if (!currentFile) return;
    
    currentFile.transactions = transactions;
    
    const json = exportImportFile(currentFile);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFile.name}.ynab-import.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    addToast({ type: 'success', message: 'Archivo descargado' });
  }

  function goBackToList() {
    if (hasUnsavedChanges && !confirm('¿Descartar cambios sin guardar?')) return;
    currentView = 'list';
    currentFile = null;
    transactions = [];
    selectedIds = new Set();
    selectedImportAccount = null;
  }

  // Handle new file upload
  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const fileName = file.name;

    if (fileName.endsWith('.ynab-import.json')) {
      try {
        const content = await file.text();
        const imported = importFromJson(content);
        imported.name = fileName.replace('.ynab-import.json', '');
        saveImportFile(budgetId, imported);
        loadFileList();
        openFile(imported.id);
        addToast({ type: 'success', message: `Cargado: ${imported.transactionCount} transacciones` });
      } catch (e) {
        addToast({ type: 'error', message: 'Formato de archivo inválido' });
      }
      return;
    }

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      try {
        const buffer = await file.arrayBuffer();
        const sheetNames = getExcelSheetNames(buffer);
        
        if (sheetNames.length === 0) {
          addToast({ type: 'error', message: 'El archivo Excel está vacío' });
          return;
        }
        
        const txs = excelToTransactions(buffer, 0);
        createNewFile(fileName, txs);
      } catch (e) {
        console.error('Excel parse error:', e);
        addToast({ type: 'error', message: 'Error al leer el archivo Excel' });
      }
      return;
    }

    try {
      const content = await file.text();
      const rows = parseCSV(content);
      if (rows.length < 2) {
        addToast({ type: 'error', message: 'El archivo CSV está vacío o es inválido' });
        return;
      }

      const mapping = detectColumns(rows[0]);
      const txs = csvToTransactions(rows, mapping, true);
      createNewFile(fileName, txs);
    } catch (e) {
      console.error('CSV parse error:', e);
      addToast({ type: 'error', message: 'Error al leer el archivo CSV' });
    }
  }

  // ========================
  // FILTERED TRANSACTIONS
  // ========================
  
  const filteredTransactions = $derived.by(() => {
    let result = transactions;
    
    // Filter by account
    if (selectedImportAccount) {
      result = result.filter(tx => (tx.accountName || 'Sin cuenta') === selectedImportAccount);
    }
    
    // Filter by status
    if (filterMode !== 'all') {
      result = result.filter(tx => tx.status === filterMode);
    }
    
    return result;
  });

  // Stats
  const stats = $derived(() => {
    const base = selectedImportAccount 
      ? transactions.filter(t => (t.accountName || 'Sin cuenta') === selectedImportAccount)
      : transactions;
    
    const pending = base.filter(t => t.status === 'pending').length;
    const ready = base.filter(t => t.status === 'ready').length;
    const skipped = base.filter(t => t.status === 'skipped').length;
    const total = base.reduce((sum, t) => t.status !== 'skipped' ? sum + t.amount : sum, 0);
    return { pending, ready, skipped, total, count: base.length };
  });

  // Selection totals
  const selectionTotals = $derived.by(() => {
    if (selectedIds.size === 0) return { inflow: 0, outflow: 0 };
    let inflow = 0, outflow = 0;
    for (const tx of transactions) {
      if (selectedIds.has(tx.id)) {
        if (tx.amount >= 0) inflow += tx.amount;
        else outflow += tx.amount;
      }
    }
    return { inflow, outflow };
  });

  // Transaction update
  function updateTransaction(id: string, updates: Partial<ImportTransaction>) {
    transactions = transactions.map(t => t.id === id ? { ...t, ...updates } : t);
    hasUnsavedChanges = true;
  }

  // Selection
  function toggleSelect(id: string, event: MouseEvent) {
    const newSet = new Set(selectedIds);
    
    if (event.shiftKey && selectedIds.size > 0) {
      const txIds = filteredTransactions.map(t => t.id);
      const lastSelected = Array.from(selectedIds).pop();
      const lastIdx = txIds.indexOf(lastSelected || '');
      const currentIdx = txIds.indexOf(id);
      
      if (lastIdx !== -1 && currentIdx !== -1) {
        const [start, end] = lastIdx < currentIdx ? [lastIdx, currentIdx] : [currentIdx, lastIdx];
        for (let i = start; i <= end; i++) {
          newSet.add(txIds[i]);
        }
      }
    } else if (event.ctrlKey || event.metaKey) {
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
    } else {
      newSet.clear();
      newSet.add(id);
    }
    
    selectedIds = newSet;
  }

  function clearSelection() {
    selectedIds = new Set();
  }

  function selectAll() {
    if (selectedIds.size === filteredTransactions.length) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(filteredTransactions.map(t => t.id));
    }
  }

  // Expand/collapse
  function toggleExpand(id: string) {
    expandedIds = new Set(expandedIds);
    if (expandedIds.has(id)) {
      expandedIds.delete(id);
    } else {
      expandedIds.add(id);
    }
  }

  // Bulk actions
  function bulkAssignCategory(categoryId: string, categoryName: string) {
    transactions = transactions.map(t => {
      if (selectedIds.has(t.id)) {
        return { 
          ...t, 
          categoryId, 
          categoryName,
          status: t.payeeName ? 'ready' as const : 'pending' as const
        };
      }
      return t;
    });
    hasUnsavedChanges = true;
    addToast({ type: 'success', message: `Categoría asignada a ${selectedIds.size} transacciones` });
  }

  function bulkAssignPayee(payeeId: string | null, payeeName: string) {
    transactions = transactions.map(t => {
      if (selectedIds.has(t.id)) {
        return { 
          ...t, 
          payeeId: payeeId?.startsWith('import:') ? null : payeeId, 
          payeeName,
          status: t.categoryId ? 'ready' as const : 'pending' as const
        };
      }
      return t;
    });
    hasUnsavedChanges = true;
    addToast({ type: 'success', message: `Beneficiario asignado a ${selectedIds.size} transacciones` });
  }

  function bulkAssignFlag(flag: string | null) {
    transactions = transactions.map(t => {
      if (selectedIds.has(t.id)) {
        return { ...t, flag };
      }
      return t;
    });
    hasUnsavedChanges = true;
    addToast({ type: 'success', message: `Bandera asignada a ${selectedIds.size} transacciones` });
  }

  function bulkMarkReady() {
    transactions = transactions.map(t => {
      if (selectedIds.has(t.id)) {
        return { ...t, status: 'ready' as const };
      }
      return t;
    });
    hasUnsavedChanges = true;
    clearSelection();
  }

  function bulkMarkSkipped() {
    transactions = transactions.map(t => {
      if (selectedIds.has(t.id)) {
        return { ...t, status: 'skipped' as const };
      }
      return t;
    });
    hasUnsavedChanges = true;
    clearSelection();
  }

  // Inline editing
  function startEditPayee(txId: string, currentPayee: string) {
    editingPayeeId = txId;
    payeeSearch = currentPayee;
    editingCategoryId = null;
  }

  function startEditCategory(txId: string) {
    editingCategoryId = txId;
    categorySearch = '';
    editingPayeeId = null;
  }

  function selectPayeeForTx(payee: { id: string; name: string; isImport?: boolean }) {
    if (editingPayeeId) {
      updateTransaction(editingPayeeId, {
        payeeId: payee.isImport ? null : payee.id,
        payeeName: payee.name,
        status: transactions.find(t => t.id === editingPayeeId)?.categoryId ? 'ready' : 'pending'
      });
    }
    editingPayeeId = null;
  }

  function setCustomPayee() {
    if (editingPayeeId && payeeSearch.trim()) {
      updateTransaction(editingPayeeId, {
        payeeId: null,
        payeeName: payeeSearch.trim(),
        status: transactions.find(t => t.id === editingPayeeId)?.categoryId ? 'ready' : 'pending'
      });
    }
    editingPayeeId = null;
  }

  function selectCategoryForTx(cat: { entityId: string; name: string }) {
    if (editingCategoryId) {
      updateTransaction(editingCategoryId, {
        categoryId: cat.entityId,
        categoryName: cat.name,
        status: transactions.find(t => t.id === editingCategoryId)?.payeeName ? 'ready' : 'pending'
      });
    }
    editingCategoryId = null;
  }

  const filteredCategoriesList = $derived(
    $categories
      .filter(c => !c.isTombstone && c.name.toLowerCase().includes(categorySearch.toLowerCase()))
      .slice(0, 10)
  );

  // ========================
  // MSI
  // ========================
  
  function openMSI(tx: ImportTransaction) {
    if (tx.amount >= 0) {
      addToast({ type: 'warning', message: 'MSI solo aplica a gastos (egresos)' });
      return;
    }
    
    msiTransaction = tx;
    msiMonths = 12;
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    msiStartDate = nextMonth.toISOString().split('T')[0];
    msiDialogOpen = true;
  }

  function handleMSIConfirm() {
    const tx = msiTransaction;
    if (!tx) return;

    const absAmount = Math.abs(tx.amount);
    const monthlyAmount = Math.round((absAmount / msiMonths) * 100) / 100;

    const counterTx: ImportTransaction = {
      ...tx,
      id: crypto.randomUUID(),
      amount: absAmount,
      outflow: 0,
      inflow: absAmount,
      description: `MSI Contrapartida: ${tx.description}`,
      memo: `MSI ${msiMonths} meses - Contrapartida`,
      status: 'ready'
    };

    const paymentTxs: ImportTransaction[] = [];
    const startDate = new Date(msiStartDate);
    
    for (let i = 0; i < msiMonths; i++) {
      const paymentDate = new Date(startDate);
      paymentDate.setMonth(paymentDate.getMonth() + i);
      
      paymentTxs.push({
        ...tx,
        id: crypto.randomUUID(),
        date: paymentDate.toISOString().split('T')[0],
        description: `${tx.description} (${i + 1}/${msiMonths})`,
        amount: -monthlyAmount,
        outflow: monthlyAmount,
        inflow: 0,
        memo: `MSI ${msiMonths} meses - Pago ${i + 1}/${msiMonths}`,
        status: 'ready',
        isMSI: true,
        msiMonths: msiMonths,
        msiOriginalAmount: tx.amount
      });
    }

    transactions = transactions.map(t => 
      t.id === tx.id ? { ...t, status: 'skipped' as const, memo: `MSI Convertido: ${msiMonths} meses` } : t
    );

    transactions = [...transactions, counterTx, ...paymentTxs];
    hasUnsavedChanges = true;

    msiDialogOpen = false;
    msiTransaction = null;
    addToast({ type: 'success', message: `MSI creado: ${msiMonths} pagos mensuales` });
  }

  // ========================
  // EXPORT CSV
  // ========================
  
  function openExportDialog() {
    exportTargetAccount = selectedImportAccount || (importAccounts.length === 1 ? importAccounts[0].id : '');
    showExportDialog = true;
  }

  function exportAccountToCSV(accountName: string | null = null) {
    const targetName = accountName || exportTargetAccount;
    const txsToExport = transactions.filter(t => 
      t.status !== 'skipped' && 
      (!targetName || (t.accountName || 'Sin cuenta') === targetName)
    );

    if (txsToExport.length === 0) {
      addToast({ type: 'warning', message: 'No hay transacciones para exportar' });
      return;
    }

    // YNAB4 import format
    const rows: string[] = ['Date,Payee,Category,Memo,Outflow,Inflow'];

    for (const tx of txsToExport) {
      const date = tx.date;
      const payee = `"${(tx.payeeName || tx.description).replace(/"/g, '""')}"`;
      const category = tx.categoryName ? `"${tx.categoryName.replace(/"/g, '""')}"` : '';
      const memo = tx.memo ? `"${tx.memo.replace(/"/g, '""')}"` : '';
      const outflow = tx.amount < 0 ? Math.abs(tx.amount).toFixed(2) : '';
      const inflow = tx.amount > 0 ? tx.amount.toFixed(2) : '';

      rows.push(`${date},${payee},${category},${memo},${outflow},${inflow}`);
    }

    const fileName = targetName 
      ? `${currentFile?.name || 'export'}-${targetName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`
      : `${currentFile?.name || 'export'}-ynab4.csv`;

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    showExportDialog = false;
    addToast({ type: 'success', message: `CSV exportado: ${txsToExport.length} transacciones` });
  }

  function formatDate(dateStr: string): string {
    return dateStr;
  }

  function getStatusClass(status: string): string {
    switch (status) {
      case 'ready': return 'status-ready';
      case 'skipped': return 'status-skipped';
      case 'imported': return 'status-imported';
      default: return 'status-pending';
    }
  }

  function formatBalance(balance: number): string {
    return Math.abs(balance).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getBalanceClass(balance: number): string {
    if (Math.abs(balance) < 0.01) return 'zero';
    return balance >= 0 ? 'positive' : 'negative';
  }

  // Handle keyboard
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (editingPayeeId || editingCategoryId) {
        editingPayeeId = null;
        editingCategoryId = null;
      } else if (showExportDialog) {
        showExportDialog = false;
      } else if (selectedIds.size > 0) {
        clearSelection();
      } else if (msiDialogOpen) {
        msiDialogOpen = false;
        msiTransaction = null;
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="import-view">
  {#if currentView === 'list'}
    <!-- File List View -->
    <div class="view-header">
      <h2 class="view-title">Importar Transacciones</h2>
      <p class="view-subtitle">Carga, edita y prepara transacciones para importar a tu presupuesto.</p>
    </div>

    <div class="file-list-container">
      <ImportFileList
        files={fileList}
        onSelect={openFile}
        onDelete={handleDeleteFile}
        onNew={() => document.getElementById('file-upload-input')?.click()}
      />
    </div>

    <input
      id="file-upload-input"
      type="file"
      accept=".csv,.xlsx,.xls,.ynab-import.json"
      class="hidden"
      onchange={handleFileUpload}
    />

  {:else}
    <!-- Editor View -->
    <div class="editor-layout">
      <!-- Accounts Panel -->
      {#if showAccountsPanel && !$isMobile}
        <div class="accounts-panel">
          <div class="ap-header">
            <span class="ap-title">Cuentas del archivo</span>
            <div class="ap-actions">
              {#if selectedImportAccount}
                <button 
                  class="ap-btn"
                  onclick={() => selectedImportAccount = null}
                  title="Limpiar filtro"
                >
                  <X class="h-4 w-4" />
                </button>
              {/if}
              <button 
                class="ap-btn"
                onclick={() => showAccountsPanel = false}
                title="Ocultar panel"
              >
                <PanelLeftClose class="h-4 w-4" />
              </button>
            </div>
          </div>

          <div class="ap-totals">
            <div class="ap-total-row">
              <span class="ap-total-label">Total neto</span>
              <span class="ap-total-value {getBalanceClass(stats().total)}">
                {stats().total < 0 ? '-' : ''}{formatBalance(stats().total)}
              </span>
            </div>
          </div>

          <div class="ap-groups">
            {#each importAccounts as acc (acc.id)}
              {@const isSelected = selectedImportAccount === acc.id}
              <button
                class="ap-account"
                class:active={isSelected}
                onclick={() => selectedImportAccount = isSelected ? null : acc.id}
              >
                <div class="ap-account-info">
                  <span class="ap-account-name">{acc.name}</span>
                  <span class="ap-account-stats">
                    {acc.count} tx · 
                    <span class="ready">{acc.ready}✓</span>
                    {#if acc.pending > 0}
                      <span class="pending">{acc.pending}⏳</span>
                    {/if}
                  </span>
                </div>
                <span class="ap-account-balance {getBalanceClass(acc.total)}">
                  {acc.total < 0 ? '-' : ''}{formatBalance(acc.total)}
                </span>
              </button>
            {/each}
          </div>

          <!-- Export per account -->
          {#if selectedImportAccount}
            <div class="ap-export">
              <Button variant="outline" size="sm" class="w-full" onclick={() => exportAccountToCSV(selectedImportAccount)}>
                <FileText class="h-4 w-4 mr-1" />
                Exportar {selectedImportAccount} a CSV
              </Button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Main content -->
      <div class="editor-main">
        <!-- Header -->
        <div class="editor-header">
          <div class="editor-header-left">
            <Button variant="ghost" size="sm" onclick={goBackToList}>
              <ArrowLeft class="h-4 w-4" />
            </Button>
            {#if !showAccountsPanel}
              <Button variant="ghost" size="sm" onclick={() => showAccountsPanel = true}>
                <PanelLeft class="h-4 w-4" />
              </Button>
            {/if}
            <div class="editor-title">
              <h2>{currentFile?.name || 'Editor'}</h2>
              {#if hasUnsavedChanges}
                <span class="unsaved-indicator">• Sin guardar</span>
              {/if}
            </div>
          </div>

          <div class="editor-actions">
            <Button 
              variant={showOriginalMemo ? 'secondary' : 'ghost'} 
              size="sm"
              onclick={() => showOriginalMemo = !showOriginalMemo}
              title="Mostrar memo original"
            >
              {#if showOriginalMemo}<Eye class="h-4 w-4" />{:else}<EyeOff class="h-4 w-4" />{/if}
            </Button>
            <Button 
              variant={showReference ? 'secondary' : 'ghost'} 
              size="sm"
              onclick={() => showReference = !showReference}
              title="Mostrar referencia"
            >
              Ref
            </Button>

            <div class="divider"></div>

            <Button variant="outline" size="sm" onclick={saveCurrentFile}>
              <Save class="h-4 w-4 mr-1" />
              Guardar
            </Button>
            <Button variant="outline" size="sm" onclick={downloadCurrentFile}>
              <Download class="h-4 w-4 mr-1" />
              Descargar
            </Button>
            <Button variant="outline" size="sm" onclick={openExportDialog}>
              <FileText class="h-4 w-4 mr-1" />
              CSV
            </Button>
          </div>
        </div>

        <!-- Stats bar -->
        <div class="stats-bar">
          <div class="stats-left">
            <span>Total: <strong>{stats().count}</strong></span>
            <span class="stat-ready">Completas: <strong>{stats().ready}</strong></span>
            <span class="stat-pending">Pendientes: <strong>{stats().pending}</strong></span>
            <span class="stat-net" class:positive={stats().total >= 0} class:negative={stats().total < 0}>
              Neto: <strong>{formatCurrency(stats().total)}</strong>
            </span>
          </div>

          <div class="stats-right">
            <select class="filter-select" bind:value={filterMode}>
              <option value="all">Todas</option>
              <option value="pending">Pendientes</option>
              <option value="ready">Completas</option>
              <option value="skipped">Omitidas</option>
            </select>
          </div>
        </div>

        <!-- Bulk Actions Bar -->
        <BulkActionsBar
          selectedCount={selectedIds.size}
          totalInflow={selectionTotals.inflow}
          totalOutflow={selectionTotals.outflow}
          onAssignCategory={bulkAssignCategory}
          onAssignPayee={bulkAssignPayee}
          onAssignFlag={bulkAssignFlag}
          onMarkReady={bulkMarkReady}
          onMarkSkipped={bulkMarkSkipped}
          onClear={clearSelection}
          showImportActions={true}
        />

        <!-- Transaction table -->
        <div class="tx-table-container">
          <table class="tx-table">
            <thead>
              <tr>
                <th class="col-select">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                    onchange={selectAll}
                  />
                </th>
                <th class="col-flag"></th>
                <th class="col-date">fecha</th>
                {#if !selectedImportAccount && importAccounts.length > 1}
                  <th class="col-account">cuenta</th>
                {/if}
                <th class="col-payee">beneficiario</th>
                <th class="col-category">categoría</th>
                <th class="col-outflow">egreso</th>
                <th class="col-inflow">ingreso</th>
                <th class="col-status"></th>
              </tr>
            </thead>
            <tbody>
              {#each filteredTransactions as tx (tx.id)}
                {@const isSelected = selectedIds.has(tx.id)}
                {@const isExpanded = expandedIds.has(tx.id)}
                {@const isOutflow = tx.amount < 0}
                {@const isInflow = tx.amount > 0}
                <tr 
                  class="tx-row"
                  class:selected={isSelected}
                  class:skipped={tx.status === 'skipped'}
                  onclick={(e) => toggleSelect(tx.id, e)}
                >
                  <td class="col-select" onclick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onchange={() => {
                        const newSet = new Set(selectedIds);
                        if (isSelected) newSet.delete(tx.id);
                        else newSet.add(tx.id);
                        selectedIds = newSet;
                      }}
                    />
                  </td>
                  <td class="col-flag {tx.flag ? `flag-${tx.flag.toLowerCase()}` : ''}"></td>
                  <td class="col-date">{formatDate(tx.date)}</td>
                  {#if !selectedImportAccount && importAccounts.length > 1}
                    <td class="col-account">{tx.accountName || '—'}</td>
                  {/if}
                  
                  <!-- Payee with inline edit -->
                  <td class="col-payee" onclick={(e) => e.stopPropagation()}>
                    {#if editingPayeeId === tx.id}
                      <div class="inline-edit">
                        <input
                          type="text"
                          class="inline-input"
                          bind:value={payeeSearch}
                          autofocus
                          onblur={() => setTimeout(setCustomPayee, 150)}
                          onkeydown={(e) => e.key === 'Enter' && setCustomPayee()}
                        />
                        {#if filteredPayeesList.length > 0}
                          <div class="inline-dropdown">
                            {#each filteredPayeesList as payee (payee.id)}
                              <button class="dropdown-item" class:is-import={payee.isImport} onmousedown={() => selectPayeeForTx(payee)}>
                                {#if payee.isImport}
                                  <span class="import-badge">nuevo</span>
                                {/if}
                                {payee.name}
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {:else}
                      <button 
                        class="editable-cell"
                        ondblclick={() => startEditPayee(tx.id, tx.payeeName || tx.suggestedPayee || tx.description)}
                      >
                        <span class="payee-name">{tx.payeeName || tx.description}</span>
                        {#if tx.suggestedPayee && tx.payeeName !== tx.suggestedPayee}
                          <span class="suggested">→ {tx.suggestedPayee}</span>
                        {/if}
                      </button>
                    {/if}
                  </td>
                  
                  <!-- Category with inline edit -->
                  <td class="col-category" onclick={(e) => e.stopPropagation()}>
                    {#if editingCategoryId === tx.id}
                      <div class="inline-edit">
                        <input
                          type="text"
                          class="inline-input"
                          bind:value={categorySearch}
                          placeholder="Buscar categoría..."
                          autofocus
                          onblur={() => setTimeout(() => editingCategoryId = null, 150)}
                        />
                        <div class="inline-dropdown">
                          {#each filteredCategoriesList as cat (cat.entityId)}
                            <button class="dropdown-item" onmousedown={() => selectCategoryForTx(cat)}>
                              {cat.name}
                            </button>
                          {/each}
                        </div>
                      </div>
                    {:else}
                      <button 
                        class="editable-cell"
                        ondblclick={() => startEditCategory(tx.id)}
                      >
                        {#if tx.categoryName}
                          <span class="category-name">{tx.categoryName}</span>
                        {:else}
                          <span class="no-category">Seleccionar categoría</span>
                        {/if}
                      </button>
                    {/if}
                    {#if tx.memo || (showOriginalMemo && tx.originalMemo)}
                      <span class="memo-text">
                        {tx.memo || tx.originalMemo}
                      </span>
                    {/if}
                  </td>
                  
                  <td class="col-outflow">{isOutflow ? formatCurrency(Math.abs(tx.amount)) : ''}</td>
                  <td class="col-inflow">{isInflow ? formatCurrency(tx.amount) : ''}</td>
                  
                  <td class="col-status">
                    <div class="status-actions">
                      {#if tx.amount < 0 && !tx.isMSI}
                        <button class="action-btn" onclick={(e) => { e.stopPropagation(); openMSI(tx); }} title="MSI">
                          <Banknote class="h-3.5 w-3.5" />
                        </button>
                      {/if}
                      <span class="status-dot {getStatusClass(tx.status)}" title={tx.status}></span>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Export Dialog -->
{#if showExportDialog}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => showExportDialog = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <h3 class="modal-title">Exportar a CSV</h3>
      
      <div class="modal-body">
        <p class="export-info">
          Exporta transacciones en formato compatible con YNAB4 para importarlas a una cuenta.
        </p>
        
        <div class="export-field">
          <label>Cuenta a exportar</label>
          <select bind:value={exportTargetAccount}>
            <option value="">Todas las cuentas</option>
            {#each importAccounts as acc}
              {@const readyCount = acc.ready}
              <option value={acc.id}>{acc.name} ({readyCount} listas)</option>
            {/each}
          </select>
        </div>

        {#if $budgetAccounts.length > 0}
          <div class="export-hint">
            <strong>Cuenta destino en YNAB:</strong>
            <span>Importa el CSV en la cuenta deseada (ej: Temporary)</span>
          </div>
        {/if}
      </div>
      
      <div class="modal-footer">
        <Button variant="outline" onclick={() => showExportDialog = false}>
          Cancelar
        </Button>
        <Button onclick={() => exportAccountToCSV()}>
          <FileText class="h-4 w-4 mr-1" />
          Exportar CSV
        </Button>
      </div>
    </div>
  </div>
{/if}

<!-- MSI Dialog -->
{#if msiDialogOpen && msiTransaction}
  {@const absAmount = Math.abs(msiTransaction.amount)}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => { msiDialogOpen = false; msiTransaction = null; }}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <h3 class="modal-title">Convertir a MSI</h3>
      
      <div class="modal-body">
        <div class="msi-info">
          <div class="msi-label">Monto original</div>
          <div class="msi-amount">{formatCurrency(msiTransaction.amount)}</div>
        </div>
        
        <div class="msi-field">
          <label>Número de meses</label>
          <select bind:value={msiMonths}>
            <option value={3}>3 meses</option>
            <option value={6}>6 meses</option>
            <option value={9}>9 meses</option>
            <option value={12}>12 meses</option>
            <option value={18}>18 meses</option>
            <option value={24}>24 meses</option>
          </select>
        </div>
        
        <div class="msi-field">
          <label>Fecha primer pago</label>
          <input type="date" bind:value={msiStartDate} />
        </div>
        
        <div class="msi-preview">
          <div class="msi-label">Pago mensual</div>
          <div class="msi-monthly">{formatCurrency(Math.round((absAmount / msiMonths) * 100) / 100)}</div>
        </div>
      </div>
      
      <div class="modal-footer">
        <Button variant="outline" onclick={() => { msiDialogOpen = false; msiTransaction = null; }}>
          Cancelar
        </Button>
        <Button onclick={handleMSIConfirm}>
          Crear MSI
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .import-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
  }

  .hidden { display: none; }

  /* File List View */
  .view-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .view-title {
    font-size: 1.25rem;
    font-weight: 600;
    font-family: var(--font-heading);
  }

  .view-subtitle {
    font-size: 0.875rem;
    color: var(--muted-foreground);
    margin-top: 0.25rem;
  }

  .file-list-container {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }

  /* Editor Layout */
  .editor-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .editor-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Accounts Panel */
  .accounts-panel {
    width: 220px;
    min-width: 200px;
    max-width: 260px;
    background: var(--card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 0.75rem;
  }

  .ap-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--border);
  }

  .ap-title {
    font-weight: 600;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .ap-actions {
    display: flex;
    gap: 0.25rem;
  }

  .ap-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .ap-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .ap-totals {
    padding: 0.375rem 0.625rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
  }

  .ap-total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .ap-total-label {
    font-size: 0.65rem;
    font-weight: 500;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .ap-total-value {
    font-family: var(--font-family-mono);
    font-size: 0.75rem;
    font-weight: 600;
    font-feature-settings: "tnum";
  }

  .ap-total-value.positive { color: var(--success); }
  .ap-total-value.negative { color: var(--destructive); }
  .ap-total-value.zero { color: var(--muted-foreground); }

  .ap-groups {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem 0;
  }

  .ap-account {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.625rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--foreground);
    transition: all 0.15s;
    gap: 0.375rem;
    border-bottom: 1px solid var(--border);
  }

  .ap-account:hover {
    background: var(--accent);
  }

  .ap-account.active {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .ap-account.active .ap-account-balance,
  .ap-account.active .ap-account-stats {
    color: var(--primary-foreground) !important;
  }

  .ap-account-info {
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .ap-account-name {
    display: block;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ap-account-stats {
    display: block;
    font-size: 0.65rem;
    color: var(--muted-foreground);
    margin-top: 0.125rem;
  }

  .ap-account-stats .ready { color: var(--success); }
  .ap-account-stats .pending { color: var(--amber-500); margin-left: 0.25rem; }

  .ap-account-balance {
    font-family: var(--font-family-mono);
    font-size: 0.7rem;
    font-weight: 500;
    font-feature-settings: "tnum";
    white-space: nowrap;
  }

  .ap-account-balance.positive { color: var(--success); }
  .ap-account-balance.negative { color: var(--destructive); }
  .ap-account-balance.zero { color: var(--muted-foreground); }

  .ap-export {
    padding: 0.5rem;
    border-top: 1px solid var(--border);
    background: var(--muted);
  }

  /* Editor Header */
  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    gap: 1rem;
    flex-wrap: wrap;
  }

  .editor-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .editor-title h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }

  .unsaved-indicator {
    font-size: 0.75rem;
    color: var(--amber-500);
    margin-left: 0.5rem;
  }

  .editor-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .divider {
    width: 1px;
    height: 1.5rem;
    background: var(--border);
    margin: 0 0.5rem;
  }

  /* Stats Bar */
  .stats-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    font-size: 0.875rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .stats-left {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .stat-ready { color: var(--ynab-green); }
  .stat-pending { color: var(--amber-500); }
  .stat-net.positive { color: var(--ynab-green); }
  .stat-net.negative { color: var(--ynab-red); }

  .filter-select {
    height: 2rem;
    padding: 0 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border);
    background: var(--background);
    font-size: 0.8125rem;
  }

  /* Transaction Table */
  .tx-table-container {
    flex: 1;
    overflow: auto;
  }

  .tx-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }

  .tx-table th {
    position: sticky;
    top: 0;
    background: var(--card);
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-weight: 500;
    text-transform: lowercase;
    border-bottom: 2px solid var(--border);
    white-space: nowrap;
    z-index: 10;
  }

  .tx-table td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  /* Column widths */
  .col-select { width: 2rem; text-align: center; }
  .col-flag { width: 4px; padding: 0 !important; }
  .col-date { width: 90px; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .col-account { width: 100px; }
  .col-payee { min-width: 150px; }
  .col-category { min-width: 180px; }
  .col-outflow, .col-inflow { 
    width: 90px; 
    text-align: right; 
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .col-status { width: 50px; }

  /* Row states */
  .tx-row {
    cursor: pointer;
    transition: background 0.1s;
    user-select: none;
  }

  .tx-row:hover {
    background: var(--accent);
  }

  .tx-row.selected {
    background: var(--accent);
  }

  .tx-row.skipped {
    opacity: 0.5;
  }

  /* Flag colors */
  .col-flag.flag-red { background: var(--red-500); }
  .col-flag.flag-orange { background: var(--orange-500); }
  .col-flag.flag-yellow { background: var(--yellow-500); }
  .col-flag.flag-green { background: var(--green-500); }
  .col-flag.flag-blue { background: var(--blue-500); }
  .col-flag.flag-purple { background: var(--purple-500); }

  /* Outflow/Inflow colors */
  .col-outflow { color: var(--ynab-red); }
  .col-inflow { color: var(--ynab-green); }

  /* Editable cells */
  .editable-cell {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    cursor: text;
  }

  .editable-cell:hover {
    text-decoration: underline;
    text-decoration-style: dotted;
  }

  .payee-name, .category-name {
    display: block;
  }

  .suggested, .no-category {
    display: block;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .no-category {
    font-style: italic;
  }

  .memo-text {
    display: block;
    font-size: 0.75rem;
    color: var(--muted-foreground);
    margin-top: 0.125rem;
  }

  /* Inline edit */
  .inline-edit {
    position: relative;
  }

  .inline-input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--primary);
    border-radius: 0.25rem;
    font-size: 0.8125rem;
    background: var(--background);
  }

  .inline-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--popover);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-height: 250px;
    overflow-y: auto;
    z-index: 50;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    text-align: left;
    background: none;
    border: none;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .dropdown-item:hover {
    background: var(--accent);
  }

  .dropdown-item.is-import {
    color: var(--primary);
  }

  .import-badge {
    font-size: 0.65rem;
    padding: 0.125rem 0.25rem;
    background: var(--primary);
    color: var(--primary-foreground);
    border-radius: 0.25rem;
    text-transform: uppercase;
    font-weight: 600;
  }

  /* Status */
  .status-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    justify-content: flex-end;
  }

  .action-btn {
    padding: 0.25rem;
    background: none;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    color: var(--muted-foreground);
  }

  .action-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.status-ready { background: var(--ynab-green); }
  .status-dot.status-pending { background: var(--amber-500); }
  .status-dot.status-skipped { background: var(--muted-foreground); }
  .status-dot.status-imported { background: var(--blue-500); }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-content {
    background: var(--card);
    border-radius: 0.5rem;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    max-width: 400px;
    width: 90%;
    padding: 1.5rem;
  }

  .modal-title {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .export-info {
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }

  .export-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .export-field label {
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .export-field select {
    height: 2.5rem;
    padding: 0 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--background);
    font-size: 0.875rem;
  }

  .export-hint {
    padding: 0.75rem;
    background: var(--muted);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
  }

  .export-hint strong {
    display: block;
    margin-bottom: 0.25rem;
  }

  .export-hint span {
    color: var(--muted-foreground);
  }

  .msi-info {
    text-align: center;
    padding: 1rem;
    background: var(--muted);
    border-radius: 0.5rem;
  }

  .msi-label {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    margin-bottom: 0.25rem;
  }

  .msi-amount {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--ynab-red);
    font-family: var(--font-mono);
  }

  .msi-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .msi-field label {
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .msi-field select,
  .msi-field input {
    height: 2.5rem;
    padding: 0 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--background);
    font-size: 0.875rem;
  }

  .msi-preview {
    text-align: center;
    padding: 0.75rem;
    background: var(--accent);
    border-radius: 0.5rem;
  }

  .msi-monthly {
    font-size: 1.25rem;
    font-weight: 600;
    font-family: var(--font-mono);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .accounts-panel {
      display: none;
    }
    .col-account { display: none; }
    .editor-actions { flex-wrap: wrap; }
  }

  @media (max-width: 480px) {
    .col-outflow, .col-inflow {
      width: 70px;
    }
  }
</style>
