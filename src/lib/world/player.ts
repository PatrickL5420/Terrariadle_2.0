/**
 * A Terraria 1.4.5 player with no items held, armour, accessories, mount or buffs, moving about
 * on full blocks. Ported line by line from the game's Player.Update, the parts that run for such
 * a player, in the game's order:
 *
 *   the frame's defaults (maxFallSpeed, gravity, run and jump stats)
 *   Player.HorizontalMovement   running, turning, friction
 *   Player.JumpMovement         jumping
 *   gravity                     (Update's no-wings, no-rockets branch)
 *   gfxOffY                     the sprite catching up with a step
 *   Collision.StepDown / StepUp
 *   Player.DryCollision         Collision.TileCollision, then moving; bumping a ceiling
 *   Collision.StepConveyorBelt  (its float rounding: see #dryCollision)
 *   (ItemCheck: the swing; not yet compared with the game, see below)
 *   Player.PlayerFrame          body and leg animation
 *
 * The game does this in single-precision floats, so every float operation is rounded to one
 * (`f`); its frame counters are doubles. tools/verify runs the game's own code on random worlds
 * and inputs and compares every frame. Left out because they can't happen here: slopes and
 * half blocks (SlopeDownMovement, SlopingCollision do nothing on full blocks), water, wings,
 * dashes, mounts, grappling, and DryCollision's sub-steps (only above 16 px a frame).
 */
import { PLAYER_SIZE } from '$lib/game/items';
import { f, stepDown, stepUp, tileCollision, type TileMap } from './collision';

/** Player.defaultGravity, and Update's other per-frame values for a plain player. */
const GRAVITY = f(0.4);
const MAX_FALL_SPEED = f(f(10) + f(0.01));
const JUMP_HEIGHT = 15;
const JUMP_SPEED = f(5.01);
const MAX_RUN_SPEED = 3; // originalRunSpeed
const ACC_RUN_SPEED = MAX_RUN_SPEED;
const RUN_ACCELERATION = f(0.08);
const RUN_SLOWDOWN = f(0.2);

export interface Controls {
	left: boolean;
	right: boolean;
	jump: boolean;
}

/** What the player is swinging: the item type, its texture's width (heldItemFrame), Item.scale. */
export interface HeldItem {
	item: number;
	width: number;
	scale: number;
	/** Item.useTurn: the player can turn while swinging it. */
	useTurn?: boolean;
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

	jump = 0;
	releaseJump = true;
	/** How far the sprite is drawn below its hitbox while it glides up or down a step. */
	gfxOffY = 0;
	stepSpeed = 1;

	/** The swing: frames left of it (itemAnimation) and its length (itemAnimationMax). */
	itemAnimation = 0;
	itemAnimationMax = 0;
	itemRotation = 0;
	itemLocation = { x: 0, y: 0 };
	held: HeldItem | null = null;

	/** Sprite frames (index into the 20-frame sheets) and their counters (doubles, like the game). */
	bodyFrame = 0;
	legFrame = 0;
	legFrameCounter = 0;
	bodyFrameCounter = 0;
	/** Frames since spawning, for blinking. */
	#time = 0;

	constructor(x: number, y: number) {
		this.x = f(x);
		this.y = f(y);
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
	update(m: TileMap) {
		this.#time++;
		this.#horizontalMovement();
		this.#jumpMovement();
		// Gravity (no wings, rockets or mount): then capped at the fall speed.
		this.vy = f(this.vy + GRAVITY);
		if (this.vy > MAX_FALL_SPEED) this.vy = MAX_FALL_SPEED;
		this.#glide();
		// SlopeDownMovement does nothing on full blocks; then a step down or up.
		if (this.vy === GRAVITY) stepDown(m, this, this);
		if (this.vy >= GRAVITY) stepUp(m, this, this);
		this.#dryCollision(m);
		this.#updateSwing();
		this.#frame();
	}

	/** Player.HorizontalMovement. */
	#horizontalMovement() {
		const c = this.controls;
		const turn = (c.right ? 1 : 0) - (c.left ? 1 : 0);
		// ChangeDir: while swinging, only an item with useTurn lets the player turn.
		if (turn !== 0 && (this.itemAnimation === 0 || this.held?.useTurn))
			this.direction = turn as 1 | -1;
		const vx = this.vx;
		if (c.left && vx > -MAX_RUN_SPEED) {
			if (this.vx > RUN_SLOWDOWN) this.vx = f(this.vx - RUN_SLOWDOWN);
			this.vx = f(this.vx - RUN_ACCELERATION);
		} else if (c.right && vx < MAX_RUN_SPEED) {
			if (this.vx < -RUN_SLOWDOWN) this.vx = f(this.vx + RUN_SLOWDOWN);
			this.vx = f(this.vx + RUN_ACCELERATION);
		} else if (c.left && vx > -ACC_RUN_SPEED) {
			// Running faster than maxRunSpeed (accessories): never, as accRunSpeed is the same.
			if (this.vy === 0) {
				if (this.vx > RUN_SLOWDOWN) this.vx = f(this.vx - RUN_SLOWDOWN);
				this.vx = f(this.vx - f(RUN_ACCELERATION * f(0.2)));
			}
		} else if (c.right && vx < ACC_RUN_SPEED) {
			if (this.vy === 0) {
				if (this.vx < -RUN_SLOWDOWN) this.vx = f(this.vx + RUN_SLOWDOWN);
				this.vx = f(this.vx + f(RUN_ACCELERATION * f(0.2)));
			}
		} else if (this.vy === 0) {
			// Friction on the ground (also slows a run held past maxRunSpeed).
			if (this.vx > RUN_SLOWDOWN) this.vx = f(this.vx - RUN_SLOWDOWN);
			else if (this.vx < -RUN_SLOWDOWN) this.vx = f(this.vx + RUN_SLOWDOWN);
			else this.vx = 0;
		} else {
			// In the air: half as much.
			const half = f(RUN_SLOWDOWN * f(0.5));
			if (this.vx > RUN_SLOWDOWN * 0.5) this.vx = f(this.vx - half);
			else if (this.vx < -RUN_SLOWDOWN * 0.5) this.vx = f(this.vx + half);
			else this.vx = 0;
		}
	}

