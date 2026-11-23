import { describe, expect, it } from 'vitest';
import data from '$lib/data/fish.json';
import text from '$lib/server/fish-quotes.json';
import { firstWords } from '$lib/server/text';
import { fishGame } from './fish';

const quotes = text as Record<string, string>;

describe('Fishdle data', () => {
	it('every fish has its quote on the server, and nothing else does', () => {
		for (const fish of data) expect(quotes[String(fish.id)], fish.name).toBeTruthy();
		expect(Object.keys(quotes).length).toBe(data.length);
	});

	it("doesn't give away the biome in the quote", () => {
		for (const q of Object.values(quotes)) expect(q).not.toMatch(/\(Caught /);
	});

	it("doesn't name the fish in its own quote", () => {
		for (const fish of data) {
			expect(quotes[String(fish.id)].toLowerCase()).not.toContain(fish.name.toLowerCase());
		}
	});

	it('keeps quotes out of the browser data', () => {
		const shipped = JSON.stringify(data);
		for (const fish of data) expect(shipped.includes(quotes[String(fish.id)])).toBe(false);
	});
});

describe('revealing the quote word by word', () => {
	it('is on for Fishdle', () => {
		expect(fishGame.clueByWord).toBe(true);
	});

	it('gives the first n words, keeping line breaks', () => {
		const quote = 'Hey you!\nGo fish.';
		expect(firstWords(quote, 1)).toEqual({ text: 'Hey', done: false });
		expect(firstWords(quote, 2)).toEqual({ text: 'Hey you!', done: false });
		expect(firstWords(quote, 3)).toEqual({ text: 'Hey you!\nGo', done: false });
		expect(firstWords(quote, 4)).toEqual({ text: 'Hey you!\nGo fish.', done: true });
		expect(firstWords(quote, 99)).toEqual({ text: 'Hey you!\nGo fish.', done: true });
	});
});
