import type { Progress } from '$lib/progress.svelte';

/**
 * terraGauntlet's difficulty tiers and scoring: the one place to tune them.
 *
 * Every game pays a share of the perfect day (1 platinum). Wrong guesses cost a share of that
 * game's prize, and a game's score never goes below 0. Hints are free. An unsolved game is
 * worth 0 until it's solved.
 */
export const PERFECT_DAY = 1_000_000; // copper: 1 platinum

export interface Tier {
	name: string;
	/** UI icon (static/ui/<icon>.png): the game's difficulty-mode icons. */
	icon: string;
	/** Game slugs, easiest first. */
	games: string[];
	/** Each game's prize, in percent of the perfect day. */
	share: number;
	/** Lost per wrong guess, in percent of the game's prize. */
	missCost: number;
}

export const TIERS: Tier[] = [
	{
		name: 'Journey',
		icon: 'Journey Mode',
		games: ['boss', 'armor', 'fish'],
		share: 3,
		missCost: 5
	},
	{
		name: 'Classic',
		icon: 'Classic Mode',
		games: ['accessory', 'version', 'tooltip'],
		share: 7,
		missCost: 3.5
	},
	{ name: 'Expert', icon: 'Expert Mode', games: ['critter', 'enemy'], share: 13, missCost: 3.5 },
	{
		name: 'Master',
		icon: 'Master Mode',
		games: ['modifier', 'accessory-modifier'],
		share: 20,
		missCost: 2.5
	}
];

/** Bonus questions (Versiondle's "When was it changed?"), in percent of the perfect day. */
export const BONUS_SHARE: Record<string, number> = { version: 4 };

/** Word-by-word clues (Fishdle): each word revealed after the first, in percent of the prize. */
export const WORD_COST = 1;

/** Every game in the gauntlet, easiest first. */
export const ORDER = TIERS.flatMap((t) => t.games);

export const tierOf = (slug: string): Tier | undefined => TIERS.find((t) => t.games.includes(slug));

const percentOf = (total: number, percent: number) => Math.round((total * percent) / 100);

/** What solving a game pays with no wrong guesses. */
export const prize = (slug: string): number => percentOf(PERFECT_DAY, tierOf(slug)?.share ?? 0);

export const bonusPrize = (slug: string): number => percentOf(PERFECT_DAY, BONUS_SHARE[slug] ?? 0);

/** A game's coins for the day, from its saved progress. */
export function scoreFor(slug: string, progress: Progress | undefined): number {
	if (!progress?.finished) return 0;
	const tier = tierOf(slug);
	if (!tier) return 0;
	const full = prize(slug);
	const wrong = progress.guesses.length - 1;
	const extraWords = Math.max(0, (progress.words ?? 1) - 1);
	const lost = wrong * percentOf(full, tier.missCost) + extraWords * percentOf(full, WORD_COST);
	return Math.max(0, full - lost) + (progress.bonus?.finished ? bonusPrize(slug) : 0);
}
