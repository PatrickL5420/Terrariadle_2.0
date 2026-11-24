import { describe, expect, it } from 'vitest';
import { isCorrect } from '$lib/engine/compare';
import { coins } from '$lib/money';
import { critterGame } from './critter';

const byName = (name: string) => critterGame.entries.find((c) => c.name === name)!;

describe('Critterdle data', () => {
	it('combines the coloured dragonflies into one critter', () => {
		const names = critterGame.entries.map((c) => c.name);
		expect(names).toContain('Dragonfly');
		expect(names).toContain('Gold Dragonfly');
		expect(names.filter((n) => /^(Black|Blue|Green|Orange|Red|Yellow) Dragonfly$/.test(n))).toEqual(
			[]
		);
		expect(byName('Dragonfly').environment.sort()).toEqual(['Desert', 'Forest']);
	});

	it('treats every gem squirrel (and gem bunny) as the same answer', () => {
		for (const group of ['Gem Squirrel', 'Gem Bunny']) {
			const members = critterGame.entries.filter((c) => c.group === group);
			expect(members).toHaveLength(7);
			// Only one can be picked as the daily answer, so the group isn't 7x as likely.
			expect(members.filter((c) => c.pool !== false)).toHaveLength(1);
			for (const a of members) for (const b of members) expect(isCorrect(a, b)).toBe(true);
		}
		expect(isCorrect(byName('Ruby Squirrel'), byName('Ruby Bunny'))).toBe(false);
		expect(isCorrect(byName('Squirrel'), byName('Ruby Squirrel'))).toBe(false);
	});

	it('uses None for the wiki n/a values', () => {
		const dolphin = byName('Dolphin');
		expect([dolphin.rarity, coins(dolphin.sell), dolphin.bait]).toEqual(['None', 'None', 0]);
		expect(byName('Goldfish').environment).toEqual(['None']);
	});
});
