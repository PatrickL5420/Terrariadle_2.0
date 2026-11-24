<script lang="ts">
	import { onMount } from 'svelte';
	import { devFlags } from '$lib/dev/flags.svelte';
	import { clockToGameTime, gameTime, moonPhase, moonType, skyColors } from './clock';
	import { SpriteRenderer } from './gl';
	import { loadTextures, SkyScene, type Moment } from './scene';

	/**
	 * The page background: Terraria 1.4.5's main-menu sky on Sydney time (see ./clock.ts and
	 * ./scene.ts), drawn with the game's own textures and shaders (static/sky/).
	 *
	 * The game's positions are for its screen in pixels; this draws a screen 1080 game pixels
	 * tall (as wide as the page's shape needs) and scales it to fit, so it always looks like the
	 * menu at 1080p. Without WebGL2 it's just the sky's colour.
	 */
	const GAME_HEIGHT = 1080;
	const STEP_MS = 1000 / 60; // the game updates 60 times a second

	let canvas: HTMLCanvasElement;
	/** Draws a frame now (for a still sky; a moving one draws every frame anyway). */
	let redraw = () => {};

	// A still sky redraws as soon as the dev panel's time slider moves.
	$effect(() => {
		void devFlags.skyTime;
		redraw();
	});

	onMount(() => {
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		let stopped = false;
		let raf = 0;
		let timer: ReturnType<typeof setInterval> | undefined;

		// Dev tools: the dev panel's sky slider, or ?skytime=21:30, shows another time of day.
		if (__DEV_TOOLS__) {
			const m = new URLSearchParams(location.search).get('skytime')?.match(/^(\d{1,2}):(\d{2})$/);
			if (m) devFlags.skyTime = Number(m[1]) * 3600 + Number(m[2]) * 60;
		}
		const moment = (): Moment => {
			const now = new Date();
			return {
				time:
					__DEV_TOOLS__ && devFlags.skyTime !== null
						? clockToGameTime(devFlags.skyTime)
						: gameTime(now),
				moonPhase: moonPhase(now),
				moonType: moonType(now)
			};
		};

		const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
		if (!gl) {
			// No WebGL2: the sky's colour (the sky texture's middle, tinted) is enough.
			const paint = () => {
				const [r, g, b] = skyColors(moment().time, moonPhase()).sky;
				canvas.style.background = `rgb(${(r * 100) >> 8}, ${(g * 135) >> 8}, ${(b * 248) >> 8})`;
			};
			redraw = paint;
			paint();
			timer = setInterval(paint, 60_000);
			return () => clearInterval(timer);
		}

		const renderer = new SpriteRenderer(gl);
		loadTextures(renderer).then((textures) => {
			if (stopped) return;
			const scene = new SkyScene(renderer, textures);

			const frame = () => {
				const dpr = window.devicePixelRatio || 1;
				const w = Math.round(window.innerWidth * dpr);
				const h = Math.round(window.innerHeight * dpr);
				if (canvas.width !== w || canvas.height !== h) {
					canvas.width = w;
					canvas.height = h;
				}
				scene.resize(Math.max(1, Math.round((w / h) * GAME_HEIGHT)), GAME_HEIGHT);
				return moment();
			};

			if (reduceMotion) {
				// No animation: a still frame, redrawn each minute and on resize.
				redraw = () => {
					const m = frame();
					scene.draw(m, canvas.width, canvas.height);
				};
				redraw();
				timer = setInterval(redraw, 60_000);
				window.addEventListener('resize', redraw);
				return;
			}

			let last = performance.now();
			let pending = 0;
			const loop = (ms: number) => {
				if (stopped) return;
				raf = requestAnimationFrame(loop);
				const m = frame();
				// Catch up in 60ths of a second, but don't fast-forward after the tab was hidden.
				pending = Math.min(pending + ms - last, STEP_MS * 4);
				last = ms;
				while (pending >= STEP_MS) {
					scene.update(m.time);
					pending -= STEP_MS;
				}
				scene.draw(m, canvas.width, canvas.height);
			};
			raf = requestAnimationFrame(loop);
		});

		return () => {
			stopped = true;
			cancelAnimationFrame(raf);
			clearInterval(timer);
			window.removeEventListener('resize', redraw);
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
