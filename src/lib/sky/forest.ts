/**
 * The menu's forest backgrounds: which textures each style uses (WorldGen.SetForestBGSet) and
 * where they're drawn on the menu (Main.DrawSurfaceBG_BackMountainsStep1 / Step2,
 * DrawSurfaceBG_Forest, SetBackgroundOffsets, DrawSurfaceBG_GetLayerYOffset,
 * GetBackgroundRect). Positions are game pixels.
 */

export interface ForestSet {
	/** Far and near mountains (-1: none). */
	mountains: [number, number];
	/** Three tree lines, back to front (-1: none). */
	trees: [number, number, number];
}

/** Every forest style the menu can roll. */
export const FOREST_STYLES = [0, 1, 2, 3, 31, 4, 5, 51, 6, 7, 71, 72, 73, 8, 9, 10, 11, 12, 13];

/** WorldGen.SetForestBGSet. */
export function forestSet(style: number): ForestSet {
	const m: [number, number] = [7, 8];
	const set = (trees: [number, number, number], m0 = m[0], m1 = m[1]): ForestSet => ({
		mountains: [m0, m1],
		trees
	});
	switch (style) {
		case 1:
			return set([50, 51, 52]);
		case 2:
			return set([53, 54, 55]);
		case 3:
			return set([91, -1, 92], 7, 90);
		case 31:
			return set([91, -1, 11], 7, 90);
		case 4:
			return set([-1, -1, -1], 93, 94);
		case 5:
			return set([-1, -1, 55], 93, 94);
		case 51:
			return set([-1, -1, 11], 93, 94);
		case 6:
			return set([173, -1, -1], 171, 172);
		case 7:
			return set([178, -1, -1], 176, 177);
		case 71:
			return set([178, -1, 11], 176, 177);
		case 72:
			return set([178, -1, 52], 176, 177);
		case 73:
			return set([178, -1, 55], 176, 177);
		case 8:
			return set([184, -1, -1], 179, 180);
		case 9:
			return set([279, -1, -1], 277, 278);
		case 10:
			return set([282, -1, -1], 280, 281);
		case 11:
			return set([330, 329, 328], 7, 331);
		case 12:
			return set([335, 334, 333], 7, 336);
		case 13:
			return set([343, 342, 341], 7, -1);
		default:
			return set([9, 10, 11]);
	}
}

/** Every background texture a style draws (173 animates through 251-254). */
export function forestTextures(style: number): number[] {
	const { mountains, trees } = forestSet(style);
	const ids = [...mountains, ...trees].filter((n) => n >= 0);
	if (ids.includes(173)) ids.push(251, 252, 253, 254);
	return ids;
}

/** Textures cut into 2 x 2 animation frames (Main.LoadBackground halves their size). */
const ANIMATED: Record<number, number> = { 281: 5, 341: 15 };

/** DrawSurfaceBG_GetLayerYOffset (for the mountains). */
const LAYER_Y_OFFSET: Record<number, number> = {
	93: -50,
	171: -100,
	172: 130,
	176: -760,
	177: -200,
	179: -100,
	180: -350,
	277: -260,
	278: -120,
	280: -170,
	281: -300
};

/** SetBackgroundOffsets: the scale and parallax some tree lines set for themselves. */
const OFFSETS: Record<number, { scale?: number; parallax: number }> = {
	279: { scale: 2.5, parallax: 0.3499999940395355 },
	282: { scale: 2.6, parallax: 0.25 },
	328: { scale: 2.01, parallax: 0.3400000035762787 },
	329: { scale: 2.29, parallax: 0.25999999046325684 },
	330: { parallax: 0.25 },
	333: { scale: 2.01, parallax: 0.3700000047683716 },
	334: { parallax: 0.25999999046325684 },
	335: { parallax: 0.2199999988079071 },
	341: { parallax: 0.30000001192092896 },
	342: { parallax: 0.25 },
	343: { parallax: 0.20000000298023224 }
};

/** Extra vertical nudges the tree lines get after their menu position. */
const TOP_NUDGE: Record<number, number> = {
	50: -50,
	53: -100,
	91: 200,
	173: 200,
	178: 75,
	330: -150,
	335: -150,
	343: -300,
	51: -50,
	54: -100,
	329: -150,
	334: -150,
	342: -300,
	52: -50,
	55: -100,
	92: 150,
	328: -150,
	333: -150,
	341: -50
};

export interface LayerDraw {
	/** Background texture number. */
	tex: number;
	x: number;
	y: number;
	scale: number;
	/** Source rectangle in the texture (an animation frame), or the whole texture. */
	src?: [number, number, number, number];
	flipX?: boolean;
}

/** C#'s Math.IEEERemainder. */
const ieeeRemainder = (x: number, y: number) => x - y * Math.round(x / y);

export interface ForestLayout {
	/** Far mountains, drawn before the "closer" clouds. */
	far: LayerDraw[];
	/** Near mountains, before the "closest" clouds. */
	near: LayerDraw[];
	/** Tree lines, back to front. */
	trees: LayerDraw[];
}

/**
 * Where everything's drawn for the menu's camera at `cameraX`, on a screen `W` wide.
 * `sizes` gives each texture's width and height; `counter` is Main.GetBackgroundCounter
 * (seconds x 40 on the menu), for the animated ones.
 */
