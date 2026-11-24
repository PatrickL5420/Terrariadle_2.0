import { describe, expect, it } from 'vitest';
import { clockToGameTime, moonPhase, skyColors, sunOrMoon, type RGB } from './clock';

const at = (h: number, m = 0) => clockToGameTime(h * 3600 + m * 60);
const close = (a: RGB, b: RGB, by = 3) => a.every((v, i) => Math.abs(v - b[i]) <= by);

describe('Sydney time -> Terraria time', () => {
	it('starts the day at 4:30 AM and the night at 7:30 PM', () => {
		expect(at(4, 30)).toEqual({ dayTime: true, time: 0 });
		expect(at(12)).toEqual({ dayTime: true, time: 27_000 }); // noon
		expect(at(19, 30)).toEqual({ dayTime: false, time: 0 });
		expect(at(0)).toEqual({ dayTime: false, time: 16_200 }); // midnight
		expect(at(4, 29)).toEqual({ dayTime: false, time: 32_340 });
	});
});

describe('sky colours (Main.SetBackColor)', () => {
	it('is plain white at midday, darkest at midnight', () => {
		expect(skyColors(at(12)).sky).toEqual([255, 255, 255]);
		expect(skyColors(at(0)).sky).toEqual([5, 5, 5]);
	});

	it('has no jumps at sunrise, sunset or between its formulas', () => {
		const pairs: [number, number, number, number][] = [
			[4, 29, 4, 30], // sunrise
			[19, 29, 19, 30], // sunset
			[8, 14, 8, 16], // end of the morning fade (13,500)
			[14, 59, 15, 1], // dusk fade starts (37,800)
			[17, 14, 17, 16], // dusk fade, second part (45,900)
			[23, 59, 0, 1] // midnight (16,200)
		];
		for (const [h1, m1, h2, m2] of pairs) {
			const a = skyColors(at(h1, m1)).sky;
			const b = skyColors(at(h2, m2)).sky;
			expect(close(a, b, 4), `${h1}:${m1} ${a} vs ${h2}:${m2} ${b}`).toBe(true);
		}
	});
});

describe('sun and moon path (Main.DrawSunAndMoon)', () => {
	it('rises off the left edge, peaks at noon and sets off the right edge', () => {
		const rise = sunOrMoon(at(4, 30), 1920, 114);
		const noon = sunOrMoon(at(12), 1920, 114);
		const set = sunOrMoon(at(19, 29), 1920, 114);
		expect(rise.x).toBe(-114);
		expect(rise.y).toBe(430);
		expect(noon.y).toBe(180);
		expect(noon.scale).toBeCloseTo(1.2);
		expect(set.x).toBeGreaterThan(1920);
	});
});

describe('moon phase', () => {
	it('matches known full and new moons', () => {
		expect(moonPhase(new Date('2024-01-25T17:54:00Z'))).toBe(0); // full
		expect(moonPhase(new Date('2024-01-11T11:57:00Z'))).toBe(4); // new
		expect(moonPhase(new Date('2024-01-18T03:53:00Z'))).toBe(6); // first quarter
		expect(moonPhase(new Date('2024-02-02T23:18:00Z'))).toBe(2); // third quarter
	});
});
