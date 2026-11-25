/**
 * Collision.TileCollision, StepUp and StepDown from Terraria 1.4.5, for full blocks only (this
 * world has no slopes, half blocks or platforms) and normal gravity.
 */
import type { Tiles } from './tiles';

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
	/** Hit a ceiling (Collision.up) / stood on something (Collision.down). */
	up: boolean;
	down: boolean;
}

/** Collision.TileCollision: the velocity the blocks around `b` let it move by this frame. */
export function tileCollision(tiles: Tiles, b: Body): Hit {
	const { x, y, w, h, vx, vy } = b;
	const out: Hit = { vx, vy, up: false, down: false };
	const nx = x + vx;
	const ny = y + vy;
	const i0 = Math.trunc(x / 16) - 1;
	const i1 = Math.trunc((x + w) / 16) + 2;
	const j0 = Math.trunc(y / 16) - 1;
	const j1 = Math.trunc((y + h) / 16) + 2;
	let num = -1;
	let num2 = -1;
	let num3 = -1;
	let num4 = -1;
	let num6 = (j1 + 3) * 16;
	for (let i = i0; i < i1; i++) {
		for (let j = j0; j < j1; j++) {
			if (!tiles.solid(i, j)) continue;
			const tx = i * 16;
			const ty = j * 16;
			if (!(nx + w > tx && nx < tx + 16 && ny + h > ty && ny < ty + 16)) continue;
			if (y + h <= ty) {
				out.down = true;
				if (num6 > ty) {
					num3 = i;
					num4 = j;
					if (num3 !== num) {
						out.vy = ty - (y + h);
						num6 = ty;
					}
				}
			} else if (x + w <= tx) {
				num = i;
				num2 = j;
				if (num2 !== num4) out.vx = tx - (x + w);
				if (num3 === num) out.vy = vy;
			} else if (x >= tx + 16) {
				num = i;
				num2 = j;
				if (num2 !== num4) out.vx = tx + 16 - x;
				if (num3 === num) out.vy = vy;
			} else if (y >= ty + 16) {
				out.up = true;
				num3 = i;
				num4 = j;
				out.vy = ty + 16 - y + 0.01;
				if (num4 === num2) out.vx = vx;
			}
		}
	}
	return out;
}

/**
 * Collision.StepUp: walking into a one-block ledge lifts the body onto it. Returns how far it was
 * lifted (added to gfxOffY, so the sprite glides up) and the step speed, or null.
 */
export function stepUp(tiles: Tiles, b: Body): { lift: number; stepSpeed: number } | null {
	const dir = b.vx < 0 ? -1 : b.vx > 0 ? 1 : 0;
	const vx = b.x + b.vx;
	const half = Math.trunc(b.w / 2);
	const i = Math.trunc((vx + half + (half + 1) * dir) / 16);
	const j = Math.trunc((b.y + b.h - 1) / 16);
	const rows = Math.ceil(b.h / 16);
	if (i < 1 || i >= tiles.width - 1 || j < 1 || j >= tiles.height - 1) return null;
	let clear = true;
	for (let k = 2; k < rows + 1; k++) clear &&= !tiles.solid(i, j - k);
	const clearBehind = !tiles.solid(i - dir, j - rows);
	const clearAbove = !tiles.solid(i, j - 1);
	const ledge = tiles.solid(i, j);
	if (!(i * 16 < vx + b.w && i * 16 + 16 > vx)) return null;
	if (!(ledge && clearAbove && clear && clearBehind)) return null;
	const top = j * 16;
	if (!(top < b.y + b.h)) return null;
	const rise = b.y + b.h - top;
	if (rise > 16.1) return null;
	b.y = top - b.h;
	return { lift: rise, stepSpeed: rise < 9 ? 1 : 2 };
}

/** Collision.StepDown: walking off a one-block drop puts the body straight onto the lower ground. */
export function stepDown(tiles: Tiles, b: Body): { drop: number; stepSpeed: number } | null {
	const vx = b.x + b.vx;
	const vy = Math.floor((b.y + b.h) / 16) * 16 - b.h;
	const i0 = Math.trunc(vx / 16);
	const i1 = Math.trunc((vx + b.w) / 16);
	const j0 = Math.trunc((vy + b.h + 4) / 16);
	const rows = Math.ceil(b.h / 16);
	let floor = (j0 + rows) * 16;
	for (let i = i0; i <= i1; i++) {
		for (let j = j0; j <= j0 + 1; j++) {
			if (i < 1 || i >= tiles.width - 1 || j < 1 || j >= tiles.height - 1) continue;
			if (!tiles.solid(i, j)) continue;
			const top = j * 16;
			// Utils.FloatIntersect(i * 16, j * 16 - 17, 16, 16, body)
			const meets =
				i * 16 < b.x + b.w && b.x < i * 16 + 16 && top - 17 < b.y + b.h && b.y < top - 1;
			if (meets && top < floor) floor = top;
		}
	}
	const fall = floor - (b.y + b.h);
	if (!(fall > 7 && fall < 17)) return null;
	b.y = floor - b.h;
	return { drop: fall, stepSpeed: fall > 9 ? 2.5 : 1.5 };
}
