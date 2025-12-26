<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';

  interface Option {
    value: string;
    label: string;
    group?: string;
  }

  interface Props {
    options: Option[];
    value: string;
    placeholder?: string;
    onSelect: (value: string) => void;
    onCreate?: (value: string) => void;
    class?: string;
  }

  let { 
    options, 
    value = '', 
    placeholder = '', 
    onSelect, 
    onCreate,
    class: className = ''
  }: Props = $props();

  let inputValue = $state('');
  let isOpen = $state(false);
  let highlightedIndex = $state(-1);
  let inputRef = $state<HTMLInputElement | null>(null);
  let listRef = $state<HTMLDivElement | null>(null);
  
  // Sync inputValue when value prop changes
  $effect(() => {
    inputValue = value;
  });

  // Filter options based on input
  const filteredOptions = $derived.by(() => {
    if (!inputValue.trim()) return options;
    const query = inputValue.toLowerCase();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(query) ||
      opt.value.toLowerCase().includes(query)
    );
  });

  // Group options by group property
  const groupedOptions = $derived.by(() => {
    const groups = new Map<string, Option[]>();
    const ungrouped: Option[] = [];
    
    for (const opt of filteredOptions) {
      if (opt.group) {
        if (!groups.has(opt.group)) {
          groups.set(opt.group, []);
        }
        groups.get(opt.group)!.push(opt);
      } else {
        ungrouped.push(opt);
      }
    }
    
    return { groups, ungrouped };
  });

  // Flat list for keyboard navigation
  const flatOptions = $derived(filteredOptions);

  function handleInput(e: Event) {
    inputValue = (e.target as HTMLInputElement).value;
    isOpen = true;
    highlightedIndex = 0;
  }

  function handleFocus() {
    isOpen = true;
  }

  function handleBlur(e: FocusEvent) {
    // Delay to allow click on option
    setTimeout(() => {
      if (!listRef?.contains(document.activeElement)) {
        isOpen = false;
        // If value doesn't match any option, either create or revert
        const match = options.find(o => o.label.toLowerCase() === inputValue.toLowerCase());
        if (match) {
          selectOption(match);
        } else if (inputValue.trim() && onCreate) {
          onCreate(inputValue.trim());
        } else if (inputValue.trim()) {
          // Keep the typed value as-is
          onSelect(inputValue.trim());
        }
      }
    }, 150);
  }

  function selectOption(option: Option) {
    inputValue = option.label;
    onSelect(option.value);
    isOpen = false;
    highlightedIndex = -1;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      isOpen = true;
      highlightedIndex = 0;
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, flatOptions.length - 1);
        scrollToHighlighted();
        break;
      case 'ArrowUp':
        e.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        scrollToHighlighted();
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && flatOptions[highlightedIndex]) {
          selectOption(flatOptions[highlightedIndex]);
        } else if (inputValue.trim()) {
          if (onCreate) {
            onCreate(inputValue.trim());
          } else {
            onSelect(inputValue.trim());
          }
          isOpen = false;
        }
        break;
      case 'Escape':
        isOpen = false;
        highlightedIndex = -1;
        break;
      case 'Tab':
        if (isOpen && highlightedIndex >= 0 && flatOptions[highlightedIndex]) {
          selectOption(flatOptions[highlightedIndex]);
        }
        isOpen = false;
        break;
    }
  }

  function scrollToHighlighted() {
    if (listRef && highlightedIndex >= 0) {
      const item = listRef.querySelector(`[data-index="${highlightedIndex}"]`);
      item?.scrollIntoView({ block: 'nearest' });
    }
  }

  // Sync external value changes
  $effect(() => {
    if (value !== inputValue) {
      const match = options.find(o => o.value === value);
      inputValue = match?.label || value;
    }
  });
</script>

<div class="autocomplete {className}">
  <div class="autocomplete-input-wrapper">
    <input
      type="text"
      bind:this={inputRef}
      bind:value={inputValue}
      {placeholder}
      oninput={handleInput}
      onfocus={handleFocus}
      onblur={handleBlur}
      onkeydown={handleKeydown}
      class="autocomplete-input"
      autocomplete="off"
    />
    <button 
      type="button" 
      class="autocomplete-toggle"
      onclick={() => { isOpen = !isOpen; inputRef?.focus(); }}
      tabindex="-1"
    >
      <ChevronDown class="h-3 w-3 {isOpen ? 'rotated' : ''}" />
    </button>
  </div>
  
  {#if isOpen && (filteredOptions.length > 0 || (inputValue.trim() && onCreate))}
    <div class="autocomplete-dropdown" bind:this={listRef}>
      {#if groupedOptions.ungrouped.length > 0}
        {#each groupedOptions.ungrouped as option, i}
          {@const globalIndex = filteredOptions.indexOf(option)}
          <button
            type="button"
            class="autocomplete-option"
            class:highlighted={globalIndex === highlightedIndex}
            data-index={globalIndex}
            onmousedown={() => selectOption(option)}
            onmouseenter={() => highlightedIndex = globalIndex}
          >
            {option.label}
          </button>
        {/each}
      {/if}
      
      {#each [...groupedOptions.groups.entries()] as [groupName, groupOptions]}
        <div class="autocomplete-group">
          <div class="autocomplete-group-header">{groupName}</div>
          {#each groupOptions as option}
            {@const globalIndex = filteredOptions.indexOf(option)}
            <button
              type="button"
              class="autocomplete-option"
              class:highlighted={globalIndex === highlightedIndex}
              data-index={globalIndex}
              onmousedown={() => selectOption(option)}
              onmouseenter={() => highlightedIndex = globalIndex}
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/each}
      
      {#if inputValue.trim() && !filteredOptions.some(o => o.label.toLowerCase() === inputValue.toLowerCase()) && onCreate}
        <button
          type="button"
          class="autocomplete-option autocomplete-create"
          onmousedown={() => onCreate(inputValue.trim())}
        >
          + Crear "{inputValue}"
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .autocomplete {
    position: relative;
    width: 100%;
  }

  .autocomplete-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .autocomplete-input {
    width: 100%;
    padding: 0.125rem 1.25rem 0.125rem 0.25rem;
    border: none;
    border-bottom: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--foreground);
    font-size: 0.7rem;
    transition: all 0.15s;
  }

  .autocomplete-input:hover {
    border-bottom-color: var(--border);
  }

  .autocomplete-input:focus {
    outline: none;
    border-bottom-color: var(--primary);
    background: var(--background);
  }

  .autocomplete-input::placeholder {
    color: var(--muted-foreground);
    font-style: italic;
  }

  .autocomplete-toggle {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.125rem;
    background: transparent;
    border: none;
    color: var(--muted-foreground);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .autocomplete-toggle:hover {
    color: var(--foreground);
  }

  .autocomplete-toggle :global(.rotated) {
    transform: rotate(180deg);
  }

  .autocomplete-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    max-height: 200px;
    overflow-y: auto;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    margin-top: 2px;
  }

  .autocomplete-option {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--foreground);
    font-size: 0.7rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .autocomplete-option:hover,
  .autocomplete-option.highlighted {
    background: var(--accent);
  }

  .autocomplete-group {
    border-top: 1px solid var(--border);
  }

  .autocomplete-group:first-child {
    border-top: none;
  }

  .autocomplete-group-header {
    padding: 0.375rem 0.5rem 0.25rem;
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--muted);
  }

  .autocomplete-create {
    color: var(--primary);
    font-style: italic;
    border-top: 1px solid var(--border);
  }
</style>

