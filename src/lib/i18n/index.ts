import { browser } from '$app/environment';
import { writable, derived, readable } from 'svelte/store';

// Supported locales
export const supportedLocales = ['en', 'es', 'de', 'fr', 'ja', 'ko', 'nl', 'pt', 'ru', 'zh'] as const;
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
import de from './locales/de.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import nl from './locales/nl.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';

const translations: Record<Locale, Record<string, unknown>> = {
  en, es, de, fr, ja, ko, nl, pt, ru, zh
};

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
  de: 'Deutsch',
  fr: 'Français',
  ja: '日本語',
  ko: '한국어',
  nl: 'Nederlands',
  pt: 'Português',
  ru: 'Русский',
  zh: '中文',
};

