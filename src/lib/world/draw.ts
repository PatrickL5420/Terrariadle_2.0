/**
 * Draws the little world like Terraria 1.4.5 does, in game pixels: walls and blocks (Main.DrawTiles) with
 * their cracks and miner's wobble (DrawTileCracks, HitTile.DrawFreshAnimations), trees' trunks
 * and their tops and branches (TileDrawing.DrawTrees, without the wind), dropped items
 * (Main.DrawItem), the player in its layers (PlayerDrawLayers, composite body) and dust. Lighting
 * is applied afterwards by the caller (see MiniWorld.svelte): per tile for walls and blocks, one
 * colour each for everything else. Textures are the game's (static/world).
 */
import {
	CHAIR,
	CLAY,
	DIRT,
	DOOR_CLOSED,
	DOOR_OPEN,
	FURNITURE,
	GRASS,
	isSolid,
	STONE,
	TABLE,
	TORCH,
	TREES,
	WOOD_BLOCK,
	WORK_BENCH
} from './framing';
import { TileObjectData } from './gen/game';
import { stats } from './item-check';
import type { RGB } from './light';
import { TileChanges } from './tiles';
import type { Scene } from './view';

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
	/** Tree trunks by tile: Tiles_5 (a column of 176 px per biome; the forest's is the first),
	 * and the sakura's and yellow willow's Tiles_596, Tiles_616. */
	trunks: Record<number, Img>;
	/** Tree_Tops_N and Tree_Branches_N, by tree style. */
	tops: Record<number, Img>;
	branches: Record<number, Img>;
	/** Flame_0: a torch's flame, drawn over it. */
	flame: Img;
	/** Walls by type: dirt (Wall_2), wood (Wall_4). */
	walls: Record<number, Img>;
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

/**
 * The tree styles drawn: the forest's (Tree_Tops_0, 6-10: WorldGen.GetCommonTreeFoliageData) and
 * the sakura's and yellow willow's (29, 30: GetVanityTreeFoliageData).
 */
