// Ours, not the game's: what Player.ItemCheck reaches that swinging a pickaxe or placing a plain
// block never does (multi-tile objects, flexible wands, extractinators, pets, particles). Each
// refuses the case if it's ever called, so a case can't take a path the oracle hasn't extracted.
using Microsoft.Xna.Framework;
using Oracle;

namespace Terraria;

/**
 * Item uses ItemCheck runs every frame, each of which starts by checking for its own items
 * (fishing poles, wires, instruments, buckets, the Rod of Discord, event and boss summons,
 * tree toppers, chest locks) and does nothing else for any other: for the items the oracle
 * holds (reviewed: the Copper Pickaxe and Axe, dirt, stone and clay blocks, and nothing once a stack is
 * used up) that's all they do here.
 */
public partial class Player
{
	static bool Reviewed(Item item) => item.type is 3509 or 3506 or 2 or 3 or 133 or 8 or 9 or 36 or 32 or 34 or 0; // 0: used up

	static void Only(Item item, string what)
	{
		if (!Reviewed(item)) Stub.Hit("Player." + what);
	}

	private bool ItemCheck_PullFishingBobbers(Item sItem)
	{
		Only(sItem, "ItemCheck_PullFishingBobbers");
		return true;
	}

	private void ItemCheck_UseWiringTools(Item sItem) => Only(sItem, "ItemCheck_UseWiringTools");
	private void ItemCheck_PlayInstruments(Item sItem) => Only(sItem, "ItemCheck_PlayInstruments");
	private void ItemCheck_UseBuckets(Item sItem) => Only(sItem, "ItemCheck_UseBuckets");
	private void ItemCheck_UseTeleportRod(Item sItem) => Only(sItem, "ItemCheck_UseTeleportRod");
	private void ItemCheck_UseEventItems(Item sItem) => Only(sItem, "ItemCheck_UseEventItems");
	private void ItemCheck_UseBossSpawners(int onWhichPlayer, Item sItem) => Only(sItem, "ItemCheck_UseBossSpawners");
	private void PlaceThing_XMasTreeTops() => Only(inventory[selectedItem], "PlaceThing_XMasTreeTops");
	private void PlaceThing_LockChest() => Only(inventory[selectedItem], "PlaceThing_LockChest");
	private void PlaceThing_Tiles_PlaceIt_SpinSmartPlatform() => Only(inventory[selectedItem], "PlaceThing_Tiles_PlaceIt_SpinSmartPlatform");
	private void ItemCheck_EmitHammushProjectiles(int i, Item sItem, Rectangle itemRectangle, int damage) => Only(sItem, "ItemCheck_EmitHammushProjectiles");

	// The game's own first checks (PvP off; not a hammer), refusing only past them.
	private void ItemCheck_MeleeHitPVP(Item sItem, Rectangle itemRectangle, int damage, float knockBack)
	{
		if (hostile) Stub.Hit("Player.ItemCheck_MeleeHitPVP");
	}

	private void ItemCheck_UseMiningTools_TryPoundingTile(Item sItem, int tileHitId, ref bool hitWall, int x, int y)
	{
		if (!poundRelease) return;
		Tile tile = Main.tile[x, y];
		if (sItem.hammer <= 0 || !tile.active())
		{
			poundRelease = false;
			return;
		}
		Stub.Hit("Player.ItemCheck_UseMiningTools_TryPoundingTile");
	}
}


public partial class ParticleOrchestrator
{
	public static void RequestParticleSpawn(bool clientOnly, object type, object settings, int? overrideInvokingPlayerIndex = null) =>
		Stub.Hit("ParticleOrchestrator.RequestParticleSpawn");
}

public partial class ParticleOrchestraType
{
	public static ParticleOrchestraType PlayerVoiceOverrideSound;
	public static ParticleOrchestraType PrincessWeapon;
}

/// Drawing only (HitTile's crack drawing).
/// (A number, as the decompiled code treats it: `effects | 1`.)
public struct SpriteEffects
{
	public int Value;
	public static readonly SpriteEffects None = 0;
	public static readonly SpriteEffects FlipHorizontally = 1;
	public static readonly SpriteEffects FlipVertically = 2;
	public static implicit operator SpriteEffects(int v) => new() { Value = v };
	public static implicit operator int(SpriteEffects e) => e.Value;
}

public partial class FlexibleTileWand
{
	public bool ConsumesAmmoItem;

	public bool TryGetPlacementOption(Player player, int randomSeed, int selectCycleOffset, out PlacementOption option, out Item itemToConsume)
	{
		option = null;
		itemToConsume = null;
		Stub.Hit("FlexibleTileWand.TryGetPlacementOption");
		return false;
	}
}

public partial class ItemTrader
{
	public class TradeOption
	{
		public int TakingItemStack, GivingItemType, GivingItemStack;
	}

	public bool TryGetTradeOption(Item item, out TradeOption option)
	{
		option = null;
		Stub.Hit("ItemTrader.TryGetTradeOption");
		return false;
	}
}

public class PlayerDeathReason
{
	public static PlayerDeathReason ByOther(int type) => null;
	public static PlayerDeathReason ByNPC(int index) => null;
}

public partial class NPC
{
	public static bool boughtCat;
	public static bool boughtDog;
	public static bool boughtBunny;

	public static void UnlockOrExchangePet(ref bool petBoughtFlag, int npcType, string textKeyForLicense, int netMessageData) =>
		Stub.Hit("NPC.UnlockOrExchangePet");
}

public partial class Projectile
{
	public void CheckUsability(Player player, ref bool currentlyUsable) => Stub.Hit("Projectile.CheckUsability");
}

// Tile entities only a few furniture blocks have: never found in a case's world.
public partial class TEItemFrame
{
	public Item item;
	public void DropItem() => Stub.Hit("TEItemFrame.DropItem");
}

public partial class TEWeaponsRack
{
	public Item item;
	public void DropItem() => Stub.Hit("TEWeaponsRack.DropItem");
}

public partial class TEFoodPlatter
{
	public Item item;
	public void DropItem() => Stub.Hit("TEFoodPlatter.DropItem");
}

public partial class TEDeadCellsDisplayJar
{
	public Item item;
	public void DropItem() => Stub.Hit("TEDeadCellsDisplayJar.DropItem");
}

public partial class Chest
{
	/// The player's void vault (Player.bank4): never opened in a case.
	public static Chest CreateBank(int bankId) => null;
}

/// A mouse-and-keyboard player with no smart cursor and no fast-use (the Steam Deck's / Switch's).
public partial class PlayerInput
{
	public static bool UsingGamepad => false;
	public static bool ShouldFastUseItem => false;
	public static bool SteamDeckIsUsed => false;
	public static void TryEndingFastUse() { }
}

/// No Old One's Army event.
public partial class DD2Event
{
	public static bool Ongoing => false;
}

public partial class SmartCursorHelper
{
	/// No smart cursor, so no locked coordinates: the game's answer is then true.
	public static bool TileTargetDesired() => true;
}
