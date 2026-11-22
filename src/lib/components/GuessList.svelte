<script lang="ts">
	import type { CompareResult, Entry, GameConfig, GuessRecord } from '$lib/engine/types';
	import { getEntry } from '$lib/games';
	import { imageUrl } from '$lib/images';
	import { summarizeValues } from '$lib/engine/values';
	import { useMediaQuery } from '$lib/utils/mediaQuery.svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';

	let {
		game,
		guesses,
		answerId
	}: { game: GameConfig<Entry>; guesses: GuessRecord[]; answerId?: number } = $props();

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

	// Hover (or tap) a column header to see every value that column can have.
	const summaries = $derived(
		Object.fromEntries(game.attributes.map((a) => [a.key, summarizeValues(a, game.entries)]))
	);
	const POPOVER_WIDTH = 260;
	let info = $state<{ key: string; left: number; top?: number; bottom?: number } | null>(null);
	const infoAttr = $derived(info && game.attributes.find((a) => a.key === info!.key));

	function showInfo(key: string, el: HTMLElement) {
		const r = el.getBoundingClientRect();
		const left = Math.min(
			Math.max(8, r.left + r.width / 2 - POPOVER_WIDTH / 2),
			window.innerWidth - POPOVER_WIDTH - 8
		);
		// Open below the header, or above it when the header is low on the screen.
		info =
			r.bottom > window.innerHeight * 0.6
				? { key, left, bottom: window.innerHeight - r.top + 6 }
				: { key, left, top: r.bottom + 6 };
	}
	const hideInfo = () => (info = null);
	// Hover is mouse-only: after a tap, phones send a synthetic "leave" that would close the
	// popover straight away. Taps open it via focus/click and close it by tapping elsewhere.

	const rows = $derived(
		guesses
			.map((g) => ({ guess: g, entry: getEntry(game, g.id) }))
			.filter((r): r is { guess: GuessRecord; entry: Entry } => !!r.entry)
	);
</script>

<svelte:window onscroll={hideInfo} onresize={hideInfo} />

<div class="container" onscroll={hideInfo}>
	<div class="header" style="--cols: {columns}">
		<span>{game.firstColumn}</span>
		{#each game.attributes as attr (attr.key)}
			<button
				class="col-head"
				class:open={info?.key === attr.key}
				aria-expanded={info?.key === attr.key}
				onpointerenter={(e) => e.pointerType === 'mouse' && showInfo(attr.key, e.currentTarget)}
				onpointerleave={(e) => e.pointerType === 'mouse' && hideInfo()}
				onfocus={(e) => showInfo(attr.key, e.currentTarget)}
				onblur={hideInfo}
				onclick={(e) => showInfo(attr.key, e.currentTarget)}>{attr.label}</button
			>
		{/each}
	</div>

	{#each rows as { guess, entry } (guess.id)}
		<div class="row" animate:flip>
			<!-- The item itself: green only for the right answer, so lookalike rows aren't ambiguous. -->
			<div
				class="tile name-tile"
				style:background-color={guess.id === answerId ? background.match : background.miss}
				title={guess.id === answerId ? 'Correct!' : 'Not this one'}
				in:fly={{ x: flyX(0), duration: flyDuration() }}
			>
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

{#if info && infoAttr}
	{@const sum = summaries[info.key]}
	<div
		class="col-info"
		role="tooltip"
		style:left="{info.left}px"
		style:top={info.top !== undefined ? `${info.top}px` : undefined}
		style:bottom={info.bottom !== undefined ? `${info.bottom}px` : undefined}
		style:width="{POPOVER_WIDTH}px"
	>
		<strong>{infoAttr.label}</strong>
		<p class="desc">{infoAttr.title}</p>
		{#if sum.range}
			<p class="range">{sum.range[0]} <span class="arrow">to</span> {sum.range[1]}</p>
		{/if}
		{#if sum.values.length}
			<div class="chips">
				{#each sum.values as value, i (value)}
					<span class="chip" style:color={infoAttr.valueColor?.(value)}>{value}</span>
					{#if sum.ordered && i < sum.values.length - 1}<span class="arrow">→</span>{/if}
				{/each}
			</div>
		{/if}
		<p class="rule">{sum.rule}</p>
	</div>
{/if}

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

	.header span,
	.col-head {
		font-size: 13px;
		width: 80px;
		flex-shrink: 0;
	}

	.col-head {
		padding: 0;
		background: none;
		border: none;
		cursor: help;
		text-decoration: underline dotted rgba(255, 255, 255, 0.6);
		text-underline-offset: 3px;
	}

	.col-head:hover,
	.col-head.open {
		color: var(--color-yellow);
	}

	.col-info {
		position: fixed;
		z-index: 100;
		box-sizing: border-box;
		padding: 10px 12px;
		background-color: rgb(40, 52, 115);
		border: 2px solid black;
		border-radius: 10px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		pointer-events: none;
	}

	.col-info p {
		margin: 4px 0;
		font-size: 14px;
	}

	.col-info .desc {
		color: lightgray;
	}

	.col-info .rule {
		font-size: 12px;
		color: #c9d3ff;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 4px;
		margin: 6px 0;
	}

	.chip {
		padding: 2px 6px;
		font-size: 13px;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 6px;
	}

	.arrow {
		font-size: 12px;
		color: lightgray;
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

		.header span,
		.col-head {
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
