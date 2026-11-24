import { describe, expect, it } from 'vitest';
import { compareToAny } from '$lib/engine/compare';
import { puzzlesFor } from '$lib/server/puzzles';
import { releaseDate, versionGame } from './version';

const puzzles = puzzlesFor('version')!;
const ids = new Set(versionGame.entries.map((v) => v.id));
const byName = (name: string) => versionGame.entries.find((v) => v.name === name)!;
const puzzle = (name: string) => puzzles.find((p) => p.name === name)!;

describe('Versiondle data', () => {
	it('has a version for every puzzle and every bonus answer', () => {
		expect(puzzles.length).toBeGreaterThan(300);
		for (const p of puzzles) {
			expect(ids.has(p.answer), p.name).toBe(true);
			for (const id of p.bonus) expect(ids.has(id), p.name).toBe(true);
			// Changes come after the accessory was added.
			for (const id of p.bonus) expect(id, p.name).toBeGreaterThan(p.answer);
		}
	});

	it('sorts versions by id, and every version has a release date', () => {
		const sorted = [...versionGame.entries].sort((a, b) => a.id - b.id).map((v) => v.date);
		expect(sorted).toEqual([...sorted].sort());
		for (const v of versionGame.entries) expect(releaseDate(v.date), v.name).not.toBe('Unknown');
	});

	it('knows when accessories were added, including ones on shared pages', () => {
		expect(puzzle('Cloud in a Bottle').answer).toBe(byName('1.0').id);
		expect(puzzle('Spooky Wings').answer).toBe(byName('1.2.1').id);
		expect(puzzle('Tin Watch').answer).toBe(byName('1.2').id);
		expect(puzzle('Fairy Wings').bonus).not.toContain(byName('1.2.1').id);
	});

	it("has the wiki's notes for every change, without wiki markup", () => {
		for (const p of puzzles) {
			for (const id of p.bonus) {
				const note = p.notes[id];
				expect(note, `${p.name} ${id}`).toBeTruthy();
				expect(note, p.name).not.toMatch(/\[\[|\]\]|\{\{|<\/?[a-z]|&[a-z]+;/);
			}
		}
		expect(puzzle('Cloud in a Bottle').notes[byName('1.1').id]).toMatch(/Shiny Red Balloon/);
	});

	it("keeps puzzles out of the browser's version data", () => {
		expect(JSON.stringify(versionGame.entries)).not.toContain('Cloud in a Bottle');
	});
});

describe('compareToAny', () => {
	it('is green for any right answer, an arrow or yellow otherwise', () => {
		expect(compareToAny(5, [3, 5, 9])).toBe('match');
		expect(compareToAny(1, [3, 5])).toBe('higher');
		expect(compareToAny(7, [3, 5])).toBe('lower');
		expect(compareToAny(4, [3, 5])).toBe('partial');
	});
});
