/**
 * Draws the little world like Terraria 1.4.5 does, with the game's SpriteBatch ($lib/gl/sprites):
 * walls and blocks (Main.DrawTiles) with their cracks and miner's wobble (DrawTileCracks,
 * HitTile.DrawFreshAnimations), torches' flames, trees' trunks and their tops and branches
 * (TileDrawing.DrawTrees, without the wind), dropped items (Main.DrawItem), the player in its
 * layers (PlayerDrawLayers, composite body) and dust. Positions are in world pixels (the
 * renderer's transform is the camera).
 *
 * Light: walls and blocks are drawn in the light map's light at each pixel (the "lit" program,
 * smoothed between tiles' centres); everything else in one colour, its tile's
 * (Lighting.GetColor), like the game. Textures are the game's (static/world).
 */
import {
	loadTexture,
	type Color,
	type RGB,
	type SpriteRenderer,
	type Texture
} from '$lib/gl/sprites';
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
import { initObjectData } from './gen';
import { TileObjectData } from './gen/game';
import { stats } from './item-check';
import type { LightMap } from './light';
import type { Scene } from './view';

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
	tiles: Record<number, Texture>;
	/** Tree trunks by tile: Tiles_5 (a column of 176 px per biome; the forest's is the first),
	 * and the sakura's and yellow willow's Tiles_596, Tiles_616. */
	trunks: Record<number, Texture>;
	/** Tree_Tops_N and Tree_Branches_N, by tree style. */
	tops: Record<number, Texture>;
	branches: Record<number, Texture>;
	/** Flame_0: a torch's flame, drawn over it. */
	flame: Texture;
	/** Walls by type: dirt (Wall_2), wood (Wall_4). */
	walls: Record<number, Texture>;
	cracks: Texture;
	dust: Texture;
	items: Record<number, Texture>;
	/** Player_0_N, drawn in its colour (SHEETS). */
	player: Record<number, Texture>;
	hair: Texture;
}

/**
 * The tree styles drawn: the forest's (Tree_Tops_0, 6-10: WorldGen.GetCommonTreeFoliageData) and
 * the sakura's and yellow willow's (29, 30: GetVanityTreeFoliageData).
 */
const TREE_STYLES = [0, 6, 7, 8, 9, 10, 29, 30];
const ITEMS = [2, 3, 8, 9, 25, 27, 32, 34, 36, 93, 133, 3506, 3509];

export async function loadTextures(r: SpriteRenderer): Promise<Textures> {
	const all = async (names: string[]) =>
		Object.fromEntries(
			await Promise.all(names.map(async (n) => [n, await loadTexture(r, `/world/${n}.png`)]))
		) as Record<string, Texture>;
	const sheets = Object.keys(SHEETS).map(Number);
	const tex = await all([
		...[0, 1, 2, 4, 5, 10, 11, 14, 15, 18, 30, 40, 596, 616].map((n) => `Tiles_${n}`),
		'Wall_2',
		'Wall_4',
		'TileCracks',
		'Flame_0',
		'Player_Hair_1',
		...ITEMS.map((n) => `Item_${n}`),
		...sheets.map((n) => `Player_0_${n}`),
		...TREE_STYLES.flatMap((n) => [`Tree_Tops_${n}`, `Tree_Branches_${n}`])
	]);
	const tile = (n: number) => tex[`Tiles_${n}`];
	const byStyle = (kind: string) =>
		Object.fromEntries(TREE_STYLES.map((n) => [n, tex[`Tree_${kind}_${n}`]]));
	return {
		tiles: Object.fromEntries(
			[
				DIRT,
				STONE,
				GRASS,
				CLAY,
				TORCH,
				WOOD_BLOCK,
				DOOR_CLOSED,
				DOOR_OPEN,
				TABLE,
				CHAIR,
				WORK_BENCH
			].map((n) => [n, tile(n)])
		),
		flame: tex.Flame_0,
		trunks: { 5: tile(5), 596: tile(596), 616: tile(616) },
		tops: byStyle('Tops'),
		branches: byStyle('Branches'),
		walls: { 2: tex.Wall_2, 4: tex.Wall_4 },
		cracks: tex.TileCracks,
		dust: await loadTexture(r, '/ui/dust/Dust.png'),
		items: Object.fromEntries(ITEMS.map((n) => [n, tex[`Item_${n}`]])),
		player: Object.fromEntries(sheets.map((n) => [n, tex[`Player_0_${n}`]])),
		hair: tex.Player_Hair_1
	};
}

