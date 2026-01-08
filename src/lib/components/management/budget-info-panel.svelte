<script lang="ts">
  import { onMount } from 'svelte';
  import { FileText, Calendar, Database, HardDrive, Copy, Check, Info, Smartphone } from 'lucide-svelte';
  import { budgetInfo } from '$lib/stores/budget';
  import { getDeviceInfo } from '$lib/services/budget-sync';

  let copiedField = $state<string | null>(null);
  let budgetData = $state<{
    budgetName: string;
    dataFolderName: string | null;
    budgetPath: string | null;
    mode: string;
    canWrite: boolean;
    formatVersion?: string;
    lastModified?: string;
    entityCount?: number;
  } | null>(null);

  // Get device info for this budget
  const deviceInfo = $derived(getDeviceInfo());

  function copyToClipboard(text: string | undefined, field: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    copiedField = field;
    setTimeout(() => {
      copiedField = null;
    }, 2000);
  }

  onMount(async () => {
    const client = $budgetInfo?.client;
    if (!client) return;

    try {
      const budget = await client.getBudget();

      budgetData = {
        budgetName: $budgetInfo.budgetName || 'Budget',
        dataFolderName: $budgetInfo.dataFolderName,
        budgetPath: $budgetInfo.budgetPath,
        mode: $budgetInfo.mode || 'browser',
        canWrite: $budgetInfo.canWrite,
        formatVersion: budget?.budgetMetaData?.budgetDataVersion || 'N/A',
        lastModified: budget?.budgetMetaData?.lastModified,
        entityCount: budget?.transactions?.length || 0,
      };
    } catch (e) {
      console.error('Error loading budget data:', e);
    }
  });

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  function getModeLabel(mode: string | undefined): string {
    switch (mode) {
      case 'dropbox': return 'Dropbox';
      case 'local': return 'Local';
      case 'browser': return 'Navegador';
      default: return mode || 'Desconocido';
    }
  }
</script>

