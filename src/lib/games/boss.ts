import data from '$lib/data/bosses.json';
import type { Entry, GameConfig } from '$lib/engine/types';
import type { RarityName } from '$lib/rarity';

export interface Boss extends Entry {
	stage: string;
	hp: number;
	defense: number;
	biomes: string[];
	summon: string;
	body: string;
	time: string;
	summonHint: string;
	drop: string;
}

export const STAGES = [
	'Pre-Hardmode',
	'Early Hardmode',
	'Post-Mech',
	'Post-Plantera',
	'Post-Golem',
	'Endgame'
] as const;

const stageTheme: Record<string, RarityName> = {
	'Pre-Hardmode': 'Green',
	'Early Hardmode': 'Light Red',
	'Post-Mech': 'Pink',
	'Post-Plantera': 'Lime',
	'Post-Golem': 'Yellow',
	Endgame: 'Red'
};

export const bossGame: GameConfig<Boss> = {
	slug: 'boss',
	title: 'Boss Guesser',
	noun: 'boss',
	description: "Guess today's Terraria boss from its stats!",
	icon: '/bosses/Eye of Cthulhu.png',
	entries: data as Boss[],
	firstColumn: 'Boss',
	theme: (b) => stageTheme[b.stage] ?? 'White',
	attributes: [
		{
			key: 'stage',
			label: 'Stage',
			title: 'Pre-Hardmode → Endgame',
			kind: 'ranked',
			order: STAGES,
			value: (b) => b.stage
		},
		{
			key: 'hp',
			label: 'Max HP',
			title: 'Classic mode health',
			kind: 'number',
			value: (b) => b.hp,
			display: (b) => b.hp.toLocaleString('en-US')
		},
		{
			key: 'defense',
			label: 'Defense',
			title: 'Base defense',
			kind: 'number',
			value: (b) => b.defense
		},
		{
			key: 'biomes',
			label: 'Biome',
			title: 'Where it is fought',
			kind: 'set',
			value: (b) => b.biomes
		},
		{
			key: 'summon',
			label: 'Summon',
			title: 'Item, Break object, Event, Other',
			kind: 'exact',
			value: (b) => b.summon
		},
		{
			key: 'body',
			label: 'Body Type',
			title: 'Worm, Flying, Ground, Multi-part, Humanoid, Stationary',
			kind: 'exact',
			value: (b) => b.body
		},
		{ key: 'time', label: 'Time', title: 'Day, Night or Any', kind: 'exact', value: (b) => b.time }
	],
	hints: [
		{ label: 'Summoned By', reveal: (b) => ({ text: b.summonHint }) },
		{ label: 'Signature Drop', reveal: (b) => ({ text: b.drop }) },
		{ label: 'Silhouette', reveal: (b) => ({ image: b.image ?? '', effect: 'silhouette' }) }
	]
};
