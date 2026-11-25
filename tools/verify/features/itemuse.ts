/**
 * A player using an item (the Copper Pickaxe, or a stack of dirt or stone blocks) in a small
 * world, frame by frame. The oracle runs the game's Player.Update movement and ItemCheck
 * (oracle/features/ItemUse.cs); this runs the port ($lib/world/player, $lib/world/item-check).
 */
import { f } from '$lib/world/collision';
import { isSolid } from '$lib/world/framing';
import type { DropCall, ItemWorld, SoundCall } from '$lib/world/item-check';
import { Player } from '$lib/world/player';
import { Tiles } from '$lib/world/tiles';

export interface ItemUseCase {
	w: number;
	h: number;
	/** [i, j, type, variant]: the blocks (the rest is air). */
	cells: [number, number, number, number][];
	/** Where there's a dirt wall behind. */
	walls: [number, number][];
	x: number;
	y: number;
	vx: number;
	vy: number;
	direction: 1 | -1;
	releaseJump: boolean;
	/** The item held, and how many. */
	item: number;
	stack: number;
	/** Per frame: [keys, tileX, tileY]: keys 1 left, 2 right, 4 jump, 8 use; the tile under the cursor. */
	frames: [number, number, number][];
}

/** A tile that changed: [i, j, type (-1 for none), frameX, frameY, variant]. */
export type TileChange = [number, number, number, number, number, number];

export interface ItemFrame {
	x: number;
	y: number;
	vx: number;
	vy: number;
	direction: number;
	body: number;
	legs: number;
	itemAnimation: number;
	itemAnimationMax: number;
	itemTime: number;
	toolTime: number;
	itemRotation: number;
	itemX: number;
	itemY: number;
	stack: number;
	tiles: TileChange[];
	/** Player.hitTile: [x, y, damage, timeToLive] of every block slot, by position. */
	hits: [number, number, number, number][];
	drops: DropCall[];
	sounds: SoundCall[];
}

/** The case's world, framed (as a loaded world is). */
export function caseTiles(c: ItemUseCase): Tiles {
	const t = new Tiles(c.w, c.h, () => 0);
	for (const [i, j, type, v] of c.cells) {
		const k = j * c.w + i;
		t.type[k] = type;
		t.active[k] = 1;
		t.frameNumber[k] = v;
	}
	for (const [i, j] of c.walls) t.wall[j * c.w + i] = 1;
	t.frameAll();
	return t;
}

const snapshot = (t: Tiles): TileChange[] => {
	const all: TileChange[] = [];
	for (let j = 0; j < t.height; j++)
		for (let i = 0; i < t.width; i++) {
			const k = j * t.width + i;
			all.push([i, j, t.active[k] ? t.type[k] : -1, t.frameX[k], t.frameY[k], t.frameNumber[k]]);
		}
	return all;
};

/**
 * Runs the port. A block's new random variant (SquareTileFrame's genRand draw) is taken from
 * the game's answer, `game`, when there is one: the variant the game's block ended the frame
 * with (see README: "Equivalences relied on").
 */
export function runItemUse(c: ItemUseCase, game?: ItemFrame[]): ItemFrame[] {
	const t = caseTiles(c);
	let frame = 0;
	let sounds: SoundCall[] = [];
	let drops: DropCall[] = [];
	const w: ItemWorld = {
		tiles: t,
		variant: (i, j) =>
			game?.[frame]?.tiles.find((ch) => ch[0] === i && ch[1] === j)?.[5] ??
			t.frameNumber[j * t.width + i],
		sound: (s) => sounds.push(s),
		drop: (d) => drops.push(d)
	};
	// Collision against the blocks as they are now (mining and placing change them).
	const m = {
		maxTilesX: c.w,
		maxTilesY: c.h,
		solid: (i: number, j: number) => isSolid(t.at(i, j))
	};
	const p = new Player(c.x, c.y);
	p.vx = c.vx;
	p.vy = c.vy;
	p.direction = c.direction;
	p.releaseJump = c.releaseJump;
	p.item = { type: c.item, stack: c.stack };
	p.lastVisualized = { ...p.item };
	let before = snapshot(t);
	const out: ItemFrame[] = [];
	for (const [bits, tx, ty] of c.frames) {
		p.controls = {
			left: (bits & 1) !== 0,
			right: (bits & 2) !== 0,
			jump: (bits & 4) !== 0,
			use: (bits & 8) !== 0
		};
		p.tileTargetX = tx;
		p.tileTargetY = ty;
		sounds = [];
		drops = [];
		p.update(m, w);
		const after = snapshot(t);
		const tiles = after.filter((a, k) => a.some((v, n) => v !== before[k][n]));
		before = after;
		const hits = p.hitTile.data
			.filter((d) => d.type === 1)
			.map((d): [number, number, number, number] => [d.x, d.y, d.damage, d.timeToLive])
			.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
		out.push({
			x: p.x,
			y: p.y,
			vx: p.vx,
			vy: p.vy,
			direction: p.direction,
			body: p.bodyFrame,
			legs: p.legFrame,
			itemAnimation: p.itemAnimation,
			itemAnimationMax: p.itemAnimationMax,
			itemTime: p.itemTime,
			toolTime: p.toolTime,
			itemRotation: p.itemRotation,
			itemX: p.itemLocation.x,
			itemY: p.itemLocation.y,
			stack: p.item.stack,
			tiles,
			hits,
			drops,
			sounds
		});
		frame++;
	}
	return out;
}

