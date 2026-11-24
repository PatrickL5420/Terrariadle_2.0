/**
 * Terraria's day/night cycle, run on Sydney time.
 *
 * Terraria's clock: day runs 4:30 AM to 7:30 PM (54,000 ticks), night 7:30 PM to 4:30 AM
 * (32,400 ticks). That's exactly one tick per real second, so Sydney's wall clock maps straight
 * onto the game's `Main.time` / `Main.dayTime`.
 *
 * Colours and the sun and moon's path follow the game's own formulas (Main.SetBackColor and
 * Main.DrawSunAndMoon in Terraria 1.4).
 */
import { secondsSinceMidnight } from '$lib/engine/daily';

export const DAY_LENGTH = 54_000;
export const NIGHT_LENGTH = 32_400;
const DAWN = 4.5 * 3600; // 4:30 AM
const DUSK = 19.5 * 3600; // 7:30 PM

export interface GameTime {
	dayTime: boolean;
	/** Ticks since sunrise (day) or sunset (night). */
	time: number;
}

/** Sydney wall-clock time -> Terraria's time of day. */
export function gameTime(now = new Date()): GameTime {
	return clockToGameTime(secondsSinceMidnight(now));
}

export function clockToGameTime(seconds: number): GameTime {
	if (seconds >= DAWN && seconds < DUSK) return { dayTime: true, time: seconds - DAWN };
	return { dayTime: false, time: (seconds - DUSK + 86_400) % 86_400 };
}

export type RGB = [number, number, number];

export interface SkyColors {
	/** Main.ColorOfTheSkies: multiplies the sky texture, clouds and background layers. */
	sky: RGB;
	sun: RGB;
	moon: RGB;
}

/** Main.SetBackColor (no events): the sky, sun and moon colours for a time of day. */
export function skyColors({ dayTime, time }: GameTime): SkyColors {
	const byte = (n: number) => Math.max(0, Math.min(255, Math.trunc(n)));
	const mix = (t: number, scale: RGB, base: RGB): RGB => [
		byte(t * scale[0] + base[0]),
		byte(t * scale[1] + base[1]),
		byte(t * scale[2] + base[2])
	];
	let sky: RGB = [255, 255, 255];
	let sun: RGB = [255, 255, 255];
	let moon: RGB = [255, 255, 255];

	if (dayTime) {
		if (time < 13_500) {
			const t = time / 13_500;
			sun = mix(t, [200, 180, 250], [55, 75, 5]);
			sky = mix(t, [230, 220, 220], [25, 35, 35]);
		}
		if (time > 45_900) {
			const t = 1 - (time / DAY_LENGTH - 0.85) * (20 / 3);
			sun = mix(t, [120, 100, 120], [55, 25, 55]);
			sky = mix(t, [200, 85, 135], [35, 35, 35]);
		} else if (time > 37_800) {
			const t = 1 - (time / DAY_LENGTH - 0.7) * (20 / 3);
			sun = mix(t, [80, 130, 100], [175, 125, 155]);
			sky = mix(t, [20, 135, 85], [235, 120, 170]);
		}
	} else if (time < 16_200) {
		const t = 1 - time / 16_200;
		moon = mix(t, [10, 70, 100], [205, 155, 155]);
		sky = mix(t, [30, 30, 30], [5, 5, 5]);
	} else {
		const t = (time / NIGHT_LENGTH - 0.5) * 2;
		moon = mix(t, [50, 100, 100], [205, 155, 155]);
		sky = mix(t, [20, 30, 30], [5, 5, 5]);
	}
	return { sky, sun, moon };
}

export interface Body {
	/** Centre, in game pixels at 1x (the screen is `width` wide). */
	x: number;
	y: number;
	scale: number;
	rotation: number;
}

/** Main.DrawSunAndMoon: where the sun (day) or moon (night) is, rising left and setting right. */
export function sunOrMoon({ dayTime, time }: GameTime, width: number, size: number): Body {
	const length = dayTime ? DAY_LENGTH : NIGHT_LENGTH;
	const t = time / length;
	// 0 at noon / midnight, 1 at the horizon: a parabola from 430 px up to 180 px and back.
	const height = t < 0.5 ? (1 - t * 2) ** 2 : ((t - 0.5) * 2) ** 2;
	return {
		x: t * (width + size * 2) - size,
		y: height * 250 + 180,
		scale: 1.2 - height * 0.4,
		rotation: t * 2 - 7.3
	};
}

/**
 * The real moon's phase in Terraria's order: 0 full, 1 waning gibbous, 2 third quarter,
 * 3 waning crescent, 4 new, 5 waxing crescent, 6 first quarter, 7 waxing gibbous.
 */
export function moonPhase(now = new Date()): number {
	const SYNODIC_DAYS = 29.530588853;
	const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 6 Jan 2000, 18:14 UTC
	const age = (((now.getTime() - KNOWN_NEW_MOON) / 86_400_000) % SYNODIC_DAYS) + SYNODIC_DAYS;
	const eighth = Math.round(((age % SYNODIC_DAYS) / SYNODIC_DAYS) * 8) % 8; // 0 new ... 4 full
	return (eighth + 4) % 8;
}
