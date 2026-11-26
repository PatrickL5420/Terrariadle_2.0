/**
 * Getting about: the moves the little world's player can make from where it stands, and a
 * search (A*) for the cheapest way from there to a goal. Made up (it's the player's decisions,
 * not the game's code), but measured from the game's own movement: jumps are trajectories of the
 * verified Player.update, recorded once and then checked against the tiles on the way.
 *
 * Places are "stands": the player (20 x 42 px) centred over columns i and i + 1, feet on top of
 * row j, so it fills rows j - 3 to j - 1 of both. The moves:
 *
 *   walk     one column along: on the level, up a one-block step (Collision.StepUp does that by
 *            itself), or off an edge and down
 *   jump     one of the recorded jumps, from standing still, landing wherever it comes down
 *   dig      mine what's in the way (along, up a step, down a step, or straight down), getting
 *            the blocks
 *   pillar   jump and put a block under its feet: one block up
 *   bridge   put a block under the next column over a drop, and walk on
 *
 * Costs are roughly frames. Blocks are counted along the way: building takes one, digging gives
 * one, so a search with none in hand digs before it builds.
 */
import { f, type TileMap } from '../collision';
import { AIR, CLAY, DIRT, GRASS, STONE, TREES } from '../framing';
import { Player } from '../player';

/** The player's hitbox. */
export const PW = 20;
export const PH = 42;

export interface Stand {
	i: number;
	j: number;
}

/** Where the player is when it stands at `s`. */
export const standX = (i: number) => i * 16 + 6;
export const standY = (j: number) => j * 16 - PH;

/** The stand nearest the player's position. */
export const standOf = (x: number, y: number): Stand => ({
	i: Math.round((x - 6) / 16),
	j: Math.round((y + PH) / 16)
});

/** What the search reads of the world. */
export interface NavMap extends TileMap {
	/** The block at (i, j), AIR (-1) if none. */
	at(i: number, j: number): number;
	/** Whether (i, j) may be changed (the part of the world that's shown). */
	inView(i: number, j: number): boolean;
}

/** The blocks a pickaxe takes (and what they give: a block each). */
const MINEABLE = [DIRT, STONE, GRASS, CLAY];

/** Frames to mine a block with the Copper Pickaxe: hits times its use time, and the first swing. */
export function mineFrames(type: number) {
	const hits = type === STONE ? 3 : 2;
	return hits * 15 + 8;
}

// ---- Jumps, recorded from the real movement -----------------------------------------------------

/** A recorded jump: hold `d` (and jump for `hold` frames) from standing still. */
export interface Jump {
	d: -1 | 0 | 1;
	hold: number;
	/** Per frame: the player's position relative to where it started, and whether it's falling. */
	dx: Float32Array;
	dy: Float32Array;
	vy: Float32Array;
	/**
	 * The same, as tiles relative to the stand it starts from (they're the same from any stand:
	 * stands are whole tiles apart): per frame, a landing to check (coming down onto a row),
	 * then the tiles its body newly passes through.
	 */
	events: JumpEvent[];
}

interface JumpEvent {
	frame: number;
	/** Coming down onto row `row`: if any of these columns is solid there, it lands at `at`. */
	land?: { cols: number[]; row: number; at: Stand };
	/** Tiles that must be clear. */
	cells: [number, number][];
}

/** A jump's path as tiles (see Jump.events), from the stand (0, 0). */
function compile(dx: number[], dy: number[], vy: number[]): JumpEvent[] {
	const x0 = standX(0);
	const y0 = standY(0);
	const seen = new Set<string>();
	const events: JumpEvent[] = [];
	let bottom = y0 + PH;
	for (let t = 0; t < dx.length; t++) {
		const x = f(x0 + dx[t]);
		const y = f(y0 + dy[t]);
		const b = y + PH;
		const c0 = Math.floor(x / 16);
		const c1 = Math.floor((x + PW - 0.001) / 16);
		const e: JumpEvent = { frame: t, cells: [] };
		if (vy[t] > 0 && t > 0) {
			const row = Math.floor((b - 0.001) / 16);
			if (bottom <= row * 16 + 0.001) {
				const cols: number[] = [];
				for (let c = c0; c <= c1; c++) cols.push(c);
				e.land = { cols, row, at: standOf(x, row * 16 - PH) };
			}
		}
		const r0 = Math.floor(y / 16);
		const r1 = Math.floor((b - 0.001) / 16);
		for (let c = c0; c <= c1; c++)
			for (let r = r0; r <= r1; r++) {
				const k = `${c},${r}`;
				if (!seen.has(k)) {
					seen.add(k);
					e.cells.push([c, r]);
				}
			}
		if (e.land || e.cells.length) events.push(e);
		bottom = b;
	}
	return events;
}