/** The game's floats arrive as JSON text: back to singles. */
export const froundItemFrames = (frames: ItemFrame[]): ItemFrame[] =>
	frames.map((fr) => ({
		...fr,
		x: f(fr.x),
		y: f(fr.y),
		vx: f(fr.vx),
		vy: f(fr.vy),
		itemRotation: f(fr.itemRotation),
		itemX: f(fr.itemX),
		itemY: f(fr.itemY),
		sounds: fr.sounds.map((s) => ({ ...s, x: f(s.x), y: f(s.y) }))
	}));

/**
 * A random case: rolling grass over dirt over stone with walls behind, a few floating blocks and
 * walls in the air to build onto, and a few seconds of keys and cursor: mining or placing near
 * the player (and sometimes out of reach), walking and jumping while at it, letting go.
 */
export function randomItemUse(rand: (n: number) => number): ItemUseCase {
	const w = 40;
	const rows = 30;
	const h = rows + 40; // the game only collides above maxTilesY - 40
	const cells: ItemUseCase['cells'] = [];
	const walls: ItemUseCase['walls'] = [];
	const taken = new Set<number>();
	const put = (i: number, j: number, type: number) => {
		if (i < 0 || j < 0 || i >= w || j >= rows || taken.has(j * w + i)) return;
		taken.add(j * w + i);
		cells.push([i, j, type, rand(3)]);
	};
	let top = 18 + rand(4);
	const tops: number[] = [];
	for (let i = 0; i < w; i++) {
		if (rand(3) === 0) top = Math.max(10, Math.min(24, top + rand(5) - 2));
		tops.push(top);
		const dirt = 2 + rand(4);
		for (let j = top; j < rows; j++) {
			put(i, j, j === top && rand(5) ? 2 : j < top + dirt ? (rand(6) ? 0 : 40) : 1);
			if (j > top + (rand(3) ? 1 : 0)) walls.push([i, j]);
		}
		if (i < 2 || i >= w - 2) for (let j = 0; j < rows; j++) put(i, j, 1);
	}
	// Blocks and walls in the air: something to build onto, or to mine overhead.
	for (let n = rand(5); n > 0; n--) {
		const i = 4 + rand(w - 8);
		const j = tops[i] - 2 - rand(5);
		const type = [0, 1, 2, 40][rand(4)];
		for (let k = 0; k < 1 + rand(4); k++) put(i + k, j, type);
	}
	for (let n = rand(4); n > 0; n--) {
		const i = 4 + rand(w - 8);
		const j = tops[i] - 1 - rand(4);
		for (let k = 0; k < 1 + rand(3); k++) if (!taken.has(j * w + i + k)) walls.push([i + k, j]);
	}
	const i = 10 + rand(w - 20);
	const x = f(i * 16 + rand(16) - 10);
	const y = f(tops[i] * 16 - 42);
	const item = [3509, 3509, 3509, 2, 3, 133][rand(6)];
	// The cursor: near the player's start (within reach, or just out of it).
	const frames: ItemUseCase['frames'] = [];
	const length = 60 + rand(300);
	let px = i;
	while (frames.length < length) {
		if (rand(6) === 0) {
			// A sweep: one hit on each block across the ground nearby (so earlier hits' damage,
			// pruned on every hit elsewhere, wears off).
			const cx = Math.round(px);
			for (let dy = 0; dy < 3; dy++)
				for (let dx = -5; dx <= 5; dx++) {
					const tx = Math.max(6, Math.min(w - 7, cx + dx));
					const ty = tops[cx] + dy;
					for (let k = 0; k < 15; k++) frames.push([8, tx, ty]);
				}
			continue;
		}
		const keys = [8, 8, 8, 9, 10, 12, 0, 1, 2, 4, 8, 13, 14][rand(13)];
		const span = [1, 5, 15, 30, 60, 90][rand(6)];
		if (keys & 1) px -= span / 20;
		if (keys & 2) px += span / 20;
		px = Math.max(8, Math.min(w - 9, px));
		const tx = Math.max(6, Math.min(w - 7, Math.round(px) + rand(13) - 6));
		const ty = Math.max(6, Math.min(rows - 2, tops[Math.round(px)] - 4 + rand(8)));
		for (let k = 0; k < span; k++) frames.push([keys, tx, ty]);
	}
	return {
		w,
		h,
		cells,
		walls,
		x,
		y,
		vx: 0,
		vy: 0,
		direction: rand(2) ? 1 : -1,
		releaseJump: rand(4) !== 0,
		item,
		stack: item === 3509 ? 1 : 1 + rand(6),
		frames: frames.slice(0, length)
	};
}
