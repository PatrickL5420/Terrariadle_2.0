// Converts the game's code (as the oracle compiles it: game/ and stubs/) to TypeScript, with
// Roslyn's semantic model, so the port does what the C# does: integer division truncates, float
// arithmetic rounds to single precision, casts narrow, structs copy, overloads and default
// arguments resolve as the compiler resolves them, constants fold. Run through
// tools/verify/port/convert.mjs; see tools/verify/README.md.
//
// It starts from the roots a config names and follows every method, field and type they use,
// converting what's in the oracle's source. Static arrays of the config's `data` types are
// copied from the running oracle (after the game's own setup) rather than converted. Anything
// it can't convert faithfully it refuses, naming it.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;

namespace Oracle.Convert;

public class Config
{
	/// "Namespace.Type.Member" (every overload) or "Namespace.Type" (the whole type).
	public string[] roots { get; set; } = Array.Empty<string>();
	/// Types whose static arrays are copied as data from the running oracle.
	public string[] data { get; set; } = Array.Empty<string>();
	/// "Namespace.Type.Member" -> a TypeScript expression from the runtime module.
	public Dictionary<string, string> external { get; set; } = new();
	/// "Namespace.Type" -> a runtime TypeScript type standing in for it (its members must be external).
	public Dictionary<string, string> externalTypes { get; set; } = new();
	/// "Namespace.Type.Member": not converted; using one throws (paths the cases mustn't reach).
	public string[] holes { get; set; } = Array.Empty<string>();
	/// Members to leave out of a converted type (their uses must be external, or are refused).
	public string[] exclude { get; set; } = Array.Empty<string>();
	public string output { get; set; }
	/// The runtime module's import path, and what to import from it.
	public string runtime { get; set; }
	public string[] runtimeNames { get; set; } = Array.Empty<string>();
	public string header { get; set; } = "";
}

public class Refused : Exception
{
	public Refused(string what, SyntaxNode at) : base($"{what} at {Where(at)}") { }

	static string Where(SyntaxNode n)
	{
		if (n == null) return "?";
		var span = n.GetLocation().GetLineSpan();
		return $"{Path.GetFileName(span.Path)}:{span.StartLinePosition.Line + 1}: {n.ToString().Split('\n')[0].Trim()}";
	}
}

public static class Converter
{
	public static int Run(string configPath, string sourceRoot)
	{
		var config = JsonSerializer.Deserialize<Config>(File.ReadAllText(configPath));
		var files = new[] { "game", "stubs" }
			.SelectMany(d => Directory.GetFiles(Path.Combine(sourceRoot, d), "*.cs"))
			.ToList();
		var parse = new CSharpParseOptions(LanguageVersion.Latest);
		var trees = files.Select(f => CSharpSyntaxTree.ParseText(File.ReadAllText(f), parse, f)).ToList();
		var refs = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES"))
			.Split(Path.PathSeparator)
			.Where(p => Path.GetFileName(p) != "Oracle.dll")
			.Select(p => MetadataReference.CreateFromFile(p));
		var compilation = CSharpCompilation.Create(
			"Game",
			trees,
			refs,
			new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary, allowUnsafe: true)
		);
		var errors = compilation.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToList();
		if (errors.Count > 0)
		{
			foreach (var e in errors.Take(10)) Console.Error.WriteLine(e);
			return 1;
		}
		var emitter = new Emitter(compilation, config);
		try
		{
			emitter.Convert();
		}
		catch (Refused r)
		{
			Console.Error.WriteLine("Refused: " + r.Message);
			return 1;
		}
		File.WriteAllText(config.output, emitter.Output());
		Console.WriteLine($"Wrote {config.output}: {emitter.Summary()}");
		return 0;
	}
}

class Emitter
{
	readonly CSharpCompilation compilation;
	readonly Config config;
	readonly Queue<ISymbol> work = new();
	readonly HashSet<ISymbol> seen = new(SymbolEqualityComparer.Default);
	readonly Dictionary<INamedTypeSymbol, TypeOut> types = new(SymbolEqualityComparer.Default);
	readonly HashSet<string> externalUsed = new();
	/// Who needed what: for saying why a refused member was reached.
	readonly Dictionary<ISymbol, ISymbol> neededBy = new(SymbolEqualityComparer.Default);
	ISymbol current;

	class TypeOut
	{
		public INamedTypeSymbol Type;
		public List<(ISymbol Symbol, string Code)> Members = new();
		public HashSet<INamedTypeSymbol> StaticDeps = new(SymbolEqualityComparer.Default);
		public List<(ISymbol Symbol, string Code)> StaticInits = new();
	}

	public Emitter(CSharpCompilation compilation, Config config)
	{
		this.compilation = compilation;
		this.config = config;
		holeKeys = new HashSet<string>(config.holes);
	}

	// ---- What to convert ---------------------------------------------------------------------

	static string Key(ISymbol s) => s is INamedTypeSymbol t ? t.ToDisplayString() : $"{s.ContainingType?.ToDisplayString()}.{s.Name}";

	bool InSource(ISymbol s) =>
		!(s is INamedTypeSymbol nt && config.externalTypes.ContainsKey(nt.OriginalDefinition.ToDisplayString()))
		&& !(s.ContainingType != null && config.externalTypes.ContainsKey(s.ContainingType.OriginalDefinition.ToDisplayString()))
		&& s.Locations.Any(l => l.IsInSource && !l.SourceTree.FilePath.EndsWith("AutoStubs.cs"));

	/// A placeholder (oracle/game/AutoStubs.cs: a type nobody provides): reaching it at run time
	/// throws in the oracle, and throws in the port too.
	static HashSet<string> holeKeys = new();

	static bool IsHole(ISymbol s) =>
		s != null && (holeKeys.Contains(Key(s)) || s.Locations.Any(l => l.IsInSource && l.SourceTree.FilePath.EndsWith("AutoStubs.cs")));

	bool IsData(ISymbol s) =>
		s is IFieldSymbol f && f.IsStatic && f.Type is IArrayTypeSymbol { Rank: 1 }
		&& config.data.Any(d => f.ContainingType.ToDisplayString() == d || f.ContainingType.ToDisplayString().StartsWith(d + "."));

	public void Convert()
	{
		foreach (var root in config.roots)
		{
			var type = compilation.GetTypeByMetadataName(root);
			if (type != null)
			{
				foreach (var m in type.GetMembers())
					if (m is IMethodSymbol ms && ms.MethodKind is MethodKind.Ordinary or MethodKind.Constructor && !m.IsImplicitlyDeclared)
						Need(m);
				NeedType(type);
				continue;
			}
			// "Type.Member(int,double)": just that overload.
			string sig = null;
			string name = root;
			if (root.EndsWith(")"))
			{
				sig = root[(root.IndexOf('(') + 1)..^1];
				name = root[..root.IndexOf('(')];
			}
			int dot = name.LastIndexOf('.');
			if (name.EndsWith("..ctor")) dot = name.Length - 6;
			var owner = compilation.GetTypeByMetadataName(name[..dot]) ?? throw new Refused("no such root: " + root, null);
			var found = owner.GetMembers(name[(dot + 1)..]).Where(m => sig == null || (m is IMethodSymbol ms && string.Join(",", ms.Parameters.Select(p => p.Type.ToDisplayString())) == sig)).ToArray();
			if (found.Length == 0) throw new Refused("no such root: " + root, null);
			foreach (var m in found) Need(m);
		}
		while (work.Count > 0)
		{
			var s = work.Dequeue();
			current = s;
			try
			{
				EmitMember(s);
			}
			catch (Refused r)
			{
				var chain = new List<string>();
				for (var x = s; x != null && chain.Count < 12; x = neededBy.GetValueOrDefault(x)) chain.Add(Key(x));
				throw new Refused(r.Message + "\n  in " + string.Join("\n  <- ", chain), null);
			}
		}
	}

