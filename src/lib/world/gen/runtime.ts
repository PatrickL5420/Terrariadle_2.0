/**
 * What the converted game code (./game.ts, generated) needs that isn't the game's: C#'s 2D
 * arrays and Math.Round, the world's tiles (Main.tile), and stand-ins for the progress bar,
 * settings, text and sounds of world generation, which only report.
 */
import { TileGrid } from '../framing';

/** A C# 2D array, `T[,]`: a[i, j] is get(i, j). */
export class Array2D<T> {
	readonly #items: T[];

	constructor(
		readonly width: number,
		readonly height: number,
		fill: () => T
	) {
		this.#items = Array.from({ length: width * height }, fill);
	}

	get(i: number, j: number): T {
		if (i < 0 || j < 0 || i >= this.width || j >= this.height)
			throw new RangeError(`Index was outside the bounds of the array: [${i}, ${j}]`);
		return this.#items[i * this.height + j];
	}

	set(i: number, j: number, v: T) {
		if (i < 0 || j < 0 || i >= this.width || j >= this.height)
			throw new RangeError(`Index was outside the bounds of the array: [${i}, ${j}]`);
		this.#items[i * this.height + j] = v;
	}

	GetLength(d: number) {
		return d === 0 ? this.width : this.height;
	}

	/** Its Length: every item. */
	get length() {
		return this.width * this.height;
	}

	/** The k-th item in its storage order (Array.Copy's). */
	at(k: number): T {
		return this.#items[k];
	}

	put(k: number, v: T) {
		this.#items[k] = v;
	}

	/** Array.Clear on it: `count` items from `start` (in its storage order) back to `empty`. */
	clear(start: number, count: number, empty: () => T) {
		for (let k = start; k < start + count; k++) this.#items[k] = empty();
	}
}

/** Dictionary.TryGetValue: whether `key`'s in the map, its value into `out`. */
export function $tryGetValue<K, V>(map: Map<K, V>, key: K, out: { v: V }): boolean {
	if (!map.has(key)) return false;
	out.v = map.get(key)!;
	return true;
}

/** Array.Copy / CopyTo: `n` items (all of `src` by default) from src[from] into dst[at]. */
export function $arrayCopy(
	src: ArrayLike<unknown> | Array2D<unknown>,
	from: number,
	dst: { [k: number]: unknown } | Array2D<unknown>,
	at: number,
	n = src.length - from
) {
	const get = (k: number) => (src instanceof Array2D ? src.at(k) : src[k]);
	for (let k = 0; k < n; k++) {
		if (dst instanceof Array2D) dst.put(at + k, get(from + k));
		else dst[at + k] = get(from + k);
	}
}

/** Array.Clone: a shallow copy. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function $cloneArray(a: any): any {
	if (a instanceof Array2D) {
		const c = new Array2D(a.width, a.height, () => null as unknown);
		for (let i = 0; i < a.width; i++) for (let j = 0; j < a.height; j++) c.set(i, j, a.get(i, j));
		return c;
	}
	return a.slice();
}

/** Array.Clear(array, start = 0, count = all): items back to their default (0, false, null). */
export function $clear(a: unknown, start = 0, count?: number) {
	if (a instanceof Array2D) {
		const n = count ?? a.width * a.height;
		const sample = a.width && a.height ? a.get(0, 0) : 0;
		const empty = typeof sample === 'number' ? 0 : typeof sample === 'boolean' ? false : null;
		a.clear(start, n, () => empty as never);
		return;
	}
	const arr = a as { length: number; [k: number]: unknown };
	const n = count ?? arr.length;
	const empty = typeof arr[0] === 'boolean' ? false : typeof arr[0] === 'number' ? 0 : null;
	for (let k = start; k < start + n; k++) arr[k] = empty;
}

/**
 * Terraria's Tile, as a view of one cell of a TileGrid (the site's tile arrays), so the
 * converted game code works on the same tiles as the rest of the site. Only what the converted
 * code uses: slopes, half blocks and paint aren't kept (setting one throws).
 */
export class Tile {
	constructor(
		private readonly g: TileGrid = new TileGrid(1, 1),
		private readonly k = 0
	) {}

