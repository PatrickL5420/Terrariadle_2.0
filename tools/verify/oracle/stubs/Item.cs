// Ours, not the game's: the parts of Item the oracle stands in for (items are otherwise the
// game's own: its fields, and Item.SetDefaults with all its item tables).
using Microsoft.Xna.Framework;
using Oracle;

namespace Terraria;

public partial class Item
{
	/**
	 * Item.NewItem (an item dropped into the world): recorded, not spawned. What the game asks
	 * to drop is what a case compares; where it flies is random in the game too.
	 */
	public static int NewItem(IEntitySource source, int X, int Y, int Width, int Height, int type, int stack = 1, bool noBroadcast = false, int prefix = 0, NewItemOwnership ownership = NewItemOwnership.None, Vector2? velocity = null, object modifier = null)
	{
		Recorder.Drops.Add(new { type, stack, x = X, y = Y, w = Width, h = Height });
		return 0;
	}

	public static int NewItem(IEntitySource source, Vector2 center, int type, int stack = 1, int prefix = 0, NewItemOwnership ownership = NewItemOwnership.None, Vector2? velocity = null, object modifier = null, bool noBroadcast = false)
	{
		Recorder.Drops.Add(new { type, stack, cx = center.X, cy = center.Y });
		return 0;
	}

	/** The tooltip's text: only shown. */
	public void RebuildTooltip() { }

	/** Rolling a prefix (reforging, crafting): not here. */
	public bool Prefix(int prefixWeWant)
	{
		Stub.Hit("Item.Prefix");
		return false;
	}

	/** Items by negative network ID (old item variants): not used here. */
	public void netDefaults(int type) => Stub.Hit("Item.netDefaults");

	/** Item.GetDrawHitbox: the item texture's frame, for the items this world has (static/world). */
	public static Rectangle GetDrawHitbox(int type, Player user)
	{
		switch (type)
		{
			case 0:
				return default; // no item (PlayerFrame only loads it)
			case 2:
			case 3:
			case 133: // (the Clay Block's icon is 16x16 too)
				return new Rectangle(0, 0, 16, 16);
			case 8: // a Torch
				return new Rectangle(0, 0, 14, 16);
			case 3506: // the Copper Axe
				return new Rectangle(0, 0, 32, 28);
			case 3509:
				return new Rectangle(0, 0, 32, 32);
		}
		Stub.Hit($"Item.GetDrawHitbox({type})");
		return default;
	}
}
