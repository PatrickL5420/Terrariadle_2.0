// Just enough of XNA's maths types for the game's code to compile and run. Ours, not the game's.
using System;

namespace Microsoft.Xna.Framework;

public struct Color
{
	public byte R, G, B, A;

	public Color(int r, int g, int b, int a = 255)
	{
		R = (byte)Math.Clamp(r, 0, 255);
		G = (byte)Math.Clamp(g, 0, 255);
		B = (byte)Math.Clamp(b, 0, 255);
		A = (byte)Math.Clamp(a, 0, 255);
	}

	public Color(uint packed) : this((int)(packed & 0xFF), (int)((packed >> 8) & 0xFF), (int)((packed >> 16) & 0xFF), (int)(packed >> 24)) { }

	public Color(Vector3 v) : this(v.X, v.Y, v.Z) { }

	public Color(Vector4 v) : this(v.X, v.Y, v.Z, v.W) { }

	public Color(float r, float g, float b, float a = 1f)
		: this((int)(r * 255f), (int)(g * 255f), (int)(b * 255f), (int)(a * 255f)) { }

	public static Color operator *(Color c, float f) =>
		new((int)(c.R * f), (int)(c.G * f), (int)(c.B * f), (int)(c.A * f));

	public static bool operator ==(Color a, Color b) => a.R == b.R && a.G == b.G && a.B == b.B && a.A == b.A;
	public static bool operator !=(Color a, Color b) => !(a == b);
	public override bool Equals(object o) => o is Color c && c == this;
	public override int GetHashCode() => (R << 24) | (G << 16) | (B << 8) | A;
	public static Color White => new(255, 255, 255);
	public static Color Black => new(0, 0, 0);
	public static Color Red => new(255, 0, 0);
	public static Color LimeGreen => new(50, 205, 50);
	public static Color Green => new(0, 128, 0);
	public static Color Yellow => new(255, 255, 0);
	public static Color Cyan => new(0, 255, 255);
	public static Color HotPink => new(255, 105, 180);
	public static Color Gold => new(255, 215, 0);

	public static Color Lerp(Color a, Color b, float t) =>
		new((int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t), (int)(a.A + (b.A - a.A) * t));
	public static Color Transparent => new(0, 0, 0, 0);
}

public struct Vector2
{
	public float X, Y;

	public Vector2(float x, float y)
	{
		X = x;
		Y = y;
	}

	public Vector2(float v) : this(v, v) { }

	public static Vector2 Zero => new(0, 0);
	public static Vector2 One => new(1, 1);
	public static Vector2 UnitX => new(1, 0);
	public static Vector2 UnitY => new(0, 1);
	public float Length() => MathF.Sqrt(X * X + Y * Y);
	public float LengthSquared() => X * X + Y * Y;

	public void Normalize()
	{
		float l = Length();
		X /= l;
		Y /= l;
	}

	public static Vector2 Normalize(Vector2 v)
	{
		v.Normalize();
		return v;
	}

	public static float Distance(Vector2 a, Vector2 b) => (a - b).Length();
	public static float Dot(Vector2 a, Vector2 b) => a.X * b.X + a.Y * b.Y;
	public static Vector2 Lerp(Vector2 a, Vector2 b, float t) => new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
	public static Vector2 operator +(Vector2 a, Vector2 b) => new(a.X + b.X, a.Y + b.Y);
	public static Vector2 operator -(Vector2 a, Vector2 b) => new(a.X - b.X, a.Y - b.Y);
	public static Vector2 operator -(Vector2 a) => new(-a.X, -a.Y);
	public static Vector2 operator *(Vector2 a, float f) => new(a.X * f, a.Y * f);
	public static Vector2 operator *(float f, Vector2 a) => new(a.X * f, a.Y * f);
	public static Vector2 operator *(Vector2 a, Vector2 b) => new(a.X * b.X, a.Y * b.Y);
	public static Vector2 operator /(Vector2 a, float f) => new(a.X / f, a.Y / f);
	public static bool operator ==(Vector2 a, Vector2 b) => a.X == b.X && a.Y == b.Y;
	public static bool operator !=(Vector2 a, Vector2 b) => !(a == b);
	public override bool Equals(object o) => o is Vector2 v && v == this;
	public override int GetHashCode() => HashCode.Combine(X, Y);
}

public struct Vector3
{
	public float X, Y, Z;

	public Vector3(float x, float y, float z)
	{
		X = x;
		Y = y;
		Z = z;
	}

	public static Vector3 Zero => new(0, 0, 0);
	public static Vector3 operator *(Vector3 a, float f) => new(a.X * f, a.Y * f, a.Z * f);
}

public struct Vector4
{
	public float X, Y, Z, W;

	public Vector4(float x, float y, float z, float w)
	{
		X = x;
		Y = y;
		Z = z;
		W = w;
	}

	public Vector4(Vector2 xy, float z, float w) : this(xy.X, xy.Y, z, w) { }
}

public struct Point
{
	public int X, Y;

	public Point(int x, int y)
	{
		X = x;
		Y = y;
	}

	public static Point Zero => new(0, 0);
	public static bool operator ==(Point a, Point b) => a.X == b.X && a.Y == b.Y;
	public static bool operator !=(Point a, Point b) => !(a == b);
	public override bool Equals(object o) => o is Point p && p == this;
	public override int GetHashCode() => System.HashCode.Combine(X, Y);
}

public struct Rectangle
{
	public int X, Y, Width, Height;

	public Rectangle(int x, int y, int w, int h)
	{
		X = x;
		Y = y;
		Width = w;
		Height = h;
	}

	public static Rectangle Intersect(Rectangle a, Rectangle b)
	{
		int x = System.Math.Max(a.X, b.X);
		int y = System.Math.Max(a.Y, b.Y);
		int r = System.Math.Min(a.Right, b.Right);
		int bt = System.Math.Min(a.Bottom, b.Bottom);
		return r > x && bt > y ? new Rectangle(x, y, r - x, bt - y) : new Rectangle(0, 0, 0, 0);
	}

	public void Offset(int x, int y)
	{
		X += x;
		Y += y;
	}

	public Point Center => new(X + Width / 2, Y + Height / 2);
	public int Left => X;
	public int Right => X + Width;
	public int Top => Y;
	public int Bottom => Y + Height;

	public bool Intersects(Rectangle r) =>
		r.X < X + Width && X < r.X + r.Width && r.Y < Y + Height && Y < r.Y + r.Height;

	public void Inflate(int x, int y)
	{
		X -= x;
		Y -= y;
		Width += x * 2;
		Height += y * 2;
	}
}
