/**
 * A tiny Terraria 1.4.5 world: a few columns of grass, dirt and stone with one player who wanders
 * about, digs with a Copper Pickaxe and builds with what it digs up.
 *
 * Mining is the game's: Player.PickTile (the pickaxe's damage per block, HitTile's cracks and
 * the "miner's wobble"), WorldGen.KillTile (the dig or tink sound, tile dust, grass knocked back
 * to dirt, the block's item dropped). Placing is WorldGen.PlaceTile. Dropped blocks fall and are
 * pulled in and picked up like any item. Only the player's choices are made up: a little script
 * stands in for the person at the keyboard.
 */
import {
	fallItem,
	grabReach,
	hitbox,
	intersects,
	pullCommon,
	random,
	type Moving,
	type Rand
} from '$lib/game/items';
import { tileCollision } from './collision';
import { AIR, DIRT, GRASS, isSolid, STONE } from './framing';
import { LightMap, type RGB } from './light';
import { Player, type HeldItem } from './player';
import { MARGIN, Tiles } from './tiles';

export type Sound = 'dig' | 'tink' | 'swing' | 'grab';

/** An item the player uses: Item.SetDefaults' useAnimation, useTime and tileBoost. */
interface Usable extends HeldItem {
	useAnimation: number;
	useTime: number;
	tileBoost: number;
}
/** The Copper Pickaxe (item 3509), pick power 35. */
const PICKAXE: Usable = {
	item: 3509,
	width: 32,
	scale: 0.9,
	useAnimation: 23,
	useTime: 15,
	tileBoost: -1
};
const PICK_POWER = 35;
/** Dirt and Stone Blocks (items 2 and 3). */
const block = (item: number): Usable => ({
	item,
	width: 16,
	scale: 1,
	useAnimation: 15,
	useTime: 10,
	tileBoost: 0
});
/** Player.tileRangeX / tileRangeY. */
const RANGE_X = 5;
const RANGE_Y = 4;

/** The item a block drops (KillTile_GetItemDrops), and which block an item places. */
export const ITEM_OF: Record<number, number> = { [DIRT]: 2, [GRASS]: 2, [STONE]: 3 };
const TILE_OF: Record<number, number> = { 2: DIRT, 3: STONE };

export interface Drop extends Moving {
	item: number;
	grabbed: boolean;
}

/** Dust (Dust.NewDust / UpdateDust) for dust types 0-2, which just fly off and shrink away. */
export interface Dust {
	type: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	scale: number;
	rotation: number;
	/** Which of the dust's 3 frames (frame.Y / 10). */
	frame: number;
}

/** HitTile.HitTileObject: a block being mined. */
export interface Hit {
	i: number;
	j: number;
	damage: number;
	timeToLive: number;
	crackStyle: number;
	/** Frames since the last hit (animationTimeElapsed), for the miner's wobble. */
	sinceHit: number;
}

type Goal =
	| { kind: 'idle'; frames: number }
	| { kind: 'walk'; x: number }
	| { kind: 'mine' | 'place'; i: number; j: number };

export class World {
	tiles: Tiles;
	light: LightMap;
	readonly player: Player;
	drops: Drop[] = [];
	dust: Dust[] = [];
	hits: Hit[] = [];
	/** What the player has picked up: item type -> count. */
	inventory: Record<number, number> = { 2: 0, 3: 0 };
	/** The ground's height when the world was made, per column: the player keeps it roughly so. */
	surface: number[];

	#itemTime = 0;
	#goal: Goal = { kind: 'idle', frames: 60 };
	#stuck = 0;
	#lastCrack = -1;

	/** The whole world, in tiles: what's shown plus MARGIN (see ./tiles). */
	readonly width: number;
	height: number;

	/** A world showing `cols` x `rows` tiles. */
	constructor(
		readonly cols: number,
		rows: number,
		private rand: Rand = random
	) {
		this.width = cols + MARGIN * 2;
		this.height = rows + MARGIN;
		this.tiles = new Tiles(this.width, this.height, (n) => rand(n));
		this.light = new LightMap(this.width, this.height);
		this.surface = this.#generate();
		const i = MARGIN + Math.trunc(cols / 2);
		this.player = new Player(i * 16 + 8 - 10, this.surface[i] * 16 - 42);
	}

