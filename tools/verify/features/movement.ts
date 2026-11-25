/**
 * A plain player moving about: a world, a start, and the keys held each frame. The oracle runs
 * the game's Player.Update (oracle/features/Movement.cs); this runs the port ($lib/world/player).
 */
import { f } from '$lib/world/collision';
import { Player } from '$lib/world/player';
import { tileMap } from './collision';

export interface MovementCase {
	w: number;
	h: number;
	cells: [number, number, number][];
	x: number;
	y: number;
	vx: number;
	vy: number;
	direction: 1 | -1;
	releaseJump: boolean;
	/** One per frame: 1 left, 2 right, 4 jump. */
	inputs: number[];
}

export interface Frame {
	x: number;
	y: number;
	vx: number;
	vy: number;
	gfxOffY: number;
	stepSpeed: number;
	jump: number;
	releaseJump: boolean;
	direction: number;
	body: number;
	legs: number;
	legFrameCounter: number;
}

export function runMovement(c: MovementCase): Frame[] {
	const m = tileMap(c);
	const p = new Player(c.x, c.y);
	p.vx = c.vx;
	p.vy = c.vy;
	p.direction = c.direction;
	p.releaseJump = c.releaseJump;
	return c.inputs.map((bits) => {
		p.controls = { left: (bits & 1) !== 0, right: (bits & 2) !== 0, jump: (bits & 4) !== 0 };
		p.update(m);
		return {
			x: p.x,
			y: p.y,
			vx: p.vx,
			vy: p.vy,
			gfxOffY: p.gfxOffY,
			stepSpeed: p.stepSpeed,
			jump: p.jump,
			releaseJump: p.releaseJump,
			direction: p.direction,
			body: p.bodyFrame,
			legs: p.legFrame,
			legFrameCounter: p.legFrameCounter
		};
	});
}

/** The game's floats arrive as JSON text: back to singles (frame counters are doubles). */
export const froundFrames = (frames: Frame[]): Frame[] =>
	frames.map((fr) => ({
		...fr,
		x: f(fr.x),
		y: f(fr.y),
		vx: f(fr.vx),
		vy: f(fr.vy),
		gfxOffY: f(fr.gfxOffY),
		stepSpeed: f(fr.stepSpeed)
	}));

/**
 * A random walk: uneven ground (steps of one to three blocks, pillars, overhangs to bump into),
 * and a few seconds of keys: running either way, turning, tapping and holding jump, letting go.
 */
export function randomMovement(rand: (n: number) => number): MovementCase {
	const w = 48;
	const rows = 30;
	const h = rows + 40; // the game only collides above maxTilesY - 40
	const cells: MovementCase['cells'] = [];
	const solid = new Set<number>();
	const put = (i: number, j: number) => {
		if (i < 0 || j < 0 || i >= w || j >= rows || solid.has(j * w + i)) return;
		solid.add(j * w + i);
		cells.push([i, j, 0]);
	};
	let top = 18 + rand(4);
	const tops: number[] = [];
	for (let i = 0; i < w; i++) {
		if (rand(4) === 0) top = Math.max(8, Math.min(26, top + rand(7) - 3));
		tops.push(top);
		for (let j = top; j < rows; j++) put(i, j);
		// Walls at the world's sides.
		if (i < 2 || i >= w - 2) for (let j = 0; j < rows; j++) put(i, j);
	}
	// Overhangs and floating blocks: ceilings to bump.
	for (let n = rand(6); n > 0; n--) {
		const i = 4 + rand(w - 8);
		const j = tops[i] - 3 - rand(4);
		for (let k = 0; k < 1 + rand(5); k++) put(i + k, j);
	}
	const i = 6 + rand(w - 12);
	const x = f(i * 16 + rand(16) - 10 + [0, 0.5, 0.25][rand(3)]);
	const y = f(tops[i] * 16 - 42);
	const inputs: number[] = [];
	const length = 60 + rand(240);
	while (inputs.length < length) {
		const held = [0, 1, 2, 2, 1, 4, 5, 6, 6, 3][rand(10)];
		const frames = [1, 2, 5, 10, 20, 40, 60][rand(7)];
		for (let k = 0; k < frames; k++) inputs.push(held);
	}
	return {
		w,
		h,
		cells,
		x,
		y,
		vx: rand(3) ? 0 : f(rand(600) / 100 - 3),
		vy: 0,
		direction: rand(2) ? 1 : -1,
		releaseJump: rand(4) !== 0,
		inputs: inputs.slice(0, length)
	};
}
