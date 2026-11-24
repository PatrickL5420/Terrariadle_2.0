<script lang="ts">
	import Header from './Header.svelte';
	import Footer from './Footer.svelte';
	import Sky from '$lib/sky/Sky.svelte';
	import CoinDrop from '$lib/components/CoinDrop.svelte';
	import { play } from '$lib/sound.svelte';
	import '../app.css';
	import { page } from '$app/state';
	import { onMount, type Snippet } from 'svelte';
	import { games, gameSlugs } from '$lib/games';
	import { refreshCompletion } from '$lib/progress.svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => refreshCompletion(gameSlugs));

	// Like the game's menus: a tick when the pointer moves onto a button.
	const BUTTONS = '.ui-btn, .ui-icon-btn, .hotbar-slot, .quote';
	function onPointerOver(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		const button = (e.target as Element).closest(BUTTONS);
		const from = (e.relatedTarget as Element | null)?.closest(BUTTONS);
		if (button && button !== from && !button.matches(':disabled')) play('tick', 0.3);
	}

	// Dev tools are only loaded in dev and on previews; production builds drop this import entirely.
	const devPanel = __DEV_TOOLS__ ? import('$lib/dev/DevPanel.svelte') : null;

	const titles: Record<string, string> = {
		'/about': 'How to Play',
		...Object.fromEntries(games.map((g) => [`/${g.slug}`, g.title]))
	};

	let title = $derived(titles[page.url.pathname] ?? 'terraGauntlet');
</script>

<svelte:window onpointerover={onPointerOver} />

<svelte:head>
	<title>{title}</title>
	<link rel="icon" type="image/png" href="/items/Magic Mirror.png" />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="terraGauntlet" />
	<meta property="og:title" content={title} />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<Sky />
<CoinDrop />

<div class="app">
	<Header />

	<main>
		{@render children()}
	</main>

	<Footer />
</div>

{#if devPanel}
	{#await devPanel then { default: DevPanel }}
		<DevPanel />
	{/await}
{/if}

<style>
	main {
		padding: 8px 16px 0;
		max-width: 1100px;
		margin: 0 auto;
	}
</style>
