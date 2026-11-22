import type { Attribute, CompareKind, Entry } from './types';

export interface ValueSummary {
	/** How the column is scored, in plain words. */
	rule: string;
	/** Every possible value, in a sensible order (empty for numbers). */
	values: string[];
	/** For number columns: the smallest and largest value, formatted as shown in tiles. */
	range?: [string, string];
	/** True when `values` is a low → high scale. */
	ordered: boolean;
}

const RULES: Record<CompareKind, string> = {
	exact: 'Green only on an exact match.',
	number: 'Arrows point toward the answer.',
	ranked: 'Ordered low → high. Arrows point toward the answer.',
	set: 'Yellow if at least one value is shared.',
	stats: 'Yellow if the same stat appears with a different amount.'
};

const shown = <E extends Entry>(attr: Attribute<E>, e: E) => {
	const v = attr.display ? attr.display(e) : attr.value(e);
	return (Array.isArray(v) ? v : [v]).map(String);
};

/** Everything a column can contain, read from the game data (so it never goes stale). */
export function summarizeValues<E extends Entry>(attr: Attribute<E>, entries: E[]): ValueSummary {
	const rule = RULES[attr.kind];

	if (attr.kind === 'number') {
		const sorted = [...entries].sort(
			(a, b) => (attr.value(a) as number) - (attr.value(b) as number)
		);
		if (!sorted.length) return { rule, values: [], ordered: true };
		const first = shown(attr, sorted[0]).join(', ');
		const last = shown(attr, sorted[sorted.length - 1]).join(', ');
		return { rule, values: [], range: [first, last], ordered: true };
	}

	if (attr.kind === 'ranked') {
		const used = new Set(entries.map((e) => String(attr.value(e))));
		return { rule, values: (attr.order ?? []).filter((v) => used.has(v)), ordered: true };
	}

	const seen = new Set<string>();
	for (const e of entries) {
		const v = attr.value(e);
		if (attr.kind === 'set') {
			// Compare on the raw values (e.g. "Melee", not the "All weapons" display label).
			for (const item of v as string[]) seen.add(item);
		} else if (attr.kind === 'stats') {
			// Just the stat names: the amounts are what players are guessing.
			const lines = v as string[];
			if (!lines.length) seen.add('None');
			for (const line of lines) seen.add(line.replace(/\s*[+-]?\d+%?$/, ''));
		} else {
			for (const item of shown(attr, e)) seen.add(item);
		}
	}
	const last = new Set(['None', 'Any', 'Other']);
	const values = [...seen].sort((a, b) => {
		if (last.has(a) !== last.has(b)) return last.has(a) ? 1 : -1;
		return a.localeCompare(b);
	});
	return { rule, values, ordered: false };
}
