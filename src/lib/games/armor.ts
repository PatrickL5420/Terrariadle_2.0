import data from '$lib/data/armor.json';
import type { Entry, GameConfig } from '$lib/engine/types';
import { RARITIES, rarityColors, type RarityName } from '$lib/rarity';

/**
 * One armor set, or one class variant of a set (e.g. "Chlorophyte armor (Summon)"), or a
 * single piece / Wizard hat from the Armor page's "Other" sections. Built entirely from the
 * wiki by `npm run sync-wiki`.
 */
export interface ArmorSet extends Entry {
	/** Total defense of the whole set (this variant's helmet + chest + legs). */
	defense: number;
	rarity: RarityName;
	/** Section of the wiki's Armor page: Pre-Hardmode, Hardmode or Other. */
	category: string;
	/** Melee, Ranged, Magic, Summon, None, or Mixed. */
	class: string;
	/** The wiki's obtain categories across its pieces: Craftable, Drop, Loot, Vendor, ... */
	obtained: string[];
	/** Set bonus text (or "No set bonus") for the first hint. */
	setBonus: string;
}

export const armorGame: GameConfig<ArmorSet> = {
	slug: 'armor',
	title: 'Armordle',
	noun: 'armor set',
	description: "Guess today's Terraria armor set from its stats!",
	// Follows the data file, so it becomes a local image after `npm run fetch-images`.
	icon: (data as ArmorSet[]).find((a) => a.name === 'Mining armor')?.image ?? '',
	entries: data as ArmorSet[],
	firstColumn: 'Armor',
	// Class variants like "Chlorophyte armor (Summon)" link to the set's page.
	wikiPage: (a) => a.name.replace(/ \((?:Melee|Ranged|Magic|Summon|Hood|Mask)\)$/, ''),
	theme: (a) => a.rarity,
	// Sibling sets (e.g. some wood sets) can share every column.
	allowLookalikes: true,
	attributes: [
		{
			key: 'defense',
			label: 'Defense',
			title: 'Total defense of the whole set',
			kind: 'number',
			value: (a) => a.defense
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
			key: 'class',
			label: 'Class',
			title: 'Which damage class the set is for',
			kind: 'exact',
			value: (a) => a.class
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
