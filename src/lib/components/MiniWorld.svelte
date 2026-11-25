<script lang="ts">
	import { onMount } from 'svelte';
	import { skyLight } from '$lib/sky/light';
	import { play } from '$lib/sound.svelte';
	import { drawThings, drawTiles, loadTextures, type Textures } from '$lib/world/draw';
	import { tileColor } from '$lib/world/light';
	import { World, type Sound } from '$lib/world/sim';
	import { MARGIN } from '$lib/world/tiles';

	/**
	 * A little Terraria world beside the game, just to watch (see $lib/world): a player digs and
	 * builds in a few columns of ground, lit by the page's sky. Drawn at the game's 1x, one game
	 * pixel per CSS pixel, filling the column it's in, or the whole screen (a bigger world) with
	 * the fullscreen button.
	 */
	const STEP_MS = 1000 / 60;
	/** Sounds from the little world are quieter than the page's own. */
	const VOLUME: Record<Sound, number> = { dig: 0.15, tink: 0.15, swing: 0.1, grab: 0.15 };

	let box: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let wide = $state(false);

	/** Fullscreen: the page goes fullscreen (where it can) and the world fills it. */
	function toggleWide() {
		wide = !wide;
		if (wide) document.documentElement.requestFullscreen?.().catch(() => {});
		else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
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
		const light = document.createElement('canvas');

		/** Multiplies `target` by `light`, where `target` has anything drawn. */
		const applyLight = (target: HTMLCanvasElement) => {
			const l = light.getContext('2d')!;
			l.globalCompositeOperation = 'destination-in';
			l.drawImage(target, 0, 0);
			const ctx = target.getContext('2d')!;
			ctx.globalCompositeOperation = 'multiply';
			ctx.drawImage(light, 0, 0);
			ctx.globalCompositeOperation = 'source-over';
		};

		const sound = (s: Sound) => play(s, VOLUME[s]);

		/** Sizes the world to the column: whole tiles, as many as fit. */
		const fit = () => {
			const cols = Math.floor(box.clientWidth / 16);
			const rows = Math.floor(box.clientHeight / 16);
			if (cols < 4 || rows < 8) return false;
			if (!world || world.cols !== cols) world = new World(cols, rows);
			else world.setHeight(rows);
			return true;
		};

		const draw = () => {
			if (!world || !textures) return;
			// The shown part: the world without its margin (see $lib/world/tiles).
			const w = world.cols * 16;
			const h = world.rows * 16;
			const ox = -MARGIN * 16;
			for (const c of [scene, things, light]) {
				if (c.width !== w) c.width = w;
				if (c.height !== h) c.height = h;
			}
			const ctx = scene.getContext('2d')!;
			ctx.imageSmoothingEnabled = false;
			ctx.clearRect(0, 0, w, h);
			ctx.setTransform(1, 0, 0, 1, ox, 0);
			drawTiles(ctx, world, textures);
			ctx.setTransform(1, 0, 0, 1, 0, 0);

			// Light: one pixel per tile, stretched smoothly over the tiles (like the game's
			// corner-blended tile lighting), kept only where something was drawn, multiplied in.
			const lm = world.light;
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
			const l = light.getContext('2d')!;
			l.globalCompositeOperation = 'copy';
			l.imageSmoothingEnabled = true;
			l.drawImage(lightTiles, ox, 0, world.width * 16, world.height * 16);
			applyLight(scene);

			// Items, the player and dust: each in its own tile's light.
			const tctx = things.getContext('2d')!;
			tctx.imageSmoothingEnabled = false;
			tctx.clearRect(0, 0, w, h);
			tctx.setTransform(1, 0, 0, 1, ox, 0);
			const lit = drawThings(tctx, world, textures);
			tctx.setTransform(1, 0, 0, 1, 0, 0);
			l.globalCompositeOperation = 'source-over';
			l.clearRect(0, 0, w, h);
			for (const r of lit) {
				l.fillStyle = `rgb(${lm.color(r.i, r.j).join()})`;
				l.fillRect(r.x + ox, r.y, r.w, r.h);
			}
			applyLight(things);
			ctx.drawImage(things, 0, 0);

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

		// Leaving fullscreen (Esc) leaves the wide view too.
		const onFullscreen = () => {
			if (!document.fullscreenElement) wide = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && wide && !document.fullscreenElement) wide = false;
		};
		document.addEventListener('fullscreenchange', onFullscreen);
		addEventListener('keydown', onKey);

		return () => {
			stopped = true;
			cancelAnimationFrame(raf);
			observer.disconnect();
			document.removeEventListener('fullscreenchange', onFullscreen);
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

	.wide canvas {
		left: 50%;
		transform: translateX(-50%);
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