	/// Notes a symbol the converted code uses: converted (from source), data, or external.
	void Need(ISymbol s, SyntaxNode at = null)
	{
		if (s is IMethodSymbol m && m.ReducedFrom != null) s = m.ReducedFrom;
		if (s is IMethodSymbol g && g.IsGenericMethod) s = g.OriginalDefinition;
		if (config.external.ContainsKey(Key(s)))
		{
			externalUsed.Add(Key(s));
			return;
		}
		if (s.ContainingType != null && s.ContainingType.IsGenericType) s = s.OriginalDefinition;
		if (!seen.Add(s)) return;
		if (current != null) neededBy[s] = current;
		if (!InSource(s)) return; // System types: handled where used, or refused there
		NeedType(s.ContainingType);
		work.Enqueue(s);
	}

	void NeedType(INamedTypeSymbol t)
	{
		if (t == null || !InSource(t) || types.ContainsKey(t)) return;
		types[t] = new TypeOut { Type = t };
		if (t.ContainingType != null) NeedType(t.ContainingType);
		if (t.BaseType != null && InSource(t.BaseType)) NeedType(t.BaseType);
		// Instance fields go with the type (whoever makes one sets them up).
		foreach (var f in t.GetMembers().OfType<IFieldSymbol>())
			if (!f.IsStatic && !f.IsConst && !f.IsImplicitlyDeclared) Need(f);
		foreach (var p in t.GetMembers().OfType<IPropertySymbol>())
			if (!p.IsStatic && IsAutoProperty(p)) Need(p);
		foreach (var m in t.GetMembers().OfType<IMethodSymbol>())
			if (m.MethodKind == MethodKind.StaticConstructor) Need(m);
	}

	static bool IsAutoProperty(IPropertySymbol p) =>
		p.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax() is PropertyDeclarationSyntax pd
		&& pd.ExpressionBody == null
		&& pd.AccessorList != null
		&& pd.AccessorList.Accessors.All(a => a.Body == null && a.ExpressionBody == null);

	// ---- Names and types ---------------------------------------------------------------------

	static readonly HashSet<string> Reserved = new()
	{
		"function", "var", "let", "delete", "export", "import", "with", "yield", "arguments", "eval",
		"await", "package", "interface", "implements", "private", "protected", "public", "static",
		"undefined", "NaN", "Infinity", "constructor", "prototype", "name", "length"
	};

	static string Id(string n) => Reserved.Contains(n) ? n + "$" : n;
	static string LocalId(string n) => Reserved.Contains(n) || n == "Math" ? n + "$" : n;

	string TypeName(INamedTypeSymbol t)
	{
		var parts = new List<string>();
		for (var x = t; x != null; x = x.ContainingType) parts.Insert(0, x.Name);
		return string.Join("_", parts);
	}

	/// The name a member is emitted under: overloads get their parameter types appended.
	string MemberName(ISymbol s)
	{
		if (s is IMethodSymbol m)
		{
			if (m.MethodKind == MethodKind.PropertyGet && m.AssociatedSymbol is IPropertySymbol ip && ip.IsIndexer) return "get_Item";
			if (m.MethodKind == MethodKind.PropertySet && m.AssociatedSymbol is IPropertySymbol sp && sp.IsIndexer) return "set_Item";
			if (m.MethodKind == MethodKind.UserDefinedOperator || m.MethodKind == MethodKind.Conversion) return m.Name;
			var overloads = m.ContainingType.GetMembers(m.Name).OfType<IMethodSymbol>().Count();
			if (overloads > 1)
				return Id(m.Name) + "_" + string.Join("_", m.Parameters.Select(p => p.Type.Name + (p.RefKind != RefKind.None ? "Ref" : "")));
			return Id(m.Name);
		}
		return Id(s.Name);
	}

	string Ts(ITypeSymbol t)
	{
		switch (t.SpecialType)
		{
			case SpecialType.System_Boolean: return "boolean";
			case SpecialType.System_String: return "string";
			case SpecialType.System_Void: return "void";
			case SpecialType.System_Object: return "unknown";
		}
		if (IsNumeric(t) || t.TypeKind == TypeKind.Enum) return "number";
		if (t is IArrayTypeSymbol a)
		{
			if (a.Rank > 1) return $"Array2D<{Ts(a.ElementType)}>";
			return TypedArray(a.ElementType) ?? $"{Ts(a.ElementType)}[]";
		}
		if (t is INamedTypeSymbol n)
		{
			if (config.externalTypes.TryGetValue(n.OriginalDefinition.ToDisplayString(), out var et)) return et;
			if (n.OriginalDefinition.ToDisplayString() == "System.Collections.Generic.List<T>") return Ts(n.TypeArguments[0]) + "[]";
			if (n.OriginalDefinition.SpecialType == SpecialType.System_Nullable_T) return Ts(n.TypeArguments[0]) + " | null";
			if (InSource(n)) return TypeName(n);
		}
		return "any";
	}

	static string TypedArray(ITypeSymbol e) => e.SpecialType switch
	{
		SpecialType.System_Int32 => "Int32Array",
		SpecialType.System_UInt32 => "Uint32Array",
		SpecialType.System_Int16 => "Int16Array",
		SpecialType.System_UInt16 => "Uint16Array",
		SpecialType.System_Byte => "Uint8Array",
		SpecialType.System_SByte => "Int8Array",
		SpecialType.System_Single => "Float32Array",
		SpecialType.System_Double => "Float64Array",
		_ => null
	};

	static bool IsNumeric(ITypeSymbol t) =>
		t != null && t.SpecialType is SpecialType.System_Int32 or SpecialType.System_UInt32 or SpecialType.System_Int16
			or SpecialType.System_UInt16 or SpecialType.System_Byte or SpecialType.System_SByte or SpecialType.System_Int64
			or SpecialType.System_UInt64 or SpecialType.System_Single or SpecialType.System_Double or SpecialType.System_Char;

	static ITypeSymbol Under(ITypeSymbol t) => t is INamedTypeSymbol { TypeKind: TypeKind.Enum } e ? e.EnumUnderlyingType : t;
	static bool IsFloat(ITypeSymbol t) => t?.SpecialType == SpecialType.System_Single;
	static bool IsInt32ish(ITypeSymbol t) => Under(t)?.SpecialType is SpecialType.System_Int32 or SpecialType.System_Int16 or SpecialType.System_UInt16 or SpecialType.System_Byte or SpecialType.System_SByte or SpecialType.System_Char;
	static bool IsIntegral(ITypeSymbol t) => IsInt32ish(t) || Under(t)?.SpecialType is SpecialType.System_UInt32 or SpecialType.System_Int64 or SpecialType.System_UInt64;
	static bool IsStruct(ITypeSymbol t) => t != null && t.TypeKind == TypeKind.Struct && !IsNumeric(t) && t.SpecialType != SpecialType.System_Boolean && !(t is INamedTypeSymbol n && n.OriginalDefinition.SpecialType == SpecialType.System_Nullable_T);

	string Default(ITypeSymbol t)
	{
		if (IsNumeric(t) || t.TypeKind == TypeKind.Enum) return "0";
		if (t.SpecialType == SpecialType.System_Boolean) return "false";
		if (IsStruct(t)) return $"new {TypeName((INamedTypeSymbol)t)}()";
		return "null";
	}

	// ---- Members -----------------------------------------------------------------------------

	SemanticModel Model(SyntaxNode n) => compilation.GetSemanticModel(n.SyntaxTree);

	TypeOut Owner(ISymbol s) => types[s.ContainingType];

	void Add(ISymbol s, string code) => Owner(s).Members.Add((s, code));

	void EmitMember(ISymbol s)
	{
		if (config.exclude.Contains(Key(s))) return;
		switch (s)
		{
			case IFieldSymbol f:
				EmitField(f);
				break;
			case IPropertySymbol p:
				EmitProperty(p);
				break;
			case IMethodSymbol m:
				if (m.MethodKind is MethodKind.PropertyGet or MethodKind.PropertySet)
				{
					Need(m.AssociatedSymbol);
					break;
				}
				EmitMethod(m);
				break;
			case INamedTypeSymbol t:
				NeedType(t);
				break;
		}
	}

