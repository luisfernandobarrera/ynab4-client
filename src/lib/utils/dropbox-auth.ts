/**
 * Dropbox OAuth helper for browser-based authentication using PKCE
 * 
 * Setup:
 * 1. Create a Dropbox app at https://www.dropbox.com/developers/apps
 * 2. Set your app key in .env: PUBLIC_DROPBOX_APP_KEY=your_key_here
 * 3. Add redirect URI in Dropbox app settings
 */

import { browser } from '$app/environment';

// Get app key from environment variable
const DROPBOX_CLIENT_ID = import.meta.env.PUBLIC_DROPBOX_APP_KEY || '';
const REDIRECT_URI = browser ? window.location.origin : '';

// Check if running in Tauri
const IS_TAURI = browser && typeof (window as { __TAURI__?: unknown }).__TAURI__ !== 'undefined';

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'dropbox_access_token',
  REFRESH_TOKEN: 'dropbox_refresh_token',
  TOKEN_EXPIRY: 'dropbox_token_expiry',
  CODE_VERIFIER: 'dropbox_code_verifier',
  AUTH_STATE: 'dropbox_auth_state',
} as const;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface AuthState {
  returnTo: string;
  timestamp: number;
}

export class DropboxAuth {
  /**
   * Generate a random string for PKCE code verifier
   */
  static generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate code challenge from verifier (SHA-256)
   */
  static async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Start OAuth flow with PKCE - redirects user to Dropbox
   */
  static async authorize(): Promise<void> {
    if (!browser) return;
    
    console.log('[DropboxAuth] Starting authorization flow...', IS_TAURI ? '(Tauri)' : '(Browser)');

    // TODO: Add Tauri support via TauriDropbox

    // Browser flow
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    // Store verifier for token exchange
    localStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
    localStorage.setItem(
      STORAGE_KEYS.AUTH_STATE,
      JSON.stringify({
        returnTo: window.location.pathname,
        timestamp: Date.now(),
      } satisfies AuthState)
    );

    const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', DROPBOX_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('token_access_type', 'offline');

    console.log('[DropboxAuth] Redirecting to Dropbox...');
    window.location.href = authUrl.toString();
  }

  /**
   * Handle OAuth callback - exchanges code for token using PKCE
   */
  static async handleCallback(): Promise<boolean> {
    if (!browser) return false;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    // Handle error from Dropbox
    if (error) {
      console.error('[DropboxAuth] OAuth error:', error, errorDescription);
      this.cleanupAuthState();
      window.history.replaceState({}, document.title, window.location.pathname);
      return false;
    }

    // No code in URL
    if (!code) {
      return this.isAuthenticated();
    }

    console.log('[DropboxAuth] Received authorization code, exchanging for token...');

    // Get code verifier
    const codeVerifier = localStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);

    if (!codeVerifier) {
      console.error('[DropboxAuth] Code verifier not found - cannot complete authentication');
      window.history.replaceState({}, document.title, window.location.pathname);
      return false;
    }

    try {
      // Exchange code for token
      const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code,
          grant_type: 'authorization_code',
          client_id: DROPBOX_CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
        }),
      });

      const data: TokenResponse = await response.json();

      if (data.access_token) {
        console.log('[DropboxAuth] Token received successfully');

        // Store tokens
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);

        if (data.refresh_token) {
          localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token);
        }

        if (data.expires_in) {
          const expiry = Date.now() + data.expires_in * 1000;
          localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiry.toString());
        }

        // Clean up auth state
        this.cleanupAuthState();

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);

        console.log('[DropboxAuth] Authentication complete');
        return true;
      } else {
        console.error('[DropboxAuth] Token exchange failed:', data);
        this.cleanupAuthState();
        window.history.replaceState({}, document.title, window.location.pathname);
        return false;
      }
    } catch (error) {
      console.error('[DropboxAuth] Error exchanging code for token:', error);
      this.cleanupAuthState();
      window.history.replaceState({}, document.title, window.location.pathname);
      return false;
    }
  }

  /**
   * Clean up temporary auth state
   */
  static cleanupAuthState(): void {
    if (!browser) return;
    localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
    localStorage.removeItem(STORAGE_KEYS.AUTH_STATE);
  }

  /**
   * Get stored access token
   */
  static async getAccessToken(): Promise<string | null> {
    if (!browser) return null;

    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

    // Check if token might be expired
    const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
    if (expiry && Date.now() > parseInt(expiry)) {
      console.warn('[DropboxAuth] Token may be expired');
      // TODO: Implement token refresh
    }

    return token;
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    if (!browser) return false;
    return !!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  }

  /**
   * Sign out - clear all tokens
   */
  static signOut(): void {
    if (!browser) return;
    console.log('[DropboxAuth] Signing out...');
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
    this.cleanupAuthState();
  }

  /**
   * Check if running in Tauri
   */
  static isTauri(): boolean {
    return IS_TAURI;
  }

  /**
   * Debug: Show current auth state
   */
  static debugState() {
    if (!browser) return null;
    return {
      hasAccessToken: !!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
      hasRefreshToken: !!localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
      tokenExpiry: localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY),
      hasCodeVerifier: !!localStorage.getItem(STORAGE_KEYS.CODE_VERIFIER),
      isAuthenticated: this.isAuthenticated(),
      isTauri: IS_TAURI,
    };
  }
}

