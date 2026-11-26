import { describe, expect, it } from 'vitest';
import { AIR, DIRT, isSolid, TORCH, WOOD_BLOCK } from '../framing';
import { house, needs, next, tower, type BuildMap } from './build';

/** A flat world: air above row `ground`, dirt from it down; placing needs a neighbour. */
function flat(ground = 20, w = 40, h = 30) {
	const grid = new Map<string, number>();
	const at = (i: number, j: number) => grid.get(`${i},${j}`) ?? (j >= ground ? DIRT : AIR);
	const m: BuildMap & { set(i: number, j: number, t: number): void } = {
		width: w,
		height: h,
		maxTilesX: w,
		maxTilesY: h + 40,
		at,
		solid: (i, j) => isSolid(at(i, j)),
		inView: (i, j) => i > 0 && i < w - 1 && j >= 0 && j < h,
		top: (i) => {
			for (let j = 0; j < h; j++) if (isSolid(at(i, j))) return j;
			return h;
		},
		placeable: (i, j, torch) =>
			at(i, j) === AIR &&
			(torch
				? isSolid(at(i, j + 1)) || isSolid(at(i - 1, j)) || isSolid(at(i + 1, j))
				: [
						[1, 0],
						[-1, 0],
						[0, 1],
						[0, -1]
					].some(([di, dj]) => isSolid(at(i + di, j + dj)))),
		set: (i, j, t) => grid.set(`${i},${j}`, t)
	};
	return m;
}

/** Does what `next` says until it's done (or 500 steps): mining clears, placing places. */
function build(m: ReturnType<typeof flat>, b: ReturnType<typeof house>) {
	for (let n = 0; n < 500; n++) {
		const s = next(m, b, 10);
		if (s.kind === 'done') return true;
		if (s.kind === 'stuck') return false;
		const [i, j] = s.tile;
		if (s.kind === 'mine' || s.kind === 'chop') m.set(i, j, AIR);
		else m.set(i, j, s.need === 'wood' ? WOOD_BLOCK : s.need === 'torch' ? TORCH : DIRT);
	}
	return false;
}

describe('building (ai/build)', () => {
	it('a house: floor, walls, roof, a doorway 3 high and a torch inside', () => {
		const m = flat();
		const b = house(10, 20, -1);
		expect(needs(m, b)).toEqual({ block: 0, wood: 27, torch: 1 });
		expect(build(m, b)).toBe(true);
		// The doorway on the left, the right wall whole, the roof on top.
		for (const j of [16, 17, 18]) expect(m.at(10, j)).toBe(AIR);
		for (let j = 13; j <= 18; j++) expect(m.at(19, j)).toBe(WOOD_BLOCK);
		for (let i = 10; i <= 19; i++) expect(m.at(i, 13)).toBe(WOOD_BLOCK);
		expect(m.at(18, 16)).toBe(TORCH);
	});

	it('flattens bumpy ground first, filling the dips', () => {
		const m = flat();
		m.set(12, 19, DIRT); // a bump
		m.set(15, 20, AIR); // a dip
		const b = house(10, 20, 1);
		expect(build(m, b)).toBe(true);
		expect(m.at(12, 19)).toBe(WOOD_BLOCK); // the floor's where the bump was
		expect(isSolid(m.at(15, 20))).toBe(true);
	});

	it('a tower: a pole, a deck on top, a torch on the deck', () => {
		const m = flat();
		const b = tower(20, 20);
		expect(build(m, b)).toBe(true);
		for (let j = 14; j < 20; j++) expect(m.at(20, j)).toBe(WOOD_BLOCK);
		for (let i = 18; i <= 22; i++) expect(m.at(i, 13)).toBe(WOOD_BLOCK);
		expect(m.at(20, 12)).toBe(TORCH);
	});
});
