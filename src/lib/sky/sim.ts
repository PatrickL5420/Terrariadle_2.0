/**
 * The main menu's clouds and stars, ported from Terraria 1.4.5 (Cloud, Star, Main.UpdateMenu,
 * Main.DrawMenu). Updated 60 times a second like the game; positions are game pixels.
 */

/** UnifiedRandom.Next(min, max): an integer from min up to (not including) max. */
const next = (min: number, max?: number) =>
	max === undefined
		? Math.floor(Math.random() * min)
		: min + Math.floor(Math.random() * (max - min));

/** Cloud texture sizes (Images/Cloud_N). */
export const CLOUD_SIZES: Record<number, [number, number]> = {
	0: [256, 104],
	1: [192, 64],
	2: [168, 78],
	3: [88, 52],
	4: [302, 132],
	5: [322, 130],
	6: [270, 142],
	7: [300, 130],
	8: [238, 72],
	9: [178, 82],
	10: [182, 74],
	11: [134, 56],
	12: [88, 28],
	13: [62, 22],
	14: [214, 72],
	15: [210, 82],
	16: [204, 68],
	17: [142, 56],
	18: [530, 218],
	19: [372, 132],
	20: [296, 116],
	21: [226, 68],
	22: [96, 70],
	23: [84, 80],
	24: [162, 72],
	27: [124, 52],
	28: [168, 184],
	29: [78, 68],
	32: [102, 78],
	33: [148, 54],
	34: [76, 120],
	37: [162, 176],
	38: [166, 178],
	39: [166, 150],
	40: [168, 180]
};

/**
 * Rare clouds that can show on the menu (CloudID.Sets.RareClouds_Normal, less the ones that
 * need a boss beaten or hardmode). 28 and 37-40 only pass a 1 in 10 roll.
 */
const RARE_CLOUDS = [
	22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41
];
const LOCKED_RARE = new Set([25, 26, 30, 31, 35, 36, 41]);
const MAX_CLOUDS = 200;

export interface Cloud {
	x: number;
	y: number;
	scale: number;
	rotation: number;
	rSpeed: number;
	flip: boolean;
	type: number;
	width: number;
	height: number;
	alpha: number;
	kill: boolean;
}

function rollRareCloud(): number {
	for (;;) {
		const n = RARE_CLOUDS[next(RARE_CLOUDS.length)];
		if (LOCKED_RARE.has(n)) continue;
		if ((n === 28 || n >= 37) && next(10) !== 0) continue;
		return n;
	}
}

/** Cloud.GetParallax. */
function parallax(scale: number): number {
	let k: number;
	let s: number;
	if (scale < 1) {
		k = 0.07;
		s = (scale + 0.15 + 1) / 2;
	} else if (scale <= 1.15) {
		k = 0.19;
		s = scale - 0.075;
	} else {
		k = 0.23;
		s = scale - 0.15 - 0.075;
	}
	return k * s * s;
}

export class Clouds {
	list: Cloud[] = [];
	/** How many the menu keeps (Main.numClouds, random 0-199 each launch). */
	readonly count = next(MAX_CLOUDS);
	/** Main.windSpeedCurrent, random each launch. */
	readonly wind = next(-800, 801) * 0.001;

	constructor(
		public width: number,
		public height: number
	) {
		// Cloud.resetClouds: the first clouds are fully there at once.
		for (let i = 0; i < this.count; i++) this.add()?.(1);
	}

