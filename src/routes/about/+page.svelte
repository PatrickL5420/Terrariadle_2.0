<script lang="ts">
	import { resolve } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { games } from '$lib/games';
</script>

<div class="how-to-play" in:fly={{ x: 80, duration: 500 }}>
	<h1>How to Play</h1>
	<hr />

	<p>
		Every day there's a new {games
			.map((g) => g.noun)
			.join(', ')
			.replace(/, ([^,]*)$/, ' and $1')}
		to guess. Pick anything from the search box and every property of your guess is compared to the answer:
	</p>

	<ul>
		<li><span class="swatch green"></span> Exact match</li>
		<li>
			<span class="swatch yellow"></span> Partial match: the lists overlap, or the same stat has a different
			amount
		</li>
		<li><span class="swatch red"></span> No match</li>
		<li>▲ / ▼ The answer's value is higher / lower than your guess</li>
	</ul>

	<p>
		Hints unlock after 4, 7 and 12 guesses. There's no guess limit, and puzzles reset at midnight
		(Sydney time).
	</p>

	{#each games as game (game.slug)}
		<h2><a class="link" href={resolve('/[mode=mode]', { mode: game.slug })}>{game.title}</a></h2>
		<p class="game-desc">{game.description}</p>
		<ul>
			{#each game.attributes as attr (attr.key)}
				<li><b>{attr.label}</b>: {attr.title}</li>
			{/each}
		</ul>
	{/each}

	<h2>Credits</h2>
	<p>
		Built on
		<a
			class="link"
			href="https://github.com/BradyDriebergen/Terrariadle_2.0"
			target="_blank"
			rel="noopener noreferrer">Terrariadle</a
		>
		by Brady Driebergen (MIT license). Game data and images from the
		<a class="link" href="https://terraria.wiki.gg/" target="_blank" rel="noopener noreferrer"
			>Official Terraria Wiki</a
		>
		(CC BY-NC-SA 3.0). Terraria is a game by Re-Logic; this is an unofficial fan project.
	</p>
</div>

<style>
	.link {
		color: rgb(111, 255, 255);
	}

	.link:hover {
		color: yellow;
	}

	.how-to-play {
		text-align: left;
		margin: 20px auto;
		max-width: 600px;
		padding: 1px 15px;
		font-size: 20px;

		border: 2px solid #000;
		border-radius: 15px;
		background-color: var(--color-button);
	}

	.how-to-play * {
		text-align: left;
	}

	.how-to-play h1 {
		margin-bottom: -5px;
	}

	.how-to-play h2 {
		padding-top: 10px;
		margin-bottom: 0;
	}

	.how-to-play .game-desc {
		margin: 2px 0 4px;
		font-size: 17px;
		color: lightgray;
	}

	.how-to-play ul {
		list-style-type: none;
		margin: 0;
		padding: 0;
		font-size: 17px;
	}

	.swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 1px solid black;
		border-radius: 3px;
		vertical-align: middle;
	}

	.green {
		background: var(--color-green);
	}
	.yellow {
		background: var(--color-yellow);
	}
	.red {
		background: var(--color-red);
	}

	@media (max-width: 700px) {
		.how-to-play {
			margin: 0 16px;
		}
	}
</style>
