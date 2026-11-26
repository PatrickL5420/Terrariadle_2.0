/**
 * Building: blueprints for what the little world's player builds, where they can go, and what
 * to do next on one. Made up (the player's decisions); the building itself is the game's item
 * use, through the same tasks as everything else (get in reach, then mine or place).
 *
 * Trees where it goes are felled first.
 *
 *   house    a wooden box on flattened ground: floor, walls, a roof, a doorway on one side
 *            (3 high, for a door later) and a torch inside
 *   tower    a wooden pole with a lookout deck on top, and a torch on the deck
 *   bridge   a wooden walkway across a dip in the ground, level with its lower rim
 *
 * A blueprint is the tiles that must be clear and the tiles to fill (with blocks for the
 * ground, wood, or a torch). Work goes: clear what's in the way, fill the ground, then wood
 * from the bottom up (each piece needs something beside it to go against), then the torch.
 */
import { AIR, isSolid, TORCH, TREES, WOOD_BLOCK } from '../framing';
import type { NavMap } from './nav';

export type Need = 'block' | 'wood' | 'torch';

export interface Piece {
	i: number;
	j: number;
	need: Need;
}

export interface Blueprint {
	kind: 'house' | 'tower' | 'bridge';
	/** Columns i0 to i1 and rows j0 to j1 it takes up (with room round it). */
	box: [number, number, number, number];
	/** Tiles that must be empty. */
	clear: [number, number][];
	/** Tiles to fill, in no particular order (the next step picks what can go in now). */
	pieces: Piece[];
}

/** What building looks at in the world. */
export interface BuildMap extends NavMap {
	readonly width: number;
	readonly height: number;
	/** The top block in column i (the height if none). */
	top(i: number): number;
	/** Whether a block (`torch` false) or torch could go at (i, j) by what's round it. */
	placeable(i: number, j: number, torch: boolean): boolean;
}

/** Whether a piece is in: the right thing is there. */
export function done(m: BuildMap, p: Piece): boolean {
	const t = m.at(p.i, p.j);
	if (p.need === 'torch') return t === TORCH;
	if (p.need === 'wood') return t === WOOD_BLOCK;
	return isSolid(t);
}

/** What's still needed: wood, blocks and torches. */
export function needs(m: BuildMap, b: Blueprint): Record<Need, number> {
	const n = { block: 0, wood: 0, torch: 0 };
	for (const p of b.pieces) if (!done(m, p)) n[p.need]++;
	return n;
}

export type Next =
	| { kind: 'mine'; tile: [number, number] }
	| { kind: 'chop'; tile: [number, number] }
	| { kind: 'place'; tile: [number, number]; need: Need }
	| { kind: 'done' }
	| { kind: 'stuck' };

/**
 * The next thing to do on a blueprint: mine something in the way (or in a piece's place that
 * isn't what it should be), or put in a piece that has something to go against (the lowest
 * first, then the nearest to column `near`).
 */
export function next(m: BuildMap, b: Blueprint, near: number): Next {
	// (A piece's place isn't to be cleared, even if the clearing takes it in.)
	const piece = new Set(b.pieces.map((p) => `${p.i},${p.j}`));
	const blocking = b.clear.filter(
		([i, j]) =>
			!piece.has(`${i},${j}`) &&
			(isSolid(m.at(i, j)) || m.at(i, j) === TORCH || TREES.includes(m.at(i, j)))
	);
	const wrong = b.pieces.filter((p) => m.at(p.i, p.j) !== AIR && !done(m, p));
	const toMine = [...blocking, ...wrong.map((p): [number, number] => [p.i, p.j])];
	// A tree in the way: chopped down at its foot (it all comes down).
	const tree = toMine.find(([i, j]) => TREES.includes(m.at(i, j)));
	if (tree) {
		let [i, j] = tree;
		while (TREES.includes(m.at(i, j + 1))) j++;
		// A root (beside the trunk): the trunk's the column with tree above.
		if (!TREES.includes(m.at(i, j - 1))) {
			if (TREES.includes(m.at(i - 1, j - 1))) i--;
			else if (TREES.includes(m.at(i + 1, j - 1))) i++;
		}
		return { kind: 'chop', tile: [i, j] };
	}
	if (toMine.length) {
		toMine.sort((a, c) => a[1] - c[1] || Math.abs(a[0] - near) - Math.abs(c[0] - near));
		return { kind: 'mine', tile: toMine[0] };
	}
	const order: Need[] = ['block', 'wood', 'torch'];
	for (const need of order) {
		const left = b.pieces.filter((p) => p.need === need && !done(m, p));
		if (!left.length) continue;
		const ready = left.filter((p) => m.placeable(p.i, p.j, need === 'torch'));
		if (!ready.length) return { kind: 'stuck' };
		ready.sort((a, c) => c.j - a.j || Math.abs(a.i - near) - Math.abs(c.i - near));
		return { kind: 'place', tile: [ready[0].i, ready[0].j], need };
	}
	return { kind: 'done' };
}

