<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Chart,
    BarController,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
  } from 'chart.js';
  import { transactions, categories, accounts, payees } from '$lib/stores/budget';
  import { generateReport, REPORT_LABELS } from '$lib/services/report-service';
  import { formatCurrency } from '$lib/utils';
  import { AlertTriangle, CheckCircle, Info } from 'lucide-svelte';
  import type { BenfordDistributionReport } from 'ynab-library';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

  interface Props {
    startDate: string;
    endDate: string;
  }

  let { startDate, endDate }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let chart: Chart | null = null;

  // Get store values
  const txList = $derived($transactions);
  const catList = $derived($categories);
  const accList = $derived($accounts);
  const payeeList = $derived($payees);

  // Generate report
  const report = $derived.by(() => {
    if (!txList.length) return null;

    try {
      return generateReport(
        'benford-distribution',
        { dateRange: { start: startDate, end: endDate } },
        {
          transactions: txList,
          categories: catList,
          accounts: accList,
          payees: payeeList,
        },
      ) as BenfordDistributionReport;
    } catch (e) {
      console.error('Error generating Benford report:', e);
      return null;
    }
  });

  // Update chart
  $effect(() => {
    if (!canvas || !report) return;

    if (chart) {
      chart.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: report.digits.map((d) => d.digit.toString()),
        datasets: [
          {
            label: 'Esperado (Benford)',
            data: report.digits.map((d) => d.expectedPercentage),
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 1,
          },
          {
            label: 'Actual',
            data: report.digits.map((d) => d.actualPercentage),
            backgroundColor: 'rgba(16, 185, 129, 0.5)',
            borderColor: 'rgb(16, 185, 129)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const digit = report.digits[context.dataIndex];
                if (context.datasetIndex === 0) {
                  return `Esperado: ${digit.expectedPercentage.toFixed(1)}%`;
                }
                return `Actual: ${digit.actualPercentage.toFixed(1)}% (${digit.actualCount} transacciones)`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Porcentaje (%)',
            },
          },
          x: {
            title: {
              display: true,
              text: 'Primer Digito',
            },
          },
        },
      },
    });
  });

  onMount(() => {
    return () => {
      if (chart) {
        chart.destroy();
      }
    };
  });
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold">{REPORT_LABELS['benford-distribution']}</h3>
      <p class="text-sm text-muted-foreground">
        Analiza si la distribucion de los primeros digitos de tus transacciones sigue la Ley de Benford
      </p>
    </div>
  </div>

  {#if !report}
    <div class="text-center py-8 text-muted-foreground">
      <Info class="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>No hay datos suficientes para generar el reporte</p>
    </div>
  {:else}
    <!-- Summary Alert -->
    {#if report.summary.conformsToBenford}
      <div class="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-4">
        <CheckCircle class="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
        <div>
          <h4 class="font-medium text-green-700 dark:text-green-300">Distribucion Normal</h4>
          <p class="text-sm text-green-600 dark:text-green-400">
            Tus transacciones siguen la distribucion esperada de Benford (p-value: {report.summary.pValue.toFixed(3)})
          </p>
        </div>
      </div>
    {:else}
      <div class="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
        <AlertTriangle class="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
        <div>
          <h4 class="font-medium text-red-700 dark:text-red-300">Distribucion Inusual</h4>
          <p class="text-sm text-red-600 dark:text-red-400">
            La distribucion de tus transacciones no sigue la Ley de Benford, lo cual podria indicar patrones inusuales.
            Chi-cuadrado: {report.summary.chiSquareStatistic.toFixed(2)}, p-value: {report.summary.pValue.toFixed(3)}
          </p>
        </div>
      </div>
    {/if}

    <!-- Chart -->
    <div class="h-64">
      <canvas bind:this={canvas}></canvas>
    </div>

    <!-- Statistics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{report.summary.totalTransactions}</div>
        <div class="text-sm text-muted-foreground">Transacciones Analizadas</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{report.summary.chiSquareStatistic.toFixed(2)}</div>
        <div class="text-sm text-muted-foreground">Chi-Cuadrado</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{(report.summary.meanAbsoluteDeviation * 100).toFixed(1)}%</div>
        <div class="text-sm text-muted-foreground">Desviacion Media</div>
      </div>
      <div class="bg-muted/50 rounded-lg p-4">
        <div class="text-2xl font-bold">{report.summary.suspiciousDigits.length}</div>
        <div class="text-sm text-muted-foreground">Digitos Sospechosos</div>
      </div>
    </div>

    <!-- Suspicious Digits -->
    {#if report.summary.suspiciousDigits.length > 0}
      <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
        <h4 class="font-medium text-yellow-600 dark:text-yellow-400 mb-2">
          Digitos con Desviacion Significativa
        </h4>
        <div class="flex flex-wrap gap-2">
          {#each report.summary.suspiciousDigits as digit}
            {@const digitData = report.digits.find((d) => d.digit === digit)}
            {#if digitData}
              <div class="bg-yellow-500/20 px-3 py-1 rounded-full text-sm">
                Digito {digit}: {digitData.actualPercentage.toFixed(1)}%
                (esperado: {digitData.expectedPercentage.toFixed(1)}%)
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Digit Details Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b">
            <th class="text-left py-2 px-2">Digito</th>
            <th class="text-right py-2 px-2">Conteo</th>
            <th class="text-right py-2 px-2">% Actual</th>
            <th class="text-right py-2 px-2">% Esperado</th>
            <th class="text-right py-2 px-2">Desviacion</th>
          </tr>
        </thead>
        <tbody>
          {#each report.digits as digit}
            <tr
              class="border-b hover:bg-muted/50 transition-colors"
              class:bg-yellow-100={report.summary.suspiciousDigits.includes(digit.digit)}
              class:dark:bg-yellow-900={report.summary.suspiciousDigits.includes(digit.digit)}
            >
              <td class="py-2 px-2 font-medium">{digit.digit}</td>
              <td class="text-right py-2 px-2">{digit.actualCount}</td>
              <td class="text-right py-2 px-2">{digit.actualPercentage.toFixed(1)}%</td>
              <td class="text-right py-2 px-2">{digit.expectedPercentage.toFixed(1)}%</td>
              <td
                class="text-right py-2 px-2"
                class:text-red-500={digit.deviationPercentage > 50}
                class:text-yellow-500={digit.deviationPercentage > 25 && digit.deviationPercentage <= 50}
                class:text-green-500={digit.deviationPercentage <= 25}
              >
                {digit.deviation > 0 ? '+' : ''}{digit.deviationPercentage.toFixed(1)}%
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Explanation -->
    <div class="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
      <h4 class="font-medium text-foreground mb-2">Sobre la Ley de Benford</h4>
      <p>
        La Ley de Benford establece que en muchos conjuntos de datos naturales, el primer digito
        es mas probable que sea 1 (30.1%) que 9 (4.6%). Esta ley se usa en contabilidad forense
        para detectar posibles anomalias o fraudes en datos financieros.
      </p>
    </div>
  {/if}
</div>
