import { describe, expect, it } from 'vitest';
import {
	froundItemFrames,
	runItemUse,
	type ItemFrame,
	type ItemUseCase
} from '../../../tools/verify/features/itemuse';
import itemuse from './fixtures/itemuse.json';

/**
 * Replays answers recorded from the game's own code (tools/verify, RECORD=1): a player using
 * the Copper Pickaxe or dirt and stone blocks, Player.ItemCheck frame by frame on random worlds,
 * keys and cursors. The full comparison is `npm run verify`.
 */
describe('item use, as the game does it', () => {
	it('swinging, mining and placing', () => {
		const recorded = itemuse as unknown as { case: ItemUseCase; game: ItemFrame[] }[];
		expect(recorded.length).toBeGreaterThan(2);
		for (const r of recorded) {
			const game = froundItemFrames(r.game);
			// (Recorded as JSON, which writes -0 as 0: compared the same way.)
			const json = (v: unknown) => JSON.parse(JSON.stringify(v));
			expect(json(runItemUse(r.case, game))).toEqual(json(game));
		}
	});
});
