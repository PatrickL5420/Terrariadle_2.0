import { describe, expect, it } from 'vitest';
import {
	runFraming,
	type FramingCase,
	type FramingResult
} from '../../../tools/verify/features/framing';
import neighbourhoods from './fixtures/framing-neighbourhoods.json';
import worlds from './fixtures/framing-worlds.json';

/**
 * Replays answers recorded from the game's own WorldGen.TileFrame (tools/verify, RECORD=1):
 * a sample of every 3x3 neighbourhood, and random worlds framed and then edited. The full
 * comparison (all 589,824 neighbourhoods, thousands of worlds) is `npm run verify`.
 */
type Recorded = { case: FramingCase; game: FramingResult }[];

describe('tile framing, as the game frames', () => {
	it.each([
		['neighbourhoods', neighbourhoods as Recorded],
		['worlds', worlds as Recorded]
	])('%s', (_, recorded) => {
		expect(recorded.length).toBeGreaterThan(10);
		for (const r of recorded) expect(runFraming(r.case)).toEqual(r.game);
	});
});
