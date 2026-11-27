import { describe, expect, it } from 'vitest';
import { stepUp, tileCollision } from './collision';
import { AIR, DIRT, GRASS, isSolid, STONE, TREE } from './framing';
import { itemCheck, pickTile, type ItemWorld } from './item-check';
import { play, WorldGen } from './gen';
import { LightMap, tileColor } from './light';
import { Player } from './player';
import { World, type Sound } from './sim';
import { Mirror, Recorder } from './view';
import { MARGIN, TileChanges, Tiles } from './tiles';

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
		const hands: ItemWorld = { tiles: w.tiles, rand: w.rand, variant: () => 0, sound: () => {} };
		play(w.tiles, w.rand, {
			sound: (s) => sounds.push(s.type === 21 ? 'tink' : 'dig'),
			drop: (d) => drops.push(d.type),
			tileDust: () => dust++
		});
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

describe('chopping (a Copper Axe on a tree)', () => {
	it('fells a whole tree in 13 hits, dropping wood', () => {
		const w = new World(() => 0);
		const i = X + 5;
		const j = w.top(i);
		// Clear the column's neighbours of anything above the ground, then grow a tree.
		for (let x = i - 3; x <= i + 3; x++)
			for (let y = 0; y < j; y++) if (w.tiles.at(x, y) !== AIR) w.tiles.kill(x, y);
		for (let x = i - 2; x <= i + 2; x++) {
			while (w.top(x) < j) w.tiles.kill(x, w.top(x));
			while (w.top(x) > j) w.tiles.place(x, w.top(x) - 1, GRASS, 0);
			w.tiles.convert(x, j, GRASS, 0);
		}
		expect(WorldGen.GrowTree(i, j, 0, false)).toBe(true);
		const drops: number[] = [];
		play(w.tiles, w.rand, { sound: () => {}, drop: (d) => drops.push(d.type) });
		const p = w.player;
		p.x = (i - 2) * 16;
		p.y = j * 16 - p.h;
		p.item = { type: 3506, stack: 1 };
		p.tileTargetX = i;
		p.tileTargetY = j - 1;
		p.controls = { left: false, right: false, jump: false, use: true };
		// A hit sets itemTime to the axe's useTime (21).
		let hits = 0;
		for (let f = 0; f < 400 && w.tiles.at(i, j - 1) === TREE; f++) {
			itemCheck(p, w);
			if (p.itemTime === 21) hits++;
		}
		expect(w.tiles.at(i, j - 1)).toBe(AIR);
		expect(hits).toBe(13);
		expect(drops.length).toBeGreaterThan(3);
		expect(drops.every((d) => d === 9 || d === 27)).toBe(true);
	});
});

