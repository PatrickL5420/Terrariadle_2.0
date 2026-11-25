import { describe, expect, it } from 'vitest';
import { stepUp, tileCollision } from './collision';
import { AIR, DIRT, GRASS, isSolid, STONE } from './framing';
import { LightMap, tileColor } from './light';
import { Player } from './player';
import { World, type Sound } from './sim';
import { Tiles } from './tiles';

/** A flat world: air above row `ground`, dirt from it down. */
function flat(width = 10, height = 12, ground = 8) {
	const t = new Tiles(width, height, () => 0);
	for (let j = ground; j < height; j++)
		for (let i = 0; i < width; i++) t.type[j * width + i] = DIRT;
	t.frameAll();
	return t;
}

const quiet = () => {};

describe('tile framing (WorldGen.TileFrame)', () => {
	it('frames a block surrounded by its own kind with the plain middle frame', () => {
		const t = flat();
		const k = 10 * 10 + 4;
		expect([t.frameX[k], t.frameY[k]]).toEqual([18, 18]);
	});

	it('frames the top of the ground with the open-top frame, and reframes on change', () => {
		const t = flat();
		const k = 8 * 10 + 4;
		expect([t.frameX[k], t.frameY[k]]).toEqual([18, 0]);
		for (let i = 0; i < 10; i++) t.set(i, 7, DIRT);
		expect([t.frameX[k], t.frameY[k]]).toEqual([18, 18]);
	});
});

describe('collision (Collision.TileCollision, StepUp)', () => {
	it('lands a falling body exactly on the ground', () => {
		const t = flat();
		const body = { x: 40, y: 8 * 16 - 42 - 3, w: 20, h: 42, vx: 0, vy: 5 };
		const hit = tileCollision(t, body);
		expect(hit.down).toBe(true);
		expect(body.y + body.h + hit.vy).toBe(8 * 16);
	});

	it('stops at a wall two blocks high', () => {
		const t = flat();
		t.set(5, 7, DIRT);
		t.set(5, 6, DIRT);
		const body = { x: 5 * 16 - 21, y: 8 * 16 - 42, w: 20, h: 42, vx: 3, vy: 0 };
		const hit = tileCollision(t, body);
		expect(body.x + body.w + hit.vx).toBe(5 * 16);
		expect(stepUp(t, { ...body })).toBeNull();
	});

	it('walks up a one-block step', () => {
		const t = flat();
		t.set(5, 7, DIRT);
		const body = { x: 5 * 16 - 21, y: 8 * 16 - 42, w: 20, h: 42, vx: 3, vy: 0.4 };
		const step = stepUp(t, body);
		expect(step?.lift).toBe(16);
		expect(body.y + body.h).toBe(7 * 16);
	});
});

describe('the player (Player.Update)', () => {
	it('jumps about six blocks high, holding jump', () => {
		const t = flat(10, 30, 26);
		const p = new Player(60, 26 * 16 - 42);
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

	it('runs up to 3 px a frame', () => {
		const t = flat(40);
		const p = new Player(20, 8 * 16 - 42);
		p.controls.right = true;
		for (let f = 0; f < 50; f++) p.update(t);
		expect(p.vx).toBeCloseTo(3, 1);
		expect(p.legFrame).toBeGreaterThanOrEqual(7);
	});
});

describe('mining (Player.PickTile with a Copper Pickaxe)', () => {
	const worldWith = (type: number) => {
		const w = new World(10, 20, () => 0);
		const j = w.top(2);
		w.tiles.set(2, j, type);
		return { w, j };
	};
	const hitsToBreak = (type: number) => {
		const { w, j } = worldWith(type);
		const sounds: Sound[] = [];
		let n = 0;
		while (isSolid(w.tiles.at(2, j)) && n < 10) {
			w.pick(2, j, (s) => sounds.push(s));
			n++;
		}
		return { n, w, sounds };
	};

	it('breaks dirt in 2 hits, stone in 3, grass in 2 (knocked back to dirt first)', () => {
		expect(hitsToBreak(DIRT).n).toBe(2);
		expect(hitsToBreak(STONE).n).toBe(3);
		expect(hitsToBreak(GRASS).n).toBe(2);
	});

	it('tinks on stone, digs on dirt, and drops the block', () => {
		const stone = hitsToBreak(STONE);
		expect(stone.sounds).toEqual(['tink', 'tink', 'tink']);
		expect(stone.w.drops.map((d) => d.item)).toEqual([3]);
		const grass = hitsToBreak(GRASS);
		expect(grass.sounds).toEqual(['dig', 'dig']);
		expect(grass.w.drops.map((d) => d.item)).toEqual([2]);
	});

	it('turns grass to dirt on the first hit, with dust', () => {
		const { w, j } = worldWith(GRASS);
		w.pick(2, j, quiet);
		expect(w.tiles.at(2, j)).toBe(DIRT);
		expect(w.dust.length).toBe(3);
		expect(w.hits[0].damage).toBe(35);
	});
});

describe('lighting', () => {
	it('lights open sky fully and fades into the ground', () => {
		const t = flat(6, 20, 4);
		const l = new LightMap(6, 20);
		l.update(t, [255, 255, 255]);
		expect(l.color(2, 1)).toEqual([255, 255, 255]);
		const surface = l.color(2, 4)[0];
		const deep = l.color(2, 12)[0];
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
		const w = new World(13, 30);
		for (let f = 0; f < 60 * 60 * 3; f++) {
			w.update([255, 255, 255], quiet);
			const p = w.player;
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.x + p.w).toBeLessThanOrEqual(13 * 16);
			expect(p.y + p.h).toBeLessThanOrEqual(30 * 16);
		}
		// It does things: some blocks have moved.
		let air = 0;
		for (let j = 0; j < 30; j++) for (let i = 0; i < 13; i++) if (w.tiles.at(i, j) === AIR) air++;
		expect(air).toBeGreaterThan(0);
	});

	it('grows taller by adding sky, keeping the ground at the bottom', () => {
		const w = new World(13, 20);
		const top = w.top(5);
		const y = w.player.y;
		w.setHeight(25);
		expect(w.top(5)).toBe(top + 5);
		expect(w.player.y).toBe(y + 80);
	});
});
