#!/usr/bin/env node
/**
 * Builds the oracle: extracts the game's code (extract.mjs), compiles it with the stubs, and
 * while the compiler can't find a name that the game's source declares as a field or a small
 * method of the same class, adds it to that source's `auto` list in oracle/sources.json and goes
 * again. What's left is printed: stub it in oracle/stubs/ (or list it in `members` if it's real
 * logic the feature needs).
 *
 * Types in sources.json's `neverReal` keep their placeholder (e.g. Windows-only code).
 * A source can list `"inherits": ["Entity"]`: names it can't find in its own class are looked
 * for in those classes' sources too.
 *
 * Usage: TERRARIA_SRC=/path/to/decompiled/src node tools/verify/build.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract, members, SOURCES } from './extract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ORACLE = join(here, 'oracle');
/** Methods longer than this aren't pulled in automatically (they'd drag in half the game). */
const MAX_AUTO_LINES = 40;

const src = process.env.TERRARIA_SRC;
if (!src) {
	console.error('Set TERRARIA_SRC to the decompiled source folder (the one with Terraria/ in it).');
	process.exit(1);
}

function build() {
	try {
		execFileSync('dotnet', ['build', '-nologo', '-v', 'q', '-c', 'Release'], {
			cwd: ORACLE,
			encoding: 'utf8',
			stdio: 'pipe'
		});
		return [];
	} catch (e) {
		return [...new Set(`${e.stdout}`.split('\n').filter((l) => / error /.test(l)))];
	}
}

/**
 * Types the game's code names that we neither extract nor stub by hand get placeholder stubs
 * (oracle/game/AutoStubs.cs, regenerated): empty classes whose missing members are `dynamic`.
 * They let the code compile; using one at run time throws (or reaches Stub.Hit), so a case
 * that gets there is refused. Anything a feature really runs through gets a real stub instead.
 */
const AUTOSTUBS = join(ORACLE, 'game/AutoStubs.cs');

