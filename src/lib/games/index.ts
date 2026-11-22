import type { Entry, GameConfig } from '$lib/engine/types';
import { accessoryGame } from './accessory';
import { armorGame } from './armor';
import { bossGame } from './boss';
import { accessoryModifierGame, modifierGame } from './modifier';
import { tooltipGame } from './tooltip';

/** Every game mode, in the order shown in the header and on the home page. */
export const games = [
	bossGame,
	accessoryGame,
	modifierGame,
	accessoryModifierGame,
	armorGame,
	tooltipGame
] as unknown as GameConfig<Entry>[];

export const gameSlugs = games.map((g) => g.slug);

export function getGame(slug: string): GameConfig<Entry> | undefined {
	return games.find((g) => g.slug === slug);
}

export function getEntry(game: GameConfig<Entry>, id: number): Entry | undefined {
	return game.entries.find((e) => e.id === id);
}

export function answerPool(game: GameConfig<Entry>): number[] {
	return game.entries.filter((e) => e.pool !== false).map((e) => e.id);
}
