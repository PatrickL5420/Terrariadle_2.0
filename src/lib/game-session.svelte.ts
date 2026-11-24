import {
	ApiError,
	checkBonus,
	checkGuess,
	getClue,
	getHint,
	getToday,
	solve,
	type Today
} from '$lib/api';
import type { Entry, GameConfig } from '$lib/engine/types';
import { getEntry } from '$lib/games';
import { loadProgress, playerId, saveProgress, scores, type Progress } from '$lib/progress.svelte';
import { dropCoins } from '$lib/purse.svelte';

/** Where winning coins burst out of: the answer in the result panel, or the bonus panel. */
const SOLVED_FROM = '.result .slot';
const BONUS_FROM = '.bonus-panel';

/**
 * One game's state for today and everything a player can do: guess, reveal hints and clue
 * words, answer the bonus question. Saves progress after each step, and drops the coins a step
 * wins (see $lib/gauntlet for how much).
 */
export class GameSession {
	today = $state<Today | null>(null);
	progress = $state<Progress | null>(null);
	/** The clue as shown: the whole clue, or the words revealed so far. */
	clue = $state('');
	error = $state('');
	#busy = false;

	constructor(readonly game: GameConfig<Entry>) {}

	/** The winning guess, once solved. */
	get answer(): Entry | undefined {
		const p = this.progress;
		return p?.finished && p.guesses[0] ? getEntry(this.game, p.guesses[0].id) : undefined;
	}

	get yesterday(): Entry | undefined {
		return this.today ? getEntry(this.game, this.today.yesterday) : undefined;
	}

	async load() {
		try {
			const today = await getToday(this.game.slug);
			const progress = loadProgress(this.game.slug, today.day);
			this.today = today;
			this.progress = progress;
			this.clue = today.clue ?? '';
			const words = progress.words ?? 1;
			if (this.game.clueByWord && words > 1) {
				this.clue = (await getClue(this.game.slug, words, today.day)).text;
			}
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not load the game';
		}
	}

	/** Keeps the "N players have solved it" count fresh. */
	async refreshSolved() {
		const today = await getToday(this.game.slug).catch(() => null);
		if (today && this.today && today.day === this.today.day) this.today.solved = today.solved;
	}

	guess(id: number) {
		return this.#step(async (p, day) => {
			if (p.finished || p.guesses.some((g) => g.id === id)) return;
			const res = await checkGuess(this.game.slug, id, day);
			p.guesses = [{ id, checks: res.checks, detail: res.detail }, ...p.guesses];
			if (!res.correct) return;
			p.finished = true;
			this.#save(SOLVED_FROM);
			try {
				const { position } = await solve(this.game.slug, id, day, playerId());
				p.position = position;
				this.today!.solved = Math.max(this.today!.solved, position);
			} catch {
				/* counting is best-effort */
			}
		});
	}

	answerBonus(id: number) {
		return this.#step(async (p, day) => {
			p.bonus ??= { guesses: [], finished: false };
			// Read it back: the assignment returns the plain object, not the reactive one.
			const bonus = p.bonus;
			if (bonus.finished || bonus.guesses.some((g) => g.id === id)) return;
			const res = await checkBonus(this.game.slug, id, day);
			bonus.guesses = [{ id, checks: res.checks }, ...bonus.guesses];
			bonus.finished = res.correct;
			bonus.note = res.note;
			if (res.correct) this.#save(BONUS_FROM);
		});
	}

	revealWord() {
		return this.#step(async (p, day) => {
			if (p.clueDone) return;
			const words = (p.words ?? 1) + 1;
			const clue = await getClue(this.game.slug, words, day);
			this.clue = clue.text;
			p.words = words;
			p.clueDone = clue.done;
		});
	}

	revealHint(n: number) {
		return this.#step(async (p, day) => {
			p.hints[n - 1] = (await getHint(this.game.slug, n, day)).hint;
		});
	}

	/** Runs one action at a time, then saves. */
	async #step(action: (p: Progress, day: number) => Promise<void>) {
		const p = this.progress;
		if (!p || !this.today || this.#busy) return;
		this.#busy = true;
		try {
			await action(p, this.today.day);
			this.#save();
		} catch (e) {
			if (e instanceof ApiError && e.status === 409) {
				alert('A new puzzle is available! The page will refresh.');
				location.reload();
			} else {
				alert(e instanceof Error ? e.message : 'Something went wrong');
			}
		} finally {
			this.#busy = false;
		}
	}

	/** Saves progress; coins it newly earns burst out of `from`. */
	#save(from?: string) {
		const slug = this.game.slug;
		const before = scores[slug] ?? 0;
		saveProgress(slug, this.progress!);
		if (from) dropCoins((scores[slug] ?? 0) - before, from);
	}
}
