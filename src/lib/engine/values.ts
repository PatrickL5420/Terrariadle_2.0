import type { Attribute, Entry, GuessRecord } from './types';

export interface ValueSummary {
	/** Every possible value, in a sensible order (empty for numbers). */
	values: string[];
	/** For number columns: the smallest and largest value, formatted as shown in tiles. */
	range?: [string, string];
	/** True when `values` is a low → high scale. */
	ordered: boolean;
}

const shown = <E extends Entry>(attr: Attribute<E>, e: E) => {
	const v = attr.display ? attr.display(e) : attr.value(e);
	return (Array.isArray(v) ? v : [v]).map(String);
};

/**
 * The labels an entry contributes to a column's value list. Sets use raw values (e.g. "Melee",
 * not the "All weapons" display label); stats use just the stat names, since the amounts are
 * what players are guessing.
 */
function valueKeys<E extends Entry>(attr: Attribute<E>, e: E): string[] {
	const v = attr.value(e);
	if (attr.kind === 'ranked') return [String(v)];
	if (attr.kind === 'set') return v as string[];
	if (attr.kind === 'stats') {
		const lines = v as string[];
		return lines.length ? lines.map((l) => l.replace(/\s*[+-]?\d+%?$/, '')) : ['None'];
	}
	return shown(attr, e);
}

function numberRange<E extends Entry>(
	attr: Attribute<E>,
	entries: E[]
): [string, string] | undefined {
	// Entries without a number (e.g. Mechdusa's "Mixed" defense) aren't on the scale.
	const numeric = entries.filter((e) => typeof attr.value(e) === 'number');
	if (!numeric.length) return undefined;
	const sorted = numeric.sort((a, b) => (attr.value(a) as number) - (attr.value(b) as number));
	return [shown(attr, sorted[0]).join(', '), shown(attr, sorted[sorted.length - 1]).join(', ')];
}

/** Everything a column can contain, read from the game data (so it never goes stale). */
export function summarizeValues<E extends Entry>(attr: Attribute<E>, entries: E[]): ValueSummary {
	if (attr.kind === 'number') {
		return { values: [], range: numberRange(attr, entries), ordered: true };
	}

	if (attr.kind === 'ranked') {
		const used = new Set(entries.map((e) => String(attr.value(e))));
		return { values: (attr.order ?? []).filter((v) => used.has(v)), ordered: true };
	}

	const seen = new Set<string>();
	for (const e of entries) for (const key of valueKeys(attr, e)) seen.add(key);
	const last = new Set(['None', 'Any', 'Other']);
	const values = [...seen].sort((a, b) => {
		if (last.has(a) !== last.has(b)) return last.has(a) ? 1 : -1;
		return a.localeCompare(b);
	});
	return { values, ordered: false };
}

export interface ValueKnowledge {
	/** Values a tile has directly ruled out: cross these out. */
	ruledOut: Set<string>;
	/** Values a green tile has confirmed. */
	confirmed: Set<string>;
	/** Number columns: what the arrows say, e.g. "More than 2,000; less than 50,000". */
	bounds?: string;
}

export interface SeenGuess<E extends Entry> {
	entry: E;
	checks: GuessRecord['checks'];
}

/**
 * What the tiles in one column have directly told the player. Each guess is read on its own
 * (red rules its values out, green confirms, arrows cut the scale, yellow says nothing
 * definite); combining guesses into deductions is left to the player.
 */
export function valueKnowledge<E extends Entry>(
	attr: Attribute<E>,
	summary: ValueSummary,
	guesses: SeenGuess<E>[]
): ValueKnowledge {
	const ruledOut = new Set<string>();
	const confirmed = new Set<string>();

	if (attr.kind === 'number') {
		let above: E | undefined; // answer is higher than this guess
		let below: E | undefined; // answer is lower than this guess
		let exact: E | undefined;
		const n = (e: E) => attr.value(e) as number;
		for (const { entry, checks } of guesses) {
			const r = checks[attr.key];
			if (r === 'match') exact = entry;
			if (r === 'higher' && (!above || n(entry) > n(above))) above = entry;
			if (r === 'lower' && (!below || n(entry) < n(below))) below = entry;
		}
		const label = (e: E) => shown(attr, e).join(', ');
		const parts = exact
			? [`Exactly ${label(exact)}`]
			: [above && `More than ${label(above)}`, below && `Less than ${label(below)}`].filter(
					Boolean
				);
		return { ruledOut, confirmed, bounds: parts.length ? parts.join('; ') : undefined };
	}

	for (const { entry, checks } of guesses) {
		const r = checks[attr.key];
		const keys = valueKeys(attr, entry);
		if (r === 'match') {
			for (const v of summary.values) if (!keys.includes(v)) ruledOut.add(v);
			for (const k of keys) confirmed.add(k);
		} else if (r === 'miss') {
			for (const k of keys) ruledOut.add(k);
		} else if (attr.kind === 'ranked' && (r === 'higher' || r === 'lower')) {
			const at = summary.values.indexOf(keys[0]);
			summary.values.forEach((v, i) => {
				if (r === 'higher' ? i <= at : i >= at) ruledOut.add(v);
			});
		}
		// 'partial': at least one value is shared, but not which, so nothing is crossed out.
	}
	for (const v of confirmed) ruledOut.delete(v);
	return { ruledOut, confirmed };
}
