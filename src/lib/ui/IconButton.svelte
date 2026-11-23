<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type UiIconName } from './Icon.svelte';

	/**
	 * Square icon button, like the category tabs in character creation.
	 * `label` is the accessible name and hover title.
	 */
	let {
		label,
		icon,
		image,
		selected = false,
		disabled = false,
		href,
		onclick,
		children,
		class: className = ''
	}: {
		label: string;
		icon?: UiIconName;
		image?: string;
		selected?: boolean;
		disabled?: boolean;
		href?: string;
		onclick?: (e: MouseEvent) => void;
		/** Extra content drawn over the icon (a count, a check mark). */
		children?: Snippet;
		class?: string;
	} = $props();
</script>

{#snippet content()}
	{#if icon}<Icon name={icon} />{:else if image}<img src={image} alt="" />{/if}
	{@render children?.()}
{/snippet}

{#if href && !disabled}
	<a
		class="ui-icon-btn {className}"
		class:selected
		{href}
		title={label}
		aria-label={label}
		{onclick}>{@render content()}</a
	>
{:else}
	<button
		class="ui-icon-btn {className}"
		class:selected
		{disabled}
		title={label}
		aria-label={label}
		aria-pressed={selected}
		{onclick}>{@render content()}</button
	>
{/if}
