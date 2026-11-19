const WIKI_FILE = 'https://terraria.wiki.gg/wiki/Special:FilePath/';

/**
 * Entries store either a local path (`/bosses/Golem.png`) or `wiki:File name.png`.
 * Wiki images are a stopgap: `npm run fetch-images` downloads them into /static and rewrites
 * the data files so the site never hotlinks the wiki in production.
 */
export function imageUrl(image: string | undefined): string | undefined {
	if (!image) return undefined;
	if (image.startsWith('wiki:')) return WIKI_FILE + encodeURIComponent(image.slice(5));
	return encodeURI(image);
}
