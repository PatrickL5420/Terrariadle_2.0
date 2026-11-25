#!/usr/bin/env node
/**
 * Pulls members (methods, nested types, fields) out of Terraria's decompiled source into the
 * oracle's game/ folder (git-ignored: it's the game's code), so the oracle can run the game's
 * own logic. Which members come from where is listed in oracle/sources.json:
 *
 *   { "file": "Terraria/WorldGen.cs", "class": "WorldGen", "members": ["TileFrame", ...] }
 *   { "file": "Terraria.ID/TileID.cs" }                      (a whole file)
 *
 * Every overload of a named method is taken. The decompiler's artefacts are rewritten into
 * plain C# (see FIXUPS). Usage: TERRARIA_SRC=/path/to/decompiled/src node tools/verify/extract.mjs
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const OUT = join(here, 'oracle/game');
export const SOURCES = join(here, 'oracle/sources.json');
let keep = [];
/** Only the namespaces the oracle has (the game's own, or its stubs): the rest are dropped. */
const usingsOf = (lines) =>
	lines
		.filter((l) => /^using /.test(l) && keep.includes(l.replace(/^using (static )?|;$/g, '')))
		.join('\n');

/** ILSpy artefacts -> C#. */
const FIXUPS = [
	// ((Rectangle)(ref val))._002Ector(a, b, c, d);  ->  val = new Rectangle(a, b, c, d);
	[/\(\((\w[\w.]*)\)\(ref (\w+)\)\)\._002Ector\(([^;]*)\);/g, '$2 = new $1($3);'],
	// ((Vector2)(ref val)).Length()  ->  val.Length()
	[/\(\((\w[\w.]*)\)\(ref ([\w.[\]]+)\)\)/g, '$2'],
	// JSON (de)serialisation attributes (Newtonsoft's): metadata only.
	[/^\t*\[Json\w*(\(.*\))?\]\n/gm, ''],
	// An empty `catch { }` would hide a case going wrong: report what it caught instead.
	[
		/catch\n(\t+)\{\n\t+\}/g,
		'catch (System.Exception __caught)\n$1{\n$1\tOracle.Stub.Caught(__caught);\n$1}'
	]
];

const fix = (code) => FIXUPS.reduce((c, [re, to]) => c.replace(re, to), code);

/** The lines of every member called `name` at one tab of indent in a class body. */
export function members(lines, name) {
	const out = [];
	const head = new RegExp(
		`^\\t(?:\\[.*\\]\\s*)?(?:(?:public|private|protected|internal|static|readonly|override|virtual|unsafe|const|extern|new|sealed|abstract|partial)\\s+)+[^=;(]*?\\b${name}\\b\\s*(\\(|\\{|=|;|<|$)`
	);
	for (let k = 0; k < lines.length; k++) {
		if (!head.test(lines[k])) continue;
		// Attributes on the lines above.
		let start = k;
		while (start > 0 && /^\t\[/.test(lines[start - 1])) start--;
		// A one-line member (field), or a block to the matching closing brace at one tab.
		const opens = lines[k].split('{').length - 1;
		const closes = lines[k].split('}').length - 1;
		// (A one-liner: a field, or braces that close on the same line, like { get; set; }.)
		if ((/;\s*$/.test(lines[k]) && !opens) || (opens && opens === closes)) {
			out.push(lines.slice(start, k + 1).join('\n'));
			continue;
		}
		let end = k;
		while (
			end < lines.length &&
			!/^\t\};?$/.test(lines[end]) &&
			!/^\t[^\t{}].*\};$/.test(lines[end])
		)
			end++;
		// Expression-bodied members end with ';' on their own lines.
		out.push(lines.slice(start, end + 1).join('\n'));
		k = end;
	}
	return out;
}

/**
 * A slice of a long method, as a method of its own: from the line `from` (after the line
 * `after`, if given; `fromOffset` lines before it) to the line `to` (and its block, if it opens
 * one), then on until the braces balance. For running part of something like Player.Update, the game's code in the game's order.
 */
