// Builds Main.tile from a case, as WorldGen.setWorldSize and a loaded world would leave it.
using System.Text.Json;
using Terraria;

namespace Oracle;

public static class WorldSetup
{
	/**
	 * {"w", "h", "cells": [[i, j, type, variant], ...]} (the rest empty), or "type" / "variant"
	 * arrays (row-major, -1 for none); "walls": [[i, j], ...] puts a dirt wall (2) behind those.
	 * Sets Main.maxTilesX/Y, bottomWorld and rightWorld.
	 */
	public static void Load(JsonElement c)
	{
		int w = c.GetProperty("w").GetInt32();
		int h = c.GetProperty("h").GetInt32();
		Main.maxTilesX = w;
		Main.maxTilesY = h;
		Main.bottomWorld = Main.maxTilesY * 16;
		Main.rightWorld = Main.maxTilesX * 16;
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
				Set(cell[0].GetInt32(), cell[1].GetInt32(), cell[2].GetInt32(), cell.GetArrayLength() > 3 ? cell[3].GetInt32() : 0);
		}
		else if (c.TryGetProperty("type", out var type))
		{
			var variant = c.GetProperty("variant");
			for (int j = 0; j < h; j++)
				for (int i = 0; i < w; i++)
					Set(i, j, type[j * w + i].GetInt32(), variant[j * w + i].GetInt32());
		}
		if (c.TryGetProperty("walls", out var walls))
			foreach (var wall in walls.EnumerateArray())
				Main.tile[wall[0].GetInt32(), wall[1].GetInt32()].wall = 2;
	}
}
