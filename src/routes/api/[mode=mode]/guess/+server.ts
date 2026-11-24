import { DEV_TOOLS } from '$lib/devtools';
import { json } from '@sveltejs/kit';
import { compareEntries, isCorrect } from '$lib/engine/compare';
import { answerFor, entryOr400, gameOr404, requireToday } from '$lib/server/answers';
import { serverText } from '$lib/server/text';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * GET /api/boss/guess?id=12&day=20412
 * The result only depends on (id, day), so the CDN can cache it and most guesses never
 * reach a function.
 */
/**
 * A guess's own text. Word-by-word clues (Fishdle) blank the answer's name as "???"; in the
 * guessed entry's own text it's no secret, so it's put back.
 */
function detailFor(byWord: boolean | undefined, guess: { id: number; name: string }, slug: string) {
	const text = serverText(slug, guess.id);
	return byWord ? text?.replaceAll('???', guess.name) : text;
}

export const GET: RequestHandler = ({ params, url, setHeaders }) => {
	const game = gameOr404(params.mode);
	const day = requireToday(url.searchParams.get('day'));
	const guess = entryOr400(game, url.searchParams.get('id'));
	const answer = answerFor(game, day);

	// Dev rerolls change the answer for the same URL, so never cache while dev tools are on.
	setHeaders({ 'cache-control': DEV_TOOLS ? 'no-store' : 'public, max-age=0, s-maxage=86400' });
	return json({
		correct: isCorrect(guess, answer),
		checks: compareEntries(game.attributes, guess, answer),
		detail: game.detailLabel ? detailFor(game.clueByWord, guess, game.slug) : undefined
	});
};
