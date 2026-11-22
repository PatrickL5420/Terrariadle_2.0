import { gameSlugs } from '$lib/games';
import type { EntryGenerator, PageLoad } from './$types';

// Pages are static HTML; all game state is fetched in the browser.
export const prerender = true;

export const entries: EntryGenerator = () => gameSlugs.map((mode) => ({ mode }));

export const load: PageLoad = ({ params }) => ({ slug: params.mode });
