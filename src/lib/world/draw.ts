/**
 * Draws the little world like Terraria 1.4.5 does, in game pixels: walls and blocks (Main.DrawTiles) with
 * their cracks and miner's wobble (DrawTileCracks, HitTile.DrawFreshAnimations), dropped items
 * (Main.DrawItem), the player in its layers (PlayerDrawLayers, composite body) and dust. Lighting
 * is applied afterwards by the caller (see MiniWorld.svelte): per tile for walls and blocks, one
 * colour each for everything else. Textures are the game's (static/world).
 */
import { DIRT, GRASS, isSolid, STONE } from './framing';
import { stats } from './item-check';
import type { RGB } from './light';
import type { World } from './sim';

type Img = HTMLImageElement | HTMLCanvasElement;

/** A default player's colours (Player.ResetVisuals... the new-character defaults). */
const COLORS = {
	hair: [215, 90, 55],
	skin: [255, 125, 90],
	eyes: [105, 90, 75],
	shirt: [175, 165, 140],
	undershirt: [160, 180, 215],
	pants: [255, 230, 175],
	shoes: [160, 105, 60],
	white: [255, 255, 255]
} satisfies Record<string, RGB>;

/** Player_0_N: which colour each sheet is drawn in. */
const SHEETS: Record<number, keyof typeof COLORS> = {
	0: 'skin', // head
	1: 'white', // eye whites
	2: 'eyes',
	3: 'skin', // torso
	4: 'undershirt',
	5: 'skin', // hands
	6: 'shirt',
	7: 'skin', // arms
	8: 'undershirt', // undershirt sleeves
	10: 'skin', // legs
	11: 'pants',
	12: 'shoes',
	13: 'shirt', // shirt sleeves
	15: 'skin' // eyelids
};

/** Main.OffsetsPlayerHeadgear's Y per body frame: the body bobs 2 px as the legs move. */
const HEADGEAR_Y = [2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2];
/** PlayerDrawSet.CreateCompositeData: the front arm's frame (column, row) per body frame. */
const FRONT_ARM: [number, number][] = [
	[2, 0],
	[3, 0],
	[4, 0],
	[5, 0],
	[6, 0],
	[2, 1],
	[3, 1],
	[4, 1],
	[4, 1],
	[4, 1],
	[4, 1],
	[3, 1],
	[3, 1],
	[3, 1],
	[5, 1],
	[6, 1],
	[6, 1],
	[5, 1],
	[3, 1],
	[3, 1]
];

export interface Textures {
	tiles: Record<number, Img>;
	wall: Img;
	cracks: Img;
	dust: Img;
	items: Record<number, Img>;
	player: Record<number, Img>;
	hair: Img;
}

function load(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

/** SpriteBatch's colour: the texture times a colour, done once up front. */
function tint(img: HTMLImageElement, [r, g, b]: RGB): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = img.naturalWidth;
	c.height = img.naturalHeight;
	const ctx = c.getContext('2d')!;
	ctx.drawImage(img, 0, 0);
	const data = ctx.getImageData(0, 0, c.width, c.height);
	const px = data.data;
	for (let i = 0; i < px.length; i += 4) {
		px[i] = (px[i] * r) / 255;
		px[i + 1] = (px[i + 1] * g) / 255;
		px[i + 2] = (px[i + 2] * b) / 255;
	}
	ctx.putImageData(data, 0, 0);
	return c;
}

export async function loadTextures(): Promise<Textures> {
	const w = (name: string) => load(`/world/${name}.png`);
	const [tiles0, tiles1, tiles2, wall, cracks, dust, item2, item3, pickaxe, hair] =
		await Promise.all([
			w('Tiles_0'),
			w('Tiles_1'),
			w('Tiles_2'),
			w('Wall_2'),
			w('TileCracks'),
			load('/ui/dust/Dust.png'),
			w('Item_2'),
			w('Item_3'),
			w('Item_3509'),
			w('Player_Hair_1')
		]);
	const sheets = Object.keys(SHEETS).map(Number);
	const player = await Promise.all(sheets.map((n) => w(`Player_0_${n}`)));
	return {
		tiles: { [DIRT]: tiles0, [STONE]: tiles1, [GRASS]: tiles2 },
		wall,
		cracks,
		dust,
		items: { 2: item2, 3: item3, 3509: pickaxe },
		player: Object.fromEntries(sheets.map((n, i) => [n, tint(player[i], COLORS[SHEETS[n]])])),
		hair: tint(hair, COLORS.hair)
	};
}

