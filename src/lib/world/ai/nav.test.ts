import { describe, expect, it } from 'vitest';
import { AIR, DIRT } from '../framing';
import { plan, recordedJumps, type NavMap, type Step } from './nav';

// (Searches here run without the time limit, which a busy machine running every test at once
// can hit.)

/** A map from rows of text: '#' dirt, '.' air; the left and right edges and below are solid. */
function map(rows: string[]): NavMap {
	const H = rows.length;
	const W = rows[0].length;
	const at = (i: number, j: number) =>
		i < 0 || i >= W || j >= H ? DIRT : j < 0 ? AIR : rows[j][i] === '#' ? DIRT : AIR;
	return {
		maxTilesX: W,
		maxTilesY: H + 40,
		solid: (i, j) => at(i, j) !== AIR,
		at,
		inView: (i, j) => i > 0 && i < W - 1 && j >= 0 && j < H
	};
}

const kinds = (steps: Step[] | null) => steps?.map((s) => s.kind);
const to = (i: number) => ({ i, done: (s: { i: number }) => s.i === i });

describe('getting about (ai/nav)', () => {
	it('records jumps from the real movement: a full jump rises nearly 6 blocks', () => {
		const full = recordedJumps().find((j) => j.hold === 15 && j.d === 1)!;
		expect(-Math.min(...full.dy)).toBeGreaterThan(5.5 * 16);
		expect(-Math.min(...full.dy)).toBeLessThan(6 * 16);
	});

	it('walks on the level and jumps a wall it can clear', () => {
		const m = map([
			'..............................',
			'..............................',
			'..............................',
			'..............................',
			'..............................',
			'..............................',
			'..............................',
			'..............................',
			'...............###............',
			'...............###............',
			'...............###............',
			'...............###............',
			'##############################'
		]);
		const t0 = performance.now();
		const steps = plan(m, { i: 3, j: 12 }, to(24), { blocks: 0, dig: false, ms: 1e4 });
		const ms = performance.now() - t0;
		expect(kinds(steps)).toContain('jump');
		expect(kinds(steps)).not.toContain('mine');
		expect(ms).toBeLessThan(200);
	});

	it('pillars up a wall too high to jump, if it has blocks; digs through if not', () => {
		const rows = [
			'..............................',
			'..............................',
			'..............................',
			'..............................',
			'..............................',
			'..............................',
			'.............#################',
			'.............#################',
			'.............#################',
			'.............#################',
			'.............#################',
			'.............#################',
			'.............#################',
			'.............#################',
			'##############################'
		];
		const m = map(rows);
		// The top of the cliff.
		const goal = { i: 20, done: (s: { i: number; j: number }) => s.i === 20 && s.j === 6 };
		expect(kinds(plan(m, { i: 3, j: 14 }, goal, { blocks: 10, dig: false, ms: 1e4 }))).toContain(
			'pillar'
		);
		const none = plan(m, { i: 3, j: 14 }, goal, { blocks: 0, ms: 1e4 });
		expect(kinds(none)).toContain('mine');
		expect(plan(m, { i: 3, j: 14 }, goal, { blocks: 0, dig: false, ms: 1e4 })).toBeNull();
	});

	it('bridges a deep chasm with blocks, and climbs down and out of it without', () => {
		const rows = Array.from({ length: 6 }, () => '..............................');
		for (let r = 0; r < 34; r++) rows.push('########.......#######.....########'.slice(0, 30));
		rows.push('##############################');
		const m = map(rows);
		const on = (s: { i: number; j: number }) => s.i === 27 && s.j === 6;
		const steps = plan(m, { i: 3, j: 6 }, { i: 27, done: on }, { blocks: 30, ms: 1e4 });
		expect(kinds(steps)).toContain('place');
		expect(kinds(steps)).not.toContain('mine');
		const without = plan(
			m,
			{ i: 3, j: 6 },
			{ i: 27, done: on },
			{ blocks: 0, limit: 20000, ms: 1e4 }
		);
		expect(kinds(without)).toContain('mine');
	});
});