<div class="budget-info-panel">
  <!-- Header -->
  <div class="panel-header">
    <div>
      <h3>Información del Presupuesto</h3>
      <p class="panel-subtitle">Detalles y metadatos del presupuesto actual</p>
    </div>
  </div>

  <!-- Content -->
  <div class="panel-content">
    {#if budgetData}
      <!-- Budget Name -->
      <div class="info-section">
        <div class="section-header">
          <FileText class="h-4 w-4" />
          <span>Presupuesto</span>
        </div>
        <div class="info-card">
          <div class="info-row">
            <span class="info-label">Nombre</span>
            <span class="info-value font-semibold">{budgetData.budgetName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Modo</span>
            <div class="info-value">
              <span class="mode-badge mode-{budgetData.mode}">{getModeLabel(budgetData.mode)}</span>
              {#if budgetData.canWrite}
                <span class="mode-badge mode-edit">Edición</span>
              {:else}
                <span class="mode-badge mode-readonly">Solo Lectura</span>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- Current Device Info -->
      {#if deviceInfo}
        <div class="info-section">
          <div class="section-header">
            <Smartphone class="h-4 w-4" />
            <span>Este Dispositivo</span>
          </div>
          <div class="info-card">
            <div class="info-row">
              <span class="info-label">Short ID</span>
              <div class="info-value-with-copy">
                <span class="font-mono font-bold text-primary">{deviceInfo.shortDeviceId || 'N/A'}</span>
                <button
                  class="copy-btn"
                  onclick={() => copyToClipboard(deviceInfo?.shortDeviceId, 'shortId')}
                  title="Copiar"
                >
                  {#if copiedField === 'shortId'}
                    <Check class="h-3.5 w-3.5 text-green-500" />
                  {:else}
                    <Copy class="h-3.5 w-3.5" />
                  {/if}
                </button>
              </div>
            </div>
            <div class="info-row">
              <span class="info-label">Device GUID</span>
              <div class="info-value-with-copy">
                <span class="font-mono text-xs truncate" title={deviceInfo.deviceGUID || ''}>
                  {deviceInfo.deviceGUID || 'N/A'}
                </span>
                <button
                  class="copy-btn"
                  onclick={() => copyToClipboard(deviceInfo?.deviceGUID, 'deviceGuid')}
                  title="Copiar"
                >
                  {#if copiedField === 'deviceGuid'}
                    <Check class="h-3.5 w-3.5 text-green-500" />
                  {:else}
                    <Copy class="h-3.5 w-3.5" />
                  {/if}
                </button>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Storage -->
      <div class="info-section">
        <div class="section-header">
          <HardDrive class="h-4 w-4" />
          <span>Almacenamiento</span>
        </div>
        <div class="info-card">
          {#if budgetData.budgetPath}
            <div class="info-row">
              <span class="info-label">Ruta</span>
              <div class="info-value-with-copy">
                <span class="font-mono text-xs truncate" title={budgetData.budgetPath}>
                  {budgetData.budgetPath}
                </span>
                <button
                  class="copy-btn"
                  onclick={() => copyToClipboard(budgetData?.budgetPath || '', 'path')}
                  title="Copiar"
                >
                  {#if copiedField === 'path'}
                    <Check class="h-3.5 w-3.5 text-green-500" />
                  {:else}
                    <Copy class="h-3.5 w-3.5" />
                  {/if}
                </button>
              </div>
            </div>
          {/if}
          {#if budgetData.dataFolderName}
            <div class="info-row">
              <span class="info-label">Carpeta de datos</span>
              <span class="info-value font-mono text-xs">{budgetData.dataFolderName}</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Metadata -->
      <div class="info-section">
        <div class="section-header">
          <Database class="h-4 w-4" />
          <span>Metadatos</span>
        </div>
        <div class="info-card">
          <div class="info-row">
            <span class="info-label">Versión de formato</span>
            <span class="info-value">{budgetData.formatVersion}</span>
          </div>
          {#if budgetData.lastModified}
            <div class="info-row">
              <span class="info-label">Última modificación</span>
              <span class="info-value">{formatDate(budgetData.lastModified)}</span>
            </div>
          {/if}
          <div class="info-row">
            <span class="info-label">Transacciones</span>
            <span class="info-value">{budgetData.entityCount?.toLocaleString() || 0}</span>
          </div>
        </div>
      </div>
    {:else}
      <div class="loading-state">
        <Info class="h-8 w-8 text-muted-foreground" />
        <p>Cargando información del presupuesto...</p>
      </div>
    {/if}
  </div>

  <!-- Footer Info -->
  <div class="panel-footer">
    <p>
      Esta información es específica del presupuesto actual. El Short ID identifica este dispositivo
      para la sincronización YNAB4.
    </p>
  </div>
</div>

<style>
  .budget-info-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: hsl(var(--background));
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--card));
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .panel-subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .info-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
  }

  .info-card {
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    overflow: hidden;
  }

  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid hsl(var(--border));
  }

  .info-row:last-child {
    border-bottom: none;
  }

  .info-label {
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .info-value {
    font-size: 0.85rem;
    color: hsl(var(--foreground));
    text-align: right;
  }

  .info-value-with-copy {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 60%;
    text-align: right;
    justify-content: flex-end;
  }

  .info-value-with-copy span {
    font-size: 0.85rem;
    color: hsl(var(--foreground));
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border-radius: 4px;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .copy-btn:hover {
    background: hsl(var(--accent));
    color: hsl(var(--foreground));
  }

  .text-primary {
    color: hsl(var(--primary));
  }

  .mode-badge {
    display: inline-flex;
    padding: 0.125rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 500;
    border-radius: 4px;
    margin-left: 0.25rem;
  }

  .mode-badge:first-child {
    margin-left: 0;
  }

  .mode-dropbox {
    background: hsl(217 91% 60% / 0.15);
    color: hsl(217 91% 60%);
  }

  .mode-local {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .mode-browser {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .mode-edit {
    background: hsl(142 76% 36% / 0.15);
    color: hsl(142 76% 36%);
  }

  .mode-readonly {
    background: hsl(var(--muted));
    color: hsl(var(--muted-foreground));
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    gap: 1rem;
  }

  .panel-footer {
    padding: 1rem 1.25rem;
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.3);
  }

  .panel-footer p {
    margin: 0;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
  }
</style>
