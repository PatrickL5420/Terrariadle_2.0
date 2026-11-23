import data from '$lib/data/bosses.json';
import type { Entry, GameConfig } from '$lib/engine/types';
import type { RarityName } from '$lib/rarity';

export interface Boss extends Entry {
	/** The wiki's boss category: Pre-Hardmode, Hardmode, Event or Special seed. */
	category: string;
	hp: number;
	/** null when there's no single value (Mechdusa's parts all differ); shown as "Mixed". */
	defense: number | null;
	biomes: string[];
	summon: string;
	body: string;
	time: string;
	summonHint: string;
	drop: string;
}

const categoryTheme: Record<string, RarityName> = {
	'Pre-Hardmode': 'Green',
	Hardmode: 'Pink',
	Event: 'Orange',
	'Special seed': 'Red'
};

export const bossGame: GameConfig<Boss> = {
	slug: 'boss',
	title: 'Bossdle',
	noun: 'boss',
	icon: '/bosses/Eye of Cthulhu.png',
	entries: data as Boss[],
	firstColumn: 'Boss',
	theme: (b) => categoryTheme[b.category] ?? 'White',
	// The four Celestial Pillars share every stat; the name tile shows which guess is right.
	allowLookalikes: true,
	attributes: [
		{
			key: 'category',
			label: 'Category',
			kind: 'exact',
			value: (b) => b.category
		},
		{
			key: 'hp',
			label: 'Max HP',
			kind: 'number',
			value: (b) => b.hp,
			display: (b) => b.hp.toLocaleString('en-US')
		},
		{
			key: 'defense',
			label: 'Defense',
			kind: 'number',
			value: (b) => b.defense,
			display: (b) => (b.defense === null ? 'Mixed' : String(b.defense))
		},
		{
			key: 'biomes',
			label: 'Biome',
			kind: 'set',
			value: (b) => b.biomes
		},
		{
			key: 'summon',
			label: 'Summon',
			kind: 'exact',
			value: (b) => b.summon
		},
		{
			key: 'body',
			label: 'Body Type',
			kind: 'exact',
			value: (b) => b.body
		},
		{
			key: 'time',
			label: 'Time',
			kind: 'exact',
			value: (b) => b.time
		}
	],
	hints: [
		{ label: 'Summoned By', reveal: (b) => ({ text: b.summonHint }) },
		{ label: 'Signature Drop', reveal: (b) => ({ text: b.drop }) },
		{ label: 'Silhouette', reveal: (b) => ({ image: b.image ?? '', effect: 'silhouette' }) }
	]
};
