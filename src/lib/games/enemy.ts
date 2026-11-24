import data from '$lib/data/enemies.json';
import type { Entry, GameConfig } from '$lib/engine/types';

/**
 * Enemydle, built by `npm run sync-wiki` from the wiki's Enemies page: every enemy except
 * bosses, event bosses, boss servants and unspawnable ones. Stats are Classic mode; worms use
 * their head.
 */
export interface Enemy extends Entry {
	/** Wiki page, when it isn't the name (e.g. "Ghost (enemy)"). */
	page?: string;
	hardmode: boolean;
	/** The wiki's environment list, e.g. ["Jungle", "Underground Jungle"]; ["None"] if it has none. */
	environment: string[];
	hp: number;
	attack: number;
	ai: string;
	/** Detected by the Lifeform Analyzer as a rare creature. */
	rare: boolean;
	event: string;
	banner?: string;
}

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');

export const enemyGame: GameConfig<Enemy> = {
	slug: 'enemy',
	title: 'Enemydle',
	noun: 'enemy',
	icon: (data as Enemy[]).find((e) => e.name === 'Zombie')?.image ?? '',
	entries: data as Enemy[],
	firstColumn: 'Enemy',
	theme: (e) => (e.hardmode ? 'Pink' : 'Green'),
	// A few enemies share every stat (the biome mimics); the name tile shows which.
	allowLookalikes: true,
	wikiPage: (e) => e.page ?? e.name,
	attributes: [
		{
			key: 'hardmode',
			label: 'Hardmode',
			kind: 'exact',
			value: (e) => (e.hardmode ? 'Hardmode' : 'Pre-Hardmode')
		},
		{ key: 'environment', label: 'Environment', kind: 'set', value: (e) => e.environment },
		{ key: 'hp', label: 'HP', kind: 'number', value: (e) => e.hp },
		{ key: 'attack', label: 'Attack', kind: 'number', value: (e) => e.attack },
		{ key: 'ai', label: 'AI Type', kind: 'exact', value: (e) => e.ai },
		{ key: 'rare', label: 'Lifeform Analyzer', kind: 'exact', value: (e) => yesNo(e.rare) },
		{ key: 'event', label: 'Event', kind: 'exact', value: (e) => e.event }
	],
	hints: [
		{ label: 'First Letter', reveal: (e) => ({ text: `Starts with "${e.name[0]}"` }) },
		{
			label: 'Banner',
			reveal: (e) => (e.banner ? { image: e.banner, effect: 'none' } : { text: 'No banner' })
		},
		{ label: 'Silhouette', reveal: (e) => ({ image: e.image ?? '', effect: 'silhouette' }) }
	]
};
