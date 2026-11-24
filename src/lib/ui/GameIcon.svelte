<script lang="ts">
	import { imageUrl } from '$lib/images';

	/**
	 * A game's icon (static/ui/games/, from the game's emotes and menu icons), scaled by a whole
	 * number (at most `size` px) so the pixel art stays crisp. The icons range from 14 to 30 px.
	 */
	let { src, size = 40, alt = '' }: { src: string; size?: number; alt?: string } = $props();

	let natural = $state<[number, number] | null>(null);
	const scale = $derived(natural ? Math.max(1, Math.floor(size / Math.max(...natural))) : 1);
</script>

<img
	class="game-icon"
	src={imageUrl(src)}
	{alt}
	width={natural ? natural[0] * scale : undefined}
	height={natural ? natural[1] * scale : undefined}
	onload={(e) => {
		const img = e.currentTarget as HTMLImageElement;
		natural = [img.naturalWidth, img.naturalHeight];
	}}
/>

<style>
	.game-icon {
		flex-shrink: 0;
		image-rendering: pixelated;
	}
</style>
