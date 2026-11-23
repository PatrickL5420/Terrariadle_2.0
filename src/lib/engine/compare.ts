import type { Attribute, AttrValue, Checks, CompareResult, Entry } from './types';

function ordered(a: number, g: number): CompareResult {
	if (a === g) return 'match';
	return a > g ? 'higher' : 'lower';
}

function compareSets(guess: string[], answer: string[]): CompareResult {
	const g = new Set(guess);
	const a = new Set(answer);
	if (g.size === a.size && [...g].every((v) => a.has(v))) return 'match';
	return [...g].some((v) => a.has(v)) ? 'partial' : 'miss';
}

/** "Size +12" -> "Size" */
function statName(line: string): string {
	return line.replace(/\s*[+-]?\d+%?$/, '').trim();
}

function compareStats(guess: string[], answer: string[]): CompareResult {
	const exact = compareSets(guess, answer);
	if (exact !== 'miss') return exact;
	const names = new Set(answer.map(statName));
	return guess.some((l) => names.has(statName(l))) ? 'partial' : 'miss';
}

export function compareAttribute<E extends Entry>(
	attr: Attribute<E>,
	guess: E,
	answer: E
): CompareResult {
	const g: AttrValue = attr.value(guess);
	const a: AttrValue = attr.value(answer);

	switch (attr.kind) {
		case 'exact':
			return g === a ? 'match' : 'miss';
		case 'number':
			// A missing number (e.g. Mechdusa's "Mixed" defense) only matches another missing one,
			// and gets no arrow since it isn't on the scale.
			if (typeof a !== 'number' || typeof g !== 'number') return a === g ? 'match' : 'miss';
			return ordered(a, g);
		case 'ranked': {
			const order = attr.order ?? [];
			const ai = order.indexOf(a as string);
			const gi = order.indexOf(g as string);
			if (ai < 0 || gi < 0) throw new Error(`${attr.key}: value not in order list`);
			return ordered(ai, gi);
		}
		case 'set':
			return compareSets(g as string[], a as string[]);
		case 'stats':
			return compareStats(g as string[], a as string[]);
	}
}

/**
 * A guess against several right answers on a scale (Versiondle's bonus question): green if it's
 * one of them, an arrow if they're all on one side, yellow if there are some on both sides.
 */
export function compareToAny(guess: number, answers: number[]): CompareResult {
	if (answers.includes(guess)) return 'match';
	if (answers.every((a) => a > guess)) return 'higher';
	if (answers.every((a) => a < guess)) return 'lower';
	return 'partial';
}

/** A guess is right if it's the answer or in the answer's group. */
export const isCorrect = (guess: Entry, answer: Entry): boolean =>
	guess.id === answer.id || (guess.group !== undefined && guess.group === answer.group);

export function compareEntries<E extends Entry>(
	attributes: Attribute<E>[],
	guess: E,
	answer: E
): Checks {
	const checks: Checks = {};
	for (const attr of attributes) checks[attr.key] = compareAttribute(attr, guess, answer);
	return checks;
}

/** Stable string of every attribute value, used to detect entries players can't tell apart. */
export function fingerprint<E extends Entry>(attributes: Attribute<E>[], e: E): string {
	return JSON.stringify(
		attributes.map((a) => {
			const v = a.value(e);
			return Array.isArray(v) ? [...v].sort() : v;
		})
	);
}