/** Classes and members declared in the hand-written stubs (they win over placeholders). */
function handStubbed() {
	const declared = new Set();
	for (const file of readdirSync(join(ORACLE, 'stubs'))) {
		const text = readFileSync(join(ORACLE, 'stubs', file), 'utf8');
		// The class declared at each indent (file-scoped namespaces start at 0, block ones at 1).
		const at = [];
		for (const line of text.split('\n')) {
			const depth = line.match(/^\t*/)[0].length;
			const c = line.match(/\b(?:class|struct|enum|delegate [\w<>]+) (\w+)/);
			if (c) {
				// A nested class is also a member of the class around it.
				const outer = at.slice(0, depth).reverse().find(Boolean);
				// A whole type stubbed by hand (not a partial class that placeholders may add to).
				if (!/partial class/.test(line)) declared.add(`${outer ? `${outer}.` : ''}${c[1]}:type`);
				if (outer) declared.add(`${outer}.${c[1]}`);
				at[depth] = c[1];
				at.length = depth + 1;
				continue;
			}
			const m = line.match(/^\s*public [^(=;]*?\b(\w+)\s*(\(|=>|=|;|\{)/);
			const cls = at.slice(0, depth).reverse().find(Boolean);
			if (cls && m) declared.add(`${cls}.${m[1]}`);
		}
	}
	return declared;
}

function writeAutoStubs(config) {
	const types = config.autostubs ?? {};
	const hand = handStubbed();
	// Extracted classes aren't placeholders; hand-stubbed members win over placeholder ones.
	for (const src of config.sources) if (src.class) delete types[src.class];
	// So are the types whole extracted files declare (a placeholder would shadow them).
	for (const file of readdirSync(join(ORACLE, 'game'))) {
		if (file === 'AutoStubs.cs') continue;
		const text = readFileSync(join(ORACLE, 'game', file), 'utf8');
		for (const m of text.matchAll(
			/^public (?:static |abstract |sealed |partial )*(?:class|struct|enum) (\w+)/gm
		))
			delete types[m[1]];
	}
	for (const type of Object.keys(types)) if (hand.has(`${type}:type`)) delete types[type];
	for (const type of Object.keys(types))
		types[type] = types[type].filter(
			(m) => !hand.has(`${type.split('.').pop()}.${m.split(':')[0]}`)
		);
	const out = [
		"// Placeholders for game types the oracle doesn't run (see build.mjs). Generated.",
		'namespace Terraria',
		'{'
	];
	/** Writes `type` (and the types nested in it, "Outer.Inner") at `depth` tabs. */
	const write = (type, depth) => {
		const tab = '\t'.repeat(depth);
		const name = type.split('.').pop();
		out.push(`${tab}public partial class ${name}`, `${tab}{`);
		const done = new Set();
		for (const m of types[type]) {
			const [member, kind] = m.split(':');
			if (types[`${type}.${member}`] || done.has(member)) continue; // a nested type of that name
			done.add(member);

			const stat = kind.startsWith('static') ? 'static ' : '';
			if (kind.endsWith('method'))
				out.push(
					`${tab}\tpublic ${stat}dynamic ${member}(params object[] a) => throw new System.NotSupportedException("${type}.${member}");`
				);
			else if (kind === 'ctor') out.push(`${tab}\tpublic ${name}(params object[] a) { }`);
			else out.push(`${tab}\tpublic ${stat}dynamic ${member};`);
		}
		for (const inner of Object.keys(types).filter(
			(t) => t.startsWith(`${type}.`) && !t.slice(type.length + 1).includes('.')
		))
			write(inner, depth + 1);
		out.push(`${tab}}`);
	};
	for (const type of Object.keys(types)
		.filter((t) => !t.includes('.'))
		.sort())
		write(type, 1);
	out.push('}');
	writeFileSync(AUTOSTUBS, out.join('\n') + '\n');
}

/**
 * Small files of the game that define a type (enums, ID tables, data structs): a placeholder for
 * one of these is swapped for the real file, which is more faithful and nearly free.
 */
const SMALL_FILE_LINES = 150;
let typeIndex = null;
function smallTypeFile(type) {
	if (!typeIndex) {
		typeIndex = new Map();
		for (const dir of readdirSync(src)) {
			if (!statSync(join(src, dir)).isDirectory()) continue;
			for (const file of readdirSync(join(src, dir))) {
				if (!file.endsWith('.cs')) continue;
				const text = readFileSync(join(src, dir, file), 'utf8');
				const lines = text.split('\n').length;
				for (const m of text.matchAll(
					/^(?:public |internal )?(?:(?:static|sealed|abstract|readonly|partial) )*(?:class|struct|enum|interface) (\w+)/gm
				))
					if (!typeIndex.has(m[1]))
						typeIndex.set(m[1], {
							file: `${dir}/${file}`,
							lines,
							ns: text.match(/^namespace ([\w.]+);/m)?.[1]
						});
			}
		}
	}
	const hit = typeIndex.get(type);
	return hit && hit.lines <= SMALL_FILE_LINES ? hit : null;
}

/** Only plain data is swapped in this way (sources.json's realNamespaces: IDs, enums, structs). */
function swappable(config, real) {
	return (config.realNamespaces ?? []).includes(real.file.split('/')[0]);
}

/** Swaps placeholders for small real files where there is one. True if any were swapped. */
function useRealSmallTypes(config) {
	let changed = false;
	for (const type of Object.keys(config.autostubs ?? {})) {
		if (type.includes('.')) continue;
		if ((config.neverReal ?? []).includes(type)) continue; // e.g. Windows-only code
		const real = smallTypeFile(type);
		if (!real || !swappable(config, real) || config.sources.some((s) => s.file === real.file))
			continue;
		config.sources.push({ file: real.file, class: type });
		if (real.ns && !config.usings.includes(real.ns)) config.usings.push(real.ns);
		for (const k of Object.keys(config.autostubs))
			if (k === type || k.startsWith(`${type}.`)) delete config.autostubs[k];
		console.log(`  using the game's ${real.file} for ${type}`);
		changed = true;
	}
	return changed;
}

/** For an error at file(line,col) about `name`: is it called there? */
function calledAt(line, name) {
	const m = line.match(/^(.*?\.cs)\((\d+),(\d+)\)/);
	if (!m) return false;
	const text = readFileSync(m[1], 'utf8').split('\n')[Number(m[2]) - 1] ?? '';
	return new RegExp(`\\b${name}\\s*\\(`).test(text);
}

/** The class a compiler error is about, and the missing name. */
function missing(line) {
	let m = line.match(/game\/(\w+)\.cs.*error CS0103: The name '(\w+)' does not exist/);
	if (m) return { cls: m[1], name: m[2] };
	m = line.match(/error CS(?:0117|1061): '(\w+)' does not contain a definition for '(\w+)'/);
	if (m) return { cls: m[1], name: m[2] };
	m = line.match(/error CS0426: The type name '(\w+)' does not exist in the type '(\w+)'/);
	if (m) return { cls: m[2], name: m[1] };
	return null;
}

for (let round = 1; ; round++) {
	{
		const config = JSON.parse(readFileSync(SOURCES, 'utf8'));
		if (useRealSmallTypes(config))
			writeFileSync(SOURCES, JSON.stringify(config, null, '\t') + '\n');
	}
	extract(src);
	writeAutoStubs(JSON.parse(readFileSync(SOURCES, 'utf8')));
	const errors = build();
	if (!errors.length) {
		console.log(`Oracle built (round ${round}).`);
		break;
	}
	const config = JSON.parse(readFileSync(SOURCES, 'utf8'));
	let added = 0;
	const left = new Set();
	const hand = handStubbed();
	const auto = (config.autostubs ??= {});
	const addAuto = (type, member) => {
		const list = (auto[type] ??= []);
		if (member && (list.includes(member) || hand.has(`${type}.${member.split(':')[0]}`))) return;
		if (member) list.push(member);
		added++;
	};
	for (const line of errors) {
		// A type nobody provides: a placeholder.
		let t = line.match(/error CS0246: The type or namespace name '(\w+)' could not be found/);
		if (t) {
			if (!auto[t[1]] && ![...hand].some((h) => h.startsWith(`${t[1]}.`))) addAuto(t[1]);
			continue;
		}
		// A member a placeholder doesn't have: a dynamic one.
		t = line.match(/error CS0426: The type name '(\w+)' does not exist in the type '([\w.]+)'/);
		if (t && auto[t[2]]) {
			// A nested type replaces a placeholder member of the same name.
			auto[t[2]] = auto[t[2]].filter((m) => m.split(':')[0] !== t[1]);
			if (!auto[`${t[2]}.${t[1]}`]) addAuto(`${t[2]}.${t[1]}`);
			continue;
		}
		t = line.match(/error CS(0117|1061): '([\w.]+)' does not contain a definition for '(\w+)'/);
		if (t && auto[t[2]] && !auto[`${t[2]}.${t[3]}`]) {
			addAuto(
				t[2],
				`${t[3]}:${t[1] === '0117' ? 'static' : ''}${calledAt(line, t[3]) ? 'method' : 'field'}`
			);
			continue;
		}
		// Set in an object initializer: an instance member, not a static one.
		t = line.match(
			/error CS1914: Static field or property '([\w.]+)\.(\w+)' cannot be assigned in an object initializer/
		);
		if (t && auto[t[1]]) {
			const list = auto[t[1]];
			const k = list.findIndex((m) => m.split(':')[0] === t[2]);
			if (k >= 0 && list[k].includes(':static')) {
				list[k] = list[k].replace(':static', ':');
				added++;
			}
			continue;
		}
		t = line.match(/error CS1729: '([\w.]+)' does not contain a constructor/);
		if (t && auto[t[1]]) {
			addAuto(t[1], 'ctor:ctor');
			continue;
		}
		const miss = missing(line);
		const own = miss && config.sources.find((s) => s.class === miss.cls && s.members);
		if (miss && !own && /^[A-Z]/.test(miss.name) && !calledAt(line, miss.name)) {
			if (!auto[miss.name]) addAuto(miss.name);
			continue;
		}
		if (!miss || !own) {
			left.add(line.replace(/^.*?error /, 'error ').replace(/ \[.*$/, ''));
			continue;
		}
		// The class's own source, then the classes it inherits from ("inherits": [...]).
		const chain = [
			own,
			...(own.inherits ?? []).map((c) => config.sources.find((s) => s.class === c))
		];
		if (
			chain.some((s) =>
				[
					...s.members,
					...(s.auto ?? []),
					...(s.stubbed ?? []),
					...(s.refuse ?? []),
					...(s.noop ?? [])
				].includes(miss.name)
			)
		)
			continue;
		let source = own;
		let found = [];
		for (const s of chain) {
			const lines = readFileSync(join(src, s.file), 'utf8').replace(/\r/g, '').split('\n');
			found = members(lines, miss.name);
			source = s;
			if (found.length) break;
		}
		const size = found.reduce((n, f) => n + f.split('\n').length, 0);
		// A capitalised name that isn't a member and isn't called: a class used statically
		// (SoundEngine.PlaySound, Lighting.AddLight, ...): a placeholder.
		if (!found.length && /^[A-Z]/.test(miss.name) && !calledAt(line, miss.name)) {
			if (!auto[miss.name]) addAuto(miss.name);
			continue;
		}
		if (!found.length || size > MAX_AUTO_LINES) {
			left.add(
				`${miss.cls}.${miss.name}${found.length ? ` (${size} lines: stub it or list it)` : ' (not in its source)'}`
			);
			continue;
		}
		(source.auto ??= []).push(miss.name);
		added++;
	}
	if (!added) {
		console.log(`Still missing after round ${round}:\n  ${[...left].sort().join('\n  ')}`);
		process.exit(1);
	}
	for (const s of config.sources) if (s.auto) s.auto.sort();
	writeFileSync(SOURCES, JSON.stringify(config, null, '\t') + '\n');
	console.log(`Round ${round}: added ${added} members.`);
}
