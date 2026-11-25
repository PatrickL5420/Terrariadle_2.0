// Tile framing: WorldGen.TileFrame / SquareTileFrame on a small world, after a list of edits.
using System.Text.Json;
using Terraria;
using Terraria.DataStructures;

namespace Oracle;

/**
 * A case: {"w", "h", "type": [w*h, -1 for none, row-major], "variant": [w*h frameNumbers],
 * "ops": [...]}, or "cells": [[i, j, type, variant], ...] (the rest air) instead of type and
 * variant; "region": [x0, y0, x1, y1] (exclusive) limits the result to part of the world.
 * Ops, each as the game does it:
 *   ["frameAll"]               TileFrame(i, j) for every tile, column by column (no reset)
 *   ["frame", i, j]            TileFrame(i, j)
 *   ["square", i, j]           SquareTileFrame(i, j, resetFrame: false)
 *   ["place", i, j, type, v]   WorldGen.PlaceTile for a block: Tile.Clear(Tile), active, type;
 *                              then SquareTileFrame(i, j) with the new frameNumber v
 *   ["kill", i, j]             WorldGen.KillTile: inactive, frames -1, frameNumber 0; square
 *   ["convert", i, j, type, v] KillTile's failed hit turning grass to dirt: type; square with v
 * SquareTileFrame's reset draws the centre's frameNumber from genRand.Next(0, 3), and nothing
 * else in TileFrameCosmetic uses the random, so "set frameNumber v, then square without a
 * reset" is the same thing with v chosen by the case.
 * Result: {"frameX", "frameY", "variant"} for every tile of the region (row-major).
 */
public class FramingFeature : IFeature
{
	public object Run(JsonElement c)
	{
		int w = c.GetProperty("w").GetInt32();
		int h = c.GetProperty("h").GetInt32();
		Main.maxTilesX = w;
		Main.maxTilesY = h;
		Main.tile = new Tile[w, h];
		for (int j = 0; j < h; j++)
			for (int i = 0; i < w; i++)
				Main.tile[i, j] = new Tile();
		void Set(int i, int j, int ty, int v)
		{
			var t = Main.tile[i, j];
			if (ty >= 0)
			{
				t.active(active: true);
				t.type = (ushort)ty;
			}
			t.frameNumber((byte)v);
		}
		if (c.TryGetProperty("cells", out var cells))
		{
			foreach (var cell in cells.EnumerateArray())
				Set(cell[0].GetInt32(), cell[1].GetInt32(), cell[2].GetInt32(), cell[3].GetInt32());
		}
		else
		{
			var type = c.GetProperty("type");
			var variant = c.GetProperty("variant");
			for (int j = 0; j < h; j++)
				for (int i = 0; i < w; i++)
					Set(i, j, type[j * w + i].GetInt32(), variant[j * w + i].GetInt32());
		}
		foreach (var op in c.GetProperty("ops").EnumerateArray())
		{
			string name = op[0].GetString();
			int I(int n) => op[n].GetInt32();
			switch (name)
			{
				case "frameAll":
					for (int i = 0; i < w; i++)
						for (int j = 0; j < h; j++)
							WorldGen.TileFrame(i, j);
					break;
				case "frame":
					WorldGen.TileFrame(I(1), I(2));
					break;
				case "square":
					WorldGen.SquareTileFrame(I(1), I(2), resetFrame: false);
					break;
				case "place":
				{
					var t = Main.tile[I(1), I(2)];
					t.Clear(TileDataType.Tile | TileDataType.TilePaint | TileDataType.Slope);
					t.active(active: true);
					t.type = (ushort)I(3);
					t.frameNumber((byte)I(4));
					WorldGen.SquareTileFrame(I(1), I(2), resetFrame: false);
					break;
				}
				case "kill":
				{
					var t = Main.tile[I(1), I(2)];
					t.active(active: false);
					t.halfBrick(halfBrick: false);
					t.frameX = -1;
					t.frameY = -1;
					t.frameNumber(0);
					WorldGen.SquareTileFrame(I(1), I(2), resetFrame: false);
					break;
				}
				case "convert":
				{
					var t = Main.tile[I(1), I(2)];
					t.type = (ushort)I(3);
					t.frameNumber((byte)I(4));
					WorldGen.SquareTileFrame(I(1), I(2), resetFrame: false);
					break;
				}
				default:
					throw new System.Exception($"unknown op {name}");
			}
		}
		int x0 = 0, y0 = 0, x1 = w, y1 = h;
		if (c.TryGetProperty("region", out var region))
		{
			x0 = region[0].GetInt32();
			y0 = region[1].GetInt32();
			x1 = region[2].GetInt32();
			y1 = region[3].GetInt32();
		}
		int rw = x1 - x0;
		var fx = new int[rw * (y1 - y0)];
		var fy = new int[fx.Length];
		var fv = new int[fx.Length];
		for (int j = y0; j < y1; j++)
		{
			for (int i = x0; i < x1; i++)
			{
				var t = Main.tile[i, j];
				int k = (j - y0) * rw + (i - x0);
				fx[k] = t.frameX;
				fy[k] = t.frameY;
				fv[k] = t.frameNumber();
			}
		}
		return new { frameX = fx, frameY = fy, variant = fv };
	}
}
