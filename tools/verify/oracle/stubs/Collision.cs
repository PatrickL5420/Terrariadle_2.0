// Ours, not the game's: Collision checks movement doesn't use (line of sight, water walking).
using Microsoft.Xna.Framework;
using Oracle;

namespace Terraria;

public partial class Collision
{
	public static bool CanHit(Entity source, Entity target) => Refuse("CanHit");
	public static bool CanHit(Vector2 Position1, int Width1, int Height1, Vector2 Position2, int Width2, int Height2) => Refuse("CanHit");
	public static bool CanHitLine(Vector2 Position1, int Width1, int Height1, Vector2 Position2, int Width2, int Height2) => Refuse("CanHitLine");

	public static Vector2 WaterCollision(Vector2 Position, Vector2 Velocity, int Width, int Height, bool fallThrough = false, bool fall2 = false, bool lavaWalk = true)
	{
		Stub.Hit("Collision.WaterCollision");
		return Velocity;
	}

	public static bool TryChangingSizeFromBottomCenter(Rectangle hitbox, int targetWidth, int targetHeight, out Rectangle changedHitbox)
	{
		changedHitbox = hitbox;
		return Refuse("TryChangingSizeFromBottomCenter");
	}

	// Conveyor belts (StepConveyorBelt): none here.
	public static bool CheckAABBvLineCollision(Vector2 aabbPosition, Vector2 aabbDimensions, Vector2 lineStart, Vector2 lineEnd) => Refuse("CheckAABBvLineCollision");
	public static bool CheckAABBvLineCollision2(Vector2 aabbPosition, Vector2 aabbDimensions, Vector2 lineStart, Vector2 lineEnd) => Refuse("CheckAABBvLineCollision2");

	static bool Refuse(string what)
	{
		Stub.Hit($"Collision.{what}");
		return false;
	}
}
