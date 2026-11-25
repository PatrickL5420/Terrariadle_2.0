// Stand-ins for the parts of ReLogic.dll the extracted game code names. Ours, not the game's.
namespace ReLogic.Reflection
{
	public class IdDictionary
	{
		public static IdDictionary Create<TClass, TId>() => new();
	}
}

namespace ReLogic.Utilities
{
	/// ReLogic's double-precision vector (not in the decompiled source): plain doubles.
	public struct Vector2D
	{
		public double X;
		public double Y;

		public Vector2D(double x, double y)
		{
			X = x;
			Y = y;
		}

		public static Vector2D Zero => default;
		public static bool operator ==(Vector2D a, Vector2D b) => a.X == b.X && a.Y == b.Y;
		public static bool operator !=(Vector2D a, Vector2D b) => !(a == b);
		public override bool Equals(object o) => o is Vector2D v && v == this;
		public override int GetHashCode() => X.GetHashCode() ^ Y.GetHashCode();
		public static Vector2D operator +(Vector2D a, Vector2D b) => new(a.X + b.X, a.Y + b.Y);
		public static Vector2D operator -(Vector2D a, Vector2D b) => new(a.X - b.X, a.Y - b.Y);
		public static Vector2D operator *(Vector2D a, double s) => new(a.X * s, a.Y * s);
		public static Vector2D operator /(Vector2D a, double s) => new(a.X / s, a.Y / s);
		public double Length() => System.Math.Sqrt(X * X + Y * Y);

		public static Vector2D Normalize(Vector2D v)
		{
			double n = 1.0 / v.Length();
			return new Vector2D(v.X * n, v.Y * n);
		}

		public static double Distance(Vector2D a, Vector2D b)
		{
			double dx = a.X - b.X, dy = a.Y - b.Y;
			return System.Math.Sqrt(dx * dx + dy * dy);
		}
	}
}
