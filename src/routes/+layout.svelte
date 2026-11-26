<script lang="ts">
	import Header from './Header.svelte';
	import Footer from './Footer.svelte';
	import Sky from '$lib/sky/Sky.svelte';
	import CoinDrop from '$lib/components/CoinDrop.svelte';
	import Cursor from '$lib/components/Cursor.svelte';
	import { play } from '$lib/sound.svelte';
	import '../app.css';
	import { page } from '$app/state';
	import { onMount, type Snippet } from 'svelte';
	import { games, gameSlugs } from '$lib/games';
	import { refreshCompletion } from '$lib/progress.svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => refreshCompletion(gameSlugs));

	// Like the game's menus: a tick (Menu_Tick) when the pointer moves onto a button.
	const BUTTONS = '.ui-btn, .ui-icon-btn, .ui-field-box, .ui-field-icon, .hotbar-slot, .quote';
	function onPointerOver(e: PointerEvent) {
		if (e.pointerType !== 'mouse') return;
		const button = (e.target as Element).closest(BUTTONS);
		const from = (e.relatedTarget as Element | null)?.closest(BUTTONS);
		if (button && button !== from && !button.matches(':disabled')) play('tick', 0.3);
	}

	// And on pressing one: a choice or category button ticks again (GroupOptionButton,
	// UIColoredImageButton); a Back / Create style button or a name box opens (Menu_Open), or
	// closes if it's marked data-sound="close" (Menu_Close).
	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const el = (e.target as Element).closest(BUTTONS);
		if (!el || el.matches(':disabled')) return;
		if (el.matches('.ui-btn.option, .ui-icon-btn, .ui-field-icon')) play('tick', 0.3);
		else if (el.matches('.ui-btn.fat, .ui-field-box'))
			play(el.getAttribute('data-sound') === 'close' ? 'close' : 'open', 0.3);
	}

	// Dev tools are only loaded in dev and on previews; production builds drop this import entirely.
	const devPanel = __DEV_TOOLS__ ? import('$lib/dev/DevPanel.svelte') : null;

	const titles: Record<string, string> = {
		'/about': 'How to Play',
		...Object.fromEntries(games.map((g) => [`/${g.slug}`, g.title]))
	};

	let title = $derived(titles[page.url.pathname] ?? 'terraGauntlet');

	// The little world starts closed, and isn't even loaded until it's opened.
	let worldOpen = $state(false);
	let miniWorld: ReturnType<typeof loadWorld> | null = $state(null);
	const loadWorld = () => import('$lib/components/MiniWorld.svelte');
	function toggleWorld() {
		worldOpen = !worldOpen;
		if (worldOpen) miniWorld ??= loadWorld();
	}
</script>

<svelte:window onpointerover={onPointerOver} onpointerdown={onPointerDown} />

<!-- GroupOptionButton's icon when not hovered or selected: times (137, 138, 156) x 0.7. -->
<svg class="filters" aria-hidden="true">
	<filter id="ui-dim" color-interpolation-filters="sRGB">
		<feColorMatrix
			type="matrix"
			values="0.5373 0 0 0 0  0 0.5412 0 0 0  0 0 0.6118 0 0  0 0 0 0.698 0"
		/>
	</filter>
</svg>

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
<Cursor />

<div class="app">
	<div class="stage">
		<!-- A little world to watch, beside the game (wide screens only), opened by its button:
		     the coin counter's mirror image on the left. -->
		<button
			class="world-toggle ui-btn"
			aria-expanded={worldOpen}
			data-sound={worldOpen ? 'close' : undefined}
			onclick={toggleWorld}>World Sim</button
		>
		{#if worldOpen && miniWorld}
			<aside class="world-column">
				{#await miniWorld then { default: MiniWorld }}
					<MiniWorld />
				{/await}
			</aside>
		{/if}

		<Header />

		<main>
			{@render children()}
		</main>
	</div>

	<Footer />
</div>

{#if devPanel}
	{#await devPanel then { default: DevPanel }}
		<DevPanel />
	{/await}
{/if}

<style>
	.filters {
		position: absolute;
		width: 0;
		height: 0;
	}

	.stage {
		position: relative;
	}

	/* Where the coin counter's "Coins" is, mirrored: left of the game (Header.svelte). */
	.world-toggle {
		display: none;
		position: absolute;
		top: 14px;
		right: calc(50% + var(--column-gap));
		z-index: 1;
		padding: 0;
		font-size: 16px;
		line-height: normal;
		color: var(--text);
	}

	.world-toggle:hover,
	.world-toggle:focus-visible,
	.world-toggle[aria-expanded='true'] {
		color: var(--hover);
	}

	/*
	 * Left of the game, under its button, down to the bottom of the game; the coin counter
	 * makes the matching column on the right (Header.svelte). 13 blocks wide, in a panel's
	 * border.
	 */
	.world-column {
		display: none;
		position: absolute;
		/* Its border clears the button. */
		top: 44px;
		bottom: 0;
		right: calc(50% + var(--column-gap));
		width: calc(13 * 16px);
		padding: 2px;
		box-sizing: content-box;
		/* Above the header's empty sides, so its fullscreen button can be pressed. */
		z-index: 1;
	}

	.world-column::after {
		content: '';
		position: absolute;
		inset: -10px;
		pointer-events: none;
		border: 12px solid transparent;
		border-image: url('/ui/game/border-black.png') 12 / 12px;
	}

	@media (min-width: 1150px) {
		.world-column,
		.world-toggle {
			display: block;
		}
	}

	/* The little world fullscreen (MiniWorld's button): only it and the sky show. */
	:global(body.world-wide) .app {
		visibility: hidden;
	}

	:global(body.world-wide) .world-column {
		visibility: visible;
	}

	:global(body.world-wide) .world-column::after {
		display: none;
	}

	main {
		padding: 8px 16px 0;
		max-width: 1100px;
		margin: 0 auto;
	}
</style>
