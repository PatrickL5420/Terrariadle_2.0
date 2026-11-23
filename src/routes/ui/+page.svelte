<script lang="ts">
	import Panel from '$lib/ui/Panel.svelte';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import Icon, { UI_ICONS, type UiIconName } from '$lib/ui/Icon.svelte';

	let size = $state('Medium');
	let tab = $state<UiIconName>('hp');
	let text = $state('');
	const icons = Object.keys(UI_ICONS) as UiIconName[];
</script>

<div class="gallery">
	<Panel heading="Panel" tone="normal">
		<p>tone="normal"</p>
		<Panel tone="inset"><p>tone="inset"</p></Panel>
	</Panel>

	<Panel tone="outer">
		<p>tone="outer"</p>
		<TextField icon="name" label="Name" placeholder="TextField" bind:value={text} />
		<hr class="ui-divider" />
		<div class="row">
			{#each ['Small', 'Medium', 'Large'] as s (s)}
				<Button variant="option" icon="random" selected={size === s} onclick={() => (size = s)}
					>{s}</Button
				>
			{/each}
		</div>
		<hr class="ui-divider" />
		<div class="row">
			<Button variant="option" size="sm" icon="unknown">option sm</Button>
			<Button variant="option" size="lg" icon="star" color="#ffd84d">option lg</Button>
			<Button variant="option" disabled>disabled</Button>
		</div>
		<hr class="ui-divider" />
		<div class="row">
			{#each ['hp', 'defense', 'attack', 'rarity', 'time', 'research'] as const as name (name)}
				<IconButton label={name} icon={name} selected={tab === name} onclick={() => (tab = name)} />
			{/each}
			<IconButton label="disabled" icon="help" disabled />
		</div>
	</Panel>

	<div class="row">
		<Button size="lg">Back</Button>
		<Button size="lg">Create</Button>
	</div>
	<div class="row">
		<Button icon="copy">fat md</Button>
		<Button size="sm" icon="help">fat sm</Button>
		<Button size="sm" selected>selected</Button>
		<Button size="sm" disabled>disabled</Button>
	</div>

	<Panel tone="inset">
		<div class="icons">
			{#each icons as name (name)}
				<span class="icon"><Icon {name} />{name}</span>
			{/each}
		</div>
	</Panel>
</div>

<style>
	.gallery {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 680px;
		margin: 12px auto;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
	}

	.row > :global(.ui-btn.option) {
		flex: 1;
	}

	p {
		margin: 0 0 8px;
	}

	.icons {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 10px;
	}

	.icon {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-size: 14px;
	}
</style>