/** The tiles in view: columns i0 to i1 and rows j0 to j1 (exclusive). */
export interface View {
	i0: number;
	j0: number;
	i1: number;
	j1: number;
}

const WHITE: RGB = [255, 255, 255];

/** A colour times a light (both bytes), as SpriteBatch's colour times Lighting.GetColor. */
const times = (c: RGB, [r, g, b]: RGB): RGB => [
	Math.trunc((c[0] * r) / 255),
	Math.trunc((c[1] * g) / 255),
	Math.trunc((c[2] * b) / 255)
];

/**
 * The world in `view`, its camera already set (the renderer's transform), its light map in
 * `light` (lightTexture). `frameSeed` is Main.TileFrameSeed, for the flames' flicker.
 */
export function drawWorld(
	r: SpriteRenderer,
	world: Scene,
	t: Textures,
	view: View,
	light: Texture,
	frameSeed: bigint
) {
	r.light = light;
	r.lightSize = [world.width * 16, world.height * 16];
	r.use('lit');
	drawTiles(r, world, t, view);
	drawHits(r, world, t);
	r.use('sprite');
	drawFlames(r, world, t, view, frameSeed);
	drawTrees(r, world, t, view);
	drawThings(r, world, t);
	r.flush();
}

/** The light map as bytes for a texture (a texel per tile, rows down), for the lit program. */
export function lightBytes(light: LightMap, out?: Uint8Array): Uint8Array {
	const { width: W, height: H } = light;
	const bytes = out ?? new Uint8Array(W * H * 4);
	for (let i = 0; i < W; i++)
		for (let j = 0; j < H; j++) {
			const [r, g, b] = light.color(i, j);
			const k = (j * W + i) * 4;
			bytes[k] = r;
			bytes[k + 1] = g;
			bytes[k + 2] = b;
			bytes[k + 3] = 255;
		}
	return bytes;
}

/** Walls and blocks in `view` (all of them by default), in `r`'s current program. */
export function drawTiles(r: SpriteRenderer, world: Scene, t: Textures, view?: View) {
	const { tiles } = world;
	const i0 = Math.max(0, view?.i0 ?? 0);
	const j0 = Math.max(0, view?.j0 ?? 0);
	const i1 = Math.min(tiles.width, view?.i1 ?? tiles.width);
	const j1 = Math.min(tiles.height, view?.j1 ?? tiles.height);
	const { frameX, frameY } = tiles;

	// Walls (Main.DrawWalls): 32x32, overhanging their tile by 8 px a side.
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			const wall = tiles.wall[j * tiles.width + i];
			if (!wall) continue;
			const [fx, fy] = tiles.wallFrame(i, j);
			r.blit(t.walls[wall] ?? t.walls[2], i * 16 - 8, j * 16 - 8, WHITE, fx, fy, 32, 32);
		}
	}

	// Tree trunks (and the stumps of their tops and branches): 20x20, 2 px over each side.
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			const type = tiles.at(i, j);
			if (!TREES.includes(type)) continue;
			const k = j * tiles.width + i;
			r.blit(t.trunks[type], i * 16 - 2, j * 16, WHITE, frameX[k], frameY[k], 20, 20);
		}
	}

	// Torches: 20x20, 2 px over each side, 4 px lower under a block (TileDrawing.GetTileDrawData).
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			if (tiles.at(i, j) !== TORCH) continue;
			const k = j * tiles.width + i;
			const top = isSolid(tiles.at(i, j - 1)) ? 4 : 0;
			r.blit(t.tiles[TORCH], i * 16 - 2, j * 16 + top, WHITE, frameX[k], frameY[k], 20, 20);
		}
	}

	// Furniture: each tile its own size on its sheet (16 wide; as high as its row of the object
	// is: TileObjectData.CoordinateHeights).
	for (let j = j0; j < j1; j++) {
		for (let i = i0; i < i1; i++) {
			const type = tiles.at(i, j);
			if (!FURNITURE.includes(type)) continue;
			const k = j * tiles.width + i;
			const h = rowHeight(type, frameY[k]);
			r.blit(t.tiles[type], i * 16, j * 16, WHITE, frameX[k], frameY[k], 16, h);
		}
	}

	// Blocks (they don't overlap, so each kind is drawn in one go).
	for (const type of BLOCK_TYPES)
		for (let j = j0; j < j1; j++)
			for (let i = i0; i < i1; i++) {
				if (tiles.at(i, j) !== type) continue;
				const k = j * tiles.width + i;
				r.blit(t.tiles[type], i * 16, j * 16, WHITE, frameX[k], frameY[k], 16, 16);
			}
}

