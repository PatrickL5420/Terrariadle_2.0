/**
 * The comparison loop every feature uses: stream cases to the oracle and the port a batch at a
 * time (so millions of cases fit in memory), fail on the first batch that differs, and keep a
 * sample of the game's answers for a fixture.
 */
import { writeFileSync } from 'node:fs';
import { expect } from 'vitest';
import { mismatches, report } from './compare';
import { oracle } from './oracle';

export interface Run<C, R> {
	/** A name for reports. */
	name: string;
	/** The oracle feature. */
	feature: string;
	cases: Iterable<C>;
	/** Runs a case on the port. */
	port: (c: C) => R;
	batch?: number;
	/** With RECORD=1: where to save a sample of the game's answers, and how sparse a sample. */
	fixture?: { file: string; every: number };
}

/** Compares the port with the game on every case; returns how many were compared. */
export function verify<C, R>(run: Run<C, R>): number {
	const size = run.batch ?? 20_000;
	const sample: { case: C; game: R }[] = [];
	let chunk: C[] = [];
	let total = 0;
	const flush = () => {
		if (!chunk.length) return;
		const game = oracle<C, R>(run.feature, chunk);
		const bad = mismatches(chunk, chunk.map(run.port), game);
		bad.forEach((m) => (m.index += total));
		expect(bad.length, report(run.name, total + chunk.length, bad)).toBe(0);
		if (run.fixture)
			chunk.forEach((c, k) => {
				if ((total + k) % run.fixture!.every === 0) sample.push({ case: c, game: game[k] });
			});
		total += chunk.length;
		chunk = [];
	};
	for (const c of run.cases) {
		chunk.push(c);
		if (chunk.length >= size) flush();
	}
	flush();
	if (run.fixture && process.env.RECORD) writeFileSync(run.fixture.file, JSON.stringify(sample));
	return total;
}
