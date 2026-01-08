<script lang="ts">
  import { Plus, Trash2, GripVertical, Save, X } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { masterCategories } from '$lib/stores/budget';

  interface CategoryClassification {
    label: string;
    sortOrder: number;
    masterCategoryIds: string[];
  }

  interface Props {
    classifications: CategoryClassification[];
    onSave: (classifications: CategoryClassification[]) => void;
    onClose: () => void;
  }

  let { classifications: initialClassifications, onSave, onClose }: Props = $props();

  // Local state for editing
  let localClassifications = $state<CategoryClassification[]>(
    JSON.parse(JSON.stringify(initialClassifications))
  );
  let newLabel = $state('');
  let draggedItem = $state<number | null>(null);

  // Get all master categories (excluding hidden/internal)
  const availableMasterCategories = $derived.by(() => {
    return $masterCategories
      .filter(mc => 
        mc.name && 
        !mc.name.startsWith('Hidden') && 
        !mc.name.startsWith('Internal') &&
        !mc.name.startsWith('Pre-YNAB')
      )
      .sort((a, b) => (a.sortableIndex || 0) - (b.sortableIndex || 0));
  });

  // Get unassigned master categories
  const unassignedMasterCategories = $derived.by(() => {
    const assignedIds = new Set(localClassifications.flatMap(c => c.masterCategoryIds));
    return availableMasterCategories.filter(mc => !assignedIds.has(mc.entityId));
  });

  function addClassification() {
    if (!newLabel.trim()) return;

    // Start from 2 because 1 is reserved for Income
    const maxOrder = localClassifications.reduce((max, c) => Math.max(max, c.sortOrder), 1);
    localClassifications = [
      ...localClassifications,
      {
        label: newLabel.trim(),
        sortOrder: maxOrder + 1,
        masterCategoryIds: [],
      }
    ];
    newLabel = '';
  }

  function removeClassification(index: number) {
    localClassifications = localClassifications.filter((_, i) => i !== index);
    // Re-sort (start from 2, since 1 is reserved for Income)
    localClassifications = localClassifications.map((c, i) => ({ ...c, sortOrder: i + 2 }));
  }

  function toggleMasterCategory(classificationIndex: number, masterCategoryId: string) {
    const classification = localClassifications[classificationIndex];
    const exists = classification.masterCategoryIds.includes(masterCategoryId);
    
    if (exists) {
      classification.masterCategoryIds = classification.masterCategoryIds.filter(id => id !== masterCategoryId);
    } else {
      // Remove from other classifications first
      for (const c of localClassifications) {
        c.masterCategoryIds = c.masterCategoryIds.filter(id => id !== masterCategoryId);
      }
      classification.masterCategoryIds = [...classification.masterCategoryIds, masterCategoryId];
    }
    
    // Trigger reactivity
    localClassifications = [...localClassifications];
  }

  function handleDragStart(e: DragEvent, index: number) {
    draggedItem = index;
    e.dataTransfer!.effectAllowed = 'move';
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;

    const newList = [...localClassifications];
    const [removed] = newList.splice(draggedItem, 1);
    newList.splice(index, 0, removed);

    // Update sort order (start from 2, since 1 is reserved for Income)
    localClassifications = newList.map((c, i) => ({ ...c, sortOrder: i + 2 }));
    draggedItem = index;
  }

  function handleDragEnd() {
    draggedItem = null;
  }

  function getMasterCategoryName(id: string): string {
    return availableMasterCategories.find(mc => mc.entityId === id)?.name || 'Unknown';
  }

  function handleSave() {
    onSave(localClassifications);
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div class="bg-background border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b">
      <h2 class="text-lg font-heading font-semibold">Editor de Clasificaciones</h2>
      <Button variant="ghost" size="sm" onclick={onClose}>
        <X class="h-4 w-4" />
      </Button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Info note -->
      <div class="text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
        <strong>Nota:</strong> La clasificación <span class="inline-flex items-center justify-center w-4 h-4 text-[10px] font-semibold bg-green-500/20 text-green-600 rounded">1</span> "Ingreso" está reservada y se muestra automáticamente. Las clasificaciones de gastos comienzan desde el número 2.
      </div>

      <!-- Add new classification -->
      <div class="flex gap-2">
        <Input
          type="text"
          placeholder="Nueva clasificación de gastos..."
          bind:value={newLabel}
          onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && addClassification()}
        />
        <Button onclick={addClassification} disabled={!newLabel.trim()}>
          <Plus class="h-4 w-4 mr-1" />
          Agregar
        </Button>
      </div>

      <!-- Classifications list -->
      {#if localClassifications.length === 0}
        <div class="text-center text-muted-foreground py-8">
          <p>No hay clasificaciones definidas.</p>
          <p class="text-sm">Agrega una clasificación arriba para empezar.</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each localClassifications as classification, index}
            <div
              class="border rounded-lg p-3 bg-card"
              draggable="true"
              ondragstart={(e: DragEvent) => handleDragStart(e, index)}
              ondragover={(e: DragEvent) => handleDragOver(e, index)}
              ondragend={handleDragEnd}
              class:opacity-50={draggedItem === index}
            >
              <!-- Classification header -->
              <div class="flex items-center gap-2 mb-2">
                <GripVertical class="h-4 w-4 text-muted-foreground cursor-grab" />
                <span class="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold bg-primary/10 text-primary rounded">
                  {classification.sortOrder}
                </span>
                <span class="font-medium flex-1">{classification.label}</span>
                <span class="text-xs text-muted-foreground">
                  {classification.masterCategoryIds.length} categorías
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => removeClassification(index)}
                >
                  <Trash2 class="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <!-- Master categories in this classification -->
              <div class="flex flex-wrap gap-1 ml-6">
                {#each classification.masterCategoryIds as masterId}
                  <button
                    class="px-2 py-1 text-xs bg-primary/10 text-primary rounded-full hover:bg-primary/20"
                    onclick={() => toggleMasterCategory(index, masterId)}
                    title="Clic para quitar"
                  >
                    {getMasterCategoryName(masterId)} ✕
                  </button>
                {/each}
                
                {#if classification.masterCategoryIds.length === 0}
                  <span class="text-xs text-muted-foreground italic">
                    Sin categorías asignadas
                  </span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Unassigned master categories -->
      {#if unassignedMasterCategories.length > 0}
        <div class="border-t pt-4">
          <p class="text-sm font-medium mb-2">Categorías maestras sin clasificar:</p>
          <div class="flex flex-wrap gap-1">
            {#each unassignedMasterCategories as mc}
              <div class="relative group">
                <button
                  class="px-2 py-1 text-xs bg-muted text-muted-foreground rounded-full hover:bg-muted/80"
                  title="Clic para asignar a una clasificación"
                >
                  {mc.name}
                </button>
                <!-- Dropdown to select classification -->
                <div class="absolute top-full left-0 mt-1 hidden group-hover:block z-10">
                  <div class="bg-popover border rounded-md shadow-lg p-1 min-w-[150px]">
                    {#each localClassifications as classification, idx}
                      <button
                        class="w-full text-left px-2 py-1 text-xs hover:bg-muted rounded"
                        onclick={() => toggleMasterCategory(idx, mc.entityId)}
                      >
                        {classification.label}
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex justify-end gap-2 p-4 border-t">
      <Button variant="outline" onclick={onClose}>
        Cancelar
      </Button>
      <Button onclick={handleSave}>
        <Save class="h-4 w-4 mr-1" />
        Guardar
      </Button>
    </div>
  </div>
</div>