	/** How many rows are shown. */
	get rows() {
		return this.height - MARGIN;
	}

	/** Rolling grass over a few blocks of dirt, then stone with some dirt in it. */
	#generate(): number[] {
		const { width: W, height: H, tiles, rand: r } = this;
		const rows = this.rows;
		const base = Math.max(4, rows - Math.min(12, Math.round(rows * 0.45)));
		const phase = r(1000) / 100;
		const surface = Array.from({ length: W }, (_, i) =>
			Math.round(base + Math.sin(i * 0.55 + phase) * 1.2 + Math.sin(i * 0.23 + phase * 2) * 1.4)
		);
		for (let i = 0; i < W; i++) {
			const top = surface[i];
			const dirtDepth = 3 + r(3);
			for (let j = top; j < H; j++) {
				tiles.type[j * W + i] = j === top ? GRASS : j < top + dirtDepth ? DIRT : STONE;
				tiles.active[j * W + i] = 1;
				// A dirt wall behind the ground, from just under the grass.
				if (j > top + 1) tiles.wall[j * W + i] = 1;
			}
		}
		// A few patches: stone poking into the dirt, dirt in the stone.
		for (let n = 0; n < 3; n++) {
			const ci = MARGIN + r(this.cols);
			const cj = surface[ci] + 2 + r(6);
			const type = n === 0 ? STONE : DIRT;
			for (let i = ci - 2; i <= ci + 2; i++)
				for (let j = cj - 1; j <= cj + 1; j++)
					if (j > surface[i] && j < H && r(3) > 0) tiles.type[j * W + i] = type;
		}
		// Each block's random variant (frameNumber), then WorldGen's framing of the lot.
		for (let k = 0; k < W * H; k++) tiles.frameNumber[k] = r(3);
		tiles.frameAll();
		return surface;
	}

	/**
	 * Shows `rows` rows by adding (or taking away) rows of sky at the top, so
	 * the ground stays at the bottom as the page around it grows.
	 */
	setHeight(rows: number) {
		const height = rows + MARGIN;
		const d = height - this.height;
		if (!d) return;
		this.tiles = this.tiles.resized(height, (n) => this.rand(n));
		this.light = new LightMap(this.width, height);
		this.height = height;
		this.surface = this.surface.map((j) => j + d);
		this.player.y += d * 16;
		for (const e of [...this.drops, ...this.dust]) e.y += d * 16;
		this.hits = this.hits.filter((h) => (h.j += d) >= 0);
		const g = this.#goal;
		if (g.kind === 'mine' || g.kind === 'place') g.j += d;
	}

	/** One game frame. `sky` is the sky's colour (Main.ColorOfTheSkies); `sound` plays a sound. */
	update(sky: RGB, sound: (s: Sound, at: { x: number; y: number }) => void) {
		const p = this.player;
		this.#think(sound);
		p.update(this.tiles);
		if (this.#itemTime > 0) this.#itemTime--;
		this.#grow();
		this.#updateDrops(sound);
		this.#updateDust();
		for (const h of this.hits) h.sinceHit++;
		this.light.update(this.tiles, sky);
	}

	// ---- The player's hands ----------------------------------------------------------------------

	/** Player.IsInTileInteractionRange-style reach for an item's tileBoost. */
	inRange(i: number, j: number, boost: number) {
		const p = this.player;
		return (
			p.x / 16 - RANGE_X - boost <= i &&
			(p.x + p.w) / 16 + RANGE_X + boost - 1 >= i &&
			p.y / 16 - RANGE_Y - boost <= j &&
			(p.y + p.h) / 16 + RANGE_Y + boost - 2 >= j
		);
	}

	/** Holds the use button with `item` on (i, j): swings, and acts each useTime. */
	#use(
		item: Usable,
		i: number,
		act: () => boolean,
		sound: (s: Sound, at: { x: number; y: number }) => void
	) {
		const p = this.player;
		if (p.itemAnimation === 0) {
			// Turning to face the target as the swing starts.
			p.direction = i * 16 + 8 < p.center.x ? -1 : 1;
			p.swing(item, item.useAnimation);
			if (item === PICKAXE) sound('swing', p.center); // UseSound Item1
		}
		if (this.#itemTime === 0 && act()) this.#itemTime = item.useTime;
	}

	/** Player.PickTile: one pickaxe hit on (i, j). */
	pick(i: number, j: number, sound: (s: Sound, at: { x: number; y: number }) => void): boolean {
		const type = this.tiles.at(i, j);
		if (!isSolid(type)) return false;
		// GetPickaxeDamage: the pick power, doubled for dirt.
		const damage = PICK_POWER + (type === DIRT ? PICK_POWER : 0);
		let hit = this.hits.find((h) => h.i === i && h.j === j);
		if (!hit) {
			hit = { i, j, damage: 0, timeToLive: 0, crackStyle: this.#crack(), sinceHit: 0 };
			this.hits.push(hit);
		}
		hit.damage += damage;
		hit.timeToLive = 60;
		hit.sinceHit = 0;
		this.#killTile(i, j, hit.damage < 100, sound);
		if (hit.damage >= 100) this.hits = this.hits.filter((h) => h !== hit);
		this.#pruneHits();
		return true;
	}

	/** HitTileObject.Clear: a new crack pattern, never the same as the last one. */
	#crack() {
		let c = this.rand(4);
		while (c === this.#lastCrack) c = this.rand(4);
		this.#lastCrack = c;
		return c;
	}

	/** HitTile.Prune: damage on blocks left alone wears off. */
	#pruneHits() {
		this.hits = this.hits.filter((h) => {
			if (h.timeToLive <= 1) return false;
			h.timeToLive--;
			if (h.timeToLive < 12) h.damage -= 10;
			else if (h.timeToLive < 24) h.damage -= 7;
			else if (h.timeToLive < 36) h.damage -= 5;
			else if (h.timeToLive < 48) h.damage -= 2;
			return h.damage >= 0 && isSolid(this.tiles.at(h.i, h.j));
		});
	}

	/** WorldGen.KillTile: a hit that `fail`s just chips the block; otherwise it breaks and drops. */
	#killTile(
		i: number,
		j: number,
		fail: boolean,
		sound: (s: Sound, at: { x: number; y: number }) => void
	) {
		const type = this.tiles.at(i, j);
		const r = this.rand;
		const at = { x: i * 16 + 8, y: j * 16 + 8 };
		sound(type === STONE ? 'tink' : 'dig', at);
		for (let n = 0; n < (fail ? 3 : 10); n++) {
			// KillTile_MakeTileDust: dirt 0, stone 1, grass 0 or 2.
			const dust = type === STONE ? 1 : type === GRASS ? (r(2) !== 0 ? 2 : 0) : 0;
			this.#newDust(i * 16, j * 16, 16, 16, dust);
		}
		if (fail) {
			// The block stays (grass knocked back to dirt), reframed with a new variant.
			this.tiles.convert(i, j, type === GRASS ? DIRT : type, r(3));
			return;
		}
		this.tiles.kill(i, j);
		// Item.NewItem at the block's centre.
		const item = ITEM_OF[type];
		this.drops.push({
			item,
			x: i * 16 + 8 - 6,
			y: j * 16 + 8 - 6,
			w: 12,
			h: 12,
			vx: r(-30, 31) * 0.1,
			vy: r(-30, 31) * 0.1,
			grabbed: false
		});
	}

	/** WorldGen.PlaceTile for a block item: next to another block, not inside the player. */
	place(
		i: number,
		j: number,
		item: number,
		sound: (s: Sound, at: { x: number; y: number }) => void
	): boolean {
		if (!this.canPlace(i, j) || !this.inventory[item]) return false;
		this.tiles.place(i, j, TILE_OF[item], this.rand(3));
		this.inventory[item]--;
		sound('dig', { x: i * 16 + 8, y: j * 16 + 8 });
		return true;
	}

	canPlace(i: number, j: number) {
		const t = this.tiles;
		if (!t.inView(i, j) || t.at(i, j) !== AIR) return false;
		const touching = [
			[i - 1, j],
			[i + 1, j],
			[i, j - 1],
			[i, j + 1]
		].some(([x, y]) => isSolid(t.at(x, y)));
		const p = this.player;
		return touching && !intersects({ x: i * 16, y: j * 16, w: 16, h: 16 }, hitbox(p));
	}

	// ---- The world -------------------------------------------------------------------------------

	/**
	 * WorldGen.UpdateWorld's grass, roughly: a random block each frame; grass creeps onto open
	 * dirt beside it (WorldGen.SpreadGrass: the dirt becomes grass, reframed with a new variant).
	 */
	#grow() {
		const t = this.tiles;
		const i = this.rand(this.width);
		const j = this.rand(this.height);
		if (t.at(i, j) !== GRASS) return;
		const x = i + this.rand(-1, 2);
		const y = j + this.rand(-1, 2);
		if (t.at(x, y) !== DIRT) return;
		const open = [
			[x - 1, y],
			[x + 1, y],
			[x, y - 1],
			[x, y + 1]
		].some(([a, b]) => b >= 0 && t.at(a, b) === AIR);
		if (open) t.convert(x, y, GRASS, this.rand(3));
	}

	/** Player.GrabItems and WorldItem.UpdateItem for the dropped blocks. */
	#updateDrops(sound: (s: Sound, at: { x: number; y: number }) => void) {
		const p = this.player;
		const body = hitbox(p);
		const reach = grabReach(body);
		for (const d of this.drops) {
			if (intersects(body, hitbox(d))) {
				// Player.PickupItem: into the inventory, with the grab sound.
				this.inventory[d.item] = (this.inventory[d.item] ?? 0) + 1;
				d.item = 0;
				sound('grab', p.center);
				continue;
			}
			if (intersects(reach, hitbox(d))) {
				d.grabbed = true;
				pullCommon(d, body, p.vx, 0.75);
			}
		}
		this.drops = this.drops.filter((d) => d.item);
		for (const d of this.drops) {
			if (d.grabbed) {
				d.grabbed = false;
				d.x += d.vx;
				d.y += d.vy;
				continue;
			}
			fallItem(d, (c) => tileCollision(this.tiles, c));
		}
	}

	/** Dust.NewDust. */
	#newDust(x: number, y: number, w: number, h: number, type: number) {
		const r = this.rand;
		this.dust.push({
			type,
			x: x + r(Math.max(5, w) - 4) + 4,
			y: y + r(Math.max(5, h) - 4) + 4,
			vx: r(-20, 21) * 0.1,
			vy: r(-20, 21) * 0.1,
			scale: 1 + r(-20, 21) * 0.01,
			rotation: 0,
			frame: r(3)
		});
	}

	/** Dust.UpdateDust for plain dust: flies, falls, spins with its speed and shrinks away. */
	#updateDust() {
		for (const d of this.dust) {
			d.x += d.vx;
			d.y += d.vy;
			d.vy += 0.1;
			d.vx *= 0.99;
			d.rotation += d.vx * 0.5;
			d.scale -= 0.01;
		}
		this.dust = this.dust.filter((d) => d.scale >= 0.1);
	}

	// ---- The made-up part: what the player decides to do ------------------------------------------

	#think(sound: (s: Sound, at: { x: number; y: number }) => void) {
		const p = this.player;
		const g = this.#goal;
		p.controls = { left: false, right: false, jump: false };

		if (g.kind === 'idle') {
			if (--g.frames <= 0) this.#goal = this.#choose();
			return;
		}

		if (g.kind === 'walk') {
			if (this.#walkTo(g.x)) this.#goal = { kind: 'idle', frames: 20 + this.rand(90) };
			return;
		}

		// Mining or placing: get within reach (on the ground), then use the item until done.
		const item = g.kind === 'mine' ? PICKAXE : block(2);
		const done =
			g.kind === 'mine' ? !isSolid(this.tiles.at(g.i, g.j)) : this.tiles.at(g.i, g.j) !== AIR;
		if (done) {
			if (p.itemAnimation === 0) this.#goal = { kind: 'idle', frames: 15 + this.rand(60) };
			return;
		}
		if (g.kind === 'place' && (!this.canPlace(g.i, g.j) || !this.#blockToPlace())) {
			this.#goal = { kind: 'idle', frames: 30 };
			return;
		}
		if (!this.inRange(g.i, g.j, item.tileBoost) || (!p.grounded && p.itemAnimation === 0)) {
			const side = g.i * 16 + 8 < p.center.x ? 1 : -1;
			if (this.#walkTo(g.i * 16 + 8 + side * 40)) {
				// Can't get closer: give up on it.
				if (!this.inRange(g.i, g.j, item.tileBoost)) this.#goal = { kind: 'idle', frames: 30 };
			}
			return;
		}
		if (g.kind === 'mine') this.#use(PICKAXE, g.i, () => this.pick(g.i, g.j, sound), sound);
		else {
			const type = this.#blockToPlace()!;
			this.#use(block(type), g.i, () => this.place(g.i, g.j, type, sound), sound);
		}
	}

	/** Walks toward x, jumping over what's in the way. True once there (or stuck for good). */
	#walkTo(x: number): boolean {
		const p = this.player;
		const dx = x - p.center.x;
		if (Math.abs(dx) < 6) return p.grounded;
		p.controls.left = dx < 0;
		p.controls.right = dx > 0;
		// Blocked by a wall: jump (and keep holding it to jump higher).
		const blocked = p.vx === 0 && p.grounded;
		if (blocked || (this.#stuck > 0 && !p.grounded)) {
			this.#stuck++;
			p.controls.jump = this.#stuck % 40 < 20;
		} else this.#stuck = 0;
		if (this.#stuck > 150) {
			// Too high to jump: dig through it instead.
			this.#stuck = 0;
			const dir = dx < 0 ? -1 : 1;
			const i = Math.trunc((p.center.x + dir * 16) / 16);
			const j = Math.trunc((p.y + p.h - 8) / 16);
			for (const jj of [j - 1, j, j - 2])
				if (isSolid(this.tiles.at(i, jj))) {
					this.#goal = { kind: 'mine', i, j: jj };
					return false;
				}
			return true;
		}
		return false;
	}

	#blockToPlace(): number | null {
		if (this.inventory[2] > 0) return 2;
		if (this.inventory[3] > 0) return 3;
		return null;
	}

	/** The top block in column i (the height if there's none). */
	top(i: number) {
		for (let j = 0; j < this.height; j++) if (isSolid(this.tiles.at(i, j))) return j;
		return this.height;
	}

	/** Picks something to do: wander, dig the ground down where it's high, fill it in where low. */
	#choose(): Goal {
		const r = this.rand;
		const W = this.width;
		const tops = Array.from({ length: W }, (_, i) => this.top(i));
		// Columns in view, not right at its sides.
		const first = MARGIN + 1;
		const last = W - MARGIN - 2;
		const p = this.player;
		// A dropped block nearby: go and get it.
		const loose = this.drops.find((d) => Math.abs(d.x - p.x) < 16 * 8);
		if (loose && r(2) === 0) return { kind: 'walk', x: loose.x + 6 };
		const roll = r(10);
		const blocks = (this.inventory[2] ?? 0) + (this.inventory[3] ?? 0);
		if (roll < 4 || (roll < 7 && blocks === 0)) {
			// Mine an open block that's no deeper than 3 below where the ground was.
			const options: [number, number][] = [];
			for (let i = first; i <= last; i++) {
				const j = tops[i];
				if (j < this.rows - 1 && j <= this.surface[i] + 2) options.push([i, j]);
			}
			const weighted = options.filter(([i, j]) => j <= this.surface[i] || r(3) === 0);
			const pick = weighted[r(weighted.length)] ?? options[r(options.length)];
			if (pick) return { kind: 'mine', i: pick[0], j: pick[1] };
		}
		if (roll < 7 && blocks > 0) {
			// Build up a column that's no more than 3 above where the ground was.
			const options: [number, number][] = [];
			for (let i = first; i <= last; i++) {
				const j = tops[i] - 1;
				if (j >= 2 && j >= this.surface[i] - 3 && this.canPlace(i, j)) {
					// Lower spots first.
					const weight = j < this.surface[i] ? 1 : 3;
					for (let k = 0; k < weight; k++) options.push([i, j]);
				}
			}
			const pick = options[r(options.length)];
			if (pick) return { kind: 'place', i: pick[0], j: pick[1] };
		}
		return { kind: 'walk', x: first * 16 + r((last - first + 1) * 16) };
	}
}
