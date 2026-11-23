import data from '$lib/data/fish.json';
import type { Entry, GameConfig } from '$lib/engine/types';

/**
 * Fishdle: you're shown the Angler's quest quote and guess the quest fish. Built by
 * `npm run sync-wiki` from the wiki's Angler/Quests page. The quotes are server-only: see
 * $lib/server/fish-quotes.json.
 */
export interface Fish extends Entry {
	height: string;
	biome: string;
}

export const fishGame: GameConfig<Fish> = {
	slug: 'fish',
	title: 'Fishdle',
	noun: 'quest fish',
	icon: (data as Fish[]).find((f) => f.name === 'Batfish')?.image ?? '',
	entries: data as Fish[],
	firstColumn: 'Fish',
	theme: () => 'Blue',
	// No columns: every wrong guess is just red.
	allowLookalikes: true,
	clueLabel: "Angler's quest",
	clueByWord: true,
	attributes: [],
	hints: [
		{ label: 'Height', reveal: (f) => ({ text: f.height }) },
		{ label: 'Biome', reveal: (f) => ({ text: f.biome }) },
		{ label: 'First Letter', reveal: (f) => ({ text: `Starts with "${f.name[0]}"` }) }
	]
};
