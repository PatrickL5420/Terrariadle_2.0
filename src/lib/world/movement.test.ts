import { describe, expect, it } from 'vitest';
import {
	froundAll,
	runCollision,
	type CollisionCase,
	type CollisionResult
} from '../../../tools/verify/features/collision';
import {
	froundFrames,
	runMovement,
	type Frame,
	type MovementCase
} from '../../../tools/verify/features/movement';
import collision from './fixtures/collision.json';
import movement from './fixtures/movement.json';

/**
 * Replays answers recorded from the game's own code (tools/verify, RECORD=1): Collision's
 * TileCollision / StepUp / StepDown on random bodies, and a plain player's Player.Update frame
 * by frame on random walks. The full comparison is `npm run verify`.
 */
describe('collision and movement, as the game does them', () => {
	it('collision', () => {
		const recorded = collision as { case: CollisionCase; game: CollisionResult }[];
		expect(recorded.length).toBeGreaterThan(30);
		for (const r of recorded) expect(runCollision(r.case)).toEqual(froundAll(r.game));
	});

	it('movement', () => {
		const recorded = movement as unknown as { case: MovementCase; game: Frame[] }[];
		expect(recorded.length).toBeGreaterThan(5);
		for (const r of recorded) expect(runMovement(r.case)).toEqual(froundFrames(r.game));
	});
});
