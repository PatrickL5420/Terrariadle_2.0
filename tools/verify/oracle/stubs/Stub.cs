// Stand-ins for game code a feature doesn't need (ours, not the game's). A stub that should
// never run calls Stub.Hit: the run is then refused, so a case can't quietly take a path we
// haven't extracted (the game's TileFrame catches every exception, so throwing isn't enough).
using System.Collections.Generic;

namespace Oracle;

public static class Stub
{
	public static readonly HashSet<string> Hits = new();

	public static void Hit(string what) => Hits.Add(what);

	/** An exception the game's code caught and ignored: the case is refused. */
	public static void Caught(System.Exception e) => Hits.Add($"caught: {e.GetType().Name}: {e.Message} {e.StackTrace?.Split('\n')[0]}");
}