	/** Player.JumpMovement. */
	#jumpMovement() {
		if (this.controls.jump) {
			if (this.jump > 0) {
				if (this.vy === 0) this.jump = 0;
				else {
					this.vy = -JUMP_SPEED;
					this.jump--;
				}
			} else if (this.vy === 0 && this.releaseJump) {
				this.vy = -JUMP_SPEED;
				this.jump = JUMP_HEIGHT;
			}
			this.releaseJump = false;
		} else {
			this.jump = 0;
			this.releaseJump = true;
		}
	}

	/** The sprite catches up with a step it took (gfxOffY), faster when running. */
	#glide() {
		const speed = f(f(1) + f(Math.abs(this.vx) / 3));
		const by = f(speed * this.stepSpeed);
		if (this.gfxOffY > 0) {
			this.gfxOffY = f(this.gfxOffY - by);
			if (this.gfxOffY < 0) this.gfxOffY = 0;
		} else if (this.gfxOffY < 0) {
			this.gfxOffY = f(this.gfxOffY + by);
			if (this.gfxOffY > 0) this.gfxOffY = 0;
		}
		if (this.gfxOffY > 32) this.gfxOffY = 32;
		if (this.gfxOffY < -32) this.gfxOffY = -32;
	}

	/** Player.DryCollision (under 16 px a frame), then bumping a ceiling stops the jump. */
	#dryCollision(m: TileMap) {
		const hit = tileCollision(m, this);
		this.vx = hit.vx;
		this.vy = hit.vy;
		if (hit.up) this.jump = 0;
		this.x = f(this.x + this.vx);
		this.y = f(this.y + this.vy);
		// SlopingCollision: nothing on full blocks, except that its own TileCollision call (with
		// no motion) sets Collision.up again, which is what the ceiling check below reads.
		const up = tileCollision(m, { x: this.x, y: this.y, w: this.w, h: this.h, vx: 0, vy: 0 }).up;
		// Collision.StepConveyorBelt: there are no belts, but it looks for them with the body
		// moved 5 px down and then back up, which in floats can move it by a hair.
		if (Math.abs(this.gfxOffY) <= 2) this.y = f(f(this.y + 5) - 5);
		if (up) {
			this.vy = f(0.01);
			this.jump = 0;
		}
	}

	/** ItemCheck for useStyle 1 (a swing): the swing counts down, and places and turns the item. */
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

	/** Player.PlayerFrame for a plain player: the legs, then the body. */
	#frame() {
		if (this.vy !== 0) {
			this.legFrameCounter = 0;
			this.legFrame = 5;
		} else if (this.vx !== 0) {
			this.legFrameCounter += Math.abs(this.vx) * 1.3;
			while (this.legFrameCounter > 8) {
				this.legFrameCounter -= 8;
				this.legFrame++;
			}
			if (this.legFrame < 7) this.legFrame = 19;
			else if (this.legFrame > 19) this.legFrame = 7;
		} else {
			this.legFrameCounter = 0;
			this.legFrame = 0;
		}

		if (this.itemAnimation > 0 && this.held) {
			// A swing (useStyle 1): three poses by how far through it is.
			const t = this.itemAnimation;
			const max = this.itemAnimationMax;
			this.bodyFrame = t < max * 0.333 ? 3 : t < max * 0.666 ? 2 : 1;
		} else if (this.vy !== 0) {
			this.bodyFrame = 5;
			this.bodyFrameCounter = 0;
		} else if (this.vx !== 0) {
			this.bodyFrameCounter += Math.abs(this.vx) * 1.5;
			this.bodyFrame = this.legFrame;
		} else {
			this.bodyFrameCounter = 0;
			this.bodyFrame = 0;
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
