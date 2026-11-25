/**
 * World generation: the game's own surface passes (WorldGen.GenerateWorld's, and TerrainPass),
 * converted to TypeScript from the game's code by tools/verify/port/convert.mjs (./game.ts) and
 * checked against it (tools/verify/worldgen.verify.ts): the same seed makes the same world.
 *
 * Only the forest surface: the terrain, the dirt walls behind it, rocks in the dirt and dirt in
 * the rocks, clay, small holes and caves (some with water), and grass. The world is a slice of a
 * bigger one: generated wider than it's used (the passes keep away from a world's edges) and
 * as tall as a small world (the passes place things by fractions of its height), with no beaches.
 */
import { GenVars, Main, TerrainPass, Tile, UnifiedRandom, WorldGen } from './game';
import { Array2D, GameConfiguration, Progress, Rt } from './runtime';

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
	'SpreadingGrassOnSurfaceSunflowersEvilsOnSurfaceAndLavaCleanup'
] as const;

export interface Generated {
	tiles: Array2D<Tile>;
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
	Rt.tile = new Array2D(w, h, () => new Tile());
	Main.rand = new UnifiedRandom(seed);
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