const HOLDS = [2, 5, 9, 15];
let jumps: Jump[] | null = null;

/** The jumps, recorded once: on a lone platform, so after leaving it the player falls freely. */
export function recordedJumps(): Jump[] {
	if (jumps) return jumps;
	jumps = [];
	const floor = 60;
	const i0 = 50;
	const m: TileMap = {
		maxTilesX: 200,
		maxTilesY: 400,
		solid: (i, j) => j === floor && (i === i0 || i === i0 + 1)
	};
	for (const d of [-1, 1] as const)
		for (const hold of HOLDS) {
			const p = new Player(standX(i0), standY(floor));
			p.releaseJump = true;
			const x0 = p.x;
			const y0 = p.y;
			const dx: number[] = [];
			const dy: number[] = [];
			const vy: number[] = [];
			for (let t = 0; t < 110; t++) {
				p.controls = { left: d < 0, right: d > 0, jump: t < hold };
				p.update(m);
				dx.push(p.x - x0);
				dy.push(p.y - y0);
				vy.push(p.vy);
			}
			jumps.push({
				d,
				hold,
				dx: Float32Array.from(dx),
				dy: Float32Array.from(dy),
				vy: Float32Array.from(vy),
				events: compile(dx, dy, vy)
			});
		}
	return jumps;
}

// ---- The world as the search sees it: real tiles, with the plan's own changes on top ----------

/** Changes the plan makes along the way: tiles it mines (false) or places (true). */
interface Change {
	k: number;
	solid: boolean;
	next: Change | null;
}

class View {
	constructor(
		readonly m: NavMap,
		readonly changes: Change | null
	) {}

	solid(i: number, j: number): boolean {
		const k = j * 4096 + i;
		for (let c = this.changes; c; c = c.next) if (c.k === k) return c.solid;
		return this.m.solid(i, j);
	}

	/** Whether the player fits standing at (i, j). */
	fits(i: number, j: number): boolean {
		for (let r = j - 3; r < j; r++) if (this.solid(i, r) || this.solid(i + 1, r)) return false;
		return true;
	}

	supported(i: number, j: number): boolean {
		return this.solid(i, j) || this.solid(i + 1, j);
	}

	/** Whether (i, j) is a block the pickaxe can take here (not under a tree, not changed). */
	mineable(i: number, j: number): boolean {
		const k = j * 4096 + i;
		for (let c = this.changes; c; c = c.next) if (c.k === k) return false;
		return (
			this.m.inView(i, j) &&
			MINEABLE.includes(this.m.at(i, j)) &&
			!TREES.includes(this.m.at(i, j - 1))
		);
	}

	with(list: [number, number][], solid: boolean): Change | null {
		let c = this.changes;
		for (const [i, j] of list) c = { k: j * 4096 + i, solid, next: c };
		return c;
	}
}

// ---- Steps and the search -------------------------------------------------------------------------

export type Step =
	| { kind: 'walk'; d: -1 | 1; to: Stand }
	| { kind: 'jump'; jump: Jump; from: Stand; to: Stand }
	| { kind: 'mine'; tiles: [number, number][] }
	| { kind: 'drop'; to: Stand }
	| { kind: 'pillar'; tile: [number, number]; to: Stand }
	| { kind: 'place'; tile: [number, number] };

interface Node {
	s: Stand;
	g: number;
	h: number;
	blocks: number;
	changes: Change | null;
	parent: Node | null;
	/** The steps from the parent to here. */
	steps: Step[];
}

export interface Goal {
	/** Whether standing at `s` will do. */
	done(s: Stand): boolean;
	/** The column it's around (for the search's estimate). */
	i: number;
}

export interface PlanOptions {
	/** Blocks in hand. */
	blocks: number;
	/** The most stands to look at (default 4000). */
	limit?: number;
	/** Whether building (pillars and bridges) is allowed (default yes). */
	build?: boolean;
	/** Whether digging is allowed (default yes). */
	dig?: boolean;
	/** The most time to spend, in ms (default 12): past it, there's taken to be no way. */
	ms?: number;
}