	void EmitField(IFieldSymbol f)
	{
		if (f.IsConst) return; // folded where used
		var owner = Owner(f);
		string stat = f.IsStatic ? "static " : "";
		string name = Id(f.Name);
		if (IsData(f))
		{
			Add(f, $"{stat}{name}: {Ts(f.Type)} = {DataValue(f)};");
			return;
		}
		var decl = f.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax() as VariableDeclaratorSyntax;
		string init = null;
		if (decl?.Initializer != null)
		{
			var op = Model(decl).GetOperation(decl.Initializer) as IFieldInitializerOperation;
			var body = new Body(this, f.IsStatic ? owner : null);
			init = body.Value(op.Value, f.Type);
		}
		if (init != null && f.IsStatic && !(decl.Initializer.Value is LiteralExpressionSyntax))
		{
			// Run in a static block, in source order, as C# runs static initialisers.
			owner.StaticInits.Add((f, $"{TypeName(f.ContainingType)}.{name} = {init};"));
			init = null;
		}
		if (init == null && !IsNumeric(f.Type) && f.Type.TypeKind != TypeKind.Enum && f.Type.SpecialType != SpecialType.System_Boolean && !IsStruct(f.Type))
			Add(f, $"{stat}{name}: {Ts(f.Type)} = null!;");
		else
			Add(f, $"{stat}{name}: {Ts(f.Type)} = {init ?? Default(f.Type)};");
	}

	void EmitProperty(IPropertySymbol p)
	{
		string stat = p.IsStatic ? "static " : "";
		if (IsAutoProperty(p))
		{
			var pd = (PropertyDeclarationSyntax)p.DeclaringSyntaxReferences[0].GetSyntax();
			string init = pd.Initializer != null ? new Body(this, p.IsStatic ? Owner(p) : null).Value(((IPropertyInitializerOperation)Model(pd).GetOperation(pd.Initializer)).Value, p.Type) : Default(p.Type);
			Add(p, $"{stat}{Id(p.Name)}: {Ts(p.Type)} = {init};");
			return;
		}
		if (p.IsIndexer)
		{
			if (p.GetMethod != null) EmitAccessor(p.GetMethod, "get_Item", p);
			if (p.SetMethod != null) EmitAccessor(p.SetMethod, "set_Item", p);
			return;
		}
		if (p.GetMethod != null) EmitAccessor(p.GetMethod, null, p);
		if (p.SetMethod != null) EmitAccessor(p.SetMethod, null, p);
	}

	void EmitAccessor(IMethodSymbol m, string asMethod, IPropertySymbol p)
	{
		var syntax = m.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax();
		var pd = p.DeclaringSyntaxReferences[0].GetSyntax();
		SyntaxNode bodyNode = syntax switch
		{
			AccessorDeclarationSyntax a => (SyntaxNode)a.Body ?? a.ExpressionBody,
			ArrowExpressionClauseSyntax arrow => arrow,
			_ => (pd as PropertyDeclarationSyntax)?.ExpressionBody ?? (SyntaxNode)(pd as IndexerDeclarationSyntax)?.ExpressionBody
		};
		if (bodyNode == null) throw new Refused("accessor without a body", pd);
		var body = new Body(this, null) { Method = m };
		string code = body.MethodBody(bodyNode, m.ReturnsVoid ? null : m.ReturnType);
		string stat = p.IsStatic ? "static " : "";
		string ps = string.Join(", ", m.Parameters.Select(x => $"{LocalId(x.Name)}: {Ts(x.Type)}"));
		if (asMethod != null)
			Add(p, $"{stat}{asMethod}({ps}){(m.ReturnsVoid ? "" : ": " + Ts(m.ReturnType))} {code}");
		else if (m.MethodKind == MethodKind.PropertyGet)
			Add(p, $"{stat}get {Id(p.Name)}(): {Ts(p.Type)} {code}");
		else
			Add(p, $"{stat}set {Id(p.Name)}({ps}) {code}");
	}

	void EmitMethod(IMethodSymbol m)
	{
		var syntax = m.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax();
		if (m.IsAbstract || syntax == null)
		{
			if (m.IsAbstract) Add(m, $"{MemberName(m)}({string.Join(", ", m.Parameters.Select(x => $"_{x.Name}: {Ts(x.Type)}"))}): {Ts(m.ReturnType)} {{ throw new Error('abstract'); }}");
			return;
		}
		foreach (var p in m.Parameters)
			if (p.RefKind != RefKind.None && p.RefKind != RefKind.In)
				throw new Refused($"{p.RefKind} parameter {p.Name} of {Key(m)}", syntax);
		var body = new Body(this, m.MethodKind == MethodKind.StaticConstructor ? Owner(m) : null) { Method = m };
		string ps = string.Join(", ", m.Parameters.Select(p =>
		{
			string d = "";
			if (m.MethodKind == MethodKind.Constructor && m.ContainingType.TypeKind == TypeKind.Struct) d = " = " + Default(p.Type);
			return $"{LocalId(p.Name)}: {Ts(p.Type)}{d}";
		}));
		if (m.MethodKind == MethodKind.StaticConstructor)
		{
			var b = body.MethodBody(syntax switch { ConstructorDeclarationSyntax c => (SyntaxNode)c.Body ?? c.ExpressionBody, _ => syntax }, null);
			Add(m, $"static {b}");
			return;
		}
		if (m.MethodKind == MethodKind.Constructor)
		{
			var cd = (ConstructorDeclarationSyntax)syntax;
			if (m.ContainingType.InstanceConstructors.Count(c => seen.Contains(c)) > 1 && m.ContainingType.TypeKind != TypeKind.Struct)
				throw new Refused("a class with several constructors used: " + Key(m), syntax);
			var op = (IConstructorBodyOperation)Model(cd).GetOperation(cd);
			var sb = new StringBuilder("{\n");
			if (op.Initializer != null)
			{
				var init = op.Initializer is IExpressionStatementOperation es ? es.Operation : op.Initializer;
				if (init is IInvocationOperation inv && inv.TargetMethod.MethodKind == MethodKind.Constructor)
				{
					bool baseIsSource = InSource(inv.TargetMethod.ContainingType);
					if (baseIsSource && !SymbolEqualityComparer.Default.Equals(inv.TargetMethod.ContainingType, m.ContainingType))
					{
						Need(inv.TargetMethod);
						sb.Append($"super({body.Args(inv.TargetMethod, inv.Arguments)});\n");
					}
				}
			}
			else if (m.ContainingType.BaseType != null && InSource(m.ContainingType.BaseType))
				sb.Append("super();\n");
			var block = op.BlockBody ?? op.ExpressionBody;
			if (block != null) foreach (var st in ((IBlockOperation)block).Operations) body.Statement(st, sb, 1);
			sb.Append("}");
			Add(m, $"constructor({ps}) {sb}");
			return;
		}
		SyntaxNode bodyNode = syntax switch
		{
			MethodDeclarationSyntax md => (SyntaxNode)md.Body ?? md.ExpressionBody,
			OperatorDeclarationSyntax od => (SyntaxNode)od.Body ?? od.ExpressionBody,
			LocalFunctionStatementSyntax => throw new Refused("a local function", syntax),
			_ => throw new Refused("a method declared as " + syntax.Kind(), syntax)
		};
		if (bodyNode == null) throw new Refused("a method without a body", syntax);
		string code = body.MethodBody(bodyNode, m.ReturnsVoid ? null : m.ReturnType);
		string stat = m.IsStatic ? "static " : "";
		Add(m, $"{stat}{MemberName(m)}({ps}): {Ts(m.ReturnType)} {code}");
	}

	// ---- Data copied from the oracle ---------------------------------------------------------

