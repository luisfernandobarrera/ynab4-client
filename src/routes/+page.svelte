<script lang="ts">
  import { onMount } from 'svelte';
  import { FolderOpen, Cloud, HardDrive } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card';
  import { budgetInfo, currentView } from '$lib/stores/budget';
  import { DropboxAuth } from '$lib/utils/dropbox-auth';

  let isDropboxConnected = $state(false);

  onMount(async () => {
    // Check Dropbox connection
    isDropboxConnected = DropboxAuth.isAuthenticated();
    
    // Handle OAuth callback
    await DropboxAuth.handleCallback();
    isDropboxConnected = DropboxAuth.isAuthenticated();
  });

  async function connectDropbox() {
    await DropboxAuth.authorize();
  }

  function disconnectDropbox() {
    DropboxAuth.signOut();
    isDropboxConnected = false;
  }
</script>

<div class="container mx-auto p-6 max-w-4xl">
  {#if !$budgetInfo.client}
    <!-- No budget loaded - show welcome screen -->
    <div class="space-y-8">
      <div class="text-center space-y-4">
        <h1 class="text-4xl font-heading font-bold">Welcome to YNAB4 Client</h1>
        <p class="text-lg text-muted-foreground">
          A modern client for your YNAB4 budgets
        </p>
      </div>

      <div class="grid gap-6 md:grid-cols-2">
        <!-- Dropbox -->
        <Card>
          <CardHeader>
            <div class="flex items-center gap-3">
              <div class="rounded-lg bg-blue-500/10 p-2">
                <Cloud class="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <CardTitle>Dropbox</CardTitle>
                <CardDescription>Sync budgets from Dropbox</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            {#if isDropboxConnected}
              <div class="flex items-center gap-2 text-sm text-ynab-green">
                <span class="h-2 w-2 rounded-full bg-ynab-green"></span>
                Connected
              </div>
              <div class="flex gap-2">
                <Button class="flex-1">
                  <FolderOpen class="mr-2 h-4 w-4" />
                  Select Budget
                </Button>
                <Button variant="outline" onclick={disconnectDropbox}>
                  Disconnect
                </Button>
              </div>
            {:else}
              <p class="text-sm text-muted-foreground">
                Connect to Dropbox to access your YNAB4 budgets synced in the cloud.
              </p>
              <Button class="w-full" onclick={connectDropbox}>
                <Cloud class="mr-2 h-4 w-4" />
                Connect Dropbox
              </Button>
            {/if}
          </CardContent>
        </Card>

        <!-- Local Files -->
        <Card>
          <CardHeader>
            <div class="flex items-center gap-3">
              <div class="rounded-lg bg-orange-500/10 p-2">
                <HardDrive class="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <CardTitle>Local Files</CardTitle>
                <CardDescription>Open budgets from your device</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            <p class="text-sm text-muted-foreground">
              Open a .ynab4 budget folder from your local device.
            </p>
            <Button variant="outline" class="w-full">
              <FolderOpen class="mr-2 h-4 w-4" />
              Open Local Budget
            </Button>
          </CardContent>
        </Card>
      </div>

      <!-- Features -->
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h2 class="text-xl font-heading font-semibold">Features</h2>
        <ul class="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <li class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-ynab-green"></span>
            Full YNAB4 compatibility
          </li>
          <li class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-ynab-green"></span>
            Read and write budgets
          </li>
          <li class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-ynab-green"></span>
            Dropbox sync support
          </li>
          <li class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-ynab-green"></span>
            Works offline
          </li>
          <li class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-ynab-green"></span>
            Mobile-first design
          </li>
          <li class="flex items-center gap-2">
            <span class="h-1.5 w-1.5 rounded-full bg-ynab-green"></span>
            Cross-platform (Web, Android, iOS, Desktop)
          </li>
        </ul>
      </div>
    </div>
  {:else}
    <!-- Budget loaded - show current view -->
    <div class="space-y-4">
      {#if $currentView === 'budget'}
        <h2 class="text-2xl font-heading font-bold">Budget</h2>
        <p class="text-muted-foreground">Budget view coming soon...</p>
      {:else if $currentView === 'transactions'}
        <h2 class="text-2xl font-heading font-bold">Transactions</h2>
        <p class="text-muted-foreground">Transactions view coming soon...</p>
      {:else if $currentView === 'scheduled'}
        <h2 class="text-2xl font-heading font-bold">Scheduled Transactions</h2>
        <p class="text-muted-foreground">Scheduled view coming soon...</p>
      {:else if $currentView === 'reports'}
        <h2 class="text-2xl font-heading font-bold">Reports</h2>
        <p class="text-muted-foreground">Reports view coming soon...</p>
      {:else if $currentView === 'settings'}
        <h2 class="text-2xl font-heading font-bold">Settings</h2>
        <p class="text-muted-foreground">Settings view coming soon...</p>
      {:else}
        <p class="text-muted-foreground">Select a view from the sidebar</p>
      {/if}
    </div>
  {/if}
</div>
