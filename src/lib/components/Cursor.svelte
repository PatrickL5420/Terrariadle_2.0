<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Terraria 1.4.5's mouse cursor, in place of the browser's (mice only): Main.CursorColor
	 * pulses its colour and size, Main.DrawThickCursor draws the border (on by default) and
	 * Main.DrawCursor the shadow and the pointer. Textures from the game: UI/Cursor_0 and _11.
	 */
	const MOUSE_COLOR = [255, 50, 95]; // Main.mouseColor
	const BORDER = [64, 64, 64, 64]; // Main.MouseBorderColor

	let canvas: HTMLCanvasElement;

	onMount(() => {
		if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
		let mouse: { x: number; y: number } | null = null;
		let raf = 0;
		let alpha = 1; // Main.cursorAlpha
		let direction = -1; // Main.cursorColorDirection
		const pointer = new Image();
		const border = new Image();
		pointer.src = '/ui/cursor/Cursor_0.png';
		border.src = '/ui/cursor/Cursor_11.png';
		const scratch = document.createElement('canvas');

		/** SpriteBatch.Draw with a (premultiplied) XNA colour, at its top-left minus `origin`. */
		const draw = (
			ctx: CanvasRenderingContext2D,
			img: HTMLImageElement,
			x: number,
			y: number,
			[r, g, b, a]: number[],
			scale: number,
			origin = 0
		) => {
			if (!a) return;
			const w = img.naturalWidth;
			const h = img.naturalHeight;
			scratch.width = w;
			scratch.height = h;
			const s = scratch.getContext('2d')!;
			s.drawImage(img, 0, 0);
			// The texture times the colour: straight-alpha RGB of the premultiplied colour.
			s.globalCompositeOperation = 'multiply';
			s.fillStyle = `rgb(${[r, g, b].map((v) => Math.min(255, (v * 255) / a)).join()})`;
			s.fillRect(0, 0, w, h);
			s.globalCompositeOperation = 'destination-in';
			s.drawImage(img, 0, 0);
			ctx.globalAlpha = a / 255;
			ctx.drawImage(scratch, x - origin * scale, y - origin * scale, w * scale, h * scale);
			ctx.globalAlpha = 1;
		};

		const frame = () => {
			// Runs while the mouse is on the page.
			raf = mouse ? requestAnimationFrame(frame) : 0;
			// Main.CursorColor (once a frame).
			alpha += direction * 0.015;
			if (alpha >= 1) {
				alpha = 1;
				direction = -1;
			}
			if (alpha <= 0.6) {
				alpha = 0.6;
				direction = 1;
			}
			const color = [
				...MOUSE_COLOR.map((v) => Math.trunc(v * alpha)),
				Math.trunc(255 * (alpha * 0.3 + 0.7))
			];
			const scale = alpha * 0.3 + 0.7 + 0.1;

			const dpr = devicePixelRatio || 1;
			const w = Math.round(innerWidth * dpr);
			const h = Math.round(innerHeight * dpr);
			if (canvas.width !== w) canvas.width = w;
			if (canvas.height !== h) canvas.height = h;
			const ctx = canvas.getContext('2d')!;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, w, h);
			// Like the game, no cursor while the sun or moon is held.
			if (!mouse || !pointer.complete || !border.complete) return;
			if (document.documentElement.classList.contains('sky-grabbing')) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.imageSmoothingEnabled = false;
			const { x, y } = mouse;
			// The border: Cursor_11 four times, a pixel each way.
			for (const [dx, dy] of [
				[0, 1],
				[1, 0],
				[0, -1],
				[-1, 0]
			])
				draw(ctx, border, x + dx + 2, y + dy + 2, BORDER, scale * 1.1, 2);
			// The shadow, then the pointer, 2 px in from the mouse.
			const [r, g, b, a] = color;
			const shadow = [r * 0.2, g * 0.2, b * 0.2, a * 0.5].map(Math.trunc);
			draw(ctx, pointer, x + 3, y + 3, shadow, scale * 1.1);
			draw(ctx, pointer, x + 2, y + 2, color, scale);
		};

		const move = (e: PointerEvent) => {
			if (e.pointerType !== 'mouse') return;
			mouse = { x: e.clientX, y: e.clientY };
			document.documentElement.classList.add('game-cursor');
			if (!raf) raf = requestAnimationFrame(frame);
		};
		const leave = (e: MouseEvent) => {
			if (e.relatedTarget) return;
			mouse = null;
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerdown', move);
		document.addEventListener('mouseout', leave);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerdown', move);
			document.removeEventListener('mouseout', leave);
			document.documentElement.classList.remove('game-cursor');
		};
	});
</script>

<canvas bind:this={canvas} class="cursor" aria-hidden="true"></canvas>

<style>
	.cursor {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 10000;
		pointer-events: none;
	}

	/* The game's cursor replaces the browser's once a mouse moves. */
	:global(html.game-cursor),
	:global(html.game-cursor *) {
		cursor: none !important;
	}
</style>