export function forestLayout(
	style: number,
	cameraX: number,
	W: number,
	sizes: (tex: number) => [number, number],
	counter: number
): ForestLayout {
	const { mountains, trees } = forestSet(style);
	/** Main.backgroundWidth / backgroundHeight. */
	const size = (n: number): [number, number] => {
		const [w, h] = sizes(n);
		return n in ANIMATED ? [Math.trunc(w / 2), Math.trunc(h / 2)] : [w, h];
	};
	/** GetBackgroundRect: an animation frame, 2 px trimmed off its top and bottom. */
	const rect = (n: number): [number, number, number, number] | undefined => {
		if (!(n in ANIMATED)) return;
		const frame = Math.trunc(counter / ANIMATED[n]) % 4;
		const [w, h] = size(n);
		return [(frame % 2) * w, Math.trunc(frame / 2) * h + 2, w, h - 4];
	};
	const tiles = (
		tex: number,
		startX: number,
		width: number,
		loops: number,
		y: number,
		scale: number,
		flipX = false
	) =>
		Array.from({ length: loops }, (_, i): LayerDraw => ({
			tex,
			x: startX + width * i,
			y,
			scale,
			src: rect(tex),
			flipX
		}));
	const startOf = (parallax: number, width: number) =>
		Math.trunc(-ieeeRemainder(cameraX * parallax, width) - Math.trunc(width / 2));

	// On the menu the mountains sit 180 px lower (pushBGTopHack), the forest doesn't.
	const push = 180;
	const layout: ForestLayout = { far: [], near: [], trees: [] };

	// Step 1: the far mountains, tiled every 2048 px whatever their width.
	{
		const scale = 2;
		const width = Math.trunc(1024 * scale);
		const n = mountains[0];
		if (n >= 0) {
			const y = 100 + push + (LAYER_Y_OFFSET[n] ?? 0);
			layout.far = tiles(n, startOf(0.15, width), width, Math.trunc(W / width) + 2, y, scale);
		}
	}
	// Step 2: the near mountains.
	{
		const n = mountains[1];
		if (n > -1) {
			const scale = 1.15 * 2;
			const width = Math.trunc(size(n)[0] * scale) || 1;
			let loops = Math.trunc(W / width) + 2;
			if (n === 172) loops++;
			const y = 230 + push + (LAYER_Y_OFFSET[n] ?? 0);
			layout.near = tiles(n, startOf(0.2, width) - 500, width, loops, y, scale);
		}
	}

	// The forest (DrawSurfaceBG_Forest).
	const [t0, t1, t2] = trees;
	{
		let scale = 1.25;
		let parallax = 0.4;
		if (t0 === 91) [parallax, scale] = [0.27000001072883606, 1.2];
		if (t0 === 173) [parallax, scale] = [0.25, 1.3];
		if (t0 === 178) [parallax, scale] = [0.30000001192092896, 1.2];
		if (t0 === 184) [parallax, scale] = [0.25, 1.2];
		if (t0 === 282) scale = 1.4;
		scale *= 2;
		if (t0 >= 0) {
			// SetBackgroundOffsets runs again after the doubling, so its own scale wins.
			if (OFFSETS[t0]) {
				scale = OFFSETS[t0].scale ?? scale;
				parallax = OFFSETS[t0].parallax;
			}
			const width = Math.trunc(size(t0)[0] * scale);
			if (width === 0) return layout;
			const y = 320 + (TOP_NUDGE[t0] ?? 0);
			const loops = Math.trunc(W / width) + 2;
			const startX = startOf(parallax, width);
			// 173 is drawn with 251-254, a frame every 10 counts.
			const tex = t0 === 173 ? 251 + (Math.trunc(counter / 10) % 4) : t0;
			layout.trees.push(...tiles(t0, startX, width, loops, y, scale).map((d) => ({ ...d, tex })));
		}
	}
	if (t1 >= 0) {
		let scale = 1.31 * 2;
		let parallax = 0.43;
		if (OFFSETS[t1]) {
			scale = OFFSETS[t1].scale ?? scale;
			parallax = OFFSETS[t1].parallax;
		}
		const width = Math.trunc(size(t1)[0] * scale) || 1;
		const y = 400 + (TOP_NUDGE[t1] ?? 0);
		const flip = t1 === 51 || t1 === 54;
		layout.trees.push(
			...tiles(t1, startOf(parallax, width) - 80, width, Math.trunc(W / width) + 2, y, scale, flip)
		);
	}
	if (t2 >= 0) {
		let scale = 1.34 * 2;
		let parallax = 0.49;
		if (OFFSETS[t2]) {
			scale = OFFSETS[t2].scale ?? scale;
			parallax = OFFSETS[t2].parallax;
		}
		if (t0 === 91) [scale, parallax] = [1.3 * 2, 0.42];
		const width = Math.trunc(size(t2)[0] * scale) || 1;
		const y = 480 + (TOP_NUDGE[t2] ?? 0);
		layout.trees.push(
			...tiles(t2, startOf(parallax, width) - 120, width, Math.trunc(W / width) + 2, y, scale)
		);
	}
	return layout;
}
