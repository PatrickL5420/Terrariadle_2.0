import { describe, expect, it } from 'vitest';
import { compareAttribute } from './compare';
import { dayNumber, pickDaily, secondsUntilReset } from './daily';
import type { Attribute, Entry } from './types';

type T = Entry & { n: number; r: string; s: string[]; x: string[] };
const e = (n: number, r: string, s: string[], x: string[] = []): T => ({
	id: n,
	name: '',
	n,
	r,
	s,
	x
});

const num: Attribute<T> = { key: 'n', label: '', title: '', kind: 'number', value: (v) => v.n };
const ranked: Attribute<T> = {
	key: 'r',
	label: '',
	title: '',
	kind: 'ranked',
	order: ['low', 'mid', 'high'],
	value: (v) => v.r
};
const set: Attribute<T> = { key: 's', label: '', title: '', kind: 'set', value: (v) => v.s };
const stats: Attribute<T> = { key: 'x', label: '', title: '', kind: 'stats', value: (v) => v.x };

describe('compareAttribute', () => {
	it('arrows point toward the answer', () => {
		expect(compareAttribute(num, e(5, 'low', []), e(9, 'low', []))).toBe('higher');
		expect(compareAttribute(num, e(9, 'low', []), e(5, 'low', []))).toBe('lower');
		expect(compareAttribute(num, e(5, 'low', []), e(5, 'low', []))).toBe('match');
		expect(compareAttribute(ranked, e(0, 'low', []), e(0, 'high', []))).toBe('higher');
	});

	it('sets: identical, overlapping, disjoint', () => {
		expect(compareAttribute(set, e(0, 'low', ['a', 'b']), e(0, 'low', ['b', 'a']))).toBe('match');
		expect(compareAttribute(set, e(0, 'low', ['a', 'b']), e(0, 'low', ['b']))).toBe('partial');
		expect(compareAttribute(set, e(0, 'low', ['a']), e(0, 'low', ['b']))).toBe('miss');
	});

	it('stats: same stat with a different amount is partial', () => {
		const g = e(0, 'low', [], ['Size +12']);
		expect(compareAttribute(stats, g, e(0, 'low', [], ['Size +12']))).toBe('match');
		expect(compareAttribute(stats, g, e(0, 'low', [], ['Size -18']))).toBe('partial');
		expect(compareAttribute(stats, g, e(0, 'low', [], ['Velocity +10']))).toBe('miss');
		expect(compareAttribute(stats, e(0, 'low', [], []), e(0, 'low', [], []))).toBe('match');
	});
});

describe('pickDaily', () => {
	const ids = Array.from({ length: 25 }, (_, i) => i + 1);

	it('is deterministic and secret-dependent', () => {
		expect(pickDaily(ids, 's1', 20000)).toBe(pickDaily(ids, 's1', 20000));
		const a = Array.from({ length: 50 }, (_, d) => pickDaily(ids, 's1', d));
		const b = Array.from({ length: 50 }, (_, d) => pickDaily(ids, 's2', d));
		expect(a).not.toEqual(b);
	});

	it('uses every entry once per cycle and never repeats two days in a row', () => {
		const start = 20000 - (20000 % ids.length);
		const cycle = Array.from({ length: ids.length }, (_, d) => pickDaily(ids, 'x', start + d));
		expect(new Set(cycle).size).toBe(ids.length);

		for (let d = 19000; d < 21000; d++) {
			expect(pickDaily(ids, 'x', d)).not.toBe(pickDaily(ids, 'x', d + 1));
		}
	});
});

describe('daily clock', () => {
	it('rolls over at midnight in the reset time zone', () => {
		const before = new Date('2026-03-01T04:59:59Z'); // 23:59:59 in New York (EST)
		const after = new Date('2026-03-01T05:00:00Z');
		expect(dayNumber(after) - dayNumber(before)).toBe(1);
		expect(secondsUntilReset(before)).toBe(1);
		expect(secondsUntilReset(after)).toBe(86400);
	});
});
