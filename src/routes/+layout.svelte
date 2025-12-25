<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import favicon from '$lib/assets/favicon.svg';
	import { MobileHeader, Sidebar, MobileTabBar } from '$lib/components/layout';
	import { isMobile } from '$lib/stores/ui';
	import { budgetInfo } from '$lib/stores/budget';

	let { children } = $props();
	
	// Only show full app chrome when a budget is loaded
	const hasBudget = $derived(!!$budgetInfo.client);
	
	// Sidebar state - closed by default on mobile
	let sidebarOpen = $state(true);
	
	// Handle window resize
	onMount(() => {
		if (!browser) return;
		
		const handleResize = () => {
			const mobile = window.innerWidth < 768;
			// Auto-close sidebar when resizing to mobile
			if (mobile && sidebarOpen) {
				sidebarOpen = false;
			}
			// Auto-open sidebar when resizing to desktop
			if (!mobile && !sidebarOpen) {
				sidebarOpen = true;
			}
		};
		
		// Initial check
		sidebarOpen = window.innerWidth >= 768;
		
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});
	
	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
	<title>{$budgetInfo.budgetName || 'YNAB4 Client'}</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground dark">
	{#if hasBudget}
		<!-- Full app with sidebar when budget is loaded -->
		<div class="flex h-screen overflow-hidden">
			<Sidebar open={sidebarOpen} onToggle={toggleSidebar} />
			<div class="flex flex-1 flex-col overflow-hidden min-w-0">
				{#if $isMobile}
					<MobileHeader onMenuClick={toggleSidebar} />
				{/if}
				<main class="flex-1 overflow-y-auto pb-16 md:pb-0">
					{@render children()}
				</main>
				{#if $isMobile}
					<MobileTabBar />
				{/if}
			</div>
		</div>
	{:else}
		<!-- Clean welcome screen without app chrome -->
		<main class="h-screen overflow-y-auto">
			{@render children()}
		</main>
	{/if}
</div>
