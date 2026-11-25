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

	public Color(float r, float g, float b, float a = 1f)
		: this((int)(r * 255f), (int)(g * 255f), (int)(b * 255f), (int)(a * 255f)) { }

	public static Color operator *(Color c, float f) =>
		new((int)(c.R * f), (int)(c.G * f), (int)(c.B * f), (int)(c.A * f));

	public static bool operator ==(Color a, Color b) => a.R == b.R && a.G == b.G && a.B == b.B && a.A == b.A;
	public static bool operator !=(Color a, Color b) => !(a == b);
	public override bool Equals(object o) => o is Color c && c == this;
	public override int GetHashCode() => (R << 24) | (G << 16) | (B << 8) | A;
	public static Color White => new(255, 255, 255);
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

public struct Point
{
	public int X, Y;

	public Point(int x, int y)
	{
		X = x;
		Y = y;
	}
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
