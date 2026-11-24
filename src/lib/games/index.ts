import type { Entry, GameConfig } from '$lib/engine/types';
import { ORDER } from '$lib/gauntlet';
import { accessoryGame } from './accessory';
import { armorGame } from './armor';
import { bossGame } from './boss';
import { critterGame } from './critter';
import { enemyGame } from './enemy';
import { fishGame } from './fish';
import { accessoryModifierGame, modifierGame } from './modifier';
import { tooltipGame } from './tooltip';
import { versionGame } from './version';

const ALL = [
	bossGame,
	accessoryGame,
	modifierGame,
	accessoryModifierGame,
	armorGame,
	tooltipGame,
	fishGame,
	critterGame,
	enemyGame,
	versionGame
] as unknown as GameConfig<Entry>[];

/** Every game, easiest first (the gauntlet's order, see $lib/gauntlet). */
export const games = ORDER.map((slug) => ALL.find((g) => g.slug === slug)!);

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