	/** Cloud.addCloud. Returns a setter for the new cloud's alpha (or nothing if none fit). */
	add(): ((alpha: number) => void) | undefined {
		if (this.list.length >= MAX_CLOUDS) return;
		const { width: W, height: H, wind } = this;
		const c: Cloud = {
			x: 0,
			y: 0,
			scale: next(70, 131) * 0.01,
			rotation: next(-10, 11) * 0.01,
			rSpeed: 0,
			flip: next(2) === 0,
			type: 0,
			width: 0,
			height: 0,
			alpha: 0,
			kill: false
		};
		let left = 0;
		let right = 0;
		if (wind > 0) left -= 200;
		if (wind < 0) right += 200;
		const x = next(left - 300, W + right + 300);
		c.y = next(Math.trunc(-H * 0.25), Math.trunc(H * 0.15));
		if (next(3) === 0) c.y -= next(Math.trunc(H * 0.1));
		c.type = next(4);
		const numClouds = this.count;
		// No rain or cloudy backgrounds on the menu.
		if (c.scale < 1 && c.y < -H * 0.15 && numClouds <= 80) c.type = next(9, 14);
		else if (
			((c.scale < 1.15 && c.y < -H * 0.3) || (c.scale < 0.85 && c.y < H * 0.15)) &&
			numClouds > 70
		)
			c.type = next(4, 9);
		else if (c.y > -H * 0.15 && next(2) === 0 && numClouds > 20) c.type = next(14, 18);
		if (next(150) === 0) c.type = rollRareCloud();
		if (c.scale > 1.2) c.y += 100;
		if (c.scale > 1.3) c.scale = 1.3;
		if (c.scale < 0.7) c.scale = 0.7;
		c.x = x;
		const [tw, th] = CLOUD_SIZES[c.type];
		c.width = Math.trunc(tw * c.scale);
		c.height = Math.trunc(th * c.scale);
		if (c.x > W + 400) c.alpha = 1;
		if (c.x + tw * c.scale < -400) c.alpha = 1;
		// Not on top of another cloud.
		const overlaps = this.list.some(
			(o) =>
				Math.trunc(c.x) < Math.trunc(o.x) + o.width &&
				Math.trunc(o.x) < Math.trunc(c.x) + c.width &&
				Math.trunc(c.y) < Math.trunc(o.y) + o.height &&
				Math.trunc(o.y) < Math.trunc(c.y) + c.height
		);
		if (overlaps) return;
		this.list.push(c);
		return (alpha) => (c.alpha = alpha);
	}

	/** One frame: Cloud.UpdateClouds, plus Cloud.UpdateCloudParallax for the menu's scrolling. */
	update(cameraDx: number) {
		const keep: Cloud[] = [];
		let alive = 0;
		for (const c of this.list) {
			if (c.scale === 1) c.scale -= 0.0001;
			if (c.scale === 1.15) c.scale -= 0.0001;
			c.x += this.wind * 9 * parallax(c.scale);
			if (!c.kill) {
				if (c.alpha < 1) c.alpha = Math.min(1, c.alpha + 0.001);
			} else {
				c.alpha -= 0.001;
				if (c.alpha <= 0) continue;
			}
			const [tw, th] = CLOUD_SIZES[c.type];
			if (c.x + tw * c.scale < -600 || c.x > this.width + 600) continue;
			c.rSpeed += next(-10, 11) * 2e-5;
			c.rSpeed = Math.max(-0.0002, Math.min(0.0002, c.rSpeed));
			c.rotation = Math.max(-0.02, Math.min(0.02, c.rotation));
			c.rotation += c.rSpeed;
			c.width = Math.trunc(tw * c.scale);
			c.height = Math.trunc(th * c.scale);
			keep.push(c);
			if (!c.kill) alive++;
		}
		// Kept loosely in order of size, so bigger clouds draw over smaller ones.
		for (let j = 1; j < keep.length; j++) {
			if (keep[j - 1].scale > keep[j].scale + 0.02) [keep[j - 1], keep[j]] = [keep[j], keep[j - 1]];
		}
		this.list = keep;
		if (alive < this.count) this.add();
		else if (alive > this.count) {
			const live = keep.filter((c) => !c.kill);
			live[next(live.length)].kill = true;
		}
		for (const c of this.list) c.x -= cameraDx * parallax(c.scale);
	}

	resize(width: number, height: number) {
		this.width = width;
		this.height = height;
	}
}