	get type() {
		return this.g.type[this.k];
	}
	set type(v: number) {
		this.g.type[this.k] = v;
	}
	get frameX() {
		return this.g.frameX[this.k];
	}
	set frameX(v: number) {
		this.g.frameX[this.k] = v;
	}
	get frameY() {
		return this.g.frameY[this.k];
	}
	set frameY(v: number) {
		this.g.frameY[this.k] = v;
	}
	get wall() {
		return this.g.wall[this.k];
	}
	set wall(v: number) {
		this.g.wall[this.k] = v;
	}
	get liquid() {
		return this.g.liquid[this.k];
	}
	set liquid(v: number) {
		this.g.liquid[this.k] = v;
	}

	active_() {
		return this.g.active[this.k] === 1;
	}
	active_Boolean(v: boolean) {
		this.g.active[this.k] = v ? 1 : 0;
	}
	frameNumber_() {
		return this.g.frameNumber[this.k];
	}
	frameNumber_Byte(v: number) {
		this.g.frameNumber[this.k] = v;
	}
	/** Tile.lava(): the liquid is lava (liquid type 1); lava(false) clears its bit. */
	lava_() {
		return this.g.liquidType[this.k] === 1;
	}
	lava_Boolean(v: boolean) {
		this.g.liquidType[this.k] = v
			? (this.g.liquidType[this.k] & 2) | 1
			: this.g.liquidType[this.k] & 2;
	}
	honey_Boolean(v: boolean) {
		this.g.liquidType[this.k] = v
			? (this.g.liquidType[this.k] & 1) | 2
			: this.g.liquidType[this.k] & 1;
	}
	/** Actuated (inActive): no actuators here. */
	inActive_() {
		return false;
	}
	inActive_Boolean(v: boolean) {
		if (v) $hole('Tile.inActive(true)');
	}
	liquidType_Int32(v: number) {
		this.g.liquidType[this.k] = v;
	}
	/** Active and not actuated (no actuators here). */
	nactive() {
		return this.active_();
	}
	/** No half blocks or slopes here. */
	halfBrick_() {
		return false;
	}
	slope_() {
		return 0;
	}
	halfBrick_Boolean(v: boolean) {
		if (v) $hole('Tile.halfBrick(true)');
	}
	slope_Byte(v: number) {
		if (v) $hole('Tile.slope');
	}
	ClearSlope() {}
	/** BlockType.Solid: full blocks only here. */
	blockType() {
		return 0;
	}
	leftSlope() {
		return false;
	}
	rightSlope() {
		return false;
	}
	topSlope() {
		return false;
	}
	bottomSlope() {
		return false;
	}
	checkingLiquid_() {
		return false;
	}
	liquidType_() {
		return this.g.liquidType[this.k];
	}
	anyShimmer() {
		return this.liquid > 0 && this.liquidType_() === 3;
	}
	/** Tile.Clear(TileDataType): the parts kept here (paint, slopes and wiring aren't). */
	Clear(types: number) {
		const g = this.g;
		const k = this.k;
		if (types & 1) {
			g.type[k] = 0;
			g.active[k] = 0;
			g.frameX[k] = 0;
			g.frameY[k] = 0;
		}
		if (types & 4) g.wall[k] = 0;
		if (types & 16) {
			g.liquid[k] = 0;
			g.liquidType[k] = 0;
		}
	}
	/** No paint or coatings here. */
	color_Byte(_v: number) {}
	wallColor_Byte(_v: number) {}
	ClearBlockPaintAndCoating() {}
	ClearWallPaintAndCoating() {}
	UseBlockColors(_cache: unknown) {}
	/** The paint to copy onto another tile (UseBlockColors, which keeps none): nothing. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	BlockColorAndCoating(): any {
		return { clone: () => null };
	}

	/** Copies another tile into this one (`Main.tile[i, j] = tile`). */
	copyFrom(t: Tile) {
		for (const a of [
			'type',
			'active',
			'frameX',
			'frameY',
			'frameNumber',
			'wall',
			'liquid',
			'liquidType'
		] as const)
			this.g[a][this.k] = t.g[a][t.k];
	}
}

/** Main.tile: a TileGrid's cells as Tiles, `tile[i, j]` being get(i, j). */
export class TileView {
	constructor(readonly grid: TileGrid) {}

	get(i: number, j: number): Tile {
		const g = this.grid;
		if (i < 0 || j < 0 || i >= g.width || j >= g.height)
			throw new RangeError(`Index was outside the bounds of the array: [${i}, ${j}]`);
		return new Tile(g, j * g.width + i);
	}

