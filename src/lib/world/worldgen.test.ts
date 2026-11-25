import { describe, expect, it } from 'vitest';
import { fingerprint, runWorldGen, worldGenCase } from '../../../tools/verify/features/worldgen';
import worldgen from './fixtures/worldgen.json';

/**
 * Replays fingerprints of worlds the game's own passes generated (tools/verify, RECORD=1): the
 * converted generation must make the same worlds. The full comparison is `npm run verify`.
 */
describe('world generation, as the game does it', () => {
	it('makes the same worlds from the same seeds', () => {
		const recorded = Object.entries(worldgen as Record<string, string>);
		expect(recorded.length).toBeGreaterThan(2);
		for (const [seed, print] of recorded)
			expect(fingerprint(runWorldGen(worldGenCase(+seed)))).toBe(print);
	});
});
