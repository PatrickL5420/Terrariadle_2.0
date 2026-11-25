/**
 * What the converted game code (./game.ts, generated) needs that isn't the game's: C#'s 2D
 * arrays and Math.Round, the world's tiles (Main.tile), and stand-ins for the progress bar,
 * settings, text and sounds of world generation, which only report.
 */
import type { Tile } from './game';

/** A C# 2D array, `T[,]`: a[i, j] is get(i, j). */
export class Array2D<T> {
	readonly #items: T[];

	constructor(
		readonly width: number,
		readonly height: number,
		fill: () => T
	) {
		this.#items = Array.from({ length: width * height }, fill);
	}

	get(i: number, j: number): T {
		if (i < 0 || j < 0 || i >= this.width || j >= this.height)
			throw new RangeError(`Index was outside the bounds of the array: [${i}, ${j}]`);
		return this.#items[i * this.height + j];
	}

	set(i: number, j: number, v: T) {
		if (i < 0 || j < 0 || i >= this.width || j >= this.height)
			throw new RangeError(`Index was outside the bounds of the array: [${i}, ${j}]`);
		this.#items[i * this.height + j] = v;
	}

	GetLength(d: number) {
		return d === 0 ? this.width : this.height;
	}
}

/** The world being generated (Main.tile). */
export const Rt = { tile: null as unknown as Array2D<Tile> };

/** A bool[] table copied from the game, as a string of 0s and 1s. */
export const $bools = (s: string): boolean[] => Array.from(s, (c) => c === '1');

/** C#'s non-short-circuit & and | on bools (both sides evaluated). */
export const $and = (a: boolean, b: boolean) => a && b;
export const $or = (a: boolean, b: boolean) => a || b;

/** IComparable.CompareTo on numbers. */
export const $compare = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);

/** Math.Round: to the nearest, halves to even (MidpointRounding.ToEven). */
export function $round(x: number, digits?: number): number {
	if (digits) {
		const k = 10 ** digits;
		return $round(x * k) / k;
	}
	const r = Math.round(x);
	return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** Code the oracle only stubs (Stub.Hit) or a placeholder: a case mustn't get there. */
export const $hit = (what: string): never => {
	throw new Error(`game code not ported was reached: ${what}`);
};
export const $hole = (what: string): never => {
	throw new Error(`game code not ported was reached: ${what}`);
};
/** An exception the game's code catches (and the oracle refuses the case on). */
export const $caught = (e: unknown): never => {
	throw e;
};

/** Sounds while generating: none. */
export const $sound = (..._args: unknown[]) => null;

/** Lang.gen: the progress messages. */
export const $text = Array.from({ length: 100 }, () => ({ Value: '' }));

/** GenerationProgress: the progress bar. */
export class Progress {
	Message = '';
	Set(..._args: number[]) {}
}

/** GameConfiguration: the world generation settings the passes read (the game's values). */
export class GameConfiguration {
	readonly #values: Record<string, unknown> = { FlatBeachPadding: 5 };
	Get(entry: string) {
		return this.#values[entry] as number;
	}
}
