// A plain player holding one item (the Copper Pickaxe, or a stack of dirt or stone blocks),
// moving about and using it, frame by frame: the movement of MovementFeature, then the game's
// Player.ItemCheck (swing, mining, placing) and PlayerFrame, in Player.Update's order.
using System.Collections.Generic;
using System.Text.Json;
using Microsoft.Xna.Framework;
using Terraria;
using Terraria.Utilities;

namespace Oracle;

/**
 * A case: a world (see WorldSetup), "trees": [[x, y], ...] grown there (WorldGen.GrowTree, on
 * grass at y), the player's start {"x", "y", "vx", "vy", "direction",
 * "releaseJump"},
 * the item {"item": type, "stack"}, and "frames": [bits, tileX, tileY] per frame, bits 1 = left,
 * 2 = right, 4 = jump, 8 = use (the mouse button); tileX / tileY is the tile under the cursor
 * (Player.tileTargetX / Y, which Update works out from the mouse, clamped 5 from the edges).
 *
 * Each frame: the movement slices (see MovementFeature), then ItemCheck, then PlayerFrame.
 * What Update runs between them (floor visuals, switches and pressure plates, the world's
 * borders, right-click features) does nothing for such a player in a small world.
 *
 * Result per frame: the player (as MovementFeature), the item use (itemAnimation, itemTime,
 * toolTime, rotation, location, the stack left), the tiles that changed since the last frame
 * ([i, j, type or -1, frameX, frameY, variant]), the pickaxe damage cached per tile
 * (Player.hitTile: [x, y, damage, timeToLive] for each), the drops, sounds and critters asked
 * for, and where Main.rand has got to ([inext, SeedArray[inext]]).
 */
public class ItemUseFeature : IFeature
{
	/** The game's entity arrays, empty (inactive), as a world with nothing else in it has them. */
	static void Empty()
	{
		for (int i = 0; i < Main.npc.Length; i++) Main.npc[i] ??= new NPC();
		for (int i = 0; i < Main.projectile.Length; i++) Main.projectile[i] ??= new Projectile();
		for (int i = 1; i < Main.player.Length; i++) Main.player[i] ??= new Player();
	}

	public object Run(JsonElement c)
	{
		Empty();
		WorldSetup.Load(c);
		// Framed, as a loaded world is (frames are saved with it).
		for (int i = 0; i < Main.maxTilesX; i++)
			for (int j = 0; j < Main.maxTilesY; j++)
				WorldGen.TileFrame(i, j);
		Main.myPlayer = 0;
		// No trees shaken yet (a tree shakes once a day: Main.UpdateTime_StartDay resets them).
		WorldGen.ResetTreeShakes();
		// Every random draw is the game's own (Main.rand, which WorldGen.genRand is too).
		Main.rand = new UnifiedRandom(c.TryGetProperty("seed", out var s) ? s.GetInt32() : 0);
		// Trees, grown by the game's GrowTree (with the random numbers just seeded).
		if (c.TryGetProperty("trees", out var trees))
			foreach (var tree in trees.EnumerateArray())
				WorldGen.GrowTree(tree[0].GetInt32(), tree[1].GetInt32());
		var p = new Player
		{
			whoAmI = 0,
			active = true,
			position = new Vector2(c.GetProperty("x").GetSingle(), c.GetProperty("y").GetSingle()),
			velocity = new Vector2(c.GetProperty("vx").GetSingle(), c.GetProperty("vy").GetSingle()),
			direction = c.GetProperty("direction").GetInt32(),
			releaseJump = c.GetProperty("releaseJump").GetBoolean()
		};
		Main.player[0] = p;
		p.oldPosition = p.position;
		p.inventory[0].SetDefaults(c.GetProperty("item").GetInt32());
		if (c.TryGetProperty("stack", out var st)) p.inventory[0].stack = st.GetInt32();
		p.lastVisualizedSelectedItem = p.inventory[0].Clone();
		Main.screenPosition = Vector2.Zero;

		int w = Main.maxTilesX, h = Main.maxTilesY;
		var before = Snapshot(w, h);
		var frames = new List<object>();
		foreach (var f in c.GetProperty("frames").EnumerateArray())
		{
			int bits = f[0].GetInt32();
			p.controlLeft = (bits & 1) != 0;
			p.controlRight = (bits & 2) != 0;
			p.controlJump = (bits & 4) != 0;
			p.controlUseItem = (bits & 8) != 0;
			Player.tileTargetX = f[1].GetInt32();
			Player.tileTargetY = f[2].GetInt32();
			Main.mouseX = Player.tileTargetX * 16 + 8;
			Main.mouseY = Player.tileTargetY * 16 + 8;
			Recorder.Clear();
			p.Move_Defaults();
			p.Move_Jump_Gravity(0);
			p.Move_Glide();
			p.Move_Steps();
			p.Move_Collide(0);
			p.ItemCheck();
			p.PlayerFrame();

			var after = Snapshot(w, h);
			var changed = new List<int[]>();
			for (int k = 0; k < after.Length; k++)
				if (!Same(before[k], after[k])) changed.Add(after[k]);
			before = after;
			var hits = new List<int[]>();
			foreach (var d in p.hitTile.data)
				if (d.type == 1) hits.Add(new[] { d.X, d.Y, d.damage, d.timeToLive });
			hits.Sort((a, b) => a[0] != b[0] ? a[0] - b[0] : a[1] - b[1]);
			frames.Add(new
			{
				x = p.position.X,
				y = p.position.Y,
				vx = p.velocity.X,
				vy = p.velocity.Y,
				direction = p.direction,
				body = p.bodyFrame.Y / 56,
				legs = p.legFrame.Y / 56,
				itemAnimation = p.itemAnimation,
				itemAnimationMax = p.itemAnimationMax,
				itemTime = p.itemTime,
				toolTime = p.toolTime,
				itemRotation = p.itemRotation,
				itemX = p.itemLocation.X,
				itemY = p.itemLocation.Y,
				stack = p.inventory[0].stack,
				tiles = changed,
				hits,
				drops = new List<object>(Recorder.Drops),
				sounds = new List<object>(Recorder.Sounds),
				npcs = new List<object>(Recorder.Npcs),
				rand = RandomState()
			});
		}
		return frames;
	}

	static readonly System.Reflection.FieldInfo Inext =
		typeof(UnifiedRandom).GetField("inext", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
	static readonly System.Reflection.FieldInfo Seeds =
		typeof(UnifiedRandom).GetField("SeedArray", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);

	/** Where Main.rand is in its sequence: so a draw too many or too few shows on the frame it's made. */
	static int[] RandomState()
	{
		uint i = (uint)Inext.GetValue(Main.rand);
		return new[] { (int)i, ((int[])Seeds.GetValue(Main.rand))[i] };
	}

	static int[][] Snapshot(int w, int h)
	{
		var all = new int[w * h][];
		for (int j = 0; j < h; j++)
			for (int i = 0; i < w; i++)
			{
				var t = Main.tile[i, j];
				all[j * w + i] = new[] { i, j, t.active() ? t.type : -1, t.frameX, t.frameY, t.frameNumber() };
			}
		return all;
	}

	static bool Same(int[] a, int[] b)
	{
		for (int k = 0; k < a.Length; k++)
			if (a[k] != b[k]) return false;
		return true;
	}
}
