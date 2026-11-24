<script lang="ts">
	import { resolve } from '$app/paths';
	import { getGame } from '$lib/games';
	import { TIERS, prize } from '$lib/gauntlet';
	import { coins } from '$lib/money';
	import { completion, scores } from '$lib/progress.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Button from '$lib/ui/Button.svelte';
	import GameIcon from '$lib/ui/GameIcon.svelte';
	import CoinText from '$lib/ui/CoinText.svelte';
	import type { UiIconName } from '$lib/ui/Icon.svelte';
</script>

<!-- The gauntlet, easiest tier first. Each game shows what it paid today, or its prize. -->
{#each TIERS as tier (tier.name)}
	<Panel
		tone="outer"
		heading={tier.name}
		headingIcon={tier.name.toLowerCase() as UiIconName}
		class="tier"
	>
		<div class="games">
			{#each tier.games as slug (slug)}
				{@const game = getGame(slug)!}
				<Button
					variant="option"
					size="lg"
					selected={completion[slug]}
					href={resolve('/[mode=mode]', { mode: slug })}
				>
					<span class="game">
						<GameIcon src={game.icon} />
						<span class="name">{game.title}</span>
						<span class="pay" class:dim={!completion[slug]}>
							<CoinText
								text={coins(completion[slug] ? (scores[slug] ?? 0) : prize(slug))}
								scale={1.5}
							/>
						</span>
					</span>
				</Button>
			{/each}
		</div>
	</Panel>
{/each}

<style>
	/* Beats the panel's own heading margin (.ui-panel.has-heading in app.css). */
	:global(.ui-panel.tier.has-heading) {
		max-width: 640px;
		margin: 72px auto 0;
	}

	:global(.ui-panel.tier:last-child) {
		margin-bottom: 24px;
	}

	.games {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 12px;
	}

	/* Name on the left, its coins on the right. */
	.game {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 8px;
		padding-left: 6px;
		text-align: left;
	}

	.name {
		flex: 1;
	}

	.pay {
		font-size: 20px;
		white-space: nowrap;
	}
</style>
