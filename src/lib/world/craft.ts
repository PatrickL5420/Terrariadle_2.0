/**
 * Crafting: the game's recipes for what the little world's player makes (Recipe.SetupRecipes),
 * and its rule for being at a crafting station (Player.AdjTiles: a station within the player's
 * reach, TileReachCheckSettings.Simple). Gel is taken as unlimited (no slimes here).
 */
import { WORK_BENCH } from './framing';
import { inRange, type Item } from './item-check';
import type { Player } from './player';

export const GEL = 23;
export const WOOD = 9;
export const TORCH_ITEM = 8;
export const WORK_BENCH_ITEM = 36;
export const WOODEN_DOOR = 25;
export const WOODEN_TABLE = 32;
export const WOODEN_CHAIR = 34;
export const WOOD_WALL = 93;

export interface Recipe {
	/** What's made, and how many. */
	item: number;
	stack: number;
	/** What it takes: [item, how many]. */
	needs: [number, number][];
	/** The crafting station it needs (a tile type), if any. */
	station?: number;
}

/** Recipe.SetupRecipes, for these items. */
export const RECIPES: Recipe[] = [
	{
		item: TORCH_ITEM,
		stack: 3,
		needs: [
			[GEL, 1],
			[WOOD, 1]
		]
	},
	{ item: WORK_BENCH_ITEM, stack: 1, needs: [[WOOD, 10]] },
	{ item: WOOD_WALL, stack: 4, needs: [[WOOD, 1]], station: WORK_BENCH },
	{ item: WOODEN_DOOR, stack: 1, needs: [[WOOD, 6]], station: WORK_BENCH },
	{ item: WOODEN_CHAIR, stack: 1, needs: [[WOOD, 4]], station: WORK_BENCH },
	{ item: WOODEN_TABLE, stack: 1, needs: [[WOOD, 8]], station: WORK_BENCH }
];

export const recipe = (item: number) => RECIPES.find((r) => r.item === item)!;

/** How many of an item are in the inventory (gel: unlimited). */
export function count(inventory: Item[], type: number): number {
	if (type === GEL) return Infinity;
	return inventory.reduce((n, it) => n + (it.type === type ? it.stack : 0), 0);
}

/** Player.AdjTiles: whether a tile of `station` is within the player's reach. */
export function atStation(p: Player, at: (i: number, j: number) => number, station: number) {
	const ci = Math.trunc(p.center.x / 16);
	const cj = Math.trunc(p.center.y / 16);
	for (let i = ci - 8; i <= ci + 8; i++)
		for (let j = cj - 6; j <= cj + 6; j++)
			if (at(i, j) === station && inRange(p, i, j, 0)) return true;
	return false;
}

/** Whether it has what the recipe takes (not counting the station). */
export const hasFor = (inventory: Item[], r: Recipe) =>
	r.needs.every(([type, n]) => count(inventory, type) >= n);

/**
 * Main.CraftItem: takes what the recipe needs out of the inventory and puts what it makes in
 * (onto a stack of it, or into an empty slot). False if it can't.
 */
export function craft(inventory: Item[], r: Recipe): boolean {
	if (!hasFor(inventory, r)) return false;
	const slot =
		inventory.find((it) => it.type === r.item) ??
		inventory.find((it) => it.type === 0) ??
		inventory.find((it) => !it.stack);
	if (!slot) return false;
	for (const [type, n] of r.needs) {
		if (type === GEL) continue;
		let left = n;
		for (const it of inventory) {
			if (it.type !== type || !left) continue;
			const take = Math.min(left, it.stack);
			it.stack -= take;
			left -= take;
		}
	}
	slot.type = r.item;
	slot.stack += r.stack;
	return true;
}
