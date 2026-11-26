/**
 * World generation: the game's own surface passes (WorldGen.GenerateWorld's, and TerrainPass),
 * converted to TypeScript from the game's code by tools/verify/port/convert.mjs (./game.ts) and
 * checked against it (tools/verify/worldgen.verify.ts): the same seed makes the same world.
 *
 * Only the forest surface: the terrain, the dirt walls behind it, rocks in the dirt and dirt in
 * the rocks, clay, small holes and caves (some with water), grass, and trees (forest trees, and
 * the odd sakura or yellow willow). The world is a slice of a
 * bigger one: generated wider than it's used (the passes keep away from a world's edges) and
 * as tall as a small world (the passes place things by fractions of its height), with no beaches.
 */
import { TileGrid } from '../framing';
import { GenVars, Main, TerrainPass, TileObjectData, UnifiedRandom, WorldGen } from './game';
import {
	GameConfiguration,
	GamePlayer,
	Progress,
	Rt,
	TileView,
	type Critter,
	type Drop,
	type Sound,
	type Tile
} from './runtime';

export { WorldGen, UnifiedRandom };

/** The passes, in GenerateWorld's order. */
export const PASSES = [
	'Terrain',
	'DirtWallBackgrounds',
	'RocksInDirt',
	'DirtInRocks',
	'Clay',
	'SmallHoles',
	'DirtLayerCaves',
	'RockLayerCaves',
	'SurfaceCaves',
	'Grass',
	'SpreadingGrassOnSurfaceSunflowersEvilsOnSurfaceAndLavaCleanup',
	'Trees'
] as const;

export interface Generated {
	tiles: TileView;
	/** Main.worldSurface and rockLayer, and the passes' GenVars heights. */
	worldSurface: number;
	rockLayer: number;
	worldSurfaceLow: number;
	worldSurfaceHigh: number;
	rockLayerLow: number;
	rockLayerHigh: number;
}

/** A w x h world from `seed`, as tools/verify/oracle/features/WorldGenFeature.cs sets it up. */
export function generate(
	seed: number,
	w: number,
	h: number,
	passes: readonly string[] = PASSES
): Generated {
	Main.maxTilesX = w;
	Main.maxTilesY = h;
	Rt.tile = new TileView(new TileGrid(w, h));
	Main.rand = new UnifiedRandom(seed);
	Rt.rand = Main.rand;
	Main.myPlayer = 0;
	Main.player = Array.from({ length: 256 }, () => new GamePlayer());
	WorldGen.isGeneratingOrLoadingWorld = true;
	WorldGen.generatingWorld = true;
	GenVars.leftBeachEnd = -100;
	GenVars.rightBeachStart = w + 100;
	const progress = new Progress();
	const config = new GameConfiguration();
	const run = WorldGen as unknown as Record<string, (p: Progress, c: GameConfiguration) => void>;
	for (const name of passes) {
		if (name === 'Terrain')
			new TerrainPass().ApplyPass(progress, config); // GenPass.Apply
		else run[`Pass_${name}`](progress, config);
	}
	WorldGen.isGeneratingOrLoadingWorld = false;
	WorldGen.generatingWorld = false;
	return {
		tiles: Rt.tile,
		worldSurface: Main.worldSurface,
		rockLayer: Main.rockLayer,
		worldSurfaceLow: GenVars.worldSurfaceLow,
		worldSurfaceHigh: GenVars.worldSurfaceHigh,
		rockLayerLow: GenVars.rockLayerLow,
		rockLayerHigh: GenVars.rockLayerHigh
	};
}

let objectData = false;

/** Where the game's code, run on a world being played, sends what it makes. */
export interface PlayHooks {
	/** The player (Main.player[0]): where it is, so nothing's placed on it. */
	player?: { x: number; y: number; w: number; h: number; direction: number };
	drop(d: Drop): void;
	sound(s: Sound): void;
	/** NPC.NewNPC: a critter let out of a shaken tree (not simulated). */
	critter?(c: Critter): void;
	/** KillTile_MakeTileDust: one dust for tile (i, j) of `type`. */
	tileDust?(i: number, j: number, type: number): void;
}

/**
 * Points the game's converted code (./game.ts) at a world being played: `grid` is Main.tile,
 * `rand` Main.rand (and WorldGen.genRand), and its drops, sounds and dust go to `hooks`. Tiles
 * whose framing is the game's own (trees: TileFrameImportant) are framed by the converted code
 * from then on. One world at a time, like the game.
 */
export function play(grid: TileGrid, rand: UnifiedRandom, hooks: PlayHooks) {
	Main.maxTilesX = grid.width;
	Main.maxTilesY = grid.height;
	Rt.tile = new TileView(grid);
	Main.rand = rand;
	Rt.rand = rand;
	Main.myPlayer = 0;
	Main.player = Array.from(
		{ length: 256 },
		(_, k) => new GamePlayer(k === 0 ? () => hooks.player : undefined)
	);
	Main.gameMenu = false;
	// Multi-tile objects' placing rules (Main.Initialize), once.
	if (!objectData) {
		TileObjectData.Initialize();
		objectData = true;
	}
	WorldGen.isGeneratingOrLoadingWorld = false;
	WorldGen.generatingWorld = false;
	Rt.drop = (d) => hooks.drop(d);
	Rt.sound = (s) => hooks.sound(s);
	Rt.critter = (c) => hooks.critter?.(c);
	Rt.tileDust = (i: number, j: number, t: Tile) => {
		hooks.tileDust?.(i, j, t.type);
		return 0;
	};
	Rt.variant = () => rand.Next_Int32_Int32(0, 3);
	// No trees shaken yet (each shakes once a day).
	WorldGen.ResetTreeShakes();
	grid.frameImportant = (i, j) => WorldGen.TileFrame(i, j, false, false);
}

/** The held item's axe power, as the game's tree drops read it (Player.inventory[selectedItem]). */
export function holding(axe: number) {
	(Main.player[0] as GamePlayer).inventory[0].axe = axe;
}
