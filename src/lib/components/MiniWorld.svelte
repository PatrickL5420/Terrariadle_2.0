<script lang="ts">
	import { onMount } from 'svelte';
	import { skyLight } from '$lib/sky/light';
	import { play } from '$lib/sound.svelte';
	import { SpriteRenderer, type Texture } from '$lib/gl/sprites';
	import { drawWorld, lightBytes, loadTextures, nextSeed, type Textures } from '$lib/world/draw';
	import { tileColor } from '$lib/world/light';
	import type { Sound } from '$lib/world/sim';
	import { MARGIN } from '$lib/world/tiles';
	import { Mirror, type Frame, type Scene } from '$lib/world/view';
	import type { Request } from '$lib/world/worker';
	import WorldWorker from '$lib/world/worker?worker';

	/**
	 * A little Terraria world beside the game, just to watch (see $lib/world): a player digs and
	 * builds in a stretch of forest made by the game's own world generation, lit by the page's sky.
	 * The world runs in a worker ($lib/world/worker), and is drawn here from what it sends back
	 * ($lib/world/view). It only runs while it's on screen.
	 * Drawn at the game's 1x, one game pixel per CSS pixel: the column it's in, or the whole
	 * window with the fullscreen button, shows part of it, following the player like the game's
	 * camera.
	 */
	const STEP_MS = 1000 / 60;
	/** Sounds from the little world are quieter than the page's own. */
	const VOLUME: Record<Sound, number> = { dig: 0.15, tink: 0.15, swing: 0.1, grab: 0.15 };

	let box: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let wide = $state(false);

	/** Fullscreen: the world fills the window (not the browser's fullscreen). */
	function toggleWide() {
		wide = !wide;
	}

	// The rest of the page hides behind it (see +layout.svelte), leaving the sky.
	$effect(() => {
		document.body.classList.toggle('world-wide', wide);
		return () => document.body.classList.remove('world-wide');
	});

	onMount(() => {
		const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		let world: Mirror | null = null;
		let textures: Textures | null = null;
		let raf = 0;
		let last = 0;
		let pending = 0;
		let stopped = false;
		/** Whether it's on screen (not scrolled off), and a size it can be drawn at. */
		let onScreen = true;
		let fits = false;
		/** The worker, and whether it's busy with the last steps asked for. */
		let worker: Worker | null = null;
		let busy = false;
		// The game's SpriteBatch on the canvas ($lib/gl/sprites, shared with the sky), and the light
		// map as a texture (a texel per tile), uploaded when it's worked out again.
		const gl = canvas.getContext('webgl2', { antialias: false });
		const renderer = gl ? new SpriteRenderer(gl) : null;
		let light: Texture | undefined;
		let lightData: Uint8Array | undefined;
		let lightVersion = -1;

		const sound = (s: Sound) => play(s, VOLUME[s]);

		/** The view's size, in game pixels (the column, or the screen). */
		let vw = 0;
		let vh = 0;

		/**
		 * The world is made once (150 blocks wide, see $lib/world/sim) and kept: the column and
		 * the fullscreen view show part of it, following the player. Returns whether there's a view.
		 */
		const fit = () => {
			vw = Math.floor(box.clientWidth);
			vh = Math.floor(box.clientHeight);
			return vw >= 64 && vh >= 128;
		};

		/** Asks the worker for `steps` more steps (0 just to hear how it is). */
		const ask = (steps: number) => {
			if (!worker) {
				worker = new WorldWorker();
				worker.onmessage = (e: MessageEvent<Frame>) => {
					busy = false;
					if (world) world.apply(e.data);
					else world = new Mirror(e.data);
					for (const s of e.data.sounds) sound(s);
					if (reduceMotion) draw();
				};
			}
			busy = true;
			worker.postMessage({ steps, sky: tileColor(skyLight.color) } satisfies Request);
		};

		/**
		 * Main.screenPosition: centred on the player, kept within the world's shown part. A view
		 * bigger than the world shows it centred, ground at the bottom, and nothing round it.
		 */
		const camera = (world: Scene) => {
			const left = MARGIN * 16;
			const width = world.cols * 16;
			const height = world.rows * 16;
			const p = world.player;
			const c = p.center;
			let x = c.x - vw / 2;
			let y = c.y + p.gfxOffY - vh / 2;
			x = vw >= width ? left - (vw - width) / 2 : Math.min(Math.max(x, left), left + width - vw);
			y = vh >= height ? height - vh : Math.min(Math.max(y, 0), height - vh);
			return { x: Math.round(x), y: Math.round(y) };
		};

		/** Main.TileFrameSeed: torch flames' flicker, moved on every 5th draw. */
		let frameSeed = BigInt(Math.floor(Math.random() * 2 ** 32));
		let drawCycle = 0;

		const draw = () => {
			if (!world || !textures || !renderer) return;
			if (drawCycle === 0) frameSeed = nextSeed(frameSeed);
			drawCycle = (drawCycle + 1) % 5;
			const w = vw;
			const h = vh;
			const cam = camera(world);
			// At whole device pixels per game pixel where possible.
			const k = Math.max(1, Math.round(devicePixelRatio || 1));
			if (canvas.width !== w * k) canvas.width = w * k;
			if (canvas.height !== h * k) canvas.height = h * k;
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
			const lm = world.light;
			if (lm.version !== lightVersion || !light) {
				lightVersion = lm.version;
				lightData = lightBytes(lm, lightData);
				light = renderer.data(lm.width, lm.height, lightData, true, light);
			}
			renderer.begin(null, canvas.width, canvas.height, [0, 0, 0, 0]);
			renderer.transform(k, -cam.x * k, -cam.y * k);
			// The tiles in view (and one more round, for what overhangs into it).
			const view = {
				i0: Math.floor(cam.x / 16) - 1,
				j0: Math.floor(cam.y / 16) - 1,
				i1: Math.ceil((cam.x + w) / 16) + 1,
				j1: Math.ceil((cam.y + h) / 16) + 1
			};
			drawWorld(renderer, world, textures, view, light, frameSeed);
		};

		const loop = (now: number) => {
			if (stopped) return;
			raf = requestAnimationFrame(loop);
			// The steps due (no more than 4 frames' worth: a slow frame isn't caught up on), asked
			// for once the worker's done with the last.
			pending = Math.min(pending + now - last, STEP_MS * 4);
			last = now;
			const steps = Math.floor(pending / STEP_MS);
			if (!busy && steps > 0) {
				ask(steps);
				pending -= steps * STEP_MS;
			}
			draw();
		};

		/** Runs while it's showing (the column is hidden on narrow screens, and while closed) and
		 * on screen; otherwise it's paused, the world kept. */
		const run = () => {
			if (!textures || stopped) return;
			if (!fits || !onScreen) {
				cancelAnimationFrame(raf);
				raf = 0;
			} else if (reduceMotion) {
				if (!busy) ask(1);
			} else if (!raf) {
				last = performance.now();
				raf = requestAnimationFrame(loop);
			}
		};
		const observer = new ResizeObserver(() => {
			fits = fit();
			run();
		});
		const seen = new IntersectionObserver(([e]) => {
			onScreen = e.isIntersecting;
			run();
		});
		// Without WebGL2 there's no world to see (only the sky's colour, as the sky does).
		if (renderer)
			loadTextures(renderer).then((t) => {
				if (stopped) return;
				textures = t;
				observer.observe(box);
				seen.observe(box);
			});

		// Esc goes back to the column.
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && wide) wide = false;
		};
		addEventListener('keydown', onKey);

		return () => {
			stopped = true;
			cancelAnimationFrame(raf);
			observer.disconnect();
			seen.disconnect();
			worker?.terminate();
			removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="world" class:wide bind:this={box}>
	<canvas bind:this={canvas} aria-hidden="true"></canvas>
	<button
		class="fullscreen"
		aria-label={wide ? 'Exit fullscreen' : 'Fullscreen'}
		aria-pressed={wide}
		title={wide ? 'Exit fullscreen' : 'Fullscreen'}
		onclick={toggleWide}
	>
		<svg viewBox="0 0 9 9" width="18" height="18" aria-hidden="true">
			{#if wide}
				<path d="M3 0h1v4H0V3h3zM5 0h1v3h3v1H5zM0 5h4v4H3V6H0zM5 5h4v1H6v3H5z" />
			{:else}
				<path d="M0 0h4v1H1v3H0zM5 0h4v4H8V1H5zM0 5h1v3h3v1H0zM8 5h1v4H5V8h3z" />
			{/if}
		</svg>
	</button>
</div>

<style>
	.world {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	/* Over the whole screen, the page's sky behind it. */
	.world.wide {
		position: fixed;
		inset: 0;
		z-index: 100;
	}

	/* The ground sits at the bottom of the column. */
	canvas {
		position: absolute;
		left: 0;
		bottom: 0;
		image-rendering: pixelated;
	}

	.fullscreen {
		position: absolute;
		top: 4px;
		right: 4px;
		display: flex;
		padding: 5px;
		background: rgb(0 0 0 / 0.35);
		border: none;
		border-radius: 4px;
		color: #fff;
		cursor: pointer;
		opacity: 0.6;
	}

	.fullscreen:hover,
	.fullscreen:focus-visible {
		opacity: 1;
	}

	.fullscreen svg {
		display: block;
		fill: currentColor;
		shape-rendering: crispEdges;
	}
</style>
