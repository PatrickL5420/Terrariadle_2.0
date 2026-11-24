<script lang="ts">
	import Dropdown, { type DropdownListItem } from './Dropdown.svelte';
	import GuessList from './GuessList.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import type { Entry, GameConfig, GuessRecord } from '$lib/engine/types';

	/** The second question asked once a puzzle is solved (`game.bonusLabel`). */
	let {
		game,
		items,
		guesses,
		finished,
		onGuess
	}: {
		game: GameConfig<Entry>;
		items: DropdownListItem[];
		guesses: GuessRecord[];
		finished: boolean;
		onGuess: (id: number) => void;
	} = $props();
</script>

<Panel tone="outer" class="bonus-panel">
	<span class="label"><span class="rainbow">Bonus question:</span> {game.bonusLabel}</span>
	{#if !finished}
		<Dropdown selectItem={onGuess} itemList={items} itemType={game.noun} />
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

	.label {
		display: block;
		margin-bottom: 10px;
		font-size: 20px;
		color: var(--hover);
	}
</style>
