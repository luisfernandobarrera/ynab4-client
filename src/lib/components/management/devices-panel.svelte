<script lang="ts">
  import { onMount } from 'svelte';
  import { Smartphone, Monitor, Tablet, Cloud, CheckCircle2, AlertCircle, Trash2, RefreshCw, Loader2 } from 'lucide-svelte';
  import { budgetInfo } from '$lib/stores/budget';
  import { Button } from '$lib/components/ui/button';

  interface DeviceInfo {
    deviceGUID: string;
    shortDeviceId: string;
    friendlyName: string;
    deviceType: string;
    hasFullKnowledge: boolean;
    knowledgeInFullBudgetFile?: string;
  }

  let devices = $state<DeviceInfo[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // Get current device GUID from client
  const currentDeviceGUID = $derived($budgetInfo?.client?.deviceGUID || '');

  // Load devices from client
  async function loadDevices() {
    isLoading = true;
    error = null;

    try {
      const client = $budgetInfo?.client;
      if (!client) {
        devices = [];
        return;
      }

      // Try to get devices from the budget data
      const budget = await client.getBudget();
      if (budget?.fileMetaData?.deviceFullKnowledge) {
        const deviceKnowledge = budget.fileMetaData.deviceFullKnowledge;
        devices = Object.entries(deviceKnowledge).map(([guid, knowledge]) => ({
          deviceGUID: guid,
          shortDeviceId: guid.substring(0, 8),
          friendlyName: guid === currentDeviceGUID ? 'Este dispositivo' : `Dispositivo ${guid.substring(0, 8)}`,
          deviceType: 'desktop',
          hasFullKnowledge: true,
          knowledgeInFullBudgetFile: String(knowledge),
        }));
      } else {
        // Fallback: just show current device
        devices = [{
          deviceGUID: client.deviceGUID || 'unknown',
          shortDeviceId: client.shortDeviceId || client.deviceGUID?.substring(0, 8) || 'unknown',
          friendlyName: 'Este dispositivo',
          deviceType: 'desktop',
          hasFullKnowledge: true,
        }];
      }
    } catch (e) {
      console.error('Error loading devices:', e);
      error = 'No se pudieron cargar los dispositivos';
      devices = [];
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadDevices();
  });

  // Device info with enhanced data
  const deviceList = $derived.by(() => {
    return devices.map(device => {
      const isCurrentDevice = device.deviceGUID === currentDeviceGUID;

      return {
        ...device,
        isCurrentDevice,
        shortId: device.shortDeviceId || device.deviceGUID?.substring(0, 8) || 'unknown',
      };
    }).sort((a, b) => {
      // Current device first, then by name
      if (a.isCurrentDevice) return -1;
      if (b.isCurrentDevice) return 1;
      return (a.friendlyName || '').localeCompare(b.friendlyName || '');
    });
  });

  function getDeviceIcon(deviceType: string | undefined) {
    switch (deviceType?.toLowerCase()) {
      case 'iphone':
      case 'android':
      case 'mobile':
        return Smartphone;
      case 'ipad':
      case 'tablet':
        return Tablet;
      case 'dropbox':
      case 'cloud':
        return Cloud;
      default:
        return Monitor;
    }
  }

  function formatDeviceType(deviceType: string | undefined): string {
    if (!deviceType) return 'Desconocido';
    return deviceType.charAt(0).toUpperCase() + deviceType.slice(1).toLowerCase();
  }

  function handleRemoveDevice(deviceGUID: string) {
    // TODO: Implement device removal with confirmation
    console.log('Remove device:', deviceGUID);
  }

  function handleRefreshDevices() {
    loadDevices();
  }
</script>

<div class="devices-panel">
  <!-- Header -->
  <div class="devices-header">
    <div>
      <h3>Dispositivos Sincronizados</h3>
      <p class="devices-subtitle">
        {#if isLoading}
          Cargando...
        {:else}
          {deviceList.length} dispositivo{deviceList.length !== 1 ? 's' : ''} conectado{deviceList.length !== 1 ? 's' : ''}
        {/if}
      </p>
    </div>
    <Button variant="outline" size="sm" onclick={handleRefreshDevices} disabled={isLoading}>
      {#if isLoading}
        <Loader2 class="h-4 w-4 mr-1 animate-spin" />
      {:else}
        <RefreshCw class="h-4 w-4 mr-1" />
      {/if}
      Actualizar
    </Button>
  </div>

  <!-- Device List -->
  <div class="devices-list">
    {#if isLoading}
      <div class="devices-loading">
        <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        <p>Cargando dispositivos...</p>
      </div>
    {:else if error}
      <div class="devices-error">
        <AlertCircle class="h-8 w-8 text-destructive" />
        <p>{error}</p>
        <Button variant="outline" size="sm" onclick={handleRefreshDevices}>
          Reintentar
        </Button>
      </div>
    {:else}
      {#each deviceList as device (device.deviceGUID)}
        {@const Icon = getDeviceIcon(device.deviceType)}
        <div class="device-card" class:current={device.isCurrentDevice}>
          <div class="device-icon">
            <Icon class="h-6 w-6" />
          </div>

          <div class="device-info">
            <div class="device-name">
              {device.friendlyName || 'Dispositivo sin nombre'}
              {#if device.isCurrentDevice}
                <span class="current-badge">Este dispositivo</span>
              {/if}
            </div>

            <div class="device-meta">
              <span class="device-type">{formatDeviceType(device.deviceType)}</span>
              <span class="device-separator">•</span>
              <span class="device-id">ID: {device.shortId}</span>
            </div>

            <div class="device-status">
              {#if device.hasFullKnowledge}
                <CheckCircle2 class="h-3.5 w-3.5 text-green-500" />
                <span class="status-text status-synced">Sincronizado</span>
              {:else}
                <AlertCircle class="h-3.5 w-3.5 text-amber-500" />
                <span class="status-text status-partial">Conocimiento parcial</span>
              {/if}
            </div>
          </div>

          <div class="device-actions">
            {#if !device.isCurrentDevice}
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-destructive"
                onclick={() => handleRemoveDevice(device.deviceGUID)}
                title="Eliminar dispositivo"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>
        </div>
      {:else}
        <div class="devices-empty">
          <Smartphone class="h-12 w-12 text-muted-foreground" />
          <p>No hay dispositivos registrados</p>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Info -->
  <div class="devices-info">
    <p>
      Los dispositivos que aparecen aquí están sincronizados con este presupuesto.
      Cada dispositivo mantiene su propio registro de conocimiento para la sincronización.
    </p>
  </div>
</div>

<style>
  .devices-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: hsl(var(--background));
    overflow: hidden;
  }

  .devices-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid hsl(var(--border));
    background: hsl(var(--card));
  }

  .devices-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .devices-subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
  }

  .devices-list {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .devices-loading,
  .devices-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    gap: 1rem;
  }

  .devices-error p {
    color: hsl(var(--destructive));
  }

  .device-card {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    transition: all 0.15s ease;
  }

  .device-card:hover {
    border-color: hsl(var(--border));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  .device-card.current {
    border-color: hsl(var(--primary) / 0.5);
    background: hsl(var(--primary) / 0.05);
  }

  .device-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: hsl(var(--muted));
    border-radius: 10px;
    color: hsl(var(--muted-foreground));
  }

  .device-card.current .device-icon {
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .device-info {
    flex: 1;
    min-width: 0;
  }

  .device-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: 0.25rem;
  }

  .current-badge {
    display: inline-flex;
    padding: 0.125rem 0.5rem;
    font-size: 0.65rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border-radius: 4px;
  }

  .device-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 0.5rem;
  }

  .device-separator {
    opacity: 0.5;
  }

  .device-status {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .status-text {
    font-size: 0.75rem;
    font-weight: 500;
  }

  .status-synced {
    color: rgb(34, 197, 94);
  }

  .status-partial {
    color: rgb(245, 158, 11);
  }

  .device-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .devices-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
  }

  .devices-empty p {
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .devices-info {
    padding: 1rem 1.25rem;
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.3);
  }

  .devices-info p {
    margin: 0;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
  }
</style>
