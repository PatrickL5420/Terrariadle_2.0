<script lang="ts">
	import { resolve } from '$app/paths';
	import Panel from '$lib/ui/Panel.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { uiIconUrl } from '$lib/ui/Icon.svelte';
	import GuessList from '$lib/components/GuessList.svelte';
	import GuessPanel from '$lib/components/GuessPanel.svelte';
	import ResultPanel from '$lib/components/ResultPanel.svelte';
	import BonusPanel from '$lib/components/BonusPanel.svelte';
	import WikiLink from '$lib/components/WikiLink.svelte';
	import { imageUrl } from '$lib/images';
	import { games, getGame } from '$lib/games';
	import { scores } from '$lib/progress.svelte';
	import { GameSession } from '$lib/game-session.svelte';
	import { fly } from 'svelte/transition';
	import { devFlags } from '$lib/dev/flags.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const game = $derived(getGame(data.slug)!);
	let session = $state<GameSession | null>(null);

	// A fresh session whenever the game changes (or the dev panel asks); keep the solve count fresh.
	$effect(() => {
		void devFlags.refresh;
		const s = new GameSession(game);
		session = s;
		s.load();
		const poll = setInterval(() => s.refreshSolved(), 30_000);
		return () => clearInterval(poll);
	});

	const allItems = $derived(
		game.entries
			.map((e) => ({ id: e.id, name: e.name, image: e.image }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const guessedIds = $derived(new Set(session?.progress?.guesses.map((g) => g.id) ?? []));
	const items = $derived(allItems.filter((i) => !guessedIds.has(i.id)));

	// Back / Next walk the gauntlet in order; Next on the last game goes home.
	const index = $derived(games.findIndex((g) => g.slug === game.slug));
	const prev = $derived(games[index - 1]);
	const next = $derived(games[index + 1]);
</script>

<!-- Back and next through the gauntlet, like the game's step buttons (GroupOptionButton with
     its 16 px IconPrev / IconNext arrows drawn 28 px wide), just under the hotbar. -->
<nav class="walk" aria-label="Gauntlet">
	{#if prev}
		<Button variant="option" href={resolve('/[mode=mode]', { mode: prev.slug })} title="Back">
			<span class="step">
				<img class="arrow ui-option-icon" src={uiIconUrl('prev')} alt="Back" />
				{prev.title}
			</span>
		</Button>
	{/if}
	<Button
		variant="option"
		href={next ? resolve('/[mode=mode]', { mode: next.slug }) : resolve('/')}
		title="Next"
	>
		<span class="step">
			{next ? next.title : 'Home'}
			<img class="arrow ui-option-icon" src={uiIconUrl('next')} alt="Next" />
		</span>
	</Button>
</nav>

{#if session?.error}
	<Panel class="status">Couldn't load today's puzzle: {session.error}</Panel>
{:else if !session?.progress || !session.today}
	<p class="status dim">Loading...</p>
{:else}
	{@const { progress, today, answer, yesterday } = session}
	{#key game.slug}
		<div in:fly={{ y: 12, duration: 250 }}>
			{#if progress.finished && answer}
				<ResultPanel
					{game}
					{answer}
					day={today.day}
					guesses={progress.guesses}
					position={progress.position}
					solved={today.solved}
					score={scores[game.slug] ?? 0}
					clue={today.clueImage ? { name: today.clue ?? '', image: today.clueImage } : undefined}
					words={game.clueByWord ? (progress.words ?? 1) : undefined}
				/>
				{#if game.bonusLabel && today.bonus}
					{@const bonusIds = new Set(progress.bonus?.guesses.map((g) => g.id))}
					<BonusPanel
						{game}
						items={allItems.filter((i) => !bonusIds.has(i.id))}
						guesses={progress.bonus?.guesses ?? []}
						finished={progress.bonus?.finished ?? false}
						note={progress.bonus?.note}
						onGuess={(id) => session?.answerBonus(id)}
					/>
				{/if}
			{:else}
				<GuessPanel
					{game}
					{items}
					guessCount={progress.guesses.length}
					hints={progress.hints}
					clue={session.clue}
					clueImage={today.clueImage}
					clueDone={!game.clueByWord || (progress.clueDone ?? false)}
					onNextWord={() => session?.revealWord()}
					onGuess={(id) => session?.guess(id)}
					onHint={(n) => session!.revealHint(n)}
				/>
			{/if}

			{#if progress.guesses.length}
				<GuessList {game} guesses={progress.guesses} answerId={answer?.id} />
			{:else}
				<div class="intro">
					<p class="dim">
						{today.solved}
						{today.solved === 1 ? 'player has' : 'players have'} solved today's {game.noun}
					</p>
					{#if yesterday}
						<Panel tone="inset" class="yesterday">
							{@const image = today.yesterdayClue?.image ?? yesterday.image}
							<span class="slot">
								<WikiLink {game} entry={yesterday}>
									{#if image}<img src={imageUrl(image)} alt="" />{/if}
								</WikiLink>
							</span>
							<span>
								<span class="dim">Yesterday's {game.noun}</span><br />
								{#if today.yesterdayClue}{today.yesterdayClue.name}:{/if}
								<WikiLink {game} entry={yesterday}>{yesterday.name}</WikiLink>
							</span>
						</Panel>
					{/if}
				</div>
			{/if}
		</div>
	{/key}
{/if}

<style>
	:global(.status) {
		margin: 24px auto;
		max-width: 420px;
	}

	.walk {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin: 0 0 12px;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 20px;
	}

	/* IconPrev / IconNext, 16 px, drawn 28 px wide like the game's step buttons. */
	.arrow {
		width: 28px;
		height: 28px;
	}

	.intro {
		margin-top: 18px;
	}

	:global(.yesterday) {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		margin-top: 4px;
	}

	:global(.yesterday) .slot {
		flex-shrink: 0;
	}

	:global(.yesterday) .slot :global(.wiki-link) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}
</style>
