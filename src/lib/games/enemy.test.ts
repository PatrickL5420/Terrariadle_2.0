import { describe, expect, it } from 'vitest';
import { enemyGame } from './enemy';

const names = new Set(enemyGame.entries.map((e) => e.name));
const byName = (name: string) => enemyGame.entries.find((e) => e.name === name)!;

describe('Enemydle data', () => {
	it('leaves out bosses, event bosses, boss servants and unspawnable enemies', () => {
		for (const n of [
			'Eye of Cthulhu',
			'Lunatic Cultist',
			'Pumpking',
			'Flying Dutchman',
			'Servant of Cthulhu',
			'Probe',
			'White Cultist Archer'
		])
			expect(names.has(n), n).toBe(false);
	});

	it('includes event and special seed-exclusive enemies', () => {
		for (const n of ['Blood Zombie', 'Goblin Archer', 'Golden Slime', 'Jungle Mimic'])
			expect(names.has(n), n).toBe(true);
	});

	it('marks enemies of Hardmode-only events as Hardmode', () => {
		expect(byName('Frankenstein').hardmode).toBe(true);
		expect(byName('Sand Shark').hardmode).toBe(true);
		expect(byName('Blood Zombie').hardmode).toBe(false);
		expect(byName('Goblin Archer').hardmode).toBe(false);
	});

	it('uses the main variant: worm heads, not segments or variants', () => {
		expect(byName('Milkyway Weaver').hp).toBeGreaterThan(0);
		expect(byName('Zombie').image).not.toMatch(/Female/);
		expect(byName('Skeleton').image).not.toMatch(/Headache/);
	});

	it('flags Lifeform Analyzer rares', () => {
		expect(byName('Mimic').rare).toBe(true);
		expect(byName('Zombie').rare).toBe(false);
	});
});
