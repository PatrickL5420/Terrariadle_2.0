import { describe, expect, it } from 'vitest';
import { COIN_VALUE } from '$lib/money';
import { CoinSlotAnim } from './slot';
import { CoinWorld, moneyStacks, valueToName, type Box } from './world';

const measure = (t: string): [number, number] => [t.length * 5, 10];
const noSlot = () => undefined;
const quiet = { pickup: () => {}, arrive: () => {} };

function world(height = 300) {
	return new CoinWorld(400, height, measure);
}

describe('money drop (NPC.NPCLoot_DropMoney)', () => {
	it('always adds up to the value, in coins no bigger than a stack', () => {
		for (const value of [1, 50, 100, 101, 10_000, 99_999, 1_000_000, 1_000_001, 123_456_789]) {
			for (let i = 0; i < 20; i++) {
				const stacks = moneyStacks(value);
				expect(stacks.reduce((sum, s) => sum + s.count * COIN_VALUE[s.coin], 0)).toBe(value);
				for (const s of stacks)
					expect(s.count).toBeLessThanOrEqual(s.coin === 'platinum' ? 999 : 100);
			}
		}
	});

	it('pays exactly 100 copper as copper, not a silver (it checks "more than")', () => {
		const never = () => 1; // no random thinning
		expect(moneyStacks(100, never)).toEqual([{ coin: 'copper', count: 100 }]);
		expect(moneyStacks(10_250, never)).toEqual([
			{ coin: 'gold', count: 1 },
			{ coin: 'silver', count: 2 },
			{ coin: 'copper', count: 50 }
		]);
	});
});

describe('a dropped coin (WorldItem.UpdateItem)', () => {
	it('flies up, falls at 0.1 px/frame² (7 px/frame at most) and stops dead on the ground', () => {
		const w = world();
		w.drop([{ coin: 'gold', count: 1 }], 200, 100, () => 1e9);
		const c = w.coins[0];
		c.vx = 3;
		c.vy = -3;
		w.update(null, noSlot, quiet);
		expect(c.vy).toBeCloseTo(-2.9);
		expect(c.vx).toBeCloseTo(2.85); // x 0.95 a frame
		for (let i = 0; i < 300; i++) w.update(null, noSlot, quiet);
		expect(c.y + c.h).toBeCloseTo(300);
		expect(c.vy).toBe(0);
		expect(c.vx).toBe(0);
	});

	it('drops every stack as single coins (unlike the game)', () => {
		const w = world();
		w.drop(
			[
				{ coin: 'gold', count: 7 },
				{ coin: 'copper', count: 3 }
			],
			200,
			100,
			() => 1e9
		);
		expect(w.coins.map((c) => `${c.stack} ${c.coin}`)).toEqual([
			...Array(7).fill('1 gold'),
			...Array(3).fill('1 copper')
		]);
	});

	it('keeps a huge drop to 400 coins, the rest stacked', () => {
		const w = world();
		w.drop(
			[
				{ coin: 'silver', count: 99 },
				{ coin: 'copper', count: 999 }
			],
			200,
			100,
			() => 1e9
		);
		expect(w.coins).toHaveLength(400);
		expect(w.coins.reduce((sum, c) => sum + c.stack, 0)).toBe(99 + 999);
	});

	it('never merges with other stacks (unlike the game)', () => {
		const w = world();
		w.drop([{ coin: 'silver', count: 1 }], 200, 290, () => 1e9);
		w.drop([{ coin: 'silver', count: 1 }], 210, 290, () => 1e9);
		for (const c of w.coins) c.vx = c.vy = 0;
		w.update(null, noSlot, quiet);
		expect(w.coins.map((c) => c.stack)).toEqual([1, 1]);
	});
});

describe('the cursor as the player (Player.GrabItems)', () => {
	it('pulls in coins within grab range and picks them up on touch', () => {
		const w = world();
		w.drop([{ coin: 'copper', count: 1 }], 120, 295, () => 1e9);
		w.coins[0].vx = w.coins[0].vy = 0;
		const got: number[] = [];
		const player = { x: 160, y: 280, vx: 0, vy: 0 };
		const slot: Box = { x: 380, y: 0, w: 18, h: 18 };
		const arrived: number[] = [];
		let frames = 0;
		while (!got.length && frames++ < 200)
			w.update(player, () => slot, { pickup: (_, n) => got.push(n), arrive: () => {} });
		expect(got).toEqual([1]);
		expect(frames).toBeLessThan(60);
		expect(w.popups[0].text).toBe('1 copper');
		// Then it flies to the counter, the cursor or not.
		for (let i = 0; i < 200 && w.coins.length; i++)
			w.update(player, () => slot, { pickup: () => {}, arrive: (_, n) => arrived.push(n) });
		expect(arrived).toEqual([1]);
	});

	it('leaves coins out of reach alone', () => {
		const w = world();
		w.drop([{ coin: 'copper', count: 1 }], 20, 295, () => 1e9);
		for (let i = 0; i < 200; i++) w.update({ x: 380, y: 280, vx: 0, vy: 0 }, noSlot, quiet);
		expect(w.coins).toHaveLength(1);
	});

	it('flies coins left lying to the coin counter', () => {
		const w = world();
		w.drop([{ coin: 'gold', count: 1 }], 200, 295, () => 30);
		const slot: Box = { x: 380, y: 0, w: 18, h: 18 };
		const got: string[] = [];
		for (let i = 0; i < 200 && w.coins.length; i++)
			w.update(null, () => slot, {
				pickup: (coin, n) => got.push(`picked up ${n} ${coin}`),
				arrive: (coin, n) => got.push(`${n} ${coin} in`)
			});
		expect(got).toEqual(['1 gold in', 'picked up 1 gold']);
	});
});

describe('pickup text (PopupText)', () => {
	it('adds up coin pickups into one text, named by coin', () => {
		expect(valueToName(1_020_305)).toBe('1 platinum 2 gold 3 silver 5 copper');
		const w = world();
		w.drop([{ coin: 'silver', count: 2 }], 160, 280, () => 1e9);
		w.drop([{ coin: 'copper', count: 7 }], 160, 280, () => 1e9);
		w.update({ x: 160, y: 280, vx: 0, vy: 0 }, noSlot, quiet);
		expect(w.popups).toHaveLength(1);
		expect(w.popups[0].text).toBe('2 silver 7 copper');
		expect(w.popups[0].color).toEqual([181, 192, 193]); // silver's colour
	});
});

describe('coin slot animation (CoinSlot)', () => {
	it('swells the count, then hops and spins the coin, and settles', () => {
		const a = new CoinSlotAnim(3);
		a.set(4);
		const states = [];
		for (let i = 0; i < 80; i++) {
			a.set(4);
			a.step();
			states.push(a.state);
		}
		expect(Math.max(...states.map((s) => s.textScale))).toBe(1.25);
		expect(Math.max(...states.map((s) => s.jump))).toBe(1);
		expect(new Set(states.map((s) => s.frame)).size).toBeGreaterThan(3);
		expect(a.busy).toBe(false);
		expect(a.state).toEqual({ frame: 0, jump: 0, textScale: 1 });
	});
});
