import { describe, expect, it } from 'vitest';
import { compareEntries, fingerprint } from '$lib/engine/compare';
import { games } from '.';

/** Allowed values for list/exact attributes, so typos in the data files fail the build. */
const vocab: Record<string, Record<string, string[]>> = {
	boss: {
		category: ['Pre-Hardmode', 'Hardmode', 'Event', 'Special seed'],
		summon: ['Item', 'Break object', 'Event', 'Kill mob', 'Other'],
		body: ['Worm', 'Flying', 'Ground', 'Multi-part', 'Humanoid', 'Stationary'],
		time: ['Day', 'Night', 'Any']
	},
	accessory: {
		functions: [
			'Wings',
			'Movement',
			'Combat',
			'Yoyo',
			'Health & Mana',
			'Immunity',
			'Fishing',
			'Building',
			'Utility'
		],
		classes: ['Melee', 'Ranged', 'Magic', 'Summon', 'All', 'None'],
		sources: [
			'Crafted',
			'Enemy drop',
			'Boss/Treasure bag',
			'Chest',
			'NPC shop',
			'Fishing/Crate',
			'Gathered',
			'Shimmer'
		]
	},
	armor: {
		slot: ['Head', 'Chest', 'Legs'],
		category: ['Pre-Hardmode', 'Hardmode', 'Other'],
		obtained: ['Craftable', 'Drop', 'Loot', 'Bag loot', 'Vendor', 'Fished', 'Quest reward']
	},
	modifier: {
		category: ['Universal', 'Common', 'Melee', 'Ranged', 'Magic', 'Summon', 'Accessory']
	}
};

describe.each(games.map((g) => [g.slug, g] as const))('%s data', (slug, game) => {
	it('has unique ids and names', () => {
		const ids = game.entries.map((e) => e.id);
		const names = game.entries.map((e) => e.name);
		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(names).size).toBe(names.length);
	});

	it('only uses known values', () => {
		for (const attr of game.attributes) {
			const allowed = vocab[slug]?.[attr.key];
			for (const entry of game.entries) {
				const v = attr.value(entry);
				if (attr.kind === 'ranked') expect(attr.order, entry.name).toContain(v);
				if (attr.kind === 'number') expect(v === null || Number.isFinite(v), entry.name).toBe(true);
				if (allowed) {
					for (const item of Array.isArray(v) ? v : [v])
						expect(allowed, entry.name).toContain(item);
				}
			}
		}
	});

	it.skipIf(game.allowLookalikes)('every entry can be told apart from every other', () => {
		const seen = new Map<string, string>();
		for (const entry of game.entries) {
			const fp = fingerprint(game.attributes, entry);
			expect(seen.get(fp), `${entry.name} looks identical to ${seen.get(fp)}`).toBeUndefined();
			seen.set(fp, entry.name);
		}
	});

	it('an entry compared with itself is all green', () => {
		for (const entry of game.entries) {
			const checks = compareEntries(game.attributes, entry, entry);
			expect(Object.values(checks).every((c) => c === 'match')).toBe(true);
		}
	});

	it('every hint resolves for every entry', () => {
		for (const entry of game.entries) {
			for (const hint of game.hints) {
				const h = hint.reveal(entry);
				expect('text' in h ? h.text : h.image, `${entry.name}: ${hint.label}`).toBeTruthy();
			}
		}
	});
});
