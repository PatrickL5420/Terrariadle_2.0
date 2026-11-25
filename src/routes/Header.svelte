<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { games } from '$lib/games';
	import { completion } from '$lib/progress.svelte';
	import CoinCounter from '$lib/components/CoinCounter.svelte';
	import GameIcon from '$lib/ui/GameIcon.svelte';

	// Like the game's hotbar: the selected slot's name shows above the bar, and the number keys
	// switch between games.
	const current = $derived(games.find((g) => page.url.pathname === `/${g.slug}`));

	function onKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
		// Like the game's hotbar: 1-9, then 0 for the tenth slot.
		const game = games[e.key === '0' ? 9 : Number(e.key) - 1];
		if (game) goto(resolve('/[mode=mode]', { mode: game.slug }));
	}
</script>

<svelte:window onkeydown={onKey} />

<header>
	<div class="top">
		<a class="logo" href={resolve('/')}>terraGauntlet</a>
		<CoinCounter />
	</div>

	<!-- The home page lists every game itself, so the hotbar is only on the other pages. -->
	{#if page.url.pathname !== '/'}
		<nav aria-label="Games">
			<p class="held">{current?.title ?? ''}</p>
			<div class="hotbar">
				{#each games as game, i (game.slug)}
					<a
						class="slot hotbar-slot"
						class:selected={current?.slug === game.slug}
						class:framed={completion[game.slug] && current?.slug !== game.slug}
						href={resolve('/[mode=mode]', { mode: game.slug })}
						title="{game.title} ({(i + 1) % 10})"
						aria-current={current?.slug === game.slug ? 'page' : undefined}
					>
						<span class="num">{(i + 1) % 10}</span>
						<GameIcon src={game.icon} alt={game.title} />
						{#if completion[game.slug]}<span class="done">✓</span>{/if}
					</a>
				{/each}
			</div>
		</nav>
	{/if}
</header>

<style>
	header {
		position: relative;
		padding: 14px 16px 4px;
	}

	/* Logo, with the coin counter on the right like the inventory's coin slots. */
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 6px 24px;
	}

	.top :global(.coins) {
		position: absolute;
		top: 16px;
		right: 16px;
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

	/* GameIcon sizes the icon itself (whole-number scaling); don't squeeze it to 70%. */
	.hotbar :global(.game-icon) {
		max-width: none;
		max-height: none;
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

	/* On wide screens it's a column right of the game, like the inventory's coin slots, matching
	   the little world on the left (+layout.svelte). */
	@media (min-width: 1150px) {
		.top :global(.coins) {
			top: 14px;
			right: auto;
			left: calc(50% + var(--column-gap));
			flex-direction: column;
		}
	}

	/* On narrow screens the counter sits under the logo. */
	@media (max-width: 760px) {
		.top :global(.coins) {
			position: static;
		}
	}

	@media (max-width: 420px) {
		.logo {
			font-size: 30px;
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
