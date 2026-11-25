// Stand-ins for the parts of ReLogic.dll the extracted game code names. Ours, not the game's.
namespace ReLogic.Reflection;

public class IdDictionary
{
	public static IdDictionary Create<TClass, TId>() => new();
}
