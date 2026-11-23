import data from '$lib/data/versions.json';
import type { Entry, GameConfig } from '$lib/engine/types';

/**
 * Versiondle: you're shown an accessory and guess the desktop version that added it; then a
 * bonus question asks for any version that changed it. Built by `npm run sync-wiki` from the
 * wiki's History data. Which version goes with which accessory is server-only:
 * see $lib/server/puzzles.ts.
 */
export interface Version extends Entry {
	/** Release date, YYYY-MM-DD. */
	date: string;
}

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/** "2022-09-28" -> "28 Sep 2022" */
export function releaseDate(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return y ? `${d} ${MONTHS[m - 1]} ${y}` : 'Unknown';
}

/** The first `n` parts of a version: "1.4.4.9", 2 -> "1.4". */
const prefix = (v: Version, n: number) => v.name.split('.').slice(0, n).join('.');

export const versionGame: GameConfig<Version> = {
	slug: 'version',
	title: 'Versiondle',
	noun: 'version',
	icon: '/ui/Power Menu Time.png',
	entries: data as Version[],
	firstColumn: 'Version',
	theme: () => 'White',
	allowLookalikes: true,
	clueLabel: 'Accessory',
	bonusLabel: 'When was it changed?',
	wikiPage: (v) => v.name,
	attributes: [
		{
			key: 'released',
			label: 'Released',
			kind: 'number',
			// Version ids sort like versions (see versionId in scripts/sync-wiki.mjs).
			value: (v) => v.id,
			display: (v) => releaseDate(v.date)
		}
	],
	hints: [
		{ label: 'Major', reveal: (v) => ({ text: `Starts with "${prefix(v, 2)}"` }) },
		{ label: 'Minor', reveal: (v) => ({ text: `Starts with "${prefix(v, 3)}"` }) },
		{ label: 'Release Date', reveal: (v) => ({ text: releaseDate(v.date) }) }
	]
};
