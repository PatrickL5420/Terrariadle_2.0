<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Entry, GameConfig } from '$lib/engine/types';
	import { wikiUrl } from '$lib/wiki';

	/** Wraps an item (image or name) in a link to its page on the official wiki, in a new tab. */
	let {
		game,
		entry,
		class: className = '',
		children
	}: { game: GameConfig<Entry>; entry: Entry; class?: string; children: Snippet } = $props();
</script>

<a
	class="wiki-link {className}"
	href={wikiUrl(game, entry)}
	target="_blank"
	rel="noopener noreferrer"
	title="{entry.name} on the wiki">{@render children()}</a
>

<style>
	.wiki-link {
		color: inherit;
		text-decoration: none;
	}

	.wiki-link:hover {
		text-decoration: underline;
	}
</style>
