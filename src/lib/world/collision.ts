/**
 * Terraria 1.4.5's Collision.TileCollision, StepUp and StepDown, ported line by line for full
 * blocks (no slopes, half blocks, platforms or water) and normal gravity. The game does this in
 * single-precision floats, so every float operation here is rounded to one (`f`); that's what
 * makes the results match the game's exactly (tools/verify compares them with the game's own
 * code on random worlds and bodies).
 */

/** Math.fround: a float operation's result, as the game's single-precision float. */
export const f = Math.fround;

/** What collision reads of Main.tile: whether a tile blocks, and the world's size in tiles. */
export interface TileMap {
	/** Main.maxTilesX / maxTilesY. */
	readonly maxTilesX: number;
	readonly maxTilesY: number;
	/** The tile is there, not actuated, and Main.tileSolid. */
	solid(i: number, j: number): boolean;
}

export interface Body {
	x: number;
	y: number;
	w: number;
	h: number;
	vx: number;
	vy: number;
}

export interface Hit {
	vx: number;
	vy: number;
	/** Collision.up (hit a ceiling) / Collision.down (stood on something). */
	up: boolean;
	down: boolean;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const trunc = Math.trunc;

/** WorldGen.InWorld(x, y, fluff). */
const inWorld = (m: TileMap, x: number, y: number, fluff = 0) =>
	x >= fluff && x < m.maxTilesX - fluff && y >= fluff && y < m.maxTilesY - fluff;

/** Collision.TileCollision: the velocity the blocks around `b` let it move by this frame. */
export function tileCollision(m: TileMap, b: Body): Hit {
	const { x, y, w, h, vx, vy } = b;
	const out: Hit = { vx, vy, up: false, down: false };
	const nx = f(x + vx);
	const ny = f(y + vy);
	const i0 = clamp(trunc(f(x / 16)) - 1, 0, m.maxTilesX - 1);
	const i1 = clamp(trunc(f(f(x + w) / 16)) + 2, 0, m.maxTilesX - 1);
	const j0 = clamp(trunc(f(y / 16)) - 1, 0, m.maxTilesY - 40);
	const j1 = clamp(trunc(f(f(y + h) / 16)) + 2, 0, m.maxTilesY - 40);
	let num = -1;
	let num2 = -1;
	let num3 = -1;
	let num4 = -1;
	let num6 = (j1 + 3) * 16;
	for (let i = i0; i < i1; i++) {
		for (let j = j0; j < j1; j++) {
			if (!m.solid(i, j)) continue;
			const tx = i * 16;
			const ty = j * 16;
			if (!(f(nx + w) > tx) || !(nx < tx + 16) || !(f(ny + h) > ty) || !(ny < ty + 16)) continue;
			if (f(y + h) <= ty) {
				out.down = true;
				if (num6 > ty) {
					num3 = i;
					num4 = j;
					if (num3 !== num) {
						out.vy = f(ty - f(y + h));
						num6 = ty;
					}
				}
			} else if (f(x + w) <= tx) {
				num = i;
				num2 = j;
				if (num2 !== num4) out.vx = f(tx - f(x + w));
				if (num3 === num) out.vy = vy;
			} else if (x >= tx + 16) {
				num = i;
				num2 = j;
				if (num2 !== num4) out.vx = f(tx + 16 - x);
				if (num3 === num) out.vy = vy;
			} else if (y >= ty + 16) {
				out.up = true;
				num3 = i;
				num4 = j;
				out.vy = f(f(ty + 16 - y) + f(0.01));
				if (num4 === num2) out.vx = vx;
			}
		}
	}
	return out;
}

/** What StepUp / StepDown change: the body's position and velocity, and the sprite's glide. */
export interface Step {
	stepSpeed: number;
	gfxOffY: number;
}

/** Collision.StepUp: walking into a one-block ledge lifts the body onto it. */
export function stepUp(m: TileMap, b: Body, s: Step) {
	const dir = b.vx < 0 ? -1 : b.vx > 0 ? 1 : 0;
	const vx = f(b.x + b.vx);
	const vy = b.y;
	const half = trunc(b.w / 2);
	const num2 = trunc(f(f(f(vx + half) + (half + 1) * dir) / 16));
	const num3 = trunc(f(f(f(vy + b.h) - 1) / 16));
	const num4 = trunc(b.h / 16) + (b.h % 16 !== 0 ? 1 : 0);
	if (!inWorld(m, num2, num3, 1) || num3 >= m.maxTilesY - 40) return;
	for (let k = 1; k < num4 + 2; k++) if (!inWorld(m, num2, num3 - k)) return;
	if (!inWorld(m, num2 - dir, num3 - num4)) return;
	let clear = true;
	for (let k = 2; k < num4 + 1; k++) {
		if (!inWorld(m, num2, num3 - k)) return;
		clear &&= !m.solid(num2, num3 - k);
	}
	const clearBehind = !m.solid(num2 - dir, num3 - num4);
	const clearAbove = !m.solid(num2, num3 - 1);
	const ledge = m.solid(num2, num3);
	if (!(num2 * 16 < f(vx + b.w) && num2 * 16 + 16 > vx)) return;
	if (!(ledge && clearAbove && clear && clearBehind)) return;
	const num5 = num3 * 16;
	if (!(num5 < f(vy + b.h))) return;
	const num6 = f(f(vy + b.h) - num5);
	if (num6 <= 16.1) {
		s.gfxOffY = f(s.gfxOffY + f(f(b.y + b.h) - num5));
		b.y = f(num5 - b.h);
		s.stepSpeed = num6 < 9 ? 1 : 2;
	}
}

/** Collision.StepDown: walking off a one-block drop puts the body straight onto the lower ground. */
export function stepDown(m: TileMap, b: Body, s: Step) {
	const vx = f(b.x + b.vx);
	const vy = f(f(Math.floor(f(f(b.y + b.h) / 16)) * 16) - b.h);
	const i0 = trunc(f(vx / 16));
	const i1 = trunc(f(f(vx + b.w) / 16));
	const j0 = trunc(f(f(f(vy + b.h) + 4) / 16));
	const num4 = trunc(b.h / 16) + (b.h % 16 !== 0 ? 1 : 0);
	let num5 = (j0 + num4) * 16;
	const num6 = f(f((m.maxTilesY * 16) / 16) - 42);
	for (let i = i0; i <= i1; i++) {
		for (let j = j0; j <= j0 + 1; j++) {
			if (!inWorld(m, i, j, 1)) continue;
			if (j >= num6 || m.solid(i, j)) {
				const num9 = j * 16;
				// Utils.FloatIntersect(i * 16, j * 16 - 17, 16, 16, position, width, height)
				const r1x = i * 16;
				const r1y = j * 16 - 17;
				const meets = !(
					r1x > f(b.x + b.w) ||
					r1y > f(b.y + b.h) ||
					r1x + 16 < b.x ||
					r1y + 16 < b.y
				);
				if (meets && num9 < num5) num5 = num9;
			}
		}
	}
	const num10 = f(num5 - f(b.y + b.h));
	if (num10 > 7 && num10 < 17) {
		s.stepSpeed = num10 > 9 ? 2.5 : 1.5;
		s.gfxOffY = f(s.gfxOffY + f(f(b.y + b.h) - num5));
		b.y = f(num5 - b.h);
	}
}
