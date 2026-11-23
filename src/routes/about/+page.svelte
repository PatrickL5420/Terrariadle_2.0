<script lang="ts">
	import { fly } from 'svelte/transition';
</script>

<div class="panel how-to-play" in:fly={{ y: 12, duration: 250 }}>
	<h1 class="title">How to Play</h1>

	<ul>
		<li><span class="swatch green"></span> Exact match</li>
		<li><span class="swatch yellow"></span> Partial match</li>
		<li><span class="swatch red"></span> No match</li>
		<li>▲ / ▼ The answer is higher / lower</li>
	</ul>

	<p>Hints unlock after 4, 7 and 12 guesses. Resets at midnight Sydney time.</p>

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
		(CC BY-NC-SA 3.0). Unofficial; not affiliated with Re-Logic.
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
