/**
 * Tile framing: cases (a small world and a list of edits), and running one on the port
 * ($lib/world/framing). The oracle runs the same case through the game's WorldGen; see
 * oracle/features/Framing.cs for what each op does there.
 */
import { AIR, CLAY, DIRT, GRASS, STONE, TileGrid, WOOD_BLOCK } from '$lib/world/framing';

export type Op =
	| ['frameAll']
	| ['frame', number, number]
	| ['square', number, number]
	| ['place', number, number, number, number]
	| ['kill', number, number]
	| ['convert', number, number, number, number];

export interface FramingCase {
	w: number;
	h: number;
	/** [i, j, type, variant] per block; the rest is air. */
	cells: [number, number, number, number][];
	ops: Op[];
	/** [x0, y0, x1, y1): the part of the world whose frames are compared. */
	region?: [number, number, number, number];
}

export interface FramingResult {
	frameX: number[];
	frameY: number[];
	variant: number[];
}

/** Runs a case on the port, like the oracle runs it on the game. */
export function runFraming(c: FramingCase): FramingResult {
	const g = new TileGrid(c.w, c.h);
	for (const [i, j, type, v] of c.cells) {
		const k = j * c.w + i;
		if (type >= 0) {
			g.type[k] = type;
			g.active[k] = 1;
		}
		g.frameNumber[k] = v;
	}
	for (const op of c.ops) {
		switch (op[0]) {
			case 'frameAll':
				g.frameAll();
				break;
			case 'frame':
				g.tileFrame(op[1], op[2]);
				break;
			case 'square':
				g.squareTileFrame(op[1], op[2]);
				break;
			case 'place':
				g.place(op[1], op[2], op[3], op[4]);
				break;
			case 'kill':
				g.kill(op[1], op[2]);
				break;
			case 'convert':
				g.convert(op[1], op[2], op[3], op[4]);
				break;
		}
	}
	const [x0, y0, x1, y1] = c.region ?? [0, 0, c.w, c.h];
	const out: FramingResult = { frameX: [], frameY: [], variant: [] };
	for (let j = y0; j < y1; j++) {
		for (let i = x0; i < x1; i++) {
			const k = j * c.w + i;
			out.frameX.push(g.frameX[k]);
			out.frameY.push(g.frameY[k]);
			out.variant.push(g.frameNumber[k]);
		}
	}
	return out;
}

const TYPES = [AIR, DIRT, STONE, GRASS];
/** The random worlds have clay and wood too (clay frames like stone, but isn't a brick). */
const ALL = [...TYPES, CLAY, WOOD_BLOCK];

/**
 * Every 3x3 neighbourhood: each block in the middle, each of air, dirt, stone or grass on each
 * of its 8 sides, each of its 3 variants; framing the middle (which may frame the stone around
 * it, and so on). 3 x 4^8 x 3 = 589,824 cases. A 13x13 world, so the middle (6, 6) is framed.
 */
export function* everyNeighbourhood(): Generator<FramingCase> {
	const OFF = [
		[-1, -1],
		[0, -1],
		[1, -1],
		[-1, 0],
		[1, 0],
		[-1, 1],
		[0, 1],
		[1, 1]
	];
	for (const centre of [DIRT, STONE, GRASS]) {
		for (let mask = 0; mask < 4 ** 8; mask++) {
			for (let v = 0; v < 3; v++) {
				const cells: FramingCase['cells'] = [[6, 6, centre, v]];
				OFF.forEach(([dx, dy], s) => {
					const t = TYPES[(mask >> (s * 2)) & 3];
					if (t !== AIR) cells.push([6 + dx, 6 + dy, t, 0]);
				});
				yield { w: 13, h: 13, cells, ops: [['frame', 6, 6]], region: [4, 4, 9, 9] };
			}
		}
	}
}

/**
 * A random little world like the game's surface (ground at a random height, dirt over stone,
 * grass on top, some patches), framed, then `edits` random places, breaks and grass-to-dirt hits.
 */
export function randomWorld(rand: (n: number) => number, edits: number): FramingCase {
	const w = 14 + rand(10);
	const h = 14 + rand(10);
	const cells: FramingCase['cells'] = [];
	const grid: number[] = Array(w * h).fill(AIR);
	const base = 4 + rand(h - 8);
	for (let i = 0; i < w; i++) {
		const top = Math.max(1, base + rand(5) - 2);
		const dirt = top + 1 + rand(4);
		for (let j = top; j < h; j++) grid[j * w + i] = j === top ? GRASS : j < dirt ? DIRT : STONE;
	}
	// Patches and noise, so every pairing turns up.
	for (let n = rand(6); n > 0; n--) {
		const t = ALL[1 + rand(ALL.length - 1)];
		const ci = rand(w);
		const cj = rand(h);
		for (let i = ci - rand(3); i <= ci + rand(3); i++)
			for (let j = cj - rand(3); j <= cj + rand(3); j++)
				if (i >= 0 && j >= 0 && i < w && j < h) grid[j * w + i] = t;
	}
	for (let n = rand(w * h * 0.1); n > 0; n--) grid[rand(w * h)] = ALL[rand(ALL.length)];
	for (let k = 0; k < w * h; k++) cells.push([k % w, Math.floor(k / w), grid[k], rand(3)]);
	const ops: Op[] = [['frameAll']];
	for (let e = 0; e < edits; e++) {
		const i = 1 + rand(w - 2);
		const j = 1 + rand(h - 2);
		const t = grid[j * w + i];
		if (t === AIR) {
			const type = [DIRT, STONE, CLAY, WOOD_BLOCK][rand(4)];
			ops.push(['place', i, j, type, rand(3)]);
			grid[j * w + i] = type;
		} else if (t === GRASS && rand(2)) {
			ops.push(['convert', i, j, DIRT, rand(3)]);
			grid[j * w + i] = DIRT;
		} else {
			ops.push(['kill', i, j]);
			grid[j * w + i] = AIR;
		}
	}
	return { w, h, cells: cells.filter((c) => c[2] !== AIR || c[3] !== 0), ops };
}
