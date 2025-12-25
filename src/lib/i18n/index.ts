import { browser } from '$app/environment';
import { writable, derived, readable } from 'svelte/store';

// Supported locales (only English and Spanish for now)
export const supportedLocales = ['en', 'es'] as const;
export type Locale = (typeof supportedLocales)[number];

// Locales as a readable store for reactivity
export const locales = readable(supportedLocales);

// Default locale
export const defaultLocale: Locale = 'en';

// Current locale store
function createLocaleStore() {
  const stored = browser ? localStorage.getItem('locale') : null;
  const initial = (stored as Locale) || defaultLocale;
  
  const { subscribe, set } = writable<Locale>(initial);
  
  return {
    subscribe,
    set: (value: Locale) => {
      if (browser) {
        localStorage.setItem('locale', value);
      }
      set(value);
    },
  };
}

export const locale = createLocaleStore();

// Helper to set locale
export function setLocale(newLocale: string): void {
  if (supportedLocales.includes(newLocale as Locale)) {
    locale.set(newLocale as Locale);
  }
}

// Translations
import en from './locales/en.json';
import es from './locales/es.json';

const translations: Record<Locale, Record<string, unknown>> = { en, es };

// Get translated string
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let current: unknown = obj;
  
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path; // Return key if translation not found
    }
  }
  
  return typeof current === 'string' ? current : path;
}

// Translation function store
export const t = derived(locale, ($locale) => {
  return (key: string, params?: Record<string, string | number>): string => {
    let translation = getNestedValue(translations[$locale] || translations[defaultLocale], key);
    
    // Replace parameters
    if (params) {
      for (const [param, value] of Object.entries(params)) {
        translation = translation.replace(new RegExp(`{${param}}`, 'g'), String(value));
      }
    }
    
    return translation;
  };
});

// Locale display names
export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
};
