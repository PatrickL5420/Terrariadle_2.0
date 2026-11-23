<script lang="ts" module>
	/** Terraria UI images from the wiki (Category:UI images), saved in static/ui/. */
	export const UI_ICONS = {
		search: 'Search icon',
		cancel: 'SearchCancel',
		hp: 'Bestiary HP',
		defense: 'Bestiary Defense',
		attack: 'Bestiary Attack',
		rarity: 'Bestiary Rarity',
		slain: 'Bestiary Slain',
		bestiary: 'Bestiary icon',
		unknown: 'Bestiary Unknown',
		star: 'Bestiary Rank Light',
		random: 'Randomize',
		info: 'CharInfo',
		copy: 'Copy',
		name: 'Name icon',
		research: 'Power Menu Research',
		time: 'Power Menu Time',
		help: 'Help icon',
		settings: 'Settings Menu Controls',
		next: 'IconNext',
		prev: 'IconPrev',
		reset: 'IconReset',
		favorite: 'Favorite Item',
		day: 'Bestiary Daytime',
		night: 'Bestiary Nighttime',
		copper: 'Copper Coin',
		silver: 'Silver Coin',
		gold: 'Gold Coin',
		platinum: 'Platinum Coin'
	} as const;

	export type UiIconName = keyof typeof UI_ICONS;

	export const uiIconUrl = (name: UiIconName) => encodeURI(`/ui/${UI_ICONS[name]}.png`);
</script>

<script lang="ts">
	/** A UI icon at a whole-number scale, so the pixel art stays crisp. */
	let { name, scale = 1, alt = '' }: { name: UiIconName; scale?: number; alt?: string } = $props();
</script>

<img class="ui-icon" src={uiIconUrl(name)} {alt} style:zoom={scale === 1 ? undefined : scale} />

<style>
	.ui-icon {
		display: block;
		flex-shrink: 0;
	}
</style>
