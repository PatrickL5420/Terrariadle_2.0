<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<footer>
	<a class="text-btn" href={resolve('/about')}>How to play</a>
	<a
		class="text-btn"
		href="https://github.com/patrickl5420/terrariadle_2.0"
		target="_blank"
		rel="noopener noreferrer">GitHub</a
	>
	<p class="version dim">{__APP_VERSION__}</p>
</footer>

<style>
	footer {
		padding: 24px 16px 32px;
	}

	.text-btn {
		text-decoration: none;
	}

	.version {
		margin: 6px 0 0;
		font-size: 13px;
	}
</style>