export interface Star {
	x: number;
	y: number;
	scale: number;
	rotation: number;
	type: number;
	twinkle: number;
	twinkleSpeed: number;
	rotationSpeed: number;
	falling: boolean;
	hidden: boolean;
	fallX: number;
	fallY: number;
	fallTime: number;
	fadeIn: number;
}

/** Stars live in a 1920 x 1200 space that's stretched over the screen. */
export class Stars {
	list: Star[] = [];
	#dayCheck = false;

	constructor() {
		const n = next(200, 400);
		for (let i = 0; i < n; i++) this.list.push(this.#spawn(false));
	}

	/** Star.SpawnStars for one star. A respawned star fades in, away from the others. */
	#spawn(fade: boolean): Star {
		let x = next(1921);
		if (fade) {
			let best = -2000;
			for (let j = 0; j < 10; j++) {
				const cx = next(1921);
				let nearest = 2000;
				for (const s of this.list) {
					if (!s.hidden && !s.falling) nearest = Math.min(nearest, Math.trunc(Math.abs(cx - s.x)));
				}
				if (nearest > best) {
					best = nearest;
					x = cx;
				}
			}
		}
		const s: Star = {
			x,
			y: next(1201),
			rotation: next(628) * 0.01,
			scale: next(70, 130) * 0.006,
			type: next(0, 4),
			twinkle: next(60, 101) * 0.01,
			twinkleSpeed: next(30, 110) * 0.0001,
			rotationSpeed: 0,
			falling: false,
			hidden: false,
			fallX: 0,
			fallY: 0,
			fallTime: 0,
			fadeIn: fade ? 1 : 0
		};
		if (next(2) === 0) s.twinkleSpeed *= -1;
		s.rotationSpeed = next(5, 50) * 0.0001;
		if (next(2) === 0) s.rotationSpeed *= -1;
		if (next(40) === 0) {
			s.scale *= 2;
			s.twinkleSpeed /= 2;
			s.rotationSpeed /= 2;
		}
		return s;
	}

	/**
	 * One frame: Star.UpdateStars, and the menu's falling stars. On the menu a star falls on 1 in
	 * 12 frames of night, while its clock runs ~30.9 ticks a frame; ours runs 1 tick a second, so
	 * `fallChance` keeps the same falls per tick of night.
	 */
	update(dayTime: boolean, time: number, fallChance: number) {
		if (!dayTime) {
			this.#dayCheck = false;
			if (Math.random() < fallChance) {
				const s = this.list[next(this.list.length)];
				if (!s.hidden && !s.falling) {
					s.fallTime = 0;
					s.falling = true;
					s.fallY = next(700, 1001) * 0.01;
					s.fallX = next(-400, 401) * 0.01;
				}
			}
		} else if (!this.#dayCheck && time >= 27_000) {
			this.#dayCheck = true;
			this.list = this.list.map((s) => (s.hidden ? this.#spawn(true) : s));
		}
		for (const s of this.list) {
			if (s.falling && !s.hidden) {
				s.fallTime++;
				s.x += s.fallX;
				s.y += s.fallY;
				if (s.y > 1500) s.hidden = true;
				s.twinkle += s.twinkleSpeed * 3;
				s.rotation += 0.5;
			} else {
				if (s.fadeIn > 0) s.fadeIn = Math.max(0, s.fadeIn - 6.1728395e-5 * 10);
				s.twinkle += s.twinkleSpeed;
				s.rotation += s.rotationSpeed;
			}
			if (s.twinkle > 1) {
				s.twinkle = 1;
				s.twinkleSpeed *= -1;
			} else if (s.twinkle < 0.6) {
				s.twinkle = 0.6;
				s.twinkleSpeed *= -1;
			}
			if (s.rotation > 6.28) s.rotation -= 6.28;
			if (s.rotation < 0) s.rotation += 6.28;
		}
	}
}
