<script lang="ts">
	import Dropdown, { type DropdownListItem } from './Dropdown.svelte';
	import { slide } from 'svelte/transition';
	import { HINT_UNLOCKS, type Entry, type GameConfig, type Hint } from '$lib/engine/types';
	import { imageUrl } from '$lib/images';
	import { devFlags } from '$lib/dev/flags.svelte';

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
	const nextUnlock = $derived(HINT_UNLOCKS.find((n) => guessCount < n));

	// Hint slots use the equipment slot colours, like accessory / vanity / dye.
	const SLOT_STYLE = ['green', 'teal', 'dye'];

	async function toggle(i: number) {
		if (!unlocked(i)) return;
		if (!hints[i]) await onHint(i + 1);
		open[i] = !open[i];
	}
</script>

<section class="panel guess-panel">
	<h1 class="title">Guess today's {game.noun}</h1>

	{#if clue && game.clueLabel}
		<!-- Styled like an NPC's chat box. -->
		<div class="clue tooltip-box">
			<span class="clue-label">{game.clueLabel}</span>
			<p>{clue}</p>
		</div>
	{/if}

	<div class="hints">
		{#each game.hints as def, i (def.label)}
			{@const hint = hints[i]}
			<div class="hint">
				<button
					class="slot {unlocked(i) ? SLOT_STYLE[i] : ''}"
					class:locked={!unlocked(i)}
					class:open={open[i]}
					disabled={!unlocked(i)}
					onclick={() => toggle(i)}
					title={unlocked(i) ? def.label : `Unlocks after ${HINT_UNLOCKS[i]} guesses`}
				>
					{#if open[i] && hint && 'image' in hint}
						<img class="hint-image {hint.effect}" src={imageUrl(hint.image)} alt="Hint" />
					{:else if unlocked(i)}
						<span class="glyph">?</span>
					{:else}
						<span class="needs">{HINT_UNLOCKS[i] - guessCount}</span>
					{/if}
				</button>
				<span class="hint-label" class:dim={!unlocked(i)}>{def.label}</span>
			</div>
		{/each}
	</div>

	<p class="progress dim">
		{#if devFlags.unlockHints || nextUnlock === undefined}
			All hints unlocked
		{:else}
			Next hint in {nextUnlock - guessCount}
			{nextUnlock - guessCount === 1 ? 'guess' : 'guesses'}
		{/if}
	</p>

	{#each game.hints as def, i (def.label)}
		{@const hint = hints[i]}
		{#if open[i] && hint && 'text' in hint}
			<p class="hint-text tooltip-box" transition:slide={{ duration: 150 }}>
				<span class="hint-name">{def.label}</span>
				{hint.text}
			</p>
		{/if}
	{/each}

	<Dropdown selectItem={onGuess} itemList={items} itemType={game.noun} />
</section>

<style>
	.guess-panel {
		max-width: 460px;
		margin: 8px auto 0;
	}

	.clue {
		margin: 12px auto 4px;
		max-width: 380px;
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
		display: flex;
		justify-content: center;
		gap: 22px;
		margin-top: 14px;
	}

	.hint {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		width: 84px;
	}

	.hint .slot {
		width: 56px;
		height: 56px;
		border: none;
		cursor: pointer;
		transition: transform 0.1s;
	}

	.hint .slot:hover:not(:disabled) {
		transform: scale(1.08);
	}

	.hint .slot.open {
		box-shadow:
			inset 0 0 0 2px var(--slot-frame-hi),
			0 0 0 2px var(--slot-outer),
			0 0 10px rgba(255, 233, 77, 0.45);
	}

	.slot.locked {
		opacity: 0.55;
		cursor: default;
	}

	.glyph {
		font-size: 26px;
		color: var(--hover);
	}

	.needs {
		font-size: 22px;
		color: var(--text-dim);
	}

	.hint-label {
		font-size: 14px;
		line-height: 1.1;
	}

	.hint-image {
		max-width: 80%;
		max-height: 80%;
	}

	.hint-image.blur {
		filter: blur(3px);
	}

	.hint-image.silhouette {
		filter: brightness(0) drop-shadow(0 0 1px #fff);
	}

	.progress {
		margin: 10px 0 0;
		font-size: 14px;
	}

	.hint-text {
		margin: 10px auto 0;
		max-width: 380px;
		font-size: 16px;
	}

	.hint-name {
		display: block;
		font-size: 13px;
		color: var(--hover);
	}

	@media (max-width: 400px) {
		.hints {
			gap: 10px;
		}

		.hint {
			width: 76px;
		}
	}
</style>