	string DataValue(IFieldSymbol f)
	{
		var type = typeof(Program).Assembly.GetType(MetadataName(f.ContainingType)) ?? throw new Refused("no runtime type for " + Key(f), null);
		var fi = type.GetField(f.Name, System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
		var value = fi?.GetValue(null) as Array ?? throw new Refused("no data for " + Key(f), null);
		var et = ((IArrayTypeSymbol)f.Type).ElementType;
		if (value.Rank != 1) throw new Refused("2D data " + Key(f), null);
		var items = value.Cast<object>().ToList();
		if (et.SpecialType == SpecialType.System_Boolean)
			return $"$bools(\"{string.Concat(items.Select(o => (bool)o ? '1' : '0'))}\")";
		var ta = TypedArray(et);
		if (ta != null) return $"{ta}.from([{string.Join(",", items.Select(o => System.Convert.ToDouble(o).ToString("R")))}])";
		return "[" + string.Join(",", items.Select(o => o == null ? "null" : JsonSerializer.Serialize(o))) + "]";
	}

	static string MetadataName(INamedTypeSymbol t) =>
		t.ContainingType != null ? MetadataName(t.ContainingType) + "+" + t.MetadataName : t.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat).Replace("global::", "");

	// ---- Output ------------------------------------------------------------------------------

	public string Summary() =>
		$"{types.Count} types, {types.Values.Sum(t => t.Members.Count)} members; external: {string.Join(", ", externalUsed.OrderBy(x => x))}";

	public string Output()
	{
		var sb = new StringBuilder();
		sb.Append(config.header);
		sb.Append($"import {{ {string.Join(", ", config.runtimeNames)} }} from '{config.runtime}';\n\n");
		// Base classes and what static initialisers use first.
		var order = new List<INamedTypeSymbol>();
		var done = new HashSet<INamedTypeSymbol>(SymbolEqualityComparer.Default);
		void Visit(INamedTypeSymbol t, HashSet<INamedTypeSymbol> stack)
		{
			if (done.Contains(t) || !types.ContainsKey(t)) return;
			if (!stack.Add(t)) return;
			if (t.BaseType != null) Visit(t.BaseType, stack);
			foreach (var d in types[t].StaticDeps) Visit(d, stack);
			done.Add(t);
			order.Add(t);
		}
		foreach (var t in types.Keys.OrderBy(t => TypeName(t))) Visit(t, new HashSet<INamedTypeSymbol>(SymbolEqualityComparer.Default));
		foreach (var t in order)
		{
			var o = types[t];
			string ext = t.BaseType != null && types.ContainsKey(t.BaseType) ? $" extends {TypeName(t.BaseType)}" : "";
			sb.Append($"export class {TypeName(t)}{ext} {{\n");
			foreach (var (_, code) in o.Members
				.OrderBy(m => m.Code.StartsWith("static {") ? 1 : 0)
				.ThenBy(m => m.Symbol.Locations.FirstOrDefault()?.SourceTree?.FilePath ?? "")
				.ThenBy(m => m.Symbol.Locations.FirstOrDefault()?.SourceSpan.Start ?? 0))
				sb.Append(code).Append("\n\n");
			if (o.StaticInits.Count > 0)
			{
				sb.Append("static {\n");
				foreach (var (_, code) in o.StaticInits.OrderBy(m => m.Symbol.Locations[0].SourceSpan.Start)) sb.Append(code).Append('\n');
				sb.Append("}\n");
			}
			if (IsStruct(t))
			{
				var fields = t.GetMembers().OfType<IFieldSymbol>().Where(f => !f.IsStatic && !f.IsConst).ToList();
				sb.Append($"clone(): {TypeName(t)} {{ const c = new {TypeName(t)}(); {string.Concat(fields.Select(f => $"c.{Id(f.Name)} = this.{Id(f.Name)}; "))}return c; }}\n");
			}
			sb.Append("}\n\n");
		}
		return sb.ToString();
	}

	// ---- Method bodies -----------------------------------------------------------------------

	class Body
	{
		readonly Emitter e;
		readonly TypeOut staticOwner;
		public IMethodSymbol Method;

		public Body(Emitter e, TypeOut staticOwner)
		{
			this.e = e;
			this.staticOwner = staticOwner;
		}

		string Pad(int n) => new string('\t', n);

		public string MethodBody(SyntaxNode node, ITypeSymbol returns)
		{
			var op = e.Model(node).GetOperation(node);
			var sb = new StringBuilder("{\n");
			if (op is IMethodBodyOperation mb) op = (IOperation)mb.BlockBody ?? mb.ExpressionBody;
			if (op is IBlockOperation block)
				foreach (var st in block.Operations) Statement(st, sb, 1);
			else if (node is ArrowExpressionClauseSyntax arrow)
			{
				var x = e.Model(arrow).GetOperation(arrow.Expression);
				sb.Append(returns == null ? $"\t{Expr(x)};\n" : $"\treturn {Value(x, returns)};\n");
			}
			else throw new Refused("an unexpected body", node);
			sb.Append("}");
			return sb.ToString();
		}

		// ---- Statements ----

		public void Statement(IOperation op, StringBuilder sb, int d)
		{
			string p = Pad(d);
			switch (op)
			{
				case IBlockOperation b:
					sb.Append(p + "{\n");
					foreach (var s in b.Operations) Statement(s, sb, d + 1);
					sb.Append(p + "}\n");
					break;
				case IVariableDeclarationGroupOperation g:
					foreach (var decl in g.Declarations)
						foreach (var v in decl.Declarators)
						{
							var init = v.Initializer?.Value ?? decl.Initializer?.Value;
							string val = init != null ? Value(init, v.Symbol.Type) : null;
							sb.Append($"{p}let {LocalId(v.Symbol.Name)}: {e.Ts(v.Symbol.Type)}{(val != null ? " = " + val : "")};\n");
						}
					break;
				case IExpressionStatementOperation es:
					sb.Append(p + Expr(es.Operation) + ";\n");
					break;
				case IConditionalOperation c:
					sb.Append($"{p}if ({Cond(c.Condition)}) ");
					Nested(c.WhenTrue, sb, d);
					if (c.WhenFalse != null)
					{
						sb.Length--;
						sb.Append(" else ");
						if (c.WhenFalse is IConditionalOperation)
						{
							var inner = new StringBuilder();
							Statement(c.WhenFalse, inner, d);
							sb.Append(inner.ToString().TrimStart('\t'));
						}
						else Nested(c.WhenFalse, sb, d);
					}
					break;
				case IForLoopOperation f:
					{
						var before = new List<string>();
						foreach (var b in f.Before)
						{
							if (b is IVariableDeclarationGroupOperation vg)
								before.Add("let " + string.Join(", ", vg.Declarations.SelectMany(x => x.Declarators).Select(v => $"{LocalId(v.Symbol.Name)}: {e.Ts(v.Symbol.Type)}" + ((v.Initializer?.Value) != null ? " = " + Value(v.Initializer.Value, v.Symbol.Type) : ""))));
							else if (b is IExpressionStatementOperation bes) before.Add(Expr(bes.Operation));
							else throw new Refused("a for loop's start", b.Syntax);
						}
						var after = f.AtLoopBottom.Select(x => x is IExpressionStatementOperation xs ? Expr(xs.Operation) : throw new Refused("a for loop's step", x.Syntax));
						sb.Append($"{p}for ({string.Join(", ", before)}; {(f.Condition != null ? Cond(f.Condition) : "")}; {string.Join(", ", after)}) ");
						Nested(f.Body, sb, d);
						break;
					}
				case IWhileLoopOperation w:
					if (w.ConditionIsTop)
					{
						sb.Append($"{p}while ({(w.ConditionIsUntil ? "!" : "")}({Cond(w.Condition)})) ");
						Nested(w.Body, sb, d);
					}
					else
					{
						sb.Append($"{p}do ");
						Nested(w.Body, sb, d);
						sb.Length--;
						sb.Append($" while ({(w.ConditionIsUntil ? "!" : "")}({Cond(w.Condition)}));\n");
					}
					break;
				case IForEachLoopOperation fe:
					{
						if (fe.LoopControlVariable is not IVariableDeclaratorOperation vd) throw new Refused("a foreach variable", fe.Syntax);
						sb.Append($"{p}for (const {LocalId(vd.Symbol.Name)} of {Expr(fe.Collection is IConversionOperation cv ? cv.Operand : fe.Collection)}) ");
						Nested(fe.Body, sb, d);
						break;
					}
				case ISwitchOperation sw:
					sb.Append($"{p}switch ({Expr(sw.Value)}) {{\n");
					foreach (var c in sw.Cases)
					{
						foreach (var clause in c.Clauses)
						{
							if (clause is IDefaultCaseClauseOperation) sb.Append($"{p}\tdefault:\n");
							else if (clause is ISingleValueCaseClauseOperation sv) sb.Append($"{p}\tcase {Expr(sv.Value)}:\n");
							else if (clause is IPatternCaseClauseOperation pc && pc.Pattern is IConstantPatternOperation cp) sb.Append($"{p}\tcase {Expr(cp.Value)}:\n");
							else throw new Refused("a switch case of kind " + clause.CaseKind, clause.Syntax);
						}
						foreach (var s in c.Body) Statement(s, sb, d + 2);
					}
					sb.Append(p + "}\n");
					break;
				case IBranchOperation br:
					if (br.BranchKind == BranchKind.Break) sb.Append(p + "break;\n");
					else if (br.BranchKind == BranchKind.Continue) sb.Append(p + "continue;\n");
					else throw new Refused("goto", br.Syntax);
					break;
				case IReturnOperation r:
					if (r.ReturnedValue == null) sb.Append(p + "return;\n");
					else sb.Append($"{p}return {Value(r.ReturnedValue, Method?.ReturnType ?? r.ReturnedValue.Type)};\n");
					break;
				case IEmptyOperation:
					break;
				case ITryOperation t:
					sb.Append(p + "try ");
					Nested(t.Body, sb, d);
					foreach (var c in t.Catches)
					{
						sb.Length--;
						string v = c.ExceptionDeclarationOrExpression is IVariableDeclaratorOperation ev ? LocalId(ev.Symbol.Name) : "_e";
						sb.Append($" catch ({v}) ");
						Nested(c.Handler, sb, d);
					}
					if (t.Finally != null)
					{
						sb.Length--;
						sb.Append(" finally ");
						Nested(t.Finally, sb, d);
					}
					break;
				case IThrowOperation th:
					sb.Append($"{p}throw new Error({JsonSerializer.Serialize(th.Syntax.ToString())});\n");
					break;
				case ILabeledOperation lb:
					throw new Refused("a label", lb.Syntax);
				default:
					throw new Refused("a statement: " + op.Kind, op.Syntax);
			}
		}

