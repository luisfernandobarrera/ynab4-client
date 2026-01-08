/**
 * Installation Configuration Service
 *
 * Manages persistent installation settings including:
 * - Device GUID (unique identifier for this installation)
 * - Device friendly name
 * - Device type
 *
 * This ensures that when edit mode is enabled, the client
 * properly identifies itself to the YNAB sync system.
 */

import { browser } from '$app/environment';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'ynab4-installation-config';

export interface InstallationConfig {
  // Device identification
  deviceGUID: string;
  deviceShortName: string;
  deviceType: string;

  // Installation metadata
  createdAt: string;
  lastUsedAt: string;
  version: string;

  // User preferences for the installation
  preferredLanguage: string;
}

const DEFAULT_CONFIG: Omit<InstallationConfig, 'deviceGUID' | 'createdAt'> = {
  deviceShortName: 'YNAB4 Client',
  deviceType: 'Desktop',
  lastUsedAt: new Date().toISOString(),
  version: '1.0.0',
  preferredLanguage: 'es',
};

/**
 * Generate a device-friendly name based on browser/platform info
 */
function generateDeviceName(): string {
  if (!browser) return 'YNAB4 Client';

  const ua = navigator.userAgent;
  let platform = 'Desktop';
  let browser_name = 'Browser';

  // Detect platform
  if (ua.includes('Mac')) platform = 'Mac';
  else if (ua.includes('Windows')) platform = 'Windows';
  else if (ua.includes('Linux')) platform = 'Linux';
  else if (ua.includes('iPhone') || ua.includes('iPad')) platform = 'iOS';
  else if (ua.includes('Android')) platform = 'Android';

  // Detect browser
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser_name = 'Chrome';
  else if (ua.includes('Firefox')) browser_name = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser_name = 'Safari';
  else if (ua.includes('Edg')) browser_name = 'Edge';

  return `YNAB4 Client (${platform} ${browser_name})`;
}

/**
 * Get device type based on user agent
 */
function getDeviceType(): string {
  if (!browser) return 'Desktop';

  const ua = navigator.userAgent;

  if (ua.includes('iPhone') || ua.includes('Android') && ua.includes('Mobile')) {
    return 'Mobile';
  }
  if (ua.includes('iPad') || ua.includes('Android')) {
    return 'Tablet';
  }

  return 'Desktop';
}

class InstallationConfigService {
  private config: InstallationConfig | null = null;

  /**
   * Load configuration from localStorage
   * Creates a new configuration if none exists
   */
  load(): InstallationConfig {
    if (this.config) {
      return this.config;
    }

    if (!browser) {
      // Server-side: return a temporary config
      return {
        deviceGUID: '00000000-0000-0000-0000-000000000000',
        deviceShortName: 'Server',
        deviceType: 'Server',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        version: '1.0.0',
        preferredLanguage: 'es',
      };
    }

    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      try {
        this.config = JSON.parse(stored);
        // Update last used timestamp
        this.config!.lastUsedAt = new Date().toISOString();
        this.save();
        return this.config!;
      } catch (e) {
        console.error('[InstallationConfig] Failed to parse stored config:', e);
      }
    }

    // Create new configuration
    this.config = {
      ...DEFAULT_CONFIG,
      deviceGUID: uuidv4(),
      deviceShortName: generateDeviceName(),
      deviceType: getDeviceType(),
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };

    this.save();
    console.log('[InstallationConfig] Created new installation:', this.config.deviceGUID);

    return this.config;
  }

  /**
   * Save configuration to localStorage
   */
  save(): void {
    if (!browser || !this.config) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.error('[InstallationConfig] Failed to save config:', e);
    }
  }

  /**
   * Get the device GUID for this installation
   */
  getDeviceGUID(): string {
    const config = this.load();
    return config.deviceGUID;
  }

  /**
   * Get the device friendly name
   */
  getDeviceName(): string {
    const config = this.load();
    return config.deviceShortName;
  }

  /**
   * Get the device type
   */
  getDeviceType(): string {
    const config = this.load();
    return config.deviceType;
  }

  /**
   * Update the device friendly name
   */
  setDeviceName(name: string): void {
    const config = this.load();
    config.deviceShortName = name;
    this.save();
  }

  /**
   * Update the device type
   */
  setDeviceType(type: string): void {
    const config = this.load();
    config.deviceType = type;
    this.save();
  }

  /**
   * Reset the installation (generates new GUID)
   * WARNING: This will make this installation appear as a new device
   */
  reset(): InstallationConfig {
    if (!browser) {
      throw new Error('Cannot reset installation on server');
    }

    this.config = {
      ...DEFAULT_CONFIG,
      deviceGUID: uuidv4(),
      deviceShortName: generateDeviceName(),
      deviceType: getDeviceType(),
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };

    this.save();
    console.log('[InstallationConfig] Reset installation, new GUID:', this.config.deviceGUID);

    return this.config;
  }

  /**
   * Get full configuration
   */
  getConfig(): InstallationConfig {
    return this.load();
  }

  /**
   * Check if this is a fresh installation (created in this session)
   */
  isFreshInstallation(): boolean {
    const config = this.load();
    const created = new Date(config.createdAt);
    const now = new Date();
    // Consider fresh if created less than 1 minute ago
    return (now.getTime() - created.getTime()) < 60000;
  }
}

// Singleton instance
export const installationConfig = new InstallationConfigService();
