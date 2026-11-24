<script lang="ts">
	import { resolve } from '$app/paths';
	import { getGame } from '$lib/games';
	import { imageUrl } from '$lib/images';
	import { TIERS, prize } from '$lib/gauntlet';
	import { coins } from '$lib/money';
	import { completion, scores } from '$lib/progress.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Button from '$lib/ui/Button.svelte';
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
					image={imageUrl(game.icon)}
					selected={completion[slug]}
					href={resolve('/[mode=mode]', { mode: slug })}
				>
					{game.title}
					<span class="pay" class:dim={!completion[slug]}>
						<CoinText text={coins(completion[slug] ? (scores[slug] ?? 0) : prize(slug))} />
					</span>
				</Button>
			{/each}
		</div>
	</Panel>
{/each}

<style>
	:global(.tier) {
		max-width: 640px;
		margin: 40px auto 0;
	}

	.games {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 12px;
	}

	.pay {
		display: block;
		font-size: 15px;
	}
</style>
