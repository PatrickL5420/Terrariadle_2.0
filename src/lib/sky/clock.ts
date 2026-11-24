/**
 * Terraria's day/night cycle, run on Sydney time, and the 1.4.5 main-menu sky maths.
 *
 * Terraria's clock: day runs 4:30 AM to 7:30 PM (54,000 ticks), night 7:30 PM to 4:30 AM
 * (32,400 ticks). That's exactly one tick per real second, so Sydney's wall clock maps straight
 * onto the game's `Main.time` / `Main.dayTime`.
 *
 * Everything else is ported from the game's code (Terraria 1.4.5): Main.SetBackColor,
 * Main.DrawSunAndMoon, Main.HorizonPhase, and NextHorizonRenderer / HorizonHelper / SunGradients
 * for the sunrise and sunset light. Colours are bytes and truncate like the game's (XNA `Color`).
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
export type RGBA = [number, number, number, number];

const byte = (n: number) => Math.max(0, Math.min(255, Math.trunc(n)));

/** XNA's `Color * float`: every channel (alpha too) scaled and truncated. */
export const scaleColor = <C extends RGB | RGBA>(c: C, f: number): C =>
	c.map((v) => byte(v * f)) as C;

/** XNA's `Color.Lerp` (truncates). */
const lerpColor = (a: RGB, b: RGB, t: number): RGB => {
	t = Math.max(0, Math.min(1, t));
	return a.map((v, i) => byte(v + (b[i] - v) * t)) as RGB;
};

/** Terraria's `Utils.Remap`, clamped. */
export function remap(v: number, fromMin: number, fromMax: number, toMin: number, toMax: number) {
	const t = Math.max(0, Math.min(1, (v - fromMin) / (fromMax - fromMin)));
	return toMin + (toMax - toMin) * t;
}

/**
 * SunGradients: the colours of each sunrise and sunset, top of the sky to the horizon. Which one
 * shows depends on the moon phase (Main.HorizonPhase).
 */
