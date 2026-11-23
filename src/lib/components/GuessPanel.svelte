<script lang="ts">
	import Dropdown, { type DropdownListItem } from './Dropdown.svelte';
	import { slide } from 'svelte/transition';
	import { HINT_UNLOCKS, type Entry, type GameConfig, type Hint } from '$lib/engine/types';
	import { imageUrl } from '$lib/images';
	import { devFlags } from '$lib/dev/flags.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Button from '$lib/ui/Button.svelte';

	let {
		game,
		items,
		guessCount,
		hints,
		clue,
		onGuess,
		onHint
	}: {
		game: GameConfig<Entry>;
		items: DropdownListItem[];
		guessCount: number;
		hints: (Hint | null)[];
		clue?: string;
		onGuess: (id: number) => void;
		onHint: (n: number) => Promise<void>;
	} = $props();

	let open = $state([false, false, false]);

	const unlocked = (i: number) => devFlags.unlockHints || guessCount >= HINT_UNLOCKS[i];

	async function toggle(i: number) {
		if (!unlocked(i)) return;
		if (!hints[i]) await onHint(i + 1);
		open[i] = !open[i];
	}
</script>

<Panel tone="outer" class="guess-panel">
	{#if clue && game.clueLabel}
		<!-- Styled like an NPC's chat box. -->
		<div class="clue tooltip-box">
			<span class="clue-label">{game.clueLabel}</span>
			<p>{clue}</p>
		</div>
	{/if}

	<div class="hints">
		{#each game.hints as def, i (def.label)}
			<Button
				variant="option"
				size="sm"
				icon={unlocked(i) ? 'unknown' : undefined}
				selected={open[i]}
				disabled={!unlocked(i)}
				onclick={() => toggle(i)}
			>
				{def.label}
				{#if !unlocked(i)}<span class="needs">{HINT_UNLOCKS[i] - guessCount}</span>{/if}
			</Button>
		{/each}
	</div>

	{#each game.hints as def, i (def.label)}
		{@const hint = hints[i]}
		{#if open[i] && hint}
			<div transition:slide={{ duration: 150 }}>
				<Panel tone="inset" class="hint">
					<span class="hint-name">{def.label}</span>
					{#if 'text' in hint}
						{hint.text}
					{:else}
						<img class="hint-image {hint.effect}" src={imageUrl(hint.image)} alt="Hint" />
					{/if}
				</Panel>
			</div>
		{/if}
	{/each}

	<hr class="ui-divider" />

	<Dropdown selectItem={onGuess} itemList={items} itemType={game.noun} />
</Panel>

<style>
	:global(.guess-panel) {
		/* Keeps the search results above the guess grid. */
		z-index: 2;
		max-width: 560px;
		margin: 8px auto 0;
	}

	.clue {
		margin: 0 auto 12px;
		max-width: 420px;
	}

	.clue-label {
		font-size: 13px;
		color: var(--hover);
	}

	.clue p {
		margin: 4px 0 0;
		font-size: 18px;
		/* Tooltips keep their in-game line breaks. */
		white-space: pre-line;
	}

	.hints {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}

	.needs {
		margin-left: 6px;
		color: var(--text-dim);
	}

	:global(.guess-panel .hint) {
		margin-top: 10px;
		font-size: 17px;
		text-align: left;
	}

	.hint-name {
		display: block;
		font-size: 13px;
		color: var(--hover);
	}

	.hint-image {
		display: block;
		margin: 4px auto 0;
		max-height: 64px;
	}

	/* Plain pictures (banners) are small sprites: show them at 2x. */
	.hint-image.none {
		height: 56px;
		max-height: none;
	}

	.hint-image.blur {
		filter: blur(3px);
	}

	.hint-image.silhouette {
		filter: brightness(0) drop-shadow(0 0 1px #fff);
	}

	@media (max-width: 520px) {
		.hints {
			grid-template-columns: 1fr;
		}
	}
</style>
