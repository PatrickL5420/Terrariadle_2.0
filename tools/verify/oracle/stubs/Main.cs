// The parts of Main the extracted code needs that we set ourselves (not the game's code).
namespace Terraria;

public partial class Main
{
	/** No Echo Monolith, no Spectre Goggles: invisible blocks stay invisible. */
	public static bool ShouldShowInvisibleBlocksAndWalls() => false;
}

public partial class Main
{
	/** Main.Initialize_AlmostEverything's tile data, in the game's order. */
	public static void InitTileData()
	{
		Initialize_TileAndNPCData1();
		Initialize_TileAndNPCData2();
	}
}
