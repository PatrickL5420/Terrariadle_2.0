<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { games } from '$lib/games';
	import { imageUrl } from '$lib/images';
	import { completion } from '$lib/progress.svelte';

	// Like the game's hotbar: the selected slot's name shows above the bar, and the number keys
	// switch between games.
	const current = $derived(games.find((g) => page.url.pathname === `/${g.slug}`));

	function onKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
		const game = games[Number(e.key) - 1];
		if (game) goto(resolve('/[mode=mode]', { mode: game.slug }));
	}
</script>

<svelte:window onkeydown={onKey} />

<header>
	<a class="logo" href={resolve('/')}>Terrariadle</a>

	<nav aria-label="Games">
		<p class="held">{current?.title ?? 'Pick a game'}</p>
		<div class="hotbar">
			{#each games as game, i (game.slug)}
				<a
					class="slot hotbar-slot"
					class:selected={current?.slug === game.slug}
					class:framed={completion[game.slug] && current?.slug !== game.slug}
					href={resolve('/[mode=mode]', { mode: game.slug })}
					title="{game.title} ({i + 1})"
					aria-current={current?.slug === game.slug ? 'page' : undefined}
				>
					<span class="num">{i + 1}</span>
					<img src={imageUrl(game.icon)} alt={game.title} />
					{#if completion[game.slug]}<span class="done" title="Solved today">✓</span>{/if}
				</a>
			{/each}
		</div>
	</nav>
</header>

<style>
	header {
		padding: 14px 16px 4px;
	}

	.logo {
		display: inline-block;
		font-size: 40px;
		text-decoration: none;
		color: #8fe05a;
		text-shadow:
			2px 2px 0 #1d3d1d,
			-2px 2px 0 #1d3d1d,
			2px -2px 0 #1d3d1d,
			-2px -2px 0 #1d3d1d,
			0 4px 0 #0b1a0b;
		transition: transform 0.15s;
	}

	.logo:hover {
		color: #b6f58a;
		transform: scale(1.04);
	}

	nav {
		margin-top: 8px;
	}

	.held {
		margin: 0 0 6px;
		font-size: 18px;
		min-height: 22px;
	}

	.hotbar {
		display: inline-flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		padding: 6px;
	}

	.hotbar .slot {
		width: 48px;
		height: 48px;
		text-decoration: none;
		transition: transform 0.1s;
	}

	.hotbar .slot:hover {
		transform: translateY(-2px);
	}

	.hotbar .slot.selected {
		transform: scale(1.12);
	}

	.done {
		position: absolute;
		right: 4px;
		bottom: 0;
		font-size: 14px;
		color: #9dff7a;
	}

	@media (max-width: 420px) {
		.logo {
			font-size: 32px;
		}

		.hotbar {
			gap: 6px;
		}

		.hotbar .slot {
			width: 42px;
			height: 42px;
		}
	}
</style>
