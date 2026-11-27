<script lang="ts">
	import { onMount } from 'svelte';
	import { skyLight } from '$lib/sky/light';
	import { play } from '$lib/sound.svelte';
	import {
		drawFlames,
		drawHits,
		drawThings,
		drawTrees,
		loadTextures,
		nextSeed,
		Terrain,
		type Lit,
		type Textures
	} from '$lib/world/draw';
	import { tileColor } from '$lib/world/light';
	import { World, type Sound } from '$lib/world/sim';
	import { MARGIN } from '$lib/world/tiles';

	/**
	 * A little Terraria world beside the game, just to watch (see $lib/world): a player digs and
	 * builds in a stretch of forest made by the game's own world generation, lit by the page's sky.
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
		let world: World | null = null;
		let textures: Textures | null = null;
		let raf = 0;
		let last = 0;
		let pending = 0;
		let stopped = false;
		// Game-pixel canvases: the scene, and its light (Lighting.GetColor per tile, smoothed).
		const scene = document.createElement('canvas');
		const things = document.createElement('canvas');
		const lightTiles = document.createElement('canvas');
		/** The walls and blocks, kept drawn (see Terrain), and the light map last put in lightTiles. */
		const terrain = new Terrain();
		let lightVersion = -1;
		const light = document.createElement('canvas');

		/** Multiplies `target` by `light`, where `target` has anything drawn (within `box`). */
		const applyLight = (
			target: HTMLCanvasElement,
			[x, y, w, h] = [0, 0, target.width, target.height]
		) => {
			const l = light.getContext('2d')!;
			l.globalCompositeOperation = 'destination-in';
			l.drawImage(target, x, y, w, h, x, y, w, h);
			const ctx = target.getContext('2d')!;
			ctx.globalCompositeOperation = 'multiply';
			ctx.drawImage(light, x, y, w, h, x, y, w, h);
			ctx.globalCompositeOperation = 'source-over';
		};

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
			if (vw < 64 || vh < 128) return false;
			world ??= new World();
			return true;
		};

		/**
		 * Main.screenPosition: centred on the player, kept within the world's shown part. A view
		 * bigger than the world shows it centred, ground at the bottom, and nothing round it.
		 */
		const camera = (world: World) => {
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
			if (!world || !textures) return;
			if (drawCycle === 0) frameSeed = nextSeed(frameSeed);
			drawCycle = (drawCycle + 1) % 5;
			const w = vw;
			const h = vh;
			const cam = camera(world);
			for (const c of [scene, things, light]) {
				if (c.width !== w) c.width = w;
				if (c.height !== h) c.height = h;
			}
			const ctx = scene.getContext('2d')!;
			ctx.imageSmoothingEnabled = false;
			ctx.clearRect(0, 0, w, h);
			terrain.sync(world, textures);
			// The part of the terrain in view (clipped to it: the view can be bigger than the world).
			const sx = Math.max(0, cam.x);
			const sy = Math.max(0, cam.y);
			const sw = Math.min(terrain.canvas.width, cam.x + w) - sx;
			const sh = Math.min(terrain.canvas.height, cam.y + h) - sy;
			if (sw > 0 && sh > 0)
				ctx.drawImage(terrain.canvas, sx, sy, sw, sh, sx - cam.x, sy - cam.y, sw, sh);
			ctx.setTransform(1, 0, 0, 1, -cam.x, -cam.y);
			// The tiles in view (and one more round, for what overhangs into it).
			const view = {
				i0: Math.floor(cam.x / 16) - 1,
				j0: Math.floor(cam.y / 16) - 1,
				i1: Math.ceil((cam.x + w) / 16) + 1,
				j1: Math.ceil((cam.y + h) / 16) + 1
			};
			drawHits(ctx, world, textures);
			ctx.setTransform(1, 0, 0, 1, 0, 0);

			// Light: one pixel per tile, stretched smoothly over the tiles (like the game's
			// corner-blended tile lighting), kept only where something was drawn, multiplied in.
			const lm = world.light;
			if (lm.version !== lightVersion) {
				lightVersion = lm.version;
				lightTiles.width = world.width;
				lightTiles.height = world.height;
				const lctx = lightTiles.getContext('2d')!;
				const img = lctx.createImageData(world.width, world.height);
				for (let i = 0; i < world.width; i++) {
					for (let j = 0; j < world.height; j++) {
						const [r, g, b] = lm.color(i, j);
						const k = (j * world.width + i) * 4;
						img.data[k] = r;
						img.data[k + 1] = g;
						img.data[k + 2] = b;
						img.data[k + 3] = 255;
					}
				}
				lctx.putImageData(img, 0, 0);
			}
			const l = light.getContext('2d')!;
			l.globalCompositeOperation = 'copy';
			l.imageSmoothingEnabled = true;
			l.drawImage(lightTiles, -cam.x, -cam.y, world.width * 16, world.height * 16);
			applyLight(scene);
			// Torch flames, unlit.
			ctx.setTransform(1, 0, 0, 1, -cam.x, -cam.y);
			drawFlames(ctx, world, textures, view, frameSeed);
			ctx.setTransform(1, 0, 0, 1, 0, 0);

			// Trees' tops and branches, then items, the player and dust: each in its own tile's
			// light, drawn on a layer of its own and lit there.
			const tctx = things.getContext('2d')!;
			tctx.imageSmoothingEnabled = false;
			const layer = (paint: (c: CanvasRenderingContext2D) => Lit[]) => {
				tctx.clearRect(0, 0, w, h);
				tctx.setTransform(1, 0, 0, 1, -cam.x, -cam.y);
				const lit = paint(tctx);
				tctx.setTransform(1, 0, 0, 1, 0, 0);
				l.globalCompositeOperation = 'source-over';
				l.clearRect(0, 0, w, h);
				// Lit only where the light is (the area the colours cover, on screen).
				let [x0, y0, x1, y1] = [w, h, 0, 0];
				for (const r of lit) {
					const x = r.x - cam.x;
					const y = r.y - cam.y;
					l.fillStyle = `rgb(${lm.color(r.i, r.j).join()})`;
					l.fillRect(x, y, r.w, r.h);
					[x0, y0] = [Math.min(x0, x), Math.min(y0, y)];
					[x1, y1] = [Math.max(x1, x + r.w), Math.max(y1, y + r.h)];
				}
				[x0, y0] = [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0))];
				[x1, y1] = [Math.min(w, Math.ceil(x1)), Math.min(h, Math.ceil(y1))];
				if (x1 > x0 && y1 > y0) applyLight(things, [x0, y0, x1 - x0, y1 - y0]);
				ctx.drawImage(things, 0, 0);
			};
			layer((c) => drawTrees(c, world!, textures!, view));
			layer((c) => drawThings(c, world!, textures!));

			// Onto the page, at whole device pixels per game pixel where possible.
			const k = Math.max(1, Math.round(devicePixelRatio || 1));
			if (canvas.width !== w * k) canvas.width = w * k;
			if (canvas.height !== h * k) canvas.height = h * k;
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
			const out = canvas.getContext('2d')!;
			out.imageSmoothingEnabled = false;
			out.clearRect(0, 0, canvas.width, canvas.height);
			out.drawImage(scene, 0, 0, w * k, h * k);
		};

		const step = () => world!.update(tileColor(skyLight.color), sound);

		const loop = (now: number) => {
			if (stopped) return;
			raf = requestAnimationFrame(loop);
			if (!world) return;
			pending = Math.min(pending + now - last, STEP_MS * 4);
			last = now;
			while (pending >= STEP_MS) {
				step();
				pending -= STEP_MS;
			}
			draw();
		};

		// Only runs while the column is showing (it's hidden on narrow screens).
		const observer = new ResizeObserver(() => {
			if (!fit()) {
				cancelAnimationFrame(raf);
				raf = 0;
				return;
			}
			if (reduceMotion) {
				step();
				draw();
			} else if (!raf && textures) {
				last = performance.now();
				raf = requestAnimationFrame(loop);
			}
		});
		loadTextures().then((t) => {
			if (stopped) return;
			textures = t;
			observer.observe(box);
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
