import data from '$lib/data/critters.json';
import type { Entry, GameConfig } from '$lib/engine/types';
import { coins } from '$lib/money';
import { RARITIES, rarityColors, type RarityName } from '$lib/rarity';

/**
 * Critterdle, built by `npm run sync-wiki` from the wiki's Critters page. The coloured
 * dragonflies are one entry; gem squirrels and gem bunnies are groups (any of them is right).
 * "None" stands for the wiki's n/a: a critter that can't be sold or used as bait has 0 here.
 */
export interface Critter extends Entry {
	environment: string[];
	ai: string[];
	rarity: RarityName | 'None';
	/** Sell price in copper coins. */
	sell: number;
	/** Bait power in percent. */
	bait: number;
}

const lastLetter = (name: string) => [...name.replace(/[^\p{L}\p{N}]+$/u, '')].pop() ?? '';

export const critterGame: GameConfig<Critter> = {
	slug: 'critter',
	title: 'Critterdle',
	noun: 'critter',
	icon: (data as Critter[]).find((c) => c.name === 'Bunny')?.image ?? '',
	entries: data as Critter[],
	firstColumn: 'Critter',
	theme: (c) => (c.rarity === 'None' ? 'White' : c.rarity),
	// Some critters share every stat (the fairies, the cockatiels); the name tile shows which.
	allowLookalikes: true,
	attributes: [
		{ key: 'environment', label: 'Environment', kind: 'set', value: (c) => c.environment },
		{ key: 'ai', label: 'AI Type', kind: 'set', value: (c) => c.ai },
		{
			key: 'rarity',
			label: 'Rarity',
			kind: 'ranked',
			order: ['None', ...RARITIES],
			value: (c) => c.rarity,
			color: (c) => (c.rarity === 'None' ? undefined : rarityColors[c.rarity]),
			valueColor: (v) => rarityColors[v as RarityName]
		},
		{
			key: 'sell',
			label: 'Sell Price',
			kind: 'number',
			value: (c) => c.sell,
			display: (c) => coins(c.sell),
			format: 'coins'
		},
		{
			key: 'bait',
			label: 'Bait Power',
			kind: 'number',
			value: (c) => c.bait,
			display: (c) => (c.bait ? `${c.bait}%` : 'None')
		}
	],
	hints: [
		{ label: 'First Letter', reveal: (c) => ({ text: `Starts with "${c.name[0]}"` }) },
		{ label: 'Last Letter', reveal: (c) => ({ text: `Ends with "${lastLetter(c.name)}"` }) },
		{ label: 'Silhouette', reveal: (c) => ({ image: c.image ?? '', effect: 'silhouette' }) }
	]
};
