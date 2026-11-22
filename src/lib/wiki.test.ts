import { describe, expect, it } from 'vitest';
import type { Entry, GameConfig } from '$lib/engine/types';
import { accessoryGame } from '$lib/games/accessory';
import { modifierGame } from '$lib/games/modifier';
import { wikiUrl } from './wiki';

const entry = (name: string): Entry => ({ id: 0, name });

describe('wikiUrl', () => {
	it('links to the page named after the entry', () => {
		const game = accessoryGame as unknown as GameConfig<Entry>;
		expect(wikiUrl(game, entry("Paladin's Shield"))).toBe(
			"https://terraria.wiki.gg/wiki/Paladin's_Shield"
		);
		expect(wikiUrl(game, entry('R.E.K. 3000'))).toBe('https://terraria.wiki.gg/wiki/R.E.K._3000');
	});

	it('links modifiers to their section, without our name suffixes', () => {
		const game = modifierGame as unknown as GameConfig<Entry>;
		expect(wikiUrl(game, entry('Legendary'))).toBe(
			'https://terraria.wiki.gg/wiki/Modifiers#Legendary'
		);
		expect(wikiUrl(game, entry('Quick (Accessory)'))).toBe(
			'https://terraria.wiki.gg/wiki/Modifiers#Quick'
		);
	});
});
