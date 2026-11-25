// Ours, not the game's: what the oracle's Player needs besides the extracted game code.
using Microsoft.Xna.Framework;
using Oracle;

namespace Terraria;

public partial class Player : Entity
{
	/**
	 * The parts of the game's Player() that movement reads (the rest fills inventories and the
	 * like): its size, frame sizes, no grapple, no mount.
	 */
	public Player()
	{
		width = 20;
		height = 42;
		bodyFrame.Width = 40;
		bodyFrame.Height = 56;
		legFrame.Width = 40;
		legFrame.Height = 56;
		for (int i = 0; i < 59; i++)
		{
			if (i < armor.Length) armor[i] = new Item();
			inventory[i] = new Item();
		}
		grappling[0] = -1;
		mount = new Mount();
		selectedItemState = new SelectedItemState(this);
		lastVisualizedSelectedItem = new Item();
		hitTile = new HitTile();
		hitReplace = new HitTile();
		IntentionGuesser = new PlayerIntentionGuesser();
	}

	// Visual only: these spawn dust, gore and sounds or set visual fields (wing and rocket
	// frames), never position, velocity, jump state or the body and leg frames (checked by
	// reading them), so the oracle skips them.
	public void WingFrame(bool wingFlap) { }
	private void WingAirVisuals() { }
	private void RocketBootVisuals() { }
	private void SpawnFastRunParticles() { }
	public void DoubleJumpVisuals() { }
	public void SetArmorEffectVisuals(Player drawPlayer) { }
	private void UpdateVisibleAccessories() { }
	private void MowTheLawn() { }

	// Floor effects: for dirt, stone and grass (all this world has) the game's FloorVisuals
	// leaves slippy / sticky / powerrun / runningOnSand off and only makes dust; touched tiles
	// matter for pressure plates and bouncy blocks, which aren't here.
	public void FloorVisuals(bool Falling) { }
	private void MakeFloorDust(bool Falling, int type, int frameX, int frameY, int paintColor) { }
	public void UpdateTouchingTiles() { }
	private void TryBouncingBlocks(bool Falling) { }

	// No armour or loadouts: every armour slot is an empty item, and no armour set matches.
	public EquipmentLoadout[] Loadouts = new EquipmentLoadout[3];
	public Item GetEffectiveArmor(int slot) => new Item();
	private bool CanShareArmor(Item shareItem, int slot) => false;

	public static int SetMatch(SetMatchRequest request, ref bool somethingSpecial)
	{
		if (request.Head > 0 || request.Body > 0 || request.Legs > 0) Stub.Hit("Player.SetMatch (armour)");
		return -1;
	}

	// Fighting: a plain player moving about doesn't hit anything.
	public void ApplyDamageToNPC(NPC npc, int damage, float knockback, int direction, bool crit, string sourceIdentifier = null, int sourceItemId = 0, int sourceProjectileId = 0) => Stub.Hit("Player.ApplyDamageToNPC");
	public void ApplyDamageToNPC(NPC npc, int damage, float knockback, int direction, bool crit, PlayerNPCHitSource hitSource) => Stub.Hit("Player.ApplyDamageToNPC");
	public bool CanNPCBeHitByPlayerOrPlayerProjectile(NPC npc, Projectile projectile = null)
	{
		Stub.Hit("Player.CanNPCBeHitByPlayerOrPlayerProjectile");
		return false;
	}
	public int CollideWithNPCs(Rectangle myRect, float Damage, float Knockback, int NPCImmuneTime, int PlayerImmuneTime, int sourceItemId = 0)
	{
		Stub.Hit("Player.CollideWithNPCs");
		return 0;
	}
	public void OnKillNPC(ref NPCKillAttempt attempt, object externalKillingBlowSource) => Stub.Hit("Player.OnKillNPC");
	public IEntitySource GetProjectileSource_OnHit(Entity victim, int projectileSourceId)
	{
		Stub.Hit("Player.GetProjectileSource_OnHit");
		return null;
	}
	private bool AddBuff_TryUpdatingExistingBuffTime(int type, int time)
	{
		Stub.Hit("Player.AddBuff_TryUpdatingExistingBuffTime");
		return false;
	}
	public bool CanHit(Entity ent)
	{
		Stub.Hit("Player.CanHit");
		return false;
	}
	public void OnHit(float x, float y, Entity victim) => Stub.Hit("Player.OnHit");
	public void TryConsumingTimerCrit(Rectangle hitbox, ref bool crit) => Stub.Hit("Player.TryConsumingTimerCrit");
	private void DoCommonDashHandle(out int dir, out bool dashing, DashStartAction dashStartAction = null)
	{
		Stub.Hit("Player.DoCommonDashHandle");
		dir = 0;
		dashing = false;
	}

	// The smart cursor's tool picking: nobody's at the keyboard.
	public bool SmartSelectLookup(out int selectedSlot)
	{
		Stub.Hit("Player.SmartSelectLookup");
		selectedSlot = 0;
		return false;
	}

	// Movement for what a plain player doesn't have (wings, liquid, the digger cart, wall
	// climbing mounts): a case that gets here is refused.
	public void WingMovement() => Stub.Hit("Player.WingMovement");
	// These two run every frame: they refuse only past the game's own first check.
	private void TryFloatingInFluid()
	{
		if (!ShouldFloatInWater || (shimmerWet && !shimmerImmune)) return;
		Stub.Hit("Player.TryFloatingInFluid");
	}

	private void TryUsingDiggerCart()
	{
		if (whoAmI == Main.myPlayer && mount.Active && mount.Type == 39 && velocity.Y == 0f)
			Stub.Hit("Player.TryUsingDiggerCart");
	}
	public void WallClimbMovement() => Stub.Hit("Player.WallClimbMovement");
}

// Sitting on furniture and sleeping in a bed: a plain player moving about does neither.
public struct PlayerSittingHelper
{
	public bool isSitting;

	public void SitUp(Player player, bool multiplayerBroadcast = true) => Stub.Hit("PlayerSittingHelper.SitUp");

	public void GetSittingOffsetInfo(Player player, out Vector2 posOffset, out float seatAdjustment)
	{
		posOffset = default;
		seatAdjustment = 0f;
		Stub.Hit("PlayerSittingHelper.GetSittingOffsetInfo");
	}
}

public struct PlayerSleepingHelper
{
	public bool isSleeping;

	public void StopSleeping(Player player, bool multiplayerBroadcast = true) => Stub.Hit("PlayerSleepingHelper.StopSleeping");

	public void GetSleepingOffsetInfo(Player player, out Vector2 posOffset)
	{
		posOffset = default;
		Stub.Hit("PlayerSleepingHelper.GetSleepingOffsetInfo");
	}
}

/// Not petting a town pet.
public struct PlayerPettingInfo
{
	public bool isPetting;
	public bool isPetSmall;
}
