import { describe, expect, it } from 'vitest';
import { accessoryGame } from '$lib/games/accessory';
import { bossGame } from '$lib/games/boss';
import { modifierGame } from '$lib/games/modifier';
import { summarizeValues } from './values';

const attr = <T extends { attributes: { key: string }[] }>(g: T, key: string) =>
	g.attributes.find((a) => a.key === key)! as T['attributes'][number];

describe('summarizeValues', () => {
	it('lists ranked values low to high, only those used', () => {
		const s = summarizeValues(attr(bossGame, 'stage'), bossGame.entries);
		expect(s.ordered).toBe(true);
		expect(s.values[0]).toBe('Pre-Hardmode');
		expect(s.values.at(-1)).toBe('Endgame');
	});

	it('gives number columns a formatted range', () => {
		const s = summarizeValues(attr(bossGame, 'hp'), bossGame.entries);
		expect(s.values).toEqual([]);
		expect(s.range).toEqual(['1,250', '145,000']);
	});

	it('flattens list columns and puts catch-alls last', () => {
		const s = summarizeValues(attr(bossGame, 'biomes'), bossGame.entries);
		expect(s.values).toContain('Jungle');
		expect(s.values.at(-1)).toBe('Any');
		expect(new Set(s.values).size).toBe(s.values.length);
	});

	it('uses display labels for yes/no and raw values for sets', () => {
		expect(summarizeValues(attr(accessoryGame, 'hardmode'), accessoryGame.entries).values).toEqual([
			'No',
			'Yes'
		]);
		const applies = summarizeValues(attr(modifierGame, 'appliesTo'), modifierGame.entries).values;
		expect(applies).toContain('Melee');
		expect(applies).not.toContain('All weapons');
	});

	it('shows stat names without amounts', () => {
		const s = summarizeValues(attr(modifierGame, 'effects'), modifierGame.entries);
		expect(s.values).toContain('Size');
		expect(s.values).toContain('Mana cost');
		expect(s.values.at(-1)).toBe('None');
		expect(s.values.some((v) => /\d/.test(v))).toBe(false);
	});
});
