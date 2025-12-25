<script lang="ts">
  import { AlertCircle, Plus, CalendarDays } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import ScheduledCard from './scheduled-card.svelte';
  import { scheduledTransactions, payees } from '$lib/stores/budget';
  import { isMobile, addToast } from '$lib/stores/ui';

  interface Props {
    onAdd?: () => void;
  }

  let { onAdd }: Props = $props();

  // Sort by next date
  const sortedTransactions = $derived(
    [...$scheduledTransactions].sort((a, b) => a.dateNext.localeCompare(b.dateNext))
  );

  // Group by status
  const overdueTransactions = $derived(
    sortedTransactions.filter((t) => {
      const today = new Date().toISOString().split('T')[0];
      return t.dateNext <= today;
    })
  );

  const upcomingTransactions = $derived(
    sortedTransactions.filter((t) => {
      const today = new Date().toISOString().split('T')[0];
      return t.dateNext > today;
    })
  );

  function handleEnter(txId: string) {
    const tx = $scheduledTransactions.find((t) => t.entityId === txId);
    const payee = tx ? $payees.find((p) => p.id === tx.payeeId) : null;
    console.log('Enter transaction:', txId);
    addToast({
      type: 'success',
      message: `Entered: ${payee?.name || 'Transaction'}`,
    });
  }

  function handleSkip(txId: string) {
    console.log('Skip transaction:', txId);
    addToast({
      type: 'info',
      message: 'Skipped to next occurrence',
    });
  }

  function handleEdit(txId: string) {
    console.log('Edit transaction:', txId);
    // TODO: Open edit dialog
  }

  function handleDelete(txId: string) {
    console.log('Delete transaction:', txId);
    // TODO: Confirm and delete
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="sticky top-0 z-10 bg-background border-b p-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-xl font-heading font-semibold">Scheduled Transactions</h2>
        <p class="text-sm text-muted-foreground">
          {$scheduledTransactions.length} scheduled
        </p>
      </div>
      {#if !$isMobile && onAdd}
        <Button onclick={onAdd}>
          <Plus class="mr-2 h-4 w-4" />
          New Scheduled
        </Button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4 space-y-6">
    {#if $scheduledTransactions.length === 0}
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <CalendarDays class="h-12 w-12 text-muted-foreground mb-4" />
        <p class="text-muted-foreground">No scheduled transactions</p>
        {#if onAdd}
          <Button variant="link" onclick={onAdd}>
            Create your first scheduled transaction
          </Button>
        {/if}
      </div>
    {:else}
      <!-- Overdue Section -->
      {#if overdueTransactions.length > 0}
        <div>
          <div class="flex items-center gap-2 mb-3">
            <AlertCircle class="h-5 w-5 text-destructive" />
            <h3 class="font-semibold text-destructive">
              Overdue ({overdueTransactions.length})
            </h3>
          </div>
          <Card class="border-destructive/50">
            <CardContent class="p-0 divide-y">
              {#each overdueTransactions as tx (tx.entityId)}
                <div class="p-4">
                  <ScheduledCard
                    transaction={tx}
                    onEnter={() => handleEnter(tx.entityId)}
                    onSkip={() => handleSkip(tx.entityId)}
                    onEdit={() => handleEdit(tx.entityId)}
                    onDelete={() => handleDelete(tx.entityId)}
                  />
                </div>
              {/each}
            </CardContent>
          </Card>
        </div>
      {/if}

      <!-- Upcoming Section -->
      {#if upcomingTransactions.length > 0}
        <div>
          <h3 class="font-semibold mb-3">
            Upcoming ({upcomingTransactions.length})
          </h3>
          <div class="space-y-3">
            {#each upcomingTransactions as tx (tx.entityId)}
              <ScheduledCard
                transaction={tx}
                onEnter={() => handleEnter(tx.entityId)}
                onSkip={() => handleSkip(tx.entityId)}
                onEdit={() => handleEdit(tx.entityId)}
                onDelete={() => handleDelete(tx.entityId)}
              />
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Mobile FAB -->
  {#if $isMobile && onAdd}
    <button
      class="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-transform"
      onclick={onAdd}
    >
      <Plus class="h-6 w-6" />
    </button>
  {/if}
</div>

