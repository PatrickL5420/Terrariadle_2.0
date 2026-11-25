// Ours, not the game's: an empty item (new Item(), the game's own field defaults) is all the
// oracle's player holds; setting one up as a real item isn't needed.
using Microsoft.Xna.Framework;
using Oracle;

namespace Terraria;

public partial class Item
{
	public void SetDefaults(int Type, ItemVariant variant = null) => Stub.Hit("Item.SetDefaults");

	/** Item.GetDrawHitbox: the item texture's frame, for the items this world has (static/world). */
	public static Rectangle GetDrawHitbox(int type, Player user)
	{
		switch (type)
		{
			case 0:
				return default; // no item (PlayerFrame only loads it)
			case 2:
			case 3:
				return new Rectangle(0, 0, 16, 16);
			case 3509:
				return new Rectangle(0, 0, 32, 32);
		}
		Stub.Hit($"Item.GetDrawHitbox({type})");
		return default;
	}
}
