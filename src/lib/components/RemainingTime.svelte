<script lang="ts">
	import { secondsUntilReset } from '$lib/engine/daily';

	let time = $state(secondsUntilReset());

	$effect(() => {
		if (time <= 0) return;

		const id = setInterval(() => {
			if (time <= 1) {
				time = 0;
				clearInterval(id);
			} else {
				time -= 1;
			}
		}, 1000);

		return () => {
			clearInterval(id);
		};
	});

	let remainingTime = $derived.by(() => {
		if (time <= 0) return 'Refresh Now!';

		const hours = Math.floor(time / 3600);
		const minutes = Math.floor((time % 3600) / 60);
		const seconds = time % 60;

		const pad = (n: number) => n.toString().padStart(2, '0');

		return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
	});
</script>

<p>Next game starts in: {remainingTime}</p>

<style>
	p {
		margin-top: 0;
	}
</style>
