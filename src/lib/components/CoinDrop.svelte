<script lang="ts">
	import { tick } from 'svelte';
	import { COIN_VALUE, type Coin } from '$lib/money';
	import { collected, purse, type Drop } from '$lib/purse.svelte';
	import { play } from '$lib/sound.svelte';

	/**
	 * Coins dropped by a win, like an enemy's coin drop: they burst out of the answer, fall onto
	 * the ground (the bottom of the screen), bounce and lie there spinning. Hovering (or tapping)
	 * one picks it up; the rest are picked up by themselves after a few seconds, each at its own
	 * random moment. A picked-up coin flies to its slot in the coin counter.
	 */
	const GRAVITY = 1800; // px/s²
	const SCALE = 2; // the coin sprites are drawn at 2x, like the game's items
	const SIZE: Record<Coin, [number, number]> = {
		copper: [12, 12],
		silver: [12, 14],
		gold: [12, 16],
		platinum: [14, 16]
	};

	interface Sprite {
		id: number;
		coin: Coin;
		count: number;
		/** Where it starts, so it never shows in the corner before its first frame. */
		start: string;
	}
	interface Motion {
		x: number;
		y: number;
		vx: number;
		vy: number;
		w: number;
		h: number;
		flying: boolean;
		speed: number;
		collectAt: number;
	}

	let sprites = $state<Sprite[]>([]);
	/** Physics for each sprite, updated every frame (not reactive: the frame loop moves elements). */
	const motion: Record<number, Motion> = {};
	const elements: Record<number, HTMLImageElement> = {};
	let nextId = 0;
	let raf = 0;
	let last = 0;

	// Play each queued drop once its burst point is on screen.
	$effect(() => {
		if (!purse.drops.length) return;
		const drops = purse.drops.splice(0);
		tick().then(() => requestAnimationFrame(() => drops.forEach(spawn)));
	});

	function spawn(drop: Drop) {
		const box = document.querySelector(drop.from)?.getBoundingClientRect();
		const cx = box ? box.left + box.width / 2 : innerWidth / 2;
		const cy = box ? box.top + box.height / 2 : innerHeight / 3;
		const now = performance.now();
		for (const stack of drop.stacks) {
			const [w, h] = SIZE[stack.coin].map((n) => n * SCALE);
			const id = nextId++;
			motion[id] = {
				x: cx - w / 2,
				y: cy - h / 2,
				vx: (Math.random() - 0.5) * 560,
				vy: -350 - Math.random() * 450,
				w,
				h,
				flying: false,
				speed: 0,
				collectAt: now + 3000 + Math.random() * 3000
			};
			sprites.push({
				id,
				coin: stack.coin,
				count: stack.count,
				start: `translate(${cx - w / 2}px, ${cy - h / 2}px)`
			});
		}
		if (!raf) {
			last = now;
			raf = requestAnimationFrame(frame);
		}
	}

	function pickUp(id: number) {
		const m = motion[id];
		if (m && !m.flying) {
			m.flying = true;
			m.speed = 250;
		}
	}

	function frame(now: number) {
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		const floor = innerHeight - 4;
		for (const sprite of sprites) {
			const m = motion[sprite.id];
			if (!m.flying && now >= m.collectAt) pickUp(sprite.id);
			if (m.flying) {
				// Pulled to its counter slot, faster and faster.
				const slot = document
					.querySelector(`[data-coin="${sprite.coin}"]`)
					?.getBoundingClientRect();
				const tx = slot ? slot.left + slot.width / 2 - m.w / 2 : m.x;
				const ty = slot ? slot.top + slot.height / 2 - m.h / 2 : -m.h;
				const dx = tx - m.x;
				const dy = ty - m.y;
				const dist = Math.hypot(dx, dy);
				m.speed += 3000 * dt;
				if (dist <= m.speed * dt + 4) {
					arrive(sprite);
					continue;
				}
				m.x += (dx / dist) * m.speed * dt;
				m.y += (dy / dist) * m.speed * dt;
			} else {
				m.vy += GRAVITY * dt;
				m.x += m.vx * dt;
				m.y += m.vy * dt;
				// Off the side walls.
				if (m.x < 0 || m.x > innerWidth - m.w) {
					m.x = Math.max(0, Math.min(innerWidth - m.w, m.x));
					m.vx = -m.vx * 0.5;
				}
				// The ground: bounce, then slide to a stop.
				if (m.y >= floor - m.h) {
					m.y = floor - m.h;
					m.vy = m.vy > 150 ? -m.vy * 0.35 : 0;
					m.vx *= Math.exp(-6 * dt);
				}
			}
			const el = elements[sprite.id];
			if (el) el.style.transform = `translate(${m.x}px, ${m.y}px)`;
		}
		raf = sprites.length ? requestAnimationFrame(frame) : 0;
	}

	function arrive(sprite: Sprite) {
		play('coin', 0.4);
		collected(sprite.count * COIN_VALUE[sprite.coin]);
		delete motion[sprite.id];
		delete elements[sprite.id];
		sprites = sprites.filter((s) => s.id !== sprite.id);
	}
</script>

<div class="drop" aria-hidden="true">
	{#each sprites as sprite (sprite.id)}
		<img
			bind:this={elements[sprite.id]}
			src="/ui/coins/{sprite.coin}.gif"
			alt=""
			width={SIZE[sprite.coin][0] * SCALE}
			height={SIZE[sprite.coin][1] * SCALE}
			style:transform={sprite.start}
			onpointerenter={() => pickUp(sprite.id)}
			onpointerdown={() => pickUp(sprite.id)}
		/>
	{/each}
</div>

<style>
	.drop {
		position: fixed;
		inset: 0;
		z-index: 60;
		pointer-events: none;
	}

	img {
		position: absolute;
		left: 0;
		top: 0;
		pointer-events: auto;
		cursor: pointer;
		image-rendering: pixelated;
		will-change: transform;
	}
</style>
