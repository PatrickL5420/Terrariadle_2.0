/** Comparing a port's results with the game's, and describing where they differ. */

export interface Mismatch<C> {
	index: number;
	case: C;
	diff: string;
}

/**
 * Deep-compares results; returns a description of the first difference (a path and both
 * values), or null when equal.
 */
export function diff(port: unknown, game: unknown, path = ''): string | null {
	if (Object.is(port, game)) return null;
	if (typeof port !== typeof game || port === null || game === null || typeof port !== 'object')
		return `${path || 'value'}: port ${JSON.stringify(port)}, game ${JSON.stringify(game)}`;
	const a = port as Record<string, unknown>;
	const b = game as Record<string, unknown>;
	for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
		const d = diff(a[key], b[key], path ? `${path}.${key}` : key);
		if (d) return d;
	}
	return null;
}

/** Every case where the port's result isn't the game's. */
export function mismatches<C, R>(cases: C[], port: R[], game: R[]): Mismatch<C>[] {
	const out: Mismatch<C>[] = [];
	cases.forEach((c, index) => {
		const d = diff(port[index], game[index]);
		if (d) out.push({ index, case: c, diff: d });
	});
	return out;
}

/** A short report of the first few mismatches, for a failing test. */
export function report<C>(name: string, total: number, bad: Mismatch<C>[], show = 3): string {
	if (!bad.length) return '';
	const lines = [`${name}: ${bad.length} of ${total} cases differ from the game. First:`];
	for (const m of bad.slice(0, show))
		lines.push(`  #${m.index}: ${m.diff}\n    ${JSON.stringify(m.case)}`);
	return lines.join('\n');
}

/** A small seeded random (mulberry32), so a failing case can be found again. */
export function seeded(seed: number) {
	let a = seed >>> 0;
	const next = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return (n: number) => Math.floor(next() * n);
}
