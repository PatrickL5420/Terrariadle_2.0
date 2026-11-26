import { describe, expect, it } from 'vitest';
import { craft, recipe, WOOD, WORK_BENCH_ITEM, WOOD_WALL, TORCH_ITEM } from './craft';

describe('crafting (Recipe, Main.CraftItem)', () => {
	it('makes a work bench from 10 wood, and walls 4 at a time from 1', () => {
		const inv = [
			{ type: WOOD, stack: 12 },
			{ type: 0, stack: 0 },
			{ type: 0, stack: 0 }
		];
		expect(craft(inv, recipe(WORK_BENCH_ITEM))).toBe(true);
		expect(inv).toEqual([
			{ type: WOOD, stack: 2 },
			{ type: WORK_BENCH_ITEM, stack: 1 },
			{ type: 0, stack: 0 }
		]);
		expect(craft(inv, recipe(WOOD_WALL))).toBe(true);
		expect(inv[2]).toEqual({ type: WOOD_WALL, stack: 4 });
		expect(craft(inv, recipe(WORK_BENCH_ITEM))).toBe(false);
	});

	it('makes 3 torches from a wood (and gel, which is taken as unlimited)', () => {
		const inv = [
			{ type: WOOD, stack: 1 },
			{ type: 0, stack: 0 }
		];
		expect(craft(inv, recipe(TORCH_ITEM))).toBe(true);
		expect(inv[1]).toEqual({ type: TORCH_ITEM, stack: 3 });
	});
});