export function slice(lines, s) {
	const find = (text, start) => {
		for (let k = start; k < lines.length; k++) if (lines[k].trim() === text) return k;
		throw new Error(`slice ${s.name}: line not found: ${text}`);
	};
	const base = s.after ? find(s.after, 0) : 0;
	const from = find(s.from, base) - (s.fromOffset ?? 0);
	let end = find(s.to, from);
	let depth = 0;
	for (let k = from; k <= end; k++) depth += count(lines[k], '{') - count(lines[k], '}');
	// A last line that opens a block (`if (...)`, `else`) takes its block.
	if (!/[;}]\s*$/.test(lines[end])) {
		end++;
		depth += count(lines[end], '{') - count(lines[end], '}');
	}
	while (depth > 0) {
		end++;
		depth += count(lines[end], '{') - count(lines[end], '}');
	}
	if (depth < 0) throw new Error(`slice ${s.name}: braces don't balance`);
	const indent = lines[from].match(/^\t*/)[0].length;
	const body = lines
		.slice(from, end + 1)
		.map((l) => '\t\t' + l.slice(Math.min(indent, l.match(/^\t*/)[0].length)))
		.join('\n');
	return `\t// ${s.from} ... ${s.to}\n\tpublic void ${s.name}(${s.params ?? ''})\n\t{\n${body}\n\t}`;
}
const count = (line, ch) => line.split(ch).length - 1;

/**
 * A world generation pass (a delegate in WorldGen.GenerateWorld:
 * `AddGenerationPass(GenPassNameID.Clay, delegate(GenerationProgress progress, ...) { ... });`)
 * as a method of its own, `Pass_Clay(progress, passConfig)`.
 */
export function pass(lines, name) {
	const start = lines.findIndex((l) =>
		new RegExp(`AddGenerationPass\\(GenPassNameID\\.${name}, delegate`).test(l)
	);
	if (start < 0) throw new Error(`pass not found: ${name}`);
	const indent = lines[start].match(/^\t*/)[0];
	let end = start + 1;
	while (lines[end] !== `${indent}});`) end++;
	const body = lines
		.slice(start + 1, end)
		.map((l) => '\t' + l.slice(Math.min(indent.length, l.match(/^\t*/)[0].length)))
		.join('\n');
	return `\tpublic static void Pass_${name}(GenerationProgress progress, GameConfiguration passConfig)\n${body}\n\t}`;
}

/**
 * A stand-in for each overload of `name`, with the game's own signature: `refuse` ones refuse
 * the case if they're ever called (Stub.Hit), `noop` ones just return (for code reviewed to be
 * visual only). Out parameters get their defaults; anything returned is the type's default.
 */
