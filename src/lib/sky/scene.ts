/**
 * The 1.4.5 main-menu sky, drawn in the game's order (Main.DoDraw on the menu, Main.DrawBG,
 * Main.DrawSurfaceBG, NextHorizonRenderer), at the game's positions for a screen `H` game pixels
 * tall, into a render target that's then scaled to the page.
 *
 *  1. The sky: Images/Background_0 tinted by the sky colour; the sunrise or sunset gradient;
 *     stars; the sun (with its sunrise / sunset flares) or the moon.
 *  2. The landscape, drawn into its own target like the game's screen capture: mountains
 *     and forest (the day's style, see ./forest.ts), clouds (lit by the sun or moon), and the
 *     sunrise / sunset light over the trees.
 *  3. The lens flare, dimmed by how much of the landscape covers the sun.
 */
import {
	celestialLight,
	DAY_LENGTH,
	NIGHT_LENGTH,
	scaleColor,
	skyColors,
	sunOrMoon,
	SUNRISES,
	SUNRISE_TEXTURES,
	SUNSETS,
	SUNSET_TEXTURES,
	visibilities,
	horizonPhase,
	type GameTime,
	type RGB,
	type RGBA
} from './clock';
import { loadTexture, SpriteRenderer, type Target, type Texture } from '$lib/gl/sprites';
import { forestLayout, forestTextures, type LayerDraw } from './forest';
import { Clouds, CLOUD_SIZES, Stars } from './sim';

/** The menu's camera moves right 4 pixels a frame (Main.MenuXMovement); this goes at half that. */
export const MENU_SCROLL = 2;
/** The menu's clock runs this many ticks a frame at night; ours runs one a second (60 frames). */
const MENU_NIGHT_TICKS_PER_FRAME = 30.857142857142858;

const FILES = [
	'Background_0',
	'Sun',
	...[0, 1, 2, 3].map((i) => `Star_${i}`),
	...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `Moon_${i}`),
	...Object.keys(CLOUD_SIZES).map((i) => `Cloud_${i}`),
	...SUNRISE_TEXTURES.map((n) => `Sunrise/${n}`),
	...SUNSET_TEXTURES.map((n) => `Sunset/${n}`),
	'Sunflare/flare1',
	'Sunflare/flare2',
	'Sunflare/colorgradient',
	'Sunflare/Lens/PointBlurry',
	'Sunflare/Lens/PointSharp',
	'Sunflare/Lens/Flare1',
	'Sunflare/Lens/Flare2'
];

export async function loadTextures(
	r: SpriteRenderer,
	files = FILES
): Promise<Record<string, Texture>> {
	const entries = await Promise.all(
		files.map(async (name) => [name, await loadTexture(r, `/sky/${name}.png`)] as const)
	);
	return Object.fromEntries(entries);
}

/** A lens flare element (LensFlareElement). */
interface Flare {
	tex: string;
	repeat: number;
	distance: number;
	distanceStep?: number;
	scale: number;
	scaleStep?: number;
	color: RGBA;
	intensityStep?: number;
	rotation?: number;
}

/** `new Color(r, g, b, a) * f`, as the game writes the flare colours. */
const c = (r: number, g: number, b: number, f: number): RGBA => scaleColor([r, g, b, 0], f);

