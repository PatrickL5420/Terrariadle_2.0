import { describe, expect, it } from 'vitest';
import { accessoryGame } from '$lib/games/accessory';
import { bossGame } from '$lib/games/boss';
import { modifierGame } from '$lib/games/modifier';
import { compareEntries } from './compare';
import type { Attribute, Entry } from './types';
import { summarizeValues, valueKnowledge } from './values';

const attr = <T extends { attributes: { key: string }[] }>(g: T, key: string) =>
	g.attributes.find((a) => a.key === key)! as T['attributes'][number];

describe('summarizeValues', () => {
	it('lists ranked values low to high, only those used', () => {
		const s = summarizeValues(attr(accessoryGame, 'rarity'), accessoryGame.entries);
		expect(s.ordered).toBe(true);
		expect(s.values[0]).toBe('White');
		expect(s.values.at(-1)).toBe('Expert');
	});

	it('gives number columns a formatted range', () => {
		const s = summarizeValues(attr(bossGame, 'hp'), bossGame.entries);
		expect(s.values).toEqual([]);
		expect(s.range).toEqual(['800', '256,800']); // Dark Mage (tier 1) to Mechdusa
	});

	it('flattens list columns into a sorted list', () => {
		const s = summarizeValues(attr(bossGame, 'biomes'), bossGame.entries);
		expect(s.values).toContain('Jungle Temple');
		expect(s.values).toContain('Frost Moon');
		expect([...s.values]).toEqual([...s.values].sort((a, b) => a.localeCompare(b)));
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

describe('crossing out values a tile has ruled out', () => {
	const allGames = [bossGame, accessoryGame, modifierGame];
	const seen = (attrs: Attribute<Entry>[], guess: Entry, answer: Entry) => ({
		entry: guess,
		checks: compareEntries(attrs, guess, answer)
	});

	it("never crosses out the real answer's values", () => {
		let seed = 7;
		const rand = (n: number) => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % n;
		};
		for (const game of allGames) {
			const entries = game.entries as Entry[];
			const attrs = game.attributes as Attribute<Entry>[];
			for (let round = 0; round < 60; round++) {
				const answer = entries[rand(entries.length)];
				const guesses = Array.from({ length: 1 + rand(8) }, () =>
					seen(attrs, entries[rand(entries.length)], answer)
				);
				for (const attr of attrs) {
					const known = valueKnowledge(attr, summarizeValues(attr, entries), guesses);
					for (const v of summarizeValues(attr, [answer]).values) {
						expect(known.ruledOut.has(v), `${game.slug} ${attr.key} ${v}`).toBe(false);
					}
				}
			}
		}
	});

	const attrs = bossGame.attributes as Attribute<Entry>[];
	const entries = bossGame.entries as Entry[];
	const boss = (name: string) => entries.find((b) => b.name === name)!;
	const col = (key: string) => attrs.find((a) => a.key === key)!;
	const knowledge = (key: string, guesses: Entry[], answer: Entry) =>
		valueKnowledge(
			col(key),
			summarizeValues(col(key), entries),
			guesses.map((g) => seen(attrs, g, answer))
		);

	it('red crosses out the guess, green confirms and crosses out the rest', () => {
		const time = knowledge('time', [boss('Eye of Cthulhu')], boss('Golem')); // Night vs Any
		expect([...time.ruledOut]).toEqual(['Night']);
		const biome = knowledge('biomes', [boss('Golem')], boss('Golem'));
		expect([...biome.confirmed]).toEqual(['Jungle Temple']);
		expect(biome.ruledOut.has('Forest')).toBe(true);
	});

	it('arrows cut the scale, and only for the guesses that were made', () => {
		const accAttrs = accessoryGame.attributes as Attribute<Entry>[];
		const acc = accessoryGame.entries as Entry[];
		const item = (name: string) => acc.find((a) => a.name === name)!;
		const rarity = accAttrs.find((a) => a.key === 'rarity')!;
		const known = valueKnowledge(rarity, summarizeValues(rarity, acc), [
			seen(accAttrs, item('Hermes Boots'), item('Ankh Shield')) // Blue -> answer is higher
		]);
		expect(known.ruledOut.has('White')).toBe(true);
		expect(known.ruledOut.has('Blue')).toBe(true);
		expect(known.ruledOut.has('Red')).toBe(false);
		const hp = knowledge('hp', [boss('King Slime'), boss('Moon Lord')], boss('Golem'));
		expect(hp.bounds).toBe('More than 2,000; Less than 145,000');
	});

	it('yellow crosses out nothing', () => {
		// Queen Bee is Bee Hive + Jungle + Underground Jungle; Plantera is Underground Jungle.
		const biome = knowledge('biomes', [boss('Queen Bee')], boss('Plantera'));
		expect(biome.ruledOut.size).toBe(0);
	});
});
