<script lang="ts">
	import { tick } from 'svelte';
	import { COIN_ORDER, CoinWorld, type Box, type Player, type WorldCoin } from '$lib/coins/world';
	import { COIN_VALUE, type Coin } from '$lib/money';
	import { collected, purse, type Drop } from '$lib/purse.svelte';
	import { play } from '$lib/sound.svelte';

	/**
	 * Coins dropped by a win, exactly like an enemy's coin drop in Terraria 1.4.5 (see
	 * $lib/coins/world): the money splits into stacks that burst out of the answer, fall to the
	 * ground (the bottom of the screen), spin and sparkle. The mouse cursor is the player: coins
	 * near it are pulled in and picked up, with the game's coin sound and pickup text. Coins left
	 * lying fly to the coin counter by themselves after a few seconds.
	 *
	 * Textures from the game: Images/Coin_0-3 (the spinning coins) and Images/Dust (sparkles).
	 */
	const SCALE = 2; // game pixels -> CSS pixels, like the game's 2x zoomed sprites
	const STEP_MS = 1000 / 60;
	/** Frames before a coin left lying flies to the counter by itself (3-6 seconds). */
	const autoCollect = () => 180 + Math.floor(Math.random() * 180);
	/** Pickup text: the game's mouse text, in CSS pixels. */
	const FONT_PX = 22;
	/** Dust 244-247: their 8x8 frames in the dust sheet. */
	const DUST_X: Record<Coin, number> = { copper: 440, silver: 450, gold: 460, platinum: 470 };

	let canvas: HTMLCanvasElement;
	const images = {} as Record<Coin, HTMLImageElement>;
	let dustSheet: HTMLImageElement;
	let world: CoinWorld | null = null;
	let raf = 0;
	let last = 0;
	let pending = 0;

	/** The cursor, in CSS pixels, and where it was last frame (null when it's off the page). */
	let cursor: { x: number; y: number } | null = null;
	let lastCursor: { x: number; y: number } | null = null;

	const load = (src: string) => {
		const img = new Image();
		img.src = src;
		return img;
	};

	// Play each queued drop once its burst point is on screen.
	$effect(() => {
		if (!purse.drops.length) return;
		const drops = purse.drops.splice(0);
		tick().then(() => requestAnimationFrame(() => drops.forEach(spawn)));
	});

	$effect(() => {
		const move = (e: PointerEvent) => (cursor = { x: e.clientX, y: e.clientY });
		// A mouse leaving the window, or a finger lifting, takes the "player" away.
		const leave = (e: PointerEvent | MouseEvent) => {
			if ('pointerType' in e && e.pointerType === 'mouse') return;
			cursor = null;
		};
		const out = (e: MouseEvent) => {
			if (!e.relatedTarget) cursor = null;
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerdown', move);
		window.addEventListener('pointerup', leave);
		window.addEventListener('pointercancel', leave);
		document.addEventListener('mouseout', out);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerdown', move);
			window.removeEventListener('pointerup', leave);
			window.removeEventListener('pointercancel', leave);
			document.removeEventListener('mouseout', out);
		};
	});

	/** Measures pickup text, in game pixels. */
	function measure(text: string): [number, number] {
		const ctx = canvas.getContext('2d')!;
		ctx.font = `${FONT_PX}px Andy, sans-serif`;
		return [ctx.measureText(text).width / SCALE, (FONT_PX * 1.1) / SCALE];
	}

	function spawn(drop: Drop) {
		if (!world) {
			for (const [i, coin] of COIN_ORDER.entries()) images[coin] = load(`/ui/coins/Coin_${i}.png`);
			dustSheet = load('/ui/dust/Dust.png');
			world = new CoinWorld(innerWidth / SCALE, innerHeight / SCALE, measure);
		}
		const box = drop.from ? document.querySelector(drop.from)?.getBoundingClientRect() : undefined;
		const cx = box ? box.left + box.width / 2 : innerWidth / 2;
		const cy = box ? box.top + box.height / 2 : innerHeight / 3;
		world.drop(drop.stacks, cx / SCALE, cy / SCALE, autoCollect);
		if (!raf) {
			last = performance.now();
			pending = 0;
			raf = requestAnimationFrame(frame);
		}
	}

	/** The coin counter's slot for a coin, in game pixels. */
	function slot(coin: Coin): Box | undefined {
		const r = document.querySelector(`[data-coin="${coin}"]`)?.getBoundingClientRect();
		if (!r || !r.width) return;
		return { x: r.left / SCALE, y: r.top / SCALE, w: r.width / SCALE, h: r.height / SCALE };
	}

	function pickedUp(coin: Coin, stack: number) {
		// SoundEngine.PlaySound(38): one of five coin sounds, pitch -0.08 to +0.08 octaves.
		play('coin', 0.5, (Math.floor(Math.random() * 81) - 40) * 0.002);
		collected(stack * COIN_VALUE[coin]);
	}

	function frame(now: number) {
		const w = world!;
		w.width = innerWidth / SCALE;
		w.height = innerHeight / SCALE;
		pending = Math.min(pending + now - last, STEP_MS * 4);
		last = now;
		while (pending >= STEP_MS) {
			pending -= STEP_MS;
			let player: Player | null = null;
			if (cursor) {
				const from = lastCursor ?? cursor;
				player = {
					x: cursor.x / SCALE,
					y: cursor.y / SCALE,
					vx: (cursor.x - from.x) / SCALE,
					vy: (cursor.y - from.y) / SCALE
				};
			}
			lastCursor = cursor;
			w.update(player, slot, pickedUp);
		}
		draw(w);
		raf = w.coins.length || w.sparkles.length || w.popups.length ? requestAnimationFrame(frame) : 0;
		if (!raf) clear();
	}

	function context() {
		const dpr = devicePixelRatio || 1;
		if (canvas.width !== Math.round(innerWidth * dpr)) canvas.width = Math.round(innerWidth * dpr);
		if (canvas.height !== Math.round(innerHeight * dpr))
			canvas.height = Math.round(innerHeight * dpr);
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, innerWidth, innerHeight);
		return ctx;
	}

	function clear() {
		context();
	}

	function draw(w: CoinWorld) {
		const ctx = context();
		for (const c of w.coins) drawCoin(ctx, c);

		// Sparkles: drawn additively, white (Dust.GetAlpha for 244-247).
		ctx.globalCompositeOperation = 'lighter';
		for (const d of w.sparkles) {
			if (!dustSheet.complete) break;
			ctx.save();
			ctx.translate(d.x * SCALE, d.y * SCALE);
			ctx.rotate(d.rotation);
			ctx.scale(d.scale * SCALE, d.scale * SCALE);
			ctx.drawImage(dustSheet, DUST_X[d.coin], 60 + d.frame * 10, 8, 8, -4, -4, 8, 8);
			ctx.restore();
		}
		ctx.globalCompositeOperation = 'source-over';

		// Pickup text (PopupText): coloured by the highest coin, outlined in black.
		ctx.font = `${FONT_PX}px Andy, sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		for (const p of w.popups) {
			const [tw, th] = measure(p.text);
			const k = p.scale * p.alpha;
			ctx.save();
			ctx.translate((p.x + tw / 2) * SCALE, (p.y + th / 2) * SCALE);
			ctx.scale(p.scale, p.scale);
			ctx.globalAlpha = Math.max(0, Math.min(1, k));
			ctx.fillStyle = '#000';
			for (const [ox, oy] of [
				[-2, 0],
				[2, 0],
				[0, -2],
				[0, 2]
			])
				ctx.fillText(p.text, ox, oy);
			ctx.fillStyle = `rgb(${p.color.join()})`;
			ctx.fillText(p.text, 0, 0);
			ctx.restore();
		}
	}

	/** Main.DrawItem for a coin: its spinning frame, standing on its hitbox, tilted as it moves. */
	function drawCoin(ctx: CanvasRenderingContext2D, c: WorldCoin) {
		const img = images[c.coin];
		if (!img.complete || !img.naturalWidth) return;
		// DrawAnimationVertical(6, 8): 8 frames, each with 2 px of padding left off.
		const fw = img.naturalWidth;
		const step = img.naturalHeight / 8;
		const fh = step - 2;
		const frameIndex = Math.trunc(c.frameCounter / 6);
		ctx.save();
		ctx.translate((c.x + c.w / 2) * SCALE, (c.y + c.h - fh / 2) * SCALE);
		ctx.rotate(c.vx * 0.2);
		ctx.drawImage(
			img,
			0,
			frameIndex * step,
			fw,
			fh,
			(-fw / 2) * SCALE,
			(-fh / 2) * SCALE,
			fw * SCALE,
			fh * SCALE
		);
		ctx.restore();
	}
</script>

<canvas bind:this={canvas} class="drop" aria-hidden="true"></canvas>

<style>
	.drop {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 60;
		pointer-events: none;
	}
</style>