		void Nested(IOperation body, StringBuilder sb, int d)
		{
			if (body is IBlockOperation b)
			{
				sb.Append("{\n");
				foreach (var s in b.Operations) Statement(s, sb, d + 1);
				sb.Append(Pad(d) + "}\n");
			}
			else
			{
				sb.Append("{\n");
				Statement(body, sb, d + 1);
				sb.Append(Pad(d) + "}\n");
			}
		}

		// ---- Expressions ----

		string Cond(IOperation op) => Expr(op);

		/// An expression as a value of type `to` (structs copied, so they keep C#'s value semantics).
		public string Value(IOperation op, ITypeSymbol to)
		{
			string s = Expr(op);
			if (IsStruct(op.Type) && IsLvalue(op)) s += ".clone()";
			return s;
		}

		static bool IsLvalue(IOperation op) => op is ILocalReferenceOperation or IParameterReferenceOperation or IFieldReferenceOperation or IArrayElementReferenceOperation or IPropertyReferenceOperation;

		string Literal(object v, ITypeSymbol t)
		{
			if (v == null) return "null";
			switch (v)
			{
				case bool b: return b ? "true" : "false";
				case string s: return JsonSerializer.Serialize(s);
				case char c: return ((int)c).ToString();
				case float f: return Num((double)f);
				case double dd: return Num(dd);
				default: return System.Convert.ToDouble(v).ToString("R");
			}
		}

		static string Num(double d)
		{
			if (double.IsPositiveInfinity(d)) return "Infinity";
			if (double.IsNegativeInfinity(d)) return "-Infinity";
			if (double.IsNaN(d)) return "NaN";
			var s = d.ToString("R");
			return s.StartsWith("-") ? $"({s})" : s;
		}

		public string Expr(IOperation op)
		{
			if (op.ConstantValue.HasValue && op is not ILocalReferenceOperation)
				return Literal(op.ConstantValue.Value, op.Type);
			switch (op)
			{
				case IParenthesizedOperation pa: return Expr(pa.Operand);
				case ILiteralOperation l: return Literal(l.ConstantValue.Value, l.Type);
				case ILocalReferenceOperation lr: return LocalId(lr.Local.Name);
				case IParameterReferenceOperation pr: return LocalId(pr.Parameter.Name);
				case IInstanceReferenceOperation: return "this";
				case IDefaultValueOperation dv: return e.Default(dv.Type);
				case IConversionOperation c: return Conversion(c);
				case IBinaryOperation b: return Binary(b);
				case IUnaryOperation u: return Unary(u);
				case IConditionalOperation c: return $"({Cond(c.Condition)} ? {Value(c.WhenTrue, c.Type)} : {Value(c.WhenFalse, c.Type)})";
				case ICoalesceOperation co: return $"({Expr(co.Value)} ?? {Expr(co.WhenNull)})";
				case ISimpleAssignmentOperation { Target: IDiscardOperation } d: return $"void {Expr(d.Value)}";
				case ISimpleAssignmentOperation a: return Assign(a.Target, Value(a.Value, a.Target.Type));
				case ICompoundAssignmentOperation ca: return Compound(ca);
				case IIncrementOrDecrementOperation inc: return Increment(inc);
				case IFieldReferenceOperation f: return Field(f);
				case IPropertyReferenceOperation p: return Property(p);
				case IArrayElementReferenceOperation ae:
					if (ae.Indices.Length == 1) return $"{Expr(ae.ArrayReference)}[{Expr(ae.Indices[0])}]";
					return $"{Expr(ae.ArrayReference)}.get({string.Join(", ", ae.Indices.Select(Expr))})";
				case IInvocationOperation inv: return Invocation(inv);
				case IObjectCreationOperation oc: return Creation(oc);
				case IArrayCreationOperation ac: return ArrayCreation(ac);
				case IConditionalAccessOperation ca2: return ConditionalAccess(ca2);
				case IConditionalAccessInstanceOperation: return conditionalReceiver;
				case IInterpolatedStringOperation: return "''";
				case ISwitchExpressionOperation se:
					{
						string v = Expr(se.Value);
						var parts = new StringBuilder("(($v) => ");
						foreach (var arm in se.Arms)
						{
							if (arm.Guard != null) throw new Refused("a switch arm with a guard", arm.Syntax);
							string val = Value(arm.Value, se.Type);
							if (arm.Pattern is IConstantPatternOperation cp) parts.Append($"$v === {Expr(cp.Value)} ? {val} : ");
							else if (arm.Pattern is IDiscardPatternOperation) { parts.Append(val); parts.Append($")({v})"); return parts.ToString(); }
							else throw new Refused("a switch arm pattern", arm.Syntax);
						}
						parts.Append($"$hole('no switch arm'))({v})");
						return parts.ToString();
					}
				case INameOfOperation n: return Literal(n.ConstantValue.Value, n.Type);
				case IIsTypeOperation it: return IsType(it);
				case IIsPatternOperation ip: return IsPattern(ip);
				case IDynamicInvocationOperation or IDynamicMemberReferenceOperation or IDynamicIndexerAccessOperation or IDynamicObjectCreationOperation:
					return $"$hole({JsonSerializer.Serialize(op.Syntax.ToString())})";
				default: throw new Refused("an expression: " + op.Kind, op.Syntax);
			}
		}

