<script lang="ts">
  import { onMount } from 'svelte';
  import { Monitor, Smartphone, Cloud, Check, AlertCircle, Crown, RefreshCw, Copy } from 'lucide-svelte';
  import { t } from '$lib/i18n';
  import { budgetInfo } from '$lib/stores/budget';
  import { addToast } from '$lib/stores/ui';
  import { getTotalKnowledge, type DeviceSyncInfo, type Knowledge } from 'ynab-library';

  // State
  let devices = $state<DeviceSyncInfo[]>([]);
  let currentDevice = $state<DeviceSyncInfo | null>(null);
  let highestKnowledgeDevice = $state<DeviceSyncInfo | null>(null);
  let isCurrentRegistered = $state(false);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  async function loadDevices() {
    isLoading = true;
    error = null;

    try {
      const client = $budgetInfo.client;
      if (!client) {
        error = 'No budget loaded';
        return;
      }

      // Load all devices
      devices = await client.getAllDevicesWithData();
      
      // Get current device data
      currentDevice = client.getCurrentDeviceData();
      
      // Get device with highest knowledge
      highestKnowledgeDevice = await client.getDeviceWithHighestKnowledge();
      
      // Check if current device is registered
      isCurrentRegistered = await client.isCurrentDeviceRegistered();
      
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error loading devices';
      console.error('Error loading devices:', e);
    } finally {
      isLoading = false;
    }
  }

  function calculateTotalKnowledge(device: DeviceSyncInfo): number {
    const knowledgeToUse = device.knowledgeInFullBudgetFile || device.knowledge;
    return getTotalKnowledge(knowledgeToUse);
  }

  function formatKnowledge(knowledge: Knowledge): string {
    if (!knowledge) return '-';
    if (typeof knowledge === 'string') return knowledge;
    const entries = Object.entries(knowledge);
    if (entries.length === 0) return '-';
    return entries.map(([id, v]) => {
      if (typeof v === 'number') return `${id}:${v}`;
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object') {
        if ('versionCounter' in v) return `${id}:${(v as { versionCounter: number }).versionCounter}`;
        if ('increment' in v) return `${id}:${(v as { increment: number }).increment}`;
      }
      return `${id}:?`;
    }).join(', ');
  }

  function getVersionValue(version: unknown): string | number {
    if (typeof version === 'number') return version;
    if (typeof version === 'string') {
      // Parse "A-123" format
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
    switch (deviceType.toLowerCase()) {
      case 'mobile':
      case 'phone':
      case 'ios':
      case 'android':
        return Smartphone;
      case 'cloud':
      case 'dropbox':
        return Cloud;
      default:
        return Monitor;
    }
  }

  function isHighestKnowledge(device: DeviceSyncInfo): boolean {
    return highestKnowledgeDevice?.deviceGUID === device.deviceGUID;
  }

  function isCurrentDevice(device: DeviceSyncInfo): boolean {
    return currentDevice?.deviceGUID === device.deviceGUID;
  }

  onMount(() => {
    loadDevices();
  });
</script>

<div class="devices-view">
  <div class="header">
    <h2>{$t('settings.devices.title')}</h2>
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
    <!-- Current Device Section -->
    <section class="section">
      <h3>Dispositivo Actual</h3>
      
      <div class="current-device-card" class:not-registered={!isCurrentRegistered}>
        <div class="device-header">
          <div class="device-icon">
            <Monitor class="h-6 w-6" />
          </div>
          <div class="device-info">
            <span class="device-name">{currentDevice?.friendlyName || 'Sin dispositivo'}</span>
            <span class="device-type">{currentDevice?.deviceType || '-'}</span>
          </div>
          {#if isCurrentRegistered}
            <div class="status-badge registered">
              <Check class="h-3 w-3" />
              <span>Registrado</span>
            </div>
          {:else}
            <div class="status-badge not-registered">
              <AlertCircle class="h-3 w-3" />
              <span>No registrado</span>
            </div>
          {/if}
        </div>

        <div class="device-details">
          <div class="detail-row">
            <span class="label">Short ID:</span>
            <span class="value mono">{currentDevice?.shortDeviceId || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="label">GUID:</span>
            <span class="value mono guid">
              {currentDevice?.deviceGUID || '-'}
              {#if currentDevice?.deviceGUID}
                <button class="copy-btn" onclick={() => copyToClipboard(currentDevice!.deviceGUID)}>
                  <Copy class="h-3 w-3" />
                </button>
              {/if}
            </span>
          </div>
          <div class="detail-row">
            <span class="label">Full Knowledge:</span>
            <span class="value">{currentDevice?.hasFullKnowledge ? 'Sí' : 'No'}</span>
          </div>
          <div class="detail-row">
            <span class="label">YNAB Version:</span>
            <span class="value">{currentDevice?.YNABVersion || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Format Version:</span>
            <span class="value">{currentDevice?.formatVersion || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Knowledge Total:</span>
            <span class="value mono">{currentDevice ? calculateTotalKnowledge(currentDevice) : 0}</span>
          </div>
        </div>

        {#if currentDevice?.knowledgeInFullBudgetFile && typeof currentDevice.knowledgeInFullBudgetFile === 'object'}
          <div class="knowledge-section">
            <span class="knowledge-label">Knowledge in Budget File:</span>
            <div class="knowledge-vector">
              {#each Object.entries(currentDevice.knowledgeInFullBudgetFile) as [id, version]}
                <span class="knowledge-entry">
                  <span class="device-id">{id}</span>
                  <span class="version">{getVersionValue(version)}</span>
                </span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </section>

    <!-- All Devices Section -->
    <section class="section">
      <h3>Todos los Dispositivos ({devices.length})</h3>
      
      <div class="devices-list">
        {#each devices.sort((a, b) => calculateTotalKnowledge(b) - calculateTotalKnowledge(a)) as device}
          {@const DeviceIcon = getDeviceIcon(device.deviceType)}
          <div class="device-card" class:current={isCurrentDevice(device)} class:highest={isHighestKnowledge(device)}>
            <div class="device-header">
              <div class="device-icon">
                <DeviceIcon class="h-5 w-5" />
              </div>
              <div class="device-info">
                <span class="device-name">
                  {device.friendlyName}
                  {#if isCurrentDevice(device)}
                    <span class="tag current-tag">Actual</span>
                  {/if}
                  {#if isHighestKnowledge(device)}
                    <span class="tag highest-tag">
                      <Crown class="h-3 w-3" />
                      Mayor Knowledge
                    </span>
                  {/if}
                </span>
                <span class="device-type">{device.deviceType}</span>
              </div>
              <div class="knowledge-total">
                <span class="total-value">{calculateTotalKnowledge(device)}</span>
                <span class="total-label">knowledge</span>
              </div>
            </div>

            <div class="device-details compact">
              <div class="detail-row">
                <span class="label">ID:</span>
                <span class="value mono">{device.shortDeviceId}</span>
              </div>
              <div class="detail-row">
                <span class="label">GUID:</span>
                <span class="value mono guid">
                  {device.deviceGUID.substring(0, 8)}...
                  <button class="copy-btn" onclick={() => copyToClipboard(device.deviceGUID)}>
                    <Copy class="h-3 w-3" />
                  </button>
                </span>
              </div>
              <div class="detail-row">
                <span class="label">Full Knowledge:</span>
                <span class="value">{device.hasFullKnowledge ? '✓' : '✗'}</span>
              </div>
              <div class="detail-row">
                <span class="label">Last Version:</span>
                <span class="value mono">{device.lastDataVersionFullyKnown}</span>
              </div>
            </div>

            {#if device.knowledgeInFullBudgetFile && typeof device.knowledgeInFullBudgetFile === 'object' && Object.keys(device.knowledgeInFullBudgetFile).length > 0}
              <div class="knowledge-section compact">
                <span class="knowledge-label">Knowledge:</span>
                <div class="knowledge-vector">
                  {#each Object.entries(device.knowledgeInFullBudgetFile) as [id, version]}
                    <span class="knowledge-entry" class:self={id === device.shortDeviceId}>
                      <span class="device-id">{id}</span>
                      <span class="version">{getVersionValue(version)}</span>
                    </span>
                  {/each}
                </div>
              </div>
            {:else if device.knowledge && typeof device.knowledge === 'object' && Object.keys(device.knowledge).length > 0}
              <div class="knowledge-section compact">
                <span class="knowledge-label">Knowledge:</span>
                <div class="knowledge-vector">
                  {#each Object.entries(device.knowledge) as [id, version]}
                    <span class="knowledge-entry" class:self={id === device.shortDeviceId}>
                      <span class="device-id">{id}</span>
                      <span class="version">{getVersionValue(version)}</span>
                    </span>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Summary Section -->
    <section class="section summary">
      <h3>Resumen</h3>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-value">{devices.length}</span>
          <span class="summary-label">Dispositivos</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">{devices.filter(d => d.hasFullKnowledge).length}</span>
          <span class="summary-label">Con Full Knowledge</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">{highestKnowledgeDevice?.shortDeviceId || '-'}</span>
          <span class="summary-label">Mayor Knowledge</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">{isCurrentRegistered ? 'Sí' : 'No'}</span>
          <span class="summary-label">Registrado</span>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .devices-view {
    padding: 1.5rem;
    max-width: 900px;
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
    padding: 2rem;
    color: var(--muted-foreground);
  }

  .error {
    color: var(--destructive);
  }

  .section {
    margin-bottom: 2rem;
  }

  .section h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 1rem;
  }

  .current-device-card, .device-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
    transition: all 0.2s;
  }

  .current-device-card.not-registered {
    border-color: var(--destructive);
    background: rgba(239, 68, 68, 0.05);
  }

  .device-card {
    margin-bottom: 0.75rem;
  }

  .device-card.current {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.05);
  }

  .device-card.highest {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.05);
  }

  .device-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .device-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--accent);
    border-radius: 10px;
    color: var(--foreground);
  }

  .device-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .device-name {
    font-weight: 600;
    color: var(--foreground);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .device-type {
    font-size: 0.75rem;
    color: var(--muted-foreground);
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .status-badge.registered {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  .status-badge.not-registered {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
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

  .current-tag {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }

  .highest-tag {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .knowledge-total {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--accent);
    border-radius: 8px;
  }

  .total-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }

  .total-label {
    font-size: 0.65rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
  }

  .device-details {
    display: grid;
    gap: 0.375rem;
    padding: 0.75rem;
    background: var(--accent);
    border-radius: 8px;
    margin-bottom: 0.75rem;
  }

  .device-details.compact {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }

  .detail-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label {
    font-size: 0.75rem;
    color: var(--muted-foreground);
    white-space: nowrap;
  }

  .value {
    font-size: 0.8rem;
    color: var(--foreground);
  }

  .value.mono, .mono {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 0.75rem;
  }

  .value.guid {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--muted-foreground);
    cursor: pointer;
    transition: all 0.15s;
  }

  .copy-btn:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .knowledge-section {
    padding: 0.5rem 0.75rem;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .knowledge-section.compact {
    padding: 0.375rem 0.5rem;
  }

  .knowledge-label {
    display: block;
    font-size: 0.7rem;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.375rem;
  }

  .knowledge-vector {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .knowledge-entry {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    padding: 0.125rem 0.375rem;
    background: var(--accent);
    border-radius: 4px;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 0.7rem;
  }

  .knowledge-entry.self {
    background: rgba(59, 130, 246, 0.15);
    color: #3b82f6;
  }

  .device-id {
    color: var(--muted-foreground);
  }

  .version {
    color: var(--foreground);
    font-weight: 600;
  }

  .devices-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .summary {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }

  .summary h3 {
    margin-bottom: 0.75rem;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem;
    background: var(--accent);
    border-radius: 8px;
  }

  .summary-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }

  .summary-label {
    font-size: 0.7rem;
    color: var(--muted-foreground);
    text-align: center;
  }
</style>

