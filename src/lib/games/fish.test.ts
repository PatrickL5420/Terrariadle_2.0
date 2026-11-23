import { describe, expect, it } from 'vitest';
import data from '$lib/data/fish.json';
import text from '$lib/server/fish-quotes.json';

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
