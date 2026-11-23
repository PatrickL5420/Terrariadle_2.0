import { DEV_TOOLS } from '$lib/devtools';
import { error, json } from '@sveltejs/kit';
import { answerFor, gameOr404, requireToday } from '$lib/server/answers';
import { firstWords, serverText } from '$lib/server/text';
import type { RequestHandler } from './$types';

export const prerender = false;

/** GET /api/fish/clue?words=3&day=20412 -> the first 3 words of today's clue. */
export const GET: RequestHandler = ({ params, url, setHeaders }) => {
	const game = gameOr404(params.mode);
	const day = requireToday(url.searchParams.get('day'));
	const words = Number(url.searchParams.get('words'));
	if (!game.clueByWord) error(404, 'This game shows its whole clue');
	if (!Number.isInteger(words) || words < 1) error(400, 'Invalid word count');

	// Dev rerolls change the answer for the same URL, so never cache while dev tools are on.
	setHeaders({ 'cache-control': DEV_TOOLS ? 'no-store' : 'public, max-age=0, s-maxage=86400' });
	return json(firstWords(serverText(game.slug, answerFor(game, day).id) ?? '', words));
};
