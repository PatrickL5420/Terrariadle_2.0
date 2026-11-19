<script lang="ts">
	import { resolve } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { games } from '$lib/games';
	import { completion } from '$lib/progress.svelte';
</script>

<div class="landing-page" in:fly={{ y: 50, duration: 500 }}>
	<p>
		Welcome to Terrariadle! <br />
		Test your Terraria knowledge through daily guessing games.
	</p>
	<br />

	<ul>
		{#each games as game (game.slug)}
			<li>
				{#if completion[game.slug]}
					<img src="/emojis/red_x.png" alt="Game complete!" />
				{/if}
				<a href={resolve('/[mode=mode]', { mode: game.slug })}>{game.title}</a>
			</li>
		{/each}
	</ul>
</div>

<style>
	p {
		font-size: 15px;
		color: lightgray;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	li {
		margin-right: 1rem;
		margin-bottom: 1rem;
	}

	a {
		text-decoration: none;
		color: grey;
		font-size: 23px;
		display: inline-block;
		transition:
			transform 0.3s ease,
			color 0.3s ease;
	}

	a:hover {
		transform: scale(1.1) rotate(-3deg); /* grows and tilts left */
		color: yellow;
	}

	img {
		position: absolute;
		pointer-events: none;
	}

	@media (max-width: 700px) {
		.landing-page {
			margin-top: -60px;
		}

		p {
			font-size: 17px;
		}
	}
</style>
