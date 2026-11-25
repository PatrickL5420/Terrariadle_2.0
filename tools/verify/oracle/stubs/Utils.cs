// Ours, not the game's: Utils helpers movement code names but a plain player never uses.
using Microsoft.Xna.Framework;
using Oracle;

namespace Terraria;

public static partial class Utils
{
	public static Vector2 RotatedBy(this Vector2 spinningpoint, double radians, Vector2 center = default)
	{
		float c = (float)System.Math.Cos(radians);
		float s = (float)System.Math.Sin(radians);
		Vector2 v = spinningpoint - center;
		return center + new Vector2(v.X * c - v.Y * s, v.X * s + v.Y * c);
	}

	public static bool RectangleLineCollision(Vector2 rectTopLeft, Vector2 rectBottomRight, Vector2 lineStart, Vector2 lineEnd)
	{
		Stub.Hit("Utils.RectangleLineCollision");
		return false;
	}
}