/**
 * SpriteBatch.Draw: `src` of `img` with its `origin` at (x, y), turned by `rotation`, scaled, and
 * mirrored left-right if `flip` (the origin is where it lands in the mirrored sprite, like XNA).
 */
function sprite(
	ctx: CanvasRenderingContext2D,
	img: Img,
	[sx, sy, sw, sh]: [number, number, number, number],
	x: number,
	y: number,
	origin: [number, number] = [0, 0],
	rotation = 0,
	scale = 1,
	flip = false
) {
	ctx.save();
	ctx.translate(x, y);
	if (rotation) ctx.rotate(rotation);
	if (scale !== 1) ctx.scale(scale, scale);
	ctx.translate(-origin[0], -origin[1]);
	if (flip) {
		ctx.translate(sw, 0);
		ctx.scale(-1, 1);
	}
	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
	ctx.restore();
}

/** Something drawn in one light: the area it covers and the tile its light comes from. */
export interface Lit {
	x: number;
	y: number;
	w: number;
	h: number;
	i: number;
	j: number;
}

/** The tiles in view: columns i0 to i1 and rows j0 to j1 (exclusive). */
export interface View {
	i0: number;
	j0: number;
	i1: number;
	j1: number;
}

/** Walls and blocks in `view` (all of them by default), with cracks. Lit per tile afterwards. */
export function drawTiles(ctx: CanvasRenderingContext2D, world: World, t: Textures, view?: View) {
	const { tiles } = world;
	const i0 = Math.max(0, view?.i0 ?? 0);
	const j0 = Math.max(0, view?.j0 ?? 0);
	const i1 = Math.min(tiles.width, view?.i1 ?? tiles.width);
	const j1 = Math.min(tiles.height, view?.j1 ?? tiles.height);

	// Walls (Main.DrawWalls): 32x32, overhanging their tile by 8 px a side.
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			if (!tiles.wall[j * tiles.width + i]) continue;
			const [fx, fy] = tiles.wallFrame(i, j);
			sprite(ctx, t.wall, [fx, fy, 32, 32], i * 16 - 8, j * 16 - 8);
		}
	}

	// Blocks.
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			const type = tiles.at(i, j);
			if (!isSolid(type)) continue;
			const k = j * tiles.width + i;
			sprite(ctx, t.tiles[type], [tiles.frameX[k], tiles.frameY[k], 16, 16], i * 16, j * 16);
		}
	}

	// Cracks on blocks being mined: four stages by damage (Main.DrawTileCracks).
	const crackRect = (damage: number, style: number): [number, number, number, number] => {
		const stage = damage >= 80 ? 3 : damage >= 60 ? 2 : damage >= 40 ? 1 : 0;
		return [style * 18, stage * 18, 16, 16];
	};
	const hits = [...world.player.hitTile.blocks()];
	for (const h of hits) {
		if (h.damage < 20 || !isSolid(tiles.at(h.x, h.y))) continue;
		sprite(ctx, t.cracks, crackRect(h.damage, h.crackStyle), h.x * 16, h.y * 16);
	}
	// The miner's wobble: a block just hit swells and settles over 10 frames.
	for (const h of hits) {
		const type = tiles.at(h.x, h.y);
		if (h.damage < 20 || h.animationTimeElapsed >= 10 || !isSolid(type)) continue;
		const time = h.animationTimeElapsed / 10;
		let wave = (time % 0.5) * 2;
		if (Math.trunc(time / 0.5) % 2 === 1) wave = 1 - wave;
		const scale = wave * 0.2 + 1;
		const k = h.y * tiles.width + h.x;
		const [cx, cy, cw, ch] = crackRect(h.damage, h.crackStyle);
		ctx.globalAlpha = 0.8;
		sprite(
			ctx,
			t.tiles[type],
			[tiles.frameX[k], tiles.frameY[k], 16, 16],
			h.x * 16 + 8,
			h.y * 16 + 8,
			[8, 8],
			0,
			scale
		);
		// The crack's rectangle shrunk by 2 px a side (Rectangle.Inflate(-2, -2)).
		sprite(
			ctx,
			t.cracks,
			[cx + 2, cy + 2, cw - 4, ch - 4],
			h.x * 16 + 8,
			h.y * 16 + 8,
			[8, 8],
			0,
			scale
		);
		ctx.globalAlpha = 1;
	}
}

/**
 * Dropped items, the player and dust. Each is lit by one colour, its tile's
 * (Lighting.GetColor at its centre); returns where each was drawn, for that.
 */
