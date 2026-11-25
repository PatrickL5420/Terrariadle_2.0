// An item as the game sets it up: {"type": 3509, "fields": ["useTime", "pick", ...]} ->
// {field: value} after Item.SetDefaults(type). For checking the stats a port assumes.
using System.Collections.Generic;
using System.Reflection;
using System.Text.Json;
using Terraria;

namespace Oracle;

public class ItemDefaultsFeature : IFeature
{
	public object Run(JsonElement c)
	{
		var item = new Item();
		item.SetDefaults(c.GetProperty("type").GetInt32());
		var result = new Dictionary<string, object>();
		const System.Reflection.BindingFlags all = System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance;
		foreach (var f in c.GetProperty("fields").EnumerateArray())
		{
			string name = f.GetString();
			var field = typeof(Item).GetField(name, all);
			var prop = field == null ? typeof(Item).GetProperty(name, all) : null;
			result[name] = field != null ? field.GetValue(item) : prop?.GetValue(item);
		}
		return result;
	}
}
