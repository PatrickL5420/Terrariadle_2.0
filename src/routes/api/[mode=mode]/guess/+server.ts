import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import { compareEntries } from '$lib/engine/compare';
import { answerFor, entryOr400, gameOr404, requireToday } from '$lib/server/answers';
import { serverText } from '$lib/server/text';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * GET /api/boss/guess?id=12&day=20412
 * The result only depends on (id, day), so the CDN can cache it and most guesses never
 * reach a function.
 */
export const GET: RequestHandler = ({ params, url, setHeaders }) => {
	const game = gameOr404(params.mode);
	const day = requireToday(url.searchParams.get('day'));
	const guess = entryOr400(game, url.searchParams.get('id'));
	const answer = answerFor(game, day);

	// Dev rerolls change the answer for the same URL, so never cache while developing.
	setHeaders({ 'cache-control': dev ? 'no-store' : 'public, max-age=0, s-maxage=86400' });
	return json({
		correct: guess.id === answer.id,
		checks: compareEntries(game.attributes, guess, answer),
		detail: game.detailLabel ? serverText(game.slug, guess.id) : undefined
	});
};