export const SUNRISES: RGB[][] = [
	// Sunrise_Blue
	[
		[17, 35, 67],
		[21, 43, 76],
		[24, 55, 86],
		[30, 69, 99],
		[36, 87, 114],
		[43, 107, 127],
		[55, 126, 140],
		[68, 144, 149],
		[84, 157, 155],
		[116, 175, 156],
		[154, 190, 155],
		[189, 204, 156],
		[218, 215, 155],
		[241, 225, 154],
		[255, 230, 153]
	],
	// Sunrise_Violet
	[
		[37, 42, 58],
		[43, 46, 65],
		[50, 51, 77],
		[58, 56, 90],
		[68, 64, 104],
		[81, 73, 119],
		[93, 82, 131],
		[106, 92, 142],
		[121, 104, 151],
		[145, 124, 152],
		[175, 149, 157],
		[201, 170, 157],
		[225, 191, 158],
		[243, 207, 156],
		[249, 212, 156]
	],
	// Sunrise_Yellow
	[
		[15, 18, 28],
		[16, 20, 32],
		[20, 26, 43],
		[25, 36, 58],
		[33, 46, 76],
		[42, 60, 91],
		[53, 74, 97],
		[69, 92, 102],
		[90, 116, 104],
		[118, 141, 106],
		[148, 164, 110],
		[172, 181, 115],
		[195, 198, 128],
		[218, 213, 142],
		[233, 225, 158]
	],
	// Sunrise_Aluminum
	[
		[42, 85, 135],
		[51, 86, 137],
		[63, 86, 140],
		[76, 86, 143],
		[91, 86, 146],
		[107, 87, 150],
		[123, 90, 153],
		[138, 95, 155],
		[152, 102, 157],
		[168, 114, 157],
		[185, 131, 157],
		[202, 150, 157],
		[219, 170, 157],
		[233, 188, 157],
		[246, 204, 157]
	]
];
export const SUNSETS: RGB[][] = [
	// Sunset_Blue
	[
		[67, 80, 117],
		[82, 84, 120],
		[98, 89, 124],
		[114, 92, 125],
		[129, 95, 125],
		[144, 98, 125],
		[158, 100, 126],
		[171, 103, 125],
		[182, 104, 121],
		[192, 106, 115],
		[200, 109, 107],
		[207, 111, 96],
		[213, 112, 84],
		[218, 112, 70],
		[222, 111, 56]
	],
	// Sunset_Dark
	[
		[16, 15, 33],
		[17, 15, 33],
		[20, 16, 34],
		[24, 18, 35],
		[27, 19, 36],
		[34, 21, 38],
		[39, 22, 41],
		[47, 23, 45],
		[51, 25, 47],
		[56, 27, 49],
		[60, 29, 50],
		[65, 32, 53],
		[70, 33, 56],
		[76, 36, 58],
		[80, 39, 60]
	],
	// Sunset_Pink
	[
		[72, 48, 93],
		[86, 54, 102],
		[101, 61, 112],
		[117, 68, 122],
		[133, 74, 130],
		[148, 81, 138],
		[162, 87, 143],
		[173, 93, 145],
		[186, 99, 142],
		[199, 105, 133],
		[210, 111, 119],
		[219, 115, 103],
		[227, 119, 87],
		[234, 123, 73],
		[240, 125, 63]
	],
	// Sunset_Red
	[
		[27, 24, 39],
		[28, 24, 39],
		[32, 25, 40],
		[38, 27, 40],
		[43, 28, 41],
		[50, 29, 43],
		[57, 30, 44],
		[64, 32, 45],
		[71, 34, 46],
		[79, 36, 47],
		[85, 37, 48],
		[93, 39, 50],
		[100, 41, 50],
		[109, 43, 52],
		[118, 45, 53]
	]
];
/** Texture names, in the same order. */
export const SUNRISE_TEXTURES = [
	'Sunrise_Blue',
	'Sunrise_Violet',
	'Sunrise_Yellow',
	'Sunrise_Aluminum'
];
export const SUNSET_TEXTURES = ['Sunset_Blue', 'Sunset_Dark', 'Sunset_Pink', 'Sunset_Red'];

/** Main.HorizonPhase: which sunrise / sunset (mod 4). The morning still uses last night's phase. */
export function horizonPhase({ dayTime, time }: GameTime, moonPhase: number): number {
	let n = moonPhase;
	if (dayTime && time < 27_000) n--;
	if (n < 0) n += 8;
	return n % 4;
}

export interface Visibilities {
	sunset: number;
	sunrise: number;
	/** Fades the sun's or moon's effects in after it rises and out before it sets. */
	celestial: number;
}

/** NextHorizonRenderer.GetVisibilities (no clouds, mushrooms or eclipse on the menu). */
export function visibilities({ dayTime, time }: GameTime): Visibilities {
	const celestial = dayTime
		? remap(time, 0, 3600, 0, 1) * remap(time, DAY_LENGTH - 1800, DAY_LENGTH, 1, 0)
		: remap(time, 0, 3600, 0, 1) * remap(time, NIGHT_LENGTH - 1800, NIGHT_LENGTH, 1, 0);
	if (!dayTime) return { sunset: 0, sunrise: 0, celestial };
	const sunrise = remap(time, 0, 2700, 0, 1) * remap(time, 3600, 10_800, 1, 0);
	const a = remap(time, DAY_LENGTH - 10_800, DAY_LENGTH - 3600, 0, 1);
	const b = remap(time, DAY_LENGTH - 3600, DAY_LENGTH, 1, 0);
	return { sunset: a * b * b, sunrise, celestial };
}

export interface SkyColors {
	/** Main.ColorOfTheSkies: multiplies the sky texture, clouds and background layers. */
	sky: RGB;
	/** The sun's tint (sunColor). */
	sun: RGB;
}

/** NextHorizonRenderer.BlendColor: towards the brighter of the two, by `opacity`. */
function blendColor(color: RGB, choose: RGB, opacity: number): RGB {
	if (opacity <= 0) return color;
	return lerpColor(color, color.map((v, i) => Math.max(v, choose[i])) as RGB, opacity);
}