		string conditionalReceiver = "";

		string ConditionalAccess(IConditionalAccessOperation op)
		{
			string recv = Expr(op.Operation);
			var saved = conditionalReceiver;
			conditionalReceiver = recv + "?";
			string s = Expr(op.WhenNotNull);
			conditionalReceiver = saved;
			return s.Replace(recv + "?.", recv + "?.").Replace(recv + "?[", recv + "?.[");
		}

		string IsType(IIsTypeOperation op)
		{
			if (op.TypeOperand is INamedTypeSymbol t && e.InSource(t)) return $"({Expr(op.ValueOperand)} instanceof {e.TypeName(t)})";
			throw new Refused("an 'is' check", op.Syntax);
		}

		string IsPattern(IIsPatternOperation op)
		{
			if (op.Pattern is IConstantPatternOperation cp) return $"({Expr(op.Value)} === {Expr(cp.Value)})";
			if (op.Pattern is INegatedPatternOperation { Pattern: IConstantPatternOperation ncp }) return $"({Expr(op.Value)} !== {Expr(ncp.Value)})";
			throw new Refused("a pattern", op.Syntax);
		}

		string Field(IFieldReferenceOperation f)
		{
			var s = f.Field;
			if (s.IsConst) return Literal(s.ConstantValue, s.Type);
			var key = Key(s);
			if (e.config.external.TryGetValue(key, out var ext))
			{
				e.externalUsed.Add(key);
				return ext;
			}
			if (IsHole(s)) return $"$hole({JsonSerializer.Serialize(key)})";
			if (!e.InSource(s.ContainingType)) throw new Refused("a field of " + s.ContainingType, f.Syntax);
			e.Need(s, f.Syntax);
			NoteStatic(s);
			if (s.IsStatic) return $"{e.TypeName(s.ContainingType)}.{Id(s.Name)}";
			return $"{Receiver(f.Instance)}.{Id(s.Name)}";
		}

		void NoteStatic(ISymbol s)
		{
			if (staticOwner != null && s.IsStatic && s.ContainingType is INamedTypeSymbol t && !SymbolEqualityComparer.Default.Equals(t, staticOwner.Type))
				staticOwner.StaticDeps.Add(t);
		}

		string Receiver(IOperation instance)
		{
			if (instance == null) return "this";
			if (instance is IConditionalAccessInstanceOperation) return conditionalReceiver;
			return Expr(instance);
		}

		string Property(IPropertyReferenceOperation p)
		{
			var s = p.Property;
			var key = Key(s);
			if (e.config.external.TryGetValue(key, out var ext))
			{
				e.externalUsed.Add(key);
				return p.Instance != null && ext.StartsWith(".") ? Receiver(p.Instance) + ext : ext;
			}
			if (s.Name == "Length" && p.Instance?.Type is IArrayTypeSymbol) return $"{Expr(p.Instance)}.length";
			if (s.Name == "Length" && p.Instance?.Type?.SpecialType == SpecialType.System_String) return $"{Expr(p.Instance)}.length";
			if (s.Name == "Count" && IsList(p.Instance?.Type)) return $"{Expr(p.Instance)}.length";
			if (s.IsIndexer)
			{
				if (IsList(p.Instance?.Type)) return $"{Expr(p.Instance)}[{Expr(p.Arguments[0].Value)}]";
				e.Need(s);
				return $"{Receiver(p.Instance)}.get_Item({ArgsFor(s.Parameters, p.Arguments, s.GetMethod)})";
			}
			if (IsHole(s)) return $"$hole({JsonSerializer.Serialize(key)})";
			if (!e.InSource(s.ContainingType)) throw new Refused("a property " + key, p.Syntax);
			e.Need(s);
			NoteStatic(s);
			if (s.IsStatic) return $"{e.TypeName(s.ContainingType)}.{Id(s.Name)}";
			return $"{Receiver(p.Instance)}.{Id(s.Name)}";
		}

		static bool IsList(ITypeSymbol t) => t is INamedTypeSymbol n && n.OriginalDefinition.ToDisplayString() == "System.Collections.Generic.List<T>";

		string Assign(IOperation target, string value)
		{
			if (target is IMemberReferenceOperation mr && IsHole(mr.Member)) return $"$hole({JsonSerializer.Serialize(Key(mr.Member))})";
			if (target is IArrayElementReferenceOperation ae && ae.Indices.Length > 1)
				return $"{Expr(ae.ArrayReference)}.set({string.Join(", ", ae.Indices.Select(Expr))}, {value})";
			if (target is IPropertyReferenceOperation p && p.Property.IsIndexer && !IsList(p.Instance?.Type))
			{
				e.Need(p.Property);
				return $"{Receiver(p.Instance)}.set_Item({ArgsFor(p.Property.Parameters, p.Arguments, p.Property.SetMethod)}, {value})";
			}
			return $"{Expr(target)} = {value}";
		}

		/// An arithmetic result as the C# type has it.
		string Fit(string s, ITypeSymbol t)
		{
			t = Under(t);
			switch (t?.SpecialType)
			{
				case SpecialType.System_Single: return $"Math.fround({s})";
				case SpecialType.System_Int32: return $"(({s}) | 0)";
				case SpecialType.System_UInt32: return $"(({s}) >>> 0)";
				case SpecialType.System_UInt16:
				case SpecialType.System_Char: return $"(({s}) & 0xFFFF)";
				case SpecialType.System_Int16: return $"((({s}) << 16) >> 16)";
				case SpecialType.System_Byte: return $"(({s}) & 0xFF)";
				case SpecialType.System_SByte: return $"((({s}) << 24) >> 24)";
				default: return $"({s})";
			}
		}

		string Binary(IBinaryOperation b)
		{
			if (b.OperatorMethod != null)
			{
				e.Need(b.OperatorMethod);
				return $"{e.TypeName(b.OperatorMethod.ContainingType)}.{b.OperatorMethod.Name}({Value(b.LeftOperand, null)}, {Value(b.RightOperand, null)})";
			}
			string l = Expr(b.LeftOperand), r = Expr(b.RightOperand);
			var t = Under(b.Type);
			var lt = Under(b.LeftOperand.Type);
			bool boolOps = lt?.SpecialType == SpecialType.System_Boolean;
			switch (b.OperatorKind)
			{
				case BinaryOperatorKind.ConditionalAnd: return $"({l} && {r})";
				case BinaryOperatorKind.ConditionalOr: return $"({l} || {r})";
				case BinaryOperatorKind.Equals: return $"({l} === {r})";
				case BinaryOperatorKind.NotEquals: return $"({l} !== {r})";
				case BinaryOperatorKind.LessThan: return $"({l} < {r})";
				case BinaryOperatorKind.LessThanOrEqual: return $"({l} <= {r})";
				case BinaryOperatorKind.GreaterThan: return $"({l} > {r})";
				case BinaryOperatorKind.GreaterThanOrEqual: return $"({l} >= {r})";
				case BinaryOperatorKind.And when boolOps: return $"$and({l}, {r})";
				case BinaryOperatorKind.Or when boolOps: return $"$or({l}, {r})";
				case BinaryOperatorKind.ExclusiveOr when boolOps: return $"({l} !== {r})";
			}
			if (t?.SpecialType == SpecialType.System_String && b.OperatorKind == BinaryOperatorKind.Add) return $"({l} + {r})";
			if (t?.TypeKind == TypeKind.Dynamic || lt?.TypeKind == TypeKind.Dynamic) return $"$hole({JsonSerializer.Serialize(b.Syntax.ToString())})";
			if (!IsNumeric(t)) throw new Refused("an operator on " + t, b.Syntax);
			bool i64 = t.SpecialType is SpecialType.System_Int64 or SpecialType.System_UInt64;
			switch (b.OperatorKind)
			{
				case BinaryOperatorKind.Add: return i64 ? $"({l} + {r})" : Fit($"{l} + {r}", t);
				case BinaryOperatorKind.Subtract: return i64 ? $"({l} - {r})" : Fit($"{l} - {r}", t);
				case BinaryOperatorKind.Multiply:
					if (t.SpecialType == SpecialType.System_Int32) return $"Math.imul({l}, {r})";
					return i64 ? $"({l} * {r})" : Fit($"{l} * {r}", t);
				case BinaryOperatorKind.Divide:
					if (IsIntegral(t)) return i64 ? $"Math.trunc({l} / {r})" : Fit($"{l} / {r}", t);
					return Fit($"{l} / {r}", t);
				case BinaryOperatorKind.Remainder: return Fit($"{l} % {r}", t);
				case BinaryOperatorKind.And: return Fit($"{l} & {r}", t);
				case BinaryOperatorKind.Or: return Fit($"{l} | {r}", t);
				case BinaryOperatorKind.ExclusiveOr: return Fit($"{l} ^ {r}", t);
				case BinaryOperatorKind.LeftShift: return Fit($"{l} << {r}", t);
				case BinaryOperatorKind.RightShift: return t.SpecialType == SpecialType.System_UInt32 ? $"({l} >>> {r})" : Fit($"{l} >> {r}", t);
			}
			throw new Refused("operator " + b.OperatorKind, b.Syntax);
		}

