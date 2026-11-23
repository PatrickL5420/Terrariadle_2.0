<script lang="ts">
	import { resolve } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { games } from '$lib/games';
</script>

<div class="panel how-to-play" in:fly={{ y: 12, duration: 250 }}>
	<h1 class="title">How to Play</h1>

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
		<li>▲ / ▼ in a slot's corner: the answer's value is higher / lower than your guess</li>
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
		color: var(--text);
	}

	.link:hover {
		color: var(--hover);
	}

	.how-to-play {
		max-width: 620px;
		margin: 12px auto;
		font-size: 18px;
		text-align: left;
	}

	.how-to-play * {
		text-align: left;
	}

	.how-to-play h2 {
		margin: 18px 0 0;
		font-size: 22px;
	}

	.how-to-play .game-desc {
		margin: 2px 0 4px;
		font-size: 16px;
		color: var(--text-dim);
	}

	.how-to-play ul {
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 16px;
	}

	.swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 3px;
		box-shadow: 0 0 0 1px var(--slot-outer);
		vertical-align: middle;
	}

	.green {
		background: var(--match);
	}

	.yellow {
		background: var(--partial);
	}

	.red {
		background: var(--miss);
	}
</style>