	set(i: number, j: number, t: Tile) {
		this.get(i, j).copyFrom(t);
	}
}

/** An item dropped (Item.NewItem): from a rectangle, x y w h, as KillTile drops. */
export interface Drop {
	type: number;
	stack: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

/** SoundEngine.PlaySound(type, x, y, style, volume, pitch). */
export interface Sound {
	type: number;
	x: number;
	y: number;
	style: number;
}

/** What GamePlayer reads of the site's player. */
export interface Body {
	x: number;
	y: number;
	w: number;
	h: number;
	vx: number;
	vy: number;
	direction: number;
	controls: { left: boolean; right: boolean };
}

/**
 * An NPC, as a shaken tree asks for one (NPC.NewNPC): critters aren't simulated here, just
 * reported (Rt.critter); the slot handed back is the spare one past the last, as when none is
 * free, so what's set on it goes nowhere. tools/verify's oracle does the same.
 */
export class GameNPC {
	active = false;
	position = { X: 0, Y: 0 };
	width = 0;
	height = 0;
	velocity = { X: 0, Y: 0 };
	ai = [0, 0, 0, 0];
	netUpdate = false;
	CanBeReplacedByOtherNPCs = false;
	static goldCritterChance = 400;
	/** A fresh world: no bosses down (dungeon and temple walls can't be broken yet). */
	static downedBoss3 = false;
	static downedGolemBoss = false;
	/** No wind here. */
	static TooWindyForButterflies = false;

	static NewNPC(_source: unknown, x: number, y: number, type: number, ..._rest: unknown[]) {
		Rt.critter({ type, x, y });
		return 200;
	}
}

/** A critter a shaken tree let out (NPC.NewNPC): its type, where. */
export interface Critter {
	type: number;
	x: number;
	y: number;
}

/**
 * The world the converted code works on (Main.tile); where its dropped items and sounds go; and
 * WorldGen.TileFrameCosmetic, the site's own framing of blocks (./framing, checked separately).
 */
export const Rt = {
	tile: null as unknown as TileView,
	/** Main.rand. */
	rand: null as unknown as {
		Next_Int32(n: number): number;
		Next_Int32_Int32(a: number, b: number): number;
	},
	/** Main.npc: only the spare slot NPC.NewNPC hands back here is ever written to. */
	npc: Array.from({ length: 201 }, () => new GameNPC()),
	drop: (_d: Drop) => {},
	critter: (_c: Critter) => {},
	sound: (_s: Sound) => {},
	frameCosmetic: (i: number, j: number, _tile: Tile, resetFrame = false) => {
		const g = Rt.tile.grid;
		if (i <= 0 || j <= 0 || i >= g.width - 1 || j >= g.height - 1) return;
		if (!g.active[j * g.width + i]) return;
		if (resetFrame) g.frameNumber[j * g.width + i] = Rt.variant();
		g.tileFrameCosmetic(i, j);
	},
	/** KillTile_MakeTileDust: one dust for the tile. */
	tileDust: (_i: number, _j: number, _tile: Tile) => 0,
	/**
	 * Framing.WallFrame: the site draws walls' frames itself (Tiles.wallFrame); what's kept is
	 * the game's random variant when a wall's frame is reset (genRand.Next(0, 3)), into
	 * `wallVariant`.
	 */
	wallFrame: (i: number, j: number, resetFrame = false) => {
		const g = Rt.tile.grid;
		if (i <= 0 || j <= 0 || i >= g.width - 1 || j >= g.height - 1) return;
		const w = g.wall[j * g.width + i];
		if (w === 0 || !resetFrame) return;
		let v = Rt.rand.Next_Int32_Int32(0, 3);
		if (w === 21 && Rt.rand.Next_Int32(2) === 0) v = 2;
		Rt.wallVariant(i, j, v);
	},
	wallVariant: (_i: number, _j: number, _v: number) => {},
	/** new Rectangle(x, y, w, h) (the game's, from ./game). */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	rect: (_x: number, _y: number, _w: number, _h: number): any => null,
	/** TileFrameCosmetic's reset: a new random variant (WorldGen.genRand.Next(3)). */
	variant: () => 0
};

/**
 * The player, as the converted world code asks about it (whoever's closest to a broken tile:
 * there's one player). Its axe and accessories are set by the site.
 */
export class GamePlayer {
	/**
	 * The player it stands for (where it is, for Collision.EmptyTile; how it moves, for the
	 * doors it walks into), or none: an empty slot.
	 */
	constructor(private readonly me?: () => Body | undefined) {}

