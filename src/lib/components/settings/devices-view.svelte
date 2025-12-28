<script lang="ts">
  import { onMount } from 'svelte';
  import { Monitor, Smartphone, Cloud, Check, AlertCircle, Crown, RefreshCw, Copy, Edit3, Eye } from 'lucide-svelte';
  import { t } from '$lib/i18n';
  import { budgetInfo } from '$lib/stores/budget';
  import { addToast, isEditMode } from '$lib/stores/ui';

  // Types from library (using any to avoid build issues)
  type DeviceSyncInfo = {
    deviceGUID: string;
    shortDeviceId: string;
    friendlyName: string;
    deviceType: string;
    knowledge: Record<string, any> | string | null;
    knowledgeInFullBudgetFile: Record<string, any> | string | null;
    hasFullKnowledge: boolean;
    lastDataVersionFullyKnown: string | number | null;
    highestDataVersionImported: string | number | null;
    YNABVersion: string | null;
    formatVersion: string | number | null;
  };

  // Helper to calculate total knowledge
  function getTotalKnowledge(knowledge: any): number {
    if (!knowledge) return 0;
    if (typeof knowledge === 'string') {
      // Parse "A-123,B-456" format
      const matches = knowledge.match(/\d+/g);
      if (matches) {
        return matches.reduce((sum, n) => sum + parseInt(n, 10), 0);
      }
      return 0;
    }
    if (typeof knowledge === 'object') {
      let total = 0;
      for (const value of Object.values(knowledge)) {
        if (typeof value === 'number') {
          total += value;
        } else if (typeof value === 'object' && value !== null) {
          if ('versionCounter' in value) total += (value as any).versionCounter;
          else if ('increment' in value) total += (value as any).increment;
        }
      }
      return total;
    }
    return 0;
  }

  // State
  let devices = $state<DeviceSyncInfo[]>([]);
  let currentDevice = $state<DeviceSyncInfo | null>(null);
  let highestKnowledgeDevice = $state<DeviceSyncInfo | null>(null);
  let isCurrentRegistered = $state(false);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let clientGUID = $state<string>('');
  let clientShortId = $state<string>('');

  async function loadDevices() {
    isLoading = true;
    error = null;

    try {
      const client = $budgetInfo.client as any;
      if (!client) {
        error = 'No hay presupuesto cargado';
        return;
      }

      // Get client's own GUID (always available)
      clientGUID = client.getDeviceGUID?.() || client.deviceGUID || '';
      clientShortId = client.currentDevice?.shortDeviceId || '';

      // Load all devices from budget
      if (typeof client.getAllDevicesWithData === 'function') {
        devices = await client.getAllDevicesWithData();
      }
      
      // Get current device data (if registered)
      if (typeof client.getCurrentDeviceData === 'function') {
        currentDevice = client.getCurrentDeviceData();
      }
      
      // Get device with highest knowledge
      if (typeof client.getDeviceWithHighestKnowledge === 'function') {
        highestKnowledgeDevice = await client.getDeviceWithHighestKnowledge();
      }
      
      // Check if current device is registered
      if (typeof client.isCurrentDeviceRegistered === 'function') {
        isCurrentRegistered = await client.isCurrentDeviceRegistered();
      }
      
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al cargar dispositivos';
      console.error('Error loading devices:', e);
    } finally {
      isLoading = false;
    }
  }

  function calculateTotalKnowledge(device: DeviceSyncInfo): number {
    const knowledgeToUse = device.knowledgeInFullBudgetFile || device.knowledge;
    return getTotalKnowledge(knowledgeToUse as any);
  }

  function getVersionValue(version: unknown): string | number {
    if (typeof version === 'number') return version;
    if (typeof version === 'string') {
      const match = version.match(/-(\d+)$/);
      if (match) return match[1];
      return version;
    }
    if (version && typeof version === 'object') {
      if ('versionCounter' in version) return (version as any).versionCounter;
      if ('increment' in version) return (version as any).increment;
    }
    return '?';
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    addToast({ type: 'success', message: 'Copiado al portapapeles' });
  }

  function getDeviceIcon(deviceType: string) {
    const type = deviceType?.toLowerCase() || '';
    if (type.includes('android') || type.includes('ios') || type.includes('mobile') || type.includes('phone')) {
      return Smartphone;
    }
    if (type.includes('cloud') || type.includes('dropbox')) {
      return Cloud;
    }
    return Monitor;
  }

  function isHighestKnowledge(device: DeviceSyncInfo): boolean {
    return highestKnowledgeDevice?.deviceGUID === device.deviceGUID;
  }

  function isThisClient(device: DeviceSyncInfo): boolean {
    return device.deviceGUID === clientGUID;
  }

  // Sorted devices
  const sortedDevices = $derived(
    [...devices].sort((a, b) => calculateTotalKnowledge(b) - calculateTotalKnowledge(a))
  );

  onMount(() => {
    loadDevices();
  });
