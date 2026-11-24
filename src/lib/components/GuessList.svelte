<script lang="ts">
	import type { CompareResult, Entry, GameConfig, GuessRecord } from '$lib/engine/types';
	import { getEntry } from '$lib/games';
	import { imageUrl } from '$lib/images';
	import WikiLink from './WikiLink.svelte';
	import CoinText from '$lib/ui/CoinText.svelte';
	import { summarizeValues, valueKnowledge } from '$lib/engine/values';
	import { flip } from 'svelte/animate';

	let {
		game,
		guesses,
		answerId
	}: { game: GameConfig<Entry>; guesses: GuessRecord[]; answerId?: number } = $props();

	function shown(attr: GameConfig<Entry>['attributes'][number], e: Entry): string[] {
		const v = attr.display ? attr.display(e) : attr.value(e);
		return (Array.isArray(v) ? v : [v]).map(String);
	}

	const ARROW: Partial<Record<CompareResult, string>> = { higher: '▲', lower: '▼' };
	const RESULT_TITLE: Record<CompareResult, string> = {
		match: 'Match',
		partial: 'Partly matches',
		miss: 'No match',
		higher: 'The answer is higher',
		lower: 'The answer is lower'
	};

	// Hover (or tap) a column header to see every value that column can have.
	const summaries = $derived(
		Object.fromEntries(game.attributes.map((a) => [a.key, summarizeValues(a, game.entries)]))
	);
	const POPOVER_WIDTH = 260;
	/** Expanded text boxes (games with `detailExpandable`), by guessed entry id. */
	let expanded = $state<Record<number, boolean>>({});

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

