/**
 * Collision: TileCollision, StepUp and StepDown on a small world of blocks, a body and a
 * velocity. The oracle runs the game's Collision (oracle/features/Collision.cs).
 */
import { f, stepDown, stepUp, tileCollision, type TileMap } from '$lib/world/collision';

export interface CollisionCase {
	w: number;
	h: number;
	/** Solid blocks, [i, j, type]. */
	cells: [number, number, number][];
	op: 'tile' | 'stepUp' | 'stepDown';
	x: number;
	y: number;
	vx: number;
	vy: number;
	width: number;
	height: number;
	stepSpeed: number;
	gfxOffY: number;
}

export type CollisionResult =
	| { vx: number; vy: number; up: boolean; down: boolean }
	| { x: number; y: number; vx: number; vy: number; stepSpeed: number; gfxOffY: number };

/** A TileMap of the case's blocks. */
export function tileMap(c: { w: number; h: number; cells: [number, number, number][] }): TileMap {
	const solid = new Uint8Array(c.w * c.h);
	for (const [i, j] of c.cells) solid[j * c.w + i] = 1;
	return {
		maxTilesX: c.w,
		maxTilesY: c.h,
		solid: (i, j) => i >= 0 && j >= 0 && i < c.w && j < c.h && solid[j * c.w + i] === 1
	};
}

export function runCollision(c: CollisionCase): CollisionResult {
	const m = tileMap(c);
	const body = { x: c.x, y: c.y, w: c.width, h: c.height, vx: c.vx, vy: c.vy };
	if (c.op === 'tile') return tileCollision(m, body);
	const s = { stepSpeed: c.stepSpeed, gfxOffY: c.gfxOffY };
	if (c.op === 'stepUp') stepUp(m, body, s);
	else stepDown(m, body, s);
	return { x: body.x, y: body.y, vx: body.vx, vy: body.vy, ...s };
}

/** The game's floats arrive as JSON text: back to singles. */
export const froundAll = <R extends object>(r: R): R =>
	Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? f(v) : v])) as R;

/**
 * A random case: rough ground (or scattered blocks) around a body of the player's size or an
 * item's, somewhere near it, moving at anything from a crawl to falling speed. Positions are
 * often exactly on the tile grid (where the edge cases are), velocities often the game's.
 */
export function randomCollision(rand: (n: number) => number): CollisionCase {
	const w = 24;
	const h = 30 + 40; // the game only collides above maxTilesY - 40
	const cells: CollisionCase['cells'] = [];
	const ground = 12 + rand(8);
	const style = rand(3);
	for (let i = 2; i < w - 2; i++) {
		const top = ground + rand(3) - 1 - (rand(4) === 0 ? 2 : 0);
		for (let j = 3; j < 30; j++) {
			const solid =
				style === 0 ? j >= top : style === 1 ? rand(4) === 0 : j >= top || rand(10) === 0;
			if (solid) cells.push([i, j, 0]);
		}
	}
	const sizes: [number, number][] = [
		[20, 42],
		[20, 42],
		[12, 12],
		[10, 14],
		[16, 16]
	];
	const [width, height] = sizes[rand(sizes.length)];
	const grid = (n: number) => n * 16;
	const jitter = () => [0, 0, 0.5, -0.5, 0.01, -0.01, 0.4, f(rand(1000) / 100 - 5)][rand(8)];
	const x = f(grid(4 + rand(14)) + [0, -width, 16 - width, rand(16)][rand(4)] + jitter());
	const y = f(grid(ground - 4 + rand(6)) - [0, height, rand(32)][rand(3)] + jitter());
	const speeds = [0, 0.4, -0.4, 3, -3, 5.01, -5.01, 10.01, -10.01, 0.08, 2.92, 0.01];
	const v = () => (rand(3) ? speeds[rand(speeds.length)] : f(rand(2400) / 100 - 12));
	const op = (['tile', 'tile', 'stepUp', 'stepDown'] as const)[rand(4)];
	return {
		w,
		h,
		cells,
		op,
		x,
		y,
		vx: f(v()),
		vy: op === 'stepDown' ? f(0.4) : f(v()),
		width,
		height,
		stepSpeed: [1, 1.5, 2, 2.5][rand(4)],
		gfxOffY: f([0, 0, 8, -8, 3.5][rand(5)])
	};
}
