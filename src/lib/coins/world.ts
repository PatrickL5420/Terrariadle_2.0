/**
 * Dropped coins, ported from Terraria 1.4.5: how an enemy's money is split into coin stacks
 * (NPC.NPCLoot_DropMoney), how a dropped item moves (WorldItem.UpdateItem / MoveInWorld),
 * merges with nearby stacks (TryCombiningIntoNearbyItems) and is pulled in and picked up by a
 * player (Player.GrabItems, PullItem_Common, PullItem_Pickup), the sparkle dust coins give off
 * (Main.DrawItem, Dust 244-247) and the pickup text (PopupText).
 *
 * Here the mouse cursor is the player. Everything is in game pixels and game frames (60 a
 * second); the page draws it at 2x.
 */
import type { Coin } from '$lib/money';

/** Item types 71-74. */
export const COIN_ORDER: Coin[] = ['copper', 'silver', 'gold', 'platinum'];
const VALUE: Record<Coin, number> = { copper: 1, silver: 100, gold: 10_000, platinum: 1_000_000 };
/** Item hitboxes (Item.SetDefaults). */
export const HITBOX: Record<Coin, [number, number]> = {
	copper: [10, 10],
	silver: [10, 12],
	gold: [10, 14],
	platinum: [12, 14]
};
const MAX_STACK: Record<Coin, number> = { copper: 100, silver: 100, gold: 100, platinum: 999 };

/** The player's hitbox (Player.width / height) and item grab range (defaultItemGrabRange). */
export const PLAYER_SIZE: [number, number] = [20, 42];
const GRAB_RANGE = 42;
const GRAB_SPEED = 0.45; // Player.itemGrabSpeed
const GRAB_SPEED_MAX = 4; // Player.itemGrabSpeedMax

/** UnifiedRandom.Next(max) / Next(min, max). */
export type Rand = (min: number, max?: number) => number;
export const random: Rand = (min, max) =>
	max === undefined
		? Math.floor(Math.random() * min)
		: min + Math.floor(Math.random() * (max - min));

/** NPC.NPCLoot_DropMoney for an exact value: the coin stacks an enemy worth it drops. */
export function moneyStacks(value: number, rand: Rand = random): { coin: Coin; count: number }[] {
	const out: { coin: Coin; count: number }[] = [];
	/** Big stacks are sometimes split up: 1 in 5 for over 50, then 1 in 5 again. */
	const thin = (n: number, last = 3) => {
		if (n > 50 && rand(5) === 0) n = Math.trunc(n / (rand(3) + 1));
		if (rand(5) === 0) n = Math.trunc(n / (rand(last) + 1));
		return n;
	};
	let num = value;
	while (Math.trunc(num) > 0) {
		if (num > 1_000_000) {
			let n = thin(Math.trunc(num / 1_000_000));
			num -= 1_000_000 * n;
			while (n > 999) {
				n -= 999;
				out.push({ coin: 'platinum', count: 999 });
			}
			out.push({ coin: 'platinum', count: n });
		} else if (num > 10_000) {
			const n = thin(Math.trunc(num / 10_000));
			num -= 10_000 * n;
			out.push({ coin: 'gold', count: n });
		} else if (num > 100) {
			const n = thin(Math.trunc(num / 100));
			num -= 100 * n;
			out.push({ coin: 'silver', count: n });
		} else {
			const n = Math.max(1, thin(Math.trunc(num), 4));
			num -= n;
			out.push({ coin: 'copper', count: n });
		}
	}
	// A thinned-out stack of 0 drops nothing.
	return out.filter((s) => s.count > 0);
}

export interface WorldCoin {
	coin: Coin;
	stack: number;
	/** Top-left of the hitbox. */
	x: number;
	y: number;
	vx: number;
	vy: number;
	w: number;
	h: number;
	/** Being pulled in this frame (beingGrabbed). */
	grabbed: boolean;
	/** Picked up by the cursor, and on its way to the coin counter. */
	picked: boolean;
	/** Main.itemFrameCounter: 6 frames per sprite frame, 8 sprite frames. */
	frameCounter: number;
	/** Frames until it flies to the coin counter by itself (not in the game: see CoinDrop). */
	autoCollect: number;
}

export interface Sparkle {
	coin: Coin;
	x: number;
	y: number;
	scale: number;
	rotation: number;
	alpha: number;
	/** Which of the dust's 3 frames. */
	frame: number;
}

