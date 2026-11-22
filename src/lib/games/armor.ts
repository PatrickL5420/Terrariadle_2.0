import data from '$lib/data/armor.json';
import type { Entry, GameConfig } from '$lib/engine/types';
import { RARITIES, rarityColors, type RarityName } from '$lib/rarity';

/** One armor piece. Built entirely from the wiki by `npm run sync-wiki`. */
export interface ArmorPiece extends Entry {
	/** The set it belongs to ("" for standalone pieces like Goggles). */
	set: string;
	slot: 'Head' | 'Chest' | 'Legs';
	defense: number;
	rarity: RarityName;
	/** Section of the wiki's Armor page: Pre-Hardmode, Hardmode or Other. */
	category: string;
	/** The wiki's obtain categories: Craftable, Drop, Loot, Bag loot, Vendor, Fished, Quest reward. */
	obtained: string[];
	/** Set bonus text (or "No set bonus") for the first hint. */
	setBonus: string;
}

export const armorGame: GameConfig<ArmorPiece> = {
	slug: 'armor',
	title: 'Armordle',
	noun: 'armor piece',
	description: "Guess today's Terraria armor piece from its stats!",
	// Follows the data file, so it becomes a local image after `npm run fetch-images`.
	icon: (data as ArmorPiece[]).find((a) => a.name === 'Mining Helmet')?.image ?? '',
	entries: data as ArmorPiece[],
	firstColumn: 'Armor',
	theme: (a) => a.rarity,
	// Pieces from sibling sets (e.g. Copper vs Tin) can share every column.
	allowLookalikes: true,
	attributes: [
		{
			key: 'defense',
			label: 'Defense',
			title: 'Defense of this piece',
			kind: 'number',
			value: (a) => a.defense
		},
		{
			key: 'slot',
			label: 'Slot',
			title: 'Which armor slot it goes in',
			kind: 'exact',
			value: (a) => a.slot
		},
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
			key: 'category',
			label: 'Category',
			title: "Section of the wiki's Armor page (Other = Wizard set and single pieces)",
			kind: 'exact',
			value: (a) => a.category
		},
		{
			key: 'obtained',
			label: 'Obtained',
			title: 'How you get it',
			kind: 'set',
			value: (a) => a.obtained
		}
	],
	hints: [
		{ label: 'Set Bonus', reveal: (a) => ({ text: a.setBonus }) },
		{ label: 'Image Clue', reveal: (a) => ({ image: a.image ?? '', effect: 'blur' }) },
		{ label: 'First Letter', reveal: (a) => ({ text: `Starts with "${a.name[0]}"` }) }
	]
};
