<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type UiIconName } from './Icon.svelte';

	/**
	 * Terraria menu button.
	 *  - fat:    the wide Back / Create buttons (translucent, black edge, yellow edge on hover)
	 *  - option: a world-creation choice (icon + label; `selected` shows the lighter bar)
	 * Renders a link when `href` is set.
	 */
	let {
		variant = 'fat',
		size = 'md',
		icon,
		image,
		color,
		selected = false,
		disabled = false,
		href,
		external = false,
		title,
		onclick,
		children,
		class: className = ''
	}: {
		variant?: 'fat' | 'option';
		size?: 'sm' | 'md' | 'lg';
		/** A UI icon from static/ui. */
		icon?: UiIconName;
		/** Any other image (an item sprite). */
		image?: string;
		/** Label colour, like the coloured world-size / difficulty labels. */
		color?: string;
		selected?: boolean;
		disabled?: boolean;
		href?: string;
		external?: boolean;
		title?: string;
		onclick?: (e: MouseEvent) => void;
		children?: Snippet;
		class?: string;
	} = $props();

	const cls = $derived(`ui-btn ${variant} ${size} ${className}`);
</script>

{#snippet content()}
	{#if icon}<Icon name={icon} />{:else if image}<img class="ui-btn-image" src={image} alt="" />{/if}
	{#if children}<span class="ui-btn-label" style:color>{@render children()}</span>{/if}
{/snippet}

{#if href && !disabled}
	<a
		class={cls}
		class:selected
		{href}
		{title}
		{onclick}
		target={external ? '_blank' : undefined}
		rel={external ? 'noopener noreferrer' : undefined}>{@render content()}</a
	>
{:else}
	<button
		class={cls}
		class:selected
		{disabled}
		{title}
		{onclick}
		aria-pressed={variant === 'option' ? selected : undefined}>{@render content()}</button
	>
{/if}