const TREE_STYLES = [0, 6, 7, 8, 9, 10, 29, 30];

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
	const [clay, clayItem, trunk, sakura, willow, wood, acorn, axe, torch, torchItem, flame, planks] =
		await Promise.all(
			[
				'Tiles_40',
				'Item_133',
				'Tiles_5',
				'Tiles_596',
				'Tiles_616',
				'Item_9',
				'Item_27',
				'Item_3506',
				'Tiles_4',
				'Item_8',
				'Flame_0',
				'Tiles_30'
			].map(w)
		);
	const [woodWall, doorClosed, doorOpen, table, chair, bench, ...furnitureItems] =
		await Promise.all(
			[
				'Wall_4',
				'Tiles_10',
				'Tiles_11',
				'Tiles_14',
				'Tiles_15',
				'Tiles_18',
				'Item_25',
				'Item_32',
				'Item_34',
				'Item_36',
				'Item_93'
			].map(w)
		);
	const tops = await Promise.all(TREE_STYLES.map((n) => w(`Tree_Tops_${n}`)));
	const branches = await Promise.all(TREE_STYLES.map((n) => w(`Tree_Branches_${n}`)));
	return {
		tiles: {
			[DIRT]: tiles0,
			[STONE]: tiles1,
			[GRASS]: tiles2,
			[CLAY]: clay,
			[TORCH]: torch,
			[WOOD_BLOCK]: planks,
			[DOOR_CLOSED]: doorClosed,
			[DOOR_OPEN]: doorOpen,
			[TABLE]: table,
			[CHAIR]: chair,
			[WORK_BENCH]: bench
		},
		flame,
		trunks: { 5: trunk, 596: sakura, 616: willow },
		tops: Object.fromEntries(TREE_STYLES.map((n, i) => [n, tops[i]])),
		branches: Object.fromEntries(TREE_STYLES.map((n, i) => [n, branches[i]])),
		walls: { 2: wall, 4: woodWall },
		cracks,
		dust,
		items: {
			2: item2,
			3: item3,
			8: torchItem,
			9: wood,
			27: acorn,
			133: clayItem,
			3506: axe,
			3509: pickaxe,
			...Object.fromEntries([25, 32, 34, 36, 93].map((n, k) => [n, furnitureItems[k]]))
		},
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
	const [ox, oy] = origin;
	if (!rotation && scale === 1) {
		// Most sprites: no turning or scaling, so no saving and restoring the context.
		if (!flip) ctx.drawImage(img, sx, sy, sw, sh, x - ox, y - oy, sw, sh);
		else {
			ctx.scale(-1, 1);
			ctx.drawImage(img, sx, sy, sw, sh, -(x - ox + sw), y - oy, sw, sh);
			ctx.scale(-1, 1);
		}
		return;
	}
	ctx.save();
	ctx.translate(x, y);
	if (rotation) ctx.rotate(rotation);
	if (scale !== 1) ctx.scale(scale, scale);
	ctx.translate(-ox, -oy);
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

/** Walls and blocks in `view` (all of them by default). Lit per tile afterwards. */
export function drawTiles(ctx: CanvasRenderingContext2D, world: Scene, t: Textures, view?: View) {
	const { tiles } = world;
	const i0 = Math.max(0, view?.i0 ?? 0);
	const j0 = Math.max(0, view?.j0 ?? 0);
	const i1 = Math.min(tiles.width, view?.i1 ?? tiles.width);
	const j1 = Math.min(tiles.height, view?.j1 ?? tiles.height);

	// Walls (Main.DrawWalls): 32x32, overhanging their tile by 8 px a side.
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			const wall = tiles.wall[j * tiles.width + i];
			if (!wall) continue;
			const [fx, fy] = tiles.wallFrame(i, j);
			sprite(ctx, t.walls[wall] ?? t.walls[2], [fx, fy, 32, 32], i * 16 - 8, j * 16 - 8);
		}
	}

	// Tree trunks (and the stumps of their tops and branches): 20x20, 2 px over each side.
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			const type = tiles.at(i, j);
			if (!TREES.includes(type)) continue;
			const k = j * tiles.width + i;
			sprite(ctx, t.trunks[type], [tiles.frameX[k], tiles.frameY[k], 20, 20], i * 16 - 2, j * 16);
		}
	}

	// Torches: 20x20, 2 px over each side, 4 px lower under a block (TileDrawing.GetTileDrawData).
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			if (tiles.at(i, j) !== TORCH) continue;
			const k = j * tiles.width + i;
			const top = isSolid(tiles.at(i, j - 1)) ? 4 : 0;
			sprite(
				ctx,
				t.tiles[TORCH],
				[tiles.frameX[k], tiles.frameY[k], 20, 20],
				i * 16 - 2,
				j * 16 + top
			);
		}
	}

	// Furniture: each tile its own size on its sheet (16 wide; as high as its row of the object
	// is: TileObjectData.CoordinateHeights).
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			const type = tiles.at(i, j);
			if (!FURNITURE.includes(type)) continue;
			const k = j * tiles.width + i;
			const h = rowHeight(type, tiles.frameY[k]);
			sprite(ctx, t.tiles[type], [tiles.frameX[k], tiles.frameY[k], 16, h], i * 16, j * 16);
		}
	}

	// Blocks.
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			const type = tiles.at(i, j);
			if (!isSolid(type) || FURNITURE.includes(type)) continue;
			const k = j * tiles.width + i;
			sprite(ctx, t.tiles[type], [tiles.frameX[k], tiles.frameY[k], 16, 16], i * 16, j * 16);
		}
	}
}