/** The blocks there are (solid, not furniture). */
const BLOCK_TYPES = [DIRT, STONE, GRASS, CLAY, WOOD_BLOCK];

/** Cracks on blocks being mined, and the miner's wobble (over the tiles, in their light). */
export function drawHits(r: SpriteRenderer, world: Scene, t: Textures) {
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
		r.blit(t.cracks, h.x * 16, h.y * 16, WHITE, ...crackRect(h.damage, h.crackStyle));
	}
	// The miner's wobble: a block just hit swells and settles over 10 frames, at 80% alpha.
	const faded: Color = [204, 204, 204, 204];
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
		const at = { origin: [8, 8] as [number, number], scale };
		r.draw(t.tiles[type], h.x * 16 + 8, h.y * 16 + 8, faded, {
			...at,
			src: [tiles.frameX[k], tiles.frameY[k], 16, 16]
		});
		// The crack's rectangle shrunk by 2 px a side (Rectangle.Inflate(-2, -2)).
		r.draw(t.cracks, h.x * 16 + 8, h.y * 16 + 8, faded, {
			...at,
			src: [cx + 2, cy + 2, cw - 4, ch - 4]
		});
	}
}

/** The height of a furniture tile's row on its sheet, from its frame (the object's data). */
function rowHeight(type: number, frameY: number): number {
	initObjectData();
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
 * (Main.TileFrameSeed), in Color(100, 100, 100, 0): added on, unlit.
 */
export function drawFlames(
	r: SpriteRenderer,
	world: Scene,
	t: Textures,
	view: View,
	frameSeed: bigint
) {
	const { tiles } = world;
	const glow: Color = [100, 100, 100, 0];
	for (let j = Math.max(0, view.j0); j < Math.min(tiles.height, view.j1); j++)
		for (let i = Math.max(0, view.i0); i < Math.min(tiles.width, view.i1); i++) {
			if (tiles.at(i, j) !== TORCH) continue;
			const k = j * tiles.width + i;
			const top = isSolid(tiles.at(i, j - 1)) ? 4 : 0;
			const seed = { s: (frameSeed ^ ((BigInt(i) << 32n) | BigInt(j))) & MASK48 };
			for (let n = 0; n < 7; n++) {
				const dx = randomInt(seed, -10, 11) * 0.15;
				const dy = randomInt(seed, -10, 1) * 0.35;
				r.blit(
					t.flame,
					i * 16 - 2 + dx,
					j * 16 + top + dy,
					glow,
					tiles.frameX[k],
					tiles.frameY[k],
					20,
					20
				);
			}
		}
}

/** Trees' tops and branches (TileDrawing.DrawTrees, still: no wind), each in its tile's light. */
export function drawTrees(r: SpriteRenderer, world: Scene, t: Textures, view: View) {
	const { tiles, light } = world;
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
			const lit = light.color(i, j);
			if (fx === 22) {
				const [w, h] = vanity ? [118, 96] : [80, 80];
				r.blit(t.tops[style], i * 16 + 8 - w / 2, j * 16 + 16 - h, lit, frame * (w + 2), 0, w, h);
			} else if (fx === 44) {
				r.blit(t.branches[style], i * 16 - 24, j * 16 - 12, lit, 0, frame * 42, 40, 40);
			} else if (fx === 66) {
				r.blit(t.branches[style], i * 16, j * 16 - 12, lit, 42, frame * 42, 40, 40);
			}
		}
	}
}

