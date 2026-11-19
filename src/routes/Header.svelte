<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Spring } from 'svelte/motion';
	import { crossfade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { games } from '$lib/games';
	import { imageUrl } from '$lib/images';
	import { completion } from '$lib/progress.svelte';
	import logo from '$lib/assets/TerrariadleLogo.webp';

	let isHome = $derived(page.url.pathname === '/' || page.url.pathname === '/about');
	// svelte-ignore state_referenced_locally
	let headerHeight = new Spring(isHome ? 140 : 100);

	const [send, receive] = crossfade({
		duration: 400,
		easing: cubicOut
	});

	$effect(() => {
		headerHeight.target = isHome ? 140 : 100;
	});
</script>

<header style={`height: ${headerHeight.current}px;`}>
	{#if isHome}
		<a
			href={resolve('/')}
			class="logo-slot centered"
			in:receive={{ key: 'block' }}
			out:send={{ key: 'block' }}
			title="Terrariadle Home Page"
		>
			<img class="game-logo" src={logo} alt="Terrariadle" />
			<h2 class="new-msg color-cycle">NEW GAMES!</h2>
		</a>
	{:else}
		<a
			href={resolve('/')}
			class="logo-slot corner"
			in:receive={{ key: 'block' }}
			out:send={{ key: 'block' }}
			title="Terrariadle Home Page"
		>
			<img class="game-logo" src={logo} alt="Terrariadle" />
		</a>
		<div class="links" in:scale out:scale>
			{#each games as game (game.slug)}
				<a
					class:Selected={page.url.pathname === `/${game.slug}`}
					href={resolve('/[mode=mode]', { mode: game.slug })}
					title={game.title}
				>
					<img
						class:incomplete={!completion[game.slug]}
						src={imageUrl(game.icon)}
						alt={game.title}
					/>
				</a>
			{/each}
		</div>
	{/if}
</header>

<style>
	header {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
	}

	/* Remove once site has been up a few months */
	.new-msg {
		position: absolute;
		left: 50%;
		top: 100px;
		transform: rotate(-4deg);
		font-size: 22px;
	}

	.logo-slot {
		position: absolute;
		grid-row: 1;
		grid-column: 1;
		display: block;
	}

	.centered {
		justify-self: center;
		max-width: 400px;
	}

	.corner {
		justify-self: start;
		width: 200px;
	}

	.game-logo {
		margin: auto;
		max-width: 80%;
		display: block;
		transition: transform 0.2s ease;
	}

	.game-logo:hover {
		transform: scale(1.025);
	}

	.links {
		grid-column: 2;
		grid-row: 1;
		justify-self: center;
		display: flex;
		gap: 12px;
	}

	.links a {
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: var(--color-backgroundblue);
		border-radius: 8px;
		border: 2px solid black;
		padding: 6px;
		transition: background 0.08s;
	}

	.links a:hover {
		background: var(--color-lightblue);
	}

	.links a.Selected,
	.links a.Selected:hover {
		background: rgba(139, 31, 31, 0.862);
	}

	.links img {
		width: 40px;
		height: 40px;
		object-fit: contain;
	}

	.incomplete {
		filter: grayscale(100%);
	}

	@media (max-width: 700px) {
		header {
			margin-bottom: 70px;
		}

		.new-msg {
			font-size: 20px;
		}

		.centered {
			margin-top: 20px;
		}

		.corner {
			justify-self: center;
		}

		.links {
			margin-top: 100px;
		}
	}
</style>