export function standIns(lines, name, cls, refuse) {
	return members(lines, name).map((code) => {
		const all = code.split('\n');
		let k = all.findIndex((l) => /^\t[^\t[]/.test(l));
		let header = all[k];
		while (!header.includes(')') && k + 1 < all.length) header += ' ' + all[++k].trim();
		header = header.replace(/\s*=>.*$/, '').replace(/\s*\{\s*$/, '');
		const params = header.slice(header.indexOf('(') + 1, header.lastIndexOf(')'));
		const outs = [...params.matchAll(/\bout\s+[\w<>,.[\]?]+\s+(\w+)/g)].map(
			(m) => `\t\t${m[1]} = default;`
		);
		const returns =
			!/\bvoid\s+\w+\s*(<[^>]*>)?\s*\(/.test(header) && !/\b(event|class|struct)\b/.test(header);
		const body = [
			...outs,
			refuse ? `\t\tOracle.Stub.Hit("${cls}.${name}");` : '',
			returns ? '\t\treturn default;' : ''
		].filter(Boolean);
		return `${header.replace(/\babstract\s+/, '')}\n\t{\n${body.join('\n')}\n\t}`;
	});
}

/** Writes oracle/game/ from oracle/sources.json (members listed, plus the build's `auto` ones). */
export function extract(src) {
	const config = JSON.parse(readFileSync(SOURCES, 'utf8'));
	keep = config.usings;
	const { sources } = config;

	rmSync(OUT, { recursive: true, force: true });
	mkdirSync(OUT, { recursive: true });
	let count = 0;
	for (const s of sources) {
		const text = readFileSync(join(src, s.file), 'utf8').replace(/\r/g, '');
		const name = s.out ?? `${s.class ?? s.file.replace(/[/.]/g, '_')}.cs`;
		if (!s.members) {
			const all = text.split('\n');
			// #define lines must come first in a file: keep them ahead of the usings.
			const defines = all.filter((l) => /^#(define|undef) /.test(l));
			const rest = all.filter((l) => !/^using /.test(l) && !/^#(define|undef) /.test(l));
			writeFileSync(join(OUT, name), fix([...defines, usingsOf(all), ...rest].join('\n')));
			count++;
			continue;
		}
		const lines = text.split('\n');
		const usings = usingsOf(lines);
		const ns = lines.find((l) => /^namespace /.test(l)) ?? '';
		const kind = s.kind ?? 'class';
		const body = [...s.members, ...(s.auto ?? [])]
			.filter((m) => ![...(s.stubbed ?? []), ...(s.refuse ?? []), ...(s.noop ?? [])].includes(m))
			.flatMap((m) => {
				const found = members(lines, m);
				if (!found.length) throw new Error(`${s.file}: member not found: ${m}`);
				return found;
			})
			.concat((s.slices ?? []).map((sl) => slice(lines, sl)))
			.concat((s.passes ?? []).map((name) => pass(lines, name)))
			.concat((s.refuse ?? []).flatMap((m) => standIns(lines, m, s.class, true)))
			.concat((s.noop ?? []).flatMap((m) => standIns(lines, m, s.class, false)))
			// One declaration can name several members (int a, b;): take it once.
			.filter((code, k, all) => all.indexOf(code) === k)
			.join('\n\n');
		writeFileSync(
			join(OUT, name),
			`// Extracted from ${s.file} by tools/verify/extract.mjs. The game's code: not committed.\n${usings}\n\n${ns}\n\npublic ${s.static ? 'static ' : ''}partial ${kind} ${s.class}\n{\n${fix(body)}\n}\n`
		);
		count++;
	}
	// Every namespace the oracle has, for its own stubs and features (global usings).
	const declared = new Set(['System', 'System.Collections.Generic', 'System.Linq', 'System.IO']);
	for (const dir of [OUT, join(here, 'oracle/stubs')])
		for (const file of readdirSync(dir))
			for (const m of readFileSync(join(dir, file), 'utf8').matchAll(/^\s*namespace ([\w.]+)/gm))
				declared.add(m[1]);
	const exists = (ns) => declared.has(ns) || ns.startsWith('System');
	// A using of a namespace the oracle doesn't have (its types are placeholders) goes.
	for (const file of readdirSync(OUT)) {
		const path = join(OUT, file);
		const text = readFileSync(path, 'utf8');
		const pruned = text.replace(/^using ([\w.]+);\n/gm, (line, ns) => (exists(ns) ? line : ''));
		if (pruned !== text) writeFileSync(path, pruned);
	}
	const globals = keep.filter(exists);
	writeFileSync(
		join(OUT, 'GlobalUsings.cs'),
		globals.map((ns) => `global using ${ns};`).join('\n') + '\n'
	);
	return count;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	if (!process.env.TERRARIA_SRC) {
		console.error(
			'Set TERRARIA_SRC to the decompiled source folder (the one with Terraria/ in it).'
		);
		process.exit(1);
	}
	console.log(`Extracted ${extract(process.env.TERRARIA_SRC)} files into ${OUT}`);
}
