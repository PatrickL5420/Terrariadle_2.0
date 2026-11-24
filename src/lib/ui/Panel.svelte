<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Icon, { type UiIconName } from './Icon.svelte';

	/**
	 * Terraria menu panel.
	 *  - normal: the bestiary / character list panel (opaque blue, light edge)
	 *  - outer:  the dark translucent box around world / character creation
	 *  - inset:  a darker box inside a panel (bestiary text boxes, list cells)
	 * `heading` adds the title tab that sits on the top edge ("Select Player").
	 */
	let {
		tone = 'normal',
		heading,
		headingIcon,
		children,
		class: className = '',
		...rest
	}: {
		tone?: 'normal' | 'outer' | 'inset';
		heading?: string;
		/** An icon before the heading (e.g. a difficulty mode). */
		headingIcon?: UiIconName;
		children: Snippet;
		class?: string;
	} & HTMLAttributes<HTMLElement> = $props();
</script>

<section class="ui-panel {tone} {className}" class:has-heading={heading} {...rest}>
	{#if heading}<h1 class="ui-heading">
			{#if headingIcon}<Icon name={headingIcon} />{/if}{heading}
		</h1>{/if}
	{@render children()}
</section>
