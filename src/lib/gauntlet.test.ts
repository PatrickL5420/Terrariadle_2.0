import { describe, expect, it } from 'vitest';
import { games } from '$lib/games';
import type { Progress } from '$lib/progress.svelte';
import { coins, dropStacks, splitCoins, COIN_VALUE } from '$lib/money';
import { BONUS_SHARE, ORDER, PERFECT_DAY, TIERS, bonusPrize, prize, scoreFor } from './gauntlet';

const progress = (guesses: number, extra: Partial<Progress> = {}): Progress => ({
	day: 1,
	guesses: Array.from({ length: guesses }, (_, i) => ({ id: i, checks: {} })),
	finished: true,
	position: 0,
	hints: [null, null, null],
	...extra
});

describe('the gauntlet', () => {
	it('has every game once, easiest first, in the game order', () => {
		expect([...ORDER].sort()).toEqual(games.map((g) => g.slug).sort());
		expect(games.map((g) => g.slug)).toEqual(ORDER);
		expect(new Set(ORDER).size).toBe(ORDER.length);
	});

	it('pays exactly 1 platinum for a perfect day', () => {
		const shares =
			TIERS.reduce((sum, t) => sum + t.share * t.games.length, 0) +
			Object.values(BONUS_SHARE).reduce((a, b) => a + b, 0);
		expect(shares).toBe(100);
		const total = ORDER.reduce((sum, s) => sum + prize(s) + bonusPrize(s), 0);
		expect(total).toBe(PERFECT_DAY);
	});

	it('pays more for harder tiers', () => {
		const prizes = TIERS.map((t) => prize(t.games[0]));
		expect(prizes).toEqual([...prizes].sort((a, b) => a - b));
	});
});

describe('scoreFor', () => {
	it('is 0 until solved', () => {
		expect(scoreFor('boss', undefined)).toBe(0);
		expect(scoreFor('boss', progress(3, { finished: false }))).toBe(0);
	});

	it('pays the full prize for a first-guess solve and loses some per wrong guess', () => {
		expect(scoreFor('boss', progress(1))).toBe(prize('boss'));
		expect(scoreFor('boss', progress(3))).toBe(prize('boss') * 0.9); // 2 wrong x 5%
	});

	it('never goes below 0', () => {
		expect(scoreFor('boss', progress(500))).toBe(0);
	});

	it("charges Fishdle's extra words and pays Versiondle's bonus", () => {
		expect(scoreFor('fish', progress(1, { words: 11 }))).toBe(prize('fish') * 0.9);
		const bonus = { guesses: [], finished: true };
		expect(scoreFor('version', progress(1, { bonus }))).toBe(
			prize('version') + bonusPrize('version')
		);
	});
});

describe('money', () => {
	it('splits and formats coins', () => {
		expect(splitCoins(1_020_005)).toEqual({ platinum: 1, gold: 2, silver: 0, copper: 5 });
		expect(coins(750)).toBe('7s 50c');
		expect(coins(100_000)).toBe('10g');
		expect(coins(0)).toBe('None');
	});

	it('drops stacks that add up to the amount', () => {
		for (const amount of [1, 99, 30_000, 24_550, 1_000_000, 987_654]) {
			const stacks = dropStacks(amount);
			expect(stacks.length).toBeLessThanOrEqual(20);
			expect(stacks.reduce((sum, s) => sum + s.count * COIN_VALUE[s.coin], 0)).toBe(amount);
		}
	});
});
