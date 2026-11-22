import { json } from '@sveltejs/kit';
import { secondsUntilReset } from '$lib/engine/daily';
import { answerFor, gameOr404 } from '$lib/server/answers';
import { solveCount } from '$lib/server/counter';
import { currentDay } from '$lib/server/dev';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Today's puzzle number, time left, how many solved it, and yesterday's answer. */
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const game = gameOr404(params.mode);
	const day = currentDay();
	setHeaders({ 'cache-control': 'no-store' });

	return json({
		day,
		secondsLeft: secondsUntilReset(),
		solved: await solveCount(game.slug, day),
		yesterday: answerFor(game, day - 1).id
	});
};
