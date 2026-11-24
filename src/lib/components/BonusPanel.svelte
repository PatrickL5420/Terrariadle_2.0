<script lang="ts">
	import Dropdown, { type DropdownListItem } from './Dropdown.svelte';
	import GuessList from './GuessList.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import WikiLink from './WikiLink.svelte';
	import { getEntry } from '$lib/games';
	import type { Entry, GameConfig, GuessRecord } from '$lib/engine/types';

	/** The second question asked once a puzzle is solved (`game.bonusLabel`). */
	let {
		game,
		items,
		guesses,
		finished,
		note,
		onGuess
	}: {
		game: GameConfig<Entry>;
		items: DropdownListItem[];
		guesses: GuessRecord[];
		finished: boolean;
		/** Once answered: the wiki's notes for the change in the version guessed. */
		note?: string;
		onGuess: (id: number) => void;
	} = $props();
</script>

<Panel tone="outer" class="bonus-panel">
	<span class="label"><span class="rainbow">Bonus question:</span> {game.bonusLabel}</span>
	{#if !finished}
		<Dropdown selectItem={onGuess} itemList={items} itemType={game.noun} />
	{:else if note}
		{@const version = getEntry(game, guesses[0].id)}
		<Panel tone="inset" class="bonus-note">
			{#if version}<span class="note-version"
					><WikiLink {game} entry={version}>{version.name}</WikiLink></span
				>{/if}
			<p>{note}</p>
		</Panel>
	{/if}
</Panel>

{#if guesses.length}
	<GuessList {game} {guesses} answerId={finished ? guesses[0].id : undefined} />
{/if}

<style>
	:global(.bonus-panel) {
		max-width: 560px;
		margin: 16px auto 0;
		z-index: 2;
	}

	:global(.bonus-note) {
		text-align: left;
		font-size: 16px;
	}

	.note-version {
		color: var(--hover);
	}

	p {
		margin: 4px 0 0;
		/* The wiki's bullet points are on their own lines. */
		white-space: pre-line;
	}

	.label {
		display: block;
		margin-bottom: 10px;
		font-size: 20px;
		color: var(--hover);
	}
</style>
