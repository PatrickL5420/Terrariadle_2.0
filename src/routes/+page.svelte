<script lang="ts">
	import { resolve } from '$app/paths';
	import { games } from '$lib/games';
	import { imageUrl } from '$lib/images';
	import { completion } from '$lib/progress.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Button from '$lib/ui/Button.svelte';
</script>

<Panel tone="outer" heading="Inventory" class="inventory">
	<div class="games">
		{#each games as game (game.slug)}
			<Button
				variant="option"
				size="lg"
				image={imageUrl(game.icon)}
				selected={completion[game.slug]}
				href={resolve('/[mode=mode]', { mode: game.slug })}>{game.title}</Button
			>
		{/each}
	</div>
</Panel>

<style>
	:global(.inventory) {
		max-width: 640px;
		margin: 12px auto;
	}

	.games {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 12px;
	}
</style>
