import data from '$lib/data/accessories.json';
import type { Entry, GameConfig } from '$lib/engine/types';
import { RARITIES, rarityColors, type RarityName } from '$lib/rarity';

export interface Accessory extends Entry {
	rarity: RarityName;
	hardmode: boolean;
	functions: string[];
	classes: string[];
	sources: string[];
	/** 0 = base item; +1 for each combining step at the Tinkerer's Workshop. */
	tier: number;
	defense: number;
	expertOnly: boolean;
	where: string;
	tooltip: string;
	/** false = imported from the wiki with guessed Function/Class/Source/where; see review/. */
	reviewed?: boolean;
	/** Hidden from the game, with the reason (e.g. identical to another accessory). */
	exclude?: string;
}

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

export const accessoryGame: GameConfig<Accessory> = {
	slug: 'accessory',
	title: 'Accessory Guesser',
	noun: 'accessory',
	description: "Guess today's Terraria accessory from its stats!",
	// Follows the data file, so it becomes a local image after `npm run fetch-images`.
	icon: (data as Accessory[]).find((a) => a.name === 'Hermes Boots')?.image ?? '',
	entries: (data as Accessory[]).filter((a) => !a.exclude),
	firstColumn: 'Accessory',
	// Many accessories differ only in details the columns don't cover (e.g. wing flight time).
	allowLookalikes: true,
	theme: (a) => a.rarity,
	attributes: [
		{
			key: 'rarity',
			label: 'Rarity',
			title: 'Item rarity (the colour of its name)',
			kind: 'ranked',
			order: RARITIES,
			value: (a) => a.rarity,
			color: (a) => rarityColors[a.rarity],
			valueColor: (v) => rarityColors[v as RarityName]
		},
		{
			key: 'hardmode',
			label: 'Hardmode',
			title: 'Only obtainable in Hardmode?',
			kind: 'exact',
			value: (a) => a.hardmode,
			display: (a) => yesNo(a.hardmode)
		},
		{
			key: 'functions',
			label: 'Function',
			title: 'What it does',
			kind: 'set',
			value: (a) => a.functions
		},
		{
			key: 'classes',
			label: 'Class Boost',
			title: 'Which damage class it boosts',
			kind: 'set',
			value: (a) => a.classes
		},
		{
			key: 'sources',
			label: 'Source',
			title: 'Where you get it',
			kind: 'set',
			value: (a) => a.sources
		},
		{
			key: 'tier',
			label: 'Crafting Tier',
			title: "0 = base item, +1 for each Tinkerer's Workshop combination",
			kind: 'number',
			value: (a) => a.tier
		},
		{
			key: 'defense',
			label: 'Defense',
			title: 'Defense granted when equipped',
			kind: 'number',
			value: (a) => a.defense
		},
		{
			key: 'expertOnly',
			label: 'Expert Only',
			title: 'Only available in Expert or Master mode?',
			kind: 'exact',
			value: (a) => a.expertOnly,
			display: (a) => yesNo(a.expertOnly)
		}
	],
	hints: [
		{ label: 'Tooltip', reveal: (a) => ({ text: a.tooltip }) },
		{ label: 'Image Clue', reveal: (a) => ({ image: a.image ?? '', effect: 'blur' }) },
		{ label: 'Where Found', reveal: (a) => ({ text: a.where }) }
	]
};