/** NextHorizonRenderer.DrawSunsetFlare. */
const SUNSET_FLARE: Flare[] = [
	{
		tex: 'PointBlurry',
		repeat: 3,
		distance: 0.33,
		distanceStep: 0.05,
		scale: 0.3,
		scaleStep: -0.04,
		color: c(43, 32, 0, 0.47058824),
		intensityStep: -0.125
	},
	{
		tex: 'PointSharp',
		repeat: 3,
		distance: 0.03,
		distanceStep: 0.05,
		scale: 0.3,
		scaleStep: 0.04,
		color: c(43, 32, 0, 0.47058824),
		intensityStep: -0.125
	},
	{ tex: 'PointBlurry', repeat: 1, distance: 0.41, scale: 0.3, color: c(255, 0, 65, 0.11764706) },
	{ tex: 'Flare1', repeat: 1, distance: 0.475, scale: 0.3, color: c(255, 255, 255, 8 / 51) },
	{
		tex: 'Flare1',
		repeat: 6,
		distance: 0.225,
		distanceStep: 0.04,
		scale: 0.24,
		scaleStep: -0.04,
		color: c(255, 255, 255, 4 / 51)
	},
	{ tex: 'PointBlurry', repeat: 1, distance: 0.6, scale: 1, color: c(255, 157, 0, 8 / 51) },
	{
		tex: 'Flare2',
		repeat: 1,
		distance: 0.65,
		scale: 0.4,
		rotation: Math.PI,
		color: c(255, 255, 255, 2 / 51)
	}
];

/** NextHorizonRenderer.DrawSunriseFlare. */
const SUNRISE_FLARE: Flare[] = [
	{
		tex: 'PointSharp',
		repeat: 3,
		distance: 0.33,
		distanceStep: 0.05,
		scale: 0.3,
		scaleStep: -0.04,
		color: c(0, 32, 43, 0.47058824),
		intensityStep: -0.125
	},
	{
		tex: 'PointSharp',
		repeat: 3,
		distance: 0.03,
		distanceStep: 0.05,
		scale: 0.3,
		scaleStep: 0.04,
		color: c(0, 32, 43, 0.47058824),
		intensityStep: -0.125
	},
	{ tex: 'PointBlurry', repeat: 1, distance: 0.41, scale: 0.3, color: c(65, 0, 255, 0.11764706) },
	{
		tex: 'Flare1',
		repeat: 1,
		distance: 0.525,
		rotation: 0.01,
		scale: 0.3,
		color: c(255, 255, 255, 8 / 51)
	},
	{
		tex: 'Flare1',
		repeat: 6,
		distance: 0.225,
		distanceStep: 0.04,
		scale: 0.24,
		scaleStep: -0.04,
		color: c(255, 255, 255, 4 / 51)
	},
	{ tex: 'PointBlurry', repeat: 1, distance: 0.6, scale: 1, color: c(0, 157, 255, 8 / 51) },
	{
		tex: 'Flare2',
		repeat: 1,
		distance: 0.65,
		scale: 0.38,
		rotation: Math.PI,
		color: c(255, 255, 255, 2 / 51)
	}
];

const WHITE: RGBA = [255, 255, 255, 255];

export interface Moment {
	time: GameTime;
	moonPhase: number;
	moonType: number;
	/** The forest background style (see ./forest.ts). */
	forest: number;
}

/** The mouse, in game pixels, while it's held down on the sky. */
export interface Pointer {
	x: number;
	y: number;
}

export class SkyScene {
	#r: SpriteRenderer;
	#tex: Record<string, Texture>;
	#sky: Target | null = null;
	#land: Target | null = null;
	/** HorizonHelper's 64 x 64 copy of the area around the sun, averaged down to one pixel. */
	#sunArea: Target;
	clouds: Clouds | null = null;
	stars = new Stars();
	/** Main.screenPosition.X: how far the menu's camera has scrolled. */
	cameraX = 0;
	/** The forest style whose textures are loaded and drawn. */
	style = -1;
	#loading = -1;
	#failed = new Set<number>();
	/** The mouse while it's held down on the sky (null when it isn't). */
	pointer: Pointer | null = null;
	/** Main.alreadyGrabbingSunOrMoon. */
	grabbing = false;
	/** Called with the time the sun or moon has been dragged to. */
	onDrag: (time: GameTime) => void = () => {};
	/** Main.sunModY / moonModY: how far the sun or moon's been dragged off its path. */
	#sunModY = 0;
	#moonModY = 0;
	/** Main.GetBackgroundCounter on the menu: seconds x 40, for animated backgrounds. */
	counter = 0;
	W = 0;
	H = 0;

