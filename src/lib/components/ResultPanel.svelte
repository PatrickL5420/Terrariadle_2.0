<script lang="ts">
	import RemainingTime from './RemainingTime.svelte';
	import WikiLink from './WikiLink.svelte';
	import type { Entry, GameConfig, GuessRecord } from '$lib/engine/types';
	import { imageUrl } from '$lib/images';
	import { rarityColors } from '$lib/rarity';
	import { shareText } from '$lib/share';
	import { scale } from 'svelte/transition';

	/** Shown once solved, styled like the game's "Achievement complete!" popup. */
	let {
		game,
		answer,
		day,
		guesses,
		position,
		solved
	}: {
		game: GameConfig<Entry>;
		answer: Entry;
		day: number;
		guesses: GuessRecord[];
		position: number;
		solved: number;
	} = $props();

	let copied = $state(false);

	/** 1 -> "1st", 22 -> "22nd", 13 -> "13th". */
	function ordinal(n: number): string {
		const teen = n % 100 >= 11 && n % 100 <= 13;
		const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10];
		return `${n}${suffix ?? 'th'}`;
	}

	async function share() {
		const text = shareText(game, day, guesses, answer.id);
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			prompt('Copy your result:', text);
		}
	}
</script>

<section class="panel result" in:scale={{ start: 0.85, duration: 250 }}>
	<div class="answer">
		<span class="slot framed big">
			<WikiLink {game} entry={answer}>
				{#if answer.image}<img src={imageUrl(answer.image)} alt="" />{:else}<span>?</span>{/if}
			</WikiLink>
		</span>
		<div class="text">
			<WikiLink {game} entry={answer}>
				<span class="name" style:color={rarityColors[game.theme(answer)]}>{answer.name}</span>
			</WikiLink>
			<span class="dim">
				Solved in {guesses.length}
				{guesses.length === 1 ? 'guess' : 'guesses'}
			</span>
			{#if position > 0}
				<span class="dim">{ordinal(position)} to solve it today</span>
			{:else if solved > 0}
				<span class="dim">{solved} {solved === 1 ? 'player has' : 'players have'} solved it</span>
			{/if}
		</div>
	</div>

	<button class="text-btn share" onclick={share}>{copied ? 'Copied!' : 'Share result'}</button>
	<RemainingTime />
</section>

<style>
	.result {
		max-width: 460px;
		margin: 8px auto 0;
	}

	.answer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 14px;
	}

	.slot.big {
		width: 72px;
		height: 72px;
		flex-shrink: 0;
	}

	.slot.big :global(.wiki-link) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		text-align: left;
		gap: 2px;
	}

	.name {
		font-size: 22px;
	}

	.share {
		margin-top: 12px;
		font-size: 20px;
	}
</style>
