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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
		if (/;\s*$/.test(lines[k]) && !/\{/.test(lines[k])) {
			out.push(lines.slice(start, k + 1).join('\n'));
			continue;
		}
		let end = k;
		while (end < lines.length && lines[end] !== '\t}' && !/^\t[^\t].*\};?$/.test(lines[end])) end++;
		// Expression-bodied members end with ';' on their own lines.
		out.push(lines.slice(start, end + 1).join('\n'));
		k = end;
	}
	return out;
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
			writeFileSync(
				join(OUT, name),
				fix([usingsOf(all), ...all.filter((l) => !/^using /.test(l))].join('\n'))
			);
			count++;
			continue;
		}
		const lines = text.split('\n');
		const usings = usingsOf(lines);
		const ns = lines.find((l) => /^namespace /.test(l)) ?? '';
		const kind = s.kind ?? 'class';
		const body = [...s.members, ...(s.auto ?? [])]
			.flatMap((m) => {
				const found = members(lines, m);
				if (!found.length) throw new Error(`${s.file}: member not found: ${m}`);
				return found;
			})
			.join('\n\n');
		writeFileSync(
			join(OUT, name),
			`// Extracted from ${s.file} by tools/verify/extract.mjs. The game's code: not committed.\n${usings}\n\n${ns}\n\npublic partial ${kind} ${s.class}\n{\n${fix(body)}\n}\n`
		);
		count++;
	}
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
