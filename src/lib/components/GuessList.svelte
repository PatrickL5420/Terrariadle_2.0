<script lang="ts">
	import type { CompareResult, Entry, GameConfig, GuessRecord } from '$lib/engine/types';
	import { getEntry } from '$lib/games';
	import { imageUrl } from '$lib/images';
	import { useMediaQuery } from '$lib/utils/mediaQuery.svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';

	let { game, guesses }: { game: GameConfig<Entry>; guesses: GuessRecord[] } = $props();

	const background: Record<CompareResult, string> = {
		match: 'var(--color-green)',
		partial: 'var(--color-yellow)',
		miss: 'var(--color-red)',
		higher: 'var(--color-red)',
		lower: 'var(--color-red)'
	};

	function shown(attr: GameConfig<Entry>['attributes'][number], e: Entry): string[] {
		const v = attr.display ? attr.display(e) : attr.value(e);
		return (Array.isArray(v) ? v : [v]).map(String);
	}

	const isMobile = useMediaQuery('(max-width: 800px)');
	// Tiles fly in from the right, staggered so the row "deals" left to right.
	const columns = $derived(game.attributes.length + 1);
	const flyX = (col: number) => {
		const x = (columns - 1 - col) * 80;
		return isMobile.current ? x / 4 : x;
	};
	const flyDuration = () => (isMobile.current ? 400 : 2000);

	const rows = $derived(
		guesses
			.map((g) => ({ guess: g, entry: getEntry(game, g.id) }))
			.filter((r): r is { guess: GuessRecord; entry: Entry } => !!r.entry)
	);
</script>

<div class="container">
	<div class="header" style="--cols: {columns}">
		<span>{game.firstColumn}</span>
		{#each game.attributes as attr (attr.key)}
			<span title={attr.title}>{attr.label}</span>
		{/each}
	</div>

	{#each rows as { guess, entry } (guess.id)}
		<div class="row" animate:flip>
			<div class="tile name-tile" in:fly={{ x: flyX(0), duration: flyDuration() }}>
				{#if entry.image}
					<img src={imageUrl(entry.image)} alt={entry.name} title={entry.name} />
				{:else}
					<span class="name">{entry.name}</span>
				{/if}
			</div>

			{#each game.attributes as attr, i (attr.key)}
				{@const result = guess.checks[attr.key]}
				{@const lines = shown(attr, entry)}
				<div
					class="tile"
					class:arrow-up={result === 'higher'}
					class:arrow-down={result === 'lower'}
					style:background-color={background[result]}
					title={result === 'higher'
						? 'The answer is higher'
						: result === 'lower'
							? 'The answer is lower'
							: undefined}
					in:fly={{ x: flyX(i + 1), duration: flyDuration() }}
				>
					{#each lines as line, j (j)}
						<span
							class:small={lines.length > 2 || line.length > 12}
							style:color={attr.color?.(entry)}>{line}</span
						>
					{/each}
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.container {
		max-width: 100%;
		overflow-x: auto;
	}

	.header {
		display: flex;
		margin: auto;
		margin-top: 10px;
		width: fit-content;
		padding: 5px 10px;
		gap: 12px;
		border-bottom: 2px solid #fff;
	}

	.header span {
		font-size: 13px;
		width: 80px;
		flex-shrink: 0;
	}

	.row {
		display: flex;
		justify-content: center;
		align-items: center;
		margin: 5px auto;
		width: fit-content;
		padding: 0 10px;
		gap: 8px;
	}

	.tile {
		background-color: rgba(0, 0, 0, 0.4);
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		flex-shrink: 0;
		width: 80px;
		height: 80px;
		padding: 2px;
		box-sizing: border-box;
		border-radius: 15px;
		border: 2px solid black;
		overflow: hidden;
		font-size: 15px;
		line-height: 1.1;

		/* allow layering the arrow underneath the text */
		position: relative;
		z-index: 0;
	}

	.tile span.small {
		font-size: 12px;
	}

	.name-tile {
		background-color: var(--color-button);
	}

	.name-tile img {
		width: 50px;
		height: 50px;
		object-fit: contain;
	}

	.name-tile .name {
		font-size: 14px;
	}

	/* ===== Arrow background layer ===== */
	.tile::after {
		content: '';
		position: absolute;
		width: 0;
		height: 0;
		z-index: -1;
	}

	.tile.arrow-up::after {
		border-left: 30px solid transparent;
		border-right: 30px solid transparent;
		border-bottom: 55px solid rgba(0, 0, 0, 0.25);
	}

	.tile.arrow-down::after {
		border-left: 30px solid transparent;
		border-right: 30px solid transparent;
		border-top: 55px solid rgba(0, 0, 0, 0.25);
	}

	@media (max-width: 800px) {
		.header {
			gap: 11px;
		}

		.header span {
			font-size: 12px;
			width: 70px;
		}

		.tile {
			width: 70px;
			height: 70px;
		}

		.tile span.small {
			font-size: 11px;
		}
	}
</style>
