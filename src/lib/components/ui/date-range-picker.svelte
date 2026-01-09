<script lang="ts">
  import { Calendar, ChevronLeft, ChevronRight, Check, ArrowLeftRight } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';

  type DatePreset =
    | 'today'
    | 'yesterday'
    | 'thisWeek'
    | 'lastWeek'
    | 'thisMonth'
    | 'lastMonth'
    | 'last7Days'
    | 'last30Days'
    | 'last90Days'
    | 'last6Months'
    | 'last12Months'
    | 'thisQuarter'
    | 'lastQuarter'
    | 'thisYear'
    | 'lastYear'
    | 'yearToDate'
    | 'allTime'
    | 'custom';

  type ComparisonType =
    | 'none'
    | 'previousPeriod'
    | 'previousMonth'
    | 'previousYear'
    | 'sameMonthLastYear';

  interface DateRange {
    start: string;
    end: string;
  }

  interface Props {
    startDate?: string;
    endDate?: string;
    preset?: DatePreset;
    comparison?: ComparisonType;
    comparisonStart?: string;
    comparisonEnd?: string;
    showComparison?: boolean;
    onRangeChange?: (range: DateRange, preset: DatePreset) => void;
    onComparisonChange?: (comparison: ComparisonType, range?: DateRange) => void;
  }

  let {
    startDate = $bindable(),
    endDate = $bindable(),
    preset = $bindable('thisMonth'),
    comparison = $bindable<ComparisonType>('none'),
    comparisonStart = $bindable(),
    comparisonEnd = $bindable(),
    showComparison = false,
    onRangeChange,
    onComparisonChange,
  }: Props = $props();

  let isOpen = $state(false);
  let view = $state<'presets' | 'calendar' | 'comparison'>('presets');
  let calendarYear = $state(new Date().getFullYear());
  let calendarMonth = $state(new Date().getMonth());
  let selectingEnd = $state(false);
  let hoverDate = $state<string | null>(null);

  // Month names in Spanish
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

  // Preset definitions
  const presets: Array<{ id: DatePreset; label: string; group: string }> = [
    { id: 'today', label: 'Hoy', group: 'quick' },
    { id: 'yesterday', label: 'Ayer', group: 'quick' },
    { id: 'thisWeek', label: 'Esta Semana', group: 'quick' },
    { id: 'lastWeek', label: 'Semana Pasada', group: 'quick' },
    { id: 'thisMonth', label: 'Este Mes', group: 'months' },
    { id: 'lastMonth', label: 'Mes Pasado', group: 'months' },
    { id: 'last7Days', label: 'Últimos 7 Días', group: 'months' },
    { id: 'last30Days', label: 'Últimos 30 Días', group: 'months' },
    { id: 'last90Days', label: 'Últimos 90 Días', group: 'months' },
    { id: 'last6Months', label: 'Últimos 6 Meses', group: 'extended' },
    { id: 'last12Months', label: 'Últimos 12 Meses', group: 'extended' },
    { id: 'yearToDate', label: 'Año Hasta Hoy', group: 'extended' },
    { id: 'thisQuarter', label: 'Este Trimestre', group: 'quarters' },
    { id: 'lastQuarter', label: 'Trimestre Pasado', group: 'quarters' },
    { id: 'thisYear', label: 'Este Año', group: 'years' },
    { id: 'lastYear', label: 'Año Pasado', group: 'years' },
    { id: 'allTime', label: 'Todo', group: 'years' },
    { id: 'custom', label: 'Personalizado', group: 'custom' },
  ];

  const comparisonOptions: Array<{ id: ComparisonType; label: string }> = [
    { id: 'none', label: 'Sin comparación' },
    { id: 'previousPeriod', label: 'Período anterior' },
    { id: 'previousMonth', label: 'Mes anterior' },
    { id: 'previousYear', label: 'Año anterior' },
    { id: 'sameMonthLastYear', label: 'Mismo mes, año pasado' },
  ];

  // Format date for display
  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${day} ${monthNames[month - 1].substring(0, 3)} ${year}`;
  }

  // Get display label for current selection
  const displayLabel = $derived(() => {
    if (preset === 'custom' && startDate && endDate) {
      if (startDate === endDate) {
        return formatDate(startDate);
      }
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    }
    const found = presets.find(p => p.id === preset);
    return found?.label || 'Seleccionar';
  });

  // Calculate preset date range
  function calculatePresetRange(presetId: DatePreset, ref = new Date()): DateRange {
    const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

    switch (presetId) {
      case 'today':
        return { start: formatDateStr(ref), end: formatDateStr(ref) };

      case 'yesterday': {
        const d = new Date(ref);
        d.setDate(d.getDate() - 1);
        return { start: formatDateStr(d), end: formatDateStr(d) };
      }

      case 'thisWeek': {
        const dayOfWeek = ref.getDay();
        const monday = new Date(ref);
        monday.setDate(ref.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { start: formatDateStr(monday), end: formatDateStr(sunday) };
      }

      case 'lastWeek': {
        const d = new Date(ref);
        d.setDate(d.getDate() - 7);
        return calculatePresetRange('thisWeek', d);
      }

      case 'thisMonth': {
        const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
        const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
        return { start: formatDateStr(start), end: formatDateStr(end) };
      }

      case 'lastMonth': {
        const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
        return calculatePresetRange('thisMonth', d);
      }

      case 'last7Days': {
        const end = new Date(ref);
        const start = new Date(ref);
        start.setDate(start.getDate() - 6);
        return { start: formatDateStr(start), end: formatDateStr(end) };
      }

      case 'last30Days': {
        const end = new Date(ref);
        const start = new Date(ref);
        start.setDate(start.getDate() - 29);
        return { start: formatDateStr(start), end: formatDateStr(end) };
      }

      case 'last90Days': {
        const end = new Date(ref);
        const start = new Date(ref);
        start.setDate(start.getDate() - 89);
        return { start: formatDateStr(start), end: formatDateStr(end) };
      }

      case 'last6Months': {
        const end = new Date(ref);
        const start = new Date(ref);
        start.setMonth(start.getMonth() - 6);
        start.setDate(1);
        return { start: formatDateStr(start), end: formatDateStr(end) };
      }

      case 'last12Months': {
        const end = new Date(ref);
        const start = new Date(ref);
        start.setFullYear(start.getFullYear() - 1);
        start.setDate(1);
        return { start: formatDateStr(start), end: formatDateStr(end) };
      }

      case 'thisQuarter': {
        const quarter = Math.floor(ref.getMonth() / 3);
        const start = new Date(ref.getFullYear(), quarter * 3, 1);
        const end = new Date(ref.getFullYear(), quarter * 3 + 3, 0);
        return { start: formatDateStr(start), end: formatDateStr(end) };
      }

      case 'lastQuarter': {
        const d = new Date(ref);
        d.setMonth(d.getMonth() - 3);
        return calculatePresetRange('thisQuarter', d);
      }

      case 'thisYear': {
        const start = new Date(ref.getFullYear(), 0, 1);
        const end = new Date(ref.getFullYear(), 11, 31);
        return { start: formatDateStr(start), end: formatDateStr(end) };
      }

      case 'lastYear': {
        const year = ref.getFullYear() - 1;
        return { start: `${year}-01-01`, end: `${year}-12-31` };
      }

      case 'yearToDate': {
        const start = new Date(ref.getFullYear(), 0, 1);
        return { start: formatDateStr(start), end: formatDateStr(ref) };
      }

      case 'allTime':
        return { start: '2000-01-01', end: formatDateStr(ref) };

      default:
        return calculatePresetRange('thisMonth', ref);
    }
  }

  // Calculate comparison range
  function calculateComparisonRange(primaryRange: DateRange, compType: ComparisonType): DateRange | undefined {
    if (compType === 'none') return undefined;

    const startDate = new Date(primaryRange.start);
    const endDate = new Date(primaryRange.end);
    const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

    switch (compType) {
      case 'previousPeriod': {
        const newEnd = new Date(startDate);
        newEnd.setDate(newEnd.getDate() - 1);
        const newStart = new Date(newEnd);
        newStart.setDate(newStart.getDate() - daysDiff);
        return { start: formatDateStr(newStart), end: formatDateStr(newEnd) };
      }

      case 'previousMonth': {
        const newStart = new Date(startDate);
        newStart.setMonth(newStart.getMonth() - 1);
        const newEnd = new Date(endDate);
        newEnd.setMonth(newEnd.getMonth() - 1);
        return { start: formatDateStr(newStart), end: formatDateStr(newEnd) };
      }

      case 'previousYear': {
        const newStart = new Date(startDate);
        newStart.setFullYear(newStart.getFullYear() - 1);
        const newEnd = new Date(endDate);
        newEnd.setFullYear(newEnd.getFullYear() - 1);
        return { start: formatDateStr(newStart), end: formatDateStr(newEnd) };
      }

      case 'sameMonthLastYear': {
        const newStart = new Date(startDate);
        newStart.setFullYear(newStart.getFullYear() - 1);
        const newEnd = new Date(endDate);
        newEnd.setFullYear(newEnd.getFullYear() - 1);
        return { start: formatDateStr(newStart), end: formatDateStr(newEnd) };
      }

      default:
        return undefined;
    }
  }

  // Handle preset selection
  function selectPreset(presetId: DatePreset) {
    if (presetId === 'custom') {
      preset = 'custom';
      view = 'calendar';
      if (startDate) {
        const [year, month] = startDate.split('-').map(Number);
        calendarYear = year;
        calendarMonth = month - 1;
      }
      return;
    }

    const range = calculatePresetRange(presetId);
    preset = presetId;
    startDate = range.start;
    endDate = range.end;
    onRangeChange?.(range, presetId);

    // Update comparison if enabled
    if (comparison !== 'none') {
      const compRange = calculateComparisonRange(range, comparison);
      if (compRange) {
        comparisonStart = compRange.start;
        comparisonEnd = compRange.end;
        onComparisonChange?.(comparison, compRange);
      }
    }

    isOpen = false;
  }

  // Handle comparison change
  function selectComparison(compType: ComparisonType) {
    comparison = compType;

    if (startDate && endDate) {
      const compRange = calculateComparisonRange({ start: startDate, end: endDate }, compType);
      if (compRange) {
        comparisonStart = compRange.start;
        comparisonEnd = compRange.end;
      } else {
        comparisonStart = undefined;
        comparisonEnd = undefined;
      }
      onComparisonChange?.(compType, compRange);
    }

    view = 'presets';
  }

  // Get calendar weeks for current month
  function getCalendarWeeks(): Date[][] {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);

    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];

    const firstDayOfWeek = firstDay.getDay();
    for (let i = 0; i < firstDayOfWeek; i++) {
      const prevDate = new Date(calendarYear, calendarMonth, -(firstDayOfWeek - 1 - i));
      currentWeek.push(prevDate);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      currentWeek.push(new Date(calendarYear, calendarMonth, day));

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      const remaining = 7 - currentWeek.length;
      for (let i = 1; i <= remaining; i++) {
        currentWeek.push(new Date(calendarYear, calendarMonth + 1, i));
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }

  const calendarWeeks = $derived(getCalendarWeeks());

  // Format date for comparison
  function dateToStr(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  // Check if date is in current month
  function isCurrentMonth(date: Date): boolean {
    return date.getMonth() === calendarMonth && date.getFullYear() === calendarYear;
  }

  // Check if date is selected
  function isSelected(date: Date): boolean {
    const dateStr = dateToStr(date);
    return dateStr === startDate || dateStr === endDate;
  }

  // Check if date is in range
  function isInRange(date: Date): boolean {
    if (!startDate || !endDate) return false;
    const dateStr = dateToStr(date);
    return dateStr > startDate && dateStr < endDate;
  }

  // Check if date is in hover range
  function isInHoverRange(date: Date): boolean {
    if (!selectingEnd || !startDate || !hoverDate) return false;
    const dateStr = dateToStr(date);
    const minDate = startDate < hoverDate ? startDate : hoverDate;
    const maxDate = startDate > hoverDate ? startDate : hoverDate;
    return dateStr >= minDate && dateStr <= maxDate;
  }

  // Handle date click
  function handleDateClick(date: Date) {
    const dateStr = dateToStr(date);

    if (!selectingEnd) {
      startDate = dateStr;
      endDate = undefined;
      selectingEnd = true;
    } else {
      if (dateStr < startDate!) {
        endDate = startDate;
        startDate = dateStr;
      } else {
        endDate = dateStr;
      }
      selectingEnd = false;
      preset = 'custom';

      const range = { start: startDate!, end: endDate! };
      onRangeChange?.(range, 'custom');

      if (comparison !== 'none') {
        const compRange = calculateComparisonRange(range, comparison);
        if (compRange) {
          comparisonStart = compRange.start;
          comparisonEnd = compRange.end;
          onComparisonChange?.(comparison, compRange);
        }
      }
    }
  }

  // Navigate calendar months
  function prevMonth() {
    if (calendarMonth === 0) {
      calendarMonth = 11;
      calendarYear--;
    } else {
      calendarMonth--;
    }
  }

  function nextMonth() {
    if (calendarMonth === 11) {
      calendarMonth = 0;
      calendarYear++;
    } else {
      calendarMonth++;
    }
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.date-range-picker')) {
      isOpen = false;
      selectingEnd = false;
    }
  }

  // Get today string
  const today = new Date().toISOString().split('T')[0];
</script>

<svelte:window onclick={handleClickOutside} />

<div class="date-range-picker relative inline-block">
  <!-- Trigger Button -->
  <Button
    variant="outline"
    size="sm"
    class="h-9 gap-2 min-w-[200px] justify-start"
    onclick={() => { isOpen = !isOpen; view = 'presets'; }}
  >
    <Calendar class="h-4 w-4 text-muted-foreground" />
    <span class="flex-1 text-left truncate">{displayLabel()}</span>
    {#if comparison !== 'none'}
      <ArrowLeftRight class="h-3 w-3 text-muted-foreground" />
    {/if}
  </Button>

  <!-- Dropdown Panel -->
  {#if isOpen}
    <div class="absolute top-full right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden min-w-[320px]">
      <!-- Header Tabs -->
      <div class="flex border-b bg-muted/30">
        <button
          class="flex-1 px-4 py-2 text-sm font-medium transition-colors
            {view === 'presets' ? 'text-primary border-b-2 border-primary bg-background' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => view = 'presets'}
        >
          Presets
        </button>
        <button
          class="flex-1 px-4 py-2 text-sm font-medium transition-colors
            {view === 'calendar' ? 'text-primary border-b-2 border-primary bg-background' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => view = 'calendar'}
        >
          Calendario
        </button>
        {#if showComparison}
          <button
            class="flex-1 px-4 py-2 text-sm font-medium transition-colors
              {view === 'comparison' ? 'text-primary border-b-2 border-primary bg-background' : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => view = 'comparison'}
          >
            Comparar
          </button>
        {/if}
      </div>

      <!-- Presets View -->
      {#if view === 'presets'}
        <div class="p-2 max-h-[400px] overflow-y-auto">
          <!-- Quick presets -->
          <div class="mb-2">
            <div class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">Rápido</div>
            <div class="grid grid-cols-2 gap-1">
              {#each presets.filter(p => p.group === 'quick') as p}
                <button
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left
                    {preset === p.id ? 'bg-primary/10 text-primary' : ''}"
                  onclick={() => selectPreset(p.id)}
                >
                  {#if preset === p.id}
                    <Check class="h-4 w-4" />
                  {:else}
                    <span class="w-4"></span>
                  {/if}
                  {p.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Month presets -->
          <div class="mb-2">
            <div class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">Meses</div>
            <div class="grid grid-cols-2 gap-1">
              {#each presets.filter(p => p.group === 'months') as p}
                <button
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left
                    {preset === p.id ? 'bg-primary/10 text-primary' : ''}"
                  onclick={() => selectPreset(p.id)}
                >
                  {#if preset === p.id}
                    <Check class="h-4 w-4" />
                  {:else}
                    <span class="w-4"></span>
                  {/if}
                  {p.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Extended presets -->
          <div class="mb-2">
            <div class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">Extendido</div>
            <div class="grid grid-cols-2 gap-1">
              {#each presets.filter(p => p.group === 'extended' || p.group === 'quarters') as p}
                <button
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left
                    {preset === p.id ? 'bg-primary/10 text-primary' : ''}"
                  onclick={() => selectPreset(p.id)}
                >
                  {#if preset === p.id}
                    <Check class="h-4 w-4" />
                  {:else}
                    <span class="w-4"></span>
                  {/if}
                  {p.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Year presets -->
          <div class="mb-2">
            <div class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">Años</div>
            <div class="grid grid-cols-2 gap-1">
              {#each presets.filter(p => p.group === 'years') as p}
                <button
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors text-left
                    {preset === p.id ? 'bg-primary/10 text-primary' : ''}"
                  onclick={() => selectPreset(p.id)}
                >
                  {#if preset === p.id}
                    <Check class="h-4 w-4" />
                  {:else}
                    <span class="w-4"></span>
                  {/if}
                  {p.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Custom option -->
          <div class="border-t pt-2 mt-2">
            <button
              class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors w-full text-left
                {preset === 'custom' ? 'bg-primary/10 text-primary' : ''}"
              onclick={() => selectPreset('custom')}
            >
              <Calendar class="h-4 w-4" />
              Personalizado...
            </button>
          </div>
        </div>
      {/if}

      <!-- Calendar View -->
      {#if view === 'calendar'}
        <div class="p-3">
          <!-- Month Navigator -->
          <div class="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" class="h-8 w-8" onclick={prevMonth}>
              <ChevronLeft class="h-4 w-4" />
            </Button>
            <span class="font-medium">
              {monthNames[calendarMonth]} {calendarYear}
            </span>
            <Button variant="ghost" size="icon" class="h-8 w-8" onclick={nextMonth}>
              <ChevronRight class="h-4 w-4" />
            </Button>
          </div>

          <!-- Calendar Grid -->
          <div class="grid grid-cols-7 gap-1 text-center">
            <!-- Day headers -->
            {#each dayNames as day}
              <div class="text-xs font-medium text-muted-foreground py-1">{day}</div>
            {/each}

            <!-- Calendar days -->
            {#each calendarWeeks as week}
              {#each week as date}
                {@const dateStr = dateToStr(date)}
                {@const inCurrentMonth = isCurrentMonth(date)}
                {@const selected = isSelected(date)}
                {@const inRange = isInRange(date) || isInHoverRange(date)}
                {@const isToday = dateStr === today}
                <button
                  class="relative h-8 w-8 text-sm rounded-md transition-all
                    {!inCurrentMonth ? 'text-muted-foreground/30 hover:text-muted-foreground/60' : ''}
                    {selected ? 'bg-primary text-primary-foreground font-medium' : ''}
                    {inRange && !selected ? 'bg-primary/20' : ''}
                    {isToday && !selected ? 'ring-1 ring-primary ring-inset' : ''}
                    {!selected && inCurrentMonth ? 'hover:bg-accent' : ''}"
                  onclick={() => {
                    if (!inCurrentMonth) {
                      // Navigate to the month of the clicked date
                      calendarYear = date.getFullYear();
                      calendarMonth = date.getMonth();
                    }
                    handleDateClick(date);
                  }}
                  onmouseenter={() => hoverDate = dateStr}
                  onmouseleave={() => hoverDate = null}
                  title={!inCurrentMonth ? `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}` : ''}
                >
                  {date.getDate()}
                </button>
              {/each}
            {/each}
          </div>

          <!-- Selection status -->
          <div class="mt-3 pt-3 border-t text-sm text-center text-muted-foreground">
            {#if selectingEnd}
              <span class="text-primary">Selecciona la fecha final</span>
            {:else if startDate && endDate}
              <span>{formatDate(startDate)} - {formatDate(endDate)}</span>
            {:else}
              <span>Selecciona la fecha inicial</span>
            {/if}
          </div>

          <!-- Apply button -->
          {#if startDate && endDate && !selectingEnd}
            <div class="mt-3 flex justify-end">
              <Button
                size="sm"
                onclick={() => isOpen = false}
              >
                Aplicar
              </Button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Comparison View -->
      {#if view === 'comparison' && showComparison}
        <div class="p-2">
          <div class="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase mb-2">
            Comparar con
          </div>
          <div class="space-y-1">
            {#each comparisonOptions as opt}
              <button
                class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-accent transition-colors w-full text-left
                  {comparison === opt.id ? 'bg-primary/10 text-primary' : ''}"
                onclick={() => selectComparison(opt.id)}
              >
                {#if comparison === opt.id}
                  <Check class="h-4 w-4" />
                {:else}
                  <span class="w-4"></span>
                {/if}
                {opt.label}
              </button>
            {/each}
          </div>

          {#if comparison !== 'none' && comparisonStart && comparisonEnd}
            <div class="mt-3 pt-3 border-t">
              <div class="text-xs text-muted-foreground mb-1">Período de comparación:</div>
              <div class="text-sm font-medium">
                {formatDate(comparisonStart)} - {formatDate(comparisonEnd)}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Footer with comparison indicator -->
      {#if comparison !== 'none' && comparisonStart && view !== 'comparison'}
        <div class="px-3 py-2 bg-muted/50 border-t text-xs">
          <div class="flex items-center gap-2 text-muted-foreground">
            <ArrowLeftRight class="h-3 w-3" />
            <span>Comparando con: {formatDate(comparisonStart)} - {formatDate(comparisonEnd!)}</span>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