/** What building and digging cost on top of their frames: the world's left as it was, if it can. */
const PLACE_COST = 30;
const DIG_COST = 12;

/**
 * The cheapest steps from standing at `from` to a stand the goal accepts, or null if there's
 * none within the search's limit.
 */
export function plan(m: NavMap, from: Stand, goal: Goal, o: PlanOptions): Step[] | null {
	const limit = o.limit ?? 4000;
	const build = o.build ?? true;
	const dig = o.dig ?? true;
	const open: Node[] = [];
	const best = new Map<number, number>();
	const key = (s: Stand) => s.j * 4096 + s.i;
	const h = (s: Stand) => Math.abs(s.i - goal.i) * 5.3;
	const push = (n: Node) => {
		const k = key(n.s);
		const b = best.get(k);
		if (b !== undefined && b <= n.g) return;
		best.set(k, n.g);
		// A binary heap on g + h.
		open.push(n);
		let c = open.length - 1;
		while (c > 0) {
			const p = (c - 1) >> 1;
			if (open[p].g + open[p].h <= n.g + n.h) break;
			open[c] = open[p];
			c = p;
		}
		open[c] = n;
	};
	const pop = (): Node => {
		const top = open[0];
		const last = open.pop()!;
		if (open.length) {
			let c = 0;
			for (;;) {
				const l = c * 2 + 1;
				if (l >= open.length) break;
				const r = l + 1;
				const m = r < open.length && open[r].g + open[r].h < open[l].g + open[l].h ? r : l;
				if (open[m].g + open[m].h >= last.g + last.h) break;
				open[c] = open[m];
				c = m;
			}
			open[c] = last;
		}
		return top;
	};

	push({ s: from, g: 0, h: h(from), blocks: o.blocks, changes: null, parent: null, steps: [] });
	let seen = 0;
	const until = performance.now() + (o.ms ?? 12);
	while (open.length && seen++ < limit) {
		if ((seen & 63) === 0 && performance.now() > until) return null;
		const n = pop();
		if ((best.get(key(n.s)) ?? Infinity) < n.g) continue;
		if (goal.done(n.s)) {
			const steps: Step[] = [];
			for (let x: Node | null = n; x; x = x.parent) steps.unshift(...x.steps);
			return steps;
		}
		for (const e of moves(new View(m, n.changes), n.s, n.blocks, build, dig))
			push({
				s: e.to,
				g: n.g + e.cost,
				h: h(e.to),
				blocks: n.blocks + e.blocks,
				changes: e.changes ?? n.changes,
				parent: n,
				steps: e.steps
			});
	}
	return null;
}

interface Edge {
	to: Stand;
	cost: number;
	steps: Step[];
	/** Blocks gained (or spent, negative). */
	blocks: number;
	changes?: Change | null;
}

/** The stands a fall from (i, j) down column pair i lands on, or null if it doesn't. */
function fall(v: View, i: number, j: number): number | null {
	let k = j;
	while (!v.supported(i, k)) {
		k++;
		if (!v.fits(i, k)) return null;
		if (k > j + 60) return null;
	}
	return k;
}

