#!/usr/bin/env node
/**
 * Converts the game's code to TypeScript (oracle/convert/Converter.cs, with Roslyn's types): the
 * roots a config names (port/*.json) and everything they use. Build the oracle first
 * (build.mjs). Usage: node tools/verify/port/convert.mjs port/worldgen.json
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const oracle = join(here, '../oracle');
const config = resolve(here, '..', process.argv[2] ?? 'port/worldgen.json');
const out = resolve(dirname(config), JSON.parse(readFileSync(config, 'utf8')).output);
execFileSync('dotnet', [join(oracle, 'bin/Release/net8.0/Oracle.dll'), 'convert', config, oracle], {
	stdio: 'inherit',
	cwd: dirname(config)
});
execFileSync('npx', ['prettier', '--write', out], { stdio: 'inherit' });
