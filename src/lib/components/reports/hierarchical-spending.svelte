<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronDown, ChevronRight, Download, Settings, FileSpreadsheet } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { transactions, categories, masterCategories, payees } from '$lib/stores/budget';
  import { clientConfig, type CategoryClassification } from '$lib/stores/classifications';
  import { ClassificationEditor } from '$lib/components/settings';
  import { formatCurrency } from '$lib/utils';
  import * as XLSX from 'xlsx';

  interface Props {
    startDate: string;
    endDate: string;
  }

  let { startDate, endDate }: Props = $props();

  // Load classifications on mount
  onMount(() => {
    clientConfig.load();
    // Start with all classifications expanded
    expandAll();
  });

  // Expansion state
  let expandedClassifications = $state<Set<string>>(new Set());
  let expandedMasterCategories = $state<Set<string>>(new Set());
  let showClassificationEditor = $state(false);
  let showIncomeDetails = $state(false);

  // Use classifications from store
  const storedClassifications = $derived($clientConfig.categoryClassifications);

  interface ClassificationData {
    label: string;
    sortOrder: number;
    total: number;
    byMonth: Record<string, number>;
    masterCategories: MasterCategoryData[];
  }

  interface MasterCategoryData {
    id: string;
    name: string;
    total: number;
    byMonth: Record<string, number>;
    categories: CategoryData[];
  }

  interface CategoryData {
    id: string;
    name: string;
    total: number;
    byMonth: Record<string, number>;
  }

  // Get all months in range
  const months = $derived.by(() => {
    const result: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    
    while (current <= end) {
      const year = current.getFullYear();
      const month = (current.getMonth() + 1).toString().padStart(2, '0');
      result.push(`${year}-${month}`);
      current.setMonth(current.getMonth() + 1);
    }
    
    return result;
  });

  // Helper to check if transaction is a transfer
  function isTransfer(tx: { transferAccountId?: string | null; payeeId?: string | null }): boolean {
    return !!tx.transferAccountId || (tx.payeeId?.startsWith('Payee/Transfer:') ?? false);
  }

  // Build hierarchical spending data
  const spendingData = $derived.by(() => {
    // Filter expenses in date range (excluding transfers)
    const expenses = $transactions.filter(
      (tx) =>
        tx.date >= startDate &&
        tx.date <= endDate &&
        tx.amount < 0 &&
        !isTransfer(tx)
    );

    // Group by category
    const byCategory = new Map<string, { total: number; byMonth: Record<string, number> }>();

    for (const tx of expenses) {
      const categoryId = tx.categoryId || 'uncategorized';
      if (!byCategory.has(categoryId)) {
        byCategory.set(categoryId, { total: 0, byMonth: {} });
      }
      const data = byCategory.get(categoryId)!;
      data.total += Math.abs(tx.amount);

      const month = tx.date.substring(0, 7);
      data.byMonth[month] = (data.byMonth[month] || 0) + Math.abs(tx.amount);
    }

    // Group by master category
    const byMasterCategory = new Map<string, MasterCategoryData>();

    for (const [categoryId, data] of byCategory) {
      const category = $categories.find((c) => c.entityId === categoryId);
      const masterCategoryId = category?.masterCategoryId || 'uncategorized';
      const masterCategory = $masterCategories.find((mc) => mc.entityId === masterCategoryId);

      // Skip hidden master categories
      if (masterCategory?.name?.startsWith('Hidden') ||
          masterCategory?.name?.startsWith('Internal') ||
          masterCategory?.name?.startsWith('Pre-YNAB')) {
        continue;
      }

      if (!byMasterCategory.has(masterCategoryId)) {
        byMasterCategory.set(masterCategoryId, {
          id: masterCategoryId,
          name: masterCategory?.name || 'Sin Categoría',
          total: 0,
          byMonth: {},
          categories: [],
        });
      }

      const masterData = byMasterCategory.get(masterCategoryId)!;
      masterData.total += data.total;

      // Accumulate by month for master category
      for (const [month, amount] of Object.entries(data.byMonth)) {
        masterData.byMonth[month] = (masterData.byMonth[month] || 0) + amount;
      }

      masterData.categories.push({
        id: categoryId,
        name: category?.name || 'Sin Categoría',
        total: data.total,
        byMonth: data.byMonth,
      });
    }

    // Sort categories within each master category
    for (const masterData of byMasterCategory.values()) {
      masterData.categories.sort((a, b) => b.total - a.total);
    }

    // Convert to array and sort by total
    const masterCategoriesList = Array.from(byMasterCategory.values())
      .sort((a, b) => b.total - a.total);

    // Apply custom classifications if available
    if (storedClassifications.length > 0) {
      const result: ClassificationData[] = [];
      const classifiedMasterIds = new Set<string>();

      // Sort classifications by sortOrder
      const sortedClassifications = [...storedClassifications].sort((a, b) => a.sortOrder - b.sortOrder);

      for (const classification of sortedClassifications) {
        const masters: MasterCategoryData[] = [];
        const classificationByMonth: Record<string, number> = {};

        for (const masterId of classification.masterCategoryIds) {
          const master = byMasterCategory.get(masterId);
          if (master) {
            masters.push(master);
            classifiedMasterIds.add(masterId);

            // Accumulate by month for classification
            for (const [month, amount] of Object.entries(master.byMonth)) {
              classificationByMonth[month] = (classificationByMonth[month] || 0) + amount;
            }
          }
        }
        if (masters.length > 0) {
          result.push({
            label: classification.label,
            sortOrder: classification.sortOrder,
            total: masters.reduce((sum, m) => sum + m.total, 0),
            byMonth: classificationByMonth,
            masterCategories: masters.sort((a, b) => b.total - a.total),
          });
        }
      }

      // Add unclassified master categories
      const unclassified = masterCategoriesList.filter(mc => !classifiedMasterIds.has(mc.id));
      if (unclassified.length > 0) {
        const unclassifiedByMonth: Record<string, number> = {};
        for (const master of unclassified) {
          for (const [month, amount] of Object.entries(master.byMonth)) {
            unclassifiedByMonth[month] = (unclassifiedByMonth[month] || 0) + amount;
          }
        }
        result.push({
          label: 'Sin Clasificar',
          sortOrder: 999,
          total: unclassified.reduce((sum, m) => sum + m.total, 0),
          byMonth: unclassifiedByMonth,
          masterCategories: unclassified,
        });
      }

      // Sort by sortOrder (classifications already sorted, but ensure unclassified is at end)
      return result.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    // Fallback: single "Gastos" classification
    const fallbackByMonth: Record<string, number> = {};
    for (const master of masterCategoriesList) {
      for (const [month, amount] of Object.entries(master.byMonth)) {
        fallbackByMonth[month] = (fallbackByMonth[month] || 0) + amount;
      }
    }

    const classification: ClassificationData = {
      label: 'Gastos',
      sortOrder: 1,
      total: masterCategoriesList.reduce((sum, mc) => sum + mc.total, 0),
      byMonth: fallbackByMonth,
      masterCategories: masterCategoriesList,
    };

    return [classification];
  });

  // Calculate income data
  const incomeData = $derived.by(() => {
    const income = $transactions.filter(
      (tx) =>
        tx.date >= startDate &&
        tx.date <= endDate &&
        tx.amount > 0 &&
        !isTransfer(tx)
    );

    // Group by payee
    const byPayee = new Map<string, { name: string; total: number; byMonth: Record<string, number> }>();
    const totalByMonth: Record<string, number> = {};

    for (const tx of income) {
      const payeeId = tx.payeeId || 'unknown';
      const payee = $payees.find((p) => p.entityId === payeeId);

      if (!byPayee.has(payeeId)) {
        byPayee.set(payeeId, {
          name: payee?.name || 'Desconocido',
          total: 0,
          byMonth: {}
        });
      }

      const data = byPayee.get(payeeId)!;
      data.total += tx.amount;

      const month = tx.date.substring(0, 7);
      data.byMonth[month] = (data.byMonth[month] || 0) + tx.amount;
      totalByMonth[month] = (totalByMonth[month] || 0) + tx.amount;
    }

    const payeesList = Array.from(byPayee.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.total - a.total);

    return {
      total: payeesList.reduce((sum, p) => sum + p.total, 0),
      byMonth: totalByMonth,
      payees: payeesList,
    };
  });

  const totalExpenses = $derived(spendingData.reduce((sum, c) => sum + c.total, 0));
  const totalIncome = $derived(incomeData.total);
  const netAmount = $derived(totalIncome - totalExpenses);

  // Calculate expenses by month
  const expensesByMonth = $derived.by(() => {
    const result: Record<string, number> = {};
    for (const classification of spendingData) {
      for (const [month, amount] of Object.entries(classification.byMonth)) {
        result[month] = (result[month] || 0) + amount;
      }
    }
    return result;
  });

  // Calculate net by month
  const netByMonth = $derived.by(() => {
    const result: Record<string, number> = {};
    for (const month of months) {
      const income = incomeData.byMonth[month] || 0;
      const expenses = expensesByMonth[month] || 0;
      result[month] = income - expenses;
    }
    return result;
  });

  function toggleIncome() {
    showIncomeDetails = !showIncomeDetails;
  }

  function toggleClassification(label: string) {
    const newSet = new Set(expandedClassifications);
    if (newSet.has(label)) {
      newSet.delete(label);
    } else {
      newSet.add(label);
    }
    expandedClassifications = newSet;
  }

  function toggleMasterCategory(id: string) {
    const newSet = new Set(expandedMasterCategories);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    expandedMasterCategories = newSet;
  }

  function expandAll() {
    const classLabels = spendingData.map(c => c.label);
    const masterIds = spendingData.flatMap(c => c.masterCategories.map(mc => mc.id));
    expandedClassifications = new Set(classLabels);
    expandedMasterCategories = new Set(masterIds);
  }

  function collapseAll() {
    expandedClassifications = new Set();
    expandedMasterCategories = new Set();
  }

  function openClassificationEditor() {
    showClassificationEditor = true;
  }

  function closeClassificationEditor() {
    showClassificationEditor = false;
  }

  function saveClassifications(newClassifications: CategoryClassification[]) {
    clientConfig.setCategoryClassifications(newClassifications);
    showClassificationEditor = false;
  }

  function formatMonth(month: string): string {
    const [year, m] = month.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return months[parseInt(m) - 1] || m;
  }

  function exportToCSV() {
    const rows: string[] = [];

    // Header
    const header = ['Clasificación', 'Categoría Maestra', 'Subcategoría', ...months.map(formatMonth), 'Total'];
    rows.push(header.join(','));

    // Data rows
    for (const classification of spendingData) {
      for (const master of classification.masterCategories) {
        for (const cat of master.categories) {
          const monthValues = months.map(m => (cat.byMonth[m] || 0).toFixed(2));
          rows.push([
            classification.label,
            master.name,
            cat.name,
            ...monthValues,
            cat.total.toFixed(2)
          ].join(','));
        }
      }
    }

    // Download
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportToExcel() {
    // Create workbook
    const wb = XLSX.utils.book_new();

    // Build data array with hierarchical structure
    const data: (string | number)[][] = [];

    // Header row
    data.push(['Etiquetas de fila', ...months.map(m => `Suma de ${formatMonth(m)}`), 'Total General']);

    // Income section
    data.push([`1 Ingreso`, ...months.map(m => incomeData.byMonth[m] || 0), totalIncome]);

    // Income details
    for (const payee of incomeData.payees) {
      data.push([`    ${payee.name}`, ...months.map(m => payee.byMonth[m] || 0), payee.total]);
    }

    // Expense sections
    for (const classification of spendingData) {
      // Classification row
      data.push([
        `${classification.sortOrder} ${classification.label}`,
        ...months.map(m => classification.byMonth[m] || 0),
        classification.total
      ]);

      // Master categories
      for (const master of classification.masterCategories) {
        data.push([
          `    ${master.name}`,
          ...months.map(m => master.byMonth[m] || 0),
          master.total
        ]);

        // Subcategories
        for (const cat of master.categories) {
          data.push([
            `        ${cat.name}`,
            ...months.map(m => cat.byMonth[m] || 0),
            cat.total
          ]);
        }
      }
    }

    // Total row
    data.push(['Total General', ...months.map(m => netByMonth[m] || 0), netAmount]);

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    const colWidths = [
      { wch: 35 }, // Label column
      ...months.map(() => ({ wch: 15 })), // Month columns
      { wch: 15 }, // Total column
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos');

    // Generate Excel file
    XLSX.writeFile(wb, `gastos_${startDate}_${endDate}.xlsx`);
  }
</script>

<div class="space-y-4">
  <!-- Header with actions -->
  <div class="flex items-center justify-between">
    <div>
      <h3 class="font-heading font-semibold">Reporte de Gastos e Ingresos</h3>
      <p class="text-sm text-muted-foreground">
        {startDate} a {endDate}
      </p>
    </div>
    <div class="flex gap-2">
      <Button variant="outline" size="sm" onclick={expandAll}>
        Expandir
      </Button>
      <Button variant="outline" size="sm" onclick={collapseAll}>
        Colapsar
      </Button>
      <Button variant="outline" size="sm" onclick={exportToExcel}>
        <FileSpreadsheet class="h-4 w-4 mr-1" />
        Excel
      </Button>
      <Button variant="outline" size="sm" onclick={exportToCSV}>
        <Download class="h-4 w-4 mr-1" />
        CSV
      </Button>
      <Button variant="outline" size="sm" onclick={openClassificationEditor}>
        <Settings class="h-4 w-4 mr-1" />
        Clasificar
      </Button>
    </div>
  </div>

  <!-- Excel-style table -->
  <div class="overflow-x-auto border rounded-lg">
    <table class="w-full text-sm excel-table">
      <thead>
        <tr class="bg-muted/50 border-b">
          <th class="text-left py-2 px-3 sticky left-0 bg-muted/50 min-w-[280px] font-semibold">
            Etiquetas de fila
          </th>
          {#each months as month}
            <th class="text-right py-2 px-3 min-w-[100px] font-medium">
              Suma de {formatMonth(month)}
            </th>
          {/each}
          <th class="text-right py-2 px-3 font-bold min-w-[120px] bg-muted/70">
            Total General
          </th>
        </tr>
      </thead>
      <tbody>
        <!-- Income Section (Classification 1) -->
        <tr
          class="classification-row income-row cursor-pointer"
          onclick={toggleIncome}
        >
          <td class="py-2 px-3 sticky left-0 font-semibold">
            <div class="flex items-center gap-2">
              {#if showIncomeDetails}
                <ChevronDown class="h-4 w-4" />
              {:else}
                <ChevronRight class="h-4 w-4" />
              {/if}
              <span class="classification-number">1</span>
              <span>Ingreso</span>
            </div>
          </td>
          {#each months as month}
            <td class="text-right py-2 px-3 income-amount">
              {incomeData.byMonth[month] ? formatCurrency(incomeData.byMonth[month]) : '-'}
            </td>
          {/each}
          <td class="text-right py-2 px-3 font-bold income-amount bg-green-50 dark:bg-green-950/30">
            {formatCurrency(totalIncome)}
          </td>
        </tr>

        {#if showIncomeDetails}
          {#each incomeData.payees as payee}
            <tr class="hover:bg-muted/30 subcategory-row">
              <td class="py-1.5 px-3 pl-10 sticky left-0 bg-background">
                {payee.name}
              </td>
              {#each months as month}
                <td class="text-right py-1.5 px-3 income-amount text-sm">
                  {payee.byMonth[month] ? formatCurrency(payee.byMonth[month]) : '-'}
                </td>
              {/each}
              <td class="text-right py-1.5 px-3 font-medium income-amount bg-green-50/50 dark:bg-green-950/20">
                {formatCurrency(payee.total)}
              </td>
            </tr>
          {/each}
        {/if}

        <!-- Expense Classifications -->
        {#each spendingData as classification, classIndex}
          <!-- Classification header -->
          <tr
            class="classification-row expense-row cursor-pointer"
            onclick={() => toggleClassification(classification.label)}
          >
            <td class="py-2 px-3 sticky left-0 font-semibold">
              <div class="flex items-center gap-2">
                {#if expandedClassifications.has(classification.label)}
                  <ChevronDown class="h-4 w-4" />
                {:else}
                  <ChevronRight class="h-4 w-4" />
                {/if}
                <span class="classification-number">{classification.sortOrder}</span>
                <span>{classification.label}</span>
              </div>
            </td>
            {#each months as month}
              <td class="text-right py-2 px-3 expense-amount">
                {classification.byMonth[month] ? formatCurrency(classification.byMonth[month]) : '-'}
              </td>
            {/each}
            <td class="text-right py-2 px-3 font-bold expense-amount bg-red-50 dark:bg-red-950/30">
              {formatCurrency(classification.total)}
            </td>
          </tr>

          {#if expandedClassifications.has(classification.label)}
            {#each classification.masterCategories as master}
              <!-- Master category row -->
              <tr
                class="master-category-row cursor-pointer hover:bg-muted/30"
                onclick={() => toggleMasterCategory(master.id)}
              >
                <td class="py-1.5 px-3 pl-8 sticky left-0 bg-background">
                  <div class="flex items-center gap-2">
                    {#if expandedMasterCategories.has(master.id)}
                      <ChevronDown class="h-3 w-3 text-muted-foreground" />
                    {:else}
                      <ChevronRight class="h-3 w-3 text-muted-foreground" />
                    {/if}
                    <span class="font-medium">{master.name}</span>
                  </div>
                </td>
                {#each months as month}
                  <td class="text-right py-1.5 px-3">
                    {master.byMonth[month] ? formatCurrency(master.byMonth[month]) : '-'}
                  </td>
                {/each}
                <td class="text-right py-1.5 px-3 font-medium bg-muted/30">
                  {formatCurrency(master.total)}
                </td>
              </tr>

              {#if expandedMasterCategories.has(master.id)}
                {#each master.categories as category}
                  <!-- Category row -->
                  <tr class="subcategory-row hover:bg-muted/20">
                    <td class="py-1 px-3 pl-14 sticky left-0 bg-background text-muted-foreground">
                      {category.name}
                    </td>
                    {#each months as month}
                      <td class="text-right py-1 px-3 text-muted-foreground text-sm">
                        {category.byMonth[month] ? formatCurrency(category.byMonth[month]) : '-'}
                      </td>
                    {/each}
                    <td class="text-right py-1 px-3 bg-muted/20">
                      {formatCurrency(category.total)}
                    </td>
                  </tr>
                {/each}
              {/if}
            {/each}
          {/if}
        {/each}

        <!-- Total General Row -->
        <tr class="total-row border-t-2">
          <td class="py-3 px-3 sticky left-0 font-bold text-base bg-muted">
            Total General
          </td>
          {#each months as month}
            {@const net = netByMonth[month] || 0}
            <td class="text-right py-3 px-3 font-semibold bg-muted {net >= 0 ? 'text-green-600' : 'text-red-600'}">
              {formatCurrency(net)}
            </td>
          {/each}
          <td class="text-right py-3 px-3 font-bold text-base bg-muted/80 {netAmount >= 0 ? 'text-green-600' : 'text-red-600'}">
            {formatCurrency(netAmount)}
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Summary cards -->
  <div class="grid grid-cols-3 gap-4">
    <div class="summary-card income-card">
      <p class="text-sm text-muted-foreground">Total Ingresos</p>
      <p class="text-xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
    </div>
    <div class="summary-card expense-card">
      <p class="text-sm text-muted-foreground">Total Gastos</p>
      <p class="text-xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
    </div>
    <div class="summary-card {netAmount >= 0 ? 'income-card' : 'expense-card'}">
      <p class="text-sm text-muted-foreground">Balance Neto</p>
      <p class="text-xl font-bold {netAmount >= 0 ? 'text-green-600' : 'text-red-600'}">
        {formatCurrency(netAmount)}
      </p>
    </div>
  </div>
</div>

<!-- Classification Editor Modal -->
{#if showClassificationEditor}
  <ClassificationEditor
    classifications={storedClassifications}
    onSave={saveClassifications}
    onClose={closeClassificationEditor}
  />
{/if}

<style>
  .summary-card {
    border-radius: 0.5rem;
    padding: 1rem;
  }
  .income-card {
    background-color: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.2);
  }
  .expense-card {
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  /* Excel-style table */
  .excel-table {
    border-collapse: collapse;
  }

  .excel-table th,
  .excel-table td {
    border-bottom: 1px solid hsl(var(--border) / 0.5);
  }

  .excel-table th {
    border-bottom: 2px solid hsl(var(--border));
  }

  /* Classification number badge */
  .classification-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    font-size: 0.7rem;
    font-weight: 600;
    border-radius: 0.25rem;
    background-color: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  /* Classification rows */
  .classification-row {
    transition: background-color 0.15s ease;
  }

  .classification-row:hover {
    filter: brightness(0.95);
  }

  .income-row {
    background-color: rgba(34, 197, 94, 0.08);
  }

  .income-row td:first-child {
    background-color: rgba(34, 197, 94, 0.08);
  }

  .income-row .classification-number {
    background-color: rgba(34, 197, 94, 0.2);
    color: rgb(22, 163, 74);
  }

  .expense-row {
    background-color: rgba(239, 68, 68, 0.05);
  }

  .expense-row td:first-child {
    background-color: rgba(239, 68, 68, 0.05);
  }

  .expense-row .classification-number {
    background-color: rgba(239, 68, 68, 0.15);
    color: rgb(220, 38, 38);
  }

  /* Amount colors */
  .income-amount {
    color: rgb(22, 163, 74);
  }

  .expense-amount {
    color: rgb(220, 38, 38);
  }

  /* Master category rows */
  .master-category-row td:first-child {
    background-color: hsl(var(--background));
  }

  /* Subcategory rows */
  .subcategory-row td:first-child {
    background-color: hsl(var(--background));
  }

  /* Total row */
  .total-row {
    border-top: 2px solid hsl(var(--border));
  }

  .total-row td:first-child {
    background-color: hsl(var(--muted));
  }

  /* Dark mode adjustments */
  :global(.dark) .income-row {
    background-color: rgba(34, 197, 94, 0.1);
  }

  :global(.dark) .income-row td:first-child {
    background-color: rgba(34, 197, 94, 0.1);
  }

  :global(.dark) .expense-row {
    background-color: rgba(239, 68, 68, 0.08);
  }

  :global(.dark) .expense-row td:first-child {
    background-color: rgba(239, 68, 68, 0.08);
  }

  :global(.dark) .income-amount {
    color: rgb(74, 222, 128);
  }

  :global(.dark) .expense-amount {
    color: rgb(248, 113, 113);
  }
</style>