/** Every move from standing at `s`. */
function moves(v: View, s: Stand, blocks: number, build: boolean, dig: boolean): Edge[] {
	const out: Edge[] = [];
	const { i, j } = s;
	for (const d of [-1, 1] as const) {
		const n = i + d;
		// Walking: on the level, up a step, or off an edge.
		if (v.fits(n, j)) {
			if (v.supported(n, j))
				out.push({ to: { i: n, j }, cost: 6, blocks: 0, steps: [walk(d, n, j)] });
			else {
				const k = fall(v, n, j);
				if (k !== null)
					out.push({ to: { i: n, j: k }, cost: 8 + (k - j), blocks: 0, steps: [walk(d, n, k)] });
				// A bridge: a block under the next column instead, and walk on.
				if (build && blocks > 0) {
					const t: [number, number] = [d > 0 ? i + 1 : i, j];
					if (!v.solid(t[0], t[1]))
						out.push({
							to: { i: n, j },
							cost: 6 + PLACE_COST,
							blocks: -1,
							changes: v.with([t], true),
							steps: [{ kind: 'place', tile: t }, walk(d, n, j)]
						});
				}
			}
		} else if (
			v.fits(n, j - 1) &&
			v.supported(n, j - 1) &&
			!v.solid(i, j - 4) &&
			!v.solid(i + 1, j - 4)
		)
			out.push({ to: { i: n, j: j - 1 }, cost: 8, blocks: 0, steps: [walk(d, n, j - 1)] });

		if (dig) {
			// Digging along, up a step, or down a step: whatever's in the way, if it can all go.
			for (const dj of [0, -1, 1]) {
				const tj = j + dj;
				const tiles: [number, number][] = [];
				for (let r = tj - 3; r < tj; r++)
					for (const c of [n, n + 1]) if (v.solid(c, r)) tiles.push([c, r]);
				// Room overhead to step up.
				if (dj < 0) for (const c of [i, i + 1]) if (v.solid(c, j - 4)) tiles.push([c, j - 4]);
				if (!tiles.length || !tiles.every(([c, r]) => v.mineable(c, r))) continue;
				const changes = v.with(tiles, false);
				const after = new View(v.m, changes);
				if (!after.supported(n, tj)) continue;
				out.push({
					to: { i: n, j: tj },
					cost: tiles.reduce((t, [c, r]) => t + mineFrames(v.m.at(c, r)) + DIG_COST, 8),
					blocks: tiles.length,
					changes,
					steps: [{ kind: 'mine', tiles: order(tiles) }, walk(d, n, tj)]
				});
			}
		}
	}

	if (!v.supported(i, j)) return out;

	// Jumps.
	for (const jmp of recordedJumps()) {
		const to = land(v, i, j, jmp);
		if (to)
			out.push({
				to: to.s,
				cost: to.frames + 4,
				blocks: 0,
				steps: [{ kind: 'jump', jump: jmp, from: s, to: to.s }]
			});
	}

	// Digging straight down.
	if (dig) {
		const tiles = (
			[
				[i, j],
				[i + 1, j]
			] as [number, number][]
		).filter(([c, r]) => v.solid(c, r));
		if (tiles.length && tiles.every(([c, r]) => v.mineable(c, r))) {
			const changes = v.with(tiles, false);
			const k = fall(new View(v.m, changes), i, j + 1);
			if (k !== null)
				out.push({
					to: { i, j: k },
					cost: tiles.reduce((t, [c, r]) => t + mineFrames(v.m.at(c, r)) + DIG_COST, 4 + (k - j)),
					blocks: tiles.length,
					changes,
					steps: [
						{ kind: 'mine', tiles },
						{ kind: 'drop', to: { i, j: k } }
					]
				});
		}
	}

	// A pillar: a block under its feet, on the one it stands on.
	if (build && blocks > 0 && v.fits(i, j - 1)) {
		const c = v.solid(i, j) ? i : i + 1;
		const t: [number, number] = [c, j - 1];
		out.push({
			to: { i, j: j - 1 },
			cost: 40 + PLACE_COST,
			blocks: -1,
			changes: v.with([t], true),
			steps: [{ kind: 'pillar', tile: t, to: { i, j: j - 1 } }]
		});
	}
	return out;
}

const walk = (d: -1 | 1, i: number, j: number): Step => ({ kind: 'walk', d, to: { i, j } });

/** Tiles to mine, top first (so nothing's left hanging over the player's head). */
const order = (tiles: [number, number][]) => [...tiles].sort((a, b) => a[1] - b[1] || a[0] - b[0]);

/**
 * Where a jump from standing at (i, j) comes down, if it gets there without touching anything on
 * the way (touching would change it: the search leaves those out).
 */
function land(v: View, i: number, j: number, jmp: Jump): { s: Stand; frames: number } | null {
	for (const e of jmp.events) {
		// Coming down onto a block: lands on it.
		if (e.land) {
			const { cols, row, at } = e.land;
			if (cols.some((c) => v.solid(i + c, j + row))) {
				const s = { i: i + at.i, j: j + at.j };
				if (s.i === i && s.j === j) return null;
				if (!v.fits(s.i, s.j) || !v.supported(s.i, s.j)) return null;
				return { s, frames: e.frame + 1 };
			}
		}
		for (const [c, r] of e.cells) if (v.solid(i + c, j + r)) return null;
	}
	return null;
}

/** The air under (i, j)? (For goals: a stand on the open surface, nothing over its head.) */
export function open(m: NavMap, i: number, j: number) {
	for (let r = 0; r < j; r++) if (m.solid(i, r) || m.solid(i + 1, r)) return false;
	return true;
}

export { AIR };