/** Dropped items, the player and dust, each in the light at its centre (Lighting.GetColor). */
export function drawThings(r: SpriteRenderer, world: Scene, t: Textures) {
	const lit = (x: number, y: number) => world.light.color(Math.trunc(x / 16), Math.trunc(y / 16));

	// Dropped items: standing on their hitbox, tilted as they move.
	// (A shaken tree can drop things there are no textures for here, such as coins and fruit:
	// they're picked up unseen.)
	for (const d of world.drops) {
		const img = t.items[d.item];
		if (!img) continue;
		const fw = img.width;
		const fh = img.height;
		r.draw(img, d.x + d.w / 2, d.y + d.h - fh / 2, lit(d.x + d.w / 2, d.y + d.h / 2), {
			origin: [fw / 2, fh / 2],
			rotation: d.vx * 0.2
		});
	}

	// The player, and what it holds, all in the light at its centre.
	const c = world.player.center;
	drawPlayer(r, world, t, lit(c.x, c.y + world.player.gfxOffY));

	// Dust.
	for (const d of world.dust)
		r.draw(t.dust, d.x, d.y, lit(d.x, d.y), {
			src: [d.type * 10, d.frame * 10, 8, 8],
			origin: [4, 4],
			rotation: d.rotation,
			scale: d.scale
		});
}

/** PlayerDrawLayers for a player in default clothes, with the composite body, in `light`. */
function drawPlayer(r: SpriteRenderer, world: Scene, t: Textures, light: RGB) {
	const p = world.player;
	const flip = p.direction === -1;
	const sheet = t.player;
	const color = (n: number) => times(COLORS[SHEETS[n]], light);
	// The top-left of the 40x56 frame (PlayerDrawSet: Position plus gfxOffY).
	const x = Math.trunc(p.x - 20 + p.w / 2);
	const y = Math.trunc(p.y + p.gfxOffY + p.h - 56 + 4);
	const body = p.bodyFrame;
	const torsoY = y + HEADGEAR_Y[body] - 2;
	const strip = (n: number, frame: number) =>
		r.blit(sheet[n], x, y, color(n), 0, frame * 56, 40, 56, flip);
	const comp = (n: number, [cx, cy]: [number, number]) =>
		r.blit(sheet[n], x, torsoY, color(n), cx * 40, cy * 56, 40, 56, flip);

	const torso: [number, number] = body === 5 ? [1, 0] : [0, 0];
	const frontArm = FRONT_ARM[body];
	const backArm: [number, number] = [frontArm[0], frontArm[1] + 2];
	const shoulderOverArm = body !== 1 && body !== 2 && body !== 5;

	// 1. Skin: torso and legs.
	comp(3, torso);
	strip(10, p.legFrame);
	// 2. The back arm and its sleeve.
	for (const n of [7, 5, 8, 13]) comp(n, backArm);
	// 3. Trousers and shoes.
	strip(11, p.legFrame);
	strip(12, p.legFrame);
	// 4. The shirt: the back shoulder, then the torso.
	comp(4, [1, 1]);
	comp(6, [1, 1]);
	comp(4, torso);
	comp(6, torso);
	// 5. The head: skin, eyes, eyelids, hair (whose frames sit 6 frames up the sheet).
	strip(0, body);
	strip(1, body);
	strip(2, body);
	if (p.eyeFrame) r.blit(sheet[15], x, torsoY, color(15), 0, p.eyeFrame * 56, 40, 56, flip);
	const hairY = Math.max(0, body * 56 - 336);
	r.blit(t.hair, x, y, times(COLORS.hair, light), 0, hairY, 40, 54, flip);

	// 6. The item being swung, or held (one with a hold style, like a torch held up):
	// PlayerDrawLayers.DrawPlayer_27_HeldItem.
	const shown = p.lastVisualized.type;
	const swung = p.itemAnimation > 0 && stats(shown).useStyle !== 0;
	const held = !!stats(shown).holdStyle && p.lastVisualized.stack > 0;
	if ((swung || held) && t.items[shown]) {
		const img = t.items[shown];
		const w = img.width;
		const h = img.height;
		r.draw(img, Math.trunc(p.itemLocation.x), Math.trunc(p.itemLocation.y + p.gfxOffY), light, {
			origin: [w * 0.5 - w * 0.5 * p.direction, h],
			rotation: p.itemRotation,
			scale: stats(shown).scale,
			flipX: flip
		});
	}

	// 7. The front arm over the item, with the front shoulder above or below it.
	const shoulder = () => {
		for (const n of [7, 8, 13, 6]) comp(n, [0, 1]);
	};
	const arm = () => {
		for (const n of [7, 8, 13, 6]) comp(n, frontArm);
	};
	if (shoulderOverArm) {
		arm();
		shoulder();
	} else {
		shoulder();
		arm();
	}
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
