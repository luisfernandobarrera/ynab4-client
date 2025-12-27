import { writable, get } from 'svelte/store';
import { budgetInfo } from './budget';

export interface CategoryClassification {
  label: string;
  sortOrder: number;
  masterCategoryIds: string[];
}

export interface PayeeClassification {
  label: string;
  sortOrder: number;
  payeeIds: string[];
}

export interface ClientConfig {
  version: number;
  categoryClassifications: CategoryClassification[];
  payeeClassifications: PayeeClassification[];
  lastModified: string;
}

const DEFAULT_CONFIG: ClientConfig = {
  version: 1,
  categoryClassifications: [],
  payeeClassifications: [],
  lastModified: new Date().toISOString(),
};

function getStorageKey(): string {
  const info = get(budgetInfo);
  return `ynab-client-config-${info?.budgetName || 'default'}`;
}

function createClassificationsStore() {
  const { subscribe, set, update } = writable<ClientConfig>(DEFAULT_CONFIG);

  return {
    subscribe,
    
    load: () => {
      const key = getStorageKey();
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const config = JSON.parse(stored) as ClientConfig;
          set({ ...DEFAULT_CONFIG, ...config });
        } else {
          set({ ...DEFAULT_CONFIG });
        }
      } catch (e) {
        console.warn('[Classifications] Error loading config:', e);
        set({ ...DEFAULT_CONFIG });
      }
    },

    save: (config: ClientConfig) => {
      const key = getStorageKey();
      config.lastModified = new Date().toISOString();
      try {
        localStorage.setItem(key, JSON.stringify(config));
        set(config);
      } catch (e) {
        console.error('[Classifications] Error saving config:', e);
      }
    },

    setCategoryClassifications: (classifications: CategoryClassification[]) => {
      update(config => {
        const newConfig = { 
          ...config, 
          categoryClassifications: classifications,
          lastModified: new Date().toISOString()
        };
        const key = getStorageKey();
        try {
          localStorage.setItem(key, JSON.stringify(newConfig));
        } catch (e) {
          console.error('[Classifications] Error saving:', e);
        }
        return newConfig;
      });
    },

    setPayeeClassifications: (classifications: PayeeClassification[]) => {
      update(config => {
        const newConfig = { 
          ...config, 
          payeeClassifications: classifications,
          lastModified: new Date().toISOString()
        };
        const key = getStorageKey();
        try {
          localStorage.setItem(key, JSON.stringify(newConfig));
        } catch (e) {
          console.error('[Classifications] Error saving:', e);
        }
        return newConfig;
      });
    },

    reset: () => {
      set({ ...DEFAULT_CONFIG });
    }
  };
}

export const clientConfig = createClassificationsStore();

