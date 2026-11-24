import data from '$lib/data/tooltips.json';
import type { Entry, GameConfig } from '$lib/engine/types';

/**
 * Tooltipdle: you're shown an item's tooltip and guess the item. Built by `npm run sync-wiki`
 * from every item with a tooltip (minus armor, paintings, treasure bags, banners). Only items
 * whose tooltip is unique can be the answer (`pool: false` otherwise). The tooltip text itself
 * is server-only: see $lib/server/tooltip-text.json.
 */
export type TooltipItem = Entry;

const lastLetter = (name: string) => [...name.replace(/[^\p{L}\p{N}]+$/u, '')].pop() ?? '';

export const tooltipGame: GameConfig<TooltipItem> = {
	slug: 'tooltip',
	title: 'Tooltipdle',
	noun: 'item',
	icon: '/ui/games/tooltip.png',
	entries: data as TooltipItem[],
	firstColumn: 'Item',
	theme: () => 'Blue',
	// No stat columns: every wrong guess is just red, so "lookalikes" are expected.
	allowLookalikes: true,
	clueLabel: "Today's tooltip",
	detailLabel: 'Its tooltip',
	attributes: [],
	hints: [
		{ label: 'First Letter', reveal: (i) => ({ text: `Starts with "${i.name[0]}"` }) },
		{ label: 'Silhouette', reveal: (i) => ({ image: i.image ?? '', effect: 'silhouette' }) },
		{ label: 'Last Letter', reveal: (i) => ({ text: `Ends with "${lastLetter(i.name)}"` }) }
	]
};
