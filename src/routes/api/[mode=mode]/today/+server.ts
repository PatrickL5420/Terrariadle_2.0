import { json } from '@sveltejs/kit';
import { secondsUntilReset } from '$lib/engine/daily';
import { answerFor, gameOr404 } from '$lib/server/answers';
import { solveCount } from '$lib/server/counter';
import { currentDay } from '$lib/server/dev';
import { firstWords, serverText } from '$lib/server/text';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Today's puzzle number, time left, how many solved it, and yesterday's answer. */
/** The whole clue, or just its first word for games that reveal it word by word. */
function clueFor(slug: string, id: number): string | undefined {
	const text = serverText(slug, id);
	return text && gameOr404(slug).clueByWord ? firstWords(text, 1).text : text;
}

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const game = gameOr404(params.mode);
	const day = currentDay();
	setHeaders({ 'cache-control': 'no-store' });

	return json({
		day,
		secondsLeft: secondsUntilReset(),
		solved: await solveCount(game.slug, day),
		yesterday: answerFor(game, day - 1).id,
		clue: game.clueLabel ? clueFor(game.slug, answerFor(game, day).id) : undefined
	});
};