/** Cracks on blocks being mined, and the miner's wobble (drawn over the tiles every frame). */
export function drawHits(ctx: CanvasRenderingContext2D, world: Scene, t: Textures) {
	const { tiles } = world;
	// Cracks on blocks being mined: four stages by damage (Main.DrawTileCracks).
	const crackRect = (damage: number, style: number): [number, number, number, number] => {
		const stage = damage >= 80 ? 3 : damage >= 60 ? 2 : damage >= 40 ? 1 : 0;
		return [style * 18, stage * 18, 16, 16];
	};
	const hits = world.hits;
	for (const h of hits) {
		const type = tiles.at(h.x, h.y);
		if (h.damage < 20 || !(isSolid(type) || TREES.includes(type))) continue;
		sprite(ctx, t.cracks, crackRect(h.damage, h.crackStyle), h.x * 16, h.y * 16);
	}
	// The miner's wobble: a block just hit swells and settles over 10 frames.
	for (const h of hits) {
		const type = tiles.at(h.x, h.y);
		if (h.damage < 20 || h.animationTimeElapsed >= 10 || !isSolid(type) || FURNITURE.includes(type))
			continue;
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

/** The height of a furniture tile's row on its sheet, from its frame (the object's data). */
function rowHeight(type: number, frameY: number): number {
	const d = TileObjectData.GetTileData_Int32_Int32_Int32(type, 0, 0);
	if (!d) return 16;
	let y = frameY % d.CoordinateFullHeight;
	for (const h of d.CoordinateHeights) {
		if (y < h + d.CoordinatePadding) return h;
		y -= h + d.CoordinatePadding;
	}
	return 16;
}

/**
 * Torches' flames (TileDrawing's tileFlame drawing for a Torch): 7 copies of Flame_0, each
 * nudged by Utils.RandomInt from a seed per torch that changes 12 times a second
 * (Main.TileFrameSeed), added on at 100/255, unlit (drawn after the lighting).
 */
export function drawFlames(
	ctx: CanvasRenderingContext2D,
	world: Scene,
	t: Textures,
	view: View,
	frameSeed: bigint
) {
	const { tiles } = world;
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	ctx.globalAlpha = 100 / 255;
	for (let j = Math.max(0, view.j0); j < Math.min(tiles.height, view.j1); j++)
		for (let i = Math.max(0, view.i0); i < Math.min(tiles.width, view.i1); i++) {
			if (tiles.at(i, j) !== TORCH) continue;
			const k = j * tiles.width + i;
			const top = isSolid(tiles.at(i, j - 1)) ? 4 : 0;
			const seed = { s: (frameSeed ^ ((BigInt(i) << 32n) | BigInt(j))) & MASK48 };
			for (let n = 0; n < 7; n++) {
				const dx = randomInt(seed, -10, 11) * 0.15;
				const dy = randomInt(seed, -10, 1) * 0.35;
				sprite(
					ctx,
					t.flame,
					[tiles.frameX[k], tiles.frameY[k], 20, 20],
					i * 16 - 2 + dx,
					j * 16 + top + dy
				);
			}
		}
	ctx.restore();
}

const MASK48 = 0xffffffffffffn;

/** Utils.RandomNextSeed: a 48-bit linear congruential step (like java.util.Random). */
export const nextSeed = (seed: bigint) => (seed * 25214903917n + 11n) & MASK48;

/** Utils.RandomInt(ref seed, min, max). */
function randomInt(seed: { s: bigint }, min: number, max: number): number {
	const range = max - min;
	const next31 = () => {
		seed.s = nextSeed(seed.s);
		return Number(seed.s >> 17n);
	};
	if ((range & -range) === range) return Number((BigInt(range) * BigInt(next31())) >> 31n) + min;
	let num: number;
	let num2: number;
	do {
		num = next31();
		num2 = num % range;
	} while (num - num2 + (range - 1) > 0x7fffffff);
	return num2 + min;
}

/**
 * Trees' tops and branches (TileDrawing.DrawTrees, still: no wind), each in its tile's light
 * (Lighting.GetColor); returns where each was drawn, for that.
 */
export function drawTrees(
	ctx: CanvasRenderingContext2D,
	world: Scene,
	t: Textures,
	view: View
): Lit[] {
	const { tiles } = world;
	const lit: Lit[] = [];
	// A top can reach 4 tiles either side and 6 up of its tile.
	const i0 = Math.max(0, view.i0 - 4);
	const i1 = Math.min(tiles.width, view.i1 + 4);
	const j0 = Math.max(0, view.j0);
	const j1 = Math.min(tiles.height, view.j1 + 6);
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			const type = tiles.at(i, j);
			if (!TREES.includes(type)) continue;
			const k = j * tiles.width + i;
			const fx = tiles.frameX[k];
			const fy = tiles.frameY[k];
			if (fy < 198 || fx < 22) continue;
			// WorldGen.GetTreeFrame: which of 3 looks.
			const frame = fy === 220 ? 1 : fy === 242 ? 2 : 0;
			// The foliage data: the style by the tree's kind (the grass under it is forest grass).
			const vanity = type !== TREES[0];
			const style = type === 596 ? 29 : type === 616 ? 30 : world.treeStyle;
			if (fx === 22) {
				const [w, h] = vanity ? [118, 96] : [80, 80];
				lit.push({ x: i * 16 + 8 - w / 2, y: j * 16 + 16 - h, w, h, i, j });
				sprite(ctx, t.tops[style], [frame * (w + 2), 0, w, h], i * 16 + 8, j * 16 + 16, [w / 2, h]);
			} else if (fx === 44) {
				lit.push({ x: i * 16 - 24, y: j * 16 - 12, w: 40, h: 40, i, j });
				sprite(ctx, t.branches[style], [0, frame * 42, 40, 40], i * 16 + 16, j * 16 + 12, [40, 24]);
			} else if (fx === 66) {
				lit.push({ x: i * 16, y: j * 16 - 12, w: 40, h: 40, i, j });
				sprite(ctx, t.branches[style], [42, frame * 42, 40, 40], i * 16, j * 16 + 18, [0, 30]);
			}
		}
	}
	return lit;
}

