<script lang="ts">
	import Header from './Header.svelte';
	import Footer from './Footer.svelte';
	import '../app.css';
	import { page } from '$app/state';
	import { onMount, type Snippet } from 'svelte';
	import { games, gameSlugs } from '$lib/games';
	import { refreshCompletion } from '$lib/progress.svelte';
	import { dev } from '$app/environment';

	let { children }: { children: Snippet } = $props();

	onMount(() => refreshCompletion(gameSlugs));

	// Dev tools are only loaded by `npm run dev`; production builds drop this import entirely.
	const devPanel = dev ? import('$lib/dev/DevPanel.svelte') : null;

	const home = {
		title: '',
		description: 'Test your Terraria knowledge with daily guessing games.'
	};
	const routeMeta: Record<string, { title: string; description: string }> = {
		'/': home,
		'/about': { title: '| About', description: 'How to play Terrariadle.' },
		...Object.fromEntries(
			games.map((g) => [`/${g.slug}`, { title: `| ${g.title}`, description: g.description }])
		)
	};

	let meta = $derived(routeMeta[page.url.pathname] ?? home);
</script>

<svelte:head>
	<title>Terrariadle {meta.title}</title>
	<link rel="icon" type="image/png" href="/items/Magic Mirror.png" />
	<meta name="description" content={meta.description} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Terrariadle" />
	<meta property="og:title" content={`Terrariadle ${meta.title}`} />
	<meta property="og:description" content={meta.description} />
	<meta name="twitter:card" content="summary" />
</svelte:head>

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
