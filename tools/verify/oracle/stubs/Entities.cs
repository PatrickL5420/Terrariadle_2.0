// Ours, not the game's: other entities and minecarts, which a plain player moving about never
// meets (no NPCs or projectiles exist in a case; a minecart track would need a mount).
using Microsoft.Xna.Framework;
using Oracle;

namespace Terraria;

public partial class NPC : Entity { }

public partial class Projectile : Entity { }

public partial class NPC
{
	public static void GetMeleeCollisionData(Rectangle victimHitbox, int enemyIndex, ref int specialHitSetter, ref float damageMultiplier, ref Rectangle npcRect) =>
		Stub.Hit("NPC.GetMeleeCollisionData");
}

public partial class Minecart
{
	public static BitsByte TrackCollision(Player Player, ref Vector2 Position, ref Vector2 Velocity, ref Vector2 lastBoost, int Width, int Height, bool followDown, bool followUp, int fallStart, bool trackOnly, Mount.MountDelegatesData delegatesData)
	{
		Stub.Hit("Minecart.TrackCollision");
		return default;
	}

	public static float TrackRotation(Player player, ref float rotation, Vector2 Position, int Width, int Height, bool followDown, bool followUp, Mount.MountDelegatesData delegatesData)
	{
		Stub.Hit("Minecart.TrackRotation");
		return 0f;
	}
}

// Riding a mount: a plain player has none (Mount.Active is false), so none of these run.
public partial class Mount
{
	public bool Hover(Player mountedPlayer)
	{
		Stub.Hit("Mount.Hover");
		return false;
	}

	public void UpdateFrame(Player mountedPlayer, int state, Vector2 velocity) => Stub.Hit("Mount.UpdateFrame");

	public void Dismount(Player mountedPlayer, bool ignoreEffect = false) => Stub.Hit("Mount.Dismount");
}

// Minecart sounds and sparks (Mount.MountDelegatesData's defaults): only used on a track.
public static partial class DelegateMethods
{
	public static class Minecart
	{
		public static System.Action<Vector2> Sparks;
		public static System.Action<Player, Vector2, int, int> JumpingSound;
		public static System.Action<Player, Vector2, int, int> LandingSound;
		public static System.Action<Player, Vector2, int, int> BumperSound;
		public static float rotation;
		public static Vector2 rotationOrigin;
	}
}

// Achievements: counting, never moving anyone.
public partial class AchievementsHelper
{
	public static void HandleRunning(float pixelsMoved) { }

	// Achievement progress (mining, blocks destroyed): bookkeeping only.
	public static bool CurrentlyMining { get; set; }
	public static void NotifyTileDestroyed(Player player, ushort tile) { }
	public static void HandleMining() { }
}


// Localised text (names, tooltips, chat): only ever displayed.
public partial class NetworkText
{
	public static NetworkText FromKey(string key, params object[] substitutions) => new NetworkText();
	public static NetworkText FromLiteral(string text) => new NetworkText();
}

// Game assets (textures, effects): only ever drawn, never loaded here.
public class Asset<T> where T : class
{
	public static Asset<T> Empty => new();
	public T Value => null;
	public bool IsLoaded => false;
}

// The game's debug assertions: a failing one refuses the case.
public partial class Invariant
{
	public static void Assert(bool condition, string message = null)
	{
		if (!condition) Oracle.Stub.Hit($"Invariant.Assert: {message}");
	}
}

// Whip tag effects (ItemID.Sets needs their class hierarchy; whips aren't used here).
public partial class UniqueTagEffect { }
public partial class WhipTagEffect : UniqueTagEffect { }
public partial class WhipTagEffect_Constellation : WhipTagEffect { }
public partial class WhipTagEffect_DarkHarvest : WhipTagEffect { }
public partial class WhipTagEffect_ElectricEel : WhipTagEffect { }
public partial class WhipTagEffect_Firecracker : WhipTagEffect { }
public partial class WhipTagEffect_Kaleidoscope : WhipTagEffect { }
public partial class WhipTagEffect_Possession : WhipTagEffect { }
public partial class WhipTagEffect_Starcrash : WhipTagEffect { }
public partial class WhipTagEffect_SwordWhip : WhipTagEffect { }
public partial class WhipTagEffect_ViolentDisplayOfFlower : WhipTagEffect { }

// Dye shaders: only dye items have a shader ID; the items here (tools, blocks) have none.
public partial class GameShaders
{
	public class ShaderIds(short none)
	{
		/// The "no shader" answer: 0 for armour dyes, -1 for hair dyes (as the game's sets).
		public short GetShaderIdFromItemId(int type) => none;

		public object GetSecondaryShader(int shaderId, Player player) => null;
	}

	public static readonly ShaderIds Armor = new(0);
	public static readonly ShaderIds Hair = new(-1);
}

// Entity sources (who spawned what): bookkeeping for drops; any entity can be one.
public interface IEntitySourceTarget { }

public partial class Entity : IEntitySourceTarget { }

// Tile entities (chests, signs, mannequins...): none here.
public partial class TileEntity
{
	public static bool TryGetAt<T>(int x, int y, out T result) where T : class
	{
		result = null;
		return false;
	}
}

public class TileEntityType<T>
{
	public static int Find(int x, int y) => -1;
	public static void Kill(int x, int y) { }
	public static int Place(int x, int y) => -1;
}

// What item use reads of every NPC and projectile slot (all empty in a case): typed, so a
// check like `npc.active && npc.type == 4` runs as the game's does.
public partial class NPC
{
	public bool active;
	public int type;
	public int netID;
	public int aiStyle;
	public int catchItem;
	public bool friendly;
	public bool dontTakeDamage;
	public bool noTileCollide;
	public int realLife = -1;

	// A fresh world: no bosses down, no world-changing items used yet.
	public static bool combatBookWasUsed;
	public static bool combatBookVolumeTwoWasUsed;
	public static bool peddlersSatchelWasUsed;
	public static bool downedBoss3;
	public static bool downedGolemBoss;
}

public partial class Projectile
{
	public bool active;
	public int type;
	public int aiStyle;
	public bool minion;
	public bool sentry;
	public bool trap;
	public bool melee;
	public bool bobber;
	public int owner = 255;
}
