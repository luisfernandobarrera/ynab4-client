<script lang="ts">
  import { X, Calculator, Calendar, CreditCard } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import {
    calculateMSI,
    validateMSIConfig,
    MSI_MONTH_OPTIONS,
    type MSIConfig,
    type MSIResult,
  } from '$lib/services/msi-service';
  import { accounts, categories } from '$lib/stores/budget';
  import { cn, formatCurrency } from '$lib/utils';

  interface Props {
    open?: boolean;
    transaction?: {
      date: string;
      payeeId: string | null;
      payeeName: string;
      categoryId: string | null;
      categoryName: string;
      accountId: string;
      amount: number;
      memo: string;
    } | null;
    onConfirm?: (result: MSIResult) => void;
    onClose?: () => void;
  }

  let { open = $bindable(false), transaction = null, onConfirm, onClose }: Props = $props();

  // Form state
  let months = $state(12);
  let startDate = $state(new Date().toISOString().split('T')[0]);
  let counterCategoryId = $state('');

  // Reset when opened
  $effect(() => {
    if (open && transaction) {
      months = 12;
      // Default start date to next month
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      startDate = nextMonth.toISOString().split('T')[0];
      counterCategoryId = '';
    }
  });

  // Calculate preview
  const preview = $derived(() => {
    if (!transaction) return null;

    const config: MSIConfig = {
      originalTransaction: transaction,
      months,
      startDate,
      counterCategoryId: counterCategoryId || undefined,
    };

    const validation = validateMSIConfig(config);
    if (!validation.valid) {
      return { error: validation.errors[0] };
    }

    return calculateMSI(config);
  });

  function handleConfirm() {
    const result = preview();
    if (result && !('error' in result)) {
      onConfirm?.(result);
      open = false;
      onClose?.();
    }
  }

  function handleClose() {
    open = false;
    onClose?.();
  }
</script>

{#if open && transaction}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <Card class="w-full max-w-lg">
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle class="flex items-center gap-2">
            <CreditCard class="h-5 w-5" />
            Meses Sin Intereses (MSI)
          </CardTitle>
          <Button variant="ghost" size="icon" onclick={handleClose}>
            <X class="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent class="space-y-6">
        <!-- Original transaction info -->
        <div class="rounded-lg bg-muted p-4 space-y-2">
          <p class="text-sm text-muted-foreground">Transacción original</p>
          <div class="flex items-center justify-between">
            <span class="font-medium">{transaction.payeeName || 'Sin beneficiario'}</span>
            <span class="amount text-lg font-bold text-ynab-red">
              {formatCurrency(Math.abs(transaction.amount))}
            </span>
          </div>
          <p class="text-sm text-muted-foreground">
            {transaction.categoryName || 'Sin categoría'} • {transaction.date}
          </p>
        </div>

        <!-- MSI options -->
        <div class="space-y-4">
          <!-- Months selection -->
          <fieldset>
            <legend class="text-sm font-medium mb-2 block">Número de meses</legend>
            <div class="grid grid-cols-3 gap-2">
              {#each MSI_MONTH_OPTIONS as option}
                <button
                  class={cn(
                    'rounded-lg border p-3 text-center transition-colors',
                    months === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:border-primary/50'
                  )}
                  onclick={() => (months = option.value)}
                >
                  <span class="text-lg font-semibold">{option.value}</span>
                  <span class="text-xs block">meses</span>
                </button>
              {/each}
            </div>
          </fieldset>

          <!-- Start date -->
          <div>
            <label for="msi-start-date" class="text-sm font-medium mb-2 block">
              <Calendar class="h-4 w-4 inline mr-1" />
              Fecha primer pago
            </label>
            <Input id="msi-start-date" type="date" bind:value={startDate} />
          </div>

          <!-- Counter category (optional) -->
          <div>
            <label for="msi-counter-category" class="text-sm font-medium mb-2 block">
              Categoría para contrapartida (opcional)
            </label>
            <select
              id="msi-counter-category"
              class="w-full h-10 rounded-md border border-input bg-background px-3"
              bind:value={counterCategoryId}
            >
              <option value="">Usar misma categoría</option>
              {#each $categories as cat (cat.entityId)}
                <option value={cat.entityId}>{cat.name}</option>
              {/each}
            </select>
            <p class="text-xs text-muted-foreground mt-1">
              La contrapartida anula el gasto original en tu presupuesto
            </p>
          </div>
        </div>

        <!-- Preview -->
        {@const result = preview()}
        {#if result}
          {#if 'error' in result}
            <div class="rounded-lg bg-destructive/10 border border-destructive p-4 text-sm text-destructive">
              {result.error}
            </div>
          {:else}
            <div class="rounded-lg border p-4 space-y-3">
              <p class="text-sm font-medium flex items-center gap-2">
                <Calculator class="h-4 w-4" />
                Vista previa
              </p>

              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span>Pago mensual:</span>
                  <span class="amount font-semibold">{formatCurrency(result.monthlyAmount)}</span>
                </div>
                <div class="flex justify-between">
                  <span>Total a pagar:</span>
                  <span class="amount font-semibold">{formatCurrency(result.totalAmount)}</span>
                </div>
                <div class="flex justify-between text-muted-foreground">
                  <span>Número de pagos:</span>
                  <span>{months}</span>
                </div>
              </div>

              <div class="border-t pt-3 space-y-2">
                <p class="text-xs font-medium text-muted-foreground uppercase">Se creará:</p>
                <div class="space-y-1 text-sm">
                  <div class="flex items-center gap-2">
                    <Badge variant="outline" class="bg-ynab-green/10">+</Badge>
                    <span>Contrapartida: {formatCurrency(result.totalAmount)}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <Badge variant="outline" class="bg-ynab-orange/10">📅</Badge>
                    <span>Pago recurrente: {formatCurrency(result.monthlyAmount)}/mes x{months}</span>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        {/if}
      </CardContent>

      <CardFooter class="flex justify-end gap-2">
        <Button variant="outline" onclick={handleClose}>
          Cancelar
        </Button>
        <Button
          onclick={handleConfirm}
          disabled={!preview() || (preview() && 'error' in preview()!)}
        >
          Crear MSI
        </Button>
      </CardFooter>
    </Card>
  </div>
{/if}