export interface Popup {
	text: string;
	value: number;
	/** Top-left of the text box. */
	x: number;
	y: number;
	vx: number;
	vy: number;
	scale: number;
	alpha: number;
	alphaDir: number;
	lifeTime: number;
	color: [number, number, number];
}

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

const intersects = (a: Box, b: Box) =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const hitbox = (c: WorldCoin): Box => ({
	x: Math.trunc(c.x),
	y: Math.trunc(c.y),
	w: c.w,
	h: c.h
});

/** PopupText.ValueToName: "1 platinum 2 gold 5 copper". */
export function valueToName(value: number): string {
	const parts: string[] = [];
	let left = value;
	for (const coin of [...COIN_ORDER].reverse()) {
		const n = Math.floor(left / VALUE[coin]);
		left -= n * VALUE[coin];
		if (n > 0) parts.push(`${n} ${coin}`);
	}
	return parts.join(' ');
}

/** The pickup text's colour and how long it stays, by the highest coin in it. */
function popupStyle(value: number): { color: [number, number, number]; life: number } {
	if (value >= 1_000_000) return { color: [220, 220, 198], life: 300 };
	if (value >= 10_000) return { color: [224, 201, 92], life: 240 };
	if (value >= 100) return { color: [181, 192, 193], life: 180 };
	return { color: [246, 138, 96], life: 120 };
}

export interface Player {
	/** Centre of the cursor, and how far it moved this frame. */
	x: number;
	y: number;
	vx: number;
	vy: number;
}

export class CoinWorld {
	coins: WorldCoin[] = [];
	sparkles: Sparkle[] = [];
	popups: Popup[] = [];

	constructor(
		/** The screen in game pixels; the bottom is the ground. */
		public width: number,
		public height: number,
		/** Measures pickup text, in game pixels. */
		private measure: (text: string) => [number, number],
		private rand: Rand = random
	) {}

	/** Item.NewItem for each stack, at the centre of `from`. */
	drop(stacks: { coin: Coin; count: number }[], cx: number, cy: number, autoCollect: () => number) {
		const r = this.rand;
		for (const s of stacks) {
			const [w, h] = HITBOX[s.coin];
			this.coins.push({
				coin: s.coin,
				stack: s.count,
				x: cx - w / 2,
				y: cy - h / 2,
				vx: r(-30, 31) * 0.1,
				vy: r(-40, -15) * 0.1,
				w,
				h,
				grabbed: false,
				picked: false,
				frameCounter: r(48),
				autoCollect: autoCollect()
			});
		}
	}

