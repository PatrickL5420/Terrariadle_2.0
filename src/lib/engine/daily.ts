/**
 * Every puzzle rolls over at midnight in this time zone.
 * Shared by the browser and the server so both agree on what "today" is.
 */
export const RESET_TIME_ZONE = 'Australia/Sydney';

const DAY_MS = 86_400_000;

function zonedParts(now: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		hourCycle: 'h23'
	}).formatToParts(now);
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
	return {
		year: get('year'),
		month: get('month'),
		day: get('day'),
		hour: get('hour'),
		minute: get('minute'),
		second: get('second')
	};
}

/** Days since 1970-01-01 in the reset time zone. Increments once per day at local midnight. */
export function dayNumber(now = new Date(), timeZone = RESET_TIME_ZONE): number {
	const p = zonedParts(now, timeZone);
	return Math.round(Date.UTC(p.year, p.month - 1, p.day) / DAY_MS);
}

/** Seconds until the next puzzle (ignores the rare 23/25-hour DST day). */
export function secondsUntilReset(now = new Date(), timeZone = RESET_TIME_ZONE): number {
	const p = zonedParts(now, timeZone);
	return 86_400 - (p.hour * 3600 + p.minute * 60 + p.second);
}

/** FNV-1a: small, deterministic string hash. */
function hash(str: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/** mulberry32 PRNG */
function rng(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function shuffledCycle(ids: number[], seed: string, cycle: number): number[] {
	const out = [...ids];
	const rand = rng(hash(`${seed}:${cycle}`));
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * Picks the answer for a given day. The pool is walked in a secret shuffled order, so no answer
 * repeats until every entry has been used, and no answer appears two days in a row.
 *
 * Note: adding or removing entries reshuffles the order, which can change the current day's
 * answer. Deploy data changes right after the daily reset.
 */
export function pickDaily(poolIds: number[], seed: string, day: number): number {
	const ids = [...poolIds].sort((a, b) => a - b);
	const n = ids.length;
	if (n === 0) throw new Error('empty answer pool');
	if (n === 1) return ids[0];

	const cycle = Math.floor(day / n);
	const order = shuffledCycle(ids, seed, cycle);
	// Avoid a repeat across the boundary between two cycles.
	const prev = shuffledCycle(ids, seed, cycle - 1);
	if (order[0] === prev[n - 1]) [order[0], order[1]] = [order[1], order[0]];

	return order[((day % n) + n) % n];
}
