import { redis, redisConfig, KEY_PREFIX as NS } from './redis';

/**
 * The only state the site stores: how many players solved each puzzle today.
 * Without Redis configured, counts live in memory, which is fine for local development only.
 */

const KEY_TTL = 3 * 86_400;

// --- in-memory fallback -------------------------------------------------------------------
const memory = new Map<string, number>();
let warned = false;
function useMemory(): boolean {
	if (redisConfig()) return false;
	if (!warned) {
		console.warn('[counter] No Upstash Redis configured; solve counts are in-memory only.');
		warned = true;
	}
	return true;
}

const countKey = (slug: string, day: number) => `${NS}count:${slug}:${day}`;
const playerKey = (slug: string, day: number, player: string) =>
	`${NS}solved:${slug}:${day}:${player}`;

/**
 * Records a solve and returns the player's position (1 = first today).
 * Calling it again for the same player returns their original position.
 */
export async function recordSolve(slug: string, day: number, player: string): Promise<number> {
	const pk = playerKey(slug, day, player);
	const ck = countKey(slug, day);

	if (useMemory()) {
		const existing = memory.get(pk);
		if (existing) return existing;
		const pos = (memory.get(ck) ?? 0) + 1;
		memory.set(ck, pos);
		memory.set(pk, pos);
		return pos;
	}

	const [claimed] = await redis([['SET', pk, '0', 'NX', 'EX', KEY_TTL]]);
	if (claimed !== 'OK') {
		const [pos] = await redis([['GET', pk]]);
		return Number(pos) || 0;
	}
	const [pos] = await redis([
		['INCR', ck],
		['EXPIRE', ck, KEY_TTL]
	]);
	await redis([['SET', pk, String(pos), 'EX', KEY_TTL]]);
	return Number(pos);
}

export async function solveCount(slug: string, day: number): Promise<number> {
	if (useMemory()) return memory.get(countKey(slug, day)) ?? 0;
	const [count] = await redis([['GET', countKey(slug, day)]]);
	return Number(count) || 0;
}

/** Dev tool: forget a day's solve count for a game. */
export async function resetSolves(slug: string, day: number): Promise<void> {
	const prefix = playerKey(slug, day, '');
	if (useMemory()) {
		memory.delete(countKey(slug, day));
		for (const k of [...memory.keys()]) if (k.startsWith(prefix)) memory.delete(k);
		return;
	}
	await redis([['DEL', countKey(slug, day)]]);
}