	/**
	 * One frame. The cursor (if on the page) pulls in coins near it and picks up the ones it
	 * touches; picked-up coins, and coins whose time is up, then fly to their slot in the coin
	 * counter (`counter`). `on.pickup` is told when a stack is picked up (by the cursor, or on
	 * reaching the counter by itself), `on.arrive` when it reaches the counter.
	 */
	update(
		player: Player | null,
		counter: (coin: Coin) => Box | undefined,
		on: { pickup: (coin: Coin, stack: number) => void; arrive: (coin: Coin, stack: number) => void }
	) {
		const r = this.rand;
		// Player.GrabItems: pick up what it touches, pull in what's in range.
		const body: Box | null = player && {
			x: player.x - PLAYER_SIZE[0] / 2,
			y: player.y - PLAYER_SIZE[1] / 2,
			w: PLAYER_SIZE[0],
			h: PLAYER_SIZE[1]
		};
		/** Not in the game: flying to the counter, pulled like a Gold Ring pulls coins. */
		const toCounter = (c: WorldCoin): 'flying' | 'arrived' => {
			const slot = counter(c.coin);
			if (!slot || intersects(slot, hitbox(c))) {
				on.arrive(c.coin, c.stack);
				c.stack = 0; // removed below
				return 'arrived';
			}
			c.grabbed = true;
			pullPickup(c, slot, 12, 5); // PullItem_Pickup, speed 12
			return 'flying';
		};
		for (const c of this.coins) {
			if (c.picked) {
				toCounter(c);
				continue;
			}
			if (body && intersects(body, hitbox(c))) {
				// Picked up (Player.PickupItem): the sound and pickup text, then off to the counter.
				c.picked = true;
				c.grabbed = true;
				on.pickup(c.coin, c.stack);
				this.#popup(c, c.stack, player!.x, player!.y);
				continue;
			}
			const reach = body && {
				x: Math.trunc(body.x) - GRAB_RANGE,
				y: Math.trunc(body.y) - GRAB_RANGE,
				w: body.w + GRAB_RANGE * 2,
				h: body.h + GRAB_RANGE * 2
			};
			if (reach && intersects(reach, hitbox(c))) {
				c.grabbed = true;
				pullCommon(c, body!, player!, 0.75);
				continue;
			}
			// Not in the game: a coin left lying flies to the counter by itself after a while.
			if (c.autoCollect > 0) c.autoCollect--;
			if (c.autoCollect <= 0) {
				const { coin, stack } = c;
				const slot = counter(coin);
				if (toCounter(c) === 'arrived') {
					on.pickup(coin, stack);
					if (slot) this.#popup(c, stack, slot.x + slot.w / 2, slot.y + slot.h / 2);
				}
			}
		}
		this.coins = this.coins.filter((c) => c.stack > 0);

		// WorldItem.UpdateItem.
		for (let i = 0; i < this.coins.length; i++) {
			const c = this.coins[i];
			if (c.grabbed) {
				c.grabbed = false;
				c.x += c.vx;
				c.y += c.vy;
				continue;
			}
			this.#combine(i);
			c.vy = Math.min(7, c.vy + 0.1);
			c.vx *= 0.95;
			if (c.vx < 0.1 && c.vx > -0.1) c.vx = 0;
			// Collision.TileCollision with the ground and the sides of the screen: it stops dead.
			if (c.y + c.h + c.vy > this.height) c.vy = Math.max(0, this.height - c.h - c.y);
			if (c.x + c.vx < 0) c.vx = -c.x;
			if (c.x + c.w + c.vx > this.width) c.vx = this.width - c.w - c.x;
			c.x += c.vx;
			c.y += c.vy;
		}
		this.coins = this.coins.filter((c) => c.stack > 0);

		// Main.DrawItem: the coin spins, and sometimes gives off a sparkle (more while moving).
		for (const c of this.coins) {
			if (++c.frameCounter >= 6 * 8) c.frameCounter = 0;
			if (r(500) - (Math.abs(c.vx) + Math.abs(c.vy)) * 10 < 255 / 50) {
				const w = Math.max(5, c.w);
				const h = Math.max(5, c.h);
				this.sparkles.push({
					coin: c.coin,
					x: c.x + r(w - 4) + 4,
					y: c.y + r(h - 4) + 4,
					scale: 1 + r(-20, 21) * 0.01,
					rotation: 0,
					alpha: 0,
					frame: r(3)
				});
			}
		}

		// Dust.UpdateDust for dust 244-247: it doesn't move; it grows in, spins and shrinks away.
		for (const d of this.sparkles) {
			d.rotation += 0.1 * d.scale;
			if (d.alpha < 255) {
				d.scale += 0.09;
				if (d.scale >= 1) {
					d.scale = 1;
					d.alpha = 255;
				}
			} else {
				if (d.scale < 0.8) d.scale -= 0.01;
				if (d.scale < 0.5) d.scale -= 0.01;
			}
			d.scale -= 0.01;
		}
		this.sparkles = this.sparkles.filter((d) => d.scale >= 0.1 && d.y <= this.height);

		this.#updatePopups();
	}

