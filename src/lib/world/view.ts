/**
 * What drawing the little world needs (./draw, MiniWorld.svelte): its tiles, light, how the
 * player looks, drops, dust and the blocks being mined. A World is a Scene; so is a Mirror, kept
 * in step with a World running in a worker (./worker) by the Frames it sends: the tiles that
 * changed, the light when it was worked out again, and the rest whole (it's small).
 */
import type { HitTileObject } from './hit-tile';
import { LightMap } from './light';
import type { Drop, Dust, Sound, World } from './sim';
import { TileChanges, Tiles } from './tiles';

/** How the player looks (the Player fields drawing reads). */
export interface PlayerLook {
	x: number;
	y: number;
	w: number;
	h: number;
	center: { x: number; y: number };
	gfxOffY: number;
	direction: 1 | -1;
	bodyFrame: number;
	legFrame: number;
	eyeFrame: number;
	itemAnimation: number;
	itemRotation: number;
	itemLocation: { x: number; y: number };
	lastVisualized: { type: number; stack: number };
}

export type DropLook = Pick<Drop, 'item' | 'x' | 'y' | 'w' | 'h' | 'vx'>;
export type HitLook = Pick<
	HitTileObject,
	'x' | 'y' | 'damage' | 'crackStyle' | 'animationTimeElapsed'
>;

export interface Scene {
	readonly tiles: Tiles;
	readonly light: LightMap;
	readonly player: PlayerLook;
	readonly drops: readonly DropLook[];
	readonly dust: readonly Dust[];
	/** The blocks with damage on them (HitTile), for their cracks. */
	readonly hits: readonly HitLook[];
	readonly treeStyle: number;
	readonly width: number;
	readonly height: number;
	readonly cols: number;
	readonly rows: number;
}

const FIELDS = [
	'type',
	'active',
	'frameX',
	'frameY',
	'frameNumber',
	'wall',
	'wallVariant'
] as const;

/** What changed in a World over some steps (posted from the worker). */
export interface Frame {
	width: number;
	height: number;
	cols: number;
	rows: number;
	treeStyle: number;
	/** The tiles changed (indices), and their new values, field by field (FIELDS). */
	changed: Int32Array;
	values: Int32Array[];
	light?: { version: number; r: Float32Array; g: Float32Array; b: Float32Array };
	player: PlayerLook;
	drops: DropLook[];
	dust: Dust[];
	hits: HitLook[];
	sounds: Sound[];
}

/** Makes a World's Frames (in the worker). */
export class Recorder {
	#changes = new TileChanges(FIELDS);
	#light = -1;

	frame(world: World, sounds: Sound[]): Frame {
		const { tiles, light, player: p } = world;
		const taken = this.#changes.take(tiles);
		const changed =
			taken === 'all'
				? Int32Array.from({ length: tiles.type.length }, (_, k) => k)
				: Int32Array.from(taken);
		const values = FIELDS.map((f) => Int32Array.from(changed, (k) => tiles[f][k]));
		let lit: Frame['light'];
		if (light.version !== this.#light) {
			this.#light = light.version;
			lit = { version: light.version, r: light.r.slice(), g: light.g.slice(), b: light.b.slice() };
		}
		return {
			width: world.width,
			height: world.height,
			cols: world.cols,
			rows: world.rows,
			treeStyle: world.treeStyle,
			changed,
			values,
			light: lit,
			player: {
				x: p.x,
				y: p.y,
				w: p.w,
				h: p.h,
				center: p.center,
				gfxOffY: p.gfxOffY,
				direction: p.direction,
				bodyFrame: p.bodyFrame,
				legFrame: p.legFrame,
				eyeFrame: p.eyeFrame,
				itemAnimation: p.itemAnimation,
				itemRotation: p.itemRotation,
				itemLocation: { ...p.itemLocation },
				lastVisualized: { type: p.lastVisualized.type, stack: p.lastVisualized.stack }
			},
			drops: world.drops.map(({ item, x, y, w, h, vx }) => ({ item, x, y, w, h, vx })),
			dust: world.dust.map((d) => ({ ...d })),
			hits: world.hits.map(({ x, y, damage, crackStyle, animationTimeElapsed }) => ({
				x,
				y,
				damage,
				crackStyle,
				animationTimeElapsed
			})),
			sounds
		};
	}

	/** What a Frame can hand over to the other side rather than copy. */
	static transfer(f: Frame): ArrayBuffer[] {
		const out = [f.changed, ...f.values].map((a) => a.buffer as ArrayBuffer);
		if (f.light) out.push(...[f.light.r, f.light.g, f.light.b].map((a) => a.buffer as ArrayBuffer));
		return out;
	}
}

/** A World as its Frames show it (on the page). */
export class Mirror implements Scene {
	readonly tiles: Tiles;
	readonly light: LightMap;
	readonly width: number;
	readonly height: number;
	readonly cols: number;
	readonly rows: number;
	readonly treeStyle: number;
	player!: PlayerLook;
	drops: DropLook[] = [];
	dust: Dust[] = [];
	hits: HitLook[] = [];

	constructor(first: Frame) {
		({
			width: this.width,
			height: this.height,
			cols: this.cols,
			rows: this.rows,
			treeStyle: this.treeStyle
		} = first);
		this.tiles = new Tiles(first.width, first.height, () => 0);
		this.light = new LightMap(first.width, first.height);
		this.apply(first);
	}

	apply(f: Frame) {
		const { changed, values } = f;
		FIELDS.forEach((field, n) => {
			const a = this.tiles[field];
			const v = values[n];
			for (let m = 0; m < changed.length; m++) a[changed[m]] = v[m];
		});
		if (f.light) {
			this.light.r.set(f.light.r);
			this.light.g.set(f.light.g);
			this.light.b.set(f.light.b);
			this.light.version = f.light.version;
		}
		this.player = f.player;
		this.drops = f.drops;
		this.dust = f.dust;
		this.hits = f.hits;
	}
}