</script>

<div class="devices-view">
  <div class="header">
    <h2>Dispositivos del Presupuesto</h2>
    <button class="refresh-btn" onclick={loadDevices} disabled={isLoading}>
      <span class:spinning={isLoading}>
        <RefreshCw class="h-4 w-4" />
      </span>
    </button>
  </div>

  {#if isLoading}
    <div class="loading">
      <RefreshCw class="h-6 w-6 spinning" />
      <span>Cargando dispositivos...</span>
    </div>
  {:else if error}
    <div class="error">
      <AlertCircle class="h-5 w-5" />
      <span>{error}</span>
    </div>
  {:else}
    <!-- This Client Info -->
    <section class="section">
      <h3>Este Cliente</h3>
      
      <div class="client-card" class:registered={isCurrentRegistered} class:not-registered={!isCurrentRegistered}>
        <div class="client-header">
          <div class="client-icon">
            {#if $isEditMode}
              <Edit3 class="h-5 w-5" />
            {:else}
              <Eye class="h-5 w-5" />
            {/if}
          </div>
          <div class="client-info">
            <span class="client-name">YNAB4 Client</span>
            <span class="client-mode">
              {#if $isEditMode}
                Modo Edición
              {:else}
                Solo Lectura
              {/if}
            </span>
          </div>
          <div class="status-badge" class:registered={isCurrentRegistered} class:not-registered={!isCurrentRegistered}>
            {#if isCurrentRegistered}
              <Check class="h-3 w-3" />
              <span>Registrado en Budget</span>
            {:else}
              <AlertCircle class="h-3 w-3" />
              <span>No registrado</span>
            {/if}
          </div>
        </div>

        <div class="client-details">
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Short ID</span>
              <span class="detail-value mono">{clientShortId || '-'}</span>
            </div>
            <div class="detail-item full-width">
              <span class="detail-label">GUID</span>
              <div class="guid-row">
                <span class="detail-value mono guid-text">{clientGUID || '-'}</span>
                {#if clientGUID}
                  <button class="copy-btn" onclick={() => copyToClipboard(clientGUID)} title="Copiar GUID">
                    <Copy class="h-3 w-3" />
                  </button>
                {/if}
              </div>
            </div>
          </div>

          {#if !isCurrentRegistered}
            <div class="warning-box">
              <AlertCircle class="h-4 w-4" />
              <span>Este cliente no está registrado en el presupuesto. Para registrarse, cambie a modo edición y guarde cambios.</span>
            </div>
          {/if}
        </div>
      </div>
    </section>

    <!-- Registered Devices -->
    <section class="section">
      <h3>Dispositivos Registrados ({devices.length})</h3>
      
      <div class="devices-table">
        <div class="table-header">
          <div class="col-icon"></div>
          <div class="col-name">Dispositivo</div>
          <div class="col-id">ID</div>
          <div class="col-guid">GUID</div>
          <div class="col-version">Versión</div>
          <div class="col-knowledge">Knowledge</div>
        </div>

        {#each sortedDevices as device (device.deviceGUID)}
          {@const DeviceIcon = getDeviceIcon(device.deviceType)}
          {@const isHighest = isHighestKnowledge(device)}
          {@const isClient = isThisClient(device)}
          {@const totalKnowledge = calculateTotalKnowledge(device)}
          
          <div class="table-row" class:highest={isHighest} class:is-client={isClient}>
            <div class="col-icon">
              <div class="device-icon-small">
                <DeviceIcon class="h-4 w-4" />
              </div>
            </div>
            
            <div class="col-name">
              <span class="device-name-text">{device.friendlyName}</span>
              <span class="device-type-text">{device.deviceType}</span>
              <div class="device-tags">
                {#if isHighest}
                  <span class="tag tag-highest">
                    <Crown class="h-3 w-3" />
                    Mayor Knowledge
                  </span>
                {/if}
                {#if isClient}
                  <span class="tag tag-client">Este cliente</span>
                {/if}
              </div>
            </div>
            
            <div class="col-id">
              <span class="mono">{device.shortDeviceId}</span>
            </div>
            
            <div class="col-guid">
              <span class="mono guid-full">{device.deviceGUID}</span>
              <button class="copy-btn-small" onclick={() => copyToClipboard(device.deviceGUID)} title="Copiar GUID">
                <Copy class="h-3 w-3" />
              </button>
            </div>
            
            <div class="col-version">
              <div class="version-info">
                <span class="version-label">YNAB</span>
                <span class="version-value">{device.YNABVersion || '-'}</span>
              </div>
              <div class="version-info">
                <span class="version-label">Formato</span>
                <span class="version-value">{device.formatVersion || '-'}</span>
              </div>
              <div class="version-info">
                <span class="version-label">Full</span>
                <span class="version-value">{device.hasFullKnowledge ? '✓' : '✗'}</span>
              </div>
            </div>
            
            <div class="col-knowledge">
              <div class="knowledge-total">
                <span class="knowledge-number">{totalKnowledge.toLocaleString()}</span>
              </div>
              {#if device.knowledgeInFullBudgetFile && typeof device.knowledgeInFullBudgetFile === 'object'}
                <div class="knowledge-breakdown">
                  {#each Object.entries(device.knowledgeInFullBudgetFile) as [id, version]}
                    <span class="knowledge-item" class:self={id === device.shortDeviceId}>
                      {id}:{getVersionValue(version)}
                    </span>
                  {/each}
                </div>
              {:else if device.knowledge && typeof device.knowledge === 'object'}
                <div class="knowledge-breakdown">
                  {#each Object.entries(device.knowledge) as [id, version]}
                    <span class="knowledge-item" class:self={id === device.shortDeviceId}>
                      {id}:{getVersionValue(version)}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <!-- Summary -->
    <section class="section">
      <h3>Resumen de Sincronización</h3>
      
      <div class="summary-cards">
        <div class="summary-card">
          <span class="summary-number">{devices.length}</span>
          <span class="summary-label">Dispositivos</span>
        </div>
        <div class="summary-card">
          <span class="summary-number">{devices.filter(d => d.hasFullKnowledge).length}</span>
          <span class="summary-label">Con Full Knowledge</span>
        </div>
        <div class="summary-card highlight">
          <span class="summary-number">{highestKnowledgeDevice?.shortDeviceId || '-'}</span>
          <span class="summary-label">Mayor Knowledge</span>
        </div>
        <div class="summary-card" class:success={isCurrentRegistered} class:warning={!isCurrentRegistered}>
          <span class="summary-number">{isCurrentRegistered ? '✓' : '✗'}</span>
          <span class="summary-label">Cliente Registrado</span>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .devices-view {
    padding: 1.5rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .header h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--foreground);
    margin: 0;
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--background);
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.2s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--accent);
    color: var(--foreground);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .loading, .error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem;
    color: var(--muted-foreground);
  }

  .error {
    color: var(--destructive);
  }

  .section {
    margin-bottom: 2rem;
  }

  .section h3 {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 0.75rem;
  }

  /* Client Card */
  .client-card {
    background: var(--card);
    border: 2px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  .client-card.registered {
    border-color: var(--success);
  }

  .client-card.not-registered {
    border-color: var(--warning);
  }

  .client-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--accent);
  }

  .client-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--background);
    border-radius: 10px;
    color: var(--foreground);
  }

  .client-info {
    flex: 1;
  }

  .client-name {
    display: block;
    font-weight: 600;
    font-size: 1rem;
    color: var(--foreground);
  }

  .client-mode {
    display: block;
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-badge.registered {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  .status-badge.not-registered {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .client-details {
    padding: 1rem;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem 1.5rem;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .detail-item.full-width {
    grid-column: 1 / -1;
  }

  .detail-label {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .detail-value {
    font-size: 0.875rem;
    color: var(--foreground);
  }

  .guid-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .guid-text {
    word-break: break-all;
  }

  .mono {
    font-family: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace;
    font-size: 0.8rem;
  }

  .warning-box {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0.75rem;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 8px;
    color: #d97706;
    font-size: 0.8rem;
  }

  .warning-box :global(svg) {
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  /* Devices Table */
  .devices-table {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  .table-header {
    display: grid;
    grid-template-columns: 48px 1fr 60px 1fr 100px 180px;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--muted);
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border);
  }

  .table-row {
    display: grid;
    grid-template-columns: 48px 1fr 60px 1fr 100px 180px;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .table-row:hover {
    background: var(--accent);
  }

  .table-row.highest {
    background: rgba(245, 158, 11, 0.08);
  }

  .table-row.is-client {
    background: rgba(59, 130, 246, 0.08);
  }

  .table-row.highest.is-client {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(245, 158, 11, 0.08));
  }

  .col-icon {
    display: flex;
    align-items: flex-start;
    padding-top: 0.25rem;
  }

  .device-icon-small {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--accent);
    border-radius: 8px;
    color: var(--foreground);
  }

  .col-name {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .device-name-text {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--foreground);
  }

  .device-type-text {
    font-size: 0.7rem;
    color: var(--muted-foreground);
  }

  .device-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 500;
  }

  .tag-highest {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .tag-client {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }

  .col-id {
    display: flex;
    align-items: flex-start;
    padding-top: 0.25rem;
    font-size: 0.8rem;
  }

  .col-guid {
    display: flex;
    align-items: flex-start;
    gap: 0.375rem;
    padding-top: 0.25rem;
    min-width: 0;
  }

  .guid-full {
    font-size: 0.7rem;
    word-break: break-all;
    line-height: 1.4;
  }

  .copy-btn, .copy-btn-small {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .copy-btn:hover, .copy-btn-small:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .col-version {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.25rem;
  }

  .version-info {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.7rem;
  }

  .version-label {
    color: var(--muted-foreground);
  }

  .version-value {
    color: var(--foreground);
    font-weight: 500;
  }

  .col-knowledge {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-top: 0.25rem;
  }

  .knowledge-total {
    text-align: right;
  }

  .knowledge-number {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }

  .knowledge-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    justify-content: flex-end;
  }

  .knowledge-item {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    padding: 0.125rem 0.25rem;
    background: var(--accent);
    border-radius: 3px;
    color: var(--muted-foreground);
  }

  .knowledge-item.self {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
    font-weight: 600;
  }

  /* Summary Cards */
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    text-align: center;
  }

  .summary-card.highlight {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.3);
  }

  .summary-card.success {
    background: rgba(34, 197, 94, 0.08);
    border-color: rgba(34, 197, 94, 0.3);
  }

  .summary-card.warning {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.3);
  }

  .summary-number {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }

  .summary-label {
    font-size: 0.7rem;
    color: var(--muted-foreground);
    margin-top: 0.25rem;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .table-header {
      display: none;
    }

    .table-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
    }

    .col-icon {
      display: none;
    }

    .col-guid {
      flex-wrap: wrap;
    }

    .col-knowledge {
      align-items: flex-start;
    }

    .knowledge-total {
      text-align: left;
    }

    .knowledge-breakdown {
      justify-content: flex-start;
    }
  }
</style>
