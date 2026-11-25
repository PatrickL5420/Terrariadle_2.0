<script lang="ts">
	import { onMount } from 'svelte';
	import { devFlags } from '$lib/dev/flags.svelte';
	import { secondsSinceMidnight } from '$lib/engine/daily';
	import {
		clockToGameTime,
		forestStyle,
		moonPhase,
		moonType,
		skyColors,
		type GameTime
	} from './clock';
	import { SpriteRenderer } from './gl';
	import { skyLight } from './light';
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
	const DAWN = 4.5 * 3600;
	const DUSK = 19.5 * 3600;
	/** Things the mouse can use, so pressing on them doesn't grab the sun. */
	const INTERACTIVE =
		'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable], .ui-panel, dialog';

	/** How far the sun or moon has been dragged from the real time, in seconds (this visit). */
	let dragOffset = 0;

	let canvas: HTMLCanvasElement;
	/** Draws a frame now (for a still sky; a moving one draws every frame anyway). */
	let redraw = () => {};

	// A still sky redraws as soon as the dev panel's time slider moves.
	$effect(() => {
		void devFlags.skyTime;
		void devFlags.skyForest;
		redraw();
	});

	onMount(() => {
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		let stopped = false;
		let raf = 0;
		let timer: ReturnType<typeof setInterval> | undefined;
		let removeListeners = () => {};

		// Dev tools: the dev panel's sky controls, or ?skytime=21:30 and ?skyforest=7, show another
		// time of day or forest style.
		if (__DEV_TOOLS__) {
			const m = new URLSearchParams(location.search).get('skytime')?.match(/^(\d{1,2}):(\d{2})$/);
			if (m) devFlags.skyTime = Number(m[1]) * 3600 + Number(m[2]) * 60;
			const forest = new URLSearchParams(location.search).get('skyforest');
			if (forest) devFlags.skyForest = Number(forest);
		}
		const devTime = () => __DEV_TOOLS__ && devFlags.skyTime !== null;
		const moment = (): Moment => {
			const now = new Date();
			const seconds = devTime()
				? devFlags.skyTime!
				: (secondsSinceMidnight(now) + dragOffset + 86_400) % 86_400;
			return {
				time: clockToGameTime(seconds),
				moonPhase: moonPhase(now),
				moonType: moonType(now),
				forest: __DEV_TOOLS__ && devFlags.skyForest !== null ? devFlags.skyForest : forestStyle(now)
			};
		};
		/** Dragging the sun or moon moves the time (the dev panel's, or this visit's). */
		const dragTo = (t: GameTime) => {
			const seconds = Math.round(t.dayTime ? DAWN + t.time : (DUSK + t.time) % 86_400);
			if (devTime()) devFlags.skyTime = seconds;
			else dragOffset = seconds - secondsSinceMidnight();
		};

		const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
		if (!gl) {
			// No WebGL2: the sky's colour (the sky texture's middle, tinted) is enough.
			const paint = () => {
				const [r, g, b] = (skyLight.color = skyColors(moment().time, moonPhase()).sky);
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
			scene.onDrag = dragTo;

			// The mouse, held down on the sky (not on the page's buttons or panels).
			let held = false;
			const toGame = (e: PointerEvent) => ({
				x: (e.clientX / window.innerWidth) * scene.W,
				y: (e.clientY / window.innerHeight) * scene.H
			});
			const onDown = (e: PointerEvent) => {
				if (e.button !== 0 || (e.target as Element | null)?.closest?.(INTERACTIVE)) return;
				held = true;
				scene.pointer = toGame(e);
				redraw();
			};
			const onMove = (e: PointerEvent) => {
				if (!held) return;
				// Over the page's UI the mouse can't take hold of the sun (but keeps what it holds).
				const overUi = !!(e.target as Element | null)?.closest?.(INTERACTIVE);
				scene.pointer = overUi && !scene.grabbing ? null : toGame(e);
				// Like the game's mouseInterface: while the sun or moon is held, the page's UI doesn't
				// react to the mouse (no hovers, no clicks, no text selection).
				document.documentElement.classList.toggle('sky-grabbing', scene.grabbing);
				redraw();
			};
			const onUp = () => {
				held = false;
				scene.pointer = null;
				scene.grabbing = false;
				document.documentElement.classList.remove('sky-grabbing');
			};
			window.addEventListener('pointerdown', onDown);
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
			window.addEventListener('pointercancel', onUp);
			removeListeners = () => {
				window.removeEventListener('pointerdown', onDown);
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
				window.removeEventListener('pointercancel', onUp);
			};

			const frame = () => {
				const dpr = window.devicePixelRatio || 1;
				const w = Math.round(window.innerWidth * dpr);
				const h = Math.round(window.innerHeight * dpr);
				if (canvas.width !== w || canvas.height !== h) {
					canvas.width = w;
					canvas.height = h;
				}
				scene.resize(Math.max(1, Math.round((w / h) * GAME_HEIGHT)), GAME_HEIGHT);
				const m = moment();
				scene.loadStyle(m.forest)?.then(() => redraw());
				skyLight.color = skyColors(m.time, m.moonPhase).sky;
				return m;
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
			removeListeners();
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
