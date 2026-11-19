<script lang="ts">
	import EntryBadge from './EntryBadge.svelte';
	import RemainingTime from './RemainingTime.svelte';
	import type { Entry, GameConfig } from '$lib/engine/types';
	import { rarityBackground, rarityBorder } from '$lib/rarity';
	import { ConvertPositionToString } from '$lib/utils/posToString';
	import { typewriter } from '$lib/utils/transitions';
	import { scale } from 'svelte/transition';

	let {
		game,
		answer,
		position,
		guessCount,
		solved
	}: {
		game: GameConfig<Entry>;
		answer: Entry;
		position: number;
		guessCount: number;
		solved: number;
	} = $props();

	const theme = $derived(game.theme(answer));
</script>

<div
	class="wrapper"
	style:border-image-source={rarityBorder(theme)}
	style:background={rarityBackground(theme)}
	in:scale
>
	<h1>You Got It!</h1>

	{#if position > 0}
		<p transition:typewriter={{ speed: 1 }}>
			You were the {ConvertPositionToString(position)} person to guess today's {game.noun}!
		</p>
	{/if}

	<EntryBadge entry={answer} {theme} />

	<p>Solved in {guessCount} {guessCount === 1 ? 'guess' : 'guesses'}</p>
	{#if solved > 0}
		<p>{solved} {solved === 1 ? 'person has' : 'people have'} guessed today's {game.noun}</p>
	{/if}

	<RemainingTime />
</div>

<style>
	.wrapper {
		border: 20px solid transparent;
		border-radius: 5px;
		border-image-slice: 17;
		border-image-repeat: round;

		background-repeat: repeat;
		background-size: 20%;

		display: flex;
		justify-content: center;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 0 20px;
		width: 260px;
		max-width: calc(100% - 80px);
		margin: 15px auto;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
	}

	p {
		margin-top: 0;
	}
</style>
