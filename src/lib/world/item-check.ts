/**
 * Using an item: Terraria 1.4.5's Player.ItemCheck, ported line by line for the items this
 * little world has (the Copper Pickaxe, dirt and stone blocks, and an empty hand once a stack is
 * used up), with what it reaches for them:
 *
 *   ItemCheck_AutoReuseLogic        holding the button swings again, a frame early
 *   ItemCheck_StartActualUse        the swing starts (ApplyItemAnimation; the use sound)
 *   ItemCheck_ApplyUseStyle         useStyle 1: where the item is held and how it's turned
 *   ItemCheck_UseMiningTools        Player.PickTile -> WorldGen.KillTile (./hit-tile for the damage)
 *   PlaceThing_Tiles                WorldGen.PlaceTile, and grass under a block knocked to dirt
 *   the stack used up               one block per placement
 *
 * in the game's order, every float rounded to a single (`f`) as the game computes. Everything
 * else ItemCheck does (weapons, wands, buckets, wiring, pets...) starts with a check for its
 * own items and does nothing for these. tools/verify compares this with the game's own
 * ItemCheck, frame by frame.
 *
 * Left out because it can't happen here: mounts, slopes and half blocks, liquids, other
 * players and NPCs, and swapping blocks (placing onto a block with a pickaxe in the inventory:
 * this player only places into the open).
 */
import { f } from './collision';
import { AIR, GRASS, isSolid, STONE, type TileGrid } from './framing';
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
	tileBoost: number;
	scale: number;
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
	}
};
export const stats = (type: number): ItemStats => ITEMS[type] ?? NONE;

/** The item a block drops (KillTile_GetItemDrops). */
export const ITEM_OF: Record<number, number> = { 0: 2, 1: 3, 2: 2 };

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

/** The world an item is used in. */
export interface ItemWorld {
	tiles: TileGrid & { hasWall(i: number, j: number): boolean };
	/** SquareTileFrame's reset: block (i, j)'s new random variant (genRand.Next(3)). */
	variant(i: number, j: number): number;
	sound(s: SoundCall): void;
	drop(d: DropCall): void;
	/** KillTile_MakeTileDust, `count` times (looks only). */
	tileDust?(i: number, j: number, type: number, count: number): void;
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

