<script lang="ts">
	import { resolve } from '$app/paths';
	import { games } from '$lib/games';
	import { imageUrl } from '$lib/images';
	import { completion } from '$lib/progress.svelte';
</script>

<section class="panel inventory">
	<h1 class="title">Inventory</h1>
	<p class="dim">A new puzzle in every slot, every day. Press 1–6 to jump to a game.</p>

	<ul>
		{#each games as game, i (game.slug)}
			<li>
				<a href={resolve('/[mode=mode]', { mode: game.slug })} class="item">
					<span class="slot" class:framed={completion[game.slug]}>
						<span class="num">{i + 1}</span>
						<img src={imageUrl(game.icon)} alt="" />
					</span>
					<span class="tooltip-box">
						<span class="name">{game.title}</span>
						<span class="desc">{game.description}</span>
						<span class="status" class:solved={completion[game.slug]}>
							{completion[game.slug] ? 'Solved today' : 'Not solved yet'}
						</span>
					</span>
				</a>
			</li>
		{/each}
	</ul>
</section>

<style>
	.inventory {
		max-width: 640px;
		margin: 12px auto;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 16px 0 4px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
		gap: 14px;
	}

	.item {
		display: flex;
		gap: 12px;
		align-items: center;
		text-decoration: none;
	}

	.item .slot {
		flex-shrink: 0;
		transition: transform 0.1s;
	}

	.item:hover .slot {
		transform: scale(1.08);
	}

	.item .tooltip-box {
		display: flex;
		flex-direction: column;
		flex: 1;
		gap: 2px;
	}

	.name {
		font-size: 18px;
	}

	.item:hover .name {
		color: var(--hover);
	}

	.desc {
		font-size: 14px;
		color: var(--text-dim);
	}

	.status {
		font-size: 13px;
		color: #ff9d9d;
	}

	.status.solved {
		color: #9dff7a;
	}
</style>
