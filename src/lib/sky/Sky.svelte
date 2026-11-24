<script lang="ts">
	import { onMount } from 'svelte';
	import { devFlags } from '$lib/dev/flags.svelte';
	import { clockToGameTime, gameTime, moonPhase, skyColors, sunOrMoon, type RGB } from './clock';

	/**
	 * The page background: Terraria's main-menu sky, on Sydney time (see ./clock.ts). Drawn on a
	 * canvas behind everything, with the game's textures from the wiki (static/sky/).
	 *
	 * Layers, back to front: sky gradient, stars, sun or moon, clouds, then the forest background
	 * (mountains 7 and 8, tree lines 9, 10 and 11). The sky, clouds and background are multiplied
	 * by the game's sky colour, like the game does.
	 */

	/** The sky texture at noon (untinted), sampled from the game: top, and at the horizon. */
	const SKY_TOP: RGB = [53, 43, 243];
	const SKY_HORIZON: RGB = [105, 145, 248];
	const HORIZON = 0.42;

	/** Forest background layers: where their top sits (fraction of the screen) and drift speed. */
	const LAYERS = [
		{ file: 'bg-7', top: 0.3, speed: 2 },
		{ file: 'bg-8', top: 0.38, speed: 4 },
		{ file: 'bg-9', top: 0.52, speed: 8 },
		{ file: 'bg-10', top: 0.6, speed: 13 },
		{ file: 'bg-11', top: 0.68, speed: 20 }
	];
	const CLOUD_FILES = 18;
	const CLOUD_COUNT = 9;
	const FRAME_MS = 33; // ~30 fps is plenty for slow drifting

	let canvas: HTMLCanvasElement;
	/** Draws a still frame now (reduced motion only; otherwise every frame is drawn anyway). */
	let redraw = () => {};

	// A still sky redraws as soon as the dev panel's time slider moves.
	$effect(() => {
		void devFlags.skyTime;
		redraw();
	});

	const load = (src: string) =>
		new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});

	/** A copy of an image multiplied by a colour, cached until the colour changes. */
	const tints = new WeakMap<HTMLImageElement, { key: string; canvas: HTMLCanvasElement }>();
	function tinted(img: HTMLImageElement, rgb: RGB): HTMLCanvasElement {
		const key = rgb.join();
		const cached = tints.get(img);
		if (cached?.key === key) return cached.canvas;
		const c = cached?.canvas ?? document.createElement('canvas');
		c.width = img.width;
		c.height = img.height;
		const ctx = c.getContext('2d')!;
		ctx.globalCompositeOperation = 'source-over';
		ctx.clearRect(0, 0, c.width, c.height);
		ctx.drawImage(img, 0, 0);
		ctx.globalCompositeOperation = 'multiply';
		ctx.fillStyle = `rgb(${key})`;
		ctx.fillRect(0, 0, c.width, c.height);
		ctx.globalCompositeOperation = 'destination-in'; // keep the image's own transparency
		ctx.drawImage(img, 0, 0);
		tints.set(img, { key, canvas: c });
		return c;
	}

	const times = (a: RGB, b: RGB): string =>
		`rgb(${a.map((v, i) => Math.round((v * b[i]) / 255)).join()})`;

	onMount(() => {
		const ctx = canvas.getContext('2d')!;
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		let stopped = false;
		let timer: ReturnType<typeof setInterval> | undefined;
		let raf = 0;
		let onResize = () => {};
		redraw = () => onResize();

		// Dev tools: the dev panel's sky slider, or ?skytime=21:30, shows another time of day.
		if (__DEV_TOOLS__) {
			const m = new URLSearchParams(location.search).get('skytime')?.match(/^(\d{1,2}):(\d{2})$/);
			if (m) devFlags.skyTime = Number(m[1]) * 3600 + Number(m[2]) * 60;
		}
		const timeNow = (now: Date) =>
			__DEV_TOOLS__ && devFlags.skyTime !== null
				? clockToGameTime(devFlags.skyTime)
				: gameTime(now);

		// Stars and clouds get fixed random places for this visit.
		const stars = Array.from({ length: 140 }, () => ({
			x: Math.random(),
			y: Math.random() * 0.7,
			big: Math.random() < 0.2,
			phase: Math.random() * Math.PI * 2,
			speed: 0.5 + Math.random() * 1.5
		}));
		const clouds = Array.from({ length: CLOUD_COUNT }, () => ({
			file: Math.floor(Math.random() * CLOUD_FILES),
			x: Math.random(),
			y: 0.02 + Math.random() * 0.3,
			speed: 4 + Math.random() * 10,
			scale: 0.7 + Math.random() * 0.5
		}));

		Promise.all([
			Promise.all(LAYERS.map((l) => load(`/sky/${l.file}.png`))),
			Promise.all(Array.from({ length: CLOUD_FILES }, (_, i) => load(`/sky/cloud-${i}.png`))),
			load('/sky/sun.png'),
			Promise.all(Array.from({ length: 8 }, (_, i) => load(`/sky/moon-${i}.png`)))
		]).then(([layerImgs, cloudImgs, sunImg, moonImgs]) => {
			if (stopped) return;
			let last = 0;
			let lastCloudMove = performance.now();

			function draw(ms: number) {
				const dpr = window.devicePixelRatio || 1;
				const w = window.innerWidth;
				const h = window.innerHeight;
				if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
					canvas.width = Math.round(w * dpr);
					canvas.height = Math.round(h * dpr);
				}
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				ctx.imageSmoothingEnabled = false;

				const now = new Date();
				const time = timeNow(now);
				const colors = skyColors(time);
				const sky = colors.sky;
				// Game pixels: the game's positions are for a 1080 px tall screen.
				const k = h / 1080;
				const s = Math.max(0.5, h / 864); // background texture scale (1.25 at 1080p)

				// Sky: the sky texture (a vertical gradient) times the sky colour.
				const grad = ctx.createLinearGradient(0, 0, 0, h);
				grad.addColorStop(0, times(SKY_TOP, sky));
				grad.addColorStop(HORIZON, times(SKY_HORIZON, sky));
				grad.addColorStop(1, times([160, 230, 252], sky));
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, w, h);

				// Stars fade in as the sky darkens.
				const brightness = (sky[0] + sky[1] + sky[2]) / 3;
				const starAlpha = Math.max(0, Math.min(1, (90 - brightness) / 70));
				if (starAlpha > 0) {
					for (const st of stars) {
						const twinkle = reduceMotion
							? 1
							: 0.6 + 0.4 * Math.sin((ms / 1000) * st.speed + st.phase);
						ctx.globalAlpha = starAlpha * twinkle;
						ctx.fillStyle = '#fff';
						const x = Math.round(st.x * w);
						const y = Math.round(st.y * h);
						ctx.fillRect(x, y, 2, 2);
						if (st.big) {
							ctx.fillRect(x - 2, y, 6, 2);
							ctx.fillRect(x, y - 2, 2, 6);
						}
					}
					ctx.globalAlpha = 1;
				}

				// Sun by day, moon by night (in the real moon phase).
				const img = time.dayTime ? sunImg : moonImgs[moonPhase(now)];
				const body = sunOrMoon(time, w / k, img.width);
				const size = img.width * body.scale * k;
				ctx.save();
				ctx.translate(body.x * k, body.y * k);
				ctx.rotate(body.rotation);
				ctx.drawImage(
					tinted(img, time.dayTime ? colors.sun : colors.moon),
					-size / 2,
					-size / 2,
					size,
					size
				);
				ctx.restore();

				// Clouds drift right and wrap around.
				const dt = (ms - lastCloudMove) / 1000;
				lastCloudMove = ms;
				for (const cl of clouds) {
					const cimg = cloudImgs[cl.file];
					const cw = cimg.width * cl.scale * s;
					if (!reduceMotion) cl.x += (cl.speed * dt) / (w + cw);
					if (cl.x > 1) cl.x -= 1;
					const x = cl.x * (w + cw) - cw;
					ctx.drawImage(tinted(cimg, sky), x, cl.y * h, cw, cimg.height * cl.scale * s);
				}

				// Forest background, tiled sideways, drifting slowly like the main menu.
				LAYERS.forEach((layer, i) => {
					const limg = layerImgs[i];
					const tex = tinted(limg, sky);
					const lw = limg.width * s;
					const lh = limg.height * s;
					const y = Math.round(layer.top * h);
					const offset = reduceMotion ? 0 : ((ms / 1000) * layer.speed) % lw;
					for (let x = -offset; x < w; x += lw) {
						ctx.drawImage(tex, Math.floor(x), y, Math.ceil(lw) + 1, lh);
						// Below the texture, carry on with its bottom row.
						if (y + lh < h)
							ctx.drawImage(
								tex,
								0,
								limg.height - 1,
								limg.width,
								1,
								Math.floor(x),
								y + lh,
								Math.ceil(lw) + 1,
								h - y - lh + 1
							);
					}
				});
			}

			if (reduceMotion) {
				// No animation: a still frame, redrawn each minute and on resize.
				onResize = () => draw(0);
				draw(0);
				timer = setInterval(onResize, 60_000);
				window.addEventListener('resize', onResize);
			} else {
				const frame = (ms: number) => {
					if (stopped) return;
					raf = requestAnimationFrame(frame);
					if (ms - last < FRAME_MS) return;
					last = ms;
					draw(ms);
				};
				raf = requestAnimationFrame(frame);
			}
		});

		return () => {
			stopped = true;
			cancelAnimationFrame(raf);
			clearInterval(timer);
			window.removeEventListener('resize', onResize);
		};
	});
</script>

<canvas bind:this={canvas} class="sky" aria-hidden="true"></canvas>

<style>
	.sky {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: -1;
		display: block;
		pointer-events: none;
	}
</style>
