import type { RarityName } from '$lib/rarity';

/**
 * How an attribute is compared against today's answer.
 *  - exact:  green if equal, red otherwise
 *  - number: green if equal, otherwise an arrow saying whether the answer is higher or lower
 *  - ranked: like number, but the values are labels on a fixed scale (`order`)
 *  - set:    green if the lists are identical, yellow if they overlap, red otherwise
 *  - stats:  list of "Stat +N" lines; green if identical, yellow if a stat is shared
 *            (even with a different value), red otherwise
 */
export type CompareKind = 'exact' | 'number' | 'ranked' | 'set' | 'stats';

/** `higher` / `lower` describe the answer relative to the guess. */
export type CompareResult = 'match' | 'miss' | 'partial' | 'higher' | 'lower';

export type AttrValue = string | number | boolean | string[] | null;

export interface Entry {
	id: number;
	name: string;
	/** Either a path under /static (e.g. `/bosses/Golem.png`) or `wiki:File name.png`. */
	image?: string;
	/** Defaults to true. Entries with `pool: false` can be guessed but are never the answer. */
	pool?: boolean;
}

export interface Attribute<E extends Entry = Entry> {
	key: string;
	label: string;
	kind: CompareKind;
	value: (e: E) => AttrValue;
	/** Scale for `ranked` attributes, lowest first. */
	order?: readonly string[];
	/** What to show in the tile. Defaults to the value. */
	display?: (e: E) => string | string[];
	/** Optional text colour for the tile. */
	color?: (e: E) => string | undefined;
	/** Optional text colour for a value in the column's hover list (e.g. rarity names). */
	valueColor?: (value: string) => string | undefined;
}

export type Hint = { text: string } | { image: string; effect: 'silhouette' | 'blur' };

export interface HintDef<E extends Entry = Entry> {
	/** Button label before the hint is revealed. */
	label: string;
	reveal: (e: E) => Hint;
}

export interface GameConfig<E extends Entry = Entry> {
	slug: string;
	title: string;
	/** Singular noun, e.g. "boss". */
	noun: string;
	/** Header / landing page icon. */
	icon: string;
	entries: E[];
	attributes: Attribute<E>[];
	hints: [HintDef<E>, HintDef<E>, HintDef<E>];
	/** Rarity-style theme used for the winning card and yesterday's answer. */
	theme: (e: E) => RarityName;
	/** Column header for the first (image/name) column. */
	firstColumn: string;
	/**
	 * Allow entries with identical values in every column. A wrong guess can then show an
	 * all-green row, so the item's own tile is coloured to show whether the guess was right.
	 */
	allowLookalikes?: boolean;
	/**
	 * Clue-style games (Tooltipdle): the server sends today's answer's text as a clue shown above
	 * the search box, and each guess's own text in an extra column. The text stays server-side
	 * (see $lib/server/text.ts) so it can't be looked up in the page's data.
	 */
	clueLabel?: string;
	/** Wiki page for an entry, e.g. "Modifiers#Legendary". Defaults to the entry's name. */
	wikiPage?: (e: E) => string;
	detailLabel?: string;
}

export type Checks = Record<string, CompareResult>;

export interface GuessRecord {
	id: number;
	checks: Checks;
	/** Clue-style games: the guessed item's own text (e.g. its tooltip). */
	detail?: string;
}

/** Guess counts at which hints 1, 2 and 3 unlock. */
export const HINT_UNLOCKS = [4, 7, 12] as const;
