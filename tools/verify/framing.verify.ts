/**
 * The tile framing port ($lib/world/framing) against the game's WorldGen.TileFrame.
 * VERIFY_WORLDS sets how many random worlds (default 20,000); VERIFY_SEED their seed.
 * RECORD=1 also writes a sample of the game's answers to src/lib/world/fixtures/, which the
 * normal tests replay without the oracle.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { seeded } from './lib/compare';
import { oracleBuilt } from './lib/oracle';
import { verify } from './lib/verify';
import { everyNeighbourhood, randomWorld, runFraming, type FramingCase } from './features/framing';

const WORLDS = Number(process.env.VERIFY_WORLDS ?? 20_000);
const SEED = Number(process.env.VERIFY_SEED ?? 1);
const fixture = (name: string) =>
	fileURLToPath(new URL(`../../src/lib/world/fixtures/${name}.json`, import.meta.url));

function* randomWorlds(): Generator<FramingCase> {
	const rand = seeded(SEED);
	for (let n = 0; n < WORLDS; n++) yield randomWorld(rand, 1 + rand(40));
}

describe.skipIf(!oracleBuilt)('tile framing = WorldGen.TileFrame', () => {
	it('every 3x3 neighbourhood', () => {
		const n = verify({
			name: 'neighbourhoods',
			feature: 'framing',
			cases: everyNeighbourhood(),
			port: runFraming,
			batch: 50_000,
			fixture: { file: fixture('framing-neighbourhoods'), every: 1999 }
		});
		expect(n).toBe(3 * 4 ** 8 * 3);
	});

	it(`${WORLDS} random worlds, framed and edited`, () => {
		const n = verify({
			name: 'worlds',
			feature: 'framing',
			cases: randomWorlds(),
			port: runFraming,
			batch: 2_000,
			fixture: { file: fixture('framing-worlds'), every: Math.ceil(WORLDS / 15) }
		});
		expect(n).toBe(WORLDS);
	});
});
