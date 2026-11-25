#!/usr/bin/env node
/**
 * Builds the oracle: extracts the game's code (extract.mjs), compiles it with the stubs, and
 * while the compiler can't find a name that the game's source declares as a field or a small
 * method of the same class, adds it to that source's `auto` list in oracle/sources.json and goes
 * again. What's left is printed: stub it in oracle/stubs/ (or list it in `members` if it's real
 * logic the feature needs).
 *
 * Usage: TERRARIA_SRC=/path/to/decompiled/src node tools/verify/build.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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

/** The class a compiler error is about, and the missing name. */
function missing(line) {
	let m = line.match(/game\/(\w+)\.cs.*error CS0103: The name '(\w+)' does not exist/);
	if (m) return { cls: m[1], name: m[2] };
	m = line.match(/error CS0117: '(\w+)' does not contain a definition for '(\w+)'/);
	if (m) return { cls: m[1], name: m[2] };
	return null;
}

for (let round = 1; ; round++) {
	extract(src);
	const errors = build();
	if (!errors.length) {
		console.log(`Oracle built (round ${round}).`);
		break;
	}
	const config = JSON.parse(readFileSync(SOURCES, 'utf8'));
	let added = 0;
	const left = new Set();
	for (const line of errors) {
		const miss = missing(line);
		const source = miss && config.sources.find((s) => s.class === miss.cls && s.members);
		if (!miss || !source) {
			left.add(line.replace(/^.*?error /, 'error ').replace(/ \[.*$/, ''));
			continue;
		}
		if ([...source.members, ...(source.auto ?? [])].includes(miss.name)) continue;
		const lines = readFileSync(join(src, source.file), 'utf8').replace(/\r/g, '').split('\n');
		const found = members(lines, miss.name);
		const size = found.reduce((n, f) => n + f.split('\n').length, 0);
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