<div class="grid-wrap" onscroll={hideInfo}>
	<div class="grid" role="table" aria-label="Your guesses">
		<div class="row head" role="row">
			<span class="cell-head" role="columnheader">{game.firstColumn}</span>
			{#if game.detailLabel}<span class="cell-head detail" role="columnheader"
					>{game.detailLabel}</span
				>{/if}
			{#each game.attributes as attr (attr.key)}
				<button
					class="cell-head col-head"
					role="columnheader"
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
			{@const right = guess.id === answerId}
			<div class="row" role="row" animate:flip={{ duration: 250 }}>
				<!-- The item itself: green only for the right answer, so lookalike rows aren't ambiguous. -->
				<div class="slot tile {right ? 'match' : 'miss'}" role="cell" style="--i: 0">
					{#if entry.image}
						<WikiLink {game} {entry}><img src={imageUrl(entry.image)} alt={entry.name} /></WikiLink>
					{:else}
						<WikiLink {game} {entry} class="name">{entry.name}</WikiLink>
					{/if}
				</div>

				{#if game.detailLabel && game.detailExpandable}
					<button
						class="quote tooltip-box"
						class:open={expanded[guess.id]}
						aria-expanded={expanded[guess.id] ?? false}
						style="--i: 1"
						onclick={() => (expanded[guess.id] = !expanded[guess.id])}
						><span class="quote-text">{guess.detail ?? ''}</span></button
					>
				{:else if game.detailLabel}
					<div class="slot tile detail {right ? 'match' : 'miss'}" role="cell" style="--i: 1">
						<WikiLink {game} {entry} class="name">{entry.name}</WikiLink>
						<span class="detail-text">{guess.detail ?? ''}</span>
					</div>
				{/if}

				{#each game.attributes as attr, i (attr.key)}
					{@const result = guess.checks[attr.key]}
					{@const lines = shown(attr, entry)}
					<div
						class="slot tile {result}"
						role="cell"
						title={RESULT_TITLE[result]}
						style="--i: {i + 1}"
					>
						{#each lines as line, j (j)}
							<span
								class:small={lines.length > 2 || line.length > 12}
								style:color={attr.color?.(entry)}
								>{#if attr.format === 'coins'}<CoinText text={line} />{:else}{line}{/if}</span
							>
						{/each}
						{#if ARROW[result]}<span class="arrow" aria-label={RESULT_TITLE[result]}
								>{ARROW[result]}</span
							>{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>

{#if info && infoAttr}
	{@const sum = summaries[info.key]}
	{@const known = valueKnowledge(
		infoAttr,
		sum,
		rows.map((r) => ({ entry: r.entry, checks: r.guess.checks }))
	)}
	<!-- Like an item's hover tooltip in the game. -->
	<div
		class="col-info tooltip-box"
		role="tooltip"
		style:left="{info.left}px"
		style:top={info.top !== undefined ? `${info.top}px` : undefined}
		style:bottom={info.bottom !== undefined ? `${info.bottom}px` : undefined}
		style:width="{POPOVER_WIDTH}px"
	>
		<span class="info-name">{infoAttr.label}</span>
		{#if sum.range}
			{#if infoAttr.format === 'coins'}
				<p class:struck={!!known.bounds}>
					<CoinText text="{sum.range[0]} to {sum.range[1]}" />
				</p>
				{#if known.bounds}<p class="good"><CoinText text={known.bounds} /></p>{/if}
			{:else}
				<p class:struck={!!known.bounds}>{sum.range[0]} to {sum.range[1]}</p>
				{#if known.bounds}<p class="good">{known.bounds}</p>{/if}
			{/if}
		{/if}
		{#if sum.values.length}
			<p class="values">
				{#each sum.values as value, i (value)}
					<span
						class="value"
						class:struck={known.ruledOut.has(value)}
						class:good={known.confirmed.has(value)}
						style:color={known.ruledOut.has(value) || known.confirmed.has(value)
							? undefined
							: infoAttr.valueColor?.(value)}>{value}</span
					>{#if i < sum.values.length - 1}<span class="dim">{sum.ordered ? ' → ' : ', '}</span>{/if}
				{/each}
			</p>
		{/if}
	</div>
{/if}

<style>
	.grid-wrap {
		max-width: 100%;
		overflow-x: auto;
		margin-top: 18px;
		padding: 4px 4px 10px;
	}

	.grid {
		display: inline-flex;
		flex-direction: column;
		gap: 8px;
		margin: 0 auto;
	}

	.row {
		display: flex;
		gap: 8px;
		justify-content: center;
	}

	/* Rows grow when a text box is expanded; tiles stay at the top. */
	.row {
		align-items: flex-start;
	}

	.row.head {
		align-items: flex-end;
	}

	.cell-head {
		width: 76px;
		flex-shrink: 0;
		padding-bottom: 4px;
		font-size: 14px;
	}

	.cell-head.detail {
		width: 300px;
		max-width: 60vw;
	}

	.col-head {
		background: none;
		border: none;
		padding: 0 0 4px;
		line-height: inherit;
		cursor: help;
		text-decoration: underline dotted rgba(255, 255, 255, 0.5);
		text-underline-offset: 3px;
	}

	.col-head:hover,
	.col-head.open {
		color: var(--hover);
	}

	/* ---- Tiles: inventory slots tinted by result ---- */
	.tile {
		flex-shrink: 0;
		flex-direction: column;
		width: 76px;
		height: 76px;
		padding: 3px;
		font-size: 15px;
		line-height: 1.1;
		overflow: hidden;
		animation: pop 0.35s ease-out backwards;
		animation-delay: calc(var(--i) * 90ms);
	}

	.tile.match {
		background: var(--match);
	}

	.tile.partial {
		background: var(--partial);
	}

	.tile.miss,
	.tile.higher,
	.tile.lower {
		background: var(--miss);
	}

	.tile img {
		max-width: 62%;
		max-height: 62%;
	}

	.tile .small {
		font-size: 12px;
	}

	/* Arrow in the corner, where the game shows stack counts. */
	.arrow {
		position: absolute;
		right: 5px;
		bottom: 2px;
		font-size: 16px;
		color: var(--hover);
	}

	.tile.detail {
		width: 300px;
		max-width: 60vw;
		height: auto;
		min-height: 76px;
		padding: 6px 10px;
	}

	.tile :global(.wiki-link) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.tile.detail :global(.wiki-link) {
		height: auto;
	}

	.tile :global(.name) {
		font-size: 14px;
	}

	/* A text box as tall as a tile, cut short until clicked (Fishdle's quotes). */
	.quote {
		flex-shrink: 0;
		width: 300px;
		max-width: 60vw;
		height: 76px;
		padding: 5px 10px;
		border: none;
		font-size: 13px;
		line-height: 1.25;
		white-space: pre-line;
		cursor: pointer;
		overflow: hidden;
		display: flex;
		align-items: center;
		animation: pop 0.35s ease-out backwards;
		animation-delay: calc(var(--i) * 90ms);
	}

	.quote:hover,
	.quote:focus-visible {
		box-shadow: 0 0 0 2px var(--ui-hover-edge);
		outline: none;
	}

	/* The text is cut at whole lines; spare height is padding, centred. */
	.quote-text {
		overflow: hidden;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 4;
		line-clamp: 4;
	}

	.quote.open {
		height: auto;
		min-height: 76px;
	}

	.quote.open .quote-text {
		display: block;
	}

	.detail-text {
		font-size: 13px;
		line-height: 1.2;
		white-space: pre-line;
	}

	@keyframes pop {
		from {
			opacity: 0;
			transform: scale(0.6);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* ---- Column tooltip ---- */
	.col-info {
		position: fixed;
		z-index: 100;
		pointer-events: none;
	}

	.col-info p {
		margin: 4px 0;
		font-size: 14px;
	}

	.info-name {
		font-size: 17px;
		color: var(--hover);
	}

	.values {
		line-height: 1.5;
	}

	.struck {
		text-decoration: line-through;
		text-decoration-color: #ff6b6b;
		text-decoration-thickness: 2px;
		color: #8c8c9c;
	}

	.good {
		color: #9dff7a;
	}

	@media (max-width: 800px) {
		.cell-head,
		.tile {
			width: 66px;
		}

		.tile {
			height: 66px;
			font-size: 14px;
		}

		.quote {
			height: 66px;
		}

		.quote-text {
			-webkit-line-clamp: 3;
			line-clamp: 3;
		}

		.quote.open {
			min-height: 66px;
		}

		.tile .small {
			font-size: 11px;
		}
	}
</style>
