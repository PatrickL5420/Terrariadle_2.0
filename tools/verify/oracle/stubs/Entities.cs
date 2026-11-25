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
}

// ItemID.Count from the game's ItemID (sizes Main's item tables).
public partial class ItemID
{
	public static readonly short Count = 6196;
}
