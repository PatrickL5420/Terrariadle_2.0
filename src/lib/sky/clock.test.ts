import { describe, expect, it } from 'vitest';
import {
	celestialLight,
	clockToGameTime,
	horizonPhase,
	moonPhase,
	moonType,
	skyColors,
	sunOrMoon,
	visibilities,
	type RGB
} from './clock';

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

describe('sunrise and sunset (NextHorizonRenderer.GetVisibilities)', () => {
	it('shows the sunrise in the first three hours and the sunset in the last three', () => {
		expect(visibilities(at(4, 30)).sunrise).toBe(0);
		expect(visibilities(at(5, 30)).sunrise).toBe(1); // ticks 2,700-3,600: full
		expect(visibilities(at(7, 30)).sunrise).toBe(0); // gone by tick 10,800
		expect(visibilities(at(12)).sunrise + visibilities(at(12)).sunset).toBe(0);
		expect(visibilities(at(18, 30)).sunset).toBe(1); // tick 50,400: full
		expect(visibilities(at(16, 30)).sunset).toBe(0); // starts at tick 43,200
		expect(visibilities(at(22)).sunset).toBe(0); // never at night
	});

	it('fades the sun and moon effects in after rising and out before setting', () => {
		expect(visibilities(at(4, 30)).celestial).toBe(0);
		expect(visibilities(at(5, 30)).celestial).toBe(1);
		expect(visibilities(at(19)).celestial).toBe(1);
		expect(visibilities(at(19, 15)).celestial).toBeCloseTo(0.5);
		expect(visibilities(at(0)).celestial).toBe(1);
	});

	it('picks the sunrise and sunset from the moon phase, using last night’s in the morning', () => {
		expect(horizonPhase(at(6), 5)).toBe(0); // morning: phase 5 - 1 = 4, mod 4
		expect(horizonPhase(at(16), 5)).toBe(1);
		expect(horizonPhase(at(6), 0)).toBe(3); // 0 - 1 wraps to 7
	});
});

describe('sky colours (Main.SetBackColor on the menu)', () => {
	it('is plain white at midday and the menu’s flat grey at night', () => {
		expect(skyColors(at(12), 0).sky).toEqual([255, 255, 255]);
		expect(skyColors(at(0), 0).sky).toEqual([35, 35, 35]);
		expect(skyColors(at(21), 3).sky).toEqual([35, 35, 35]);
	});

	it('takes on the sunrise colour at dawn', () => {
		// 5:30 AM is tick 3,600: sunrise fully visible. Phase 1 - 1 = 0: Sunrise_Blue, whose
		// middle colour (entry 15 / 2 = 7: 68, 144, 149) lifts green and blue.
		const n = 3600 / 13_500;
		const dawn: RGB = [
			Math.trunc(n * 230 + 25),
			Math.trunc(n * 220 + 35),
			Math.trunc(n * 220 + 35)
		];
		expect(dawn).toEqual([86, 93, 93]);
		expect(skyColors(at(5, 30), 1).sky).toEqual([86, 144, 149]);
	});

	it('has no jumps between its formulas through the day', () => {
		const pairs: [number, number, number, number][] = [
			[8, 14, 8, 16], // end of the morning fade (13,500)
			[14, 59, 15, 1], // dusk fade starts (37,800)
			[17, 14, 17, 16] // dusk fade, second part (45,900)
		];
		for (const [h1, m1, h2, m2] of pairs) {
			const a = skyColors(at(h1, m1), 0).sky;
			const b = skyColors(at(h2, m2), 0).sky;
			expect(close(a, b, 4), `${h1}:${m1} ${a} vs ${h2}:${m2} ${b}`).toBe(true);
		}
	});

	it('tints the sun', () => {
		expect(skyColors(at(4, 30), 0).sun).toEqual([55, 75, 5]);
		expect(skyColors(at(12), 0).sun).toEqual([255, 255, 255]);
	});
});

describe('celestial light on the clouds (HorizonHelper)', () => {
	it('is the sun’s colour by day, and the moon’s by its type and phase', () => {
		expect(celestialLight(at(12), 0, 0)).toEqual([255, 246, 204]);
		expect(celestialLight(at(0), 0, 0)).toEqual([230, 235, 255]); // full moon
		expect(celestialLight(at(0), 0, 4)).toEqual([0, 0, 0]); // new moon
		expect(celestialLight(at(0), 1, 2)).toEqual([125, 117, 80]); // half: x 0.5, truncated
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
		expect(noon.scale).toBeCloseTo(1.2 * 1.1); // the sun is drawn 10% bigger
		expect(set.x).toBeGreaterThan(1920);
		expect(sunOrMoon(at(0), 1920, 50).scale).toBeCloseTo(1.2);
	});
});

describe('moon', () => {
	it('matches known full and new moons', () => {
		expect(moonPhase(new Date('2024-01-25T17:54:00Z'))).toBe(0); // full
		expect(moonPhase(new Date('2024-01-11T11:57:00Z'))).toBe(4); // new
		expect(moonPhase(new Date('2024-01-18T03:53:00Z'))).toBe(6); // first quarter
		expect(moonPhase(new Date('2024-02-02T23:18:00Z'))).toBe(2); // third quarter
	});

	it('keeps one moon type for the whole night', () => {
		// 9 PM and 3 AM Sydney (AEDT, UTC+11) are the same night.
		const evening = moonType(new Date('2024-01-10T10:00:00Z'));
		expect(moonType(new Date('2024-01-10T16:00:00Z'))).toBe(evening);
		expect(evening).toBeGreaterThanOrEqual(0);
		expect(evening).toBeLessThan(9);
	});
});
