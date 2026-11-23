import type { Checks, Hint } from '$lib/engine/types';

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

async function call<T>(input: string, init?: RequestInit): Promise<T> {
	const res = await fetch(input, init);
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new ApiError(res.status, body.message ?? 'Something went wrong');
	return body as T;
}

export interface Today {
	day: number;
	secondsLeft: number;
	solved: number;
	yesterday: number;
	/** Clue-style games: today's clue. */
	clue?: string;
	/** Puzzle games (Versiondle): the clue's picture, and yesterday's clue. */
	clueImage?: string;
	yesterdayClue?: { name: string; image?: string };
	/** Whether today has a bonus question. */
	bonus?: boolean;
}

export const getToday = (slug: string) => call<Today>(`/api/${slug}/today`);

export const checkGuess = (slug: string, id: number, day: number) =>
	call<{ correct: boolean; checks: Checks; detail?: string }>(
		`/api/${slug}/guess?id=${id}&day=${day}`
	);

export const checkBonus = (slug: string, id: number, day: number) =>
	call<{ correct: boolean; checks: Checks }>(`/api/${slug}/bonus?id=${id}&day=${day}`);

export const getClue = (slug: string, words: number, day: number) =>
	call<{ text: string; done: boolean }>(`/api/${slug}/clue?words=${words}&day=${day}`);

export const getHint = (slug: string, n: number, day: number) =>
	call<{ hint: Hint }>(`/api/${slug}/hint?n=${n}&day=${day}`);

export const solve = (slug: string, id: number, day: number, player: string) =>
	call<{ position: number }>(`/api/${slug}/solve`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id, day, player })
	});