/**
 * Main.SetBackColor on the main menu (no events or biomes), ending with
 * NextHorizonRenderer.ModifyHorizonLight. On the menu the night sky is always (35, 35, 35).
 */
export function skyColors(t: GameTime, moonPhase: number): SkyColors {
	const { dayTime, time } = t;
	let sky: RGB = [255, 255, 255];
	let sun: RGB = [255, 255, 255];
	if (dayTime) {
		if (time < 13_500) {
			const n = time / 13_500;
			sun = [byte(n * 200 + 55), byte(n * 180 + 75), byte(n * 250 + 5)];
			sky = [byte(n * 230 + 25), byte(n * 220 + 35), byte(n * 220 + 35)];
		}
		if (time > 45_900) {
			const n = 1 - (time / DAY_LENGTH - 0.85) * (20 / 3);
			sun = [byte(n * 120 + 55), byte(n * 100 + 25), byte(n * 120 + 55)];
			sky = [byte(n * 200 + 35), byte(n * 85 + 35), byte(n * 135 + 35)];
		} else if (time > 37_800) {
			const n = 1 - (time / DAY_LENGTH - 0.7) * (20 / 3);
			sun = [byte(n * 80 + 175), byte(n * 130 + 125), byte(n * 100 + 155)];
			sky = [byte(n * 20 + 235), byte(n * 135 + 120), byte(n * 85 + 170)];
		}
	} else {
		sky = [35, 35, 35];
	}
	// The minimum light for the moon phase (11 to 19) never bites: the menu sky is brighter.
	const vis = visibilities(t);
	const phase = horizonPhase(t, moonPhase);
	sky = blendColor(sky, SUNSETS[phase][7], vis.sunset);
	sky = blendColor(sky, SUNRISES[phase][7], vis.sunrise);
	return { sky, sun };
}

/** HorizonHelper.MoonColors, by moon type. */
const MOON_COLORS: RGB[] = [
	[230, 235, 255],
	[250, 235, 160],
	[230, 255, 230],
	[160, 240, 255],
	[180, 255, 255],
	[230, 255, 230],
	[255, 180, 255],
	[255, 200, 180],
	[225, 180, 255]
];
export const SUN_LIGHT: RGB = [255, 246, 204];

/** HorizonHelper.GetCelestialBodyColors: the light the sun or moon casts on the clouds. */
export function celestialLight({ dayTime }: GameTime, moonType: number, moonPhase: number): RGB {
	if (dayTime) return SUN_LIGHT;
	const strength = remap(Math.abs(4 - moonPhase), 0, 4, 0, 1);
	return scaleColor(MOON_COLORS[moonType], strength);
}

export interface Body {
	/** Centre, in game pixels. */
	x: number;
	y: number;
	scale: number;
	rotation: number;
}

/** Main.DrawSunAndMoon: the sun (day, 114 px wide) or moon (night, 50 px), rising on the left. */
export function sunOrMoon({ dayTime, time }: GameTime, width: number, size: number): Body {
	const length = dayTime ? DAY_LENGTH : NIGHT_LENGTH;
	const t = time / length;
	// 0 at noon / midnight, 1 at the horizon: from 430 px up to 180 px and back.
	const height = Math.abs(t * 2 - 1) ** 2;
	return {
		x: Math.trunc(t * (width + size * 2)) - size,
		y: Math.trunc(height * 250 + 180),
		scale: (1.2 - height * 0.4) * (dayTime ? 1.1 : 1),
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

/**
 * Which of the 9 moons shows. The menu picks a random one each night (Main.UpdateMenu); this
 * picks one per night from the date, so everyone sees the same moon.
 */
export function moonType(now = new Date()): number {
	// The night belongs to the evening it started on (Sydney time).
	const evening = new Date(now.getTime() - DAWN * 1000);
	const day = evening.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
	let h = 0;
	for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return h % 9;
}
