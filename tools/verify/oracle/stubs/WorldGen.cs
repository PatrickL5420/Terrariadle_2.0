// Ours, not the game's: what the world generation passes read that the oracle sets itself.
using System.Collections.Generic;
using Oracle;
using Terraria.ID;

namespace Terraria.IO
{
	/// The world generation settings (Terraria.GameContent.WorldBuilding.Configuration.json): only
	/// the values the passes run here read, as the game's file has them.
	public class GameConfiguration
	{
		public readonly Dictionary<string, object> Values = new() { ["FlatBeachPadding"] = 5 };

		public T Get<T>(string entry) => (T)Values[entry];
	}
}

namespace Terraria
{
	public partial class WorldGen
	{
		/// The secret seeds ("for the worthy", "no surface"...): none on, a normal world.
		public static class SecretSeed
		{
			public class Seed
			{
				public bool Enabled => false;
			}

			public static readonly Seed noSurface = new();
			public static readonly Seed surfaceIsInSpace = new();
			public static readonly Seed surfaceIsDesert = new();
			public static readonly Seed dualDungeons = new();
			public static readonly Seed digExtraHoles = new();
			public static readonly Seed roundLandmasses = new();

			public static void DoDigExtraHoles() => Stub.Hit("SecretSeed.DoDigExtraHoles");
			public static void DoRoundLandMasses() => Stub.Hit("SecretSeed.DoRoundLandMasses");
		}

		/// The game's own first checks (no tree standing on the block), refusing only past them:
		/// there are no trees yet.
		public static bool TryConvertingOrKillingTreesAboveIfTheyWouldBecomeInvalid(int i, int j, int newFloorType)
		{
			if (newFloorType < 0 || newFloorType >= TileID.Count) return false;
			if (!InWorld(i, j, 2)) return false;
			Tile tile = Main.tile[i, j];
			if (tile == null || !tile.active()) return false;
			Tile tile2 = Main.tile[i, j - 1];
			if (tile2 == null || !tile2.active()) return false;
			if (!IsTreeType(tile2.type) && tile2.type != 323) return false;
			Stub.Hit("WorldGen.TryConvertingOrKillingTreesAboveIfTheyWouldBecomeInvalid");
			return false;
		}

		/// The Skyblock seed's generator: off.
		public static class Skyblock
		{
			public static bool denyAllGeneration => false;
		}
	}

	/// Text shown while generating (the progress messages): empty.
	public partial class Lang
	{
		public static readonly LocalizedText[] gen = System.Linq.Enumerable.Range(0, 100).Select(_ => new LocalizedText()).ToArray();
	}

	public partial class LocalizedText
	{
		public string Value => "";
	}

	public partial class Language
	{
		public static string GetTextValue(string key, params object[] args) => "";
	}

	/// The dungeon's bounds: only asked about with the dual-dungeons seed on.
	public static class DungeonUtils
	{
		public static bool InAnyPotentialDungeonBounds(int x, int y)
		{
			Stub.Hit("DungeonUtils.InAnyPotentialDungeonBounds");
			return false;
		}

		public static bool IsConsideredDungeonTile(int tileType, bool allDungeons = false)
		{
			Stub.Hit("DungeonUtils.IsConsideredDungeonTile");
			return false;
		}
	}
}
