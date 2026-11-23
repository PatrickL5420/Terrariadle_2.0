<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import { resolve } from '$app/paths';
</script>

<footer>
	<nav>
		<Button size="sm" icon="help" href={resolve('/about')}>How to play</Button>
		<Button size="sm" href="https://github.com/patrickl5420/terrariadle_2.0" external>GitHub</Button
		>
	</nav>
	<p class="version dim">{__APP_VERSION__}</p>
</footer>

<style>
	footer {
		padding: 24px 16px 32px;
	}

	nav {
		display: flex;
		justify-content: center;
		gap: 12px;
	}

	.version {
		margin: 10px 0 0;
		font-size: 13px;
	}
</style>
