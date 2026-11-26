/**
 * Using an item: Terraria 1.4.5's Player.ItemCheck, ported line by line for the items this
 * little world has (the Copper Pickaxe and Copper Axe, dirt, stone and clay blocks, and an empty
 * hand once a stack is used up), with what it reaches for them:
 *
 *   ItemCheck_AutoReuseLogic        holding the button swings again, a frame early
 *   ItemCheck_StartActualUse        the swing starts (ApplyItemAnimation; the use sound)
 *   ItemCheck_ApplyUseStyle         useStyle 1: where the item is held and how it's turned
 *   ItemCheck_UseMiningTools        a pickaxe on blocks (Player.PickTile), an axe on trees, ->
 *                                   WorldGen.KillTile (./hit-tile for the damage)
 *   PlaceThing_Tiles                WorldGen.PlaceTile, and grass under a block knocked to dirt
 *   the stack used up               one block per placement
 *
 * in the game's order, every float rounded to a single (`f`) as the game computes. WorldGen's
 * own code (KillTile, CanKillTile, and the trees' CheckTree and drops) is the game's, converted
 * by tools/verify/port (./gen), working on the same tiles. Everything
 * else ItemCheck does (weapons, wands, buckets, wiring, pets...) starts with a check for its
 * own items and does nothing for these. tools/verify compares this with the game's own
 * ItemCheck, frame by frame.
 *
 * Left out because it can't happen here: mounts, slopes and half blocks, liquids, other
 * players and NPCs, and swapping blocks (placing onto a block with a pickaxe in the inventory:
 * this player only places into the open).
 */
import { f } from './collision';
import {
	AIR,
	FRAME_IMPORTANT,
	GRASS,
	isSolid,
	TORCH,
	TREES,
	WOOD_BLOCK,
	type TileGrid
} from './framing';
import { holding, WorldGen } from './gen';
import { TileObject, TileObjectData } from './gen/game';
import { Rt } from './gen/runtime';
import { HitTile, TILE } from './hit-tile';
import type { Player } from './player';

/** An inventory slot: an item type (0 for none) and how many. */
export interface Item {
	type: number;
	stack: number;
}

/** What Item.SetDefaults gives these items (tools/verify checks them against the game's). */
export interface ItemStats {
	useStyle: number;
	useAnimation: number;
	useTime: number;
	autoReuse: boolean;
	useTurn: boolean;
	consumable: boolean;
	/** The block it places, or -1. */
	createTile: number;
	/** Pick power. */
	pick: number;
	/** Axe power. */
	axe: number;
	tileBoost: number;
	scale: number;
	/** How it's held when not in use: 1 held up, like a torch. */
	holdStyle?: number;
	/** Item.UseSound: [sound type, style] (SoundID.Item1 is [2, 1]). */
	useSound?: [number, number];
	/** Item.GetDrawHitbox: its texture's size, which places it in the hand. */
	frame: [number, number];
}

const NONE: ItemStats = {
	useStyle: 0,
	useAnimation: 100,
	useTime: 100,
	autoReuse: false,
	useTurn: false,
	consumable: false,
	createTile: -1,
	pick: 0,
	axe: 0,
	tileBoost: 0,
	scale: 1,
	frame: [0, 0]
};
const BLOCK: ItemStats = {
	...NONE,
	useStyle: 1,
	useAnimation: 15,
	useTime: 10,
	autoReuse: true,
	useTurn: true,
	consumable: true,
	frame: [16, 16]
};
export const ITEMS: Record<number, ItemStats> = {
	0: NONE,
	/** Dirt Block. */
	2: { ...BLOCK, createTile: 0 },
	/** Stone Block. */
	3: { ...BLOCK, createTile: 1 },
	/** Clay Block. */
	133: { ...BLOCK, createTile: 40 },
	/** Copper Pickaxe. */
	3509: {
		...NONE,
		useStyle: 1,
		useAnimation: 23,
		useTime: 15,
		autoReuse: true,
		useTurn: true,
		pick: 35,
		tileBoost: -1,
		scale: 0.9,
		useSound: [2, 1],
		frame: [32, 32]
	},
	/** Wood (the item), which places wood blocks. */
	9: { ...BLOCK, createTile: 30, frame: [24, 22] },
	/** Work Bench, Wooden Table, Wooden Chair. */
	36: { ...BLOCK, createTile: 18, frame: [32, 18] },
	32: { ...BLOCK, createTile: 14, frame: [30, 22] },
	34: { ...BLOCK, createTile: 15, frame: [16, 32] },
	/** Torch. */
	8: { ...BLOCK, createTile: 4, holdStyle: 1, frame: [14, 16] },
	/** Copper Axe. */
	3506: {
		...NONE,
		useStyle: 1,
		useAnimation: 30,
		useTime: 21,
		autoReuse: true,
		useTurn: true,
		axe: 7,
		tileBoost: -1,
		useSound: [2, 1],
		frame: [32, 28]
	}
};

