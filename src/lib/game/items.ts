/**
 * How Terraria 1.4.5 moves a dropped item and pulls it toward a player, shared by the coin drop
 * ($lib/coins/world) and the little world ($lib/world). Game pixels and game frames (60 a second).
 */

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Vel {
	vx: number;
	vy: number;
}

/** A dropped item: its hitbox (top-left, size) and velocity. */
export type Moving = Box & Vel;

export const intersects = (a: Box, b: Box) =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Item hitboxes are rectangles at whole pixels. */
export const hitbox = (c: Moving): Box => ({
	x: Math.trunc(c.x),
	y: Math.trunc(c.y),
	w: c.w,
	h: c.h
});

/** UnifiedRandom.Next(max) / Next(min, max). */
export type Rand = (min: number, max?: number) => number;
export const random: Rand = (min, max) =>
	max === undefined
		? Math.floor(Math.random() * min)
		: min + Math.floor(Math.random() * (max - min));

/** The player's hitbox (Player.width / height) and item grab range (defaultItemGrabRange). */
export const PLAYER_SIZE: [number, number] = [20, 42];
export const GRAB_RANGE = 42;
const GRAB_SPEED = 0.45; // Player.itemGrabSpeed
const GRAB_SPEED_MAX = 4; // Player.itemGrabSpeedMax

/** Player.GrabItems' reach: the player's hitbox grown by the grab range. */
export const grabReach = (body: Box): Box => ({
	x: Math.trunc(body.x) - GRAB_RANGE,
	y: Math.trunc(body.y) - GRAB_RANGE,
	w: body.w + GRAB_RANGE * 2,
	h: body.h + GRAB_RANGE * 2
});

/**
 * WorldItem.UpdateItem for an item lying or falling (not being pulled): gravity, air drag,
 * then `collide` (Collision.TileCollision) turns the velocity into what the ground allows.
 */
export function fallItem(c: Moving, collide: (c: Moving) => Vel) {
	c.vy = Math.min(7, c.vy + 0.1);
	c.vx *= 0.95;
	if (c.vx < 0.1 && c.vx > -0.1) c.vx = 0;
	const v = collide(c);
	c.vx = v.vx;
	c.vy = v.vy;
	c.x += c.vx;
	c.y += c.vy;
}

/**
 * Player.PullItem_Common: speeds up toward the player's hitbox `body`, braking hard when heading
 * away. `playerVx` is how fast the player is moving sideways.
 */
export function pullCommon(c: Moving, body: Box, playerVx: number, brake: number) {
	const cx = c.x + c.w * 0.5;
	const cy = c.y + c.h * 0.5;
	if (body.x + body.w * 0.5 > cx) {
		if (c.vx < GRAB_SPEED_MAX + playerVx) c.vx += GRAB_SPEED;
		if (c.vx < 0) c.vx += GRAB_SPEED * brake;
	} else {
		if (c.vx > -GRAB_SPEED_MAX + playerVx) c.vx -= GRAB_SPEED;
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

/** Player.PullItem_Pickup: homes in on `target` at `speed`, turning over `acc` frames. */
export function pullPickup(c: Moving, target: Box, speed: number, acc: number) {
	let dx = target.x + target.w / 2 - (c.x + Math.trunc(c.w / 2));
	let dy = target.y + target.h / 2 - (c.y + Math.trunc(c.h / 2));
	const k = speed / Math.sqrt(dx * dx + dy * dy);
	dx *= k;
	dy *= k;
	c.vx = (c.vx * (acc - 1) + dx) / acc;
	c.vy = (c.vy * (acc - 1) + dy) / acc;
}
