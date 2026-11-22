import { describe, expect, it } from 'vitest';
import data from '$lib/data/tooltips.json';
import text from '$lib/server/tooltip-text.json';
import { tooltipGame } from './tooltip';

const tips = text as Record<string, string>;

describe('Tooltipdle data', () => {
	it('every item has its tooltip on the server', () => {
		for (const item of data) expect(tips[String(item.id)], item.name).toBeTruthy();
	});

	it('keeps tooltip text out of the browser data', () => {
		const shipped = JSON.stringify(data);
		for (const item of data.slice(0, 200)) {
			expect(shipped.includes(tips[String(item.id)]), item.name).toBe(false);
		}
	});

	it('only uses unique tooltips as answers', () => {
		const counts = new Map<string, number>();
		for (const t of Object.values(tips)) counts.set(t, (counts.get(t) ?? 0) + 1);
		for (const item of tooltipGame.entries) {
			const unique = counts.get(tips[String(item.id)]) === 1;
			expect(item.pool !== false, item.name).toBe(unique);
		}
	});

	it('leaves out armor, paintings, treasure bags and banners', () => {
		const names = new Set(data.map((i) => i.name));
		for (const n of ['Wood Helmet', 'Treasure Bag (King Slime)', 'Zombie Banner', 'The Screamer']) {
			expect(names.has(n), n).toBe(false);
		}
		expect(names.has('Magic Mirror')).toBe(true);
	});
});
