<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';
	import { COINS, splitCoins, type Coin } from '$lib/money';
	import { COIN_ORDER } from '$lib/coins/world';
	import { CoinSlotAnim, JUMP_HEIGHT } from '$lib/coins/slot';
	import { dayTotal } from '$lib/progress.svelte';
	import { purse } from '$lib/purse.svelte';
	import { audio, toggleMute } from '$lib/sound.svelte';

	/**
	 * Today's coins, like the game's savings display: each coin in a slot with its count. When a
	 * count changes the number swells and the coin hops and spins (1.4.5's CoinSlot animation),
	 * drawn with the game's spinning coin frames (Images/Coin_0-3). Coins still on the ground
	 * ($lib/purse) aren't counted until they're collected.
	 */
	const SCALE = 2;
	const split = $derived(splitCoins(dayTotal() - purse.pending));

	const anims = {} as Record<Coin, CoinSlotAnim>;
	const canvases = {} as Record<Coin, HTMLCanvasElement>;
	let textScale = $state({ platinum: 1, gold: 1, silver: 1, copper: 1 } as Record<Coin, number>);
	const images = {} as Record<Coin, HTMLImageElement>;
	let raf = 0;

	$effect(() => {
		for (const [i, coin] of COIN_ORDER.entries()) {
			const img = new Image();
			img.onload = () => draw(coin);
			img.src = `/ui/coins/Coin_${i}.png`;
			images[coin] = img;
		}
		return () => cancelAnimationFrame(raf);
	});

	// A new count starts the coin's animation.
	$effect(() => {
		for (const coin of COINS) {
			const count = split[coin];
			if (!anims[coin]) anims[coin] = new CoinSlotAnim(count);
			else anims[coin].set(count);
		}
		if (!raf) raf = requestAnimationFrame(step);
	});

	let last = 0;
	function step(now: number) {
		// One animation step per game frame (60 a second).
		const steps = last ? Math.min(4, Math.round((now - last) / (1000 / 60))) : 1;
		last = now;
		for (const coin of COINS) {
			for (let i = 0; i < steps; i++) {
				anims[coin].set(split[coin]);
				anims[coin].step();
			}
			draw(coin);
			textScale[coin] = anims[coin].state.textScale;
		}
		if (COINS.some((c) => anims[c].busy)) raf = requestAnimationFrame(step);
		else {
			raf = 0;
			last = 0;
		}
	}

	/** CoinSlot.DrawItemCoin: the coin's frame, centred in its slot, raised by its hop. */
	function draw(coin: Coin) {
		const canvas = canvases[coin];
		const img = images[coin];
		if (!canvas || !img?.naturalWidth) return;
		const dpr = devicePixelRatio || 1;
		const { width, height } = canvas.getBoundingClientRect();
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.imageSmoothingEnabled = false;
		const { frame, jump } = anims[coin]?.state ?? { frame: 0, jump: 0 };
		const fw = img.naturalWidth;
		const fh = img.naturalHeight / 8;
		const x = Math.round(width / 2 - (fw * SCALE) / 2);
		// The canvas is the slot plus the room above it; the coin sits in the slot's middle.
		const y = Math.round((height * 3) / 4 - (fh * SCALE) / 2 - jump * JUMP_HEIGHT * SCALE);
		ctx.drawImage(img, 0, frame * fh, fw, fh, x, y, fw * SCALE, fh * SCALE);
	}
</script>

<div class="coins" aria-label="Coins">
	<span class="label">Coins</span>
	{#each COINS as coin (coin)}
		<span class="slot coin-slot" data-coin={coin}>
			<canvas class="coin" bind:this={canvases[coin]}></canvas>
			<span class="count" style:transform="scale({textScale[coin]})">{split[coin]}</span>
		</span>
	{/each}
	<button
		class="mute"
		class:muted={audio.muted}
		aria-label={audio.muted ? 'Unmute' : 'Mute'}
		aria-pressed={audio.muted}
		title={audio.muted ? 'Unmute' : 'Mute'}
		onclick={toggleMute}><Icon name="sound" /></button
	>
</div>

<style>
	.coins {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.label {
		font-size: 16px;
		margin-right: 2px;
	}

	.coin-slot {
		width: 36px;
		height: 36px;
		border-radius: 4px;
	}

	/* The coin can hop out of the top of its slot. */
	.coin {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 100%;
		height: 200%;
		pointer-events: none;
	}

	/* The stack count in the slot's corner, like the game's item stacks. */
	.count {
		position: absolute;
		left: 4px;
		bottom: 0;
		font-size: 13px;
		transform-origin: left bottom;
	}

	.mute {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
	}

	.mute.muted {
		opacity: 0.4;
	}

	.mute:hover {
		transform: scale(1.1);
	}
</style>
