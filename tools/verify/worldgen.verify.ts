/**
 * World generation ($lib/world/gen, converted from the game's code) against the game's own
 * passes: every tile, wall and liquid around the surface, for many seeds. VERIFY_SEEDS sets how
 * many (default 60). RECORD=1 saves fingerprints for the normal tests.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { oracle, oracleBuilt } from './lib/oracle';
import { verify } from './lib/verify';
import {
	fingerprint,
	runWorldGen,
	worldGenCase,
	type WorldGenCase,
	type WorldGenResult
} from './features/worldgen';

const SEEDS = Number(process.env.VERIFY_SEEDS ?? 60);

function* seeds(): Generator<WorldGenCase> {
	for (let n = 0; n < SEEDS; n++) yield worldGenCase(n * 7919 + 1);
}

it('the worlds have what the site uses: dirt, stone, clay, grass, trees, walls, caves', () => {
	const seen = new Set<string>();
	for (let n = 0; n < 5; n++) {
		const r = runWorldGen(worldGenCase(n * 7919 + 1));
		for (const t of r.type) seen.add(`type ${t}`);
		if (r.wall.some((w) => w > 0)) seen.add('walls');
		if (r.liquid.some((l) => l > 0)) seen.add('water');
	}
	for (const k of ['type -1', 'type 0', 'type 1', 'type 2', 'type 5', 'type 40', 'walls', 'water'])
		expect(seen, k).toContain(k);
});

describe.skipIf(!oracleBuilt)('world generation = the game’s passes', () => {
	it(`${SEEDS} seeds, every tile around the surface`, () => {
		const fingerprints: Record<number, string> = {};
		const n = verify({
			name: 'world generation',
			feature: 'worldgen',
			cases: seeds(),
			port: (c: WorldGenCase) => {
				const r = runWorldGen(c);
				fingerprints[c.seed] = fingerprint(r);
				return r;
			},
			batch: 20
		});
		expect(n).toBe(SEEDS);
		if (process.env.RECORD) {
			const sample = Object.fromEntries(Object.entries(fingerprints).slice(0, 4));
			writeFileSync(
				fileURLToPath(new URL('../../src/lib/world/fixtures/worldgen.json', import.meta.url)),
				JSON.stringify(sample)
			);
		}
	});

	it('the game agrees with the oracle’s own setup', () => {
		const [game] = oracle<WorldGenCase, WorldGenResult>('worldgen', [worldGenCase(1)]);
		expect(game.type.length).toBe(150 * 250);
	});
});
