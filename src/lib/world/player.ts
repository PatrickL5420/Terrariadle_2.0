/**
 * A Terraria 1.4.5 player with no armour or accessories: how it runs and jumps
 * (Player.HorizontalMovement, JumpMovement, gravity, DryCollision with StepUp / StepDown), how it
 * animates (Player.PlayerFrame) and swings a held item (ItemCheck_ApplyUseStyle, useStyle 1).
 * Game pixels and game frames (60 a second).
 */
import { PLAYER_SIZE } from '$lib/game/items';
import { stepDown, stepUp, tileCollision } from './collision';
import type { Tiles } from './tiles';

const GRAVITY = 0.4;
const MAX_FALL = 10;
const JUMP_HEIGHT = 15;
const JUMP_SPEED = 5.01;
const RUN_ACCELERATION = 0.08;
const MAX_RUN_SPEED = 3;
const RUN_SLOWDOWN = 0.2;

export interface Controls {
	left: boolean;
	right: boolean;
	jump: boolean;
}

/** What the player is swinging: the item type, its texture's width (heldItemFrame) and Item.scale. */
export interface HeldItem {
	item: number;
	width: number;
	scale: number;
}

export class Player {
	x: number;
	y: number;
	vx = 0;
	vy = 0;
	readonly w = PLAYER_SIZE[0];
	readonly h = PLAYER_SIZE[1];
	direction: 1 | -1 = 1;
	controls: Controls = { left: false, right: false, jump: false };

	#jump = 0;
	#releaseJump = true;
	/** How far the sprite is drawn below its hitbox while it glides up or down a step. */
	gfxOffY = 0;
	#stepSpeed = 1;

	/** The swing: frames left of it (itemAnimation) and its length (itemAnimationMax). */
	itemAnimation = 0;
	itemAnimationMax = 0;
	itemRotation = 0;
	itemLocation = { x: 0, y: 0 };
	held: HeldItem | null = null;

	/** Sprite frames (index into the 20-frame sheets) and their counters. */
	bodyFrame = 0;
	legFrame = 0;
	#legFrameCounter = 0;
	/** Frames since spawning, for blinking. */
	#time = 0;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	get grounded() {
		return this.vy === 0;
	}

	get center() {
		return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
	}

	/** Starts swinging `item` for `frames` (useAnimation), unless already swinging. */
	swing(item: HeldItem, frames: number): boolean {
		if (this.itemAnimation > 0) return false;
		this.held = item;
		this.itemAnimation = this.itemAnimationMax = frames;
		return true;
	}

	/** One frame of Player.Update. */
	update(tiles: Tiles) {
		this.#time++;
		const c = this.controls;
		// Player.HorizontalMovement.
		if (c.left && !c.right) {
			if (this.vx > -MAX_RUN_SPEED) {
				if (this.vx > RUN_SLOWDOWN) this.vx -= RUN_SLOWDOWN;
				this.vx -= RUN_ACCELERATION;
			}
			if (this.itemAnimation === 0) this.direction = -1;
		} else if (c.right && !c.left) {
			if (this.vx < MAX_RUN_SPEED) {
				if (this.vx < -RUN_SLOWDOWN) this.vx += RUN_SLOWDOWN;
				this.vx += RUN_ACCELERATION;
			}
			if (this.itemAnimation === 0) this.direction = 1;
		} else {
			const slow = this.vy === 0 ? RUN_SLOWDOWN : RUN_SLOWDOWN * 0.5;
			if (this.vx > slow) this.vx -= slow;
			else if (this.vx < -slow) this.vx += slow;
			else this.vx = 0;
		}

		// Player.JumpMovement.
		if (c.jump) {
			if (this.#jump > 0) {
				if (this.vy === 0) this.#jump = 0;
				else {
					this.vy = -JUMP_SPEED;
					this.#jump--;
				}
			} else if (this.vy === 0 && this.#releaseJump) {
				this.vy = -JUMP_SPEED;
				this.#jump = JUMP_HEIGHT;
			}
			this.#releaseJump = false;
		} else {
			this.#jump = 0;
			this.#releaseJump = true;
		}

		this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);

		this.#updateSwing();

		// The sprite catches up with a step it took.
		const glide = (1 + Math.abs(this.vx) / 3) * this.#stepSpeed;
		if (this.gfxOffY > 0) this.gfxOffY = Math.max(0, this.gfxOffY - glide);
		else if (this.gfxOffY < 0) this.gfxOffY = Math.min(0, this.gfxOffY + glide);
		this.gfxOffY = Math.max(-32, Math.min(32, this.gfxOffY));

		// Stepping down a block while walking, and up one.
		if (this.vy === GRAVITY) {
			const down = stepDown(tiles, this);
			if (down) {
				this.gfxOffY -= down.drop;
				this.#stepSpeed = down.stepSpeed;
			}
		}
		if (this.vy >= GRAVITY) {
			const up = stepUp(tiles, this);
			if (up) {
				this.gfxOffY += up.lift;
				this.#stepSpeed = up.stepSpeed;
			}
		}

		// Player.DryCollision.
		const hit = tileCollision(tiles, this);
		if (hit.up) this.#jump = 0;
		this.vx = hit.vx;
		this.vy = hit.vy;
		this.x += this.vx;
		this.y += this.vy;

		this.#frame();
	}

	/** ItemCheck: the swing counts down; useStyle 1 places and turns the item. */
	#updateSwing() {
		if (this.itemAnimation <= 0 || !this.held) return;
		const W = this.held.width;
		const t = this.itemAnimation / this.itemAnimationMax;
		const d = this.direction;
		const x = this.x + this.w * 0.5;
		// ItemCheck_ApplyUseStyle for useStyle 1, items up to 32 px.
		if (t < 0.333) this.itemLocation = { x: x + (W * 0.5 - 10) * d, y: this.y + 24 };
		else if (t < 0.666) this.itemLocation = { x: x + (W * 0.5 - 10) * d, y: this.y + 10 };
		else this.itemLocation = { x: x - (W * 0.5 - 6) * d, y: this.y + 10 };
		this.itemRotation = (t - 0.5) * -d * 3.5 - d * 0.3;
		this.itemAnimation--;
		if (this.itemAnimation === 0) this.held = null;
	}

	/** Player.PlayerFrame: body and leg frames. */
	#frame() {
		if (this.itemAnimation > 0 && this.held) {
			const t = this.itemAnimation / this.itemAnimationMax;
			this.bodyFrame = t < 0.333 ? 3 : t < 0.666 ? 2 : 1;
		} else this.bodyFrame = 0;

		if (this.vy !== 0) {
			this.#legFrameCounter = 0;
			this.legFrame = 5;
			if (!this.held) this.bodyFrame = 5;
		} else if (this.vx !== 0) {
			this.#legFrameCounter += Math.abs(this.vx) * 1.3;
			while (this.#legFrameCounter > 8) {
				this.#legFrameCounter -= 8;
				this.legFrame++;
			}
			if (this.legFrame < 7) this.legFrame = 19;
			if (this.legFrame > 19) this.legFrame = 7;
			if (!this.held) this.bodyFrame = this.legFrame;
		} else {
			this.#legFrameCounter = 0;
			this.legFrame = 0;
		}
	}

	/** Player.EyeFrameToShow: blinks every 4 seconds (0 open, 1 half, 2 shut). */
	get eyeFrame() {
		const n = (this.#time % 240) - 234;
		if (n < 0) return 0;
		if (n < 2) return 1;
		if (n < 4) return 2;
		return 1;
	}
}
