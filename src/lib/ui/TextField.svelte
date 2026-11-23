<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Icon, { type UiIconName } from './Icon.svelte';

	/** A labelled text box with an icon tile, like "Name:" / "Seed:" in world creation. */
	let {
		value = $bindable(''),
		icon,
		label,
		...rest
	}: { value?: string; icon?: UiIconName; label?: string } & HTMLInputAttributes = $props();
</script>

<label class="ui-field">
	{#if icon}<span class="ui-field-icon"><Icon name={icon} /></span>{/if}
	<span class="ui-field-box">
		{#if label}<span class="ui-field-label">{label}:</span>{/if}
		<input type="text" bind:value {...rest} />
	</span>
</label>
