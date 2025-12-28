<script lang="ts">
  import { FileSpreadsheet, Upload, Trash2, Download, Clock, CheckCircle2, AlertCircle } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { formatCurrency } from '$lib/utils';
  import type { StoredImportFile } from '$lib/services/import-storage';

  interface Props {
    files: StoredImportFile[];
    onSelect: (fileId: string) => void;
    onDelete: (fileId: string) => void;
    onNew: () => void;
  }

  let { files, onSelect, onDelete, onNew }: Props = $props();

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-MX', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getProgress(file: StoredImportFile): number {
    if (file.transactionCount === 0) return 0;
    return Math.round((file.readyCount / file.transactionCount) * 100);
  }
</script>

<div class="space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold">Archivos de Importación</h3>
      <p class="text-sm text-muted-foreground">
        {files.length === 0 ? 'No hay archivos en progreso' : `${files.length} archivo${files.length > 1 ? 's' : ''} en progreso`}
      </p>
    </div>
    <Button onclick={onNew}>
      <Upload class="h-4 w-4 mr-2" />
      Nuevo archivo
    </Button>
  </div>

  <!-- File list -->
  {#if files.length === 0}
    <div class="border-2 border-dashed rounded-lg p-8 text-center">
      <FileSpreadsheet class="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <p class="text-muted-foreground">
        No hay archivos de importación guardados.
      </p>
      <p class="text-sm text-muted-foreground mt-1">
        Carga un archivo CSV o Excel para comenzar.
      </p>
      <Button variant="outline" class="mt-4" onclick={onNew}>
        <Upload class="h-4 w-4 mr-2" />
        Cargar archivo
      </Button>
    </div>
  {:else}
    <div class="space-y-2">
      {#each files as file (file.id)}
        {@const progress = getProgress(file)}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
          class="w-full text-left p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
          onclick={() => onSelect(file.id)}
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <!-- File name and source -->
              <div class="flex items-center gap-2">
                <FileSpreadsheet class="h-5 w-5 text-primary shrink-0" />
                <span class="font-medium truncate">{file.name}</span>
              </div>
              
              {#if file.sourceFile && file.sourceFile !== file.name}
                <p class="text-xs text-muted-foreground mt-0.5 truncate">
                  Origen: {file.sourceFile}
                </p>
              {/if}

              <!-- Stats -->
              <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">
                <span class="text-muted-foreground">
                  {file.transactionCount} transacciones
                </span>
                {#if file.readyCount > 0}
                  <span class="text-ynab-green flex items-center gap-1">
                    <CheckCircle2 class="h-3.5 w-3.5" />
                    {file.readyCount} completas
                  </span>
                {/if}
                {#if file.pendingCount > 0}
                  <span class="text-amber-500 flex items-center gap-1">
                    <AlertCircle class="h-3.5 w-3.5" />
                    {file.pendingCount} pendientes
                  </span>
                {/if}
              </div>

              <!-- Account groups -->
              {#if file.accountGroups.length > 0}
                <div class="flex flex-wrap gap-1 mt-2">
                  {#each file.accountGroups.slice(0, 3) as group}
                    <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {group}
                    </span>
                  {/each}
                  {#if file.accountGroups.length > 3}
                    <span class="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      +{file.accountGroups.length - 3}
                    </span>
                  {/if}
                </div>
              {/if}

              <!-- Progress bar -->
              <div class="mt-3 flex items-center gap-2">
                <div class="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-ynab-green transition-all duration-300"
                    style="width: {progress}%"
                  ></div>
                </div>
                <span class="text-xs text-muted-foreground w-10">{progress}%</span>
              </div>
            </div>

            <!-- Right side: amount and actions -->
            <div class="text-right shrink-0">
              <div class={`text-lg font-mono font-semibold ${file.netAmount >= 0 ? 'text-ynab-green' : 'text-ynab-red'}`}>
                {formatCurrency(file.netAmount)}
              </div>
              <div class="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Clock class="h-3 w-3" />
                {formatDate(file.updatedAt)}
              </div>
              
              <!-- Delete button -->
              <button
                class="mt-2 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                onclick={(e) => { e.stopPropagation(); onDelete(file.id); }}
                title="Eliminar archivo"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

