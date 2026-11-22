<script lang="ts">
	import { page } from '$app/state';
	import { checkGuess, solve } from '$lib/api';
	import Dropdown from '$lib/components/Dropdown.svelte';
	import { gameSlugs, getGame } from '$lib/games';
	import { imageUrl } from '$lib/images';
	import {
		clearProgress,
		loadProgress,
		playerId,
		refreshCompletion,
		saveProgress
	} from '$lib/progress.svelte';
	import { onMount } from 'svelte';
	import { devFlags } from './flags.svelte';

	/**
	 * Developer panel: only mounted by `npm run dev` (see +layout.svelte).
	 * Toggle with the ` (backtick) key or the button in the corner.
	 */

	interface DevGame {
		slug: string;
		title: string;
		answer: { id: number; name: string; image?: string };
		overridden: boolean;
		solved: number;
		poolSize: number;
		schedule: { day: number; id: number; name: string }[];
	}
	interface DevInfo {
		day: number;
		realDay: number;
		dayOffset: number;
		games: DevGame[];
	}

	const STORAGE_KEY = 'terrariadle:dev-panel';

	let open = $state(false);
	let info = $state<DevInfo | null>(null);
	let selected = $state(gameSlugs[0]);
	let busy = $state('');
	let output = $state('');
	let tab = $state<'game' | 'schedule' | 'tasks'>('game');
	// Answers stay hidden until asked for, so the dev panel doesn't spoil the puzzle.
	let showAnswer = $state(false);
	let showSchedule = $state(false);

	const routeSlug = $derived(page.params.mode);
	$effect(() => {
		if (routeSlug && gameSlugs.includes(routeSlug)) selected = routeSlug;
	});

	const game = $derived(getGame(selected)!);
	const current = $derived(info?.games.find((g) => g.slug === selected));
	// Hide again whenever the mode or the answer changes (e.g. after a reroll).
	const answerId = $derived(current?.answer.id);
	$effect(() => {
		void selected;
		void answerId;
		showAnswer = false;
		showSchedule = false;
	});

	const entries = $derived(
		game.entries
			.map((e) => ({ id: e.id, name: e.name, image: e.image }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	async function load() {
		const res = await fetch('/api/dev');
		info = await res.json();
	}

	async function post(body: object) {
		const res = await fetch('/api/dev', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data.message ?? 'Request failed');
		return data;
	}

	/** Re-read state everywhere after something changed. */
	async function refresh() {
		await load();
		if (info) refreshCompletion(gameSlugs, info.day);
		devFlags.refresh++;
	}

	async function act(label: string, fn: () => Promise<unknown>) {
		busy = label;
		try {
			await fn();
			await refresh();
		} catch (e) {
			output = e instanceof Error ? e.message : String(e);
			tab = 'tasks';
		} finally {
			busy = '';
		}
	}

	// New answer => old guesses for today are meaningless, so they're cleared too.
	const reroll = (id?: number) =>
		act('reroll', async () => {
			await post({ action: 'reroll', slug: selected, id });
			clearProgress(selected);
		});
	const clearOverride = () =>
		act('clear', async () => {
			await post({ action: 'clear-override', slug: selected });
			clearProgress(selected);
		});
	const shiftDay = (delta: number) => act('day', () => post({ action: 'shift-day', delta }));
	const resetDay = () => act('day', () => post({ action: 'reset-day' }));
	const resetProgress = (all: boolean) =>
		act('progress', async () => {
			for (const slug of all ? gameSlugs : [selected]) clearProgress(slug);
		});
	const resetSolves = () => act('solves', () => post({ action: 'reset-solves' }));

	/** Plays the correct guess through the real API, exactly like a player would. */
	const autoSolve = () =>
		act('solve', async () => {
			if (!info || !current) return;
			const progress = loadProgress(selected, info.day);
			if (progress.finished) return;
			const id = current.answer.id;
			const res = await checkGuess(selected, id, info.day);
			progress.guesses = [{ id, checks: res.checks }, ...progress.guesses];
			progress.finished = res.correct;
			if (res.correct) {
				progress.position = (await solve(selected, id, info.day, playerId())).position;
			}
			saveProgress(selected, progress);
		});

	async function runTask(task: string) {
		busy = task;
		output = `Running ${task}…`;
		try {
			const res = await post({ action: 'run', task });
			output = `$ ${task} (exit ${res.code})\n\n${res.output || '(no output)'}`;
			await refresh();
		} catch (e) {
			output = e instanceof Error ? e.message : String(e);
		} finally {
			busy = '';
		}
	}

	onMount(() => {
		try {
			open = localStorage.getItem(STORAGE_KEY) === 'open';
		} catch {
			/* ignore */
		}
		load();
		const onKey = (e: KeyboardEvent) => {
			const typing =
				e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
			if (e.key === '`' && !typing) {
				e.preventDefault();
				toggle();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function toggle() {
		open = !open;
		try {
			localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
		} catch {
			/* ignore */
		}
		if (open) load();
	}
</script>

<button class="toggle" onclick={toggle} title="Dev tools (`)">🛠 Dev</button>

{#if open}
	<aside class="panel">
		<header>
			<strong>Dev tools</strong>
			{#if info}
				<span class="day" class:shifted={info.dayOffset !== 0}>
					Day {info.day}
					{#if info.dayOffset !== 0}({info.dayOffset > 0 ? '+' : ''}{info.dayOffset}){/if}
				</span>
			{/if}
			<button class="close" onclick={toggle} aria-label="Close">×</button>
		</header>

		<nav>
			<button class:on={tab === 'game'} onclick={() => (tab = 'game')}>Game</button>
			<button class:on={tab === 'schedule'} onclick={() => (tab = 'schedule')}>Schedule</button>
			<button class:on={tab === 'tasks'} onclick={() => (tab = 'tasks')}>Tasks</button>
		</nav>

		<label class="row">
			Mode
			<select bind:value={selected}>
				{#each gameSlugs as slug (slug)}
					<option value={slug}>{getGame(slug)?.title}</option>
				{/each}
			</select>
		</label>

		{#if tab === 'game'}
			{#if current}
				<div class="answer">
					<button
						class="reveal"
						aria-expanded={showAnswer}
						onclick={() => (showAnswer = !showAnswer)}
					>
						{showAnswer ? '▼ Hide' : '▶ Show'} today's answer
						{current.overridden ? '(forced)' : ''}
					</button>
					{#if showAnswer}
						<div class="revealed">
							{#if current.answer.image}
								<img src={imageUrl(current.answer.image)} alt="" />
							{/if}
							<span class="name">{current.answer.name}</span>
						</div>
					{/if}
					<div class="label">{current.solved} solved · pool of {current.poolSize}</div>
				</div>
			{/if}

			<h4>Answer</h4>
			<div class="buttons">
				<button disabled={!!busy} onclick={() => reroll()}>🎲 Reroll</button>
				<button disabled={!!busy || !current?.overridden} onclick={clearOverride}
					>↩ Back to scheduled</button
				>
			</div>
			<div class="pick">
				<Dropdown itemList={entries} itemType={game.noun} selectItem={(id) => reroll(id)} />
			</div>

			<h4>Time travel</h4>
			<div class="buttons">
				<button disabled={!!busy} onclick={() => shiftDay(-1)}>◀ Day −1</button>
				<button disabled={!!busy || info?.dayOffset === 0} onclick={resetDay}>Today</button>
				<button disabled={!!busy} onclick={() => shiftDay(1)}>Day +1 ▶</button>
			</div>

			<h4>Player</h4>
			<div class="buttons">
				<button disabled={!!busy} onclick={autoSolve}>✅ Auto-solve</button>
				<button
					class:on={devFlags.unlockHints}
					onclick={() => (devFlags.unlockHints = !devFlags.unlockHints)}
					>🔓 Hints {devFlags.unlockHints ? 'unlocked' : 'locked'}</button
				>
				<button disabled={!!busy} onclick={() => resetProgress(false)}>🧹 Reset this mode</button>
				<button disabled={!!busy} onclick={() => resetProgress(true)}>🧹 Reset all</button>
				<button disabled={!!busy} onclick={resetSolves}>0️⃣ Reset solve counts</button>
			</div>
		{:else if tab === 'schedule' && current}
			<p class="label">Upcoming answers (ignores overrides)</p>
			<button
				class="reveal"
				aria-expanded={showSchedule}
				onclick={() => (showSchedule = !showSchedule)}
			>
				{showSchedule ? '▼ Hide' : '▶ Show'} schedule
			</button>
			{#if showSchedule}
				<ol class="schedule">
					{#each current.schedule as s (s.day)}
						<li><span class="label">Day {s.day}</span> {s.name}</li>
					{/each}
				</ol>
			{/if}
		{:else if tab === 'tasks'}
			<div class="buttons">
				<button disabled={!!busy} onclick={() => runTask('sync-wiki')}>Wiki sync (report)</button>
				<button disabled={!!busy} onclick={() => runTask('sync-wiki-write')}
					>Wiki sync (write)</button
				>
				<button disabled={!!busy} onclick={() => runTask('fetch-images')}>Fetch images</button>
				<button disabled={!!busy} onclick={() => runTask('test')}>Run tests</button>
				<button disabled={!!busy} onclick={() => runTask('check')}>Type-check</button>
			</div>
			<pre>{output || 'Task output appears here.'}</pre>
		{/if}

		{#if busy}<p class="label">Working: {busy}…</p>{/if}
	</aside>
{/if}

<style>
	.toggle {
		position: fixed;
		right: 12px;
		bottom: 12px;
		z-index: 1000;
		padding: 6px 10px;
		font-size: 14px;
		cursor: pointer;
		background: #222;
		border: 1px solid #555;
		border-radius: 8px;
	}

	.panel {
		position: fixed;
		right: 12px;
		bottom: 52px;
		z-index: 1000;
		width: 340px;
		max-width: calc(100vw - 24px);
		max-height: calc(100vh - 70px);
		overflow-y: auto;
		padding: 10px 12px;
		background: rgba(20, 20, 28, 0.96);
		border: 1px solid #555;
		border-radius: 10px;
		font-size: 14px;
	}

	.panel :global(*) {
		text-align: left;
		text-shadow: none;
	}

	header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.day {
		color: #aaa;
	}
	.day.shifted {
		color: #ffb347;
	}

	.close {
		margin-left: auto;
		background: none;
		border: none;
		font-size: 20px;
		cursor: pointer;
	}

	nav {
		display: flex;
		gap: 4px;
		margin: 8px 0;
	}

	button {
		background: #333;
		border: 1px solid #555;
		border-radius: 6px;
		padding: 4px 8px;
		font-size: 13px;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	button.on {
		background: #3a5bbd;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	select {
		background: #333;
		color: white;
		border: 1px solid #555;
		border-radius: 6px;
		padding: 2px 4px;
	}

	h4 {
		margin: 12px 0 4px;
		font-size: 13px;
		color: #aaa;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.pick {
		margin-top: 6px;
	}

	.reveal {
		width: 100%;
		background: #2f2f3d;
	}

	.revealed {
		display: flex;
		gap: 10px;
		align-items: center;
		margin: 8px 0 4px;
	}

	.answer {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 10px;
		padding: 8px;
		background: #2a2a36;
		border-radius: 8px;
	}
	.revealed img {
		width: 36px;
		height: 36px;
		object-fit: contain;
	}
	.name {
		font-size: 18px;
		color: #9fe870;
	}

	.label {
		font-size: 12px;
		color: #999;
	}

	.schedule {
		margin: 0;
		padding-left: 20px;
	}

	pre {
		max-height: 260px;
		overflow: auto;
		white-space: pre-wrap;
		font-family: ui-monospace, monospace;
		font-size: 11px;
		background: #111;
		padding: 8px;
		border-radius: 6px;
	}
</style>
