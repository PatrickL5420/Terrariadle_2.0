import { describe, expect, it } from 'vitest';
import { forestStyle, rollForestStyle, seededRandom } from './clock';
import { FOREST_STYLES, forestLayout, forestTextures } from './forest';

/** Every texture 1024 x 512 (the animated ones as 2 x 2 frames of that). */
const sizes = (n: number): [number, number] =>
	n === 281 || n === 341 ? [2048, 1024] : [1024, 512];

describe('forest layout on the menu', () => {
	it('puts the plain forest where the game does', () => {
		const l = forestLayout(0, 0, 1920, sizes, 0);
		expect(l.far[0]).toMatchObject({ tex: 7, y: 280, scale: 2, x: -1024 });
		expect(l.near[0]).toMatchObject({ tex: 8, y: 410, scale: 2.3, x: -1177 - 500 });
		const [first, second, third] = [9, 10, 11].map((n) => l.trees.find((d) => d.tex === n)!);
		expect(first).toMatchObject({ y: 320, scale: 2.5, x: -1280 });
		expect(second).toMatchObject({ y: 400, scale: 2.62, x: -1341 - 80 });
		expect(third).toMatchObject({ y: 480, scale: 2.68, x: -1372 - 120 });
	});

	it('scrolls each layer by its parallax', () => {
		const a = forestLayout(0, 0, 1920, sizes, 0).trees[0].x;
		const b = forestLayout(0, 100, 1920, sizes, 0).trees[0].x;
		expect(a - b).toBe(40); // 0.4 parallax
	});

	it('lets a tree line set its own scale (SetBackgroundOffsets runs after the doubling)', () => {
		const l = forestLayout(9, 0, 1920, sizes, 0);
		expect(l.trees[0]).toMatchObject({ tex: 279, scale: 2.5 });
		expect(l.near[0]).toMatchObject({ tex: 278, y: 410 - 120 });
	});

	it('animates the animated ones, frame by frame', () => {
		const at = (counter: number) => forestLayout(13, 0, 1920, sizes, counter);
		const front = (counter: number) => at(counter).trees.find((d) => d.tex === 341)!;
		expect(front(0).src).toEqual([0, 2, 1024, 508]);
		expect(front(15).src).toEqual([1024, 2, 1024, 508]);
		expect(front(30).src).toEqual([0, 514, 1024, 508]);
		expect(at(0).near).toEqual([]); // style 13 has no near mountains
		const mushroom = forestLayout(6, 0, 1920, sizes, 25).trees[0];
		expect(mushroom.tex).toBe(253); // 173 draws 251-254, a frame per 10
	});

	it('flips the mirrored tree lines', () => {
		expect(forestLayout(1, 0, 1920, sizes, 0).trees.find((d) => d.tex === 51)?.flipX).toBe(true);
	});

	it('loads only what a style draws', () => {
		expect(forestTextures(0)).toEqual([7, 8, 9, 10, 11]);
		expect(forestTextures(4)).toEqual([93, 94]);
		expect(forestTextures(6)).toEqual([171, 172, 173, 251, 252, 253, 254]);
	});
});

describe('forest style roll (WorldGen.RollRandomForestBGStyle)', () => {
	it('only rolls styles the game has', () => {
		const next = seededRandom('test');
		for (let i = 0; i < 2000; i++) expect(FOREST_STYLES).toContain(rollForestStyle(next));
	});

	it('is the same all day for everyone, and changes at midnight', () => {
		const day = (iso: string) => forestStyle(new Date(iso));
		// 1 AM and 11 PM Sydney (AEDT, UTC+11) on the same date.
		expect(day('2024-01-09T14:00:00Z')).toBe(day('2024-01-10T12:00:00Z'));
		const styles = new Set(
			Array.from({ length: 60 }, (_, i) => day(new Date(Date.UTC(2024, 0, 1 + i, 2)).toISOString()))
		);
		expect(styles.size).toBeGreaterThan(5);
	});
});
