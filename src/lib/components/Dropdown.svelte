<script lang="ts" module>
	export interface DropdownListItem {
		id: number;
		name: string;
		image?: string;
	}
</script>

<script lang="ts">
	import { imageUrl } from '$lib/images';
	import TextField from '$lib/ui/TextField.svelte';

	let {
		itemList,
		itemType,
		selectItem
	}: {
		itemList: DropdownListItem[];
		itemType: string;
		selectItem: (id: number) => void;
	} = $props();

	let input = $state('');
	let dropdownIndex = $state(-1);
	let itemElements = $state<(HTMLButtonElement | null)[]>([]); // for scrolling into view

	// Best matches first, so Enter picks "Hallowed Mask" over "Ancient Hallowed Mask".
	const filtered = $derived.by(() => {
		const query = input.toLowerCase();
		const rank = (name: string) => {
			const n = name.toLowerCase();
			return n === query ? 0 : n.startsWith(query) ? 1 : 2;
		};
		return itemList
			.filter((item) => item.name.toLowerCase().includes(query))
			.sort((a, b) => rank(a.name) - rank(b.name))
			.slice(0, 20);
	});

	$effect(() => {
		void input;
		dropdownIndex = -1;
	});

	$effect(() => {
		if (dropdownIndex >= 0) {
			itemElements[dropdownIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}
	});

	function pick(id: number) {
		selectItem(id);
		input = '';
	}

	function onKeyDown(event: KeyboardEvent) {
		if (!input) return;
		if (event.key === 'ArrowDown' || event.key === 'Tab') {
			dropdownIndex = Math.min(dropdownIndex + 1, filtered.length - 1);
			event.preventDefault();
		} else if (event.key === 'ArrowUp') {
			dropdownIndex = Math.max(dropdownIndex - 1, 0);
			event.preventDefault();
		} else if (event.key === 'Enter' && filtered.length !== 0) {
			pick(filtered[Math.max(dropdownIndex, 0)].id);
			event.preventDefault();
		} else if (event.key === 'Escape') {
			input = '';
		}
	}
</script>

<div class="search">
	<TextField
		icon="search"
		placeholder="Type any {itemType} to guess..."
		aria-label="Guess a {itemType}"
		bind:value={input}
		onkeydown={onKeyDown}
	/>

	{#if input}
		<!-- The box stays put; the list inside it scrolls (the box's texture is a layer of the box,
		     so a scrolling box would scroll its own background away). -->
		<div class="results tooltip-box">
			<div class="list" role="listbox">
				{#each filtered as item, i (item.id)}
					<button
						class="result"
						class:selected={i === dropdownIndex}
						role="option"
						aria-selected={i === dropdownIndex}
						bind:this={itemElements[i]}
						onclick={() => pick(item.id)}
					>
						<span class="slot mini">
							{#if item.image}<img src={imageUrl(item.image)} alt="" loading="lazy" />{/if}
						</span>
						<span>{item.name}</span>
					</button>
				{:else}
					<span class="none dim">No results...</span>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.search {
		position: relative;
		margin: 0 auto;
		width: 100%;
		max-width: 100%;
	}

	.results {
		position: absolute;
		z-index: 50;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		padding: 4px;
	}

	.list {
		max-height: 292px;
		overflow-y: auto;
		scrollbar-width: thin;
	}

	.result {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 4px 6px;
		background: none;
		border: none;
		border-radius: 4px;
		font-size: 16px;
		text-align: left;
		cursor: pointer;
	}

	.result:hover,
	.result.selected {
		background: rgba(89, 120, 170, 0.35);
	}

	.result:hover span:last-child,
	.result.selected span:last-child {
		color: var(--hover);
	}

	.slot.mini {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		border-radius: 4px;
	}

	.none {
		display: block;
		padding: 8px;
	}
</style>
