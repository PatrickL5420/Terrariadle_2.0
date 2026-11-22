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
			title: 'When in progression the game expects you to fight it',
			kind: 'ranked',
			order: STAGES,
			value: (b) => b.stage
		},
		{
			key: 'hp',
			label: 'Max HP',
			title: 'Health in Classic mode, all parts combined',
			kind: 'number',
			value: (b) => b.hp,
			display: (b) => b.hp.toLocaleString('en-US')
		},
		{
			key: 'defense',
			label: 'Defense',
			title: 'Defense of the main body',
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
			title: 'How the fight starts',
			kind: 'exact',
			value: (b) => b.summon
		},
		{
			key: 'body',
			label: 'Body Type',
			title: 'Its shape and how it moves',
			kind: 'exact',
			value: (b) => b.body
		},
		{
			key: 'time',
			label: 'Time',
			title: 'When it can be fought',
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
