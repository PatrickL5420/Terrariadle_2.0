import type { Entry, GameConfig } from '$lib/engine/types';

const WIKI = 'https://terraria.wiki.gg/wiki/';

/**
 * Link to an entry's page on the official wiki. Games can point somewhere other than the
 * entry's name (e.g. modifiers link to their section of the Modifiers page); item pages
 * that are really part of a set (armor pieces) redirect there on the wiki's side.
 */
export function wikiUrl(game: GameConfig<Entry>, entry: Entry): string {
	const [page, section] = (game.wikiPage?.(entry) ?? entry.name).split('#');
	const encode = (s: string) => encodeURIComponent(s.replace(/ /g, '_'));
	return WIKI + encode(page) + (section ? `#${encode(section)}` : '');
}
