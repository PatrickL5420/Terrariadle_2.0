<script lang="ts">
	import Icon, { type UiIconName } from './Icon.svelte';

	/** Text with coin amounts like "7s 50c" drawn as the game's coin icons. */
	let { text }: { text: string } = $props();

	const COIN: Record<string, UiIconName> = {
		p: 'platinum',
		g: 'gold',
		s: 'silver',
		c: 'copper'
	};

	// "Above 7s 50c" -> ["Above ", "7", "s", " ", "50", "c", ""]: text, then (amount, coin) pairs.
	const parts = $derived(text.split(/(\d+)([pgsc])\b/));
</script>

{#each parts as part, i (i)}{#if i % 3 === 0}{part}{:else if i % 3 === 1}<span class="coin"
			>{part}<Icon name={COIN[parts[i + 1]]} alt={parts[i + 1]} /></span
		>{/if}{/each}

<style>
	.coin {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		white-space: nowrap;
	}

	.coin + .coin {
		margin-left: 3px;
	}
</style>
