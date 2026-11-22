<script lang="ts">
	import Confetti from '$lib/components/Confetti.svelte';
	import EntryBadge from '$lib/components/EntryBadge.svelte';
	import GuessList from '$lib/components/GuessList.svelte';
	import GuessPanel from '$lib/components/GuessPanel.svelte';
	import WinningCard from '$lib/components/WinningCard.svelte';
	import { ApiError, checkGuess, getHint, getToday, solve, type Today } from '$lib/api';
	import { getEntry, getGame } from '$lib/games';
	import { loadProgress, playerId, saveProgress, type Progress } from '$lib/progress.svelte';
	import { scale, fly } from 'svelte/transition';
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
	const items = $derived(
		game.entries
			.filter((e) => !guessedIds.has(e.id))
			.map((e) => ({ id: e.id, name: e.name, image: e.image }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
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
	<p>Couldn't load today's puzzle: {loadError}</p>
{:else if !progress || !today}
	<p>Loading...</p>
{:else}
	{#key game.slug}
		<div in:fly={{ y: 20, duration: 400 }}>
			<GuessPanel
				{game}
				{items}
				guessCount={progress.guesses.length}
				finished={progress.finished}
				hints={progress.hints}
				clue={today.clue}
				onGuess={submitGuess}
				onHint={revealHint}
			/>

			{#if progress.finished && answer}
				<WinningCard
					{game}
					{answer}
					position={progress.position}
					guessCount={progress.guesses.length}
					solved={today.solved}
				/>
			{/if}

			{#if progress.guesses.length === 0}
				<div class="info">
					<p>
						{today.solved}
						{today.solved === 1 ? 'person has' : 'people have'} guessed today's {game.noun}
					</p>
					{#if yesterday}
						<p>Yesterday's {game.noun} was:</p>
						<EntryBadge entry={yesterday} theme={game.theme(yesterday)} />
					{/if}
					<p>Guess any {game.noun} to begin.</p>
				</div>
			{:else}
				<p class="mobile-msg" in:scale>← swipe to view →</p>
				<GuessList {game} guesses={progress.guesses} answerId={answer?.id} />
			{/if}

			<Confetti finished={progress.finished} />
		</div>
	{/key}
{/if}

<style>
	.mobile-msg {
		display: none;
		color: grey;
		margin: 10px auto -5px;
	}

	@media (max-width: 800px) {
		.mobile-msg {
			display: block;
		}
	}
</style>
