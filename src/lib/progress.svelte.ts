import { dayNumber } from '$lib/engine/daily';
import type { GuessRecord, Hint } from '$lib/engine/types';
import { scoreFor } from '$lib/gauntlet';

/**
 * Player progress lives in the browser only (like Wordle): no accounts, no server sessions.
 * Every read and write is wrapped because storage can be blocked (private mode, etc.).
 */

export interface Progress {
	day: number;
	guesses: GuessRecord[]; // newest first
	finished: boolean;
	position: number;
	hints: (Hint | null)[];
	/** The bonus question, once the puzzle is solved (games with `bonusLabel`). */
	bonus?: { guesses: GuessRecord[]; finished: boolean; note?: string };
	/** Games with `clueByWord`: how many words of the clue are shown, and whether that's all. */
	words?: number;
	clueDone?: boolean;
}

const key = (slug: string) => `terrariadle:v1:${slug}`;

function fresh(day: number): Progress {
	return { day, guesses: [], finished: false, position: 0, hints: [null, null, null] };
}

export function loadProgress(slug: string, day: number): Progress {
	try {
		const raw = localStorage.getItem(key(slug));
		if (raw) {
			const p = JSON.parse(raw) as Progress;
			if (p.day === day) return p;
		}
	} catch {
		/* ignore */
	}
	return fresh(day);
}

export function saveProgress(slug: string, p: Progress) {
	try {
		localStorage.setItem(key(slug), JSON.stringify(p));
	} catch {
		/* ignore */
	}
	track(slug, p);
}

/** Which games are finished today, for the header and home page. */
export const completion: Record<string, boolean> = $state({});

/** Each game's coins today (see $lib/gauntlet), for the coin counter and home page. */
export const scores: Record<string, number> = $state({});

function track(slug: string, p: Progress | undefined) {
	completion[slug] = p?.finished ?? false;
	scores[slug] = scoreFor(slug, p);
}

export function refreshCompletion(slugs: string[], day = dayNumber()) {
	for (const slug of slugs) track(slug, loadProgress(slug, day));
}

/** Today's coins across every game. */
export const dayTotal = () => Object.values(scores).reduce((sum, s) => sum + s, 0);

export function clearProgress(slug: string) {
	try {
		localStorage.removeItem(key(slug));
	} catch {
		/* ignore */
	}
	track(slug, undefined);
}

/** Anonymous id so a player is only counted once per puzzle. */
export function playerId(): string {
	const k = 'terrariadle:player';
	try {
		let id = localStorage.getItem(k);
		if (!id) {
			id = crypto.randomUUID();
			localStorage.setItem(k, id);
		}
		return id;
	} catch {
		return crypto.randomUUID();
	}
}
