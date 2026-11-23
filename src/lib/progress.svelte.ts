import { dayNumber } from '$lib/engine/daily';
import type { GuessRecord, Hint } from '$lib/engine/types';

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
	bonus?: { guesses: GuessRecord[]; finished: boolean };
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
	completion[slug] = p.finished;
}

/** Which games are finished today, for the header and home page. */
export const completion: Record<string, boolean> = $state({});

export function refreshCompletion(slugs: string[], day = dayNumber()) {
	for (const slug of slugs) completion[slug] = loadProgress(slug, day).finished;
}

export function clearProgress(slug: string) {
	try {
		localStorage.removeItem(key(slug));
	} catch {
		/* ignore */
	}
	completion[slug] = false;
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
