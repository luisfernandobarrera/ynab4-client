<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';

  let status = $state<'processing' | 'success' | 'error'>('processing');
  let errorMessage = $state('');

  onMount(async () => {
    try {
      const success = await DropboxAuth.handleCallback();
      if (success) {
        status = 'success';
        // Redirect to home after successful auth
        setTimeout(() => goto('/'), 1500);
      } else {
        status = 'error';
        errorMessage = 'Failed to authenticate with Dropbox';
      }
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : 'Unknown error';
    }
  });
</script>

<div class="callback-container">
  {#if status === 'processing'}
    <div class="status processing">
      <div class="spinner"></div>
      <h2>Connecting to Dropbox...</h2>
      <p>Please wait while we complete the authentication.</p>
    </div>
  {:else if status === 'success'}
    <div class="status success">
      <div class="icon">✓</div>
      <h2>Connected!</h2>
      <p>Redirecting to your budgets...</p>
    </div>
  {:else}
    <div class="status error">
      <div class="icon">✗</div>
      <h2>Connection Failed</h2>
      <p>{errorMessage}</p>
      <a href="/" class="retry-link">Go back and try again</a>
    </div>
  {/if}
</div>

<style>
  .callback-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background: var(--background, #0a0a0a);
    color: var(--foreground, #fafafa);
  }

  .status {
    text-align: center;
    padding: 2rem;
  }

  .status h2 {
    margin: 1rem 0 0.5rem;
    font-size: 1.5rem;
  }

  .status p {
    color: var(--muted-foreground, #a1a1aa);
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid var(--border, #27272a);
    border-top-color: var(--primary, #3b82f6);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .icon {
    font-size: 3rem;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
  }

  .success .icon {
    background: #22c55e20;
    color: #22c55e;
  }

  .error .icon {
    background: #ef444420;
    color: #ef4444;
  }

  .retry-link {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: var(--primary, #3b82f6);
    color: white;
    border-radius: 0.375rem;
    text-decoration: none;
  }

  .retry-link:hover {
    opacity: 0.9;
  }
</style>

