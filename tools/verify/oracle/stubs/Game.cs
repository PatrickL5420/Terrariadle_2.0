// Stubs for game classes and methods outside what the oracle runs. Ours, not the game's.
using Oracle;
using Terraria.ID;

namespace Terraria
{

	public static class NetMessage
	{
		public static void SendData(int msgType, int remoteClient = -1, int ignoreClient = -1, object text = null, int number = 0, float number2 = 0f, float number3 = 0f, float number4 = 0f, int number5 = 0, int number6 = 0, int number7 = 0) =>
			Stub.Hit("NetMessage.SendData");
	}

	public static class Framing
	{
		public static Tile GetTileSafely(int i, int j)
		{
			if (!WorldGen.InWorld(i, j)) return new Tile();
			return Main.tile[i, j] ??= new Tile();
		}

		public static void SelfFrame8Way(int i, int j, Tile centerTile, bool resetFrame) =>
			Stub.Hit("Framing.SelfFrame8Way");
	}

	public static class Liquid
	{
		public static void AddWater(int x, int y) { }
	}

	public static class MapUpdateQueue
	{
		public static void Add(int x, int y) { }
	}

	public partial class Main
	{
		public static void AnimateTiles_CritterCages() { }
		public dynamic CameraModifiers;
	}

	public partial class WorldGen
	{
		public static void TileFrameImportant(int i, int j, int type, Tile tile, bool resetFrame) =>
			Stub.Hit("WorldGen.TileFrameImportant");

		public static void CactusFrame(int i, int j) => Stub.Hit("WorldGen.CactusFrame");

		public static bool CheckCactus(int i, int j)
		{
			Stub.Hit("WorldGen.CheckCactus");
			return false;
		}

		public static void CheckOnTable1x1(int x, int y, int type) => Stub.Hit("WorldGen.CheckOnTable1x1");

		public static bool CheckVines(int i, int j, int type, Tile tile)
		{
			Stub.Hit("WorldGen.CheckVines");
			return true;
		}

		public static bool SpawnFallingBlockProjectile(int i, int j, int type, Tile tileCache)
		{
			Stub.Hit("WorldGen.SpawnFallingBlockProjectile");
			return false;
		}

		public static bool CanPoundTile(int x, int y)
		{
			Stub.Hit("WorldGen.CanPoundTile");
			return false;
		}

		public static void GetRopeEnds(int x, int y, out int topRopeY, out int bottomRopeY, bool treatEmptyAsTheRopeEnd, int rangeToCheck)
		{
			Stub.Hit("WorldGen.GetRopeEnds");
			topRopeY = bottomRopeY = y;
		}
	}
}

namespace Terraria.ID
{
	// Only their sizes are used (the counts from the game's ID classes).
	public static class WallID
	{
		public static readonly ushort Count = 367;

		public static class Sets
		{
			public static int[] BlendType = new int[Count];
		}
	}

	public static class NPCID
	{
		public static readonly short Count = 697;
	}

	public static class ProjectileID
	{
		public static readonly short Count = 1136;
	}

	public static class BuffID
	{
		public static readonly int Count = 401;

		public static class Sets
		{
			public static int[] MountType = new int[Count];
			public static bool[] AddBuffTimeAdditivelyToCap = new bool[Count];
			public static bool[] BuffTimeIsExtendedByDeadCellsPotionStationBuff = new bool[Count];
			public static bool[] BuffTimeIsExtendedWithGameDifficulty = new bool[Count];
			public static bool[] IsFedState = new bool[Count];
		}
	}
}
