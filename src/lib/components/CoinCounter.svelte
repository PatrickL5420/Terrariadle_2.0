<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';
	import { COINS, splitCoins } from '$lib/money';
	import { dayTotal } from '$lib/progress.svelte';
	import { purse } from '$lib/purse.svelte';
	import { audio, toggleMute } from '$lib/sound.svelte';

	/**
	 * Today's coins, like the inventory's coin slots: one small slot per coin with its stack
	 * count. Coins still on the ground ($lib/purse) aren't counted until they're collected.
	 */
	const split = $derived(splitCoins(dayTotal() - purse.pending));
</script>

<div class="coins" aria-label="Coins">
	<span class="label">Coins</span>
	{#each COINS as coin (coin)}
		<span class="slot coin-slot" data-coin={coin}>
			<Icon name={coin} />
			{#key split[coin]}<span class="count">{split[coin]}</span>{/key}
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

	/* The stack count in the slot's corner, like the game's item stacks. */
	.count {
		position: absolute;
		left: 4px;
		bottom: 0;
		font-size: 13px;
		animation: bump 0.25s ease-out;
	}

	@keyframes bump {
		from {
			transform: scale(1.6);
			color: var(--hover);
		}
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
