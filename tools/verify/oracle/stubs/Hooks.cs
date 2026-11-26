// Ours, not the game's: the placement hooks TileObjectData.Initialize hands to the furniture of
// other kinds (chests, mannequins, item frames, pylons...): never called for the furniture
// here, so each refuses the case if it is.
using Oracle;

namespace Terraria;

public partial class Chest
{
	public static int FindEmptyChest(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("Chest.FindEmptyChest");
		return 0;
	}
	public static int AfterPlacement_Hook(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("Chest.AfterPlacement_Hook");
		return 0;
	}
}

public partial class TECritterAnchor
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TECritterAnchor.Hook_AfterPlacement");
		return 0;
	}
}

public partial class TEDeadCellsDisplayJar
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TEDeadCellsDisplayJar.Hook_AfterPlacement");
		return 0;
	}
}

public partial class TEDisplayDoll
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TEDisplayDoll.Hook_AfterPlacement");
		return 0;
	}
}

public partial class TEFoodPlatter
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TEFoodPlatter.Hook_AfterPlacement");
		return 0;
	}
}

public partial class TEHatRack
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TEHatRack.Hook_AfterPlacement");
		return 0;
	}
}

public partial class TEItemFrame
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TEItemFrame.Hook_AfterPlacement");
		return 0;
	}
}

public partial class TEKiteAnchor
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TEKiteAnchor.Hook_AfterPlacement");
		return 0;
	}
}

public partial class TELogicSensor
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TELogicSensor.Hook_AfterPlacement");
		return 0;
	}
}

public partial class TETeleportationPylon
{
	public static int PlacementPreviewHook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TETeleportationPylon.PlacementPreviewHook_AfterPlacement");
		return 0;
	}
	public static int PlacementPreviewHook_CheckIfCanPlace(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TETeleportationPylon.PlacementPreviewHook_CheckIfCanPlace");
		return 0;
	}
}

public partial class TETrainingDummy
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TETrainingDummy.Hook_AfterPlacement");
		return 0;
	}
}

public partial class TEWeaponsRack
{
	public static int Hook_AfterPlacement(int x, int y, int type, int style, int direction, int alternate)
	{
		Stub.Hit("TEWeaponsRack.Hook_AfterPlacement");
		return 0;
	}
}
