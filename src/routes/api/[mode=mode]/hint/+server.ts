import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { answerFor, gameOr404, requireToday } from '$lib/server/answers';
import type { RequestHandler } from './$types';

export const prerender = false;

/** GET /api/boss/hint?n=1&day=20412 */
export const GET: RequestHandler = ({ params, url, setHeaders }) => {
	const game = gameOr404(params.mode);
	const day = requireToday(url.searchParams.get('day'));
	const n = Number(url.searchParams.get('n'));
	if (![1, 2, 3].includes(n)) error(400, 'Hint must be 1, 2 or 3');

	// Dev rerolls change the answer for the same URL, so never cache while developing.
	setHeaders({ 'cache-control': dev ? 'no-store' : 'public, max-age=0, s-maxage=86400' });
	return json({ hint: game.hints[n - 1].reveal(answerFor(game, day)) });
};