		string Unary(IUnaryOperation u)
		{
			if (u.OperatorMethod != null) throw new Refused("a user-defined unary operator", u.Syntax);
			string x = Expr(u.Operand);
			switch (u.OperatorKind)
			{
				case UnaryOperatorKind.Not: return $"!{x}";
				case UnaryOperatorKind.Minus: return IsIntegral(u.Type) ? Fit($"-{x}", u.Type) : $"(-{x})";
				case UnaryOperatorKind.Plus: return x;
				case UnaryOperatorKind.BitwiseNegation: return Fit($"~{x}", u.Type);
				case UnaryOperatorKind.True: return $"!!{x}";
				case UnaryOperatorKind.False: return $"!{x}";
			}
			throw new Refused("unary " + u.OperatorKind, u.Syntax);
		}

		string Conversion(IConversionOperation c)
		{
			string x = Expr(c.Operand);
			var from = Under(c.Operand.Type);
			var to = Under(c.Type);
			if (c.OperatorMethod != null)
			{
				e.Need(c.OperatorMethod);
				return $"{e.TypeName(c.OperatorMethod.ContainingType)}.{c.OperatorMethod.Name}({x})";
			}
			if (from == null || to == null || SymbolEqualityComparer.Default.Equals(from, to)) return x;
			if (!IsNumeric(to) || !IsNumeric(from)) return x; // reference, boxing, nullable, enum
			bool fromReal = from.SpecialType is SpecialType.System_Single or SpecialType.System_Double;
			switch (to.SpecialType)
			{
				case SpecialType.System_Double: return x;
				case SpecialType.System_Single: return from.SpecialType == SpecialType.System_Double || !IsInt32ish(from) ? $"Math.fround({x})" : x;
				case SpecialType.System_Int64:
				case SpecialType.System_UInt64: return fromReal ? $"Math.trunc({x})" : x;
			}
			if (fromReal) x = $"Math.trunc({x})";
			// Widening between integers needs nothing.
			if (!fromReal && Widens(from, to)) return x;
			return Fit(x, to);
		}

		static bool Widens(ITypeSymbol from, ITypeSymbol to)
		{
			int Rank(ITypeSymbol t) => t.SpecialType switch
			{
				SpecialType.System_Byte => 1,
				SpecialType.System_SByte => 1,
				SpecialType.System_Int16 => 2,
				SpecialType.System_UInt16 => 2,
				SpecialType.System_Char => 2,
				SpecialType.System_Int32 => 3,
				SpecialType.System_UInt32 => 3,
				_ => 4
			};
			bool signedFrom = from.SpecialType is SpecialType.System_SByte or SpecialType.System_Int16 or SpecialType.System_Int32;
			bool signedTo = to.SpecialType is SpecialType.System_SByte or SpecialType.System_Int16 or SpecialType.System_Int32;
			if (Rank(to) > Rank(from)) return signedTo || !signedFrom;
			return false;
		}

		string Compound(ICompoundAssignmentOperation ca)
		{
			var t = Under(ca.Target.Type);
			string read = Expr(ca.Target);
			string val = Expr(ca.Value);
			string op = ca.OperatorKind switch
			{
				BinaryOperatorKind.Add => "+",
				BinaryOperatorKind.Subtract => "-",
				BinaryOperatorKind.Multiply => "*",
				BinaryOperatorKind.Divide => "/",
				BinaryOperatorKind.Remainder => "%",
				BinaryOperatorKind.And => "&",
				BinaryOperatorKind.Or => "|",
				BinaryOperatorKind.ExclusiveOr => "^",
				BinaryOperatorKind.LeftShift => "<<",
				BinaryOperatorKind.RightShift => ">>",
				_ => throw new Refused("compound " + ca.OperatorKind, ca.Syntax)
			};
			string result;
			if (ca.OperatorMethod != null)
			{
				e.Need(ca.OperatorMethod);
				result = $"{e.TypeName(ca.OperatorMethod.ContainingType)}.{ca.OperatorMethod.Name}({read}, {Value(ca.Value, null)})";
			}
			else if (t.SpecialType == SpecialType.System_Boolean)
				result = op == "&" ? $"$and({read}, {val})" : op == "|" ? $"$or({read}, {val})" : $"({read} !== {val})";
			else if (t.SpecialType == SpecialType.System_Double || t.SpecialType == SpecialType.System_Int64)
			{
				if (!(op == "/" && t.SpecialType == SpecialType.System_Int64) && ca.Target is ILocalReferenceOperation or IFieldReferenceOperation or IParameterReferenceOperation or IArrayElementReferenceOperation { Indices.Length: 1 })
					return $"{read} {op}= {val}";
				result = op == "/" && t.SpecialType == SpecialType.System_Int64 ? $"Math.trunc({read} / {val})" : $"({read} {op} {val})";
			}
			else
			{
				// The operation happens in the operator's type (int, float...), then fits the target.
				var opType = ca.Type;
				var inType = t;
				string a = read, b2 = val;
				string calc;
				var ot = Under(ca.OperatorMethod?.ReturnType ?? BinaryType(inType, ca.Value.Type));
				if (op == "*" && ot.SpecialType == SpecialType.System_Int32) calc = $"Math.imul({a}, {b2})";
				else calc = Fit($"{a} {op} {b2}", ot);
				result = SymbolEqualityComparer.Default.Equals(ot, t) ? calc : FitTo(calc, ot, t);
			}
			return Assign(ca.Target, result);
		}

		ITypeSymbol BinaryType(ITypeSymbol a, ITypeSymbol b)
		{
			a = Under(a);
			b = Under(b);
			if (a.SpecialType == SpecialType.System_Double || b.SpecialType == SpecialType.System_Double) return e.compilation.GetSpecialType(SpecialType.System_Double);
			if (a.SpecialType == SpecialType.System_Single || b.SpecialType == SpecialType.System_Single) return e.compilation.GetSpecialType(SpecialType.System_Single);
			if (a.SpecialType is SpecialType.System_Int64 || b.SpecialType is SpecialType.System_Int64) return e.compilation.GetSpecialType(SpecialType.System_Int64);
			if (a.SpecialType is SpecialType.System_UInt32 && b.SpecialType is SpecialType.System_UInt32) return a;
			return e.compilation.GetSpecialType(SpecialType.System_Int32);
		}