/**
 * Dropped items, the player and dust. Each is lit by one colour, its tile's
 * (Lighting.GetColor at its centre); returns where each was drawn, for that.
 */
export function drawThings(ctx: CanvasRenderingContext2D, world: Scene, t: Textures): Lit[] {
	const lit: Lit[] = [];
	const at = (x: number, y: number, r: number): Lit => ({
		x: Math.floor(x - r),
		y: Math.floor(y - r),
		w: r * 2,
		h: r * 2,
		i: Math.trunc(x / 16),
		j: Math.trunc(y / 16)
	});

	// Dropped items: standing on their hitbox, tilted as they move.
	// (A shaken tree can drop things there are no textures for here, such as coins and fruit:
	// they're picked up unseen.)
	for (const d of world.drops) {
		const img = t.items[d.item];
		if (!img) continue;
		lit.push(at(d.x + d.w / 2, d.y + d.h / 2, 12));
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
function drawPlayer(ctx: CanvasRenderingContext2D, world: Scene, t: Textures) {
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

	// 6. The item being swung, or held (one with a hold style, like a torch held up):
	// PlayerDrawLayers.DrawPlayer_27_HeldItem.
	const shown = p.lastVisualized.type;
	const swung = p.itemAnimation > 0 && stats(shown).useStyle !== 0;
	const held = !!stats(shown).holdStyle && p.lastVisualized.stack > 0;
	if ((swung || held) && t.items[shown]) {
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

/** The terrain cache's chunks: 8x8 tiles. */
const CHUNK = 8;

/**
 * The whole world's walls and blocks (drawTiles), drawn once onto a canvas of their own and
 * kept: only the chunks round tiles that changed are drawn again. Each frame copies the part in
 * view from it.
 */
export class Terrain {
	readonly canvas = document.createElement('canvas');
	#changes = new TileChanges(['type', 'active', 'frameX', 'frameY', 'wall', 'wallVariant']);

	/** Brings the canvas up to date with the world's tiles. */
	sync(world: Scene, t: Textures) {
		const { tiles } = world;
		const changed = this.#changes.take(tiles);
		const ctx = this.canvas.getContext('2d')!;
		if (changed === 'all') {
			this.canvas.width = tiles.width * 16;
			this.canvas.height = tiles.height * 16;
			ctx.imageSmoothingEnabled = false;
			drawTiles(ctx, world, t);
			return;
		}
		if (!changed.length) return;
		// A tile's sprite reaches into the tiles beside it (walls overhang them by half a tile, a
		// torch hangs lower under a block), and theirs depend on it (a wall's frame on the walls
		// round it): what's drawn can change up to 2 tiles away, so those chunks too.
		const cw = Math.ceil(tiles.width / CHUNK);
		const dirty = new Set<number>();
		for (const k of changed) {
			const i = k % tiles.width;
			const j = (k - i) / tiles.width;
			for (const cj of [Math.floor((j - 2) / CHUNK), Math.floor((j + 2) / CHUNK)])
				for (const ci of [Math.floor((i - 2) / CHUNK), Math.floor((i + 2) / CHUNK)])
					if (ci >= 0 && cj >= 0) dirty.add(cj * cw + ci);
		}
		for (const c of dirty) {
			const i0 = (c % cw) * CHUNK;
			const j0 = Math.floor(c / cw) * CHUNK;
			ctx.save();
			ctx.beginPath();
			ctx.rect(i0 * 16, j0 * 16, CHUNK * 16, CHUNK * 16);
			ctx.clip();
			ctx.clearRect(i0 * 16, j0 * 16, CHUNK * 16, CHUNK * 16);
			// Everything whose sprite can reach into the chunk.
			drawTiles(ctx, world, t, { i0: i0 - 2, j0: j0 - 2, i1: i0 + CHUNK + 2, j1: j0 + CHUNK + 2 });
			ctx.restore();
		}
	}
}
