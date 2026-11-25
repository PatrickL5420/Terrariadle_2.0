import { describe, expect, it } from 'vitest';
import { stepUp, tileCollision } from './collision';
import { DIRT, GRASS, isSolid, STONE } from './framing';
import { pickTile, type ItemWorld } from './item-check';
import { LightMap, tileColor } from './light';
import { Player } from './player';
import { World } from './sim';
import { MARGIN, Tiles } from './tiles';

/**
 * A flat world showing `cols` x `rows` (plus the margin around it): air above row `ground`, dirt
 * from it down. `X` is the first column shown.
 */
const X = MARGIN;
function flat(cols = 10, rows = 12, ground = 8) {
	const width = cols + MARGIN * 2;
	const height = rows + MARGIN;
	const t = new Tiles(width, height, () => 0);
	for (let j = ground; j < height; j++)
		for (let i = 0; i < width; i++) {
			t.type[j * width + i] = DIRT;
			t.active[j * width + i] = 1;
		}
	t.frameAll();
	return t;
}

const quiet = () => {};

describe('tile framing (WorldGen.TileFrame)', () => {
	it('frames buried dirt with the plain middle frame, the top with the open-top frame', () => {
		const t = flat();
		const k = (r: number) => r * t.width + X + 4;
		expect([t.frameX[k(10)], t.frameY[k(10)]]).toEqual([18, 18]);
		expect([t.frameX[k(8)], t.frameY[k(8)]]).toEqual([18, 0]);
	});

	it('reframes the blocks around one placed or broken', () => {
		const t = flat();
		const k = 8 * t.width + X + 4;
		for (let i = 0; i < t.width; i++) t.place(i, 7, DIRT, 0);
		expect([t.frameX[k], t.frameY[k]]).toEqual([18, 18]);
		t.kill(X + 4, 7);
		expect([t.frameX[k], t.frameY[k]]).toEqual([18, 0]);
	});
});

describe('collision (Collision.TileCollision, StepUp)', () => {
	it('lands a falling body exactly on the ground', () => {
		const t = flat();
		const body = { x: (X + 2) * 16, y: 8 * 16 - 42 - 3, w: 20, h: 42, vx: 0, vy: 5 };
		const hit = tileCollision(t, body);
		expect(hit.down).toBe(true);
		expect(body.y + body.h + hit.vy).toBe(8 * 16);
	});

	it('stops at a wall two blocks high', () => {
		const t = flat();
		t.place(X + 5, 7, DIRT, 0);
		t.place(X + 5, 6, DIRT, 0);
		const body = { x: (X + 5) * 16 - 21, y: 8 * 16 - 42, w: 20, h: 42, vx: 3, vy: 0 };
		const hit = tileCollision(t, body);
		expect(body.x + body.w + hit.vx).toBe((X + 5) * 16);
		const step = { stepSpeed: 1, gfxOffY: 0 };
		stepUp(t, body, step);
		expect(step.gfxOffY).toBe(0);
	});

	it('walks up a one-block step', () => {
		const t = flat();
		t.place(X + 5, 7, DIRT, 0);
		const body = { x: (X + 5) * 16 - 21, y: 8 * 16 - 42, w: 20, h: 42, vx: 3, vy: 0.4 };
		const step = { stepSpeed: 1, gfxOffY: 0 };
		stepUp(t, body, step);
		expect(step.gfxOffY).toBe(16);
		expect(body.y + body.h).toBe(7 * 16);
	});
});

describe('the player (Player.Update)', () => {
	it('jumps about six blocks high, holding jump', () => {
		const t = flat(10, 30, 26);
		const p = new Player((X + 4) * 16, 26 * 16 - 42);
		p.update(t);
		const ground = p.y;
		let top = ground;
		p.controls.jump = true;
		for (let f = 0; f < 120; f++) {
			p.update(t);
			top = Math.min(top, p.y);
		}
		expect(p.y).toBe(ground);
		expect((ground - top) / 16).toBeGreaterThan(5.5);
		expect((ground - top) / 16).toBeLessThan(7);
	});

	it('runs at about 3 px a frame (the game overshoots, then friction pulls it back)', () => {
		const t = flat(40);
		const p = new Player((X + 1) * 16, 8 * 16 - 42);
		p.controls.right = true;
		const speeds: number[] = [];
		for (let f = 0; f < 70; f++) {
			p.update(t);
			speeds.push(p.vx);
		}
		const top = speeds.slice(40);
		expect(Math.min(...top)).toBeGreaterThan(2.8);
		expect(Math.max(...top)).toBeLessThan(3.1);
		expect(p.legFrame).toBeGreaterThanOrEqual(7);
	});
});

