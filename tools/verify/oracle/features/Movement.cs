// A plain player (no items, armour, accessories, mount or buffs) moving about a small world,
// frame by frame: the game's Player.Update, the parts of it that move and animate such a player.
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.Xna.Framework;
using Terraria;

namespace Oracle;

/**
 * A case: a world (see WorldSetup; give it 40 more rows than you use, as the game only collides
 * above maxTilesY - 40), the player's start {"x", "y", "vx", "vy", "direction", "releaseJump"},
 * and "inputs": one number per frame, bits 1 = left, 2 = right, 4 = jump.
 *
 * Each frame runs, in Player.Update's order (game code: see oracle/sources.json's slices):
 *   Move_Defaults      maxFallSpeed, gravity, run speeds, jump height and speed
 *   (gravity *= the "space" factor: 1 at the surface of a normal-sized world, so left out)
 *   Move_Jump_Gravity  HorizontalMovement, JumpMovement, dashes / wings / rockets, gravity
 *   Move_Glide         gfxOffY catching up with a step
 *   Move_Steps         SlopeDownMovement, StepDown, StepUp
 *   Move_Collide       DryCollision, SlopingCollision, bumping the ceiling
 *   PlayerFrame        the body and leg animation
 * Result: the player's state after each frame.
 */
public class MovementFeature : IFeature
{
	public object Run(JsonElement c)
	{
		WorldSetup.Load(c);
		Main.myPlayer = 0;
		var p = new Player
		{
			whoAmI = 0,
			position = new Vector2(c.GetProperty("x").GetSingle(), c.GetProperty("y").GetSingle()),
			velocity = new Vector2(c.GetProperty("vx").GetSingle(), c.GetProperty("vy").GetSingle()),
			direction = c.GetProperty("direction").GetInt32(),
			releaseJump = c.GetProperty("releaseJump").GetBoolean()
		};
		p.oldPosition = p.position;
		var frames = new List<object>();
		// "trace": also the position and velocity after each step of each frame (for debugging).
		bool trace = c.TryGetProperty("trace", out var tr) && tr.GetBoolean();
		var steps = new List<object>();
		void Step(string name)
		{
			if (trace) steps.Add(new { name, x = p.position.X, y = p.position.Y, vx = p.velocity.X, vy = p.velocity.Y });
		}
		foreach (var input in c.GetProperty("inputs").EnumerateArray())
		{
			int bits = input.GetInt32();
			p.controlLeft = (bits & 1) != 0;
			p.controlRight = (bits & 2) != 0;
			p.controlJump = (bits & 4) != 0;
			p.Move_Defaults();
			p.Move_Jump_Gravity(0);
			Step("jumpGravity");
			p.Move_Glide();
			p.Move_Steps();
			Step("steps");
			p.Move_Collide(0);
			Step("collide");
			p.PlayerFrame();
			frames.Add(new
			{
				x = p.position.X,
				y = p.position.Y,
				vx = p.velocity.X,
				vy = p.velocity.Y,
				gfxOffY = p.gfxOffY,
				stepSpeed = p.stepSpeed,
				jump = p.jump,
				releaseJump = p.releaseJump,
				direction = p.direction,
				body = p.bodyFrame.Y / 56,
				legs = p.legFrame.Y / 56,
				legFrameCounter = p.legFrameCounter
			});
		}
		return trace ? new { frames, steps } : frames;
	}
}
