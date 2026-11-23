<script lang="ts">
	import Panel from '$lib/ui/Panel.svelte';
	import GuessList from '$lib/components/GuessList.svelte';
	import GuessPanel from '$lib/components/GuessPanel.svelte';
	import ResultPanel from '$lib/components/ResultPanel.svelte';
	import BonusPanel from '$lib/components/BonusPanel.svelte';
	import WikiLink from '$lib/components/WikiLink.svelte';
	import { imageUrl } from '$lib/images';
	import { ApiError, checkBonus, checkGuess, getHint, getToday, solve, type Today } from '$lib/api';
	import { getEntry, getGame } from '$lib/games';
	import { loadProgress, playerId, saveProgress, type Progress } from '$lib/progress.svelte';
	import { fly } from 'svelte/transition';
	import { devFlags } from '$lib/dev/flags.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const game = $derived(getGame(data.slug)!);

	let today = $state<Today | null>(null);
	let progress = $state<Progress | null>(null);
	let loadError = $state('');
	let busy = false;

	// (Re)load whenever the mode changes (or the dev panel asks); keep the solve count fresh.
	$effect(() => {
		const slug = data.slug;
		void devFlags.refresh;
		today = null;
		progress = null;
		loadError = '';

		let cancelled = false;
		getToday(slug)
			.then((t) => {
				if (cancelled) return;
				today = t;
				progress = loadProgress(slug, t.day);
			})
			.catch((e) => (loadError = e instanceof Error ? e.message : 'Could not load the game'));

		const poll = setInterval(async () => {
			try {
				const t = await getToday(slug);
				if (today && t.day === today.day) today.solved = t.solved;
			} catch {
				/* ignore */
			}
		}, 30_000);

		return () => {
			cancelled = true;
			clearInterval(poll);
		};
	});

	const guessedIds = $derived(new Set(progress?.guesses.map((g) => g.id) ?? []));
	const allItems = $derived(
		game.entries
			.map((e) => ({ id: e.id, name: e.name, image: e.image }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const items = $derived(allItems.filter((i) => !guessedIds.has(i.id)));
	const answer = $derived(
		progress?.finished && progress.guesses[0] ? getEntry(game, progress.guesses[0].id) : undefined
	);
	const yesterday = $derived(today ? getEntry(game, today.yesterday) : undefined);

	function handleError(e: unknown) {
		if (e instanceof ApiError && e.status === 409) {
			alert('A new puzzle is available! The page will refresh.');
			location.reload();
		} else {
			alert(e instanceof Error ? e.message : 'Something went wrong');
		}
	}

	async function submitGuess(id: number) {
		if (!progress || !today || progress.finished || busy || guessedIds.has(id)) return;
		busy = true;
		try {
			const res = await checkGuess(game.slug, id, today.day);
			progress.guesses = [{ id, checks: res.checks, detail: res.detail }, ...progress.guesses];
			if (res.correct) {
				progress.finished = true;
				saveProgress(game.slug, progress);
				try {
					const { position } = await solve(game.slug, id, today.day, playerId());
					progress.position = position;
					today.solved = Math.max(today.solved, position);
				} catch {
					/* counting is best-effort */
				}
			}
			saveProgress(game.slug, progress);
		} catch (e) {
			handleError(e);
		} finally {
			busy = false;
		}
	}

	async function submitBonus(id: number) {
		if (!progress || !today || busy) return;
		progress.bonus ??= { guesses: [], finished: false };
		// Read it back: the assignment returns the plain object, not the reactive one.
		const bonus = progress.bonus;
		if (bonus.finished || bonus.guesses.some((g) => g.id === id)) return;
		busy = true;
		try {
			const res = await checkBonus(game.slug, id, today.day);
			bonus.guesses = [{ id, checks: res.checks }, ...bonus.guesses];
			bonus.finished = res.correct;
			saveProgress(game.slug, progress);
		} catch (e) {
			handleError(e);
		} finally {
			busy = false;
		}
	}

	async function revealHint(n: number) {
		if (!progress || !today) return;
		try {
			const { hint } = await getHint(game.slug, n, today.day);
			progress.hints[n - 1] = hint;
			saveProgress(game.slug, progress);
		} catch (e) {
			handleError(e);
		}
	}
</script>

{#if loadError}
	<Panel class="status">Couldn't load today's puzzle: {loadError}</Panel>
{:else if !progress || !today}
	<p class="status dim">Loading...</p>
{:else}
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
					clue={today.clueImage ? { name: today.clue ?? '', image: today.clueImage } : undefined}
				/>
				{#if game.bonusLabel && today.bonus}
					{@const bonusIds = new Set(progress.bonus?.guesses.map((g) => g.id))}
					<BonusPanel
						{game}
						items={allItems.filter((i) => !bonusIds.has(i.id))}
						guesses={progress.bonus?.guesses ?? []}
						finished={progress.bonus?.finished ?? false}
						onGuess={submitBonus}
					/>
				{/if}
			{:else}
				<GuessPanel
					{game}
					{items}
					guessCount={progress.guesses.length}
					hints={progress.hints}
					clue={today.clue}
					clueImage={today.clueImage}
					onGuess={submitGuess}
					onHint={revealHint}
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
