<script lang="ts">
	import Panel from '$lib/ui/Panel.svelte';
	import GuessList from '$lib/components/GuessList.svelte';
	import GuessPanel from '$lib/components/GuessPanel.svelte';
	import ResultPanel from '$lib/components/ResultPanel.svelte';
	import WikiLink from '$lib/components/WikiLink.svelte';
	import { imageUrl } from '$lib/images';
	import { ApiError, checkGuess, getClue, getHint, getToday, solve, type Today } from '$lib/api';
	import { getEntry, getGame } from '$lib/games';
	import { loadProgress, playerId, saveProgress, type Progress } from '$lib/progress.svelte';
	import { fly } from 'svelte/transition';
	import { untrack } from 'svelte';
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

	// Word-by-word clues: today's response has the first word; more are fetched on request.
	let clueText = $state('');
	$effect(() => {
		const t = today;
		const p = progress;
		if (!t || !p) return;
		clueText = t.clue ?? '';
		// Only on load: later reveals set clueText themselves.
		const words = untrack(() => p.words ?? 1);
		if (game.clueByWord && words > 1) {
			getClue(game.slug, words, t.day)
				.then((c) => (clueText = c.text))
				.catch(handleError);
		}
	});

	async function revealWord() {
		if (!progress || !today || busy || progress.clueDone) return;
		busy = true;
		try {
			const words = (progress.words ?? 1) + 1;
			const clue = await getClue(game.slug, words, today.day);
			clueText = clue.text;
			progress.words = words;
			progress.clueDone = clue.done;
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
					words={game.clueByWord ? (progress.words ?? 1) : undefined}
				/>
			{:else}
				<GuessPanel
					{game}
					{items}
					guessCount={progress.guesses.length}
					hints={progress.hints}
					clue={clueText}
					clueDone={!game.clueByWord || (progress.clueDone ?? false)}
					onNextWord={revealWord}
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
							<span class="slot">
								<WikiLink {game} entry={yesterday}>
									{#if yesterday.image}<img src={imageUrl(yesterday.image)} alt="" />{/if}
								</WikiLink>
							</span>
							<span>
								<span class="dim">Yesterday's {game.noun}</span><br />
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
