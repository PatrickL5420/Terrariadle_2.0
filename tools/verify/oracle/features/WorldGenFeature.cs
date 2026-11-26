// World generation: the game's own passes (TerrainPass, and the passes in WorldGen.GenerateWorld
// extracted as WorldGen.Pass_<name>) on an empty world of a given size and seed.
using System.Collections.Generic;
using System.Text.Json;
using Terraria;
using Terraria.GameContent.Biomes;
using Terraria.IO;
using Terraria.Utilities;
using Terraria.WorldBuilding;

namespace Oracle;

/**
 * A case: {"seed", "w", "h", "passes": ["Terrain", "Clay", ...], "crop": [x0, y0, x1, y1]}.
 *
 * Set up as GenerateWorld does for a plain world (Main.rand seeded, which is WorldGen.genRand;
 * generatingWorld on, so framing waits until the world's done),
 * except that there are no beaches: GenVars.leftBeachEnd / rightBeachStart are put outside the
 * world, so the terrain runs the full width (the world is a slice of a bigger one). The passes run
 * in the order given.
 *
 * Result: the crop's tiles, row by row ("type": -1 for none, "wall", "liquid", "frameX",
 * "frameY": trees are framed as they grow), and the
 * heights the passes worked out (GenVars and Main's surface and rock layer).
 */
public class WorldGenFeature : IFeature
{
	public object Run(JsonElement c)
	{
		int w = c.GetProperty("w").GetInt32();
		int h = c.GetProperty("h").GetInt32();
		Main.maxTilesX = w;
		Main.maxTilesY = h;
		Main.tile = new Tile[w, h];
		for (int i = 0; i < w; i++)
			for (int j = 0; j < h; j++)
				Main.tile[i, j] = new Tile();
		Main.rand = new UnifiedRandom(c.GetProperty("seed").GetInt32());
		WorldGen.isGeneratingOrLoadingWorld = true;
		WorldGen.generatingWorld = true;
		GenVars.leftBeachEnd = -100;
		GenVars.rightBeachStart = w + 100;
		var progress = new GenerationProgress();
		var config = new GameConfiguration();
		foreach (var p in c.GetProperty("passes").EnumerateArray())
		{
			string name = p.GetString();
			if (name == "Terrain") new TerrainPass().Apply(progress, config);
			else typeof(WorldGen).GetMethod("Pass_" + name).Invoke(null, new object[] { progress, config });
		}
		WorldGen.isGeneratingOrLoadingWorld = false;
		WorldGen.generatingWorld = false;

		var crop = c.GetProperty("crop");
		int x0 = crop[0].GetInt32(), y0 = crop[1].GetInt32(), x1 = crop[2].GetInt32(), y1 = crop[3].GetInt32();
		var type = new List<int>();
		var wall = new List<int>();
		var liquid = new List<int>();
		var frameX = new List<int>();
		var frameY = new List<int>();
		for (int j = y0; j < y1; j++)
			for (int i = x0; i < x1; i++)
			{
				var t = Main.tile[i, j];
				type.Add(t.active() ? t.type : -1);
				wall.Add(t.wall);
				liquid.Add(t.liquid);
				frameX.Add(t.frameX);
				frameY.Add(t.frameY);
			}
		return new
		{
			type,
			wall,
			liquid,
			frameX,
			frameY,
			worldSurface = Main.worldSurface,
			rockLayer = Main.rockLayer,
			worldSurfaceLow = GenVars.worldSurfaceLow,
			worldSurfaceHigh = GenVars.worldSurfaceHigh,
			rockLayerLow = GenVars.rockLayerLow,
			rockLayerHigh = GenVars.rockLayerHigh
		};
	}
}
