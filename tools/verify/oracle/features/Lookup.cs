// Reads the game's static tables by name: {"fields": ["Main.tileSolid", "TileID.Sets.Dirt",
// "TileID.Sets.Conversion.Grass", ...], "indices": [0, 1, 2]} -> {name: [value at each index]}.
// Non-array fields return their value. For checking what a port assumes about the game's data.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;

namespace Oracle;

public class LookupFeature : IFeature
{
	public object Run(JsonElement c)
	{
		var indices = c.TryGetProperty("indices", out var ix) ? ix.EnumerateArray().Select(e => e.GetInt32()).ToArray() : new int[0];
		var result = new Dictionary<string, object>();
		foreach (var f in c.GetProperty("fields").EnumerateArray())
		{
			string path = f.GetString();
			object value = Resolve(path);
			if (value is Array array)
				result[path] = indices.Select(i => i >= 0 && i < array.Length ? array.GetValue(i) : null).ToArray();
			else
				result[path] = value;
		}
		return result;
	}

	/** "TileID.Sets.Conversion.Grass" -> the static field Terraria.ID.TileID+Sets+Conversion.Grass. */
	static object Resolve(string path)
	{
		var parts = path.Split('.');
		var asm = typeof(Terraria.Main).Assembly;
		foreach (var ns in new[] { "Terraria.", "Terraria.ID.", "" })
		{
			for (int n = parts.Length - 1; n >= 1; n--)
			{
				var type = asm.GetType(ns + string.Join("+", parts.Take(n)));
				if (type == null) continue;
				object value = null;
				var t = type;
				for (int k = n; k < parts.Length; k++)
				{
					const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
					var field = t.GetField(parts[k], all);
					var prop = field == null ? t.GetProperty(parts[k], all) : null;
					if (field == null && prop == null) { t = null; break; }
					value = field != null ? field.GetValue(null) : prop.GetValue(null);
				}
				if (t != null) return value;
			}
		}
		throw new Exception($"no such field: {path}");
	}
}
