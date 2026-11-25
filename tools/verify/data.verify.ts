/** The game data the ports assume (block properties etc.) against the game's own tables. */
import { describe, expect, it } from 'vitest';
import { CLAY, DIRT, GRASS, STONE, TILE_DATA } from '$lib/world/framing';
import { oracle, oracleBuilt } from './lib/oracle';

const TYPES = [DIRT, STONE, GRASS, CLAY];
const has = (set: number[]) => TYPES.map((t) => set.includes(t));

describe.skipIf(!oracleBuilt)('block data = Main.tile* / TileID.Sets', () => {
	it('the framing port', () => {
		const fields = {
			'Main.tileSolid': has(TILE_DATA.solid),
			'Main.tileBrick': has(TILE_DATA.brick),
			'Main.tileMergeDirt': has(TILE_DATA.mergeDirt),
			'TileID.Sets.Dirt': has(TILE_DATA.dirt),
			'TileID.Sets.Conversion.MergesWithDirtInASpecialWay': has(TILE_DATA.specialDirt),
			'TileID.Sets.ChecksForMerge': has(TILE_DATA.checksForMerge),
			'TileID.Sets.NeedsGrassFramingDirt': [0, 0, TILE_DATA.grassDirt, 0]
		};
		const [game] = oracle<object, Record<string, unknown[]>>('lookup', [
			{ fields: Object.keys(fields), indices: TYPES }
		]);
		// NeedsGrassFramingDirt only matters for grass.
		game['TileID.Sets.NeedsGrassFramingDirt'][0] =
			game['TileID.Sets.NeedsGrassFramingDirt'][1] =
			game['TileID.Sets.NeedsGrassFramingDirt'][3] =
				0;
		expect(game).toEqual(fields);
	});
});