export function drawThings(ctx: CanvasRenderingContext2D, world: World, t: Textures): Lit[] {
	const lit: Lit[] = [];
	const at = (x: number, y: number, r: number): Lit => ({
		x: Math.floor(x - r),
		y: Math.floor(y - r),
		w: r * 2,
		h: r * 2,
		i: Math.trunc(x / 16),
		j: Math.trunc(y / 16)
	});

	// Dropped blocks: standing on their hitbox, tilted as they move.
	for (const d of world.drops) {
		lit.push(at(d.x + d.w / 2, d.y + d.h / 2, 12));
		const img = t.items[d.item];
		const fw = img.width;
		const fh = img.height;
		sprite(
			ctx,
			img,
			[0, 0, fw, fh],
			d.x + d.w / 2,
			d.y + d.h - fh / 2,
			[fw / 2, fh / 2],
			d.vx * 0.2
		);
	}

	// The player, and what it holds, all in the light at its centre.
	const c = world.player.center;
	lit.push(at(c.x, c.y + world.player.gfxOffY, 48));
	drawPlayer(ctx, world, t);

	// Dust.
	for (const d of world.dust) {
		lit.push(at(d.x, d.y, 6));
		sprite(ctx, t.dust, [d.type * 10, d.frame * 10, 8, 8], d.x, d.y, [4, 4], d.rotation, d.scale);
	}
	return lit;
}

/** PlayerDrawLayers for a player in default clothes, with the composite body. */
function drawPlayer(ctx: CanvasRenderingContext2D, world: World, t: Textures) {
	const p = world.player;
	const flip = p.direction === -1;
	const sheet = t.player;
	// The top-left of the 40x56 frame (PlayerDrawSet: Position plus gfxOffY).
	const x = Math.trunc(p.x - 20 + p.w / 2);
	const y = Math.trunc(p.y + p.gfxOffY + p.h - 56 + 4);
	const body = p.bodyFrame;
	const torsoY = y + HEADGEAR_Y[body] - 2;
	const strip = (img: Img, frame: number, dy = y) =>
		sprite(ctx, img, [0, frame * 56, 40, 56], x, dy, [0, 0], 0, 1, flip);
	const comp = (img: Img, [cx, cy]: [number, number]) =>
		sprite(ctx, img, [cx * 40, cy * 56, 40, 56], x, torsoY, [0, 0], 0, 1, flip);

	const torso: [number, number] = body === 5 ? [1, 0] : [0, 0];
	const frontArm = FRONT_ARM[body];
	const backArm: [number, number] = [frontArm[0], frontArm[1] + 2];
	const shoulderOverArm = body !== 1 && body !== 2 && body !== 5;

	// 1. Skin: torso and legs.
	comp(sheet[3], torso);
	strip(sheet[10], p.legFrame);
	// 2. The back arm and its sleeve.
	for (const n of [7, 5, 8, 13]) comp(sheet[n], backArm);
	// 3. Trousers and shoes.
	strip(sheet[11], p.legFrame);
	strip(sheet[12], p.legFrame);
	// 4. The shirt: the back shoulder, then the torso.
	comp(sheet[4], [1, 1]);
	comp(sheet[6], [1, 1]);
	comp(sheet[4], torso);
	comp(sheet[6], torso);
	// 5. The head: skin, eyes, eyelids, hair (whose frames sit 6 frames up the sheet).
	strip(sheet[0], body);
	strip(sheet[1], body);
	strip(sheet[2], body);
	if (p.eyeFrame)
		sprite(ctx, sheet[15], [0, p.eyeFrame * 56, 40, 56], x, torsoY, [0, 0], 0, 1, flip);
	const hairY = Math.max(0, body * 56 - 336);
	sprite(ctx, t.hair, [0, hairY, 40, 54], x, y, [0, 0], 0, 1, flip);

	// 6. The item being swung.
	const shown = p.lastVisualized.type;
	if (p.itemAnimation > 0 && t.items[shown]) {
		const img = t.items[shown];
		const w = img.width;
		const h = img.height;
		sprite(
			ctx,
			img,
			[0, 0, w, h],
			Math.trunc(p.itemLocation.x),
			Math.trunc(p.itemLocation.y + p.gfxOffY),
			[w * 0.5 - w * 0.5 * p.direction, h],
			p.itemRotation,
			stats(shown).scale,
			flip
		);
	}

	// 7. The front arm over the item, with the front shoulder above or below it.
	const shoulder = () => {
		for (const n of [7, 8, 13, 6]) comp(sheet[n], [0, 1]);
	};
	const arm = () => {
		for (const n of [7, 8, 13, 6]) comp(sheet[n], frontArm);
	};
	if (shoulderOverArm) {
		arm();
		shoulder();
	} else {
		shoulder();
		arm();
	}
}