	constructor(r: SpriteRenderer, textures: Record<string, Texture>) {
		this.#r = r;
		this.#tex = textures;
		this.#sunArea = r.target(64, 64, { mipmaps: true });
	}

	/** The game screen's size in game pixels. */
	resize(W: number, H: number) {
		if (W === this.W && H === this.H) return;
		this.W = W;
		this.H = H;
		for (const t of [this.#sky, this.#land]) if (t) this.#r.deleteTarget(t);
		this.#sky = this.#r.target(W, H, { linear: true });
		this.#land = this.#r.target(W, H);
		if (this.clouds) this.clouds.resize(W, H);
		else this.clouds = new Clouds(W, H);
	}

	/** Loads a forest style's textures, then switches to it (nothing to do: undefined). */
	loadStyle(style: number): Promise<void> | undefined {
		// A style that failed to load shows the plain forest instead.
		if (this.#failed.has(style)) style = 0;
		if (style === this.style || style === this.#loading) return;
		this.#loading = style;
		const missing = forestTextures(style)
			.map((n) => `Background_${n}`)
			.filter((name) => !this.#tex[name]);
		return loadTextures(this.#r, missing).then(
			(textures) => {
				Object.assign(this.#tex, textures);
				if (this.#loading === style) this.style = style;
			},
			() => {
				this.#failed.add(style);
				if (this.#loading === style) this.#loading = -1;
			}
		);
	}

	/** One 60th of a second of the menu: clouds, stars, the scrolling camera. */
	update(time: GameTime) {
		// The dragged sun or moon drifts back to its path (Main.DrawSunAndMoon).
		this.#sunModY = Math.trunc(this.#sunModY * 0.999);
		this.#moonModY = Math.trunc(this.#moonModY * 0.999);
		this.counter += 40 / 60;
		this.cameraX += MENU_SCROLL;
		this.stars.update(time.dayTime, time.time, 1 / 12 / MENU_NIGHT_TICKS_PER_FRAME / 60);
		this.clouds?.update(MENU_SCROLL);
	}

	/** Draws a frame into the canvas, `width` x `height` device pixels. */
	draw(m: Moment, width: number, height: number) {
		const r = this.#r;
		const { W, H } = this;
		const t = this.#tex;
		const { sky, sun } = skyColors(m.time, m.moonPhase);
		const vis = visibilities(m.time);
		const phase = horizonPhase(m.time, m.moonPhase);

		// 1. The sky (Main.DoDraw: Background_0, then DrawHorizon; stars; sun and moon).
		r.begin(this.#sky, W, H, [0, 0, 0, 255]);
		r.use('sprite');
		const bg0 = t.Background_0;
		for (let x = 0; x < W; x += bg0.width)
			r.drawRect(bg0, x, 0, bg0.width, Math.max(H, bg0.height), sky);
		// GetGradientRect on the menu: the screen, plus 400 px above it.
		const sunrise = t[`Sunrise/${SUNRISE_TEXTURES[phase]}`];
		const sunset = t[`Sunset/${SUNSET_TEXTURES[phase]}`];
		if (vis.sunrise) r.drawRect(sunrise, 0, -400, W, H + 400, scaleColor(WHITE, vis.sunrise));
		if (vis.sunset) r.drawRect(sunset, 0, -400, W, H + 400, scaleColor(WHITE, vis.sunset));
		this.#drawStars(sky);
		const celestial = this.#drawSunAndMoon(m, sun, vis);

		// 2. The landscape (Main.DrawSurfaceBG), in its own target like the game's screen capture.
		r.begin(this.#land, W, H, [0, 0, 0, 0]);
		this.#drawLandscape(m, sky, vis, phase, celestial);

		// Put the landscape over the sky.
		r.begin(this.#sky, W, H);
		r.use('sprite');
		r.draw(this.#land!, 0, 0, WHITE);

		// HorizonHelper.UpdateSunVisibility: a 128 px square around the sun, shrunk to 64 px.
		r.begin(this.#sunArea);
		this.#r.gl.disable(this.#r.gl.BLEND);
		r.draw(this.#land!, 0, 0, WHITE, {
			src: [celestial[0] - 64, celestial[1] - 64, 128, 128],
			scale: 0.5
		});
		r.flush();
		this.#r.gl.enable(this.#r.gl.BLEND);
		r.generateMipmaps(this.#sunArea);

		// 3. The lens flare (NextHorizonRenderer.DrawLensFlare).
		r.begin(this.#sky, W, H);
		this.#drawLensFlare(celestial, vis);

		// To the page.
		r.begin(null, width, height);
		r.use('sprite');
		r.drawRect(this.#sky!, 0, 0, width, height, WHITE);
		r.flush();
	}

	/** Main.DrawStarsInBackground / DrawStar. Stars are drawn additively (alpha 0). */
	#drawStars(sky: RGB) {
		if (255 - sky[0] - 25 <= 0) return;
		const r = this.#r;
		const { W, H } = this;
		for (const s of this.stars.list) {
			if (s.hidden) continue;
			const fade = 1 - s.fadeIn;
			const ch = (v: number) => Math.trunc((255 - v - 100) * s.twinkle * fade);
			let n = Math.trunc((ch(sky[0]) + ch(sky[2]) + ch(sky[1])) / 3);
			if (n <= 0) continue;
			n = Math.min(255, Math.trunc(n * 1.4));
			const color: RGBA = [n, n, n, 0];
			let x = (s.x / 1920) * W;
			let y = (s.y / 1200) * H;
			if (!s.falling) {
				if (x < 0) x += W;
				if (x > W) x -= W;
				if (y < 0) y += H;
				if (y > H) y -= H;
			}
			const tex = this.#tex[`Star_${s.type}`];
			const origin: [number, number] = [tex.width / 2, tex.height / 2];
			if (s.falling) {
				s.fadeIn = 0;
				const trail = Math.min(30, s.fallTime);
				for (let j = 1; j < trail; j++) {
					const k = 1 - j / 30;
					r.draw(tex, x - s.fallX * j * 0.4, y - s.fallY * j * 0.4, scaleColor(color, k), {
						rotation: s.rotation,
						origin,
						scale: s.scale * k * s.twinkle
					});
				}
			}
			r.draw(tex, x, y, color, { rotation: s.rotation, origin, scale: s.scale * s.twinkle });
		}
	}

	/** Main.DrawSunAndMoon (and NextHorizonRenderer.DrawSun). Returns where it is. */
	#drawSunAndMoon(m: Moment, sun: RGB, vis: ReturnType<typeof visibilities>): [number, number] {
		const r = this.#r;
		const t = this.#tex;
		if (m.time.dayTime) {
			const tex = t.Sun;
			const b = sunOrMoon(m.time, this.W, tex.width);
			this.#drag(m.time, b, tex.width, tex.height, this.#sunModY, (y) => (this.#sunModY = y));
			b.y += this.#sunModY;
			const o = {
				rotation: b.rotation,
				origin: [tex.width / 2, tex.height / 2] as [number, number],
				scale: b.scale
			};
			r.draw(tex, b.x, b.y, WHITE, o);
			r.draw(tex, b.x, b.y, [sun[0], sun[1], sun[2], sun[2]], o);
			// The sunrise / sunset glow around the sun, drawn additively.
			const sunset = vis.sunset * vis.celestial;
			const sunrise = vis.sunrise * vis.celestial;
			// (255, 255, 255, 0) * visibility * factors..., truncated at each step like the game.
			const glow: [string, number[], number][] = [
				['flare1', [sunset, 0.75], 3],
				['flare1', [sunset, 0.35], 2],
				['flare2', [sunrise, 0.7, 0.5], 2],
				['flare2', [sunrise, 0.3, 0.5], 1.5],
				['flare2', [sunrise, 0.2, 0.5], 1]
			];
			for (const [name, factors, scale] of glow) {
				const f = t[`Sunflare/${name}`];
				const color = factors.reduce((col, k) => scaleColor(col, k), [255, 255, 255, 0] as RGBA);
				r.draw(f, b.x, b.y, color, { origin: [f.width / 2, f.height / 2], scale });
			}
			return [b.x, b.y];
		}
		const tex = t[`Moon_${m.moonType}`];
		const b = sunOrMoon(m.time, this.W, tex.width);
		const size = tex.width; // square frames, one per phase
		this.#drag(m.time, b, size, size, this.#moonModY, (y) => (this.#moonModY = y));
		b.y += this.#moonModY;
		r.draw(tex, b.x, b.y, WHITE, {
			src: [0, size * m.moonPhase, size, size],
			rotation: b.rotation,
			origin: [size / 2, size / 2],
			scale: b.scale
		});
		return [b.x, b.y];
	}

	/**
	 * The title screen's sun and moon grabbing (Main.DrawSunAndMoon): while the mouse is held
	 * over it, or has grabbed it, the time follows the mouse across the screen and the sun or
	 * moon follows it up and down.
	 */
	#drag(
		time: GameTime,
		b: { x: number; y: number; scale: number },
		w: number,
		h: number,
		modY: number,
		setModY: (y: number) => void
	) {
		const p = this.pointer;
		if (!p) {
			this.grabbing = false;
			return;
		}
		const left = Math.trunc(b.x - w * 0.5 * b.scale);
		const top = Math.trunc(b.y - h * 0.5 * b.scale + modY);
		const size = Math.trunc(w * b.scale);
		const over = p.x >= left && p.x < left + size && p.y >= top && p.y < top + size;
		if (!over && !this.grabbing) return;
		const length = time.dayTime ? DAY_LENGTH : NIGHT_LENGTH;
		let t = length * ((Math.trunc(p.x) + w) / (this.W + w * 2));
		t = Math.max(10, Math.min(length - 10, t));
		setModY(Math.trunc(p.y - b.y));
		this.grabbing = true;
		this.onDrag({ dayTime: time.dayTime, time: t });
	}

	/** Main.DrawSurfaceBG on the menu (forest), with NextHorizonRenderer's clouds and light. */
	#drawLandscape(
		m: Moment,
		sky: RGB,
		vis: ReturnType<typeof visibilities>,
		phase: number,
		sun: [number, number]
	) {
		const r = this.#r;
		const t = this.#tex;
		const { W, H } = this;
		const clouds = this.clouds?.list ?? [];

		// The light the clouds catch (NextHorizonRenderer.CloudsEnd).
		r.cloudColor = celestialLight(m.time, m.moonType, m.moonPhase);
		let intensity = Math.max(vis.sunset, vis.sunrise) * vis.celestial;
		if (!m.time.dayTime) intensity = Math.max(intensity, vis.celestial * 0.15);
		r.cloudData = [sun[0], sun[1], intensity, 0];

		const drawClouds = (
			pass: 1 | 2 | 3,
			test: (scale: number) => boolean,
			y: (cy: number) => number
		) => {
			r.use('clouds');
			for (const cl of clouds) {
				if (!test(cl.scale)) continue;
				const tex = t[`Cloud_${cl.type}`];
				// Cloud.cloudColor, then NextHorizonRenderer.OriginalColorsForCloud.
				const k = Math.min(1, cl.scale * cl.alpha);
				const color = scaleColor([sky[0], sky[1], sky[2], 255] as RGBA, k);
				if (pass === 1) {
					color[0] = Math.trunc(color[0] * cl.scale * 0.8);
					color[1] = Math.trunc(color[1] * ((cl.scale + 1) / 2) * 0.9);
				}
				const pos: [number, number] = [cl.x + tex.width / 2, y(cl.y) + tex.height / 2];
				r.draw(tex, pos[0], pos[1], color, {
					rotation: cl.rotation,
					origin: [tex.width / 2, tex.height / 2],
					scale: cl.scale,
					flipX: cl.flip,
					drawPos: pos
				});
			}
			r.use('sprite');
		};

		// Nothing until the style's textures are in.
		const forest =
			this.style < 0
				? { far: [], near: [], trees: [] }
				: forestLayout(
						this.style,
						this.cameraX,
						W,
						(n) => [t[`Background_${n}`].width, t[`Background_${n}`].height],
						Math.trunc(this.counter)
					);
		const layer = (draws: LayerDraw[]) => {
			for (const d of draws) {
				r.draw(t[`Background_${d.tex}`], d.x, d.y, sky, {
					src: d.src,
					scale: d.scale,
					flipX: d.flipX
				});
			}
		};

		// On the menu: no screen scroll (scAdj 0); the far layers sit 180 px lower (pushBGTopHack).
		// worldSurface is 0 before a world is loaded, which puts the distant clouds far below.
		const topMagic = (H + 300) / 16;
		drawClouds(
			1,
			(s) => s < 1,
			(cy) => cy + topMagic * 750 + 830 + 180
		);
		layer(forest.far);
		drawClouds(
			2,
			(s) => s < 1.15 && s >= 1,
			(cy) => cy * (H / 600) + (280 - 50) + 200
		);
		layer(forest.near);
		drawClouds(
			3,
			(s) => s >= 1.15,
			(cy) => cy * (H / 600) - 100 + (410 * 1.01 - 150)
		);
		layer(forest.trees);

		// NextHorizonRenderer.DrawSurfaceLayer(3): sunlight across the trees, from the sun's side.
		const gradient = t['Sunflare/colorgradient'];
		const light = (colors: RGB[], v: number, flip: boolean) => {
			if (!v) return;
			const color = scaleColor(scaleColor(scaleColor([...colors[0], 255] as RGBA, 1), v), 0.6);
			r.drawRect(gradient, 0, -400, W, H + 400, color, flip);
		};
		light(SUNRISES[phase], vis.sunrise, true);
		light(SUNSETS[phase], vis.sunset, false);
	}

	/** NextHorizonRenderer.DrawLensFlare: the sunrise and sunset flares, toward the centre. */
	#drawLensFlare(sun: [number, number], vis: ReturnType<typeof visibilities>) {
		const strength = (v: number) => (v * vis.celestial) ** 3;
		const sunrise = strength(vis.sunrise);
		const sunset = strength(vis.sunset);
		if (sunrise <= 0.01 && sunset <= 0.01) return;
		const r = this.#r;
		r.visibility = this.#sunArea;
		r.use('lens');
		const centre = [this.W / 2, this.H / 2];
		const angle = Math.atan2(centre[1] - sun[1], centre[0] - sun[0]);
		const draw = (flares: Flare[], intensity: number) => {
			if (intensity <= 0.01) return;
			for (const f of flares) {
				const tex = this.#tex[`Sunflare/Lens/${f.tex}`];
				for (let i = 0; i < f.repeat; i++) {
					const scale = f.scale + (f.scaleStep ?? 0) * i;
					const color = scaleColor(scaleColor(f.color, 1 + (f.intensityStep ?? 0) * i), intensity);
					const d = (f.distance + (f.distanceStep ?? 0) * i) % 1;
					const x = sun[0] + (centre[0] - sun[0]) * d * 2;
					const y = sun[1] + (centre[1] - sun[1]) * d * 2;
					// The menu's camera sits a screen above the world (screenPosition.Y = -H).
					const rotation = angle + (f.rotation ?? 0) + (f.rotation ? 0 : -this.H * 0.001);
					r.draw(tex, x, y, color, { rotation, origin: [tex.width / 2, tex.height / 2], scale });
				}
			}
		};
		draw(SUNRISE_FLARE, sunrise);
		draw(SUNSET_FLARE, sunset);
		r.use('sprite');
	}
}
