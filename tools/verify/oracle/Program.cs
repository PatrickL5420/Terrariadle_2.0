// The oracle: runs Terraria's own code (extracted into game/) on cases from tools/verify.
// Protocol: one JSON request per line on stdin, {"feature": "framing", "case": {...}}; one JSON
// line per request on stdout: {"result": ...}, or {"error": "..."}, or {"stubs": [...]} when the
// case reached code that's only stubbed (so the answer can't be trusted).
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Oracle;

public interface IFeature
{
	/** Runs one case and returns its result (serialised as JSON). */
	object Run(JsonElement c);
}

public static class Program
{
	/** Every feature the oracle knows. Adding one: a class in features/ and a line here. */
	static readonly Dictionary<string, IFeature> Features = new()
	{
		["framing"] = new FramingFeature(),
		["lookup"] = new LookupFeature(),
		["collision"] = new CollisionFeature(),
		["movement"] = new MovementFeature()
	};

	public static int Main(string[] args)
	{
		Terraria.Main.InitTileData();
		var stdin = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
		var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = false };
		var options = new JsonSerializerOptions { IncludeFields = true };
		string line;
		while ((line = stdin.ReadLine()) != null)
		{
			if (line.Length == 0) continue;
			string reply;
			try
			{
				using var doc = JsonDocument.Parse(line);
				var feature = Features[doc.RootElement.GetProperty("feature").GetString()];
				Stub.Hits.Clear();
				var result = feature.Run(doc.RootElement.GetProperty("case"));
				reply = Stub.Hits.Count > 0
					? JsonSerializer.Serialize(new { stubs = Stub.Hits })
					: JsonSerializer.Serialize(new { result }, options);
			}
			catch (Exception e)
			{
				reply = JsonSerializer.Serialize(new { error = e.ToString() });
			}
			stdout.WriteLine(reply);
		}
		stdout.Flush();
		return 0;
	}
}