	private get body() {
		return this.me?.();
	}
	get active() {
		return !!this.body;
	}
	dead = false;
	ghost = false;
	get position() {
		return { X: this.body?.x ?? 0, Y: this.body?.y ?? 0 };
	}
	get width() {
		return this.body?.w ?? 0;
	}
	get height() {
		return this.body?.h ?? 0;
	}
	/** Where it's drawn below its hitbox (only for drawing). */
	gfxOffY = 0;
	gravDir = 1;
	get velocity() {
		return { X: this.body?.vx ?? 0, Y: this.body?.vy ?? 0 };
	}
	get controlLeft() {
		return !!this.body?.controls.left;
	}
	get controlRight() {
		return !!this.body?.controls.right;
	}
	/** Entity.Hitbox: its (int) rectangle. */
	get Hitbox() {
		const b = this.body;
		return Rt.rect(Math.trunc(b?.x ?? 0), Math.trunc(b?.y ?? 0), b?.w ?? 0, b?.h ?? 0);
	}
	/** Player.GetAutoDoorVelocityContribution: its speed (no roller skates here). */
	GetAutoDoorVelocityContribution() {
		return this.body?.vx ?? 0;
	}
	get direction() {
		return this.body?.direction ?? 1;
	}

	/** The held item (its axe power, for a tree's bonus wood). */
	inventory = [{ axe: 0 }];
	selectedItem = 0;
	cordage = false;
	staffOfRegrowthBonus = false;

	static FindClosest(..._args: unknown[]) {
		return 0;
	}
	/** Player.GetClosestRollLuck: Luck.RollLuck with the player's luck, 0 (Main.rand.Next(range)). */
	static GetClosestRollLuck_Int32_Int32_Int32(_x: number, _y: number, range: number) {
		return Rt.rand.Next_Int32(range);
	}
	HasItem_Int32(_type: number) {
		return false;
	}
	InterruptItemUsageIfOverTile(_type: number) {}
}

/** Item.NewItem(source, x, y, w, h, type, stack = 1, ...) or (source, centre, type, stack = 1, ...). */
export function $newItem(_source: unknown, ...a: unknown[]): number {
	if (typeof a[0] === 'number') {
		const [x, y, w, h, type, stack = 1] = a as number[];
		Rt.drop({ type, stack, x, y, w, h });
	} else $hole('Item.NewItem at a point');
	return 0;
}

/** A bool[] table copied from the game, as a string of 0s and 1s. */
export const $bools = (s: string): boolean[] => Array.from(s, (c) => c === '1');

/** C#'s non-short-circuit & and | on bools (both sides evaluated). */
export const $and = (a: boolean, b: boolean) => a && b;
export const $or = (a: boolean, b: boolean) => a || b;

/** IComparable.CompareTo on numbers. */
export const $compare = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);

/** Math.Round: to the nearest, halves to even (MidpointRounding.ToEven). */
export function $round(x: number, digits?: number): number {
	if (digits) {
		const k = 10 ** digits;
		return $round(x * k) / k;
	}
	const r = Math.round(x);
	return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** Code the oracle only stubs (Stub.Hit) or a placeholder: a case mustn't get there. */
export const $hit = (what: string): never => {
	throw new Error(`game code not ported was reached: ${what}`);
};
export const $hole = (what: string): never => {
	throw new Error(`game code not ported was reached: ${what}`);
};
/** An exception the game's code catches (and the oracle refuses the case on). */
export const $caught = (e: unknown): never => {
	throw e;
};

/** SoundEngine.PlaySound(type, x, y, style = 1, ...). */
export const $sound = (type: number, x = -1, y = -1, style = 1, ..._rest: unknown[]) => {
	if (typeof type === 'number') Rt.sound({ type, x, y, style });
	return null;
};

/** Lang.gen: the progress messages. */
export const $text = Array.from({ length: 100 }, () => ({ Value: '' }));

/** GenerationProgress: the progress bar. */
export class Progress {
	Message = '';
	Set(..._args: number[]) {}
}

/** GameConfiguration: the world generation settings the passes read (the game's values). */
export class GameConfiguration {
	readonly #values: Record<string, unknown> = { FlatBeachPadding: 5 };
	Get(entry: string) {
		return this.#values[entry] as number;
	}
}
