import { DEV_TOOLS } from '$lib/devtools';
import { error, json } from '@sveltejs/kit';
import { compareToAny } from '$lib/engine/compare';
import { entryOr400, gameOr404, puzzleFor, requireToday } from '$lib/server/answers';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * GET /api/version/bonus?id=104040000&day=20412
 * The bonus question ("When was it changed?"): any of today's bonus answers is right. A wrong
 * guess gets an arrow if they're all newer or all older, yellow if some are each way.
 */
export const GET: RequestHandler = ({ params, url, setHeaders }) => {
	const game = gameOr404(params.mode);
	const day = requireToday(url.searchParams.get('day'));
	const guess = entryOr400(game, url.searchParams.get('id'));
	const answers = puzzleFor(game, day)?.bonus ?? [];
	if (!game.bonusLabel || !answers.length) error(404, 'No bonus question today');

	setHeaders({ 'cache-control': DEV_TOOLS ? 'no-store' : 'public, max-age=0, s-maxage=86400' });
	const result = compareToAny(guess.id, answers);
	return json({
		correct: result === 'match',
		checks: Object.fromEntries(game.attributes.map((a) => [a.key, result]))
	});
};