	// AnimatePlayerAndGetItemFrame: mid-swing, the item the swing started with.
	if (p.itemAnimation > 0) applyUseStyle(p, stats(p.lastVisualized.type));

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

/** ItemCheck_UseMiningTools, for a pickaxe. */
function useMiningTools(p: Player, s: ItemStats, w: ItemWorld) {
	if (s.pick <= 0) return;
	const x = p.tileTargetX;
	const y = p.tileTargetY;
	if (!inRange(p, x, y, s.tileBoost)) return;
	if (p.toolTime !== 0 || p.itemAnimation <= 0 || !p.controls.use) return;
	// ItemCheck_UseMiningTools_ActuallyUseMiningTool: only on a block.
	if (w.tiles.at(x, y) === AIR) return;
	p.hitTile.hitObject(x, y, TILE);
	pickTile(p, w, x, y, s.pick);
	p.itemTime = Math.trunc(f(s.useTime * 1)); // useTime * pickSpeed
	// (Pounding and hitting walls need a hammer.)
}

/** Player.PickTile: one pickaxe hit. Breaks the block once its damage reaches 100. */
export function pickTile(p: Player, w: ItemWorld, x: number, y: number, pickPower: number) {
	const hit = p.hitTile;
	const type = w.tiles.at(x, y);
	// PickTile_DetermineDamage.
	const buffer = hit.hitObject(x, y, TILE);
	// GetPickaxeDamage: the pick power, twice over on dirt.
	let damage = type === AIR ? 0 : pickPower + (type === 0 ? pickPower : 0);
	// (WorldGen.CanKillTile: a block with nothing on it can always go.)
	if (type === AIR) damage = 0;
	// DoesPickTargetTransformOnKill: grass about to break is knocked to dirt instead.
	if (hit.addDamage(buffer, damage, false) >= 100 && type === GRASS) damage = 0;
	if (hit.addDamage(buffer, damage) >= 100) {
		// ClearMiningCacheAt (hitReplace, block swapping's, is never used here).
		hit.tryClearingAndPruning(x, y, TILE, active(w));
		killTile(w, x, y, false);
	} else killTile(w, x, y, true);
	if (damage !== 0) hit.prune(active(w));
}

/**
 * WorldGen.KillTile for these blocks: the sound and dust; a hit that `fail`s leaves the block
 * (grass knocked to dirt) with a new variant, otherwise it's gone and drops its item.
 */
export function killTile(w: ItemWorld, i: number, j: number, fail: boolean) {
	const type = w.tiles.at(i, j);
	if (type === AIR) return;
	// KillTile_PlaySounds: stone tinks (21), the rest dig (0).
	w.sound({ type: type === STONE ? 21 : 0, style: 1, x: i * 16, y: j * 16 });
	// KillTile_GetTileDustAmount and KillTile_MakeTileDust.
	w.tileDust?.(i, j, type, fail ? 3 : 10);
	if (fail) {
		w.tiles.convert(i, j, type === GRASS ? 0 : type, w.variant(i, j));
		return;
	}
	// KillTile_DropItems.
	w.drop({ type: ITEM_OF[type], stack: 1, x: i * 16, y: j * 16, w: 16, h: 16 });
	w.tiles.kill(i, j);
}

// ---- Placing -----------------------------------------------------------------------------------

/** PlaceThing -> PlaceThing_Tiles, for a block. */
function placeThing(p: Player, s: ItemStats, w: ItemWorld) {
	if (s.createTile < 0) return;
	const x = p.tileTargetX;
	const y = p.tileTargetY;
	if (!inRange(p, x, y, s.tileBoost)) return;
	// Only into the open (no liquids here); and only as a use's time comes round.
	if (w.tiles.at(x, y) !== AIR) return;
	if (p.itemTime !== 0 || p.itemAnimation <= 0 || !p.controls.use) return;
	// PlaceThing_Tiles_BlockPlacementForAssortedThings: next to a block or a wall, or on a wall.
	if (!canPlaceAt(w, x, y)) return;
	if (!placeTile(p, w, x, y, s.createTile)) return;
	// PlaceThing_Tiles_PlaceIt: ApplyItemTime (times tileSpeed, 1).
	p.itemTime = p.itemTimeMax = Math.max(Math.trunc(f(s.useTime * 1)), 1);
	killGrassForSolids(w, x, y, s.createTile);
}

/** Whether a block can go at (x, y) by what's around it: a block or wall beside it, or a wall behind. */
export function canPlaceAt(w: ItemWorld, x: number, y: number): boolean {
	const t = w.tiles;
	const beside = (i: number, j: number) => isSolid(t.at(i, j)) || t.hasWall(i, j);
	return (
		beside(x + 1, y) || beside(x - 1, y) || beside(x, y + 1) || beside(x, y - 1) || t.hasWall(x, y)
	);
}

/** WorldGen.PlaceTile for a block: only where nobody's standing (Collision.EmptyTile). */
function placeTile(p: Player, w: ItemWorld, i: number, j: number, type: number): boolean {
	const t = w.tiles;
	if (i < 0 || j < 0 || i >= t.width || j >= t.height) return false;
	if (t.at(i, j) !== AIR || overlapsPlayer(p, i, j)) return false;
	t.place(i, j, type, w.variant(i, j));
	w.sound({ type: 0, style: 1, x: i * 16, y: j * 16 });
	return true;
}

/** Rectangle.Intersects of the tile with the player's (int) hitbox. */
export function overlapsPlayer(p: Player, i: number, j: number): boolean {
	const px = Math.trunc(p.x);
	const py = Math.trunc(p.y);
	return i * 16 < px + p.w && px < i * 16 + 16 && j * 16 < py + p.h && py < j * 16 + 16;
}

/** PlaceThing_Tiles_PlaceIt_KillGrassForSolids: grass shut in by the new block turns to dirt. */
function killGrassForSolids(w: ItemWorld, x: number, y: number, created: number) {
	const t = w.tiles;
	for (let i = x - 1; i <= x + 1; i++)
		for (let j = y - 1; j <= y + 1; j++) {
			const type = t.at(i, j);
			if (type === AIR || type === created || type !== GRASS) continue;
			let shut = true;
			for (let k = i - 1; k <= i + 1; k++)
				for (let l = j - 1; l <= j + 1; l++) if (!isSolid(t.at(k, l))) shut = false;
			if (shut) killTile(w, i, j, true);
		}
}

export { HitTile };