		string FitTo(string x, ITypeSymbol from, ITypeSymbol to)
		{
			bool fromReal = from.SpecialType is SpecialType.System_Single or SpecialType.System_Double;
			if (to.SpecialType == SpecialType.System_Single) return $"Math.fround({x})";
			if (to.SpecialType == SpecialType.System_Double) return x;
			if (fromReal) x = $"Math.trunc({x})";
			return Fit(x, to);
		}

		string Increment(IIncrementOrDecrementOperation inc)
		{
			bool up = inc.Kind == OperationKind.Increment;
			var t = Under(inc.Target.Type);
			bool simple = inc.Target is ILocalReferenceOperation or IParameterReferenceOperation or IFieldReferenceOperation or IArrayElementReferenceOperation { Indices.Length: 1 };
			if (simple && (t.SpecialType is SpecialType.System_Int32 or SpecialType.System_Double or SpecialType.System_Int64))
			{
				string x = Expr(inc.Target);
				return inc.IsPostfix ? $"{x}{(up ? "++" : "--")}" : $"{(up ? "++" : "--")}{x}";
			}
			// Narrow types wrap; anything else (indexers, 2D arrays) is spelled out.
			if (inc.IsPostfix && !(inc.Parent is IExpressionStatementOperation))
				throw new Refused("a postfix increment used as a value", inc.Syntax);
			return Assign(inc.Target, Fit($"{Expr(inc.Target)} {(up ? "+" : "-")} 1", t));
		}

		public string Args(IMethodSymbol m, System.Collections.Immutable.ImmutableArray<IArgumentOperation> args) => ArgsFor(m.Parameters, args, m);

		public string ArgsFor(System.Collections.Immutable.ImmutableArray<IParameterSymbol> parameters, System.Collections.Immutable.ImmutableArray<IArgumentOperation> args, IMethodSymbol m)
		{
			var byParam = args.ToDictionary(a => a.Parameter.Ordinal, a => a, EqualityComparer<int>.Default);
			var list = new List<string>();
			foreach (var p in parameters)
			{
				if (!byParam.TryGetValue(p.Ordinal, out var a))
				{
					list.Add(p.HasExplicitDefaultValue ? Literal(p.ExplicitDefaultValue, p.Type) : e.Default(p.Type));
					continue;
				}
				if (a.ArgumentKind == ArgumentKind.ParamArray)
				{
					var arr = a.Value as IArrayCreationOperation;
					list.Add(arr?.Initializer != null ? "[" + string.Join(", ", arr.Initializer.ElementValues.Select(v => Value(v, null))) + "]" : "[]");
					continue;
				}
				if (p.RefKind is RefKind.Ref or RefKind.Out) throw new Refused($"{p.RefKind} argument to {Key(m)}", a.Syntax);
				list.Add(Value(a.Value, p.Type));
			}
			return string.Join(", ", list);
		}

		static readonly Dictionary<string, string> MathNames = new()
		{
			["Abs"] = "Math.abs",
			["Min"] = "Math.min",
			["Max"] = "Math.max",
			["Sqrt"] = "Math.sqrt",
			["Floor"] = "Math.floor",
			["Ceiling"] = "Math.ceil",
			["Pow"] = "Math.pow",
			["Sin"] = "Math.sin",
			["Cos"] = "Math.cos",
			["Tan"] = "Math.tan",
			["Atan2"] = "Math.atan2",
			["Exp"] = "Math.exp",
			["Log"] = "Math.log",
			["Sign"] = "Math.sign",
			["Round"] = "$round",
			["Truncate"] = "Math.trunc"
		};

		string Invocation(IInvocationOperation inv)
		{
			var m = inv.TargetMethod;
			var def = m.ReducedFrom ?? m;
			if (def.IsGenericMethod) def = def.OriginalDefinition;
			string key = Key(def);
			if (e.config.external.TryGetValue(key, out var ext))
			{
				e.externalUsed.Add(key);
				string a = Args(m, inv.Arguments);
				if (ext.StartsWith(".")) return $"{Receiver(inv.Instance)}{ext}({a})";
				if (ext.StartsWith("@")) return $"{ext[1..]}({Receiver(inv.Instance)}{(a.Length > 0 ? ", " + a : "")})";
				return $"{ext}({a})";
			}
			if (m.ContainingType.ToDisplayString() == "System.Math" && MathNames.TryGetValue(m.Name, out var mn))
			{
				string call = $"{mn}({Args(m, inv.Arguments)})";
				return IsFloat(m.ReturnType) && m.Name is not ("Abs" or "Min" or "Max" or "Sign") ? $"Math.fround({call})" : call;
			}
			if (IsList(inv.Instance?.Type))
			{
				string recv = Expr(inv.Instance);
				string a = Args(m, inv.Arguments);
				return m.Name switch
				{
					"Add" => $"{recv}.push({a})",
					"Clear" => $"({recv}.length = 0)",
					"Contains" => $"{recv}.includes({a})",
					"RemoveAt" => $"{recv}.splice({a}, 1)",
					_ => throw new Refused("List." + m.Name, inv.Syntax)
				};
			}
			if (IsHole(def)) return $"$hole({JsonSerializer.Serialize(key)})";
			if (!e.InSource(def.ContainingType)) throw new Refused("a call to " + key, inv.Syntax);
			e.Need(def, inv.Syntax);
			NoteStatic(def);
			string args = Args(m, inv.Arguments);
			if (def.IsStatic) return $"{e.TypeName(def.ContainingType)}.{e.MemberName(def)}({args})";
			if (inv.Instance is IInstanceReferenceOperation { ReferenceKind: InstanceReferenceKind.ContainingTypeInstance } && inv.Syntax is InvocationExpressionSyntax { Expression: MemberAccessExpressionSyntax { Expression: BaseExpressionSyntax } })
				return $"super.{e.MemberName(def)}({args})";
			return $"{Receiver(inv.Instance)}.{e.MemberName(def)}({args})";
		}

		string Creation(IObjectCreationOperation oc)
		{
			var t = (INamedTypeSymbol)oc.Type;
			if (IsList(t)) return "[]";
			if (IsHole(t)) return $"$hole({JsonSerializer.Serialize(t.ToDisplayString())})";
			if (!e.InSource(t)) throw new Refused("creating a " + t, oc.Syntax);
			e.NeedType(t);
			if (staticOwner != null && !SymbolEqualityComparer.Default.Equals(t, staticOwner.Type)) staticOwner.StaticDeps.Add(t);
			if (oc.Constructor != null && !oc.Constructor.IsImplicitlyDeclared) e.Need(oc.Constructor);
			string args = oc.Constructor != null && oc.Constructor.Parameters.Length > 0 ? Args(oc.Constructor, oc.Arguments) : "";
			string s = $"new {e.TypeName(t)}({args})";
			if (oc.Initializer != null)
			{
				var sets = oc.Initializer.Initializers.Select(i => i is ISimpleAssignmentOperation a && a.Target is IMemberReferenceOperation mr
					? $"o.{Id(mr.Member.Name)} = {Value(a.Value, a.Target.Type)};"
					: throw new Refused("an object initializer", i.Syntax));
				s = $"((o) => {{ {string.Concat(sets)} return o; }})({s})";
			}
			return s;
		}

		string ArrayCreation(IArrayCreationOperation ac)
		{
			var at = (IArrayTypeSymbol)ac.Type;
			if (at.Rank > 1)
				return $"new Array2D<{e.Ts(at.ElementType)}>({string.Join(", ", ac.DimensionSizes.Select(Expr))}, () => {e.Default(at.ElementType)})";
			var ta = TypedArray(at.ElementType);
			if (ac.Initializer != null)
			{
				var vals = string.Join(", ", ac.Initializer.ElementValues.Select(v => Value(v, at.ElementType)));
				return ta != null ? $"{ta}.of({vals})" : $"[{vals}]";
			}
			string n = Expr(ac.DimensionSizes[0]);
			if (ta != null) return $"new {ta}({n})";
			return $"Array.from({{ length: {n} }}, (): {e.Ts(at.ElementType)} => {e.Default(at.ElementType)})";
		}
	}
}
