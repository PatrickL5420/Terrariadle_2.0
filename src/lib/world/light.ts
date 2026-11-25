/**
 * Terraria 1.4.5's lighting (LightingEngine in Color mode) for the little world: every open tile
 * on the surface with no wall behind it is lit by the sky (TileLightScanner.ApplySurfaceLight, Main.tileColor), then
 * the light map is blurred (LightMap.Blur): light spreads to neighbours, fading by 0.91 a tile
 * through air and by 0.56 through blocks. A block is drawn in its tile's light.
 */
import type { Tiles } from './tiles';

export type RGB = [number, number, number];

const DECAY_AIR = 0.91;
const DECAY_SOLID = 0.56;
const CUTOFF = 0.0185;

/** Main.ApplyColorOfTheSkiesToTiles: the sky's colour, washed a little toward grey. */
export function tileColor([r, g, b]: RGB): RGB {
	return [r, g, b].map((v) => Math.trunc((r + g + b + v * 7) / 10)) as RGB;
}

export class LightMap {
	/** Light per tile, 0-1 per channel, column-major like the game (x * height + y). */
	readonly r: Float32Array;
	readonly g: Float32Array;
	readonly b: Float32Array;
	#solid: Uint8Array;

	constructor(
		readonly width: number,
		readonly height: number
	) {
		const n = width * height;
		this.r = new Float32Array(n);
		this.g = new Float32Array(n);
		this.b = new Float32Array(n);
		this.#solid = new Uint8Array(n);
	}

	/** Lights the world with the sky's tile colour (0-255). */
	update(tiles: Tiles, sky: RGB) {
		const { width: W, height: H } = this;
		const [sr, sg, sb] = sky.map((v) => v / 255);
		const avg = (sr + sg + sb) / 3;
		for (let x = 0; x < W; x++) {
			for (let y = 0; y < H; y++) {
				const k = x * H + y;
				const solid = tiles.solid(x, y);
				this.#solid[k] = solid ? 1 : 0;
				// Open tiles with no wall get the sky's light (a dirt wall keeps it out).
				const lit = !solid && !tiles.hasWall(x, y) && avg > 0;
				this.r[k] = lit ? sr : 0;
				this.g[k] = lit ? sg : 0;
				this.b[k] = lit ? sb : 0;
			}
		}
		for (let pass = 0; pass < 2; pass++) {
			for (let x = 0; x < W; x++) {
				this.#line(x * H, x * H + H - 1, 1);
				this.#line(x * H + H - 1, x * H, -1);
			}
			for (let y = 0; y < H; y++) {
				this.#line(y, (W - 1) * H + y, H);
				this.#line((W - 1) * H + y, y, -H);
			}
		}
	}

	/** LightMap.BlurLine for each channel. */
	#line(start: number, end: number, stride: number) {
		for (const c of [this.r, this.g, this.b]) {
			let carry = 0;
			let dark = false;
			for (let i = start; i !== end + stride; i += stride) {
				if (carry < c[i]) {
					carry = c[i];
					dark = false;
				} else if (!dark) {
					if (carry < CUTOFF) dark = true;
					else c[i] = carry;
				}
				if (dark) continue;
				carry *= this.#solid[i] ? DECAY_SOLID : DECAY_AIR;
			}
		}
	}

	/** Lighting.GetColor(i, j) times a colour (0-255), as XNA bytes. */
	color(i: number, j: number, [r, g, b]: RGB = [255, 255, 255]): RGB {
		const x = Math.min(this.width - 1, Math.max(0, i));
		const y = Math.min(this.height - 1, Math.max(0, j));
		const k = x * this.height + y;
		const byte = (v: number) => Math.min(255, Math.trunc(v * 255));
		const lr = byte(this.r[k]);
		const lg = byte(this.g[k]);
		const lb = byte(this.b[k]);
		return [Math.trunc((r * lr) / 255), Math.trunc((g * lg) / 255), Math.trunc((b * lb) / 255)];
	}
}
