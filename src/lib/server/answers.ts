import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { pickDaily } from '$lib/engine/daily';
import type { Entry, GameConfig } from '$lib/engine/types';
import { answerPool, getEntry, getGame } from '$lib/games';
import { currentDay, overrideFor } from './dev';

function secret(): string {
	if (env.DAILY_SECRET) return env.DAILY_SECRET;
	if (dev) return 'dev-secret';
	// Without a secret anyone could compute every future answer from the public source code.
	error(500, 'DAILY_SECRET is not configured');
}

export function gameOr404(slug: string): GameConfig<Entry> {
	const game = getGame(slug);
	if (!game) error(404, 'Unknown game');
	return game;
}

/** The scheduled answer, ignoring dev overrides. */
export function scheduledAnswer(game: GameConfig<Entry>, day: number): Entry {
	const id = pickDaily(answerPool(game), `${secret()}:${game.slug}`, day);
	return getEntry(game, id)!;
}

export function answerFor(game: GameConfig<Entry>, day: number): Entry {
	const forced = overrideFor(game.slug, day);
	return (forced !== undefined && getEntry(game, forced)) || scheduledAnswer(game, day);
}

/** Parses the `day` a client is playing and rejects anything that isn't today. */
export function requireToday(raw: unknown): number {
	const day = Number(raw);
	const today = currentDay();
	if (!Number.isInteger(day)) error(400, 'Missing day');
	if (day !== today) error(409, 'A new puzzle is available. Refresh the page!');
	return day;
}

export function entryOr400(game: GameConfig<Entry>, raw: unknown): Entry {
	const entry = getEntry(game, Number(raw));
	if (!entry) error(400, `Unknown ${game.noun}`);
	return entry;
}
