<script lang="ts">
	import Dropdown, { type DropdownListItem } from './Dropdown.svelte';
	import LoadingBar from './LoadingBar.svelte';
	import { scale, slide } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import { HINT_UNLOCKS, type Entry, type GameConfig, type Hint } from '$lib/engine/types';
	import { imageUrl } from '$lib/images';
	import { devFlags } from '$lib/dev/flags.svelte';

	let {
		game,
		items,
		guessCount,
		finished,
		hints,
		onGuess,
		onHint
	}: {
		game: GameConfig<Entry>;
		items: DropdownListItem[];
		guessCount: number;
		finished: boolean;
		hints: (Hint | null)[];
		onGuess: (id: number) => void;
		onHint: (n: number) => Promise<void>;
	} = $props();

	let visible = $state([false, false, false]);

	const locked = (i: number) => !devFlags.unlockHints && guessCount < HINT_UNLOCKS[i] && !finished;

	async function toggle(i: number) {
		if (!hints[i]) await onHint(i + 1);
		visible[i] = !visible[i];
	}
</script>

{#if !finished}
	<div class="guess-panel" out:slide={{ duration: 700, easing: cubicInOut }}>
		<h2>Guess Today's {game.noun[0].toUpperCase() + game.noun.slice(1)}</h2>

		<div class="loading-bar">
			<LoadingBar {guessCount} {finished} />
		</div>

		<div class="hint-buttons">
			{#each game.hints as def, i (def.label)}
				{@const hint = hints[i]}
				<button
					disabled={locked(i)}
					class:active={visible[i]}
					onclick={() => toggle(i)}
					title={def.label}
				>
					{#if locked(i)}
						<img
							class="lock"
							out:scale={{ duration: 1000 }}
							src="/ui/LockedHint.png"
							alt="Locked hint {i + 1}"
						/>
					{/if}
					{#if visible[i] && hint && 'image' in hint}
						<img class="hint-image {hint.effect}" src={imageUrl(hint.image)} alt="Hint" />
					{:else}
						<span>{def.label}</span>
					{/if}
				</button>
			{/each}
		</div>

		{#each game.hints as def, i (def.label)}
			{@const hint = hints[i]}
			{#if visible[i] && hint && 'text' in hint}
				<p class="hint-reveal" transition:slide={{ duration: 200 }}>
					<span class="hint-label">{def.label}:</span>
					{hint.text}
				</p>
			{/if}
		{/each}

		<div class="dropdown">
			<Dropdown selectItem={onGuess} itemList={items} itemType={game.noun} />
		</div>
	</div>
{:else}
	<span class="color-cycle">{game.title} Results</span>
{/if}

<style>
	.guess-panel {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		background-color: var(--color-backgroundblue);
		width: fit-content;
		max-width: calc(100% - 30px);
		text-align: center;
		margin: auto;
		margin-top: 20px;
		padding: 15px;

		border-radius: 15px;
		border: thin solid black;
	}

	h2 {
		background-color: var(--color-lightblue);
		width: fit-content;
		margin: auto;
		margin-top: -40px;
		margin-bottom: 10px;
		padding: 10px 20px;

		border-radius: 15px;
		border: 2px solid black;
	}

	.hint-buttons {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 10px;
	}

	.hint-buttons button {
		background-color: var(--color-button);
		position: relative;
		width: 100px;
		height: 100px;
		padding: 4px;
		font-size: 16px;
		text-align: center;
		overflow: hidden;

		border-radius: 15px;
		border: thin solid black;
		transition: background-color 0.2s ease;
	}

	.hint-buttons button .lock {
		position: absolute;
		top: 9px;
		left: 24px;
		width: 50px;
		opacity: 50%;
	}

	.hint-buttons button.active {
		background-color: var(--color-lightblue);
	}

	.hint-reveal {
		max-width: 320px;
		margin: 10px auto 0;
		padding: 6px 10px;
		font-size: 15px;
		line-height: 1.2;
		background-color: var(--color-button);
		border: thin solid black;
		border-radius: 10px;
	}

	.hint-label {
		color: var(--color-yellow);
	}

	.hint-image {
		width: 60px;
		height: 60px;
		object-fit: contain;
	}

	.hint-image.blur {
		filter: blur(4px);
	}

	.hint-image.silhouette {
		filter: brightness(0) drop-shadow(0 0 2px white);
	}

	.hint-buttons button:not(:disabled):hover {
		cursor: pointer;
		background-color: var(--color-lightblue);
	}

	.loading-bar {
		margin-top: 25px;
		margin-bottom: 10px;
	}

	.dropdown {
		margin-top: 15px;
		margin-bottom: 5px;
	}

	@media (max-width: 700px) {
		.loading-bar {
			margin-top: 10px;
		}

		.hint-buttons button {
			width: 90px;
			height: 90px;
		}

		.hint-buttons button .lock {
			left: 20px;
			width: 45px;
		}
	}
</style>
