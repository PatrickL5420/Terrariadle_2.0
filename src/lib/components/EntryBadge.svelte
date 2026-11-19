<script lang="ts">
	import type { Entry } from '$lib/engine/types';
	import { imageUrl } from '$lib/images';
	import { rarityColors, type RarityName } from '$lib/rarity';
	import { scale } from 'svelte/transition';

	/** An answer shown as an icon plus its name, coloured by rarity (yesterday's answer, win card). */
	let { entry, theme }: { entry: Entry; theme: RarityName } = $props();
</script>

<div class="badge" in:scale>
	{#if entry.image}
		<img style:border-color={rarityColors[theme]} src={imageUrl(entry.image)} alt={entry.name} />
	{/if}
	<h3 style:color={rarityColors[theme]}>{entry.name}</h3>
</div>

<style>
	img {
		background-color: var(--color-button);
		padding: 18px;
		width: 45px;
		height: 45px;
		object-fit: contain;

		border-radius: 15px;
		border: 2px solid;
	}

	h3 {
		margin: 8px 0;
	}
</style>
