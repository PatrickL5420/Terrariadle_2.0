import { describe, expect, it } from 'vitest';
import { AIR, DIRT, isSolid, TORCH, WOOD_BLOCK } from '../framing';
import { FURNITURE_TILE, house, needs, next, tower, type BuildMap } from './build';

/** A flat world: air above row `ground`, dirt from it down; placing needs a neighbour. */
function flat(ground = 20, w = 40, h = 30) {
	const grid = new Map<string, number>();
	const walls = new Map<string, number>();
	const at = (i: number, j: number) => grid.get(`${i},${j}`) ?? (j >= ground ? DIRT : AIR);
	const m: BuildMap & {
		set(i: number, j: number, t: number): void;
		setWall(i: number, j: number, t: number): void;
	} = {
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
		wallAt: (i, j) => walls.get(`${i},${j}`) ?? 0,
		placeable: (i, j, need) => {
			const wall = (a: number, b: number) => (walls.get(`${a},${b}`) ?? 0) > 0;
			const around: [number, number][] = [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1]
			];
			// A wall: a block or wall beside it. A block: a block or wall beside it, or a wall
			// behind (canPlaceAt). Furniture: standing on something (doors: hung between).
			if (need === 'wall')
				return (
					!wall(i, j) && around.some(([a, b]) => at(i + a, j + b) !== AIR || wall(i + a, j + b))
				);
			if (at(i, j) !== AIR) return false;
			if (need === 'torch')
				return (
					wall(i, j) || isSolid(at(i, j + 1)) || isSolid(at(i - 1, j)) || isSolid(at(i + 1, j))
				);
			if (FURNITURE_TILE[need] !== undefined)
				return need === 'door' ? isSolid(at(i, j - 1)) : isSolid(at(i, j + 1));
			return wall(i, j) || around.some(([a, b]) => isSolid(at(i + a, j + b)) || wall(i + a, j + b));
		},
		setWall: (i: number, j: number, t: number) => walls.set(`${i},${j}`, t),
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
		else if (s.need === 'wall') m.setWall(i, j, 4);
		else if (FURNITURE_TILE[s.need] !== undefined) {
			const piece = b.pieces.find((p) => p.i === i && p.j === j && p.need === s.need)!;
			for (const [a, c] of piece.area ?? [[i, j]]) m.set(a, c, FURNITURE_TILE[s.need]!);
		} else m.set(i, j, s.need === 'wood' ? WOOD_BLOCK : s.need === 'torch' ? TORCH : DIRT);
	}
	return false;
}

describe('building (ai/build)', () => {
	it('a house: floor, walls, roof, a door, a wall behind, furniture and a torch inside', () => {
		const m = flat();
		const b = house(10, 20, -1);
		expect(needs(m, b)).toMatchObject({
			block: 0,
			wood: 24,
			torch: 1,
			wall: 40,
			bench: 1,
			door: 2
		});
		expect(build(m, b)).toBe(true);
		// Doors both sides, the roof on top, furniture on the floor, the torch on the back wall.
		for (const j of [16, 17, 18]) expect(m.at(10, j)).toBe(10);
		for (const j of [16, 17, 18]) expect(m.at(19, j)).toBe(10);
		expect(m.at(12, 18)).toBe(18);
		expect(m.at(15, 17)).toBe(14);
		expect(m.at(17, 18)).toBe(15);
		expect(m.wallAt(14, 15)).toBe(4);
		for (let j = 13; j <= 15; j++) expect(m.at(19, j)).toBe(WOOD_BLOCK);
		for (let i = 10; i <= 19; i++) expect(m.at(i, 13)).toBe(WOOD_BLOCK);
		expect(m.at(14, 15)).toBe(TORCH);
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