	/** WorldItem.TryCombiningIntoNearbyItems: later stacks of the same coin nearby join it. */
	#combine(i: number) {
		const c = this.coins[i];
		if (c.stack >= MAX_STACK[c.coin]) return;
		for (let j = i + 1; j < this.coins.length; j++) {
			const o = this.coins[j];
			if (o.coin !== c.coin || o.stack <= 0) continue;
			if (Math.abs(c.x - o.x) + Math.abs(c.y - o.y) > 30) continue;
			const n = Math.min(o.stack, MAX_STACK[c.coin] - c.stack);
			o.stack -= n;
			c.stack += n;
			const t = n / c.stack;
			c.x = o.x + (c.x - o.x) * t;
			c.y = o.y + (c.y - o.y) * t;
			c.vx = o.vx + (c.vx - o.vx) * t;
			c.vy = o.vy + (c.vy - o.vy) * t;
		}
	}

	/** PopupText.NewText for a coin pickup: joins the coin text already showing, if any. */
	#popup(c: WorldCoin, stack: number, px: number, py: number) {
		const value = stack * VALUE[c.coin];
		const existing = this.popups.find((p) => p.lifeTime > 0 || p.scale > 0);
		if (existing) {
			existing.value = Math.min(9_999_999_999, existing.value + value);
			existing.text = valueToName(existing.value);
			const style = popupStyle(existing.value);
			existing.lifeTime = Math.max(existing.lifeTime, 60, style.life);
			existing.color = style.color;
			const [tw, th] = this.measure(existing.text);
			existing.scale = 0;
			existing.x = px + c.w * 0.5 - tw * 0.5;
			existing.y = py + c.h * 0.25 - th * 0.5;
			existing.vy = -7;
			return;
		}
		const text = valueToName(value);
		const [tw, th] = this.measure(text);
		const style = popupStyle(value);
		this.popups.push({
			text,
			value,
			x: px - tw * 0.5,
			y: py - th * 0.5,
			vx: 0,
			vy: -7,
			scale: 0,
			alpha: 1,
			alphaDir: -1,
			lifeTime: Math.max(60, style.life),
			color: style.color
		});
	}

	/** PopupText.Update: rises and slows, pulses, then shrinks away; overlapping ones push apart. */
	#updatePopups() {
		const boxes = this.popups.map((p) => {
			const [w, h] = this.measure(p.text);
			const bw = w * p.scale;
			const bh = h * p.scale * 0.8;
			return {
				x: Math.trunc(p.x - bw / 2),
				y: Math.trunc(p.y - bh / 2),
				w: Math.trunc(bw),
				h: Math.trunc(bh)
			};
		});
		this.popups.forEach((p, i) => {
			p.alpha += p.alphaDir * 0.01;
			if (p.alpha <= 0.7) {
				p.alpha = 0.7;
				p.alphaDir = 1;
			}
			if (p.alpha >= 1) {
				p.alpha = 1;
				p.alphaDir = -1;
			}
			let pushed = false;
			this.popups.forEach((o, j) => {
				if (j === i || !intersects(boxes[i], boxes[j])) return;
				if (p.y < o.y || (p.y === o.y && i < j)) {
					pushed = true;
					const n = Math.min(3, this.popups.length);
					o.lifeTime = p.lifeTime = 60 + 15 * n;
				}
			});
			if (!pushed) {
				p.vy *= 0.86;
				if (p.scale === 1) p.vy *= 0.4;
			} else if (p.vy > -6) p.vy -= 0.2;
			else p.vy *= 0.86;
			p.vx *= 0.93;
			p.x += p.vx;
			p.y += p.vy;
			p.lifeTime--;
			if (p.lifeTime <= 0) {
				p.scale -= 0.03;
				p.lifeTime = 0;
			} else p.scale = Math.min(1, p.scale + 0.1);
		});
		this.popups = this.popups.filter((p) => p.lifeTime > 0 || p.scale >= 0.1);
	}
}

/** Player.PullItem_Common: speeds up toward the player, braking hard when heading away. */
function pullCommon(c: WorldCoin, body: Box, player: Player, brake: number) {
	const cx = c.x + c.w * 0.5;
	const cy = c.y + c.h * 0.5;
	if (body.x + body.w * 0.5 > cx) {
		if (c.vx < GRAB_SPEED_MAX + player.vx) c.vx += GRAB_SPEED;
		if (c.vx < 0) c.vx += GRAB_SPEED * brake;
	} else {
		if (c.vx > -GRAB_SPEED_MAX + player.vx) c.vx -= GRAB_SPEED;
		if (c.vx > 0) c.vx -= GRAB_SPEED * brake;
	}
	if (body.y + body.h * 0.5 > cy) {
		if (c.vy < GRAB_SPEED_MAX) c.vy += GRAB_SPEED;
		if (c.vy < 0) c.vy += GRAB_SPEED * brake;
	} else {
		if (c.vy > -GRAB_SPEED_MAX) c.vy -= GRAB_SPEED;
		if (c.vy > 0) c.vy -= GRAB_SPEED * brake;
	}
}

/** Player.PullItem_Pickup: homes in at `speed`, turning over `acc` frames. */
function pullPickup(c: WorldCoin, target: Box, speed: number, acc: number) {
	let dx = target.x + target.w / 2 - (c.x + Math.trunc(c.w / 2));
	let dy = target.y + target.h / 2 - (c.y + Math.trunc(c.h / 2));
	const k = speed / Math.sqrt(dx * dx + dy * dy);
	dx *= k;
	dy *= k;
	c.vx = (c.vx * (acc - 1) + dx) / acc;
	c.vy = (c.vy * (acc - 1) + dy) / acc;
}
