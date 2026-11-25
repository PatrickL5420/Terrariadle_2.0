/**
 * The player port ($lib/world/player, with $lib/world/collision) against the game's own
 * Player.Update, frame by frame, on random worlds and keys. VERIFY_WALKS sets how many (default
 * 5,000); VERIFY_SEED their seed. RECORD=1 saves a sample for the normal tests.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { seeded } from './lib/compare';
import { oracleBuilt } from './lib/oracle';
import { verify } from './lib/verify';
import { froundFrames, randomMovement, runMovement, type MovementCase } from './features/movement';

const WALKS = Number(process.env.VERIFY_WALKS ?? 5_000);
const SEED = Number(process.env.VERIFY_SEED ?? 1);

function* walks(): Generator<MovementCase> {
	const rand = seeded(SEED);
	for (let n = 0; n < WALKS; n++) yield randomMovement(rand);
}

it('the random walks cover every kind of movement', () => {
	const rand = seeded(SEED);
	const seen: Record<string, number> = {};
	const count = (k: string) => (seen[k] = (seen[k] ?? 0) + 1);
	for (let n = 0; n < 300; n++) {
		const frames = runMovement(randomMovement(rand));
		frames.forEach((fr, k) => {
			const prev = frames[k - 1];
			if (!prev) return;
			if (fr.gfxOffY > prev.gfxOffY + 4) count('step up');
			if (fr.gfxOffY < prev.gfxOffY - 4) count('step down');
			if (prev.vy < 0 && prev.jump > 0 && fr.jump === 0 && fr.vy > prev.vy) count('ceiling');
			if (Math.abs(fr.vx) >= 3) count('full speed');
			if (fr.direction !== prev.direction) count('turn');
			if (prev.vy === 0 && fr.vy < 0) count('jump');
			if (prev.vy > 0 && fr.vy === 0) count('land');
			if (fr.vx === 0 && prev.vx !== 0 && fr.vy === 0) count('stop');
		});
	}
	for (const kind of [
		'step up',
		'step down',
		'ceiling',
		'full speed',
		'turn',
		'jump',
		'land',
		'stop'
	])
		expect(seen[kind] ?? 0, `${kind}: ${JSON.stringify(seen)}`).toBeGreaterThan(20);
});

describe.skipIf(!oracleBuilt)('player movement = Player.Update', () => {
	it(`${WALKS} random walks, every frame`, () => {
		const n = verify({
			name: 'movement',
			feature: 'movement',
			cases: walks(),
			port: runMovement,
			game: froundFrames,
			batch: 500,
			fixture: {
				file: fileURLToPath(new URL('../../src/lib/world/fixtures/movement.json', import.meta.url)),
				every: Math.ceil(WALKS / 8)
			}
		});
		expect(n).toBe(WALKS);
	});
});