/** Main.tileAxe, for the tiles here: what an axe cuts (and a pickaxe doesn't). */
const TILE_AXE = TREES;
export const stats = (type: number): ItemStats => ITEMS[type] ?? NONE;

/** SoundEngine.PlaySound(type, x, y, style), or an item's use sound (with its pitch). */
export interface SoundCall {
	type: number;
	style: number;
	x: number;
	y: number;
	pitch?: number;
}

/** Item.NewItem(x, y, w, h, type, stack): an item dropped from that rectangle. */
export interface DropCall {
	type: number;
	stack: number;
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * The world an item is used in. Its tiles must be the ones the game's converted code works on
 * ($lib/world/gen: play, with `rand` as Main.rand), which sends its sounds and drops there too.
 */
export interface ItemWorld {
	/** The game's random numbers (Main.rand, which is also WorldGen.genRand). */
	rand: { Next_Int32(n: number): number; NextDouble(): number };
	tiles: TileGrid & { hasWall(i: number, j: number): boolean };
	/** SquareTileFrame's reset: block (i, j)'s new random variant (genRand.Next(3)). */
	variant(i: number, j: number): number;
	sound(s: SoundCall): void;
}

/** Player.tileRangeX / tileRangeY. */
const TILE_RANGE_X = 5;
const TILE_RANGE_Y = 3;

const isAir = (item: Item) => (item.type > 0 ? item.stack <= 0 : true);

/** Player.IsInTileInteractionRange with TileReachCheckSettings.Simple, tileBoost `tb`. */
export function inRange(p: Player, x: number, y: number, tb: number): boolean {
	const rx = TILE_RANGE_X + tb;
	const ry = TILE_RANGE_Y + tb;
	const lx = Math.trunc(f(p.x / 16)) - rx;
	const hx = Math.ceil(f(f(p.x + p.w) / 16)) - 1 + rx;
	const ly = Math.trunc(f(p.y / 16)) - ry;
	const hy = Math.ceil(f(f(p.y + p.h) / 16)) - 1 + ry;
	return x >= lx && x <= hx && y >= ly && y <= hy;
}

/** Player.ItemCheck (and ItemCheckWrapped's last step), after the frame's movement. */
export function itemCheck(p: Player, w?: ItemWorld) {
	const item = p.item;
	let s = stats(item.type);
	const c = p.controls;

	// ItemCheck_AutoReuseLogic: the button counts as let go, and the swing ends a frame early.
	if (!isAir(item) && s.autoReuse) {
		p.releaseUseItem = true;
		if (p.itemAnimation === 1 && item.stack > 0) p.itemAnimation = 0;
	}
	if (p.itemAnimation < 0) p.itemAnimation = 0;
	if (p.itemTime < 0) p.itemTime = 0;
	if (p.itemAnimation === 0) p.itemAnimationMax = 0;

	// The revolver's crit bonus, for any other item: `else if (Main.rand.Next(3) == 0)` (a draw
	// every frame, which keeps the game's random numbers in step).
	w?.rand.Next_Int32(3);

	if (c.use && p.releaseUseItem && p.itemAnimation === 0 && s.useStyle !== 0) {
		p.itemRotation = 0;
		// ItemCheck_TryStartUse: nothing stops these items. ItemCheck_StartActualUse:
		if (s.pick > 0) p.toolTime = 1;
		// ApplyItemAnimation: useAnimation times meleeSpeed or tileSpeed, both 1.
		p.itemAnimation = p.itemAnimationMax = s.useAnimation;
		if (s.useSound) {
			const [type, style] = s.useSound;
			w?.sound({
				type,
				style,
				x: f(p.x + Math.trunc(p.w / 2)),
				y: f(p.y + Math.trunc(p.h / 2)),
				pitch: 0
			});
		}
	}

	if (p.itemAnimation > 0) p.itemAnimation--;
	if (p.itemAnimation === 0 && isAir(item) && item.type !== 0) {
		// Item.TurnToAir.
		item.type = 0;
		item.stack = 0;
		s = NONE;
	}
	p.releaseUseItem = !c.use;
	if (p.itemTime > 0) p.itemTime--;

	// AnimatePlayerAndGetItemFrame: mid-swing, the item the swing started with; otherwise how
	// the item's held.
	if (p.itemAnimation > 0) applyUseStyle(p, stats(p.lastVisualized.type));
	else if (!isAir(item)) applyHoldStyle(p, s);

	// ItemCheck_OwnerOnlyCode.
	p.toolTime = p.itemTime;
	if (w) {
		useMiningTools(p, s, w);
		placeThing(p, s, w);
	}

	if (
		(p.itemTimeMax !== 0 && p.itemTime === p.itemTimeMax) ||
		(!isAir(item) && (item.type !== p.lastVisualized.type || item.stack !== p.lastVisualized.stack))
	)
		p.lastVisualized = { ...item };
	// A block used: one off the stack (and the swing's time cut short once it's gone).
	if (p.itemTimeMax !== 0 && p.itemTime === p.itemTimeMax && s.consumable) {
		if (item.stack > 0) item.stack--;
		if (item.stack <= 0) p.itemTime = p.itemAnimation;
	}
	// ItemCheckWrapped.
	if (p.itemAnimation === 0) p.lastVisualized = { ...item };
}

/** ItemCheck_ApplyHoldStyle for holdStyle 1 (a torch): held out in front, upright. */
function applyHoldStyle(p: Player, s: ItemStats) {
	if (s.holdStyle !== 1) return;
	const [W] = s.frame;
	p.itemLocation = {
		x: f(f(p.x + f(p.w * 0.5)) + f(f(f(W * 0.5) + 2) * p.direction)),
		y: f(p.y + 24)
	};
	p.itemRotation = 0;
}

/** ItemCheck_ApplyUseStyle for useStyle 1 (a swing): three positions, and the turn. */
function applyUseStyle(p: Player, s: ItemStats) {
	const [W, H] = s.frame;
	const t = p.itemAnimation;
	const max = p.itemAnimationMax;
	const d = p.direction;
	const mid = f(p.x + f(p.w * 0.5));
	let x: number;
	let y: number;
	if (t < max * 0.333) {
		let n = 10;
		if (W > 32) n = 14;
		if (W >= 52) n = 24;
		if (W >= 64) n = 28;
		if (W >= 92) n = 38;
		x = f(mid + f(f(f(W * 0.5) - n) * d));
		y = f(p.y + 24);
	} else if (t < max * 0.666) {
		let n = 10;
		if (W > 32) n = 18;
		if (W >= 52) n = 24;
		if (W >= 64) n = 28;
		if (W >= 92) n = 38;
		x = f(mid + f(f(f(W * 0.5) - n) * d));
		n = 10;
		if (H > 32) n = 8;
		if (H > 52) n = 12;
		if (H > 64) n = 14;
		y = f(p.y + n);
	} else {
		let n = 6;
		if (W > 32) n = 14;
		if (W >= 48) n = 18;
		if (W >= 52) n = 24;
		if (W >= 64) n = 28;
		if (W >= 92) n = 38;
		x = f(mid - f(f(f(W * 0.5) - n) * d));
		n = 10;
		if (H > 52) n = 12;
		if (H > 64) n = 14;
		y = f(p.y + n);
	}
	p.itemLocation = { x, y };
	p.itemRotation = f(f(f(f(f(t) / f(max)) - f(0.5)) * -d * f(3.5)) - f(d * f(0.3)));
}

// ---- Mining ------------------------------------------------------------------------------------

const active = (w: ItemWorld) => (i: number, j: number) => w.tiles.at(i, j) !== AIR;

/** ItemCheck_UseMiningTools, for a pickaxe or an axe. */
function useMiningTools(p: Player, s: ItemStats, w: ItemWorld) {
	if (s.pick <= 0 && s.axe <= 0) return;
	const x = p.tileTargetX;
	const y = p.tileTargetY;
	if (!inRange(p, x, y, s.tileBoost)) return;
	if (p.toolTime !== 0 || p.itemAnimation <= 0 || !p.controls.use) return;
	// ItemCheck_UseMiningTools_ActuallyUseMiningTool: only on a tile that's there.
	const type = w.tiles.at(x, y);
	if (type === AIR) return;
	const hit = p.hitTile;
	const buffer = hit.hitObject(x, y, TILE);
	if (TILE_AXE.includes(type)) {
		if (s.axe > 0) {
			// (int)(axe * 1.2f), nothing if it can't go yet.
			let damage = Math.trunc(f(s.axe * f(1.2)));
			if (!WorldGen.CanKillTile_Int32_Int32(x, y)) damage = 0;
			holding(s.axe);
			if (hit.addDamage(buffer, damage, true, w.rand) >= 100) {
				hit.tryClearingAndPruning(x, y, TILE, active(w));
				WorldGen.KillTile(x, y, false, false, false);
			} else WorldGen.KillTile(x, y, true, false, false);
			if (damage !== 0) hit.prune(active(w));
			// ApplyItemTime.
			p.itemTime = p.itemTimeMax = s.useTime;
		}
	} else if (s.pick > 0) pickTile(p, w, x, y, s.pick);
	if (s.pick > 0) p.itemTime = Math.trunc(f(s.useTime * 1)); // useTime * pickSpeed
	// (Pounding and hitting walls need a hammer.)
}

/** Player.PickTile: one pickaxe hit. Breaks the block once its damage reaches 100. */
export function pickTile(p: Player, w: ItemWorld, x: number, y: number, pickPower: number) {
	const hit = p.hitTile;
	const type = w.tiles.at(x, y);
	// PickTile_DetermineDamage.
	const buffer = hit.hitObject(x, y, TILE);
	// GetPickaxeDamage: the pick power, twice over on dirt and clay.
	let damage = type === AIR ? 0 : pickPower + (type === 0 || type === 40 ? pickPower : 0);
	// WorldGen.CanKillTile: not under a tree, say.
	if (!WorldGen.CanKillTile_Int32_Int32(x, y)) damage = 0;
	// DoesPickTargetTransformOnKill: grass about to break is knocked to dirt instead.
	if (hit.addDamage(buffer, damage, false) >= 100 && type === GRASS) damage = 0;
	if (hit.addDamage(buffer, damage, true, w.rand) >= 100) {
		// ClearMiningCacheAt (hitReplace, block swapping's, is never used here).
		hit.tryClearingAndPruning(x, y, TILE, active(w));
		WorldGen.KillTile(x, y, false, false, false);
	} else WorldGen.KillTile(x, y, true, false, false);
	if (damage !== 0) hit.prune(active(w));
}

// ---- Placing -----------------------------------------------------------------------------------

/** PlaceThing -> PlaceThing_Tiles, for a block. */
function placeThing(p: Player, s: ItemStats, w: ItemWorld) {
	if (s.createTile < 0) return;
	const x = p.tileTargetX;
	const y = p.tileTargetY;
	if (!inRange(p, x, y, s.tileBoost)) return;
	// PlaceThing_TryReplacingTiles -> PlaceThing_ValidTileForReplacement (block swapping): for
	// these blocks and tiles it gets as far as asking what the tile there (or its leftover type,
	// if it's gone) would drop, unless it's the block being placed: KillTile_GetItemDrops, which
	// for a tree rolls the game's random numbers, every frame.
	// (Not for a torch: it's frame-important, which rules swapping out before that.)
	const there = Rt.tile.get(x, y);
	// (Nor wood: TileID.Sets.IgnoresTileReplacementDropCheckWhenBeingPlaced.)
	if (
		there.type !== s.createTile &&
		!FRAME_IMPORTANT.includes(s.createTile) &&
		s.createTile !== WOOD_BLOCK
	) {
		const box = <T>(v: T) => ({ v });
		WorldGen.KillTile_GetItemDrops(x, y, there, box(0), box(0), box(0), box(0), box(false), false);
	}
	// Only into the open (no liquids here); and only as a use's time comes round.
	if (w.tiles.at(x, y) !== AIR) return;
	if (p.itemTime !== 0 || p.itemAnimation <= 0 || !p.controls.use) return;
	// PlaceThing_Tiles_TryPlacing: an object of more than one tile (furniture) by its object
	// data (TileObject.CanPlace, then PlaceIt's TileObject.Place: the game's, converted).
	if (TileObjectData.CustomPlace(s.createTile, 0) && ![82, 227, TORCH].includes(s.createTile)) {
		const data = { v: new TileObject() };
		if (!TileObject.CanPlace(x, y, s.createTile, 0, p.direction, data, false, null)) return;
		const placed = TileObject.Place(data.v);
		WorldGen.SquareTileFrame(x, y, true);
		w.sound({ type: 0, style: 1, x: x * 16, y: y * 16 });
		if (placed) p.itemTime = p.itemTimeMax = Math.max(Math.trunc(f(s.useTime * 1)), 1);
		return;
	}
	// PlaceThing_Tiles_BlockPlacementForAssortedThings: next to a block or a wall, or on a wall.
	if (!(s.createTile === TORCH ? canPlaceTorch(w, x, y) : canPlaceAt(w, x, y))) return;
	if (!placeTile(p, w, x, y, s.createTile)) return;
	// PlaceThing_Tiles_PlaceIt: ApplyItemTime (times tileSpeed, 1).
	p.itemTime = p.itemTimeMax = Math.max(Math.trunc(f(s.useTime * 1)), 1);
	killGrassForSolids(w, x, y, s.createTile);
}

/**
 * The same for a torch: a wall behind it, or a block under it or beside it, or a tree trunk
 * beside it (and above, and above again: the game's code checks the same tile twice on the
 * left, where it means the one below).
 */
export function canPlaceTorch(w: ItemWorld, x: number, y: number): boolean {
	const t = w.tiles;
	if (x >= 0 && y >= 0 && x < t.width && y < t.height && t.wall[y * t.width + x] > 0) return true;
	const solid = (i: number, j: number) => isSolid(t.at(i, j));
	const tree = (i: number, j: number) => WorldGen.IsTreeType(t.at(i, j));
	if (solid(x, y + 1)) return true;
	if (solid(x - 1, y) || (tree(x - 1, y) && tree(x - 1, y - 1) && tree(x - 1, y - 1))) return true;
	return solid(x + 1, y) || (tree(x + 1, y) && tree(x + 1, y - 1) && tree(x + 1, y + 1));
}

/** Whether a block can go at (x, y) by what's around it: a block or wall beside it, or a wall behind. */
export function canPlaceAt(w: ItemWorld, x: number, y: number): boolean {
	const t = w.tiles;
	const beside = (i: number, j: number) => isSolid(t.at(i, j)) || t.hasWall(i, j);
	return (
		beside(x + 1, y) || beside(x - 1, y) || beside(x, y + 1) || beside(x, y - 1) || t.hasWall(x, y)
	);
}

/**
 * WorldGen.PlaceTile (the game's, converted): a block only where nobody's standing
 * (Collision.EmptyTile), a torch only where it has something to hang on (CheckTorch).
 */
function placeTile(_p: Player, _w: ItemWorld, i: number, j: number, type: number): boolean {
	return WorldGen.PlaceTile(i, j, type, false, false, 0, 0);
}

/** Rectangle.Intersects of the tile with the player's (int) hitbox. */
export function overlapsPlayer(p: Player, i: number, j: number): boolean {
	const px = Math.trunc(p.x);
	const py = Math.trunc(p.y);
	return i * 16 < px + p.w && px < i * 16 + 16 && j * 16 < py + p.h && py < j * 16 + 16;
}

/** PlaceThing_Tiles_PlaceIt_KillGrassForSolids: grass shut in by the new block turns to dirt. */
function killGrassForSolids(w: ItemWorld, x: number, y: number, created: number) {
	if (!isSolid(created)) return;
	const t = w.tiles;
	for (let i = x - 1; i <= x + 1; i++)
		for (let j = y - 1; j <= y + 1; j++) {
			const type = t.at(i, j);
			if (type === AIR || type === created || type !== GRASS) continue;
			let shut = true;
			for (let k = i - 1; k <= i + 1; k++)
				for (let l = j - 1; l <= j + 1; l++) if (!isSolid(t.at(k, l))) shut = false;
			if (shut) WorldGen.KillTile(i, j, true, false, false);
		}
}

export { HitTile };
