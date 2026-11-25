/**
 * The collision port ($lib/world/collision) against the game's Collision.TileCollision,
 * StepUp and StepDown, on random worlds and bodies. VERIFY_CASES sets how many (default
 * 200,000); VERIFY_SEED their seed. RECORD=1 saves a sample for the normal tests.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { seeded } from './lib/compare';
import { oracleBuilt } from './lib/oracle';
import { verify } from './lib/verify';
import { froundAll, randomCollision, runCollision, type CollisionCase } from './features/collision';

const CASES = Number(process.env.VERIFY_CASES ?? 200_000);
const SEED = Number(process.env.VERIFY_SEED ?? 1);

function* cases(): Generator<CollisionCase> {
	const rand = seeded(SEED);
	for (let n = 0; n < CASES; n++) yield randomCollision(rand);
}

/** What a case ended up doing on the port, so the cases can be checked to cover everything. */
function outcome(c: CollisionCase): string {
	const r = runCollision(c) as Record<string, number | boolean>;
	if (c.op !== 'tile') return `${c.op}${r.y !== c.y ? ' moved' : ''}`;
	return [
		r.vx !== c.vx && 'wall',
		r.vy !== c.vy && r.down && 'landed',
		r.up && 'ceiling',
		r.vx === c.vx && r.vy === c.vy && 'free'
	]
		.filter(Boolean)
		.join('+');
}

it('the random cases cover every outcome', () => {
	const rand = seeded(SEED);
	const seen: Record<string, number> = {};
	for (let n = 0; n < 20_000; n++) {
		const o = outcome(randomCollision(rand));
		for (const part of o.split('+')) seen[part] = (seen[part] ?? 0) + 1;
	}
	for (const kind of ['free', 'wall', 'landed', 'ceiling', 'stepUp moved', 'stepDown moved'])
		expect(seen[kind] ?? 0, `${kind}: ${JSON.stringify(seen)}`).toBeGreaterThan(50);
});

describe.skipIf(!oracleBuilt)('collision = Collision.TileCollision / StepUp / StepDown', () => {
	it(`${CASES} random bodies`, () => {
		const n = verify({
			name: 'collision',
			feature: 'collision',
			cases: cases(),
			port: runCollision,
			game: froundAll,
			batch: 10_000,
			fixture: {
				file: fileURLToPath(
					new URL('../../src/lib/world/fixtures/collision.json', import.meta.url)
				),
				every: Math.ceil(CASES / 40)
			}
		});
		expect(n).toBe(CASES);
	});
});
