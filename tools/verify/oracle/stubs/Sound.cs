// Ours, not the game's: sounds are recorded (which sound, where), not played. A case compares
// what the game asked to play.
using Microsoft.Xna.Framework;
using Oracle;

namespace Terraria;

public static class SoundEngine
{
	public static object PlaySound(int type, int x = -1, int y = -1, int Style = 1, float volumeScale = 1f, float pitchOffset = 0f)
	{
		Recorder.Sounds.Add(new { type, style = Style, x, y });
		return null;
	}

	public static object PlaySound(int type, Vector2 position, int style = 1) => PlaySound(type, (int)position.X, (int)position.Y, style);

	/** A SoundID.* style: its name is enough to tell sounds apart. */
	public static object PlaySound(object style, Vector2? position = null, object updateCallback = null)
	{
		Recorder.Sounds.Add(new { style = style?.ToString(), x = position?.X, y = position?.Y });
		return null;
	}

	public static object PlaySound(object style, int x, int y) => PlaySound(style, new Vector2(x, y));

	/** An item's use sound (Item.UseSound), at the player. */
	public static object PlaySound(LegacySoundStyle style, Vector2 position, float pitchOffset = 0f)
	{
		Recorder.Sounds.Add(new { type = style.SoundId, style = style.Style, x = position.X, y = position.Y, pitch = pitchOffset });
		return null;
	}
}

/// A sound by its type and style, as SoundID names them (SoundID.Item1 is type 2, style 1).
public class LegacySoundStyle
{
	public readonly int SoundId, Style;

	public LegacySoundStyle(int soundId, int style)
	{
		SoundId = soundId;
		Style = style;
	}

	public override string ToString() => $"{SoundId}:{Style}";
}

public partial class SoundID
{
	public static readonly LegacySoundStyle Item1 = new(2, 1);
}