// ---- Sites ---------------------------------------------------------------------------------------

export interface SiteOptions {
	/** Columns it may use (inclusive). */
	first: number;
	last: number;
	/** Rows below which it's too deep (the bottom of what's shown). */
	rows: number;
	/** Boxes already taken (other buildings). */
	taken: Blueprint['box'][];
}

const overlaps = (a: Blueprint['box'], b: Blueprint['box']) =>
	a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** How many trees stand in columns i0 to i1 (they'll have to come down). */
function trees(m: BuildMap, i0: number, i1: number) {
	let n = 0;
	for (let i = i0; i <= i1; i++) {
		const j = m.top(i) - 1;
		if (TREES.includes(m.at(i, j)) && TREES.includes(m.at(i, j - 1))) n++;
	}
	return n;
}

/** Ground level at column i: the top block's row. */
const ground = (m: BuildMap, i: number) => m.top(i);

/** House: W wide (walls included), an inside H high. */
const HOUSE_W = 10;
const HOUSE_H = 5;

/**
 * A house at columns x0 to x0 + 9 on ground level g (the row it stands on): the ground
 * flattened to g a column either side too, then the floor on it, the walls, the roof, the
 * doorway in the wall on the `door` side, and a torch inside on the other wall.
 */
export function house(x0: number, g: number, door: -1 | 1): Blueprint {
	const W = HOUSE_W;
	const H = HOUSE_H;
	const f = g - 1; // the floor's row
	const roof = f - H - 1;
	const x1 = x0 + W - 1;
	const pieces: Piece[] = [];
	const clear: [number, number][] = [];
	const doorX = door < 0 ? x0 : x1;
	for (let i = x0 - 1; i <= x1 + 1; i++) {
		// The ground, level at g (filled in from below where it's lower).
		for (let j = g; j <= g + MAX_FILL; j++) pieces.push({ i, j, need: 'block' });
		for (let j = roof - 1; j < g; j++) {
			const inside = i >= x0 && i <= x1 && j >= roof;
			if (!inside) clear.push([i, j]);
		}
	}
	for (let i = x0; i <= x1; i++) {
		pieces.push({ i, j: f, need: 'wood' });
		pieces.push({ i, j: roof, need: 'wood' });
	}
	for (let j = roof + 1; j < f; j++) {
		for (const i of [x0, x1]) {
			if (i === doorX && j >= f - 3) clear.push([i, j]);
			else pieces.push({ i, j, need: 'wood' });
		}
		for (let i = x0 + 1; i < x1; i++) clear.push([i, j]);
	}
	pieces.push({ i: door < 0 ? x1 - 1 : x0 + 1, j: f - 3, need: 'torch' });
	return { kind: 'house', box: [x0 - 2, roof - 1, x1 + 2, g], clear, pieces };
}

/** A tower at column x on ground level g: a pole 6 high, a deck 5 wide, a torch on the deck. */
export function tower(x: number, g: number): Blueprint {
	const pieces: Piece[] = [];
	const clear: [number, number][] = [];
	const deck = g - 7;
	for (let j = deck + 1; j < g; j++) pieces.push({ i: x, j, need: 'wood' });
	for (let i = x - 2; i <= x + 2; i++) {
		pieces.push({ i, j: deck, need: 'wood' });
		for (let j = deck - 3; j < deck; j++) if (!(i === x && j === deck - 1)) clear.push([i, j]);
	}
	pieces.push({ i: x, j: deck - 1, need: 'torch' });
	return { kind: 'tower', box: [x - 3, deck - 4, x + 3, g], clear, pieces };
}

/** A bridge over columns a to b at row r (level with the lower rim of the dip). */
export function bridge(a: number, b: number, r: number): Blueprint {
	const pieces: Piece[] = [];
	const clear: [number, number][] = [];
	for (let i = a; i <= b; i++) {
		pieces.push({ i, j: r, need: 'wood' });
		for (let j = r - 3; j < r; j++) clear.push([i, j]);
	}
	return { kind: 'bridge', box: [a - 1, r - 4, b + 1, r], clear, pieces };
}

/** The work a blueprint would take where it is: blocks to mine and to fill. */
function work(m: BuildMap, b: Blueprint) {
	let n = 0;
	for (const [i, j] of b.clear) if (isSolid(m.at(i, j))) n++;
	for (const p of b.pieces) if (p.need === 'block' && !isSolid(m.at(p.i, p.j))) n++;
	return n;
}

/** Below the ground (a fill) that's deeper than this many blocks is too much to fill. */
const MAX_FILL = 3;

/** The best place for a house: little ground to move, no trees, near column `near`. */
export function houseSite(m: BuildMap, near: number, o: SiteOptions): Blueprint | null {
	let best: Blueprint | null = null;
	let score = Infinity;
	for (let x0 = o.first + 2; x0 + HOUSE_W + 2 <= o.last; x0++) {
		const cols = Array.from({ length: HOUSE_W + 2 }, (_, k) => ground(m, x0 - 1 + k));
		if (cols.some((g) => g >= o.rows - 2)) continue;
		// Level with the higher half of the ground (so less is filled than dug).
		const g = [...cols].sort((a, b) => a - b)[Math.floor(cols.length / 3)];
		if (cols.some((c) => c - g > MAX_FILL || g - c > 4)) continue;
		if (g - HOUSE_H - 4 < 2) continue;
		const felled = trees(m, x0 - 2, x0 + HOUSE_W + 1);
		const door = x0 + HOUSE_W / 2 < near ? 1 : -1;
		const b = house(x0, g, door as -1 | 1);
		if (o.taken.some((t) => overlaps(t, b.box))) continue;
		const s = work(m, b) * 3 + felled * 20 + Math.abs(x0 + HOUSE_W / 2 - near) * 0.5;
		if (s < score) {
			score = s;
			best = b;
		}
	}
	return best;
}

/** A place for a tower: on a rise, no trees about, near column `near`. */
export function towerSite(m: BuildMap, near: number, o: SiteOptions): Blueprint | null {
	let best: Blueprint | null = null;
	let score = Infinity;
	for (let x = o.first + 4; x <= o.last - 4; x++) {
		const g = ground(m, x);
		if (g >= o.rows - 2 || g - 14 < 2) continue;
		const felled = trees(m, x - 3, x + 3);
		const b = tower(x, g);
		if (o.taken.some((t) => overlaps(t, b.box))) continue;
		// Higher ground is better (a better lookout).
		const s = work(m, b) * 3 + felled * 20 + g * 2 + Math.abs(x - near) * 0.3;
		if (s < score) {
			score = s;
			best = b;
		}
	}
	return best;
}

/** A dip 4 to 14 wide and 3 or more deep, to bridge. */
export function bridgeSite(m: BuildMap, near: number, o: SiteOptions): Blueprint | null {
	let best: Blueprint | null = null;
	let score = Infinity;
	for (let a = o.first + 1; a <= o.last - 4; a++) {
		const left = ground(m, a - 1);
		if (ground(m, a) - left < 3) continue;
		for (let b = a + 3; b <= Math.min(a + 13, o.last - 1); b++) {
			const right = ground(m, b + 1);
			const r = Math.max(left, right);
			let deep = true;
			for (let i = a; i <= b; i++) if (ground(m, i) - r < 3) deep = false;
			if (!deep) continue;
			// A rim on the right too.
			if (ground(m, b) - right < 3 || r >= o.rows - 2) continue;
			const felled = trees(m, a, b);
			const bp = bridge(a, b, r);
			if (o.taken.some((t) => overlaps(t, bp.box))) continue;
			const s = work(m, bp) * 3 + felled * 20 + Math.abs(a - near) * 0.3;
			if (s < score) {
				score = s;
				best = bp;
			}
			break;
		}
	}
	return best;
}