describe('mining (Player.PickTile with a Copper Pickaxe)', () => {
	/** A world with one block of `type` to mine, and what mining it does. */
	const worldWith = (type: number) => {
		const w = new World(() => 0);
		const j = w.top(X + 2);
		w.tiles.place(X + 2, j, type, 0);
		const sounds: string[] = [];
		const drops: number[] = [];
		let dust = 0;
		const hands: ItemWorld = {
			tiles: w.tiles,
			variant: () => 0,
			sound: (s) => sounds.push(s.type === 21 ? 'tink' : 'dig'),
			drop: (d) => drops.push(d.type),
			tileDust: (_i, _j, _type, n) => (dust += n)
		};
		const hit = () => pickTile(w.player, hands, X + 2, j, 35);
		return { w, j, sounds, drops, hit, dust: () => dust };
	};
	const hitsToBreak = (type: number) => {
		const m = worldWith(type);
		let n = 0;
		while (isSolid(m.w.tiles.at(X + 2, m.j)) && n < 10) {
			m.hit();
			n++;
		}
		return { ...m, n };
	};

	it('breaks dirt in 2 hits, stone in 3, grass in 2 (knocked back to dirt first)', () => {
		expect(hitsToBreak(DIRT).n).toBe(2);
		expect(hitsToBreak(STONE).n).toBe(3);
		expect(hitsToBreak(GRASS).n).toBe(2);
	});

	it('tinks on stone, digs on dirt, and drops the block', () => {
		const stone = hitsToBreak(STONE);
		expect(stone.sounds).toEqual(['tink', 'tink', 'tink']);
		expect(stone.drops).toEqual([3]);
		const grass = hitsToBreak(GRASS);
		expect(grass.sounds).toEqual(['dig', 'dig']);
		expect(grass.drops).toEqual([2]);
	});

	it('turns grass to dirt on the first hit, with dust', () => {
		const m = worldWith(GRASS);
		m.hit();
		expect(m.w.tiles.at(X + 2, m.j)).toBe(DIRT);
		expect(m.dust()).toBe(3);
		expect([...m.w.player.hitTile.blocks()].map((h) => h.damage)).toEqual([35]);
	});
});

describe('lighting', () => {
	it('lights open sky fully and fades into the ground', () => {
		const t = flat(6, 20, 4);
		const l = new LightMap(t.width, t.height);
		l.update(t, [255, 255, 255]);
		expect(l.color(X + 2, 1)).toEqual([255, 255, 255]);
		const surface = l.color(X + 2, 4)[0];
		const deep = l.color(X + 2, 12)[0];
		expect(surface).toBeGreaterThan(200);
		expect(deep).toBeLessThan(10);
	});

	it('washes the sky colour toward grey for tiles (ApplyColorOfTheSkiesToTiles)', () => {
		expect(tileColor([255, 255, 255])).toEqual([255, 255, 255]);
		expect(tileColor([100, 0, 0])).toEqual([80, 10, 10]);
	});
});

describe('the little world', () => {
	it('keeps going for a long while without the player leaving it', () => {
		const w = new World();
		const start = w.tiles.active.slice();
		for (let f = 0; f < 60 * 60; f++) {
			w.update([255, 255, 255], quiet);
			const p = w.player;
			expect(p.x).toBeGreaterThanOrEqual(X * 16);
			expect(p.x + p.w).toBeLessThanOrEqual((X + w.cols) * 16);
			expect(p.y + p.h).toBeLessThanOrEqual(w.rows * 16);
		}
		// It does things: blocks have been dug or placed.
		expect(w.tiles.active).not.toEqual(start);
	}, 60_000);

	it('is made by the game’s world generation: grass over dirt and stone, clay, walls', () => {
		const w = new World();
		const types = new Set<number>();
		for (let k = 0; k < w.width * w.height; k++) if (w.tiles.active[k]) types.add(w.tiles.type[k]);
		expect([...types].sort((a, b) => a - b)).toEqual([0, 1, 2, 40]);
		expect(w.tiles.wall.some((x) => x === 1)).toBe(true);
		expect(w.cols).toBe(150);
	});
});
