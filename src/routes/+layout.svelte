<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { MobileHeader, Sidebar, MobileTabBar } from '$lib/components/layout';
	import { isMobile } from '$lib/stores/ui';
	import { budgetInfo } from '$lib/stores/budget';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
	<title>{$budgetInfo.budgetName || 'YNAB4 Client'}</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground dark">
	<div class="flex h-screen">
		<!-- Sidebar (drawer on mobile) -->
		<Sidebar />

		<!-- Main content area -->
		<div class="flex flex-1 flex-col overflow-hidden">
			<!-- Mobile header -->
			{#if $isMobile}
				<MobileHeader />
			{/if}

			<!-- Page content -->
			<main class="flex-1 overflow-y-auto pb-16 md:pb-0">
				{@render children()}
			</main>

			<!-- Mobile tab bar -->
			{#if $isMobile}
				<MobileTabBar />
			{/if}
		</div>
	</div>
</div>
