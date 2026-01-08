<script lang="ts">
  import { onMount } from 'svelte';
  import {
    X,
    Search,
    Users,
    Edit3,
    Trash2,
    Merge,
    Tag,
    FileText,
    DollarSign,
    Check,
    AlertTriangle,
  } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { payees, categories, masterCategories, transactions } from '$lib/stores/budget';
  import { formatCurrency } from '$lib/utils';
  import type { Payee, Category } from 'ynab-library';

  interface Props {
    visible?: boolean;
    onClose?: () => void;
  }

  let { visible = false, onClose }: Props = $props();

  // State
  let searchQuery = $state('');
  let selectedPayeeIds = $state<Set<string>>(new Set());
  let activeTab = $state<'list' | 'autofill' | 'rename'>('list');
  let editingPayee = $state<Payee | null>(null);

  // Autofill settings state
  let autofillCategory = $state<string>('');
  let autofillMemo = $state('');
  let autofillAmount = $state<number | null>(null);

  // Rename rules state
  let renameRules = $state<{ pattern: string; replacement: string }[]>([]);
  let newRulePattern = $state('');
  let newRuleReplacement = $state('');

  // Merge state
  let showMergeDialog = $state(false);
  let mergeTargetName = $state('');

  // Filter payees
  const filteredPayees = $derived(() => {
    return $payees
      .filter((p) => !p.name.startsWith('Transfer :'))
      .filter((p) => !p.isTombstone)
      .filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  // Get transaction count per payee
  const payeeStats = $derived(() => {
    const stats = new Map<string, { count: number; total: number; lastUsed: string }>();

    for (const tx of $transactions) {
      if (!tx.payeeId) continue;

      const existing = stats.get(tx.payeeId) || { count: 0, total: 0, lastUsed: '' };
      existing.count++;
      existing.total += tx.amount;

      if (!existing.lastUsed || tx.date > existing.lastUsed) {
        existing.lastUsed = tx.date;
      }

      stats.set(tx.payeeId, existing);
    }

    return stats;
  });

  // Get category hierarchy for dropdown
  const categoryOptions = $derived(() => {
    const options: { value: string; label: string; group: string }[] = [];

    for (const master of $masterCategories) {
      if (master.name.startsWith('Hidden') || master.name.startsWith('Internal')) continue;

      const cats = $categories.filter((c) => c.masterCategoryId === master.entityId);
      for (const cat of cats) {
        options.push({
          value: cat.entityId,
          label: cat.name,
          group: master.name,
        });
      }
    }

    return options;
  });

  function togglePayeeSelection(payeeId: string) {
    const newSet = new Set(selectedPayeeIds);
    if (newSet.has(payeeId)) {
      newSet.delete(payeeId);
    } else {
      newSet.add(payeeId);
    }
    selectedPayeeIds = newSet;
  }

  function selectAllVisible() {
    selectedPayeeIds = new Set(filteredPayees().map((p) => p.entityId));
  }

  function clearSelection() {
    selectedPayeeIds = new Set();
  }

  function openAutofillSettings(payee: Payee) {
    editingPayee = payee;
    activeTab = 'autofill';

    // Load existing autofill settings
    const payeeData = payee as any;
    autofillCategory = payeeData.autoFillCategoryId || '';
    autofillMemo = payeeData.autoFillMemo || '';
    autofillAmount = payeeData.autoFillAmount || null;
  }

  function saveAutofillSettings() {
    if (!editingPayee) return;

    // TODO: Implement saving autofill settings to the budget
    console.log('Saving autofill settings:', {
      payeeId: editingPayee.entityId,
      category: autofillCategory,
      memo: autofillMemo,
      amount: autofillAmount,
    });

    editingPayee = null;
    activeTab = 'list';
  }

  function openMergeDialog() {
    if (selectedPayeeIds.size < 2) return;

    // Default merge target is the first selected payee's name
    const firstPayeeId = Array.from(selectedPayeeIds)[0];
    const firstPayee = $payees.find((p) => p.entityId === firstPayeeId);
    mergeTargetName = firstPayee?.name || '';
    showMergeDialog = true;
  }

  function executeMerge() {
    if (!mergeTargetName.trim()) return;

    // TODO: Implement merge logic
    console.log('Merging payees:', {
      payeeIds: Array.from(selectedPayeeIds),
      targetName: mergeTargetName,
    });

    showMergeDialog = false;
    selectedPayeeIds = new Set();
  }

  function addRenameRule() {
    if (!newRulePattern.trim()) return;

    renameRules = [
      ...renameRules,
      { pattern: newRulePattern, replacement: newRuleReplacement },
    ];

    newRulePattern = '';
    newRuleReplacement = '';
  }

  function removeRenameRule(index: number) {
    renameRules = renameRules.filter((_, i) => i !== index);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (showMergeDialog) {
        showMergeDialog = false;
      } else if (editingPayee) {
        editingPayee = null;
        activeTab = 'list';
      } else {
        onClose?.();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visible}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="bg-background rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
        <div class="flex items-center gap-3">
          <Users class="h-5 w-5 text-primary" />
          <h2 class="text-lg font-semibold">Configuración de Beneficiarios</h2>
        </div>
        <button
          class="p-2 rounded-lg hover:bg-muted transition-colors"
          onclick={() => onClose?.()}
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b px-6">
        <button
          class="px-4 py-3 text-sm font-medium transition-colors {activeTab === 'list' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => activeTab = 'list'}
        >
          Lista de Beneficiarios
        </button>
        <button
          class="px-4 py-3 text-sm font-medium transition-colors {activeTab === 'autofill' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => activeTab = 'autofill'}
        >
          Auto-completar
        </button>
        <button
          class="px-4 py-3 text-sm font-medium transition-colors {activeTab === 'rename' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => activeTab = 'rename'}
        >
          Reglas de Renombrado
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        {#if activeTab === 'list'}
          <!-- Search and actions -->
          <div class="flex items-center gap-4 mb-4">
            <div class="relative flex-1">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar beneficiario..."
                class="pl-10"
                bind:value={searchQuery}
              />
            </div>

            {#if selectedPayeeIds.size > 0}
              <span class="text-sm text-muted-foreground">
                {selectedPayeeIds.size} seleccionados
              </span>
              <Button variant="outline" size="sm" onclick={clearSelection}>
                Limpiar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onclick={openMergeDialog}
                disabled={selectedPayeeIds.size < 2}
              >
                <Merge class="h-4 w-4 mr-1" />
                Combinar
              </Button>
            {:else}
              <Button variant="outline" size="sm" onclick={selectAllVisible}>
                Seleccionar todos
              </Button>
            {/if}
          </div>

          <!-- Payee list -->
          <div class="border rounded-lg overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50">
                <tr>
                  <th class="w-10 p-3"></th>
                  <th class="text-left p-3">Beneficiario</th>
                  <th class="text-right p-3">Transacciones</th>
                  <th class="text-right p-3">Total</th>
                  <th class="text-right p-3">Última vez</th>
                  <th class="w-20 p-3"></th>
                </tr>
              </thead>
              <tbody>
                {#each filteredPayees() as payee}
                  {@const stats = payeeStats().get(payee.entityId)}
                  <tr class="border-t hover:bg-muted/30 transition-colors">
                    <td class="p-3">
                      <input
                        type="checkbox"
                        checked={selectedPayeeIds.has(payee.entityId)}
                        onchange={() => togglePayeeSelection(payee.entityId)}
                        class="rounded"
                      />
                    </td>
                    <td class="p-3 font-medium">{payee.name}</td>
                    <td class="p-3 text-right text-muted-foreground">
                      {stats?.count || 0}
                    </td>
                    <td class="p-3 text-right amount">
                      {formatCurrency(stats?.total || 0)}
                    </td>
                    <td class="p-3 text-right text-muted-foreground text-xs">
                      {stats?.lastUsed || '-'}
                    </td>
                    <td class="p-3">
                      <button
                        class="p-1.5 rounded hover:bg-muted transition-colors"
                        onclick={() => openAutofillSettings(payee)}
                        title="Configurar auto-completar"
                      >
                        <Edit3 class="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>

            {#if filteredPayees().length === 0}
              <div class="p-8 text-center text-muted-foreground">
                No se encontraron beneficiarios
              </div>
            {/if}
          </div>

        {:else if activeTab === 'autofill'}
          {#if editingPayee}
            <div class="space-y-6 max-w-md">
              <div>
                <h3 class="font-medium mb-2">Auto-completar para: {editingPayee.name}</h3>
                <p class="text-sm text-muted-foreground">
                  Configura valores predeterminados que se aplicarán automáticamente cuando uses este beneficiario.
                </p>
              </div>

              <div class="space-y-4">
                <div>
                  <label class="text-sm font-medium mb-1 block">
                    <Tag class="h-4 w-4 inline mr-1" />
                    Categoría por defecto
                  </label>
                  <select
                    class="w-full p-2 border rounded-lg bg-background"
                    bind:value={autofillCategory}
                  >
                    <option value="">Sin categoría automática</option>
                    {#each categoryOptions() as option}
                      <option value={option.value}>{option.group}: {option.label}</option>
                    {/each}
                  </select>
                </div>

                <div>
                  <label class="text-sm font-medium mb-1 block">
                    <FileText class="h-4 w-4 inline mr-1" />
                    Memo por defecto
                  </label>
                  <Input
                    type="text"
                    placeholder="Memo automático..."
                    bind:value={autofillMemo}
                  />
                </div>

                <div>
                  <label class="text-sm font-medium mb-1 block">
                    <DollarSign class="h-4 w-4 inline mr-1" />
                    Monto por defecto
                  </label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    bind:value={autofillAmount}
                  />
                </div>
              </div>

              <div class="flex gap-2 pt-4">
                <Button onclick={saveAutofillSettings}>
                  <Check class="h-4 w-4 mr-1" />
                  Guardar
                </Button>
                <Button
                  variant="outline"
                  onclick={() => {
                    editingPayee = null;
                    activeTab = 'list';
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          {:else}
            <div class="text-center py-12 text-muted-foreground">
              <Tag class="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecciona un beneficiario desde la lista para configurar sus opciones de auto-completar</p>
            </div>
          {/if}

        {:else if activeTab === 'rename'}
          <div class="space-y-6">
            <div>
              <h3 class="font-medium mb-2">Reglas de Renombrado Automático</h3>
              <p class="text-sm text-muted-foreground">
                Define patrones para renombrar beneficiarios automáticamente al importar transacciones.
              </p>
            </div>

            <!-- Add new rule -->
            <div class="flex gap-2 items-end">
              <div class="flex-1">
                <label class="text-sm font-medium mb-1 block">Patrón (contiene)</label>
                <Input
                  type="text"
                  placeholder="ej: AMAZON*"
                  bind:value={newRulePattern}
                />
              </div>
              <div class="flex-1">
                <label class="text-sm font-medium mb-1 block">Reemplazar con</label>
                <Input
                  type="text"
                  placeholder="ej: Amazon"
                  bind:value={newRuleReplacement}
                />
              </div>
              <Button onclick={addRenameRule} disabled={!newRulePattern.trim()}>
                Agregar
              </Button>
            </div>

            <!-- Existing rules -->
            <div class="border rounded-lg overflow-hidden">
              {#if renameRules.length > 0}
                <table class="w-full text-sm">
                  <thead class="bg-muted/50">
                    <tr>
                      <th class="text-left p-3">Patrón</th>
                      <th class="text-left p-3">Reemplazar con</th>
                      <th class="w-16 p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each renameRules as rule, i}
                      <tr class="border-t">
                        <td class="p-3 font-mono text-xs">{rule.pattern}</td>
                        <td class="p-3">{rule.replacement || '(vacío)'}</td>
                        <td class="p-3">
                          <button
                            class="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                            onclick={() => removeRenameRule(i)}
                          >
                            <Trash2 class="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <div class="p-8 text-center text-muted-foreground">
                  No hay reglas de renombrado configuradas
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t bg-muted/30 flex justify-end gap-2">
        <Button variant="outline" onclick={() => onClose?.()}>
          Cerrar
        </Button>
      </div>
    </div>

    <!-- Merge Dialog -->
    {#if showMergeDialog}
      <div class="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
        <div class="bg-background rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
          <div class="flex items-center gap-2 text-amber-500">
            <AlertTriangle class="h-5 w-5" />
            <h3 class="font-semibold">Combinar Beneficiarios</h3>
          </div>

          <p class="text-sm text-muted-foreground">
            Vas a combinar {selectedPayeeIds.size} beneficiarios. Todas las transacciones se asignarán al nuevo nombre. Esta acción no se puede deshacer.
          </p>

          <div>
            <label class="text-sm font-medium mb-1 block">Nombre final</label>
            <Input
              type="text"
              placeholder="Nombre del beneficiario..."
              bind:value={mergeTargetName}
            />
          </div>

          <div class="flex gap-2 justify-end">
            <Button variant="outline" onclick={() => showMergeDialog = false}>
              Cancelar
            </Button>
            <Button onclick={executeMerge} disabled={!mergeTargetName.trim()}>
              <Merge class="h-4 w-4 mr-1" />
              Combinar
            </Button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
