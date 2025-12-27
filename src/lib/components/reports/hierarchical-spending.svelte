<script lang="ts">
  import { onMount } from 'svelte';
  import { ChevronDown, ChevronRight, Download, Settings } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { transactions, categories, masterCategories, payees } from '$lib/stores/budget';
  import { clientConfig, type CategoryClassification } from '$lib/stores/classifications';
  import { ClassificationEditor } from '$lib/components/settings';
  import { formatCurrency } from '$lib/utils';

  interface Props {
    startDate: string;
    endDate: string;
  }

  let { startDate, endDate }: Props = $props();

  // Load classifications on mount
  onMount(() => {
    clientConfig.load();
  });

  // Expansion state
  let expandedClassifications = $state<Set<string>>(new Set());
  let expandedMasterCategories = $state<Set<string>>(new Set());
  let showClassificationEditor = $state(false);

  // Use classifications from store
  const storedClassifications = $derived($clientConfig.categoryClassifications);

  interface ClassificationData {
    label: string;
    total: number;
    masterCategories: MasterCategoryData[];
  }

  interface MasterCategoryData {
    id: string;
    name: string;
    total: number;
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
          categories: [],
        });
      }
      
      const masterData = byMasterCategory.get(masterCategoryId)!;
      masterData.total += data.total;
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

      for (const classification of storedClassifications) {
        const masters: MasterCategoryData[] = [];
        for (const masterId of classification.masterCategoryIds) {
          const master = byMasterCategory.get(masterId);
          if (master) {
            masters.push(master);
            classifiedMasterIds.add(masterId);
          }
        }
        if (masters.length > 0) {
          result.push({
            label: classification.label,
            total: masters.reduce((sum, m) => sum + m.total, 0),
            masterCategories: masters.sort((a, b) => b.total - a.total),
          });
        }
      }

      // Add unclassified master categories
      const unclassified = masterCategoriesList.filter(mc => !classifiedMasterIds.has(mc.id));
      if (unclassified.length > 0) {
        result.push({
          label: 'Sin Clasificar',
          total: unclassified.reduce((sum, m) => sum + m.total, 0),
          masterCategories: unclassified,
        });
      }

      return result.sort((a, b) => {
        // Keep "Sin Clasificar" at the end
        if (a.label === 'Sin Clasificar') return 1;
        if (b.label === 'Sin Clasificar') return -1;
        return b.total - a.total;
      });
    }

    // Fallback: single "Gastos" classification
    const classification: ClassificationData = {
      label: 'Gastos',
      total: masterCategoriesList.reduce((sum, mc) => sum + mc.total, 0),
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
    }

    const payeesList = Array.from(byPayee.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.total - a.total);

    return {
      total: payeesList.reduce((sum, p) => sum + p.total, 0),
      payees: payeesList,
    };
  });

  const totalExpenses = $derived(spendingData.reduce((sum, c) => sum + c.total, 0));
  const totalIncome = $derived(incomeData.total);
  const netAmount = $derived(totalIncome - totalExpenses);

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

  <!-- Summary cards -->
  <div class="grid grid-cols-3 gap-4">
    <div class="summary-card income-card">
      <p class="text-sm text-muted-foreground">Ingresos</p>
      <p class="text-xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
    </div>
    <div class="summary-card expense-card">
      <p class="text-sm text-muted-foreground">Gastos</p>
      <p class="text-xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
    </div>
    <div class="summary-card {netAmount >= 0 ? 'income-card' : 'expense-card'}">
      <p class="text-sm text-muted-foreground">Neto</p>
      <p class="text-xl font-bold {netAmount >= 0 ? 'text-green-600' : 'text-red-600'}">
        {formatCurrency(netAmount)}
      </p>
    </div>
  </div>

  <!-- Month headers -->
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b">
          <th class="text-left py-2 pr-4 sticky left-0 bg-background min-w-[250px]">Categoría</th>
          {#each months as month}
            <th class="text-right py-2 px-2 min-w-[80px]">{formatMonth(month)}</th>
          {/each}
          <th class="text-right py-2 pl-4 font-bold min-w-[100px]">Total</th>
        </tr>
      </thead>
      <tbody>
        <!-- Income Section -->
        <tr class="bg-green-500/5 font-semibold cursor-pointer hover:bg-green-500/10">
          <td class="py-2 pr-4 sticky left-0 bg-green-500/5" colspan="{months.length + 2}">
            <div class="flex items-center gap-2">
              <span class="text-green-600">💰 Ingresos</span>
              <span class="text-green-600 ml-auto">{formatCurrency(totalIncome)}</span>
            </div>
          </td>
        </tr>
        {#each incomeData.payees.slice(0, 5) as payee}
          <tr class="hover:bg-muted/50">
            <td class="py-1 pr-4 pl-6 sticky left-0 bg-background">{payee.name}</td>
            {#each months as month}
              <td class="text-right py-1 px-2 text-green-600">
                {payee.byMonth[month] ? formatCurrency(payee.byMonth[month]) : '-'}
              </td>
            {/each}
            <td class="text-right py-1 pl-4 font-medium text-green-600">
              {formatCurrency(payee.total)}
            </td>
          </tr>
        {/each}
        {#if incomeData.payees.length > 5}
          <tr class="text-muted-foreground text-xs">
            <td class="py-1 pr-4 pl-6 sticky left-0 bg-background">
              ... y {incomeData.payees.length - 5} más
            </td>
          </tr>
        {/if}

        <!-- Spacing row -->
        <tr><td colspan="{months.length + 2}" class="py-2"></td></tr>

        <!-- Expenses Section -->
        {#each spendingData as classification}
          <!-- Classification header -->
          <tr 
            class="bg-red-500/5 font-semibold cursor-pointer hover:bg-red-500/10"
            onclick={() => toggleClassification(classification.label)}
          >
            <td class="py-2 pr-4 sticky left-0 bg-red-500/5">
              <div class="flex items-center gap-2">
                {#if expandedClassifications.has(classification.label)}
                  <ChevronDown class="h-4 w-4" />
                {:else}
                  <ChevronRight class="h-4 w-4" />
                {/if}
                <span class="text-red-600">📊 {classification.label}</span>
              </div>
            </td>
            {#each months as month}
              <td class="text-right py-2 px-2 text-red-600">
                {formatCurrency(classification.masterCategories.reduce((sum, mc) => {
                  return sum + mc.categories.reduce((catSum, cat) => catSum + (cat.byMonth[month] || 0), 0);
                }, 0))}
              </td>
            {/each}
            <td class="text-right py-2 pl-4 font-bold text-red-600">
              {formatCurrency(classification.total)}
            </td>
          </tr>

          {#if expandedClassifications.has(classification.label)}
            {#each classification.masterCategories as master}
              <!-- Master category row -->
              <tr 
                class="bg-muted/30 cursor-pointer hover:bg-muted/50"
                onclick={() => toggleMasterCategory(master.id)}
              >
                <td class="py-1 pr-4 pl-4 sticky left-0 bg-muted/30">
                  <div class="flex items-center gap-2">
                    {#if expandedMasterCategories.has(master.id)}
                      <ChevronDown class="h-3 w-3" />
                    {:else}
                      <ChevronRight class="h-3 w-3" />
                    {/if}
                    <span class="font-medium">{master.name}</span>
                  </div>
                </td>
                {#each months as month}
                  <td class="text-right py-1 px-2">
                    {formatCurrency(master.categories.reduce((sum, cat) => sum + (cat.byMonth[month] || 0), 0))}
                  </td>
                {/each}
                <td class="text-right py-1 pl-4 font-medium">
                  {formatCurrency(master.total)}
                </td>
              </tr>

              {#if expandedMasterCategories.has(master.id)}
                {#each master.categories as category}
                  <!-- Category row -->
                  <tr class="hover:bg-muted/50 text-muted-foreground">
                    <td class="py-1 pr-4 pl-8 sticky left-0 bg-background">
                      {category.name}
                    </td>
                    {#each months as month}
                      <td class="text-right py-1 px-2">
                        {category.byMonth[month] ? formatCurrency(category.byMonth[month]) : '-'}
                      </td>
                    {/each}
                    <td class="text-right py-1 pl-4">
                      {formatCurrency(category.total)}
                    </td>
                  </tr>
                {/each}
              {/if}
            {/each}
          {/if}
        {/each}
      </tbody>
    </table>
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
</style>

