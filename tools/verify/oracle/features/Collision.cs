// Collision.TileCollision, StepUp and StepDown on a small world (see WorldSetup).
using System.Text.Json;
using Microsoft.Xna.Framework;
using Terraria;

namespace Oracle;

/**
 * A case: a world, then {"op": "tile" | "stepUp" | "stepDown", "x", "y", "vx", "vy",
 * "width", "height", "stepSpeed", "gfxOffY", "fallThrough", "holdsMatching"}.
 * "tile": TileCollision's velocity and Collision.up / down. "stepUp" / "stepDown": the
 * position, velocity, stepSpeed and gfxOffY they leave. Floats are the game's (single).
 */
public class CollisionFeature : IFeature
{
	public object Run(JsonElement c)
	{
		WorldSetup.Load(c);
		var position = new Vector2(c.GetProperty("x").GetSingle(), c.GetProperty("y").GetSingle());
		var velocity = new Vector2(c.GetProperty("vx").GetSingle(), c.GetProperty("vy").GetSingle());
		int width = c.GetProperty("width").GetInt32();
		int height = c.GetProperty("height").GetInt32();
		bool Flag(string name) => c.TryGetProperty(name, out var v) && v.GetBoolean();
		switch (c.GetProperty("op").GetString())
		{
			case "tile":
			{
				Collision.up = Collision.down = false;
				var v = Collision.TileCollision(position, velocity, width, height, Flag("fallThrough"));
				return new { vx = v.X, vy = v.Y, up = Collision.up, down = Collision.down };
			}
			default:
			{
				float stepSpeed = c.GetProperty("stepSpeed").GetSingle();
				float gfxOffY = c.GetProperty("gfxOffY").GetSingle();
				if (c.GetProperty("op").GetString() == "stepUp")
					Collision.StepUp(ref position, ref velocity, width, height, ref stepSpeed, ref gfxOffY, 1, Flag("holdsMatching"));
				else
					Collision.StepDown(ref position, ref velocity, width, height, ref stepSpeed, ref gfxOffY);
				return new { x = position.X, y = position.Y, vx = velocity.X, vy = velocity.Y, stepSpeed, gfxOffY };
			}
		}
	}
}