describe('tile changes', () => {
	it('lists the tiles changed since last asked', () => {
		const t = flat();
		const c = new TileChanges(['type', 'active', 'wall']);
		expect(c.take(t)).toBe('all');
		expect(c.take(t)).toEqual([]);
		// A block dug out of the ground (row 8 down), and a wall put up in the air.
		const dug = 9 * t.width + 3;
		t.active[dug] = 0;
		t.wall[5] = 4;
		expect(c.take(t)).toEqual([dug, 5]);
		expect(c.take(t)).toEqual([]);
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

	it('is worked out again only when the blocks, walls, sky or held torches change', () => {
		const t = flat(6, 20, 4);
		const l = new LightMap(t.width, t.height);
		l.update(t, [255, 255, 255]);
		const v = l.version;
		l.update(t, [255, 255, 255]);
		expect(l.version).toBe(v);
		// Digging out a block lets light in further.
		const k = 4 * t.width + X + 2;
		const before = l.color(X + 2, 5)[0];
		t.active[k] = 0;
		l.update(t, [255, 255, 255]);
		expect(l.version).toBe(v + 1);
		expect(l.color(X + 2, 5)[0]).toBeGreaterThan(before);
		l.update(t, [100, 100, 100]);
		l.update(t, [100, 100, 100], [[X + 2, 10]]);
		expect(l.version).toBe(v + 3);
	});

	it('washes the sky colour toward grey for tiles (ApplyColorOfTheSkiesToTiles)', () => {
		expect(tileColor([255, 255, 255])).toEqual([255, 255, 255]);
		expect(tileColor([100, 0, 0])).toEqual([80, 10, 10]);
	});
});

describe('the little world', () => {
	it('starts the player on the ground, even where the middle column is a cave shaft', () => {
		// Worlds whose middle column is open to the bottom (from a seeded random).
		for (const seed of [19, 45, 54]) {
			let s = seed;
			const rnd = ((a: number, b?: number) => {
				s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
				const v = s / 2 ** 32;
				return b === undefined ? Math.floor(v * a) : a + Math.floor(v * (b - a));
			}) as ConstructorParameters<typeof World>[0];
			const w = new World(rnd);
			w.update([255, 255, 255], quiet);
			expect(w.player.y + w.player.h).toBeLessThanOrEqual(w.rows * 16);
		}
	});

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

	it('gets where it sets out for: most trips arrive, and it never stands about stuck', () => {
		let s = 7;
		const rnd = ((a: number, b?: number) => {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			const v = s / 2 ** 32;
			return b === undefined ? Math.floor(v * a) : a + Math.floor(v * (b - a));
		}) as ConstructorParameters<typeof World>[0];
		const w = new World(rnd);
		let still = 0;
		let worst = 0;
		let last = { x: 0, y: 0 };
		for (let f = 0; f < 60 * 120; f++) {
			w.update([255, 255, 255], quiet);
			const p = w.player;
			const moved = Math.abs(p.x - last.x) + Math.abs(p.y - last.y) > 0.5;
			still = moved || p.itemAnimation > 0 || w.task.kind === 'idle' ? 0 : still + 1;
			worst = Math.max(worst, still);
			last = { x: p.x, y: p.y };
		}
		const o = w.outcomes;
		const arrived = o['go: done'] ?? 0;
		const trips = Object.entries(o)
			.filter(([k]) => k.startsWith('go:'))
			.reduce((n, [, v]) => n + v, 0);
		expect(trips).toBeGreaterThan(5);
		expect(arrived / trips).toBeGreaterThan(0.85);
		expect(worst).toBeLessThan(60 * 5);
	}, 60_000);

	it('builds a house: wooden floor, walls and roof, a torch inside', () => {
		let s = 2;
		const rnd = ((a: number, b?: number) => {
			s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
			const v = s / 2 ** 32;
			return b === undefined ? Math.floor(v * a) : a + Math.floor(v * (b - a));
		}) as ConstructorParameters<typeof World>[0];
		const w = new World(rnd);
		for (let f = 0; f < 60 * 60 * 5 && !w.structures.length; f++) w.update([255, 255, 255], quiet);
		const house = w.structures.find((b) => b.kind === 'house');
		expect(house).toBeDefined();
		const wood = house!.pieces.filter((p) => p.need === 'wood');
		expect(wood.every((p) => w.tiles.at(p.i, p.j) === 30)).toBe(true);
		expect(house!.pieces.some((p) => p.need === 'torch' && w.tiles.at(p.i, p.j) === 4)).toBe(true);
	}, 60_000);

	it('is made by the game’s world generation: grass over dirt and stone, clay, walls, trees', () => {
		const w = new World();
		const types = new Set<number>();
		for (let k = 0; k < w.width * w.height; k++) if (w.tiles.active[k]) types.add(w.tiles.type[k]);
		// (Clay, and the sakura and yellow willow trees, only in some worlds.)
		for (const t of [0, 1, 2, 5]) expect(types).toContain(t);
		for (const t of types) expect([0, 1, 2, 5, 40, 596, 616]).toContain(t);
		expect(w.tiles.wall.some((x) => x === 2)).toBe(true);
		expect(w.cols).toBe(150);
	});
});

describe('the world seen from the page (view)', () => {
	it('keeps a Mirror the same as the World its Frames come from', () => {
		const w = new World();
		const rec = new Recorder();
		const sounds: Sound[] = [];
		const m = new Mirror(rec.frame(w, []));
		for (let n = 0; n < 40; n++) {
			for (let s = 0; s < 60; s++) w.update([255, 255, 255], (s) => sounds.push(s));
			m.apply(rec.frame(w, sounds.splice(0)));
		}
		for (const f of ['type', 'active', 'frameX', 'frameY', 'wall', 'wallVariant'] as const)
			expect(m.tiles[f]).toEqual(w.tiles[f]);
		expect(m.light.r).toEqual(w.light.r);
		expect(m.player.center).toEqual(w.player.center);
		expect(m.drops.length).toBe(w.drops.length);
	});
});

describe('dropped items (WorldItem.UpdateItem)', () => {
	const drop = (w: World, item: number, stack: number, x: number) => {
		w.drop({ type: item, stack, x, y: 16, w: 16, h: 16 });
		const d = w.drops.at(-1)!;
		d.vx = d.vy = 0;
		return d;
	};

	it('stacks drops of the same item lying near each other (TryCombiningIntoNearbyItems)', () => {
		const w = new World();
		// Out of the player's reach: well away from it.
		const x = w.player.x > 1000 ? 200 : 2000;
		drop(w, 9, 2, x);
		drop(w, 9, 1, x + 20);
		drop(w, 27, 1, x + 10);
		drop(w, 9, 1, x + 200);
		w.update([255, 255, 255], quiet);
		expect(w.drops.map((d) => [d.item, d.stack])).toEqual([
			[9, 3],
			[27, 1],
			[9, 1]
		]);
		// Moved two thirds of the way to the one it took in: weighted by how much each had.
		expect(w.drops[0].x).toBeCloseTo(x + 2 + (20 * 2) / 3, 5);
	});

	it('stops at the max stack (100 for copper coins)', () => {
		const w = new World();
		const x = w.player.x > 1000 ? 200 : 2000;
		drop(w, 71, 80, x);
		drop(w, 71, 50, x + 4);
		w.update([255, 255, 255], quiet);
		expect(w.drops.map((d) => d.stack)).toEqual([100, 30]);
	});
});

describe('sounds', () => {
	it('plays each sound once a frame, however many times the game asks (a tree falling)', () => {
		const w = new World();
		w.player.update = () => {
			for (let n = 0; n < 5; n++) w.sound({ type: 0, x: 0, y: 0, style: 1 });
			w.sound({ type: 21, x: 0, y: 0, style: 1 });
		};
		const heard: Sound[] = [];
		w.update([255, 255, 255], (s) => heard.push(s));
		w.update([255, 255, 255], (s) => heard.push(s));
		expect(heard).toEqual(['dig', 'tink', 'dig', 'tink']);
	});
});
