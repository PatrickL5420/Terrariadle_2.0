/**
 * A tiny Terraria 1.4.5 world: a few columns of grass, dirt and stone with one player who wanders
 * about, digs with a Copper Pickaxe and builds with what it digs up.
 *
 * Using the pickaxe and the blocks is the game's own Player.ItemCheck, ported and checked
 * against the game frame by frame (./item-check): the swing, the pickaxe's damage per block
 * (HitTile's cracks and the "miner's wobble"), WorldGen.KillTile (the dig or tink sound, tile
 * dust, grass knocked back to dirt, the block's item dropped) and WorldGen.PlaceTile. Dropped
 * blocks fall and are pulled in and picked up like any item. Only the player's choices are made
 * up: a little script stands in for the person at the keyboard and mouse.
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
import {
	canPlaceAt,
	inRange,
	overlapsPlayer,
	stats,
	type DropCall,
	type Item,
	type ItemWorld,
	type SoundCall
} from './item-check';
import { LightMap, type RGB } from './light';
import { Player } from './player';
import { MARGIN, Tiles } from './tiles';

export type Sound = 'dig' | 'tink' | 'swing' | 'grab';

const PICKAXE = 3509;

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

type Goal =
	| { kind: 'idle'; frames: number }
	| { kind: 'walk'; x: number }
	| { kind: 'mine' | 'place'; i: number; j: number };

export class World implements ItemWorld {
	tiles: Tiles;
	light: LightMap;
	readonly player: Player;
	drops: Drop[] = [];
	dust: Dust[] = [];
	/** The player's inventory: the pickaxe, and the blocks it's picked up. */
	inventory: Item[] = [
		{ type: PICKAXE, stack: 1 },
		{ type: 2, stack: 0 },
		{ type: 3, stack: 0 }
	];
	/** The ground's height when the world was made, per column: the player keeps it roughly so. */
	surface: number[];

	#goal: Goal = { kind: 'idle', frames: 60 };
	#stuck = 0;
	#sound: (s: Sound, at: { x: number; y: number }) => void = () => {};

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
		this.player.releaseJump = true;
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
		const p = this.player;
		p.y += d * 16;
		p.itemLocation.y += d * 16;
		p.tileTargetY += d;
		for (const h of p.hitTile.data) if (h.type) h.y += d;
		for (const e of [...this.drops, ...this.dust]) e.y += d * 16;
		const g = this.#goal;
		if (g.kind === 'mine' || g.kind === 'place') g.j += d;
	}

	/** One game frame. `sky` is the sky's colour (Main.ColorOfTheSkies); `sound` plays a sound. */
	update(sky: RGB, sound: (s: Sound, at: { x: number; y: number }) => void) {
		this.#sound = sound;
		this.#think();
		this.player.update(this.tiles, this);
		this.#grow();
		this.#updateDrops();
		this.#updateDust();
		// HitTile.DrawFreshAnimations' clock, for the miner's wobble.
		for (const h of this.player.hitTile.data) h.animationTimeElapsed++;
		this.light.update(this.tiles, sky);
	}

	// ---- What the player's item does to the world (ItemWorld, for ./item-check) ---------------

	/** SquareTileFrame's reset: a new random variant. */
	variant() {
		return this.rand(3);
	}

	/** The game's sounds by type: 0 dig, 21 tink; an item's use sound (Item1) is the swing. */
	sound(s: SoundCall) {
		const name: Sound | null =
			s.type === 0 ? 'dig' : s.type === 21 ? 'tink' : s.type === 2 ? 'swing' : null;
		if (name) this.#sound(name, { x: s.x, y: s.y });
	}

	/** Item.NewItem: the item centred on the rectangle, flung a little. */
	drop(d: DropCall) {
		const r = this.rand;
		this.drops.push({
			item: d.type,
			x: d.x + d.w / 2 - 6,
			y: d.y + d.h / 2 - 6,
			w: 12,
			h: 12,
			vx: r(-30, 31) * 0.1,
			vy: r(-30, 31) * 0.1,
			grabbed: false
		});
	}

	/** KillTile_MakeTileDust: dirt 0, stone 1, grass 0 or 2. */
	tileDust(i: number, j: number, type: number, count: number) {
		const r = this.rand;
		for (let n = 0; n < count; n++) {
			const dust = type === STONE ? 1 : type === GRASS ? (r(2) !== 0 ? 2 : 0) : 0;
			this.#newDust(i * 16, j * 16, 16, 16, dust);
		}
	}

	/** Whether a block could go at (i, j) now: open, shown, built onto, nobody in the way. */
	canPlace(i: number, j: number) {
		const t = this.tiles;
		return (
			t.inView(i, j) &&
			t.at(i, j) === AIR &&
			canPlaceAt(this, i, j) &&
			!overlapsPlayer(this.player, i, j)
		);
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
	#updateDrops() {
		const p = this.player;
		const body = hitbox(p);
		const reach = grabReach(body);
		for (const d of this.drops) {
			if (intersects(body, hitbox(d))) {
				// Player.PickupItem: onto its stack (or into an empty slot), with the grab sound.
				const slot =
					this.inventory.find((it) => it.type === d.item) ??
					this.inventory.find((it) => it.type === 0);
				if (slot) {
					slot.type = d.item;
					slot.stack++;
				}
				d.item = 0;
				this.#sound('grab', p.center);
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

	#think() {
		const p = this.player;
		const g = this.#goal;
		p.controls = { left: false, right: false, jump: false, use: false };

		if (g.kind === 'idle') {
			if (--g.frames <= 0) this.#goal = this.#choose();
			return;
		}

		if (g.kind === 'walk') {
			if (this.#walkTo(g.x)) this.#goal = { kind: 'idle', frames: 20 + this.rand(90) };
			return;
		}

		// Mining or placing: get within reach (on the ground), then hold the button on it.
		const done =
			g.kind === 'mine' ? !isSolid(this.tiles.at(g.i, g.j)) : this.tiles.at(g.i, g.j) !== AIR;
		if (done) {
			if (p.itemAnimation === 0) this.#goal = { kind: 'idle', frames: 15 + this.rand(60) };
			return;
		}
		const slot = g.kind === 'mine' ? this.inventory[0] : this.#blockToPlace();
		if (g.kind === 'place' && (!this.canPlace(g.i, g.j) || !slot)) {
			if (p.itemAnimation === 0) this.#goal = { kind: 'idle', frames: 30 };
			return;
		}
		// Switching items: only between swings.
		if (p.itemAnimation === 0 && slot) p.item = slot;
		const boost = stats(p.item.type).tileBoost;
		if (!inRange(p, g.i, g.j, boost) || (!p.grounded && p.itemAnimation === 0)) {
			const side = g.i * 16 + 8 < p.center.x ? 1 : -1;
			if (this.#walkTo(g.i * 16 + 8 + side * 40)) {
				// Can't get closer: give up on it.
				if (!inRange(p, g.i, g.j, boost)) this.#goal = { kind: 'idle', frames: 30 };
			}
			return;
		}
		// The cursor on it and the button held; a tap toward it first, to face it.
		const toward = g.i * 16 + 8 < p.center.x ? -1 : 1;
		if (p.itemAnimation === 0 && p.direction !== toward) {
			p.controls.left = toward < 0;
			p.controls.right = toward > 0;
		}
		p.tileTargetX = g.i;
		p.tileTargetY = g.j;
		p.controls.use = true;
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

	/** A stack of blocks to build with (dirt first). */
	#blockToPlace(): Item | null {
		return this.inventory.find((it) => (it.type === 2 || it.type === 3) && it.stack > 0) ?? null;
	}

	/** How many blocks the player has. */
	get blocks() {
		return this.inventory.reduce((n, it) => n + (it.type === 2 || it.type === 3 ? it.stack : 0), 0);
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
		const blocks = this.blocks;
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
